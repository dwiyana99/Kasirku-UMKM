/**
 * Pure, Decimal-safe analytics computations for:
 * 1. Dashboard D3 Daily Revenue Trend Chart (`buildDailyRevenueSeries`)
 * 2. Accounting Recharts Monthly Net Profit/Loss Trend (`buildMonthlyProfitLossSeries`)
 * 3. Tax Page Real-Time Monthly Tax Simulation Summary (`computeMonthlyTaxSimulation`)
 */

import Decimal from 'decimal.js';
import { calculateOrderTax, calculatePPhCompliance } from '../tax/indonesia-tax-engine.ts';
import type {
  Account,
  BusinessVertical,
  JournalEntry,
  Order,
  TaxEntityType,
} from '../../types/domain.ts';

export interface DailyRevenuePoint {
  day: number;
  dateIso: string;
  label: string;
  revenue: number;
  revenueDecimal: string;
  orderCount: number;
}

export interface DailyRevenueSeriesResult {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  totalRevenue: string;
  averageDailyRevenue: string;
  peakDay: DailyRevenuePoint | null;
  totalOrders: number;
  activeDaysCount: number;
  points: DailyRevenuePoint[];
}

const MONTH_NAMES_ID = [
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

function formatMonthLabel(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-');
  const mIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  return `${MONTH_NAMES_ID[mIdx] || mStr} ${yStr}`;
}

function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/**
 * Builds a complete day-by-day revenue series for the target month (YYYY-MM).
 * If `referenceYearMonth` is omitted, picks the latest month that has paid orders
 * (or the current calendar month if no orders exist).
 */
export function buildDailyRevenueSeries(
  orders: Order[],
  referenceYearMonth?: string
): DailyRevenueSeriesResult {
  const paidOrders = orders.filter(
    (o) => o.paymentStatus === 'PAID' && o.createdAt && o.createdAt.length >= 10
  );

  let targetYearMonth = referenceYearMonth;
  if (!targetYearMonth) {
    if (paidOrders.length > 0) {
      const sortedMonths = paidOrders
        .map((o) => o.createdAt.slice(0, 7))
        .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
      targetYearMonth = sortedMonths[0];
    } else {
      targetYearMonth = new Date().toISOString().slice(0, 7);
    }
  }

  const [yNum, mNum] = targetYearMonth.split('-').map((n) => Number(n));
  const year = Number.isFinite(yNum) ? yNum : new Date().getFullYear();
  const month = Number.isFinite(mNum) && mNum >= 1 && mNum <= 12 ? mNum : new Date().getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);

  const dayMap = new Map<number, { revenue: Decimal; orderCount: number }>();
  for (let d = 1; d <= daysInMonth; d++) {
    dayMap.set(d, { revenue: new Decimal(0), orderCount: 0 });
  }

  let totalRevenue = new Decimal(0);
  let totalOrders = 0;

  for (const order of paidOrders) {
    if (!order.createdAt.startsWith(targetYearMonth)) continue;
    const dayNum = Number(order.createdAt.slice(8, 10));
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > daysInMonth) continue;
    const bucket = dayMap.get(dayNum)!;
    const amt = new Decimal(order.grandTotal || '0');
    bucket.revenue = bucket.revenue.plus(amt);
    bucket.orderCount += 1;
    totalRevenue = totalRevenue.plus(amt);
    totalOrders += 1;
  }

  const points: DailyRevenuePoint[] = [];
  let peakDay: DailyRevenuePoint | null = null;
  let activeDaysCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const bucket = dayMap.get(d)!;
    const dayPadded = String(d).padStart(2, '0');
    const dateIso = `${targetYearMonth}-${dayPadded}`;
    const revNum = Number(bucket.revenue.toFixed(0));
    const pt: DailyRevenuePoint = {
      day: d,
      dateIso,
      label: `${dayPadded} ${MONTH_NAMES_ID[month - 1]}`,
      revenue: revNum,
      revenueDecimal: bucket.revenue.toFixed(4),
      orderCount: bucket.orderCount,
    };
    points.push(pt);
    if (bucket.orderCount > 0) {
      activeDaysCount += 1;
    }
    if (!peakDay || bucket.revenue.gt(new Decimal(peakDay.revenueDecimal))) {
      peakDay = pt;
    }
  }

  const avgDenominator = activeDaysCount > 0 ? activeDaysCount : daysInMonth;
  const averageDailyRevenue = totalRevenue.div(avgDenominator);

  return {
    monthKey: targetYearMonth,
    monthLabel: formatMonthLabel(targetYearMonth),
    totalRevenue: totalRevenue.toFixed(4),
    averageDailyRevenue: averageDailyRevenue.toFixed(4),
    peakDay: peakDay && new Decimal(peakDay.revenueDecimal).gt(0) ? peakDay : null,
    totalOrders,
    activeDaysCount,
    points,
  };
}

