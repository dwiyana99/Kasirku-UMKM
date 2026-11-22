import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../prisma/seed';
import {
  ADDON_DEFINITIONS,
  calculateHybridPricing,
  resolveTenantEffectiveAddOns,
  tenantHasAddOn,
} from './saas/hybrid-pricing';
import {
  buildPurchaseOrderPdfDocument,
  buildStockTransferPdfDocument,
} from './pdf/po-pdf-generator';
import {
  buildPostgresMigrationSql,
  buildProductionEnvSnippet,
  DEFAULT_INFRA_MIGRATION_CONFIG,
  runMigrationPreflightAudit,
  validatePostgresConnectionUri,
  validateStorageTargetConfig,
} from './infra/pg-migration-builder';
import {
  buildBoardingWhatsAppLink,
  calculateBoardingInvoice,
  createBoardingDepositJournal,
  createBoardingRentPaymentJournal,
  recordAgroBatchUsage,
  recordAgroHarvest,
} from './verticals/kost-agro-engine';
import {
  approveStockOpnameSession,
  receivePurchaseOrderWithLandedCost,
  receiveStockTransfer,
  recordSupplierDebtPayment,
  shipStockTransfer,
} from './inventory/multi-branch-engine';
import {
  buildWhatsAppReceiptUrl,
  calculatePromotionDiscount,
  closeCashierShift,
  detectAntiFraudAnomalies,
  getFrequentlyBoughtTogether,
  resolveEffectiveUnitPrice,
} from './pos/advanced-pos-engine';
import { validateBalancedJournal } from './accounting/journal-engine';
import {
  calculateChannelMdr,
  createAutoPaymentChallenge,
  verifyAutoPaymentCallback,
} from './pos/payment-verifier';
import {
  createDemoBarbershopWorkspace,
  createDemoTokoRetailWorkspace,
} from '../data/demoSeedsExtended';
import type {
  Account,
  AgroBatch,
  AuditLog,
  BoardingInvoice,
  BoardingRoom,
  BoardingTenant,
  BranchStock,
  CashierShift,
  Order,
  PriceTier,
  Product,
  Promotion,
  PurchaseOrder,
  StockOpnameSession,
  StockTransfer,
} from '../types/domain';

