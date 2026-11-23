import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeServerWorkspacesWithPendingSnapshots,
  type PendingWorkspaceSnapshot,
} from './offline-store';
import {
  buildCatalogCsvTemplate,
  detectCsvDelimiter,
  exportCatalogToCsv,
  parseCatalogCsv,
} from '../catalog/csv-catalog';
import type { Category, Order, Product, TenantWorkspaceData } from '../../types/domain';

function makeMinimalWorkspace(
  tenantId: string,
  orderCount: number,
  name = 'Warung Berkah'
): TenantWorkspaceData {
  const orders: Order[] = Array.from({ length: orderCount }, (_, idx) => ({
    id: `ord-${idx + 1}`,
    tenantId,
    tableId: null,
    orderNumber: `INV-${idx + 1}`,
    orderSource: 'POS_CASHIER',
    orderMode: 'TAKEAWAY',
    customerName: 'Pelanggan',
    subtotal: '10000.0000',
    discountAmount: '0.0000',
    serviceCharge: '0.0000',
    taxType: 'NONE',
    dppNilaiLain: '0.0000',
    taxAmount: '0.0000',
    grandTotal: '10000.0000',
    totalCogs: '7000.0000',
    paymentStatus: 'PAID',
    kitchenStatus: 'SERVED',
    isReceiptPrinted: false,
    customAttributes: {},
    items: [],
    createdAt: new Date(2026, 0, 1 + idx).toISOString(),
  }));

  return {
    tenant: {
      id: tenantId,
      name,
      slug: 'warung-berkah',
      vertical: 'WARUNG_SEMBAKO',
      taxEntity: 'WP_OP',
      isPkp: false,
      npwp16: '0000000000000000',
      nitku22: '0000000000000000000000',
      address: 'Jl. Merdeka No. 1',
      receiptFooter: 'Terima kasih',
      serviceChargeRate: '0.0000',
      activeModules: ['POS_BASIC'],
      subscriptionPlan: 'LITE',
      activeAddOns: [],
      cumulativeTurnoverPriorMonths: '0.0000',
      settings: {
        autoPrintQrOrders: false,
        thermalPaperWidth: '58mm',
        qrisMdrRate: '0.007',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    categories: [],
    products: [],
    recipes: [],
    accounts: [],
    orders,
    journalEntries: [],
    expenses: [],
    inventoryMovements: [],
    fixedAssets: [],
    tables: [],
    customFields: [],
  };
}

test('mergeServerWorkspacesWithPendingSnapshots preserves unsynced offline sales over server payload', () => {
  const serverWs = makeMinimalWorkspace('t-1', 2);
  const offlineWs = makeMinimalWorkspace('t-1', 5);
  const snapshot: PendingWorkspaceSnapshot = {
    tenantId: 't-1',
    workspace: offlineWs,
    savedAt: '2026-11-22T10:00:00.000Z',
    pendingTxCount: 3,
    lastSyncError: null,
  };

  const merged = mergeServerWorkspacesWithPendingSnapshots([serverWs], [snapshot]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].orders.length, 5);
});

test('mergeServerWorkspacesWithPendingSnapshots keeps server payload when no pending snapshot exists', () => {
  const serverWs = makeMinimalWorkspace('t-1', 3);
  const otherSnap: PendingWorkspaceSnapshot = {
    tenantId: 't-other',
    workspace: makeMinimalWorkspace('t-other', 1),
    savedAt: '2026-11-22T10:00:00.000Z',
    pendingTxCount: 1,
    lastSyncError: null,
  };

  const merged = mergeServerWorkspacesWithPendingSnapshots([serverWs], [otherSnap]);
  assert.equal(merged[0].orders.length, 3);
});

test('detectCsvDelimiter identifies both standard comma and Indonesian Excel semicolon formats', () => {
  assert.equal(detectCsvDelimiter('Nama Barang,Harga Jual,Stok\nKopi,15000,10'), ',');
  assert.equal(detectCsvDelimiter('Nama Barang;Harga Jual;Stok\nKopi;15000;10'), ';');
});

test('parseCatalogCsv parses Indonesian semicolon CSV with Rupiah formatting and Decimal precision', () => {
  const csv = [
    'Nama Barang;Kode / SKU;Barcode;Kategori;Satuan;Harga Jual;Harga Modal;Stok;Stok Minimum;Bebas PPN (YA/TIDAK)',
    'Beras Premium 5kg;BRS-01;89912345;Sembako;sak;Rp 74.500;65.000;20;5;YA',
    'Minyak Goreng 1L;MNY-01;;Sembako;pouch;17500;15000;30;10;TIDAK',
    ';;;Kosong;pcs;0;0;0;0;TIDAK',
  ].join('\n');

  const result = parseCatalogCsv(csv);
  assert.equal(result.delimiterDetected, ';');
  assert.equal(result.items.length, 2);
  assert.equal(result.errors.length, 1);

  assert.equal(result.items[0].sku, 'BRS-01');
  assert.equal(result.items[0].barcodeQr, '89912345');
  assert.equal(result.items[0].name, 'Beras Premium 5kg');
  assert.equal(result.items[0].sellingPrice, '74500.0000');
  assert.equal(result.items[0].costPriceAvg, '65000.0000');
  assert.equal(result.items[0].stockQty, '20.0000');
  assert.equal(result.items[0].isTaxExempt, true);

  assert.equal(result.items[1].sellingPrice, '17500.0000');
  assert.equal(result.items[1].isTaxExempt, false);
});

test('buildCatalogCsvTemplate and exportCatalogToCsv roundtrip cleanly through parseCatalogCsv', () => {
  const tpl = buildCatalogCsvTemplate();
  const parsedTpl = parseCatalogCsv(tpl);
  assert.ok(parsedTpl.items.length >= 2, 'Template must contain sample rows');
  assert.equal(parsedTpl.errors.length, 0);

  const categories: Category[] = [
    { id: 'cat-1', tenantId: 't-1', name: 'Minuman', sortOrder: 1 },
  ];
  const products: Product[] = [
    {
      id: 'p-1',
      tenantId: 't-1',
      categoryId: 'cat-1',
      sku: 'KOPI-01',
      barcodeQr: '89900011',
      name: 'Kopi Susu, Gula Aren',
      description: '',
      itemType: 'RETAIL_GOODS',
      unit: 'cup',
      sellingPrice: '18000.0000',
      costPriceAvg: '9500.0000',
      stockQty: '50.0000',
      minStockAlert: '10.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const exported = exportCatalogToCsv(products, categories);
  const reimported = parseCatalogCsv(exported);
  assert.equal(reimported.items.length, 1);
  assert.equal(reimported.items[0].name, 'Kopi Susu, Gula Aren');
  assert.equal(reimported.items[0].categoryName, 'Minuman');
  assert.equal(reimported.items[0].sellingPrice, '18000.0000');
});
