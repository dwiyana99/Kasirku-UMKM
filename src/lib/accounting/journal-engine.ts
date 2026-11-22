/**
 * KasirAkun UMKM — Immutable Double-Entry General Ledger Engine
 * Enforces:
 * - Zero floating-point arithmetic (Decimal.js)
 * - Strict balance check: SUM(debit) === SUM(credit) && debit >= 0 && credit >= 0
 * - Immutable POSTED entries (corrections must create Reversing Journal Entries)
 * - Automated POS / QRIS Sale + Perpetual COGS journals
 * - Operational Expenses with PPh 21/23/4(2) withholding
 * - Monthly Straight-Line Fixed Asset Depreciation batch posting
 * - 3-Tier Financial Reporting: Tier 1 (Simple), Tier 2 (SAK EMKM), Tier 3 (Expert PSAK + Ratios + Fiscal Recon)
 */

import Decimal from 'decimal.js';
import type {
  Account,
  FixedAsset,
  JournalEntry,
  JournalLine,
  OperationalExpense,
  Order,
  Payment,
} from '../../types/domain';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface DraftJournalLine {
  accountCode: string;
  debit: string;
  credit: string;
  memo?: string;
}

export function validateBalancedJournal(lines: DraftJournalLine[]): {
  valid: boolean;
  totalDebit: string;
  totalCredit: string;
  error?: string;
} {
  if (!lines.length || lines.length < 2) {
    return {
      valid: false,
      totalDebit: '0.0000',
      totalCredit: '0.0000',
      error: 'Jurnal double-entry minimal membutuhkan 2 baris akun (Debit & Kredit).',
    };
  }

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const line of lines) {
    const d = new Decimal(line.debit || '0');
    const c = new Decimal(line.credit || '0');
    if (d.lt(0) || c.lt(0)) {
      return {
        valid: false,
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        error: 'Nilai Debit atau Kredit tidak boleh negatif.',
      };
    }
    if (d.gt(0) && c.gt(0)) {
      return {
        valid: false,
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        error: 'Satu baris jurnal tidak boleh mengisi Debit dan Kredit bersamaan.',
      };
    }
    totalDebit = totalDebit.plus(d);
    totalCredit = totalCredit.plus(c);
  }

  if (totalDebit.lte(0)) {
    return {
      valid: false,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      error: 'Total jurnal harus lebih besar dari nol.',
    };
  }

  if (!totalDebit.equals(totalCredit)) {
    return {
      valid: false,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
      error: `Jurnal tidak seimbang: Debit (${totalDebit.toFixed(2)}) ≠ Kredit (${totalCredit.toFixed(2)}).`,
    };
  }

  return {
    valid: true,
    totalDebit: totalDebit.toFixed(4),
    totalCredit: totalCredit.toFixed(4),
  };
}

function resolveAccount(accounts: Account[], code: string): Account {
  const found = accounts.find((a) => a.code === code);
  if (!found) {
    throw new Error(`Akun CoA dengan kode ${code} tidak ditemukan untuk tenant ini.`);
  }
  return found;
}