export interface MonthlyProfitLossPoint {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  revenueDecimal: string;
  expensesDecimal: string;
  netProfitDecimal: string;
  journalCount: number;
}

/**
 * Aggregates immutable double-entry journal lines into monthly Revenue (4xxx),
 * COGS & Operational Expenses (5xxx + 6xxx), and Net Profit/Loss using Decimal.js.
 */
export function buildMonthlyProfitLossSeries(
  journalEntries: JournalEntry[],
  accounts: Account[]
): MonthlyProfitLossPoint[] {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const monthBuckets = new Map<
    string,
    { revenue: Decimal; expenses: Decimal; journalCount: number }
  >();

  for (const entry of journalEntries) {
    const dateStr = (entry.entryDate || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(dateStr)) continue;

    let bucket = monthBuckets.get(dateStr);
    if (!bucket) {
      bucket = { revenue: new Decimal(0), expenses: new Decimal(0), journalCount: 0 };
      monthBuckets.set(dateStr, bucket);
    }
    bucket.journalCount += 1;

    for (const line of entry.lines) {
      const acc = accountById.get(line.accountId);
      const code = acc?.code || '';
      const debit = new Decimal(line.debit || '0');
      const credit = new Decimal(line.credit || '0');

      if (acc?.category === 'REVENUE' || code.startsWith('4')) {
        // Revenue increases on credit, decreases on debit
        bucket.revenue = bucket.revenue.plus(credit).minus(debit);
      } else if (acc?.category === 'EXPENSE' || code.startsWith('5') || code.startsWith('6')) {
        // COGS (5xxx) and OpEx (6xxx) increase on debit, decrease on credit
        bucket.expenses = bucket.expenses.plus(debit).minus(credit);
      }
    }
  }

  const sortedKeys = Array.from(monthBuckets.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return sortedKeys.map((monthKey) => {
    const bucket = monthBuckets.get(monthKey)!;
    const netProfit = bucket.revenue.minus(bucket.expenses);
    return {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      revenue: Number(bucket.revenue.toFixed(0)),
      expenses: Number(bucket.expenses.toFixed(0)),
      netProfit: Number(netProfit.toFixed(0)),
      revenueDecimal: bucket.revenue.toFixed(4),
      expensesDecimal: bucket.expenses.toFixed(4),
      netProfitDecimal: netProfit.toFixed(4),
      journalCount: bucket.journalCount,
    };
  });
}

export interface MonthlyTaxSimulationInput {
  vertical: BusinessVertical;
  taxEntity: TaxEntityType;
  isPkp: boolean;
  priorCumulativeTurnover: string;
  actualMonthlyGrossSales: string;
  actualMonthlyNetProfit: string;
  projectedMonthlySalesOverride?: string;
}

export interface MonthlyTaxSimulationResult {
  basisSales: string;
  isUsingProjection: boolean;
  isFnbRegionalPb1: boolean;
  estimatedDppNilaiLain: string;
  estimatedMonthlyPpn: string;
  estimatedMonthlyPb1: string;
  estimatedMonthlyPph: string;
  totalEstimatedMonthlyTax: string;
  effectiveTaxRatePct: string;
  pphRegimeTitle: string;
  pphRegulationRef: string;
  isExemptUnder500M: boolean;
  remaining500MQuota: string;
}

/**
 * Calculates real-time estimated monthly VAT (PPN 12% × DPP Nilai Lain 11/12 = 11% efektif),
 * Regional PB1 (10% for F&B verticals), and Income Tax (PPh PP 20/2026 / NPPN / 4(2))
 * directly from live sales data (with optional what-if monthly projection override).
 */
export function computeMonthlyTaxSimulation(
  input: MonthlyTaxSimulationInput
): MonthlyTaxSimulationResult {
  const actualSalesDec = new Decimal(input.actualMonthlyGrossSales || '0');
  const hasOverride =
    input.projectedMonthlySalesOverride !== undefined &&
    input.projectedMonthlySalesOverride.trim() !== '' &&
    /^\d+(\.\d+)?$/.test(input.projectedMonthlySalesOverride.trim());

  const basisSalesDec = hasOverride
    ? new Decimal(input.projectedMonthlySalesOverride!.trim())
    : actualSalesDec;

  const isFnbRegionalPb1 =
    input.vertical === 'KEDAI_MAKAN' || input.vertical === 'RESTORAN';

  const orderTax = calculateOrderTax({
    vertical: input.vertical,
    isPkp: input.isPkp,
    items: [
      {
        lineSubtotal: basisSalesDec.toFixed(4),
        isLuxuryGoods: false,
        isTaxExempt: false,
      },
    ],
    discountAmount: '0',
    serviceCharge: '0',
  });

  // Scale net profit proportionally when user inputs a custom what-if monthly sales projection
  let basisNetProfitDec = new Decimal(input.actualMonthlyNetProfit || '0');
  if (hasOverride && actualSalesDec.gt(0)) {
    const ratio = basisSalesDec.div(actualSalesDec);
    basisNetProfitDec = basisNetProfitDec.times(ratio);
  } else if (hasOverride && actualSalesDec.lte(0)) {
    basisNetProfitDec = basisSalesDec.times(new Decimal('0.35'));
  }

  const pph = calculatePPhCompliance({
    vertical: input.vertical,
    taxEntity: input.taxEntity,
    priorCumulativeTurnover: input.priorCumulativeTurnover || '0',
    currentMonthTurnover: basisSalesDec.toFixed(4),
    currentMonthNetProfit: basisNetProfitDec.toFixed(4),
  });

  const ppnDec =
    orderTax.taxType !== 'PB1_RESTO_10' && orderTax.taxType !== 'NONE'
      ? new Decimal(orderTax.taxAmount || '0')
      : new Decimal(0);
  const pb1Dec =
    orderTax.taxType === 'PB1_RESTO_10'
      ? new Decimal(orderTax.taxAmount || '0')
      : new Decimal(0);
  const pphDec = new Decimal(pph.estimatedTaxPayable || '0');
  const totalTaxDec = ppnDec.plus(pb1Dec).plus(pphDec);

  const effectiveRate = basisSalesDec.gt(0)
    ? totalTaxDec.div(basisSalesDec).times(100)
    : new Decimal(0);

  const isExemptUnder500M =
    input.taxEntity === 'WP_OP' &&
    input.vertical !== 'FREELANCE' &&
    input.vertical !== 'KOST_KONTRAKAN' &&
    new Decimal(pph.exemptRemainingRp500M || '0').gt(0) &&
    pphDec.eq(0);

  return {
    basisSales: basisSalesDec.toFixed(4),
    isUsingProjection: hasOverride,
    isFnbRegionalPb1,
    estimatedDppNilaiLain: orderTax.dppNilaiLain,
    estimatedMonthlyPpn: ppnDec.toFixed(4),
    estimatedMonthlyPb1: pb1Dec.toFixed(4),
    estimatedMonthlyPph: pphDec.toFixed(4),
    totalEstimatedMonthlyTax: totalTaxDec.toFixed(4),
    effectiveTaxRatePct: effectiveRate.toFixed(2),
    pphRegimeTitle: pph.regimeTitle,
    pphRegulationRef: pph.regulationRef,
    isExemptUnder500M,
    remaining500MQuota: pph.exemptRemainingRp500M || '0.0000',
  };
}
