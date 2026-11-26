/**
 * Tier-1 Simple Financial Report Period Engine (100% Zero AI Token, Decimal.js)
 * Supports Harian (DAILY), Minggu Ini (WEEKLY), Bulan Ini (MONTHLY),
 * Triwulan (QUARTERLY), and YTD (Year-to-Date) for all UMKM plans including Paket LITE.
 */

import Decimal from 'decimal.js';
import type { Account, OperationalExpense, Order, Product } from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type FinancialReportPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YTD';

export interface PeriodOptionMeta {
  code: FinancialReportPeriod;
  label: string;
  shortLabel: string;
}

export const FINANCIAL_PERIOD_OPTIONS: PeriodOptionMeta[] = [
  { code: 'DAILY', label: 'Harian', shortLabel: 'Harian' },
  { code: 'WEEKLY', label: 'Minggu Ini', shortLabel: 'Mingguan' },
  { code: 'MONTHLY', label: 'Bulan Ini', shortLabel: 'Bulanan' },
  { code: 'QUARTERLY', label: 'Triwulan', shortLabel: 'Triwulan' },
  { code: 'YTD', label: 'Tahun Berjalan (YTD)', shortLabel: 'YTD' },
];

export interface ExpenseBreakdownRow {
  category: string;
  totalAmount: string;
  count: number;
}

export interface Tier1PeriodReport {
  period: FinancialReportPeriod;
  periodLabel: string;
  rangeLabel: string;
  anchorDateIso: string;
  startDateIso: string;
  endDateIso: string;
  orderCount: number;
  expenseCount: number;
  grossSales: string;
  discountTotal: string;
  netSales: string;
  totalHpp: string;
  grossProfit: string;
  totalExpenses: string;
  netProfit: string;
  netMarginPct: string;
  cashSales: string;
  nonCashSales: string;
  expenseBreakdown: ExpenseBreakdownRow[];
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatDateId(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Resolves the anchor date for reporting: uses `referenceDate` if provided,
 * otherwise uses today's date (or latest transaction date if demo data is from an earlier date).
 */
export function resolveReportAnchorDate(
  orders: Order[],
  expenses: OperationalExpense[],
  referenceDate?: Date
): Date {
  if (referenceDate) return new Date(referenceDate.getTime());

  const timestamps: number[] = [];
  for (const o of orders) {
    if (o.paymentStatus !== 'VOID') {
      const ts = new Date(o.createdAt).getTime();
      if (!Number.isNaN(ts)) timestamps.push(ts);
    }
  }
  for (const e of expenses) {
    const ts = new Date(e.expenseDate).getTime();
    if (!Number.isNaN(ts)) timestamps.push(ts);
  }
  if (timestamps.length === 0) return new Date();
  const maxTs = Math.max(...timestamps);
  const now = new Date();
  const startToday = startOfDay(now).getTime();
  return maxTs >= startToday ? now : new Date(maxTs);
}

export function getPeriodDateBounds(
  period: FinancialReportPeriod,
  anchor: Date
): { start: Date; end: Date; periodLabel: string; rangeLabel: string } {
  const end = endOfDay(anchor);
  let start = startOfDay(anchor);
  let periodLabel = 'Laporan Harian';

  if (period === 'DAILY') {
    start = startOfDay(anchor);
    periodLabel = 'Laporan Harian';
  } else if (period === 'WEEKLY') {
    const tmp = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 6);
    start = startOfDay(tmp);
    periodLabel = 'Laporan Mingguan (7 Hari)';
  } else if (period === 'MONTHLY') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);
    periodLabel = 'Laporan Bulan Ini';
  } else if (period === 'QUARTERLY') {
    const qStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    start = new Date(anchor.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
    const quarterNumber = Math.floor(anchor.getMonth() / 3) + 1;
    periodLabel = `Laporan Triwulan Q${quarterNumber} ${anchor.getFullYear()}`;
  } else {
    start = new Date(anchor.getFullYear(), 0, 1, 0, 0, 0, 0);
    periodLabel = `Laporan Tahun Berjalan (YTD ${anchor.getFullYear()})`;
  }

  const rangeLabel =
    period === 'DAILY'
      ? formatDateId(anchor)
      : `${formatDateId(start)} s/d ${formatDateId(anchor)}`;

  return { start, end, periodLabel, rangeLabel };
}

