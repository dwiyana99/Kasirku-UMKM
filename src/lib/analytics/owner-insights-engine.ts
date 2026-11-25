/**
 * KasirAkun UMKM — Practical 0-Token Owner Insights & Operational Automation Engine
 * All monetary, margin, variance, and stock math strictly uses Decimal.js.
 * Covers:
 * 1. Top Selling, Highest Profit & Slow-Moving/Dead Stock Summary
 * 2. 1-Click Daily Cashier Closing + WhatsApp Owner Recap
 * 3. Vertical & Plan-Aware Due Date Reminders (Kasbon, PO Tempo, Sewa Kost)
 * 4. Bulk Repricing Strategy Preview (Markup % from HPP or Fixed Rp Delta)
 */

import Decimal from 'decimal.js';
import type {
  Category,
  OperationalExpense,
  Order,
  Product,
  TenantWorkspaceData,
} from '../../types/domain';
import { tenantHasAddOn } from '../saas/hybrid-pricing';
import { resolveReportAnchorDate } from '../accounting/tier1-period-report';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface ProductPerformanceItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  qtySold: string;
  revenue: string;
  grossProfit: string;
  stockQty: string;
  stockValue: string;
}

export interface ProductPerformanceSummary {
  topSelling: ProductPerformanceItem[];
  topProfitable: ProductPerformanceItem[];
  slowMoving: ProductPerformanceItem[];
}

export function computeProductPerformanceSummary(
  products: Product[],
  orders: Order[]
): ProductPerformanceSummary {
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID');
  const statsMap = new Map<
    string,
    { qty: Decimal; revenue: Decimal; cost: Decimal; name: string }
  >();

  for (const order of paidOrders) {
    for (const item of order.items) {
      const qty = new Decimal(item.qty || '0');
      const unitPrice = new Decimal(item.unitPrice || '0');
      const rev = unitPrice.times(qty);
      const prod = products.find((p) => p.id === item.productId);
      const unitCost =
        item.unitCogs !== undefined && item.unitCogs !== ''
          ? new Decimal(item.unitCogs)
          : new Decimal(prod?.costPriceAvg || '0');
      const cost = unitCost.times(qty);

      const prev = statsMap.get(item.productId) ?? {
        qty: new Decimal(0),
        revenue: new Decimal(0),
        cost: new Decimal(0),
        name: item.itemNameSnapshot,
      };
      prev.qty = prev.qty.plus(qty);
      prev.revenue = prev.revenue.plus(rev);
      prev.cost = prev.cost.plus(cost);
      statsMap.set(item.productId, prev);
    }
  }

  const allMetrics: ProductPerformanceItem[] = products
    .filter((p) => p.isAvailable && p.itemType !== 'RAW_MATERIAL')
    .map((p) => {
      const stat = statsMap.get(p.id);
      const qtySold = stat?.qty ?? new Decimal(0);
      const revenue = stat?.revenue ?? new Decimal(0);
      const grossProfit = stat ? stat.revenue.minus(stat.cost) : new Decimal(0);
      const stockQty = new Decimal(p.stockQty || '0');
      const stockValue = stockQty.times(new Decimal(p.costPriceAvg || '0'));

      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        qtySold: qtySold.toFixed(4),
        revenue: revenue.toFixed(4),
        grossProfit: grossProfit.toFixed(4),
        stockQty: stockQty.toFixed(4),
        stockValue: stockValue.toFixed(4),
      };
    });

  const topSelling = allMetrics
    .filter((m) => new Decimal(m.qtySold).gt(0))
    .sort((a, b) => new Decimal(b.qtySold).comparedTo(new Decimal(a.qtySold)))
    .slice(0, 3);

  const topProfitable = allMetrics
    .filter((m) => new Decimal(m.grossProfit).gt(0))
    .sort((a, b) => new Decimal(b.grossProfit).comparedTo(new Decimal(a.grossProfit)))
    .slice(0, 3);

  const slowMoving = allMetrics
    .filter((m) => new Decimal(m.stockQty).gt(0) && new Decimal(m.qtySold).eq(0))
    .sort((a, b) => new Decimal(b.stockValue).comparedTo(new Decimal(a.stockValue)))
    .slice(0, 4);

  return { topSelling, topProfitable, slowMoving };
}

export interface DailyClosingSummary {
  dateLabel: string;
  orderCount: number;
  totalSales: string;
  cashSales: string;
  nonCashSales: string;
  cashExpenses: string;
  expectedCashInDrawer: string;
  openingCash: string;
  actualCashCounted: string;
  cashVariance: string;
  varianceStatus: 'MATCH' | 'SURPLUS' | 'SHORTAGE';
  whatsappMessage: string;
}

