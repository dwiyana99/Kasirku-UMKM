import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaxProjectionDashboard } from './tax-projection-engine';
import type { Tenant } from '../../types/domain';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't-tax-1',
    name: 'Warung Makmur',
    slug: 'warung-makmur',
    vertical: 'WARUNG_SEMBAKO',
    taxEntity: 'WP_OP',
    isPkp: false,
    npwp16: '0000000000000000',
    nitku22: '0000000000000000000000',
    address: 'Jakarta',
    receiptFooter: 'Terima kasih',
    cumulativeTurnoverPriorMonths: '450000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'TAX_CORETAX'],
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm',
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('WP_OP crossing Rp500jt threshold pays 0.5% ONLY on excess in crossing month', () => {
  // Prior YTD = 450jt, monthly turnover = 80jt -> month 0 hits 530jt -> taxable excess = 30jt -> 0.5% = 150.000
  // Month 1 = 80jt fully taxable -> 0.5% = 400.000
  const data = buildTaxProjectionDashboard({
    tenant: makeTenant({ cumulativeTurnoverPriorMonths: '450000000' }),
    monthlyTurnoverEstimate: '80000000',
    monthsAhead: 2,
    startMonthDate: new Date(2026, 10, 1),
  });

  assert.equal(data.isSupportedForEntity, true);
  assert.equal(data.points.length, 2);
  assert.equal(data.points[0].pphFinalPayable, 150000);
  assert.equal(data.points[1].pphFinalPayable, 400000);
  assert.equal(data.points[0].ppnPayable, 0);
  assert.equal(data.sixMonthPphFinal, '550000.0000');
});

test('PKP retail tenant computes both PPh Final (PT Perorangan) and PPN 11% effective', () => {
  const data = buildTaxProjectionDashboard({
    tenant: makeTenant({
      vertical: 'TOKO_BANGUNAN',
      taxEntity: 'PT_PERORANGAN',
      isPkp: true,
      cumulativeTurnoverPriorMonths: '0',
    }),
    monthlyTurnoverEstimate: '100000000',
    monthsAhead: 3,
    startMonthDate: new Date(2026, 0, 1),
  });

  assert.equal(data.isSupportedForEntity, true);
  assert.equal(data.appliesPpn11, true);
  assert.equal(data.isEligiblePphFinal05, true);
  assert.equal(data.points[0].pphFinalPayable, 500000);
  assert.equal(data.points[0].ppnPayable, 11000000);
  assert.equal(data.points[0].totalTaxPayable, 11500000);
});

test('Non-PKP Freelance returns isSupportedForEntity=false with clear Pasal 56 explanation', () => {
  const data = buildTaxProjectionDashboard({
    tenant: makeTenant({
      vertical: 'FREELANCE',
      taxEntity: 'WP_OP',
      isPkp: false,
    }),
    monthlyTurnoverEstimate: '25000000',
    monthsAhead: 6,
  });

  assert.equal(data.isSupportedForEntity, false);
  assert.match(data.unsupportedReason ?? '', /Pasal 56/);
});
