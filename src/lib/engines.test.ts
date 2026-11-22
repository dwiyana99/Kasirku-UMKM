import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  calculateOrderTax,
  calculatePPhCompliance,
  calculateWithholdingTax,
  validateCoretaxIds,
} from './tax/indonesia-tax-engine';
import {
  createExpenseJournalEntry,
  createMonthlyDepreciationBatch,
  createReversingJournalEntry,
  generateThreeTierFinancialReport,
  postPosOrderDoubleEntry,
  validateBalancedJournal,
} from './accounting/journal-engine';
import {
  buildEscPosReceiptCommands,
  processOrderCheckout,
} from './pos/checkout-service';
import type { Account, FixedAsset, Product, ProductRecipe, Tenant } from '../types/domain';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../prisma/seed';

const makeAccounts = (tenantId: string): Account[] =>
  DEFAULT_CHART_OF_ACCOUNTS.map((a, idx) => ({
    id: `acc-${idx + 1}`,
    tenantId,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));

test('PP 20/2026: WP_OP cumulative Rp500M non-taxable threshold crossing', () => {
  const below = calculatePPhCompliance({
    vertical: 'WARUNG_SEMBAKO',
    taxEntity: 'WP_OP',
    priorCumulativeTurnover: '420000000',
    currentMonthTurnover: '50000000',
    currentMonthNetProfit: '10000000',
  });
  assert.equal(below.isEligibleFinal05, true);
  assert.equal(new Decimal(below.taxableTurnoverThisMonth).toFixed(0), '0');
  assert.equal(new Decimal(below.estimatedTaxPayable).toFixed(0), '0');
  assert.equal(new Decimal(below.exemptRemainingRp500M).toFixed(0), '30000000');

  // Crossing Rp500M: prior 480M + current 45M = 525M => taxable = 25M => 0.5% = 125,000
  const crossing = calculatePPhCompliance({
    vertical: 'WARUNG_SEMBAKO',
    taxEntity: 'WP_OP',
    priorCumulativeTurnover: '480000000',
    currentMonthTurnover: '45000000',
    currentMonthNetProfit: '8000000',
  });
  assert.equal(new Decimal(crossing.taxableTurnoverThisMonth).toFixed(0), '25000000');
  assert.equal(new Decimal(crossing.estimatedTaxPayable).toFixed(0), '125000');
  assert.equal(new Decimal(crossing.exemptRemainingRp500M).toFixed(0), '0');
});

test('PP 20/2026: PT_PERORANGAN has no Rp500M exemption; FREELANCE & CV_FIRMA excluded from 0.5%', () => {
  const ptPerorangan = calculatePPhCompliance({
    vertical: 'RESTORAN',
    taxEntity: 'PT_PERORANGAN',
    priorCumulativeTurnover: '100000000',
    currentMonthTurnover: '40000000',
    currentMonthNetProfit: '12000000',
  });
  assert.equal(ptPerorangan.isEligibleFinal05, true);
  assert.equal(new Decimal(ptPerorangan.estimatedTaxPayable).toFixed(0), '200000'); // 0.5% of 40M

  const freelance = calculatePPhCompliance({
    vertical: 'FREELANCE',
    taxEntity: 'WP_OP',
    priorCumulativeTurnover: '120000000',
    currentMonthTurnover: '20000000',
    currentMonthNetProfit: '15000000',
  });
  assert.equal(freelance.isEligibleFinal05, false);
  assert.equal(freelance.regime, 'PPH_OP_PASAL_17_NPPN');

  const cv = calculatePPhCompliance({
    vertical: 'WARUNG_SEMBAKO',
    taxEntity: 'CV_FIRMA',
    priorCumulativeTurnover: '200000000',
    currentMonthTurnover: '80000000',
    currentMonthNetProfit: '10000000',
  });
  assert.equal(cv.isEligibleFinal05, false);
  assert.equal(cv.regime, 'PPH_BADAN_31E');
  assert.equal(new Decimal(cv.estimatedTaxPayable).toFixed(0), '1100000'); // 11% of 10M
});

test('PMK 131/2024: PPN 12% x DPP Nilai Lain (11/12) equals 11% effective; PB1 10% for Restoran', () => {
  const pkpSale = calculateOrderTax({
    vertical: 'WARUNG_SEMBAKO',
    isPkp: true,
    items: [{ lineSubtotal: '1200000', isLuxuryGoods: false, isTaxExempt: false }],
    discountAmount: '0',
    serviceCharge: '0',
  });
  assert.equal(pkpSale.taxType, 'PPN_11_12');
  assert.equal(new Decimal(pkpSale.dppNilaiLain).toFixed(0), '1100000'); // 11/12 of 1,200,000
  assert.equal(new Decimal(pkpSale.taxAmount).toFixed(0), '132000'); // 12% of 1,100,000 = 11% of 1,200,000

  const pb1Sale = calculateOrderTax({
    vertical: 'RESTORAN',
    isPkp: false,
    items: [{ lineSubtotal: '150000', isLuxuryGoods: false, isTaxExempt: false }],
    discountAmount: '0',
    serviceCharge: '7500',
  });
  assert.equal(pb1Sale.taxType, 'PB1_RESTO_10');
  assert.equal(new Decimal(pb1Sale.taxAmount).toFixed(0), '15750'); // 10% of 157,500
});

test('POS Checkout with BOM Recipe COGS, QRIS MDR Fee, Balanced Double-Entry & Reversal', () => {
  const tenantId = 't-resto';
  const accounts = makeAccounts(tenantId);
  const tenant: Tenant = {
    id: tenantId,
    name: 'Restoran Sate Pak Budi',
    slug: 'restoran-pak-budi',
    vertical: 'RESTORAN',
    taxEntity: 'PT_PERORANGAN',
    isPkp: false,
    npwp16: '0123456789012345',
    nitku22: '0123456789012345000001',
    address: 'Jl. Kemang Raya No. 12',
    receiptFooter: 'Terima kasih!',
    cumulativeTurnoverPriorMonths: '200000000',
    serviceChargeRate: '0.05',
    activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL'],
    settings: { autoPrintQrOrders: true, thermalPaperWidth: '80mm', qrisMdrRate: '0.007' },
    createdAt: new Date().toISOString(),
  };

  const products: Product[] = [
    {
      id: 'ing-ayam',
      tenantId,
      categoryId: null,
      sku: 'RAW-01',
      barcodeQr: '',
      name: 'Ayam Fillet',
      description: 'Bahan baku',
      itemType: 'RAW_MATERIAL',
      unit: 'kg',
      sellingPrice: '0',
      costPriceAvg: '48000',
      stockQty: '10',
      minStockAlert: '2',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: 'menu-sate',
      tenantId,
      categoryId: null,
      sku: 'MNU-01',
      barcodeQr: '',
      name: 'Sate Ayam Madura',
      description: '10 tusuk + lontong',
      itemType: 'MENU_ITEM',
      unit: 'porsi',
      sellingPrice: '45000',
      costPriceAvg: '14400',
      stockQty: '0',
      minStockAlert: '0',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: new Date().toISOString(),
    },
  ];

  const recipes: ProductRecipe[] = [
    {
      id: 'rec-1',
      tenantId,
      menuProductId: 'menu-sate',
      ingredientProductId: 'ing-ayam',
      quantityRequired: '0.25', // 0.25 kg x 48,000 = 12,000 per porsi
    },
  ];

  const checkout = processOrderCheckout({
    tenant,
    products,
    recipes,
    accounts,
    cart: [{ productId: 'menu-sate', qty: 2, notes: 'Pedas sedang' }],
    orderSource: 'QR_SELF_ORDER',
    paymentMethod: 'QRIS_DYNAMIC',
    customerName: 'Meja 04',
    tableNumber: '04',
    journalSeqStart: 1,
  });

  // 2 x 45,000 = 90,000 subtotal; 5% service = 4,500; PB1 10% of 94,500 = 9,450; grand = 103,950
  assert.equal(new Decimal(checkout.order.subtotal).toFixed(0), '90000');
  assert.equal(new Decimal(checkout.order.serviceCharge).toFixed(0), '4500');
  assert.equal(new Decimal(checkout.order.taxAmount).toFixed(0), '9450');
  assert.equal(new Decimal(checkout.order.grandTotal).toFixed(0), '103950');
  // Recipe COGS: 2 x 0.25kg x 48,000 = 24,000
  assert.equal(new Decimal(checkout.order.totalCogs).toFixed(0), '24000');
  const updatedAyam = checkout.updatedProducts.find((p) => p.id === 'ing-ayam')!;
  assert.equal(new Decimal(updatedAyam.stockQty).toFixed(2), '9.50');

  // Verify 2 balanced journals (Revenue+PB1+MDR and Perpetual COGS)
  assert.equal(checkout.newJournalEntries.length, 2);
  for (const je of checkout.newJournalEntries) {
    const check = validateBalancedJournal(
      je.lines.map((l) => ({
        accountCode: l.accountCodeSnapshot,
        debit: l.debit,
        credit: l.credit,
      }))
    );
    assert.equal(check.valid, true);
  }

  // Test Reversing Entry & Balance Sheet equation stays balanced
  const rev = createReversingJournalEntry({
    original: checkout.newJournalEntries[0],
    accounts,
    entrySeq: 3,
    reason: 'Tes koreksi',
  });
  assert.equal(rev.reversedEntryId, checkout.newJournalEntries[0].id);

  const report = generateThreeTierFinancialReport(
    accounts,
    [...checkout.newJournalEntries],
    [checkout.order],
    [],
    []
  );
  assert.equal(report.tier2.isEquationBalanced, true);

  // ESC/POS thermal command bytes non-empty
  const escPos = buildEscPosReceiptCommands(checkout.order, tenant);
  assert.ok(escPos.length > 50);
});

test('Operational Expense PPh 4(2) 10% Withholding, Fixed Asset Depreciation & Coretax IDs', () => {
  const accounts = makeAccounts('t-1');
  const wh = calculateWithholdingTax('10000000', 'PPH_4_2_SEWA_10PCT');
  assert.equal(new Decimal(wh.withheldAmount).toFixed(0), '1000000');
  assert.equal(new Decimal(wh.netCashOut).toFixed(0), '9000000');

  const expAccount = accounts.find((a) => a.code === '6102')!;
  const bankAccount = accounts.find((a) => a.code === '1102')!;
  const expJe = createExpenseJournalEntry({
    tenantId: 't-1',
    expense: {
      id: 'exp-1',
      tenantId: 't-1',
      expenseAccountId: expAccount.id,
      paymentAccountId: bankAccount.id,
      expenseDate: '2026-11-18',
      description: 'Sewa Ruko Bulan November',
      amount: '10000000',
      withholdingTaxType: 'PPH_4_2_SEWA_10PCT',
      withholdingTaxAmount: wh.withheldAmount,
      customAttributes: {},
      createdAt: new Date().toISOString(),
    },
    accounts,
    entrySeq: 10,
  });
  assert.equal(expJe.lines.length, 3);

  const asset: FixedAsset = {
    id: 'fa-1',
    tenantId: 't-1',
    assetCode: 'FA-001',
    name: 'Mesin Espresso 2 Group',
    acquisitionDate: '2026-01-01',
    acquisitionCost: '24000000',
    salvageValue: '0',
    usefulLifeMonths: 48,
    depreciationMethod: 'STRAIGHT_LINE',
    accumulatedDepreciation: '0',
    assetAccountId: accounts.find((a) => a.code === '1201')!.id,
    accumDeprAccountId: accounts.find((a) => a.code === '1202')!.id,
    deprExpenseAccountId: accounts.find((a) => a.code === '6106')!.id,
    status: 'ACTIVE',
  };
  const batch = createMonthlyDepreciationBatch({
    tenantId: 't-1',
    assets: [asset],
    accounts,
    entryDate: '2026-11-30',
    entrySeq: 11,
  });
  assert.equal(new Decimal(batch.totalDepreciation).toFixed(0), '500000');
  assert.ok(batch.journalEntry !== null);

  const ids = validateCoretaxIds('0123456789012345', '0123456789012345000001');
  assert.equal(ids.npwpValid, true);
  assert.equal(ids.nitkuValid, true);
});

test('postPosOrderDoubleEntry: Automated POS Revenue, PPN/PB1 Tax Obligations & Perpetual COGS', () => {
  const tenantId = 't-pkp';
  const accounts = makeAccounts(tenantId);

  // Case 1: PKP Retail Sale (Subtotal 1,200,000 -> PPN 132,000, Grand Total 1,332,000, COGS 850,000)
  const pkpResult = postPosOrderDoubleEntry({
    tenantId,
    accounts,
    entrySeq: 20,
    order: {
      id: 'ord-pkp-1',
      tenantId,
      orderNumber: 'INV-PKP-001',
      orderSource: 'POS_CASHIER',
      tableId: null,
      customerName: 'Pelanggan Grosir',
      subtotal: '1200000.0000',
      discountAmount: '0.0000',
      serviceCharge: '0.0000',
      taxType: 'PPN_11_12',
      dppNilaiLain: '1100000.0000',
      taxAmount: '132000.0000',
      grandTotal: '1332000.0000',
      totalCogs: '850000.0000',
      paymentStatus: 'PAID',
      kitchenStatus: 'SERVED',
      isReceiptPrinted: true,
      items: [],
      customAttributes: {},
      createdAt: '2026-11-18T10:00:00.000Z',
    },
    payment: {
      id: 'pay-pkp-1',
      tenantId,
      orderId: 'ord-pkp-1',
      paymentMethod: 'QRIS_DYNAMIC',
      amountPaid: '1332000.0000',
      mdrFee: '9324.0000',
      gatewayRefId: 'QRIS-PKP-001',
      paidAt: '2026-11-18T10:00:00.000Z',
    },
  });

  assert.equal(pkpResult.isBalanced, true);
  assert.equal(pkpResult.entries.length, 2);
  assert.ok(pkpResult.cogsEntry !== null);
  assert.equal(pkpResult.totalDebit, pkpResult.totalCredit);
  // 1,332,000 (Revenue+PPN entry) + 850,000 (COGS entry) = 2,182,000
  assert.equal(new Decimal(pkpResult.totalDebit).toFixed(0), '2182000');

  const revLines = pkpResult.revenueAndTaxEntry.lines;
  const qrisDebit = revLines.find((l) => l.accountCodeSnapshot === '1103');
  const mdrDebit = revLines.find((l) => l.accountCodeSnapshot === '6104');
  const revCredit = revLines.find((l) => l.accountCodeSnapshot === '4101');
  const ppnCredit = revLines.find((l) => l.accountCodeSnapshot === '2102');
  assert.equal(new Decimal(qrisDebit!.debit).toFixed(0), '1322676'); // 1,332,000 - 9,324
  assert.equal(new Decimal(mdrDebit!.debit).toFixed(0), '9324');
  assert.equal(new Decimal(revCredit!.credit).toFixed(0), '1200000');
  assert.equal(new Decimal(ppnCredit!.credit).toFixed(0), '132000');

  const cogsLines = pkpResult.cogsEntry!.lines;
  assert.equal(
    new Decimal(cogsLines.find((l) => l.accountCodeSnapshot === '5101')!.debit).toFixed(0),
    '850000'
  );
  assert.equal(
    new Decimal(cogsLines.find((l) => l.accountCodeSnapshot === '1105')!.credit).toFixed(0),
    '850000'
  );
});

