import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  buildSalesReturnExecution,
  getRemainingReturnableQtyMap,
  verticalSupportsSalesReturns,
} from './sales-return-engine';
import type { Account, Order } from '../../types/domain';

const TEST_ACCOUNTS: Account[] = [
  { id: 'a1', tenantId: 't1', code: '1101', name: 'Kas Tunai', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { id: 'a2', tenantId: 't1', code: '1102', name: 'Bank', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { id: 'a3', tenantId: 't1', code: '1105', name: 'Persediaan Barang', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
  { id: 'a4', tenantId: 't1', code: '2102', name: 'Utang PPN Keluaran', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { id: 'a5', tenantId: 't1', code: '2103', name: 'Utang PB1 Daerah', category: 'LIABILITY', normalBalance: 'CREDIT', isSystemLocked: true },
  { id: 'a6', tenantId: 't1', code: '4101', name: 'Pendapatan Penjualan', category: 'REVENUE', normalBalance: 'CREDIT', isSystemLocked: true },
  { id: 'a7', tenantId: 't1', code: '5101', name: 'HPP', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
];

const SAMPLE_ORDER: Order = {
  id: 'ord-1',
  tenantId: 't1',
  orderNumber: 'POS-2026-001',
  orderSource: 'POS_CASHIER',
  tableId: null,
  customerName: 'Ibu Sari',
  subtotal: '100000.0000',
  discountAmount: '0.0000',
  serviceCharge: '0.0000',
  taxType: 'PPN_11_12',
  dppNilaiLain: '91666.6667',
  taxAmount: '11000.0000',
  grandTotal: '111000.0000',
  totalCogs: '70000.0000',
  paymentStatus: 'PAID',
  kitchenStatus: 'SERVED',
  isReceiptPrinted: true,
  items: [
    {
      id: 'oi-1',
      orderId: 'ord-1',
      productId: 'p-beras',
      itemNameSnapshot: 'Beras Premium 5kg',
      qty: '2.0000',
      unitPrice: '50000.0000',
      unitCogs: '35000.0000',
    },
  ],
  customAttributes: {},
  createdAt: '2026-11-20T09:00:00.000Z',
};

test('verticalSupportsSalesReturns gates physical goods vs pure services/rentals', () => {
  assert.equal(verticalSupportsSalesReturns('WARUNG_SEMBAKO'), true);
  assert.equal(verticalSupportsSalesReturns('TOKO_BANGUNAN'), true);
  assert.equal(verticalSupportsSalesReturns('RENTAL_KENDARAAN'), false);
  assert.equal(verticalSupportsSalesReturns('KOST_KONTRAKAN'), false);
  assert.equal(verticalSupportsSalesReturns('FREELANCE'), false);
});

test('partial sales return with restock creates balanced journal, reverses proportional tax, and restores stock', () => {
  const result = buildSalesReturnExecution({
    tenantId: 't1',
    order: SAMPLE_ORDER,
    existingReturnsForOrder: [],
    lines: [{ productId: 'p-beras', qtyToReturn: '1', restockToWarehouse: true }],
    reason: 'SALAH_BARANG_UKURAN',
    refundAccountCode: '1101',
    accounts: TEST_ACCOUNTS,
    processedByName: 'Kasir Utama',
  });

  assert.equal(result.ok, true);
  assert.ok(result.returnRecord);
  assert.ok(result.journalEntry);
  assert.equal(result.returnRecord.subtotalRefund, '50000.0000');
  assert.equal(result.returnRecord.taxReversed, '5500.0000');
  assert.equal(result.returnRecord.totalRefundAmount, '55500.0000');
  assert.equal(result.returnRecord.totalCogsRestored, '35000.0000');

  assert.equal(result.stockDeltas?.length, 1);
  assert.equal(result.stockDeltas?.[0].qtyAdded, '1.0000');
  assert.equal(result.inventoryMovements?.[0].movementType, 'RETURN_IN');

  // Verify double-entry sum(debit) === sum(credit)
  const totalDr = result.journalEntry.lines.reduce(
    (s, l) => s.plus(new Decimal(l.debit)),
    new Decimal(0)
  );
  const totalCr = result.journalEntry.lines.reduce(
    (s, l) => s.plus(new Decimal(l.credit)),
    new Decimal(0)
  );
  assert.equal(totalDr.toFixed(4), totalCr.toFixed(4));
  assert.equal(totalDr.toFixed(4), '90500.0000'); // 55500 refund + 35000 HPP restore
});

test('damaged return without restock skips inventory movement and HPP reversal', () => {
  const result = buildSalesReturnExecution({
    tenantId: 't1',
    order: SAMPLE_ORDER,
    existingReturnsForOrder: [],
    lines: [{ productId: 'p-beras', qtyToReturn: '1', restockToWarehouse: false }],
    reason: 'BARANG_RUSAK',
    refundAccountCode: '1102',
    accounts: TEST_ACCOUNTS,
    processedByName: 'Pemilik',
  });

  assert.equal(result.ok, true);
  assert.equal(result.stockDeltas?.length, 0);
  assert.equal(result.inventoryMovements?.length, 0);
  assert.equal(result.returnRecord?.totalCogsRestored, '0.0000');
  assert.equal(result.journalEntry?.lines.length, 3); // Dr 4101, Dr 2102, Cr 1102
});

test('prevents returning more than remaining quantity across multiple returns', () => {
  const first = buildSalesReturnExecution({
    tenantId: 't1',
    order: SAMPLE_ORDER,
    existingReturnsForOrder: [],
    lines: [{ productId: 'p-beras', qtyToReturn: '1', restockToWarehouse: true }],
    reason: 'PELANGGAN_BATAL',
    refundAccountCode: '1101',
    accounts: TEST_ACCOUNTS,
    processedByName: 'Kasir',
  });
  assert.ok(first.returnRecord);

  const remaining = getRemainingReturnableQtyMap(SAMPLE_ORDER, [first.returnRecord]);
  assert.equal(remaining['p-beras'], '1.0000');

  const second = buildSalesReturnExecution({
    tenantId: 't1',
    order: SAMPLE_ORDER,
    existingReturnsForOrder: [first.returnRecord],
    lines: [{ productId: 'p-beras', qtyToReturn: '2', restockToWarehouse: true }],
    reason: 'PELANGGAN_BATAL',
    refundAccountCode: '1101',
    accounts: TEST_ACCOUNTS,
    processedByName: 'Kasir',
  });
  assert.equal(second.ok, false);
  assert.match(second.error ?? '', /melebihi sisa/);
});
