import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  computeBulkAdjustmentPreview,
  createBulkStockOpnameJournalEntry,
  evaluateStockAlerts,
} from './stock-monitoring';
import { createInitialWorkspaces } from '../../data/seedData';
import type { Product } from '../../types/domain';

function makeProduct(overrides: Partial<Product>): Product {
  return {
    id: 'p-1',
    tenantId: 't-1',
    categoryId: null,
    sku: 'SKU-1',
    barcodeQr: '8990001',
    name: 'Test Item',
    description: '',
    itemType: 'RETAIL_GOODS',
    unit: 'pcs',
    sellingPrice: '15000.0000',
    costPriceAvg: '10000.0000',
    stockQty: '20.0000',
    minStockAlert: '10.0000',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Low-Stock Monitoring & Early Warning Evaluator', () => {
  it('classifies OUT_OF_STOCK, CRITICAL, and LOW_WARNING (approaching minStockAlert) while ignoring healthy & non-tracked items', () => {
    const products: Product[] = [
      makeProduct({ id: 'p-healthy', name: 'Healthy Item', stockQty: '25.0000', minStockAlert: '10.0000' }),
      makeProduct({ id: 'p-warn', name: 'Approaching Min', stockQty: '13.0000', minStockAlert: '10.0000', costPriceAvg: '5000.0000' }),
      makeProduct({ id: 'p-crit', name: 'Critical Below Min', stockQty: '4.0000', minStockAlert: '10.0000', costPriceAvg: '12000.0000' }),
      makeProduct({ id: 'p-out', name: 'Out of Stock', stockQty: '0.0000', minStockAlert: '8.0000', costPriceAvg: '15000.0000' }),
      makeProduct({ id: 'p-menu', name: 'Finished Menu', itemType: 'MENU_ITEM', stockQty: '0.0000', minStockAlert: '5.0000' }),
      makeProduct({ id: 'p-svc', name: 'Consulting Service', itemType: 'SERVICE_FREELANCE', stockQty: '0.0000', minStockAlert: '0.0000' }),
    ];

    const result = evaluateStockAlerts(products);

    assert.equal(result.totalTrackedCount, 4);
    assert.equal(result.healthyCount, 1);
    assert.equal(result.counts.outOfStock, 1);
    assert.equal(result.counts.critical, 1);
    assert.equal(result.counts.lowWarning, 1);
    assert.equal(result.counts.total, 3);

    // Sorted by urgency: OUT_OF_STOCK -> CRITICAL -> LOW_WARNING
    assert.deepEqual(
      result.alerts.map((a) => `${a.product.id}:${a.severity}`),
      ['p-out:OUT_OF_STOCK', 'p-crit:CRITICAL', 'p-warn:LOW_WARNING']
    );

    // Suggested restock for p-out: 2*8 - 0 = 16 units * 15,000 = 240,000
    assert.equal(result.alerts[0].suggestedRestockQty, '16.0000');
    assert.equal(result.alerts[0].estimatedRestockCost, '240000.0000');
    // Suggested restock for p-crit: 2*10 - 4 = 16 units * 12,000 = 192,000
    assert.equal(result.alerts[1].suggestedRestockQty, '16.0000');
    assert.equal(result.alerts[1].estimatedRestockCost, '192000.0000');
    // Suggested restock for p-warn: max(min=10, 2*10-13=7) = 10 units * 5,000 = 50,000
    assert.equal(result.alerts[2].suggestedRestockQty, '10.0000');
    assert.equal(result.alerts[2].estimatedRestockCost, '50000.0000');
    assert.equal(result.totalEstimatedRestockCost, '482000.0000');
  });
});

describe('Bulk Stock Adjustment Preview & Balanced Double-Entry Journal', () => {
  it('computes exact Decimal.js deltas and builds a balanced double-entry journal for mixed breakage, loss, and surplus', () => {
    const ws = createInitialWorkspaces()[0]; // Warung Sembako
    const p1 = makeProduct({ id: 'p-beras', name: 'Beras 5kg', stockQty: '22.0000', costPriceAvg: '62000.0000' });
    const p2 = makeProduct({ id: 'p-minyak', name: 'Minyak 2L', stockQty: '10.0000', costPriceAvg: '34000.0000' });
    const p3 = makeProduct({ id: 'p-gula', name: 'Gula 1kg', stockQty: '30.0000', costPriceAvg: '15000.0000' });
    const p4 = makeProduct({ id: 'p-unchanged', name: 'Teh Celup', stockQty: '12.0000', costPriceAvg: '8000.0000' });

    const preview = computeBulkAdjustmentPreview(
      [
        { productId: 'p-beras', actualStockQty: '20', reasonCode: 'BREAKAGE', notes: 'Karung robek' },
        { productId: 'p-minyak', actualStockQty: '9', reasonCode: 'LOSS', notes: 'Selisih rak' },
        { productId: 'p-gula', actualStockQty: '33', reasonCode: 'OPNAME_SURPLUS', notes: 'Ditemukan di gudang belakang' },
        { productId: 'p-unchanged', actualStockQty: '12', reasonCode: 'CORRECTION' },
      ],
      [p1, p2, p3, p4]
    );

    assert.equal(preview.changedCount, 3);
    assert.equal(preview.totalShortageUnits, '3.0000');
    assert.equal(preview.totalSurplusUnits, '3.0000');
    // Shortage value: 2*62,000 + 1*34,000 = 158,000
    assert.equal(preview.totalShortageValue, '158000.0000');
    // Surplus value: 3*15,000 = 45,000
    assert.equal(preview.totalSurplusValue, '45000.0000');
    // Net valuation delta: 45,000 - 158,000 = -113,000
    assert.equal(preview.netValuationDelta, '-113000.0000');

    const journal = createBulkStockOpnameJournalEntry({
      tenantId: ws.tenant.id,
      batchRefId: 'batch-001',
      changedLines: preview.changedLines,
      batchNotes: 'Opname Mingguan',
      accounts: ws.accounts,
      entrySeq: 99,
      entryDate: '2026-11-18',
    });

    assert.ok(journal, 'Journal entry must be generated for non-zero variances');
    assert.equal(journal.status, 'POSTED');
    assert.equal(journal.lines.length, 6); // 2 lines per changed product

    const totalDebit = journal.lines.reduce((s, l) => s.plus(new Decimal(l.debit)), new Decimal(0));
    const totalCredit = journal.lines.reduce((s, l) => s.plus(new Decimal(l.credit)), new Decimal(0));
    assert.equal(totalDebit.toFixed(4), totalCredit.toFixed(4));
    assert.equal(totalDebit.toFixed(4), '203000.0000'); // 158,000 + 45,000
  });

  it('returns null journal when no quantities changed', () => {
    const ws = createInitialWorkspaces()[0];
    const p1 = makeProduct({ id: 'p-1', stockQty: '10.0000' });
    const preview = computeBulkAdjustmentPreview(
      [{ productId: 'p-1', actualStockQty: '10', reasonCode: 'CORRECTION' }],
      [p1]
    );
    assert.equal(preview.changedCount, 0);
    const journal = createBulkStockOpnameJournalEntry({
      tenantId: ws.tenant.id,
      batchRefId: 'batch-empty',
      changedLines: preview.changedLines,
      accounts: ws.accounts,
      entrySeq: 100,
    });
    assert.equal(journal, null);
  });
});
