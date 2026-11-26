/**
 * KasirAkun UMKM — Monthly Tax Projection & Cash Flow Forecast Engine (DJP 2026 & PBJT Daerah)
 * Zero AI tokens. Uses Decimal.js for exact Rupiah calculations.
 *
 * Computes:
 * - Applicability flags per UMKM vertical, tax entity (WP_OP / PT_PERORANGAN / CV_FIRMA / PT_BIASA), PKP status, and regional PBJT settings.
 * - Monthly & 6-month projected tax payable across:
 *   1. PPh Final UMKM 0.5% (PP 20/2026: respects Rp500.000.000 cumulative exempt threshold for WP_OP; excludes FREELANCE/CV_FIRMA/PT_BIASA).
 *   2. PPN Keluaran 11% Efektif (PMK 131/2024: 12% x 11/12 DPP Nilai Lain — ONLY when isPkp === true and not purely PBJT).
 *   3. PBJT / PB1 Daerah (Restoran, Kedai, Homestay/Villa, SPA, Parkir/Garasi — ONLY when regionalTax.applyRegionalTax !== false).
 * - Cash reserve recommendation ("Sisihkan Dana Pajak per Bulan") so business owners avoid cashflow shocks on tax due dates.
 */

import Decimal from 'decimal.js';
import type {
  RegionalTaxRule,
  Tenant,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import {
  PPH_FINAL_RATE,
  UMKM_ANNUAL_CAP,
  WP_OP_EXEMPT_THRESHOLD,
} from './indonesia-tax-engine.ts';
import {
  DEFAULT_INDONESIA_REGIONAL_TAXES,
  resolveEffectiveRegionalTax,
} from './regional-tax-indonesia.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface MonthlyTaxProjectionPoint {
  monthIndex: number; // 0..5
  monthLabel: string; // e.g. "Nov 26"
  projectedTurnover: number;
  pphFinalPayable: number;
  ppnPayable: number;
  pbjtPayable: number;
  totalTaxPayable: number;
  cumulativeTurnoverAfter: number;
  remainingExemptQuota: number;
}

export interface TaxProjectionDashboardData {
  isSupportedForEntity: boolean;
  unsupportedReason?: string;
  baselineMonthlyTurnover: string; // NUMERIC(19,4)
  startingCumulativeTurnover: string; // NUMERIC(19,4)
  remainingWpOpExemptQuota: string; // NUMERIC(19,4)
  isEligiblePphFinal05: boolean;
  appliesPpn11: boolean;
  appliesRegionalPbjt: boolean;
  regionalPbjtLabel: string;
  regionalPbjtRatePct: number;
  currentMonthTotalTax: string; // NUMERIC(19,4)
  sixMonthTotalTax: string; // NUMERIC(19,4)
  sixMonthPphFinal: string; // NUMERIC(19,4)
  sixMonthPpn: string; // NUMERIC(19,4)
  sixMonthPbjt: string; // NUMERIC(19,4)
  recommendedDailyReserve: string; // NUMERIC(19,4)
  effectiveTaxBurdenPct: number;
  exceedsUmkm48BCap: boolean;
  points: MonthlyTaxProjectionPoint[];
}

const INDONESIAN_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function computeMonthlyBaselineTurnover(workspace: TenantWorkspaceData): string {
  const paidOrders = workspace.orders.filter((o) => o.paymentStatus === 'PAID');
  const orderSum = paidOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.subtotal || '0').minus(new Decimal(o.discountAmount || '0'))),
    new Decimal(0)
  );

  // Include boarding rent & homestay bookings if present
  const boardingSum = (workspace.boardingInvoices ?? [])
    .filter((i) => i.paymentStatus === 'PAID')
    .reduce((sum, i) => sum.plus(new Decimal(i.totalAmount || '0')), new Decimal(0));

  const homestaySum = (workspace.verticalOps?.homestayBookings ?? [])
    .reduce((sum, b) => sum.plus(new Decimal(b.grossRoomRevenue || '0')), new Decimal(0));

  const totalCurrent = orderSum.plus(boardingSum).plus(homestaySum);

  // If current month has very few transactions (fresh workspace), fall back to 1/10 of prior cumulative turnover if available
  if (totalCurrent.gt(0)) {
    return totalCurrent.toFixed(4);
  }
  const prior = new Decimal(workspace.tenant.cumulativeTurnoverPriorMonths || '0');
  if (prior.gt(0)) {
    return prior.div(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(4);
  }
  return '0.0000';
}

