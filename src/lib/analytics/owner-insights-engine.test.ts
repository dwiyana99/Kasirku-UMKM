import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { computeTier1PeriodReport } from '../accounting/tier1-period-report';
import {
  computeBulkRepricingPreview,
  computeDailyClosingSummary,
  computeDueReminders,
  computeProductPerformanceSummary,
} from './owner-insights-engine';
import type {
  Category,
  OperationalExpense,
  Order,
  Product,
  TenantWorkspaceData,
} from '../../types/domain';

const sampleCategories: Category[] = [
  { id: 'cat-1', tenantId: 't-1', name: 'Sembako', sortOrder: 1 },
  { id: 'cat-2', tenantId: 't-1', name: 'Minuman', sortOrder: 2 },
];

const sampleProducts: Product[] = [
  {
    id: 'p-beras',
    tenantId: 't-1',
    categoryId: 'cat-1',
    sku: 'BRS-5KG',
    barcodeQr: '8990001',
    name: 'Beras Pandan Wangi 5 Kg',
    description: '',
    itemType: 'RETAIL_GOODS',
    unit: 'sak',
    sellingPrice: '75000.0000',
    costPriceAvg: '62000.0000',
    stockQty: '12.0000',
    minStockAlert: '5.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p-minyak',
    tenantId: 't-1',
    categoryId: 'cat-1',
    sku: 'MYK-2L',
    barcodeQr: '8990002',
    name: 'Minyak Goreng 2 L',
    description: '',
    itemType: 'RETAIL_GOODS',
    unit: 'pouch',
    sellingPrice: '36000.0000',
    costPriceAvg: '31000.0000',
    stockQty: '20.0000',
    minStockAlert: '5.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p-teh',
    tenantId: 't-1',
    categoryId: 'cat-2',
    sku: 'TEH-BOX',
    barcodeQr: '8990003',
    name: 'Teh Celup Melati',
    description: '',
    itemType: 'RETAIL_GOODS',
    unit: 'box',
    sellingPrice: '10000.0000',
    costPriceAvg: '7500.0000',
    stockQty: '30.0000',
    minStockAlert: '5.0000',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const sampleOrders: Order[] = [
  {
    id: 'ord-1',
    tenantId: 't-1',
    orderNumber: 'INV-001',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Ibu Sari',
    subtotal: '150000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '150000.0000',
    totalCogs: '124000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    items: [
      {
        id: 'oi-1',
        orderId: 'ord-1',
        productId: 'p-beras',
        itemNameSnapshot: 'Beras Pandan Wangi 5 Kg',
        qty: '2.0000',
        unitPrice: '75000.0000',
        unitCogs: '62000.0000',
      },
    ],
    payment: {
      id: 'pay-1',
      tenantId: 't-1',
      orderId: 'ord-1',
      paymentMethod: 'CASH',
      amountPaid: '150000.0000',
      mdrFee: '0.0000',
      gatewayRefId: null,
      paidAt: '2026-05-15T09:00:00.000Z',
    },
    customAttributes: {},
    createdAt: '2026-05-15T09:00:00.000Z',
  },
  {
    id: 'ord-2',
    tenantId: 't-1',
    orderNumber: 'INV-002',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Pak Budi',
    subtotal: '180000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '180000.0000',
    totalCogs: '155000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    items: [
      {
        id: 'oi-2',
        orderId: 'ord-2',
        productId: 'p-minyak',
        itemNameSnapshot: 'Minyak Goreng 2 L',
        qty: '5.0000',
        unitPrice: '36000.0000',
        unitCogs: '31000.0000',
      },
    ],
    payment: {
      id: 'pay-2',
      tenantId: 't-1',
      orderId: 'ord-2',
      paymentMethod: 'QRIS_DYNAMIC',
      amountPaid: '180000.0000',
      mdrFee: '1260.0000',
      gatewayRefId: 'QR-2',
      paidAt: '2026-05-10T10:00:00.000Z',
    },
    customAttributes: {},
    createdAt: '2026-05-10T10:00:00.000Z',
  },
  {
    id: 'ord-3',
    tenantId: 't-1',
    orderNumber: 'INV-003',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Toko Tetangga',
    subtotal: '75000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '75000.0000',
    totalCogs: '62000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    items: [
      {
        id: 'oi-3',
        orderId: 'ord-3',
        productId: 'p-beras',
        itemNameSnapshot: 'Beras Pandan Wangi 5 Kg',
        qty: '1.0000',
        unitPrice: '75000.0000',
        unitCogs: '62000.0000',
      },
    ],
    payment: {
      id: 'pay-3',
      tenantId: 't-1',
      orderId: 'ord-3',
      paymentMethod: 'CASH',
      amountPaid: '75000.0000',
      mdrFee: '0.0000',
      gatewayRefId: null,
      paidAt: '2026-02-05T10:00:00.000Z',
    },
    customAttributes: {},
    createdAt: '2026-02-05T10:00:00.000Z',
  },
];