function formatRpSimple(val: Decimal): string {
  const rounded = val.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const absStr = rounded.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return rounded.isNegative() ? `-Rp${absStr}` : `Rp${absStr}`;
}

export function computeDailyClosingSummary(params: {
  tenantName: string;
  orders: Order[];
  expenses: OperationalExpense[];
  openingCash?: string | number;
  actualCashCounted: string | number;
  referenceDate?: Date;
}): DailyClosingSummary {
  const { tenantName, orders, expenses, referenceDate } = params;
  const anchor = resolveReportAnchorDate(orders, expenses, referenceDate);
  const startMs = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  const endMs = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
    23,
    59,
    59,
    999
  ).getTime();

  let orderCount = 0;
  let totalSales = new Decimal(0);
  let cashSales = new Decimal(0);
  let nonCashSales = new Decimal(0);

  for (const o of orders) {
    if (o.paymentStatus !== 'PAID') continue;
    const ts = new Date(o.createdAt).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
    orderCount += 1;
    const grand = new Decimal(o.grandTotal || '0');
    totalSales = totalSales.plus(grand);
    const method = o.payment?.paymentMethod ?? 'CASH';
    if (method === 'CASH') {
      cashSales = cashSales.plus(grand);
    } else {
      nonCashSales = nonCashSales.plus(grand);
    }
  }

  let cashExpenses = new Decimal(0);
  for (const e of expenses) {
    const ts = new Date(e.expenseDate).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;
    cashExpenses = cashExpenses.plus(new Decimal(e.amount || '0'));
  }

  const openingCash = new Decimal(
    String(params.openingCash || '0').replace(/[^\d.-]/g, '') || '0'
  );
  const actualCash = new Decimal(
    String(params.actualCashCounted || '0').replace(/[^\d.-]/g, '') || '0'
  );
  const expectedCash = openingCash.plus(cashSales).minus(cashExpenses);
  const variance = actualCash.minus(expectedCash);

  const varianceStatus: 'MATCH' | 'SURPLUS' | 'SHORTAGE' = variance.eq(0)
    ? 'MATCH'
    : variance.gt(0)
    ? 'SURPLUS'
    : 'SHORTAGE';

  const dateLabel = anchor.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const statusText =
    varianceStatus === 'MATCH'
      ? 'PAS (Cocok 100%)'
      : varianceStatus === 'SURPLUS'
      ? `LEBIH ${formatRpSimple(variance)}`
      : `KURANG ${formatRpSimple(variance.abs())}`;

  const whatsappMessage = [
    `*REKAP TUTUP KASIR HARIAN*`,
    `${tenantName}`,
    `Tanggal: ${dateLabel}`,
    `--------------------------------`,
    `Jumlah Transaksi: ${orderCount} struk`,
    `Total Penjualan: ${formatRpSimple(totalSales)}`,
    `- Tunai: ${formatRpSimple(cashSales)}`,
    `- Non-Tunai: ${formatRpSimple(nonCashSales)}`,
    `Pengeluaran Hari Ini: ${formatRpSimple(cashExpenses)}`,
    `--------------------------------`,
    `Modal Awal Laci: ${formatRpSimple(openingCash)}`,
    `Kas Seharusnya di Laci: ${formatRpSimple(expectedCash)}`,
    `Uang Fisik Dihitung: ${formatRpSimple(actualCash)}`,
    `Selisih Laci: ${statusText}`,
  ].join('\n');

  return {
    dateLabel,
    orderCount,
    totalSales: totalSales.toFixed(4),
    cashSales: cashSales.toFixed(4),
    nonCashSales: nonCashSales.toFixed(4),
    cashExpenses: cashExpenses.toFixed(4),
    expectedCashInDrawer: expectedCash.toFixed(4),
    openingCash: openingCash.toFixed(4),
    actualCashCounted: actualCash.toFixed(4),
    cashVariance: variance.toFixed(4),
    varianceStatus,
    whatsappMessage,
  };
}

export interface DueReminderItem {
  id: string;
  kind: 'KASBON' | 'PO_SUPPLIER' | 'KOST_BILL';
  title: string;
  detail: string;
  amount: string;
  route: string;
  ctaLabel: string;
  tone: 'amber' | 'rose' | 'stone';
}

/**
 * Generates vertical- and plan-aware due reminders without cluttering irrelevant plans.
 */