function makeAccounts(tenantId = 't-test'): Account[] {
  return DEFAULT_CHART_OF_ACCOUNTS.map((a, idx) => ({
    id: `${tenantId}-acc-${idx + 1}`,
    tenantId,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));
}

function assertJournalBalanced(
  lines: Array<{ accountCodeSnapshot: string; debit: string; credit: string }>
) {
  const res = validateBalancedJournal(
    lines.map((l) => ({
      accountCode: l.accountCodeSnapshot,
      debit: l.debit,
      credit: l.credit,
    }))
  );
  assert.equal(res.valid, true, res.error || 'Journal must be balanced');
}

test('Hybrid Pricing: Basic 100k, Annual 15% discount, Smart PRO upsell > Rp190k, Separate AI Add-On excluded from Expert', () => {
  const basicMonthly = calculateHybridPricing({
    planCode: 'BASIC',
    billingCycle: 'MONTHLY',
    selectedAddOns: [],
    extraBranchQty: 0,
    extraStaffQty: 0,
  });
  assert.equal(basicMonthly.billingSubtotal, '100000.0000');
  assert.equal(basicMonthly.smartUpsellRecommendation, null);

  const basicAnnual = calculateHybridPricing({
    planCode: 'BASIC',
    billingCycle: 'ANNUAL',
    selectedAddOns: [],
  });
  // 100,000 * 12 = 1,200,000; 15% discount = 180,000; subtotal = 1,020,000 -> 85,000/mo
  assert.equal(basicAnnual.effectiveMonthlySubtotal, '85000.0000');

  // Basic (100k) + Resto QR/KDS (45k) + Inventory Pro (35k) + Promo CRM (30k) = 210k > 190k -> suggest PRO 199k!
  const basicHeavy = calculateHybridPricing({
    planCode: 'BASIC',
    billingCycle: 'MONTHLY',
    selectedAddOns: ['ADDON_RESTO_QR_KDS', 'ADDON_INVENTORY_PRO', 'ADDON_PROMO_CRM'],
  });
  assert.equal(basicHeavy.billingSubtotal, '210000.0000');
  assert.ok(basicHeavy.smartUpsellRecommendation?.includes('Rp199.000'));

  // Rebalanced PRO & EXPERT do NOT auto-include ADDON_RESTO_QR_KDS (strictly modular Add-On for F&B only!)
  const proAddOns = resolveTenantEffectiveAddOns({ subscriptionPlan: 'PRO', activeAddOns: [] });
  assert.equal(proAddOns.has('ADDON_INVENTORY_PRO'), true);
  assert.equal(proAddOns.has('ADDON_PROMO_CRM'), true);
  assert.equal(proAddOns.has('ADDON_RESTO_QR_KDS'), false);

  // EXPERT plan does NOT include ADDON_AI_ASSISTANT or ADDON_RESTO_QR_KDS automatically!
  const expertAddOns = resolveTenantEffectiveAddOns({ subscriptionPlan: 'EXPERT', activeAddOns: [] });
  assert.equal(expertAddOns.has('ADDON_ACCOUNTING_PRO'), true);
  assert.equal(expertAddOns.has('ADDON_TAX_CORETAX'), true);
  assert.equal(expertAddOns.has('ADDON_RESTO_QR_KDS'), false);
  assert.equal(expertAddOns.has('ADDON_AI_ASSISTANT'), false);
  assert.equal(
    tenantHasAddOn({ subscriptionPlan: 'EXPERT', activeAddOns: [] }, 'ADDON_AI_ASSISTANT'),
    false
  );
  assert.equal(
    tenantHasAddOn(
      { subscriptionPlan: 'EXPERT', activeAddOns: ['ADDON_AI_ASSISTANT'] },
      'ADDON_AI_ASSISTANT'
    ),
    true
  );
});

test('Kost Accounting: Deposit journals strictly as Liability 2106 (not revenue) & Rent tracks PPh 4(2) 10%', () => {
  const accounts = makeAccounts('t-kost');
  const room: BoardingRoom = {
    id: 'room-1',
    tenantId: 't-kost',
    roomNumber: '101',
    roomType: 'AC + KM Dalam',
    monthlyRate: '1500000.0000',
    yearlyRate: '16500000.0000',
    status: 'OCCUPIED',
    createdAt: '2026-04-01T00:00:00Z',
  };
  const bTenant: BoardingTenant = {
    id: 'bt-1',
    tenantId: 't-kost',
    roomId: 'room-1',
    fullName: 'Andi Wijaya',
    nikKtp: '3174011205950001',
    phoneWa: '081234567890',
    emergencyContact: '081200000001',
    checkInDate: '2026-04-01',
    depositAmount: '1500000.0000',
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
  };

  const depJe = createBoardingDepositJournal({
    tenantId: 't-kost',
    branchId: 'br-1',
    boardingTenant: bTenant,
    roomNumber: '101',
    paymentAccountCode: '1102',
    accounts,
    entrySeq: 1,
    entryDate: '2026-04-01',
  });
  assert.ok(depJe);
  assertJournalBalanced(depJe!.lines);
  assert.equal(depJe!.lines.find((l) => l.accountCodeSnapshot === '1102')?.debit, '1500000.0000');
  assert.equal(depJe!.lines.find((l) => l.accountCodeSnapshot === '2106')?.credit, '1500000.0000');
  assert.equal(
    depJe!.lines.some((l) => l.accountCodeSnapshot.startsWith('4')),
    false
  );

  const calc = calculateBoardingInvoice({
    rentAmount: '1500000',
    utilityFee: '250000',
    lateFee: '50000',
  });
  assert.equal(calc.totalAmount, '1800000.0000');
  assert.equal(calc.pph42Amount, '180000.0000'); // 10% of 1,800,000 gross rent invoice

  const inv: BoardingInvoice = {
    id: 'binv-1',
    tenantId: 't-kost',
    roomId: 'room-1',
    boardingTenantId: 'bt-1',
    periodMonth: '2026-04',
    rentAmount: '1500000.0000',
    utilityFee: '250000.0000',
    lateFee: '50000.0000',
    totalAmount: calc.totalAmount,
    pph42Amount: calc.pph42Amount,
    paymentStatus: 'PAID',
    paidAt: '2026-04-02T10:00:00Z',
    createdAt: '2026-04-01T00:00:00Z',
  };

  const rentJe = createBoardingRentPaymentJournal({
    tenantId: 't-kost',
    invoice: inv,
    tenantName: bTenant.fullName,
    roomNumber: room.roomNumber,
    paymentAccountCode: '1102',
    accounts,
    entrySeq: 2,
    entryDate: '2026-04-02',
  });
  assertJournalBalanced(rentJe.lines);
  assert.equal(rentJe.lines.find((l) => l.accountCodeSnapshot === '4104')?.credit, '1800000.0000');
  assert.equal(rentJe.lines.find((l) => l.accountCodeSnapshot === '2105')?.credit, '180000.0000');

  const waUrl = buildBoardingWhatsAppLink({
    businessName: 'Kost Griya Nyaman',
    boardingTenant: bTenant,
    room,
    invoice: inv,
  });
  assert.ok(waUrl.startsWith('https://wa.me/6281234567890?text='));
});

test('Agro WIP & Harvest: Feed/Seed usage debits 1109 WIP & Harvest calculates exact HPP/Kg into 1110', () => {
  const accounts = makeAccounts('t-agro');
  const batch: AgroBatch = {
    id: 'batch-4',
    tenantId: 't-agro',
    name: 'Ayam Broiler Batch #4',
    agroType: 'TERNAK',
    startDate: '2026-03-01',
    initialQty: '1000.0000',
    mortalityQty: '40.0000',
    unit: 'ekor',
    status: 'ACTIVE',
    accumulatedCost: '15000000.0000',
    usages: [],
    harvests: [],
    createdAt: '2026-03-01T00:00:00Z',
  };

  const usageRes = recordAgroBatchUsage({
    tenantId: 't-agro',
    batch,
    usageCategory: 'PAKAN',
    description: 'Pakan Finisher CP-512',
    productId: 'prod-pakan',
    qtyUsed: '50',
    unit: 'sak',
    unitCost: '400000', // 20,000,000
    usageDate: '2026-03-20',
    accounts,
    entrySeq: 10,
  });
  assertJournalBalanced(usageRes.journalEntry.lines);
  assert.equal(usageRes.updatedBatch.accumulatedCost, '35000000.0000');
  assert.equal(
    usageRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1109')?.debit,
    '20000000.0000'
  );
  assert.equal(
    usageRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1105')?.credit,
    '20000000.0000'
  );

  const targetProduct: Product = {
    id: 'prod-broiler',
    tenantId: 't-agro',
    categoryId: null,
    sku: 'AG-01',
    barcodeQr: '',
    name: 'Ayam Broiler Hidup',
    description: 'Hasil panen broiler',
    itemType: 'RETAIL_GOODS',
    unit: 'kg',
    sellingPrice: '28000.0000',
    costPriceAvg: '22000.0000',
    stockQty: '250.0000',
    minStockAlert: '50.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-03-01T00:00:00Z',
  };

  // Harvest 1,750 Kg -> HPP/Kg = 35,000,000 / 1,750 = Rp20.000/Kg
  const harvestRes = recordAgroHarvest({
    tenantId: 't-agro',
    batch: usageRes.updatedBatch,
    targetProduct,
    harvestDate: '2026-04-05',
    netHarvestQty: '1750',
    unit: 'kg',
    accounts,
    entrySeq: 11,
  });
  assertJournalBalanced(harvestRes.journalEntry.lines);
  assert.equal(harvestRes.harvest.unitHppComputed, '20000.0000');
  assert.equal(harvestRes.updatedBatch.status, 'HARVESTED');
  assert.equal(
    harvestRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1110')?.debit,
    '35000000.0000'
  );
  assert.equal(
    harvestRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1109')?.credit,
    '35000000.0000'
  );
  // Moving Avg: (250*22000 + 1750*20000) / 2000 = 20,250
  assert.equal(harvestRes.updatedProduct.stockQty, '2000.0000');
  assert.equal(harvestRes.updatedProduct.costPriceAvg, '20250.0000');
});

test('Multi-Branch 3-Step Transfer (REQUESTED -> IN_TRANSIT -> RECEIVED with damaged qty) & PO Landed Cost & Blind Opname', () => {
  const accounts = makeAccounts('t-mb');
  const stocks: BranchStock[] = [
    {
      id: 'bs-wh-1',
      tenantId: 't-mb',
      branchId: 'br-wh',
      productId: 'p-1',
      stockQty: '100.0000',
      minStockAlert: '10.0000',
      movingAvgCost: '50000.0000',
      updatedAt: '2026-04-01T00:00:00Z',
    },
    {
      id: 'bs-cab1-1',
      tenantId: 't-mb',
      branchId: 'br-cab1',
      productId: 'p-1',
      stockQty: '10.0000',
      minStockAlert: '15.0000',
      movingAvgCost: '60000.0000',
      updatedAt: '2026-04-01T00:00:00Z',
    },
  ];

  const reqTransfer: StockTransfer = {
    id: 'trf-1',
    tenantId: 't-mb',
    transferNumber: 'TRF-20260401-001',
    sourceBranchId: 'br-wh',
    destinationBranchId: 'br-cab1',
    status: 'REQUESTED',
    requestedBy: 'Admin Cabang',
    items: [
      {
        id: 'ti-1',
        productId: 'p-1',
        productNameSnapshot: 'Beras 5Kg',
        unit: 'karung',
        requestedQty: '20.0000',
        shippedQty: '0.0000',
        receivedQty: '0.0000',
        damagedQty: '0.0000',
        unitCostAtShip: '50000.0000',
      },
    ],
    createdAt: '2026-04-01T08:00:00Z',
  };

  // Step 2: Ship 20 units -> Gudang stock becomes 80, Goods in Transit (1108) = 1,000,000
  const shipped = shipStockTransfer({
    tenantId: 't-mb',
    transfer: reqTransfer,
    sourceBranchName: 'Gudang Pusat',
    destinationBranchName: 'Cabang Selatan',
    branchStocks: stocks,
    accounts,
    entrySeq: 1,
    shipDate: '2026-04-01',
  });
  assertJournalBalanced(shipped.journalEntry.lines);
  assert.equal(shipped.updatedTransfer.status, 'IN_TRANSIT');
  assert.equal(
    shipped.updatedBranchStocks.find((s) => s.branchId === 'br-wh')?.stockQty,
    '80.0000'
  );
  assert.equal(
    shipped.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1108')?.debit,
    '1000000.0000'
  );

  // Step 3: Receive 18 good + 2 damaged -> Cabang stock = 28, Damaged Expense 6108 = 100,000
  const received = receiveStockTransfer({
    tenantId: 't-mb',
    transfer: shipped.updatedTransfer,
    destinationBranchName: 'Cabang Selatan',
    receivedQuantities: { 'p-1': { receivedQty: '18', damagedQty: '2' } },
    branchStocks: shipped.updatedBranchStocks,
    accounts,
    entrySeq: 2,
    receiveDate: '2026-04-02',
  });
  assertJournalBalanced(received.journalEntry.lines);
  assert.equal(received.updatedTransfer.status, 'RECEIVED');
  assert.equal(
    received.updatedBranchStocks.find((s) => s.branchId === 'br-cab1')?.stockQty,
    '28.0000'
  );
  assert.equal(
    received.journalEntry.lines.find((l) => l.accountCodeSnapshot === '6108')?.debit,
    '100000.0000'
  );
  assert.equal(
    received.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1108')?.credit,
    '1000000.0000'
  );

  // Supplier PO with Landed Cost Shipping (100k shipping + 500k goods = 600k -> 60k/unit) + TEMPO_HUTANG
  const po: PurchaseOrder = {
    id: 'po-1',
    tenantId: 't-mb',
    branchId: 'br-wh',
    poNumber: 'PO-2026-001',
    supplierName: 'PT Distribusi Pangan',
    status: 'ORDERED',
    paymentType: 'TEMPO_HUTANG',
    dueDate: '2026-05-01',
    landedCostShipping: '100000.0000',
    totalEstimatedCost: '500000.0000',
    amountPaid: '0.0000',
    items: [
      {
        productId: 'p-1',
        productName: 'Beras 5Kg',
        unit: 'karung',
        orderedQty: '10.0000',
        unitCostEstimate: '50000.0000',
        lineTotal: '500000.0000',
      },
    ],
    createdAt: '2026-04-02T09:00:00Z',
  };
  const poRes = receivePurchaseOrderWithLandedCost({
    tenantId: 't-mb',
    po,
    branchId: 'br-wh',
    landedCostShipping: '100000',
    paymentType: 'TEMPO_HUTANG',
    paymentAccountCode: '1102',
    branchStocks: received.updatedBranchStocks,
    accounts,
    entrySeq: 3,
    receiveDate: '2026-04-02',
  });
  assertJournalBalanced(poRes.journalEntry.lines);
  assert.equal(poRes.updatedPo.status, 'RECEIVED');
  assert.equal(
    poRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '1105')?.debit,
    '600000.0000'
  );
  assert.equal(
    poRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '2101')?.credit,
    '600000.0000'
  );

  // Pay Supplier Debt
  const payRes = recordSupplierDebtPayment({
    tenantId: 't-mb',
    po: poRes.updatedPo,
    payAmount: '600000',
    paymentAccountCode: '1102',
    accounts,
    entrySeq: 4,
    payDate: '2026-04-15',
  });
  assertJournalBalanced(payRes.journalEntry.lines);
  assert.equal(payRes.updatedPo.amountPaid, '600000.0000');
  assert.equal(
    payRes.journalEntry.lines.find((l) => l.accountCodeSnapshot === '2101')?.debit,
    '600000.0000'
  );

  // Blind Stock Opname: Cabang Selatan has 28 units, physical count = 26 (-2 units shortage)
  const opnameSession: StockOpnameSession = {
    id: 'opn-1',
    tenantId: 't-mb',
    branchId: 'br-cab1',
    sessionNumber: 'SO-20260403-001',
    isBlindCount: true,
    status: 'IN_PROGRESS',
    createdBy: 'Staf SO',
    totalVarianceValue: '0.0000',
    items: [
      {
        id: 'oi-1',
        productId: 'p-1',
        productNameSnapshot: 'Beras 5Kg',
        unit: 'karung',
        systemQtySnapshot: '28.0000',
        physicalQty: '26.0000',
        varianceQty: '-2.0000',
        unitCostSnapshot: '53571.4286',
        varianceValue: '-107142.8572',
      },
    ],
    createdAt: '2026-04-03T10:00:00Z',
  };

  const opnameRes = approveStockOpnameSession({
    tenantId: 't-mb',
    session: opnameSession,
    branchName: 'Cabang Selatan',
    approvedBy: 'Owner',
    branchStocks: poRes.updatedBranchStocks,
    accounts,
    entrySeq: 5,
    approveDate: '2026-04-03',
  });
  assert.ok(opnameRes.journalEntry);
  assertJournalBalanced(opnameRes.journalEntry!.lines);
  assert.equal(opnameRes.updatedSession.status, 'APPROVED');
  assert.equal(
    opnameRes.updatedBranchStocks.find((s) => s.branchId === 'br-cab1')?.stockQty,
    '26.0000'
  );
  assert.equal(
    opnameRes.journalEntry!.lines.find((l) => l.accountCodeSnapshot === '6108')?.debit,
    '107142.8572'
  );
});