/**
 * Computes exact Tier-1 simple financial report for the selected period using Decimal.js.
 */
export function computeTier1PeriodReport(params: {
  orders: Order[];
  expenses: OperationalExpense[];
  products: Product[];
  accounts?: Account[];
  period: FinancialReportPeriod;
  referenceDate?: Date;
}): Tier1PeriodReport {
  const { orders, expenses, products, accounts = [], period, referenceDate } = params;
  const anchor = resolveReportAnchorDate(orders, expenses, referenceDate);
  const { start, end, periodLabel, rangeLabel } = getPeriodDateBounds(period, anchor);

  const productCostMap = new Map<string, Decimal>();
  for (const p of products) {
    productCostMap.set(p.id, new Decimal(p.costPriceAvg || '0'));
  }

  const accountNameMap = new Map<string, string>();
  for (const acc of accounts) {
    accountNameMap.set(acc.id, acc.name);
    accountNameMap.set(acc.code, acc.name);
  }

  const startMs = start.getTime();
  const endMs = end.getTime();

  let orderCount = 0;
  let grossSales = new Decimal(0);
  let discountTotal = new Decimal(0);
  let netSales = new Decimal(0);
  let totalHpp = new Decimal(0);
  let cashSales = new Decimal(0);
  let nonCashSales = new Decimal(0);

  for (const order of orders) {
    if (order.paymentStatus !== 'PAID') continue;
    const ts = new Date(order.createdAt).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;

    orderCount += 1;
    const sub = new Decimal(order.subtotal || '0');
    const disc = new Decimal(order.discountAmount || '0');
    const grand = new Decimal(order.grandTotal || '0');
    const orderNet = Decimal.max(0, sub.minus(disc));

    grossSales = grossSales.plus(sub);
    discountTotal = discountTotal.plus(disc);
    netSales = netSales.plus(orderNet);

    const method = order.payment?.paymentMethod ?? 'CASH';
    if (method === 'CASH') {
      cashSales = cashSales.plus(grand);
    } else {
      nonCashSales = nonCashSales.plus(grand);
    }

    if (order.totalCogs && new Decimal(order.totalCogs).gt(0)) {
      totalHpp = totalHpp.plus(new Decimal(order.totalCogs));
    } else {
      for (const item of order.items) {
        const qty = new Decimal(item.qty || '0');
        const unitCost =
          item.unitCogs !== undefined && item.unitCogs !== ''
            ? new Decimal(item.unitCogs)
            : productCostMap.get(item.productId) ?? new Decimal(0);
        totalHpp = totalHpp.plus(unitCost.times(qty));
      }
    }
  }

  let expenseCount = 0;
  let totalExpenses = new Decimal(0);
  const expByCat = new Map<string, { total: Decimal; count: number }>();

  for (const exp of expenses) {
    const ts = new Date(exp.expenseDate).getTime();
    if (Number.isNaN(ts) || ts < startMs || ts > endMs) continue;

    expenseCount += 1;
    const amt = new Decimal(exp.amount || '0');
    totalExpenses = totalExpenses.plus(amt);

    const key =
      accountNameMap.get(exp.expenseAccountId) ||
      (exp.expenseAccountCode ? accountNameMap.get(exp.expenseAccountCode) : undefined) ||
      'Biaya Operasional';
    const existing = expByCat.get(key) ?? { total: new Decimal(0), count: 0 };
    existing.total = existing.total.plus(amt);
    existing.count += 1;
    expByCat.set(key, existing);
  }

  const grossProfit = netSales.minus(totalHpp);
  const netProfit = grossProfit.minus(totalExpenses);
  const netMarginPct = netSales.gt(0)
    ? netProfit.div(netSales).times(100)
    : new Decimal(0);

  const expenseBreakdown: ExpenseBreakdownRow[] = Array.from(expByCat.entries())
    .map(([category, info]) => ({
      category,
      totalAmount: info.total.toFixed(4),
      count: info.count,
    }))
    .sort((a, b) => new Decimal(b.totalAmount).comparedTo(new Decimal(a.totalAmount)));

  return {
    period,
    periodLabel,
    rangeLabel,
    anchorDateIso: anchor.toISOString(),
    startDateIso: start.toISOString(),
    endDateIso: end.toISOString(),
    orderCount,
    expenseCount,
    grossSales: grossSales.toFixed(4),
    discountTotal: discountTotal.toFixed(4),
    netSales: netSales.toFixed(4),
    totalHpp: totalHpp.toFixed(4),
    grossProfit: grossProfit.toFixed(4),
    totalExpenses: totalExpenses.toFixed(4),
    netProfit: netProfit.toFixed(4),
    netMarginPct: netMarginPct.toFixed(2),
    cashSales: cashSales.toFixed(4),
    nonCashSales: nonCashSales.toFixed(4),
    expenseBreakdown,
  };
}