export function computeDueReminders(workspace: TenantWorkspaceData): DueReminderItem[] {
  const reminders: DueReminderItem[] = [];
  const { tenant } = workspace;
  const hasPo = tenantHasAddOn(tenant, 'ADDON_PURCHASE_ORDER');
  const hasCrm = tenantHasAddOn(tenant, 'ADDON_PROMO_CRM');

  // 1. Customer Kasbon / Piutang (ONLY if CRM add-on/plan active)
  if (hasCrm) {
    const debtors = (workspace.crmCustomers ?? []).filter((c) =>
      new Decimal(c.receivableBalance || '0').gt(0)
    );
    if (debtors.length > 0) {
      const totalKasbon = debtors.reduce(
        (acc, c) => acc.plus(new Decimal(c.receivableBalance || '0')),
        new Decimal(0)
      );
      reminders.push({
        id: 'rem-kasbon',
        kind: 'KASBON',
        title: `${debtors.length} pelanggan punya tagihan kasbon`,
        detail: `Total piutang belum dibayar ${formatRpSimple(totalKasbon)}. Kirim pengingat WA dari Manajemen CRM.`,
        amount: totalKasbon.toFixed(4),
        route: '/crm',
        ctaLabel: 'Buka CRM',
        tone: 'amber',
      });
    }
  }

  // 2. Unpaid Supplier PO (ONLY if tenant has ADDON_PURCHASE_ORDER)
  if (hasPo) {
    const unpaidPos = (workspace.purchaseOrders ?? []).filter(
      (po) =>
        po.status !== 'CANCELLED' &&
        po.paymentType === 'TEMPO_HUTANG'
    );
    let totalRemainingDebt = new Decimal(0);
    for (const po of unpaidPos) {
      const total = new Decimal(po.totalEstimatedCost || '0');
      const paid = new Decimal(po.amountPaid ?? po.paidAmount ?? '0');
      const rem = Decimal.max(0, total.minus(paid));
      totalRemainingDebt = totalRemainingDebt.plus(rem);
    }

    if (totalRemainingDebt.gt(0)) {
      reminders.push({
        id: 'rem-po-tempo',
        kind: 'PO_SUPPLIER',
        title: 'Ada hutang tempo ke supplier',
        detail: `Sisa tagihan kulakan tempo tercatat ${formatRpSimple(totalRemainingDebt)}. Cek tanggal jatuh tempo di daftar PO.`,
        amount: totalRemainingDebt.toFixed(4),
        route: '/procurement',
        ctaLabel: 'Cek PO',
        tone: 'rose',
      });
    }
  }

  // 3. Kost Rent Bills & Upcoming Due Dates (ONLY for KOST_KONTRAKAN vertical)
  if (tenant.vertical === 'KOST_KONTRAKAN') {
    const unpaidInvoices = (workspace.boardingInvoices ?? []).filter(
      (inv) => inv.paymentStatus === 'UNPAID' || inv.paymentStatus === 'OVERDUE'
    );
    if (unpaidInvoices.length > 0) {
      const totalRent = unpaidInvoices.reduce(
        (acc, inv) => acc.plus(new Decimal(inv.totalAmount || '0')),
        new Decimal(0)
      );
      const overdueCount = unpaidInvoices.filter((inv) => inv.paymentStatus === 'OVERDUE').length;
      reminders.push({
        id: 'rem-kost-bills',
        kind: 'KOST_BILL',
        title:
          overdueCount > 0
            ? `${unpaidInvoices.length} tagihan sewa kamar belum lunas (${overdueCount} terlambat)`
            : `${unpaidInvoices.length} tagihan sewa kamar menunggu pembayaran`,
        detail: `Total tagihan berjalan ${formatRpSimple(totalRent)}. Kirim pengingat WhatsApp langsung dari menu Kamar & Tagihan Kost.`,
        amount: totalRent.toFixed(4),
        route: '/kost',
        ctaLabel: 'Lihat Tagihan',
        tone: overdueCount > 0 ? 'rose' : 'amber',
      });
    }

    // Also alert if any active Kost tenant has nextDueDate <= 7 days ahead (even before invoice generated)
    const todayStart = new Date();
    const todayUtc = Date.UTC(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      todayStart.getDate()
    );
    const dueSoonTenants = (workspace.boardingTenants ?? []).filter((t) => {
      if (!t.isActive || !t.nextDueDate) return false;
      const m = t.nextDueDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return false;
      const dueUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const diffDays = Math.round((dueUtc - todayUtc) / 86_400_000);
      return diffDays >= 0 && diffDays <= 7;
    });
    if (dueSoonTenants.length > 0) {
      reminders.push({
        id: 'rem-kost-upcoming',
        kind: 'KOST_BILL',
        title: `${dueSoonTenants.length} penghuni kost jatuh tempo dalam 7 hari`,
        detail: `Segera siapkan tagihan atau kirim pengingat WhatsApp ke penghuni sebelum tanggal jatuh tempo.`,
        amount: '0.0000',
        route: '/kost',
        ctaLabel: 'Cek Jatuh Tempo',
        tone: 'amber',
      });
    }
  }

  // 4. Sewa Garasi Due Slots (ONLY for SEWA_GARASI vertical)
  if (tenant.vertical === 'SEWA_GARASI') {
    const dueSlots = (workspace.verticalOps?.garageSlots ?? []).filter(
      (s) => s.status === 'TERISI' && s.paymentStatus !== 'LUNAS'
    );
    if (dueSlots.length > 0) {
      const totalGarage = dueSlots.reduce(
        (acc, s) => acc.plus(new Decimal(s.monthlyRate || '0')),
        new Decimal(0)
      );
      reminders.push({
        id: 'rem-garasi-due',
        kind: 'KOST_BILL',
        title: `${dueSlots.length} slot garasi jatuh tempo bulan ini`,
        detail: `Total sewa belum lunas ${formatRpSimple(totalGarage)}. Kirim pengingat WhatsApp dari menu Slot Garasi.`,
        amount: totalGarage.toFixed(4),
        route: '/operations',
        ctaLabel: 'Buka Slot Garasi',
        tone: 'amber',
      });
    }
  }

  // 5. Bimbel / Kursus / Gym Unpaid SPP Bills (ONLY for BIMBEL_KURSUS_GYM vertical)
  if (tenant.vertical === 'BIMBEL_KURSUS_GYM') {
    const unpaidSpp = (workspace.verticalOps?.academyInvoices ?? []).filter(
      (b) => b.status !== 'PAID'
    );
    if (unpaidSpp.length > 0) {
      const totalSpp = unpaidSpp.reduce(
        (acc, b) => acc.plus(new Decimal(b.amount || '0')),
        new Decimal(0)
      );
      reminders.push({
        id: 'rem-bimbel-spp',
        kind: 'KOST_BILL',
        title: `${unpaidSpp.length} tagihan SPP / iuran member belum lunas`,
        detail: `Total iuran tertunda ${formatRpSimple(totalSpp)}. Kirim pengingat ke orang tua/member dari menu SPP & Kelas.`,
        amount: totalSpp.toFixed(4),
        route: '/operations',
        ctaLabel: 'Lihat Tagihan SPP',
        tone: 'amber',
      });
    }
  }

  return reminders;
}