test('Advanced POS: Shift Reconciliation, 0-Token Anti-Fraud, 0-Token Upselling, Wholesale Tier, Promo & WA Receipt', () => {
  const accounts = makeAccounts('t-pos');
  const openShift: CashierShift = {
    id: 'sh-1',
    tenantId: 't-pos',
    branchId: 'br-1',
    cashierName: 'Rina',
    cashierEmail: 'rina@toko.id',
    status: 'OPEN',
    openedAt: '2026-04-01T08:00:00Z',
    openingCash: '500000.0000',
    expectedCash: '1500000.0000',
    nonCashTotal: '0.0000',
    cashVariance: '0.0000',
  };

  const closed = closeCashierShift({
    tenantId: 't-pos',
    shift: openShift,
    actualClosingCash: '1475000', // -25,000 shortage
    accounts,
    entrySeq: 1,
    closeDate: '2026-04-01',
  });
  assert.ok(closed.journalEntry);
  assertJournalBalanced(closed.journalEntry!.lines);
  assert.equal(closed.closedShift.cashVariance, '-25000.0000');
  assert.equal(
    closed.journalEntry!.lines.find((l) => l.accountCodeSnapshot === '6109')?.debit,
    '25000.0000'
  );

  // 0-Token Anti-Fraud Alert check: 2 voids out of 10 orders (20% > 5%) + 2 negative shifts
  const orders: Order[] = Array.from({ length: 10 }, (_, idx) => ({
    id: `ord-${idx + 1}`,
    tenantId: 't-pos',
    orderNumber: `INV-${idx + 1}`,
    orderSource: 'POS_CASHIER',
    tableId: null,
    paymentStatus: idx < 2 ? 'VOID' : 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: true,
    cashierEmail: 'rina@toko.id',
    customerName: 'Pelanggan Umum',
    subtotal: '50000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '50000.0000',
    totalCogs: '30000.0000',
    customAttributes: {},
    items: [
      {
        id: `oi-${idx}-1`,
        orderId: `ord-${idx + 1}`,
        productId: 'p-nasi',
        itemNameSnapshot: 'Nasi Goreng',
        qty: '1',
        unitPrice: '30000',
        unitCogs: '15000',
      },
      {
        id: `oi-${idx}-2`,
        orderId: `ord-${idx + 1}`,
        productId: 'p-teh',
        itemNameSnapshot: 'Es Teh Manis',
        qty: '1',
        unitPrice: '8000',
        unitCogs: '2000',
      },
    ],
    createdAt: '2026-04-01T12:00:00Z',
  }));
  const auditLogs: AuditLog[] = [
    {
      id: 'al-1',
      tenantId: 't-pos',
      actionType: 'VOID_ORDER',
      actorName: 'Rina',
      actorEmail: 'rina@toko.id',
      referenceId: 'ord-1',
      amount: '50000',
      reason: 'Salah input',
      createdAt: '2026-04-01T12:10:00Z',
    },
    {
      id: 'al-2',
      tenantId: 't-pos',
      actionType: 'VOID_ORDER',
      actorName: 'Rina',
      actorEmail: 'rina@toko.id',
      referenceId: 'ord-2',
      amount: '50000',
      reason: 'Batal pelanggan',
      createdAt: '2026-04-01T13:10:00Z',
    },
  ];
  const shifts: CashierShift[] = [
    closed.closedShift,
    { ...closed.closedShift, id: 'sh-2', cashVariance: '-30000.0000' },
  ];

  const alerts = detectAntiFraudAnomalies({ orders, shifts, auditLogs });
  assert.ok(alerts.some((a) => a.code === 'VOID_RATIO_HIGH'));
  assert.ok(alerts.some((a) => a.code === 'REPEATED_CASH_SHORTAGE'));

  // 0-Token Upselling ("Sering Dipesan Bersama")
  const prodNasi: Product = {
    id: 'p-nasi',
    tenantId: 't-pos',
    categoryId: null,
    sku: 'N1',
    barcodeQr: '',
    name: 'Nasi Goreng',
    description: '',
    itemType: 'MENU_ITEM',
    unit: 'porsi',
    sellingPrice: '30000',
    costPriceAvg: '15000',
    stockQty: '10',
    minStockAlert: '1',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-04-01T00:00:00Z',
  };
  const prodTeh: Product = {
    ...prodNasi,
    id: 'p-teh',
    sku: 'T1',
    name: 'Es Teh Manis',
    unit: 'gelas',
    sellingPrice: '8000',
    costPriceAvg: '2000',
  };
  const upsells = getFrequentlyBoughtTogether({
    cartProductIds: ['p-nasi'],
    orders,
    products: [prodNasi, prodTeh],
  });
  assert.equal(upsells.length, 1);
  assert.equal(upsells[0].product.id, 'p-teh');

  // Wholesale Price Tier
  const tiers: PriceTier[] = [
    { id: 'pt-1', tenantId: 't-pos', productId: 'p-nasi', minQty: '6', tierPrice: '27000', label: 'Grosir 6+' },
    { id: 'pt-2', tenantId: 't-pos', productId: 'p-nasi', minQty: '12', tierPrice: '25000', label: 'Karton 12+' },
  ];
  const resolved12 = resolveEffectiveUnitPrice({
    product: prodNasi,
    qty: '12',
    priceTiers: tiers,
  });
  assert.equal(resolved12.unitPrice, '25000.0000');
  assert.equal(resolved12.appliedTierLabel, 'Karton 12+');

  // Promo calculation
  const promo: Promotion = {
    id: 'pr-1',
    tenantId: 't-pos',
    code: 'WEEKEND10',
    name: 'Diskon 10% Akhir Pekan',
    promoType: 'PERCENT',
    discountValue: '10',
    minPurchase: '50000',
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
  };
  const disc = calculatePromotionDiscount({
    promo,
    subtotal: '60000',
    items: [{ qty: '2', unitPrice: '30000' }],
  });
  assert.equal(disc, '6000.0000');

  // WhatsApp Receipt URL
  const waReceipt = buildWhatsAppReceiptUrl({
    businessName: 'Warung Makmur Jaya',
    address: 'Jl. Raya Kemang No. 10',
    order: orders[3],
    receiptFooter: 'Terima kasih!',
    phoneWa: '0812-9999-8888',
  });
  assert.ok(waReceipt.startsWith('https://wa.me/6281299998888?text='));
});