function formatRupiahPlain(val: string): string {
  const num = new Decimal(val || '0').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const absStr = num.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return num.isNeg() ? `-Rp${absStr}` : `Rp${absStr}`;
}

function padReceiptLine(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

/**
 * Formats an elegant monospace thermal receipt summary (58mm = 32 chars, 80mm = 42 chars)
 * for Tier-1 financial reports using plain layperson Indonesian (zero debit/kredit jargon).
 */
export function buildTier1ReceiptText(params: {
  tenantName: string;
  report: Tier1PeriodReport;
  paperWidth?: '58mm' | '80mm';
  printedAt?: Date;
}): string {
  const { tenantName, report, paperWidth = '58mm', printedAt = new Date() } = params;
  const cols = paperWidth === '80mm' ? 42 : 32;
  const sep = '-'.repeat(cols);
  const doubleSep = '='.repeat(cols);

  const center = (txt: string) => {
    const trimmed = txt.slice(0, cols);
    const leftPad = Math.max(0, Math.floor((cols - trimmed.length) / 2));
    return `${' '.repeat(leftPad)}${trimmed}`;
  };

  const printedLabel = printedAt.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines: string[] = [
    doubleSep,
    center(tenantName.toUpperCase()),
    center(report.periodLabel),
    center(report.rangeLabel),
    doubleSep,
    padReceiptLine('Transaksi Lunas', `${report.orderCount} nota`, cols),
    padReceiptLine('Catatan Biaya', `${report.expenseCount} item`, cols),
    sep,
    padReceiptLine('Penjualan Kotor', formatRupiahPlain(report.grossSales), cols),
  ];

  if (new Decimal(report.discountTotal).gt(0)) {
    lines.push(padReceiptLine('Potongan/Diskon', `-${formatRupiahPlain(report.discountTotal)}`, cols));
  }

  lines.push(
    padReceiptLine('Penjualan Bersih', formatRupiahPlain(report.netSales), cols),
    padReceiptLine('Modal Barang', `-${formatRupiahPlain(report.totalHpp)}`, cols),
    padReceiptLine('Untung Kotor', formatRupiahPlain(report.grossProfit), cols),
    padReceiptLine('Biaya Usaha', `-${formatRupiahPlain(report.totalExpenses)}`, cols),
    sep,
    padReceiptLine('UNTUNG BERSIH', formatRupiahPlain(report.netProfit), cols),
    padReceiptLine('Margin Bersih', `${report.netMarginPct}%`, cols),
    sep,
    padReceiptLine('Uang Tunai', formatRupiahPlain(report.cashSales), cols),
    padReceiptLine('Non-Tunai', formatRupiahPlain(report.nonCashSales), cols),
    doubleSep,
    center(`Dicetak: ${printedLabel}`),
    center('KasirAkun UMKM - Ringkasan'),
    doubleSep
  );

  return lines.join('\n');
}