const sampleExpenses: OperationalExpense[] = [
  {
    id: 'exp-1',
    tenantId: 't-1',
    expenseAccountId: 'acc-listrik',
    expenseAccountCode: '5202',
    paymentAccountId: 'acc-kas',
    expenseDate: '2026-05-15',
    description: 'Token Listrik Warung',
    amount: '15000.0000',
    withholdingTaxType: 'NONE',
    withholdingTaxAmount: '0.0000',
    customAttributes: {},
    createdAt: '2026-05-15T12:00:00.000Z',
  },
];

test('Tier-1 Period Report accurately filters DAILY, WEEKLY, MONTHLY, QUARTERLY, and YTD', () => {
  const ref = new Date('2026-05-15T15:00:00.000Z');

  const daily = computeTier1PeriodReport({
    orders: sampleOrders,
    expenses: sampleExpenses,
    products: sampleProducts,
    period: 'DAILY',
    referenceDate: ref,
  });
  assert.equal(daily.orderCount, 1);
  assert.equal(new Decimal(daily.netSales).toNumber(), 150000);
  assert.equal(new Decimal(daily.totalHpp).toNumber(), 124000);
  assert.equal(new Decimal(daily.totalExpenses).toNumber(), 15000);
  assert.equal(new Decimal(daily.netProfit).toNumber(), 11000);

  const weekly = computeTier1PeriodReport({
    orders: sampleOrders,
    expenses: sampleExpenses,
    products: sampleProducts,
    period: 'WEEKLY',
    referenceDate: ref,
  });
  // May 15 and May 10 are within 7 days (May 9..May 15)
  assert.equal(weekly.orderCount, 2);
  assert.equal(new Decimal(weekly.netSales).toNumber(), 330000);
  assert.equal(new Decimal(weekly.cashSales).toNumber(), 150000);
  assert.equal(new Decimal(weekly.nonCashSales).toNumber(), 180000);

  const quarterly = computeTier1PeriodReport({
    orders: sampleOrders,
    expenses: sampleExpenses,
    products: sampleProducts,
    period: 'QUARTERLY',
    referenceDate: ref,
  });
  // Q2 (Apr-Jun) excludes Feb 5
  assert.equal(quarterly.orderCount, 2);

  const ytd = computeTier1PeriodReport({
    orders: sampleOrders,
    expenses: sampleExpenses,
    products: sampleProducts,
    period: 'YTD',
    referenceDate: ref,
  });
  // YTD includes Feb 5 + May 10 + May 15
  assert.equal(ytd.orderCount, 3);
  assert.equal(new Decimal(ytd.netSales).toNumber(), 405000);
});