test('Zero-Token Multi-Payment Auto-Verification (QRIS, GoPay, DANA, OVO, ShopeePay, VA, Bank Transfer)', () => {
  const methods = [
    'QRIS_DYNAMIC',
    'EWALLET_GOPAY',
    'EWALLET_DANA',
    'EWALLET_OVO',
    'EWALLET_SHOPEEPAY',
    'VIRTUAL_ACCOUNT',
    'BANK_TRANSFER',
  ] as const;

  for (const method of methods) {
    const challenge = createAutoPaymentChallenge({
      paymentMethod: method,
      amount: '150000.0000',
      referenceLabel: 'Test Toko',
    });
    assert.equal(challenge.status, 'WAITING_PAYMENT');
    assert.equal(challenge.verificationSource, 'WEBHOOK_CALLBACK_0_TOKEN');

    // Valid signature passes automatic verification
    const valid = verifyAutoPaymentCallback({
      sessionId: challenge.sessionId,
      paymentMethod: challenge.paymentMethod,
      amount: challenge.payableAmount,
      gatewayRefId: challenge.gatewayRefId,
      signature: challenge.signature,
    });
    assert.equal(valid.verified, true);

    // Tampered signature is strictly rejected
    const invalid = verifyAutoPaymentCallback({
      sessionId: challenge.sessionId,
      paymentMethod: challenge.paymentMethod,
      amount: challenge.payableAmount,
      gatewayRefId: challenge.gatewayRefId,
      signature: 'TAMPERED_SIG_0000',
    });
    assert.equal(invalid.verified, false);
  }

  // Verify Decimal MDR calculations (0.7% QRIS, 1.5% GoPay, 0% VA)
  assert.equal(
    calculateChannelMdr({ paymentMethod: 'QRIS_DYNAMIC', grossAmount: '100000' }).mdrFee,
    '700.0000'
  );
  assert.equal(
    calculateChannelMdr({ paymentMethod: 'EWALLET_GOPAY', grossAmount: '100000' }).mdrFee,
    '1500.0000'
  );
  assert.equal(
    calculateChannelMdr({ paymentMethod: 'VIRTUAL_ACCOUNT', grossAmount: '100000' }).mdrFee,
    '0.0000'
  );
});