export type BulkRepriceMode = 'MARKUP_FROM_HPP' | 'ADD_FIXED_RP' | 'PCT_CURRENT_PRICE';

export interface BulkRepriceStrategy {
  categoryIdFilter: string; // 'ALL' or categoryId
  mode: BulkRepriceMode;
  value: string | number;
  roundingStep: 0 | 100 | 500 | 1000;
}

export interface BulkRepricePreviewRow {
  productId: string;
  name: string;
  categoryName: string;
  costPrice: string;
  currentPrice: string;
  newPrice: string;
  deltaAmount: string;
  marginPctAfter: string;
}

function roundUp(val: Decimal, step: 0 | 100 | 500 | 1000): Decimal {
  if (!step || step <= 0) return val.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return val.div(step).ceil().times(step);
}

export function computeBulkRepricingPreview(
  products: Product[],
  categories: Category[],
  strategy: BulkRepriceStrategy
): BulkRepricePreviewRow[] {
  const cleanVal = String(strategy.value || '0').replace(/[^\d.-]/g, '') || '0';
  const paramVal = new Decimal(cleanVal);
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return products
    .filter(
      (p) =>
        p.isAvailable &&
        p.itemType !== 'RAW_MATERIAL' &&
        (strategy.categoryIdFilter === 'ALL' || p.categoryId === strategy.categoryIdFilter)
    )
    .map((p) => {
      const hpp = new Decimal(p.costPriceAvg || '0');
      const curr = new Decimal(p.sellingPrice || '0');
      let rawNew = curr;

      if (strategy.mode === 'MARKUP_FROM_HPP') {
        const base = hpp.gt(0) ? hpp : curr;
        rawNew = base.times(new Decimal(1).plus(paramVal.div(100)));
      } else if (strategy.mode === 'ADD_FIXED_RP') {
        rawNew = Decimal.max(0, curr.plus(paramVal));
      } else {
        rawNew = Decimal.max(0, curr.times(new Decimal(1).plus(paramVal.div(100))));
      }

      const newPrice = roundUp(rawNew, strategy.roundingStep);
      const delta = newPrice.minus(curr);
      const marginAfter = newPrice.gt(0)
        ? newPrice.minus(hpp).div(newPrice).times(100)
        : new Decimal(0);

      return {
        productId: p.id,
        name: p.name,
        categoryName: (p.categoryId && catMap.get(p.categoryId)) || 'Umum',
        costPrice: hpp.toFixed(4),
        currentPrice: curr.toFixed(4),
        newPrice: newPrice.toFixed(4),
        deltaAmount: delta.toFixed(4),
        marginPctAfter: marginAfter.toFixed(1),
      };
    });
}
