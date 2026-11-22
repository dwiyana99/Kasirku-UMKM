import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  buildDailyRevenueSeries,
  buildMonthlyProfitLossSeries,
  computeMonthlyTaxSimulation,
} from './dashboard-analytics';
import { createInitialWorkspaces } from '../../data/seedData';
import { detectAntiFraudAnomalies } from '../pos/advanced-pos-engine';
import type { Account, JournalEntry, Order } from '../../types/domain';

describe('Dashboard, Accounting & Tax Analytics Engine', () => {
  it('aggregates daily revenue variations accurately with Decimal precision for D3 chart', () => {
    const orders = [
      {
        id: 'o1',
        createdAt: '2026-11-05T09:15:00.000Z',
        grandTotal: '150000.0000',
        paymentStatus: 'PAID',
      },
      {
        id: 'o2',
        createdAt: '2026-11-05T14:30:00.000Z',
        grandTotal: '250000.0000',
        paymentStatus: 'PAID',
      },
      {
        id: 'o3',
        createdAt: '2026-11-12T10:00:00.000Z',
        grandTotal: '600000.0000',
        paymentStatus: 'PAID',
      },
      {
        id: 'o4',
        createdAt: '2026-11-15T11:00:00.000Z',
        grandTotal: '999000.0000',
        paymentStatus: 'PENDING_PAYMENT',
      },
    ] as unknown as Order[];

    const res = buildDailyRevenueSeries(orders, '2026-11');
    assert.equal(res.monthKey, '2026-11');
    assert.equal(res.points.length, 30);
    assert.equal(res.totalOrders, 3);
    assert.equal(res.activeDaysCount, 2);
    assert.equal(new Decimal(res.totalRevenue).toFixed(0), '1000000');
    assert.equal(new Decimal(res.averageDailyRevenue).toFixed(0), '500000');
    assert.equal(res.peakDay?.day, 12);
    assert.equal(res.peakDay?.revenue, 600000);
    assert.equal(res.points[4].revenue, 400000); // Nov 5
    assert.equal(res.points[14].revenue, 0); // Nov 15 unpaid excluded
  });

  it('aggregates monthly net profit/loss strictly from double-entry journal lines for Recharts', () => {
    const accounts: Account[] = [
      { id: 'acc-cash', tenantId: 't1', code: '1101', name: 'Kas', category: 'ASSET', normalBalance: 'DEBIT', isSystemLocked: true },
      { id: 'acc-rev', tenantId: 't1', code: '4101', name: 'Penjualan', category: 'REVENUE', normalBalance: 'CREDIT', isSystemLocked: true },
      { id: 'acc-hpp', tenantId: 't1', code: '5101', name: 'HPP', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: true },
      { id: 'acc-exp', tenantId: 't1', code: '6101', name: 'Listrik', category: 'EXPENSE', normalBalance: 'DEBIT', isSystemLocked: false },
    ];

    const journals: JournalEntry[] = [
      {
        id: 'j1',
        tenantId: 't1',
        entryNumber: 'J-01',
        entryDate: '2026-10-15',
        sourceModule: 'POS',
        sourceId: 'o1',
        description: 'Penjualan Okt',
        status: 'POSTED',
        reversedEntryId: null,
        createdAt: '2026-10-15T10:00:00.000Z',
        lines: [
          { id: 'l1', journalEntryId: 'j1', accountId: 'acc-cash', accountCodeSnapshot: '1101', accountNameSnapshot: 'Kas', debit: '1000000.0000', credit: '0.0000' },
          { id: 'l2', journalEntryId: 'j1', accountId: 'acc-rev', accountCodeSnapshot: '4101', accountNameSnapshot: 'Penjualan', debit: '0.0000', credit: '1000000.0000' },
          { id: 'l3', journalEntryId: 'j1', accountId: 'acc-hpp', accountCodeSnapshot: '5101', accountNameSnapshot: 'HPP', debit: '600000.0000', credit: '0.0000' },
          { id: 'l4', journalEntryId: 'j1', accountId: 'acc-cash', accountCodeSnapshot: '1101', accountNameSnapshot: 'Kas', debit: '0.0000', credit: '600000.0000' },
        ],
      },
      {
        id: 'j2',
        tenantId: 't1',
        entryNumber: 'J-02',
        entryDate: '2026-11-08',
        sourceModule: 'POS',
        sourceId: 'o2',
        description: 'Penjualan Nov',
        status: 'POSTED',
        reversedEntryId: null,
        createdAt: '2026-11-08T10:00:00.000Z',
        lines: [
          { id: 'l5', journalEntryId: 'j2', accountId: 'acc-cash', accountCodeSnapshot: '1101', accountNameSnapshot: 'Kas', debit: '2500000.0000', credit: '0.0000' },
          { id: 'l6', journalEntryId: 'j2', accountId: 'acc-rev', accountCodeSnapshot: '4101', accountNameSnapshot: 'Penjualan', debit: '0.0000', credit: '2500000.0000' },
          { id: 'l7', journalEntryId: 'j2', accountId: 'acc-exp', accountCodeSnapshot: '6101', accountNameSnapshot: 'Beban Operasional', debit: '500000.0000', credit: '0.0000' },
          { id: 'l8', journalEntryId: 'j2', accountId: 'acc-cash', accountCodeSnapshot: '1101', accountNameSnapshot: 'Kas', debit: '0.0000', credit: '500000.0000' },
        ],
      },
    ];

    const series = buildMonthlyProfitLossSeries(journals, accounts);
    assert.equal(series.length, 2);
    assert.equal(series[0].monthKey, '2026-10');
    assert.equal(series[0].revenue, 1000000);
    assert.equal(series[0].expenses, 600000);
    assert.equal(series[0].netProfit, 400000);

    assert.equal(series[1].monthKey, '2026-11');
    assert.equal(series[1].revenue, 2500000);
    assert.equal(series[1].expenses, 500000);
    assert.equal(series[1].netProfit, 2000000);
  });

  it('computes real-time monthly VAT (PPN 12% x DPP 11/12 = 11% effective) and PPh simulation accurately', () => {
    const simPkp = computeMonthlyTaxSimulation({
      vertical: 'TOKO_RETAIL',
      taxEntity: 'PT_PERORANGAN',
      isPkp: true,
      priorCumulativeTurnover: '600000000.0000',
      actualMonthlyGrossSales: '100000000.0000',
      actualMonthlyNetProfit: '25000000.0000',
    });

    assert.equal(new Decimal(simPkp.estimatedMonthlyPpn).toFixed(0), '11000000');
    assert.equal(new Decimal(simPkp.estimatedMonthlyPph).toFixed(0), '500000');
    assert.equal(new Decimal(simPkp.totalEstimatedMonthlyTax).toFixed(0), '11500000');
    assert.equal(simPkp.effectiveTaxRatePct, '11.50');

    // WP OP under Rp500M PP 20/2026 threshold pays Rp0 PPh and Rp0 PPN (Non-PKP)
    const simOpExempt = computeMonthlyTaxSimulation({
      vertical: 'WARUNG_SEMBAKO',
      taxEntity: 'WP_OP',
      isPkp: false,
      priorCumulativeTurnover: '120000000.0000',
      actualMonthlyGrossSales: '20000000.0000',
      actualMonthlyNetProfit: '4000000.0000',
    });
    assert.equal(simOpExempt.isExemptUnder500M, true);
    assert.equal(new Decimal(simOpExempt.estimatedMonthlyPph).toFixed(0), '0');
    assert.equal(new Decimal(simOpExempt.totalEstimatedMonthlyTax).toFixed(0), '0');
  });

  it('seeds demo Warung Makmur Jaya in clean normal state with zero anti-fraud or shift variance alerts', () => {
    const workspaces = createInitialWorkspaces();
    const warung = workspaces.find((w) => w.tenant.vertical === 'WARUNG_SEMBAKO');
    assert.ok(warung, 'Demo Warung Sembako workspace must exist');
    const alerts = detectAntiFraudAnomalies({
      orders: warung.orders,
      shifts: warung.cashierShifts ?? [],
      auditLogs: warung.auditLogs ?? [],
    });
    assert.equal(alerts.length, 0, 'Demo workspace must start cleanly with zero anti-fraud alerts');
  });
});