test('New UMKM Vertical Demo Seeds (Barbershop & Salon + Toko Retail) have balanced double-entry journals', () => {
  const { workspace: barberWs } = createDemoBarbershopWorkspace();
  assert.equal(barberWs.tenant.vertical, 'BARBERSHOP_SALON');
  assert.ok(barberWs.products.length >= 4);
  assert.ok(barberWs.journalEntries.length >= 1);
  for (const je of barberWs.journalEntries) {
    assertJournalBalanced(je.lines);
  }

  const { workspace: retailWs } = createDemoTokoRetailWorkspace();
  assert.equal(retailWs.tenant.vertical, 'TOKO_RETAIL');
  assert.ok((retailWs.branches ?? []).length >= 2);
  assert.ok(retailWs.products.length >= 4);
  assert.ok(retailWs.journalEntries.length >= 1);
  for (const je of retailWs.journalEntries) {
    assertJournalBalanced(je.lines);
  }
});

test('WhatsApp Fonnte Add-On (ADDON_WA_FONNTE) is Rp66.000/bln strictly modular & excluded from core tiers', () => {
  const fonnteAddon = ADDON_DEFINITIONS.find((a) => a.code === 'ADDON_WA_FONNTE');
  assert.ok(fonnteAddon, 'ADDON_WA_FONNTE must exist in ADDON_DEFINITIONS');
  assert.equal(fonnteAddon.monthlyPrice, '66000.0000');
  assert.deepEqual(fonnteAddon.includedInPlans, []);

  // Not included by default in BASIC, PRO, or EXPERT
  assert.equal(tenantHasAddOn({ subscriptionPlan: 'BASIC', activeAddOns: [] }, 'ADDON_WA_FONNTE'), false);
  assert.equal(tenantHasAddOn({ subscriptionPlan: 'PRO', activeAddOns: [] }, 'ADDON_WA_FONNTE'), false);
  assert.equal(tenantHasAddOn({ subscriptionPlan: 'EXPERT', activeAddOns: [] }, 'ADDON_WA_FONNTE'), false);

  // Active only when explicitly added
  assert.equal(
    tenantHasAddOn({ subscriptionPlan: 'BASIC', activeAddOns: ['ADDON_WA_FONNTE'] }, 'ADDON_WA_FONNTE'),
    true
  );

  // Exact Decimal billing calculation: BASIC (100,000) + Fonnte (66,000) = 166,000 subtotal
  const quote = calculateHybridPricing({
    planCode: 'BASIC',
    selectedAddOns: ['ADDON_WA_FONNTE'],
    billingCycle: 'MONTHLY',
  });
  assert.equal(quote.basePlanMonthly, '100000.0000');
  assert.equal(quote.paidAddOnsMonthly, '66000.0000');
  assert.equal(quote.effectiveMonthlySubtotal, '166000.0000');
  assert.ok(new Decimal(quote.grandTotal).gt(new Decimal('166000')));
});