export function buildTaxProjectionDashboard(params: {
  tenant: Tenant;
  monthlyTurnoverEstimate: string;
  monthlyGrowthPct?: number; // e.g., 0, 5, 10
  monthsAhead?: number; // default 6
  startMonthDate?: Date;
  regionalTaxRegistry?: RegionalTaxRule[];
}): TaxProjectionDashboardData {
  const { tenant } = params;
  const monthsAhead = Math.max(1, Math.min(12, params.monthsAhead ?? 6));
  const growthRate = new Decimal(params.monthlyGrowthPct ?? 0).div(100);
  const baseline = Decimal.max(new Decimal(0), new Decimal(params.monthlyTurnoverEstimate || '0'));
  const priorYtd = Decimal.max(
    new Decimal(0),
    new Decimal(tenant.cumulativeTurnoverPriorMonths || '0')
  );

  // Determine tax rules applicable to this tenant vertical + entity
  const isFreelance = tenant.vertical === 'FREELANCE';
  const isKost = tenant.vertical === 'KOST_KONTRAKAN';
  const isEligiblePphFinal05 =
    !isFreelance &&
    !isKost &&
    (tenant.taxEntity === 'WP_OP' || tenant.taxEntity === 'PT_PERORANGAN');

  const regionalRes = resolveEffectiveRegionalTax(
    tenant.vertical,
    tenant.settings.regionalTax,
    params.regionalTaxRegistry ?? DEFAULT_INDONESIA_REGIONAL_TAXES
  );

  const appliesRegionalPbjt = regionalRes.applies && new Decimal(regionalRes.rateDecimal).gt(0);
  const regionalRateDec = appliesRegionalPbjt ? new Decimal(regionalRes.rateDecimal) : new Decimal(0);

  // PPN applies only if tenant is PKP and vertical is not exclusively PBJT food/hotel/spa
  const pbjtExcludesPpn =
    appliesRegionalPbjt &&
    (tenant.vertical === 'RESTORAN' ||
      tenant.vertical === 'KEDAI_MAKAN' ||
      tenant.vertical === 'HOMESTAY_VILLA' ||
      tenant.vertical === 'SPA_WELLNESS');

  const appliesPpn11 = tenant.isPkp && !pbjtExcludesPpn && !isKost;

  // If neither PPh Final 0.5%, nor PPN, nor Regional PBJT applies (e.g. non-PKP CV/Freelance/Kost),
  // explain clearly instead of showing misleading Rp0 projections.
  const isSupportedForEntity = isEligiblePphFinal05 || appliesPpn11 || appliesRegionalPbjt;
  let unsupportedReason: string | undefined;
  if (!isSupportedForEntity) {
    if (isFreelance) {
      unsupportedReason =
        'Pekerjaan Bebas / Freelance (Pasal 56 PP 20/2026) dikecualikan dari PPh Final 0,5% dan menggunakan PPh Pasal 17 (NPPN). Estimasi PPh Final/PPN bulanan tidak berlaku untuk profil Non-PKP ini.';
    } else if (isKost) {
      unsupportedReason =
        'Usaha Kost/Kontrakan dikenakan PPh Final Sewa Bangunan Pasal 4(2) 10% per tagihan sewa (tercatat di modul Kamar & Tagihan Kost), bukan PPh Final UMKM 0,5%.';
    } else {
      unsupportedReason =
        'Badan usaha CV/Firma/PT Biasa Non-PKP menggunakan tarif PPh Badan Pasal 17/31E berbasis laba fiskal tahunan, bukan PPh Final 0,5% dari omzet bulanan.';
    }
  }

  const startDate = params.startMonthDate ?? new Date();
  let runningCumulative = priorYtd;
  let sixMonthPph = new Decimal(0);
  let sixMonthPpn = new Decimal(0);
  let sixMonthPbjt = new Decimal(0);
  let sixMonthTurnover = new Decimal(0);
  const points: MonthlyTaxProjectionPoint[] = [];

  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const monthLabel = `${INDONESIAN_MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;

    const monthTurnover = baseline
      .times(new Decimal(1).plus(growthRate).pow(i))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    // 1. PPh Final 0.5% (PP 20/2026)
    let pphFinal = new Decimal(0);
    if (isEligiblePphFinal05 && monthTurnover.gt(0)) {
      if (tenant.taxEntity === 'WP_OP') {
        const prevCum = runningCumulative;
        const nextCum = prevCum.plus(monthTurnover);
        if (nextCum.gt(WP_OP_EXEMPT_THRESHOLD)) {
          const taxablePortion = prevCum.gte(WP_OP_EXEMPT_THRESHOLD)
            ? monthTurnover
            : nextCum.minus(WP_OP_EXEMPT_THRESHOLD);
          pphFinal = taxablePortion.times(PPH_FINAL_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
        }
      } else {
        // PT Perorangan: 0.5% from first rupiah
        pphFinal = monthTurnover.times(PPH_FINAL_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
      }
    }

    // 2. PPN 11% Efektif (PMK 131/2024: 12% x 11/12 = 11%)
    const ppn = appliesPpn11
      ? monthTurnover.times(new Decimal('0.11')).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      : new Decimal(0);

    // 3. PBJT Daerah
    const pbjt = appliesRegionalPbjt
      ? monthTurnover.times(regionalRateDec).toDecimalPlaces(0, Decimal.ROUND_FLOOR)
      : new Decimal(0);

    runningCumulative = runningCumulative.plus(monthTurnover);
    const remainingQuota =
      tenant.taxEntity === 'WP_OP' && isEligiblePphFinal05
        ? Decimal.max(new Decimal(0), WP_OP_EXEMPT_THRESHOLD.minus(runningCumulative))
        : new Decimal(0);

    const monthTotal = pphFinal.plus(ppn).plus(pbjt);

    sixMonthPph = sixMonthPph.plus(pphFinal);
    sixMonthPpn = sixMonthPpn.plus(ppn);
    sixMonthPbjt = sixMonthPbjt.plus(pbjt);
    sixMonthTurnover = sixMonthTurnover.plus(monthTurnover);

    points.push({
      monthIndex: i,
      monthLabel,
      projectedTurnover: monthTurnover.toNumber(),
      pphFinalPayable: pphFinal.toNumber(),
      ppnPayable: ppn.toNumber(),
      pbjtPayable: pbjt.toNumber(),
      totalTaxPayable: monthTotal.toNumber(),
      cumulativeTurnoverAfter: runningCumulative.toNumber(),
      remainingExemptQuota: remainingQuota.toNumber(),
    });
  }

  const currentMonthTotal = new Decimal(points[0]?.totalTaxPayable ?? 0);
  const sixMonthTotal = sixMonthPph.plus(sixMonthPpn).plus(sixMonthPbjt);
  const recommendedDailyReserve = currentMonthTotal
    .div(30)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL);

  const effectiveTaxBurdenPct = sixMonthTurnover.gt(0)
    ? sixMonthTotal.div(sixMonthTurnover).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  const remainingWpOpExemptQuota =
    tenant.taxEntity === 'WP_OP' && isEligiblePphFinal05
      ? Decimal.max(new Decimal(0), WP_OP_EXEMPT_THRESHOLD.minus(priorYtd))
      : new Decimal(0);

  return {
    isSupportedForEntity,
    unsupportedReason,
    baselineMonthlyTurnover: baseline.toFixed(4),
    startingCumulativeTurnover: priorYtd.toFixed(4),
    remainingWpOpExemptQuota: remainingWpOpExemptQuota.toFixed(4),
    isEligiblePphFinal05,
    appliesPpn11,
    appliesRegionalPbjt,
    regionalPbjtLabel: regionalRes.taxLabel,
    regionalPbjtRatePct: regionalRateDec.times(100).toNumber(),
    currentMonthTotalTax: currentMonthTotal.toFixed(4),
    sixMonthTotalTax: sixMonthTotal.toFixed(4),
    sixMonthPphFinal: sixMonthPph.toFixed(4),
    sixMonthPpn: sixMonthPpn.toFixed(4),
    sixMonthPbjt: sixMonthPbjt.toFixed(4),
    recommendedDailyReserve: recommendedDailyReserve.toFixed(4),
    effectiveTaxBurdenPct,
    exceedsUmkm48BCap: runningCumulative.gt(UMKM_ANNUAL_CAP),
    points,
  };
}
