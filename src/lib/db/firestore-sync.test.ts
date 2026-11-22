import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRealtimeOrders,
  mergeRealtimeProducts,
  provisionDefaultFirebaseWorkspace,
  sanitizeFirestorePayload,
  toFirestoreInventoryDoc,
  toFirestoreOrderDoc,
} from './firestore-sync';
import type { Order, Product } from '../../types/domain';

test('sanitizeFirestorePayload recursively omits undefined fields without altering arrays or values', () => {
  const dirty = {
    id: 'p-1',
    optionalUndefined: undefined,
    nested: {
      keep: 'ok',
      drop: undefined,
    },
    list: ['a', undefined, 'b'],
  };
  const clean = sanitizeFirestorePayload(dirty);
  assert.equal('optionalUndefined' in clean, false);
  assert.equal('drop' in clean.nested, false);
  assert.deepEqual(clean.list, ['a', 'b']);
});

test('toFirestoreInventoryDoc and toFirestoreOrderDoc produce rule-compliant Firestore documents', () => {
  const prod: Product = {
    id: 'prod-1',
    tenantId: 'tnt-1',
    categoryId: 'cat-1',
    sku: 'BRS-5KG',
    barcodeQr: '89912345',
    name: 'Beras Pandan Wangi 5kg',
    description: 'Beras premium',
    itemType: 'RETAIL_GOODS',
    unit: 'karung',
    sellingPrice: '78000.0000',
    costPriceAvg: '69000.0000',
    stockQty: '15.0000',
    minStockAlert: '5.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-11-18T10:00:00.000Z',
  };
  const invDoc = toFirestoreInventoryDoc('uid_123', 'tnt-1', prod);
  assert.equal(invDoc.ownerId, 'uid_123');
  assert.equal(invDoc.productId, 'prod-1');
  assert.equal(invDoc.itemType, 'RETAIL_GOODS');

  const order: Order = {
    id: 'ord-1',
    tenantId: 'tnt-1',
    orderNumber: 'INV-001',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'Pelanggan Umum',
    subtotal: '78000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '78000.0000',
    taxAmount: '0.0000',
    grandTotal: '78000.0000',
    totalCogs: '69000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: true,
    items: [],
    payment: {
      id: 'pay-1',
      tenantId: 'tnt-1',
      orderId: 'ord-1',
      paymentMethod: 'CASH',
      amountPaid: '78000.0000',
      mdrFee: '0.0000',
      gatewayRefId: null,
      paidAt: '2026-11-18T11:00:00.000Z',
    },
    customAttributes: {},
    createdAt: '2026-11-18T11:00:00.000Z',
  };
  const orderDoc = toFirestoreOrderDoc('uid_123', 'tnt-1', order);
  assert.equal(orderDoc.orderId, 'ord-1');
  assert.equal(orderDoc.paymentStatus, 'PAID');
});

test('mergeRealtimeProducts and mergeRealtimeOrders merge remote snapshots cleanly', () => {
  const pLocal: Product = {
    id: 'p1',
    tenantId: 't1',
    categoryId: null,
    sku: 'S1',
    barcodeQr: '1',
    name: 'Gula Pasir Lama',
    description: '',
    itemType: 'RETAIL_GOODS',
    unit: 'kg',
    sellingPrice: '17000.0000',
    costPriceAvg: '14000.0000',
    stockQty: '10.0000',
    minStockAlert: '2.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-11-18T00:00:00.000Z',
  };
  const pRemoteUpdated: Product = { ...pLocal, stockQty: '8.0000', name: 'Gula Pasir Baru' };
  const pRemoteNew: Product = { ...pLocal, id: 'p2', sku: 'S2', name: 'Minyak Goreng' };

  const mergedProds = mergeRealtimeProducts([pLocal], [pRemoteUpdated, pRemoteNew]);
  assert.equal(mergedProds.length, 2);
  assert.equal(mergedProds.find((p) => p.id === 'p1')?.stockQty, '8.0000');
  assert.equal(mergedProds.find((p) => p.id === 'p2')?.name, 'Minyak Goreng');

  const o1: Order = {
    id: 'o1',
    tenantId: 't1',
    orderNumber: 'POS-1',
    orderSource: 'POS_CASHIER',
    tableId: null,
    customerName: 'A',
    subtotal: '10000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '10000.0000',
    taxAmount: '0.0000',
    grandTotal: '10000.0000',
    totalCogs: '5000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    items: [],
    payment: {
      id: 'pay-o1',
      tenantId: 't1',
      orderId: 'o1',
      paymentMethod: 'CASH',
      amountPaid: '10000.0000',
      mdrFee: '0.0000',
      gatewayRefId: null,
      paidAt: '2026-11-18T09:00:00.000Z',
    },
    customAttributes: {},
    createdAt: '2026-11-18T09:00:00.000Z',
  };
  const o2: Order = { ...o1, id: 'o2', orderNumber: 'POS-2', createdAt: '2026-11-18T12:00:00.000Z' };
  const mergedOrders = mergeRealtimeOrders([o1], [o2]);
  assert.equal(mergedOrders.length, 2);
  assert.equal(mergedOrders[0].id, 'o2');
});

test('provisionDefaultFirebaseWorkspace creates clean REAL workspace without demo/dummy transactions', () => {
  const { customer, workspace } = provisionDefaultFirebaseWorkspace({
    uid: 'firebaseUidAbc123',
    email: 'owner@tokobaru.id',
    fullName: 'Siti Aminah',
    businessName: 'Toko Sembako Siti',
    vertical: 'WARUNG_SEMBAKO',
  });
  assert.equal(customer.accountScope, 'REAL');
  assert.equal(customer.isDemoAccount, false);
  assert.equal(workspace.tenant.accountScope, 'REAL');
  assert.equal(workspace.products.length, 0);
  assert.equal(workspace.orders.length, 0);
  assert.ok(workspace.accounts.length > 0);
  assert.ok(workspace.categories.length > 0);
});