test('Product Performance Summary ranks top selling, most profitable, and dead stock', () => {
  const perf = computeProductPerformanceSummary(sampleProducts, sampleOrders);
  // Minyak sold 5 pouch vs Beras sold 3 sak
  assert.equal(perf.topSelling[0].productId, 'p-minyak');
  // Beras gross profit = 3 * 13,000 = 39,000 vs Minyak = 5 * 5,000 = 25,000
  assert.equal(perf.topProfitable[0].productId, 'p-beras');
  // Teh Celup has stock 30 & 0 sales -> slowMoving
  assert.equal(perf.slowMoving.length, 1);
  assert.equal(perf.slowMoving[0].productId, 'p-teh');
});

test('Daily Closing Summary computes drawer cash variance and formatted WhatsApp recap', () => {
  const closing = computeDailyClosingSummary({
    tenantName: 'Warung Berkah',
    orders: sampleOrders,
    expenses: sampleExpenses,
    openingCash: 100000,
    actualCashCounted: 230000, // expected = 100,000 + 150,000 - 15,000 = 235,000 -> shortage -5,000
    referenceDate: new Date('2026-05-15T18:00:00.000Z'),
  });

  assert.equal(new Decimal(closing.expectedCashInDrawer).toNumber(), 235000);
  assert.equal(new Decimal(closing.cashVariance).toNumber(), -5000);
  assert.equal(closing.varianceStatus, 'SHORTAGE');
  assert.ok(closing.whatsappMessage.includes('Warung Berkah'));
  assert.ok(closing.whatsappMessage.includes('KURANG Rp5.000'));
});

test('Due Reminders strictly respect plan add-ons (no PO or CRM reminders on LITE)', () => {
  const baseWorkspace = {
    tenant: {
      id: 't-1',
      name: 'Warung LITE',
      vertical: 'WARUNG_SEMBAKO',
      subscriptionPlan: 'LITE',
      activeAddOns: [],
      activeModules: ['POS_BASIC'],
    },
    purchaseOrders: [
      {
        id: 'po-1',
        tenantId: 't-1',
        poNumber: 'PO-001',
        supplierName: 'Agen',
        paymentType: 'TEMPO_HUTANG',
        status: 'RECEIVED',
        totalEstimatedCost: '500000.0000',
        amountPaid: '0.0000',
        items: [],
        createdAt: '2026-05-01T00:00:00Z',
      },
    ],
    crmCustomers: [
      {
        id: 'c-1',
        tenantId: 't-1',
        name: 'Pak Joko',
        phoneWa: '08123',
        loyaltyPoints: 0,
        receivableBalance: '80000.0000',
        createdAt: '2026-05-01T00:00:00Z',
      },
    ],
  } as unknown as TenantWorkspaceData;

  assert.equal(computeDueReminders(baseWorkspace).length, 0);

  const proWorkspace = {
    ...baseWorkspace,
    tenant: {
      ...baseWorkspace.tenant,
      subscriptionPlan: 'PRO' as const,
    },
  } as unknown as TenantWorkspaceData;

  const proReminders = computeDueReminders(proWorkspace);
  assert.equal(proReminders.length, 2);
  assert.ok(proReminders.some((r) => r.kind === 'KASBON'));
  assert.ok(proReminders.some((r) => r.kind === 'PO_SUPPLIER'));
});

test('Bulk Repricing Preview computes category-filtered markup from HPP with rounding', () => {
  const preview = computeBulkRepricingPreview(sampleProducts, sampleCategories, {
    categoryIdFilter: 'cat-1',
    mode: 'MARKUP_FROM_HPP',
    value: 25,
    roundingStep: 500,
  });

  assert.equal(preview.length, 2); // Only Sembako category
  // Beras HPP 62,000 * 1.25 = 77,500
  assert.equal(new Decimal(preview[0].newPrice).toNumber(), 77500);
  // Minyak HPP 31,000 * 1.25 = 38,750 -> ceil to 500 = 39,000
  assert.equal(new Decimal(preview[1].newPrice).toNumber(), 39000);
});