test('jsPDF Real PDF Generators produce valid %PDF- documents for PO and Stock Transfer Surat Jalan', () => {
  const po: PurchaseOrder = {
    id: 'po-pdf-1',
    tenantId: 't-pdf',
    branchId: 'br-1',
    poNumber: 'PO-20260410-001',
    supplierName: 'PT Sumber Pangan Nusantara',
    status: 'ORDERED',
    paymentType: 'TEMPO_HUTANG',
    dueDate: '2026-05-10',
    orderDate: '2026-04-10',
    landedCostShipping: '75000.0000',
    totalEstimatedCost: '1250000.0000',
    amountPaid: '0.0000',
    notes: 'Mohon kirim ke Gudang Utama sebelum jam 15:00.',
    items: [
      {
        productId: 'p-1',
        productName: 'Beras Pandan Wangi 5Kg',
        unit: 'karung',
        orderedQty: '25.0000',
        unitCostEstimate: '50000.0000',
        lineTotal: '1250000.0000',
      },
    ],
    createdAt: '2026-04-10T09:00:00Z',
  };

  const poDoc = buildPurchaseOrderPdfDocument({
    po,
    tenant: {
      name: 'Warung Makmur Sentosa',
      address: 'Jl. Merdeka No. 45, Jakarta Selatan',
      npwp16: '3174012345670001',
    },
    branchName: 'Gudang Pusat',
  });
  const poBytes = new Uint8Array(poDoc.output('arraybuffer'));
  const poHeader = String.fromCharCode(...poBytes.slice(0, 5));
  assert.equal(poHeader, '%PDF-');
  assert.ok(poBytes.length > 1000, 'PO PDF output should be non-trivial');

  const transfer: StockTransfer = {
    id: 'trf-pdf-1',
    tenantId: 't-pdf',
    transferNumber: 'TRF-20260410-009',
    sourceBranchId: 'br-wh',
    destinationBranchId: 'br-cab1',
    status: 'IN_TRANSIT',
    requestedBy: 'Budi',
    items: [
      {
        id: 'ti-1',
        productId: 'p-1',
        productNameSnapshot: 'Minyak Goreng 2L',
        unit: 'pouch',
        requestedQty: '40.0000',
        shippedQty: '40.0000',
        receivedQty: '0.0000',
        damagedQty: '0.0000',
        unitCostAtShip: '32000.0000',
      },
    ],
    createdAt: '2026-04-10T10:00:00Z',
  };

  const trfDoc = buildStockTransferPdfDocument({
    transfer,
    tenant: { name: 'Warung Makmur Sentosa', address: 'Jl. Merdeka No. 45' },
    sourceBranchName: 'Gudang Pusat',
    destBranchName: 'Cabang Kemang',
  });
  const trfBytes = new Uint8Array(trfDoc.output('arraybuffer'));
  const trfHeader = String.fromCharCode(...trfBytes.slice(0, 5));
  assert.equal(trfHeader, '%PDF-');
  assert.ok(trfBytes.length > 1000, 'Transfer PDF output should be non-trivial');
});

