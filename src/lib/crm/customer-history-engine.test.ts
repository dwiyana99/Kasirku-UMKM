import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomerSummaries,
  getCustomerTransactionSummary,
  getCrmVerticalCopy,
  normalizeWhatsAppUrl,
} from './customer-history-engine';
import {
  buildTier1ReceiptText,
  computeTier1PeriodReport,
} from '../accounting/tier1-period-report';
import type { CrmCustomer, Order } from '../../types/domain';

const sampleCustomer: CrmCustomer = {
  id: 'crm-1',
  tenantId: 't-1',
  name: 'Ibu Sari',
  phoneWa: '0812-3456-7890',
  totalSpend: '100000.0000',
  totalSpent: '100000.0000',
  loyaltyPoints: 0,
  receivableBalance: '0.0000',
  notes: 'Langganan beras 5kg',
  createdAt: '2026-11-01T08:00:00.000Z',
};

const sampleOrders: Order[] = [
  {
    id: 'ord-1',
    tenantId: 't-1',
    orderNumber: 'INV-001',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Ibu Sari',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    customAttributes: {},
    subtotal: '150000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    taxType: 'NONE',
    grandTotal: '150000.0000',
    totalCogs: '120000.0000',
    createdAt: '2026-11-21T09:00:00.000Z',
    items: [
      {
        id: 'oi-1',
        orderId: 'ord-1',
        productId: 'p-1',
        itemNameSnapshot: 'Beras Rojolele 5kg',
        qty: '2.0000',
        unitPrice: '75000.0000',
        unitCogs: '60000.0000',
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
      paidAt: '2026-11-21T09:00:00.000Z',
    },
  },
  {
    id: 'ord-2',
    tenantId: 't-1',
    orderNumber: 'INV-002',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'ibu   sari ',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    customAttributes: {},
    subtotal: '50000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    taxType: 'NONE',
    grandTotal: '50000.0000',
    totalCogs: '40000.0000',
    createdAt: '2026-11-20T09:00:00.000Z',
    items: [],
    payment: {
      id: 'pay-2',
      tenantId: 't-1',
      orderId: 'ord-2',
      paymentMethod: 'CASH',
      amountPaid: '50000.0000',
      mdrFee: '0.0000',
      gatewayRefId: null,
      paidAt: '2026-11-20T09:00:00.000Z',
    },
  },
  {
    id: 'ord-void',
    tenantId: 't-1',
    orderNumber: 'INV-VOID',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Ibu Sari',
    paymentStatus: 'VOID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    customAttributes: {},
    subtotal: '999000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    taxType: 'NONE',
    grandTotal: '999000.0000',
    totalCogs: '0.0000',
    createdAt: '2026-11-19T09:00:00.000Z',
    items: [],
  },
];

test('getCustomerTransactionSummary matches paid orders case-insensitively and ignores VOID', () => {
  const summary = getCustomerTransactionSummary(sampleCustomer, sampleOrders);
  assert.equal(summary.orderCount, 2);
  assert.equal(summary.liveTotalSpend, '200000.0000');
  assert.equal(summary.lastOrderAt, '2026-11-21T09:00:00.000Z');
});

test('buildCustomerSummaries filters by phone or name accurately', () => {
  const res = buildCustomerSummaries([sampleCustomer], sampleOrders, '3456');
  assert.equal(res.length, 1);
  assert.equal(res[0].customer.name, 'Ibu Sari');
  assert.equal(buildCustomerSummaries([sampleCustomer], sampleOrders, 'tidak-ada').length, 0);
});

test('normalizeWhatsAppUrl formats Indonesian 08xx numbers to 628xx', () => {
  const url = normalizeWhatsAppUrl('0812-3456-7890', 'Halo Ibu Sari');
  assert.ok(url?.startsWith('https://wa.me/6281234567890?text='));
  assert.equal(normalizeWhatsAppUrl(''), null);
});

test('getCrmVerticalCopy adapts copy for Freelance, Kost, Agro, and Warung', () => {
  assert.equal(getCrmVerticalCopy('FREELANCE').sidebarLabelLite, 'Kontak Klien');
  assert.equal(getCrmVerticalCopy('KOST_KONTRAKAN').sidebarLabelLite, 'Kontak Penghuni');
  assert.equal(getCrmVerticalCopy('WARUNG_SEMBAKO').sidebarLabelLite, 'Kontak Pelanggan');
});

test('buildTier1ReceiptText produces clean monospace receipt summary without double-entry jargon', () => {
  const report = computeTier1PeriodReport({
    orders: sampleOrders,
    expenses: [],
    products: [],
    period: 'MONTHLY',
    referenceDate: new Date('2026-11-21T10:00:00.000Z'),
  });
  const receipt58 = buildTier1ReceiptText({
    tenantName: 'Warung Makmur Jaya',
    report,
    paperWidth: '58mm',
    printedAt: new Date('2026-11-21T10:00:00.000Z'),
  });
  assert.ok(receipt58.includes('WARUNG MAKMUR JAYA'));
  assert.ok(receipt58.includes('UNTUNG BERSIH'));
  assert.ok(receipt58.includes('Rp40.000'));
  assert.equal(/debit|kredit|jurnal/i.test(receipt58), false);
});
