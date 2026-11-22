import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  buildPurchaseOrder,
  computeStockForecastReport,
} from './stock-forecasting';
import type { Order, Product } from '../../types/domain';

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p-1',
    tenantId: 't-1',
    categoryId: 'cat-1',
    sku: 'SKU-001',
    barcodeQr: '8990001',
    name: 'Minyak Goreng Bimoli 2 L',
    description: 'Minyak goreng',
    itemType: 'RETAIL_GOODS',
    unit: 'pouch',
    sellingPrice: '38500.0000',
    costPriceAvg: '33000.0000',
    stockQty: '4.0000',
    minStockAlert: '8.0000',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: 'ord-1',
    tenantId: 't-1',
    orderNumber: 'INV-001',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Pelanggan',
    subtotal: '77000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '77000.0000',
    totalCogs: '66000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: true,
    items: [],
    customAttributes: {},
    createdAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

test('computeStockForecastReport calculates velocity, days of cover, and urgent restock qty without AI tokens', () => {
  const products: Product[] = [
    makeProduct({ id: 'p-fast', name: 'Minyak Goreng 2L', stockQty: '4.0000', minStockAlert: '8.0000', costPriceAvg: '33000.0000' }),
    makeProduct({ id: 'p-healthy', name: 'Gula Pasir 1kg', stockQty: '80.0000', minStockAlert: '10.0000', costPriceAvg: '15000.0000' }),
  ];

  const orders: Order[] = [
    makeOrder({
      id: 'o-1',
      createdAt: '2026-11-17T08:00:00.000Z',
      items: [
        {
          id: 'oi-1',
          orderId: 'o-1',
          productId: 'p-fast',
          itemNameSnapshot: 'Minyak Goreng 2L',
          qty: '14.0000',
          unitPrice: '38500.0000',
          unitCogs: '33000.0000',
        },
      ],
    }),
    makeOrder({
      id: 'o-2',
      createdAt: '2026-11-10T08:00:00.000Z',
      items: [
        {
          id: 'oi-2',
          orderId: 'o-2',
          productId: 'p-fast',
          itemNameSnapshot: 'Minyak Goreng 2L',
          qty: '7.0000',
          unitPrice: '38500.0000',
          unitCogs: '33000.0000',
        },
        {
          id: 'oi-3',
          orderId: 'o-2',
          productId: 'p-healthy',
          itemNameSnapshot: 'Gula Pasir 1kg',
          qty: '2.0000',
          unitPrice: '18500.0000',
          unitCogs: '15000.0000',
        },
      ],
    }),
  ];

  const report = computeStockForecastReport({
    products,
    orders,
    inventoryMovements: [],
    config: {
      lookbackDays: 14,
      leadTimeDays: 3,
      targetCoverDays: 14,
      referenceDateIso: '2026-11-18T12:00:00.000Z',
    },
  });

  assert.equal(report.counts.totalTracked, 2);
  assert.equal(report.counts.urgent, 1);
  assert.equal(report.counts.healthy, 1);

  const fastRec = report.recommendations[0];
  assert.equal(fastRec.product.id, 'p-fast');
  assert.equal(fastRec.urgency, 'URGENT');
  assert.equal(fastRec.velocitySource, 'SALES_HISTORY');
  // 14 sold in last 7d -> 2/day (60% = 1.2), 21 sold in 14d -> 1.5/day (40% = 0.6) => 1.8000/day
  assert.equal(fastRec.dailyVelocity, '1.8000');
  // 4 / 1.8 = 2.2 days of cover
  assert.equal(fastRec.daysOfCover, 2.2);
  assert.ok(new Decimal(fastRec.recommendedOrderQty).gt(20));
});

test('buildPurchaseOrder computes exact Decimal.js line and grand totals and rejects empty drafts', () => {
  assert.throws(() =>
    buildPurchaseOrder({
      tenantId: 't-1',
      poSeq: 1,
      supplierName: 'Agen Makmur',
      items: [],
    })
  );

  const po = buildPurchaseOrder({
    tenantId: 't-1',
    poSeq: 3,
    supplierName: 'Agen Sembako Jaya',
    orderDate: '2026-11-18',
    items: [
      {
        productId: 'p-1',
        productName: 'Minyak Goreng 2L',
        sku: 'SMB-002',
        unit: 'pouch',
        orderedQty: '20',
        unitCostEstimate: '33200',
      },
      {
        productId: 'p-2',
        productName: 'Beras 5kg',
        sku: 'SMB-001',
        unit: 'karung',
        orderedQty: '10',
        unitCostEstimate: '64500',
      },
    ],
  });

  assert.equal(po.poNumber, 'PO-20261118-0003');
  assert.equal(po.status, 'DRAFT');
  assert.equal(po.items.length, 2);
  // 20 * 33200 = 664000; 10 * 64500 = 645000; sum = 1309000
  assert.equal(po.totalEstimatedCost, '1309000.0000');
});