test('PostgreSQL (Supabase/Neon) & Storage (R2/Supabase) Migration Validators, Pre-flight Audit & Idempotent SQL Dump', () => {
  // Valid Supabase & Neon URIs
  const supaCheck = validatePostgresConnectionUri(
    'postgresql://postgres.abcd:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require'
  );
  assert.equal(supaCheck.valid, true);
  assert.equal(supaCheck.providerDetected, 'SUPABASE_POSTGRES');
  assert.equal(supaCheck.sslRequired, true);
  assert.equal(supaCheck.poolerDetected, true);

  const neonCheck = validatePostgresConnectionUri(
    'postgresql://neondb_owner:secret@ep-calm-pond-1234.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
  );
  assert.equal(neonCheck.valid, true);
  assert.equal(neonCheck.providerDetected, 'NEON_POSTGRES');

  // Invalid URIs rejected
  assert.equal(validatePostgresConnectionUri('https://example.com').valid, false);
  assert.equal(validatePostgresConnectionUri('').valid, false);

  // Storage validation
  const r2Check = validateStorageTargetConfig({
    provider: 'CLOUDFLARE_R2',
    endpointUrl: 'https://abc123.r2.cloudflarestorage.com',
    bucketName: 'kasirakun-assets',
  });
  assert.equal(r2Check.valid, true);

  const badBucket = validateStorageTargetConfig({
    provider: 'SUPABASE_STORAGE',
    endpointUrl: 'https://xyz.supabase.co',
    bucketName: 'INVALID_BUCKET!',
  });
  assert.equal(badBucket.valid, false);

  // Pre-flight audit & SQL generation on real demo workspaces
  const { workspace: barberWs } = createDemoBarbershopWorkspace();
  const { workspace: retailWs } = createDemoTokoRetailWorkspace();
  const audit = runMigrationPreflightAudit([], [barberWs, retailWs]);
  assert.equal(audit.allDoubleEntryBalanced, true);
  assert.equal(audit.unbalancedJournalsCount, 0);
  assert.ok(audit.totalJournalEntries >= 2);

  const sql = buildPostgresMigrationSql({
    targetProvider: 'SUPABASE_POSTGRES',
    customers: [],
    workspaces: [barberWs, retailWs],
  });
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS kasirakun_journal_lines'));
  assert.ok(sql.includes('NUMERIC(19, 4)'));
  assert.ok(sql.includes('JSONB'));
  assert.ok(sql.includes('ON CONFLICT (id) DO NOTHING'));

  const envSnippet = buildProductionEnvSnippet(DEFAULT_INFRA_MIGRATION_CONFIG);
  assert.ok(envSnippet.includes('DATABASE_URL='));
  assert.ok(envSnippet.includes('FONNTE_TOKEN='));
});