export function buildJournalEntry(params: {
  id: string;
  tenantId: string;
  branchId?: string | null;
  entryNumber: string;
  entryDate: string;
  sourceModule: JournalEntry['sourceModule'];
  sourceId: string | null;
  description: string;
  reversedEntryId?: string | null;
  accounts: Account[];
  draftLines: DraftJournalLine[];
}): JournalEntry {
  const nonZeroLines = params.draftLines.filter(
    (l) => new Decimal(l.debit || '0').gt(0) || new Decimal(l.credit || '0').gt(0)
  );
  const check = validateBalancedJournal(nonZeroLines);
  if (!check.valid) {
    throw new Error(check.error || 'Validasi jurnal double-entry gagal.');
  }

  const lines: JournalLine[] = nonZeroLines.map((line, index) => {
    const acc = resolveAccount(params.accounts, line.accountCode);
    return {
      id: `${params.id}-L${index + 1}`,
      journalEntryId: params.id,
      accountId: acc.id,
      accountCodeSnapshot: acc.code,
      accountNameSnapshot: acc.name,
      debit: new Decimal(line.debit || '0').toFixed(4),
      credit: new Decimal(line.credit || '0').toFixed(4),
      memo: line.memo,
    };
  });

  return {
    id: params.id,
    tenantId: params.tenantId,
    branchId: params.branchId ?? null,
    entryNumber: params.entryNumber,
    entryDate: params.entryDate,
    sourceModule: params.sourceModule,
    sourceId: params.sourceId,
    description: params.description,
    status: 'POSTED',
    reversedEntryId: params.reversedEntryId ?? null,
    lines,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates automated Double-Entry Journals for a PAID POS or QR Self-Order:
 * - Entry 1 (Revenue, Tax & Gateway MDR):
 *   Dr Kas / Bank / Piutang QRIS (Net Received)
 *   Dr Beban MDR QRIS (if QRIS fee > 0)
 *   Dr Diskon Penjualan (if discount > 0)
 *   Cr Pendapatan Penjualan (Gross Subtotal)
 *   Cr Pendapatan Service Charge (if serviceCharge > 0)
 *   Cr PPN Keluaran (2102) OR Utang PB1 Restoran (2103)
 * - Entry 2 (Perpetual COGS / HPP — if totalCogs > 0):
 *   Dr Harga Pokok Penjualan (5101)
 *   Cr Persediaan Barang Dagang / Bahan Baku (1105)
 */
export function createSaleJournalEntries(params: {
  tenantId: string;
  order: Order;
  payment: Payment;
  accounts: Account[];
  entrySeq: number;
}): JournalEntry[] {
  const { tenantId, order, payment, accounts, entrySeq } = params;
  const entryDate = order.createdAt.slice(0, 10);
  const grandTotal = new Decimal(order.grandTotal);
  const mdrFee = new Decimal(payment.mdrFee || '0');
  const netReceived = grandTotal.minus(mdrFee);
  const subtotal = new Decimal(order.subtotal);
  const discount = new Decimal(order.discountAmount || '0');
  const serviceCharge = new Decimal(order.serviceCharge || '0');
  const taxAmount = new Decimal(order.taxAmount || '0');
  const totalCogs = new Decimal(order.totalCogs || '0');

  const debitAccountCode =
    payment.paymentMethod === 'CASH'
      ? '1101'
      : payment.paymentMethod === 'BANK_TRANSFER' || payment.paymentMethod === 'VIRTUAL_ACCOUNT'
      ? '1102'
      : '1103';

  const revLines: DraftJournalLine[] = [
    {
      accountCode: debitAccountCode,
      debit: netReceived.toFixed(4),
      credit: '0.0000',
      memo: `Penerimaan bersih ${payment.paymentMethod} #${order.orderNumber}`,
    },
  ];

  if (mdrFee.gt(0)) {
    revLines.push({
      accountCode: '6104',
      debit: mdrFee.toFixed(4),
      credit: '0.0000',
      memo: `Biaya MDR ${payment.paymentMethod} #${order.orderNumber}`,
    });
  }

  if (discount.gt(0)) {
    revLines.push({
      accountCode: '4103',
      debit: discount.toFixed(4),
      credit: '0.0000',
      memo: `Diskon penjualan #${order.orderNumber}`,
    });
  }

  revLines.push({
    accountCode: '4101',
    debit: '0.0000',
    credit: subtotal.toFixed(4),
    memo: `Penjualan bruto #${order.orderNumber}`,
  });

  if (serviceCharge.gt(0)) {
    revLines.push({
      accountCode: '4102',
      debit: '0.0000',
      credit: serviceCharge.toFixed(4),
      memo: `Service charge #${order.orderNumber}`,
    });
  }

  if (taxAmount.gt(0)) {
    const taxAccountCode = order.taxType === 'PB1_RESTO_10' ? '2103' : '2102';
    revLines.push({
      accountCode: taxAccountCode,
      debit: '0.0000',
      credit: taxAmount.toFixed(4),
      memo:
        order.taxType === 'PB1_RESTO_10'
          ? `PB1 Restoran 10% #${order.orderNumber}`
          : `PPN Keluaran (DPP Nilai Lain ${new Decimal(order.dppNilaiLain).toFixed(0)}) #${order.orderNumber}`,
    });
  }

  const entries: JournalEntry[] = [
    buildJournalEntry({
      id: `je-rev-${order.id}`,
      tenantId,
      entryNumber: `JU-${entryDate.replace(/-/g, '')}-${String(entrySeq).padStart(4, '0')}`,
      entryDate,
      sourceModule: order.orderSource === 'QR_SELF_ORDER' ? 'QR_ORDER' : 'POS',
      sourceId: order.id,
      description: `Penjualan ${order.orderSource === 'QR_SELF_ORDER' ? 'QR Meja' : 'POS'} #${order.orderNumber} (${order.customerName})`,
      accounts,
      draftLines: revLines,
    }),
  ];

  if (totalCogs.gt(0)) {
    entries.push(
      buildJournalEntry({
        id: `je-cogs-${order.id}`,
        tenantId,
        entryNumber: `JU-${entryDate.replace(/-/g, '')}-${String(entrySeq + 1).padStart(4, '0')}`,
        entryDate,
        sourceModule: order.orderSource === 'QR_SELF_ORDER' ? 'QR_ORDER' : 'POS',
        sourceId: order.id,
        description: `HPP Perpetual & Pengurangan Persediaan #${order.orderNumber}`,
        accounts,
        draftLines: [
          {
            accountCode: '5101',
            debit: totalCogs.toFixed(4),
            credit: '0.0000',
            memo: `HPP penjualan #${order.orderNumber}`,
          },
          {
            accountCode: '1105',
            debit: '0.0000',
            credit: totalCogs.toFixed(4),
            memo: `Konsumsi persediaan/bahan baku #${order.orderNumber}`,
          },
        ],
      })
    );
  }

  return entries;
}

export interface PosDoubleEntryPostingResult {
  revenueAndTaxEntry: JournalEntry;
  cogsEntry: JournalEntry | null;
  entries: JournalEntry[];
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
}

/**
 * High-level POS Double-Entry posting facade returning separated Revenue/Tax & COGS entries
 * with verified Decimal.js debit/credit totals.
 */
export function postPosOrderDoubleEntry(params: {
  tenantId: string;
  order: Order;
  payment: Payment;
  accounts: Account[];
  entrySeq: number;
}): PosDoubleEntryPostingResult {
  const entries = createSaleJournalEntries(params);
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const entry of entries) {
    for (const line of entry.lines) {
      totalDebit = totalDebit.plus(new Decimal(line.debit));
      totalCredit = totalCredit.plus(new Decimal(line.credit));
    }
  }

  return {
    revenueAndTaxEntry: entries[0],
    cogsEntry: entries[1] ?? null,
    entries,
    totalDebit: totalDebit.toFixed(4),
    totalCredit: totalCredit.toFixed(4),
    isBalanced: totalDebit.equals(totalCredit),
  };
}

/**
 * Immutable Reversing Journal Entry (Jurnal Pembalik)
 */
export function createReversingJournalEntry(params: {
  original: JournalEntry;
  accounts: Account[];
  entrySeq: number;
  reason?: string;
}): JournalEntry {
  const { original, accounts, entrySeq, reason } = params;
  const today = new Date().toISOString().slice(0, 10);
  const reversedLines: DraftJournalLine[] = original.lines.map((line) => ({
    accountCode: line.accountCodeSnapshot,
    debit: line.credit,
    credit: line.debit,
    memo: `Jurnal Pembalik atas ${original.entryNumber}${reason ? `: ${reason}` : ''}`,
  }));

  return buildJournalEntry({
    id: `je-rev-${original.id}-${Date.now()}`,
    tenantId: original.tenantId,
    entryNumber: `REV-${today.replace(/-/g, '')}-${String(entrySeq).padStart(4, '0')}`,
    entryDate: today,
    sourceModule: 'REVERSAL',
    sourceId: original.id,
    reversedEntryId: original.id,
    description: `Jurnal Pembalik (Koreksi) ${original.entryNumber} — ${original.description}`,
    accounts,
    draftLines: reversedLines,
  });
}

/**
 * Operational Expense Journal with optional PPh 21 / 23 / 4(2) withholding
 */
export function createExpenseJournalEntry(params: {
  tenantId: string;
  expense: OperationalExpense;
  accounts: Account[];
  entrySeq: number;
}): JournalEntry {
  const { tenantId, expense, accounts, entrySeq } = params;
  const expenseAcc = accounts.find((a) => a.id === expense.expenseAccountId);
  const paymentAcc = accounts.find((a) => a.id === expense.paymentAccountId);
  if (!expenseAcc || !paymentAcc) {
    throw new Error('Akun beban atau akun kas/bank tidak ditemukan.');
  }

  const gross = new Decimal(expense.amount);
  const taxWithheld = new Decimal(expense.withholdingTaxAmount || '0');
  const netPaid = gross.minus(taxWithheld);

  const lines: DraftJournalLine[] = [
    {
      accountCode: expenseAcc.code,
      debit: gross.toFixed(4),
      credit: '0.0000',
      memo: expense.description,
    },
    {
      accountCode: paymentAcc.code,
      debit: '0.0000',
      credit: netPaid.toFixed(4),
      memo: `Pembayaran bersih ${expense.description}`,
    },
  ];

  if (taxWithheld.gt(0)) {
    lines.push({
      accountCode: '2105',
      debit: '0.0000',
      credit: taxWithheld.toFixed(4),
      memo: `Pemotongan ${expense.withholdingTaxType} — ${expense.description}`,
    });
  }

  return buildJournalEntry({
    id: `je-exp-${expense.id}`,
    tenantId,
    entryNumber: `EXP-${expense.expenseDate.replace(/-/g, '')}-${String(entrySeq).padStart(4, '0')}`,
    entryDate: expense.expenseDate,
    sourceModule: 'EXPENSE',
    sourceId: expense.id,
    description: `Beban Operasional: ${expense.description}`,
    accounts,
    draftLines: lines,
  });
}

/**
 * 1-Click Monthly Straight-Line Fixed Asset Depreciation Batch
 */
export function createMonthlyDepreciationBatch(params: {
  tenantId: string;
  assets: FixedAsset[];
  accounts: Account[];
  entryDate: string;
  entrySeq: number;
}): {
  journalEntry: JournalEntry | null;
  updatedAssets: FixedAsset[];
  totalDepreciation: string;
} {
  const { tenantId, assets, accounts, entryDate, entrySeq } = params;
  let totalDepr = new Decimal(0);
  const updatedAssets: FixedAsset[] = [];

  for (const asset of assets) {
    if (asset.status !== 'ACTIVE' || asset.usefulLifeMonths <= 0) {
      updatedAssets.push(asset);
      continue;
    }

    const cost = new Decimal(asset.acquisitionCost);
    const salvage = new Decimal(asset.salvageValue);
    const accum = new Decimal(asset.accumulatedDepreciation);
    const depreciableBase = Decimal.max(new Decimal(0), cost.minus(salvage));
    const remaining = Decimal.max(new Decimal(0), depreciableBase.minus(accum));

    if (remaining.lte(0)) {
      updatedAssets.push({ ...asset, status: 'FULLY_DEPRECIATED' });
      continue;
    }

    const monthly = depreciableBase
      .div(asset.usefulLifeMonths)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const actualDepr = Decimal.min(remaining, monthly);
    const newAccum = accum.plus(actualDepr);

    totalDepr = totalDepr.plus(actualDepr);
    updatedAssets.push({
      ...asset,
      accumulatedDepreciation: newAccum.toFixed(4),
      status: newAccum.gte(depreciableBase) ? 'FULLY_DEPRECIATED' : 'ACTIVE',
    });
  }

  if (totalDepr.lte(0)) {
    return { journalEntry: null, updatedAssets, totalDepreciation: '0.0000' };
  }

  const journalEntry = buildJournalEntry({
    id: `je-depr-${entryDate}-${Date.now()}`,
    tenantId,
    entryNumber: `DEP-${entryDate.replace(/-/g, '')}-${String(entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'DEPRECIATION',
    sourceId: null,
    description: `Penyusutan Bulanan Aset Tetap (Metode Garis Lurus — ${entryDate.slice(0, 7)})`,
    accounts,
    draftLines: [
      {
        accountCode: '6106',
        debit: totalDepr.toFixed(4),
        credit: '0.0000',
        memo: 'Beban penyusutan peralatan bulanan',
      },
      {
        accountCode: '1202',
        debit: '0.0000',
        credit: totalDepr.toFixed(4),
        memo: 'Akumulasi penyusutan peralatan bulanan',
      },
    ],
  });

  return {
    journalEntry,
    updatedAssets,
    totalDepreciation: totalDepr.toFixed(4),
  };
}

export interface AccountBalanceRow {
  accountId: string;
  code: string;
  name: string;
  category: Account['category'];
  normalBalance: Account['normalBalance'];
  debitTotal: string;
  creditTotal: string;
  endingBalance: string; // Signed relative to normal balance (contra accounts negative when summing category)
}

export interface ThreeTierFinancialReport {
  trialBalance: AccountBalanceRow[];
  // Tier 1 — Simple Operasional Harian Toko
  tier1: {
    cashInTotal: string;
    cashOutTotal: string;
    netCashFlow: string;
    grossSales: string;
    totalHpp: string;
    grossProfit: string;
    operatingExpenses: string;
    netProfit: string;
  };
  // Tier 2 — Standar SAK EMKM (Neraca & Laba Rugi)
  tier2: {
    assets: { code: string; name: string; amount: string }[];
    liabilities: { code: string; name: string; amount: string }[];
    equity: { code: string; name: string; amount: string }[];
    totalAssets: string;
    totalLiabilities: string;
    totalEquity: string;
    currentPeriodNetIncome: string;
    isEquationBalanced: boolean;
    equationDiff: string;
    revenues: { code: string; name: string; amount: string }[];
    cogs: { code: string; name: string; amount: string }[];
    expenses: { code: string; name: string; amount: string }[];
    totalRevenue: string;
    totalCogs: string;
    totalExpenses: string;
    netIncome: string;
  };
  // Tier 3 — Expert PSAK (Arus Kas, Rasio Keuangan, Rekonsiliasi Fiskal)
  tier3: {
    cashFlowOperating: string;
    cashFlowInvesting: string;
    cashFlowFinancing: string;
    endingCashBalance: string;
    ratios: {
      grossProfitMarginPct: string;
      netProfitMarginPct: string;
      currentRatio: string;
      quickRatio: string;
      inventoryTurnover: string;
      daysSalesOfInventory: string;
      roePct: string;
      breakEvenRevenue: string;
    };
    fiscalReconciliation: {
      commercialNetIncome: string;
      positiveFiscalCorrection: string; // e.g., non-deductible entertainment/mdr estimate
      negativeFiscalCorrection: string;
      fiscalNetIncome: string;
    };
  };
}

export function generateThreeTierFinancialReport(
  accounts: Account[],
  journalEntries: JournalEntry[],
  orders: Order[],
  expenses: OperationalExpense[],
  fixedAssets: FixedAsset[]
): ThreeTierFinancialReport {
  const debitMap = new Map<string, Decimal>();
  const creditMap = new Map<string, Decimal>();

  for (const acc of accounts) {
    debitMap.set(acc.id, new Decimal(0));
    creditMap.set(acc.id, new Decimal(0));
  }

  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      debitMap.set(
        line.accountId,
        (debitMap.get(line.accountId) ?? new Decimal(0)).plus(new Decimal(line.debit || '0'))
      );
      creditMap.set(
        line.accountId,
        (creditMap.get(line.accountId) ?? new Decimal(0)).plus(new Decimal(line.credit || '0'))
      );
    }
  }

  const trialBalance: AccountBalanceRow[] = accounts
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((acc) => {
      const d = debitMap.get(acc.id) ?? new Decimal(0);
      const c = creditMap.get(acc.id) ?? new Decimal(0);
      const bal = acc.normalBalance === 'DEBIT' ? d.minus(c) : c.minus(d);
      return {
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normalBalance: acc.normalBalance,
        debitTotal: d.toFixed(4),
        creditTotal: c.toFixed(4),
        endingBalance: bal.toFixed(4),
      };
    });

  // Revenues (credit normal; contra revenue like 4103 Diskon has DEBIT normal so subtract it)
  const revenues: { code: string; name: string; amount: string }[] = [];
  let totalRevenue = new Decimal(0);
  for (const row of trialBalance.filter((r) => r.category === 'REVENUE')) {
    const val = new Decimal(row.endingBalance);
    const signed = row.normalBalance === 'CREDIT' ? val : val.negated();
    if (!signed.eq(0)) {
      revenues.push({ code: row.code, name: row.name, amount: signed.toFixed(4) });
    }
    totalRevenue = totalRevenue.plus(signed);
  }

  // COGS (5xxx) vs Operating Expenses (6xxx)
  const cogs: { code: string; name: string; amount: string }[] = [];
  const expRows: { code: string; name: string; amount: string }[] = [];
  let totalCogs = new Decimal(0);
  let totalExpenses = new Decimal(0);

  for (const row of trialBalance.filter((r) => r.category === 'EXPENSE')) {
    const val = new Decimal(row.endingBalance);
    if (row.code.startsWith('5')) {
      if (!val.eq(0)) cogs.push({ code: row.code, name: row.name, amount: val.toFixed(4) });
      totalCogs = totalCogs.plus(val);
    } else {
      if (!val.eq(0)) expRows.push({ code: row.code, name: row.name, amount: val.toFixed(4) });
      totalExpenses = totalExpenses.plus(val);
    }
  }

  const grossProfit = totalRevenue.minus(totalCogs);
  const netIncome = grossProfit.minus(totalExpenses);

  // Balance Sheet Assets (contra assets like 1202 Akumulasi Penyusutan have CREDIT normal -> negate)
  const assetsList: { code: string; name: string; amount: string }[] = [];
  let totalAssets = new Decimal(0);
  let currentAssets = new Decimal(0);
  let inventoryBalance = new Decimal(0);
  let cashAndBank = new Decimal(0);

  for (const row of trialBalance.filter((r) => r.category === 'ASSET')) {
    const val = new Decimal(row.endingBalance);
    const signed = row.normalBalance === 'DEBIT' ? val : val.negated();
    if (!signed.eq(0)) {
      assetsList.push({ code: row.code, name: row.name, amount: signed.toFixed(4) });
    }
    totalAssets = totalAssets.plus(signed);
    if (row.code.startsWith('11')) {
      currentAssets = currentAssets.plus(signed);
    }
    if (row.code === '1105') {
      inventoryBalance = signed;
    }
    if (row.code === '1101' || row.code === '1102' || row.code === '1103') {
      cashAndBank = cashAndBank.plus(signed);
    }
  }

  // Liabilities
  const liabilitiesList: { code: string; name: string; amount: string }[] = [];
  let totalLiabilities = new Decimal(0);
  let currentLiabilities = new Decimal(0);

  for (const row of trialBalance.filter((r) => r.category === 'LIABILITY')) {
    const val = new Decimal(row.endingBalance);
    const signed = row.normalBalance === 'CREDIT' ? val : val.negated();
    if (!signed.eq(0)) {
      liabilitiesList.push({ code: row.code, name: row.name, amount: signed.toFixed(4) });
    }
    totalLiabilities = totalLiabilities.plus(signed);
    if (row.code.startsWith('21')) {
      currentLiabilities = currentLiabilities.plus(signed);
    }
  }

  // Equity + Current Period Net Income
  const equityList: { code: string; name: string; amount: string }[] = [];
  let totalEquity = new Decimal(0);

  for (const row of trialBalance.filter((r) => r.category === 'EQUITY')) {
    const val = new Decimal(row.endingBalance);
    const signed = row.normalBalance === 'CREDIT' ? val : val.negated();
    if (!signed.eq(0)) {
      equityList.push({ code: row.code, name: row.name, amount: signed.toFixed(4) });
    }
    totalEquity = totalEquity.plus(signed);
  }
  equityList.push({
    code: '3299',
    name: 'Laba (Rugi) Periode Berjalan',
    amount: netIncome.toFixed(4),
  });
  totalEquity = totalEquity.plus(netIncome);

  const equationDiff = totalAssets.minus(totalLiabilities.plus(totalEquity));
  const isEquationBalanced = equationDiff.abs().lt('0.01');

  // Tier 1 Cash Flow (Direct Operational View)
  const paidOrders = orders.filter((o) => o.paymentStatus === 'PAID');
  const cashInTotal = paidOrders.reduce(
    (sum, o) => sum.plus(new Decimal(o.grandTotal)),
    new Decimal(0)
  );
  const cashOutTotal = expenses.reduce(
    (sum, e) => sum.plus(new Decimal(e.amount).minus(new Decimal(e.withholdingTaxAmount || '0'))),
    new Decimal(0)
  );
  const netCashFlow = cashInTotal.minus(cashOutTotal);

  // Tier 3 Cash Flow & Ratios
  const deprRow = trialBalance.find((r) => r.code === '6106');
  const deprAmount = deprRow ? new Decimal(deprRow.endingBalance) : new Decimal(0);
  const cashFlowOperating = netIncome.plus(deprAmount);
  const cashFlowInvesting = fixedAssets
    .reduce((sum, a) => sum.plus(new Decimal(a.acquisitionCost)), new Decimal(0))
    .negated();
  const capitalRow = trialBalance.find((r) => r.code === '3101');
  const cashFlowFinancing = capitalRow ? new Decimal(capitalRow.endingBalance) : new Decimal(0);

  const grossMarginPct = totalRevenue.gt(0)
    ? grossProfit.div(totalRevenue).times(100).toFixed(1)
    : '0.0';
  const netMarginPct = totalRevenue.gt(0)
    ? netIncome.div(totalRevenue).times(100).toFixed(1)
    : '0.0';
  const currentRatio = currentLiabilities.gt(0)
    ? currentAssets.div(currentLiabilities).toFixed(2)
    : 'N/A';
  const quickRatio = currentLiabilities.gt(0)
    ? currentAssets.minus(inventoryBalance).div(currentLiabilities).toFixed(2)
    : 'N/A';
  const ito = inventoryBalance.gt(0) ? totalCogs.div(inventoryBalance) : new Decimal(0);
  const dsi = ito.gt(0) ? new Decimal(365).div(ito).toFixed(0) : '0';
  const roePct = totalEquity.gt(0)
    ? netIncome.div(totalEquity).times(100).toFixed(1)
    : '0.0';
  const cmRatio = totalRevenue.gt(0) ? grossProfit.div(totalRevenue) : new Decimal(0);
  const bepRevenue = cmRatio.gt(0)
    ? totalExpenses.div(cmRatio).toDecimalPlaces(0, Decimal.ROUND_CEIL)
    : new Decimal(0);

  // Fiscal reconciliation (illustrative positive correction for 50% promo/entertainment if any)
  const promoRow = trialBalance.find((r) => r.code === '6107');
  const positiveCorrection = promoRow
    ? new Decimal(promoRow.endingBalance).times('0.20').toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const fiscalNetIncome = netIncome.plus(positiveCorrection);

  return {
    trialBalance,
    tier1: {
      cashInTotal: cashInTotal.toFixed(4),
      cashOutTotal: cashOutTotal.toFixed(4),
      netCashFlow: netCashFlow.toFixed(4),
      grossSales: totalRevenue.toFixed(4),
      totalHpp: totalCogs.toFixed(4),
      grossProfit: grossProfit.toFixed(4),
      operatingExpenses: totalExpenses.toFixed(4),
      netProfit: netIncome.toFixed(4),
    },
    tier2: {
      assets: assetsList,
      liabilities: liabilitiesList,
      equity: equityList,
      totalAssets: totalAssets.toFixed(4),
      totalLiabilities: totalLiabilities.toFixed(4),
      totalEquity: totalEquity.toFixed(4),
      currentPeriodNetIncome: netIncome.toFixed(4),
      isEquationBalanced,
      equationDiff: equationDiff.toFixed(4),
      revenues,
      cogs,
      expenses: expRows,
      totalRevenue: totalRevenue.toFixed(4),
      totalCogs: totalCogs.toFixed(4),
      totalExpenses: totalExpenses.toFixed(4),
      netIncome: netIncome.toFixed(4),
    },
    tier3: {
      cashFlowOperating: cashFlowOperating.toFixed(4),
      cashFlowInvesting: cashFlowInvesting.toFixed(4),
      cashFlowFinancing: cashFlowFinancing.toFixed(4),
      endingCashBalance: cashAndBank.toFixed(4),
      ratios: {
        grossProfitMarginPct: grossMarginPct,
        netProfitMarginPct: netMarginPct,
        currentRatio,
        quickRatio,
        inventoryTurnover: ito.toFixed(2),
        daysSalesOfInventory: dsi,
        roePct,
        breakEvenRevenue: bepRevenue.toFixed(4),
      },
      fiscalReconciliation: {
        commercialNetIncome: netIncome.toFixed(4),
        positiveFiscalCorrection: positiveCorrection.toFixed(4),
        negativeFiscalCorrection: '0.0000',
        fiscalNetIncome: fiscalNetIncome.toFixed(4),
      },
    },
  };
}