test('enforceWorkspacePlanEntitlements strictly restricts BASIC and non-ADDON_EXTRA_BRANCH workspaces to 1 branch', async () => {
  const { enforceWorkspacePlanEntitlements } = await import('./saas/hybrid-pricing');
  const { workspace: retailWs } = createDemoTokoRetailWorkspace();
  const seededBranches = retailWs.branches ?? [];
  assert.ok(seededBranches.length >= 2, 'Seeded retail workspace starts with multiple branches');

  // Downgrade to BASIC with zero add-ons -> strictly 1 location, 0 transfers
  const basicWs = enforceWorkspacePlanEntitlements({
    ...retailWs,
    tenant: {
      ...retailWs.tenant,
      subscriptionPlan: 'BASIC',
      activeAddOns: [],
      activeModules: (retailWs.tenant.activeModules ?? []).filter((m) => m !== 'MULTI_BRANCH'),
    },
  });
  const basicBranches = basicWs.branches ?? [];
  const basicTransfers = basicWs.stockTransfers ?? [];
  const basicBranchStocks = basicWs.branchStocks ?? [];

  assert.equal(basicBranches.length, 1, 'BASIC workspace must have strictly 1 branch');
  assert.equal(basicBranches[0].isDefault, true);
  assert.equal(basicTransfers.length, 0, 'BASIC workspace must have no inter-branch transfers');
  const onlyBranchId = basicBranches[0].id;
  assert.ok(
    basicBranchStocks.every((bs) => bs.branchId === onlyBranchId),
    'All branchStocks must belong strictly to the single active branch'
  );

  // Enabling ADDON_EXTRA_BRANCH preserves all multi-branch records
  const multiWs = enforceWorkspacePlanEntitlements({
    ...retailWs,
    tenant: {
      ...retailWs.tenant,
      subscriptionPlan: 'PRO',
      activeAddOns: ['ADDON_EXTRA_BRANCH'],
    },
  });
  assert.equal(
    (multiWs.branches ?? []).length,
    seededBranches.length,
    'Workspace with ADDON_EXTRA_BRANCH keeps all branches'
  );
});


