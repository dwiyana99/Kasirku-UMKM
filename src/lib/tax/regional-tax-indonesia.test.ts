import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INDONESIA_REGIONAL_TAXES,
  buildDefaultTenantRegionalTax,
  mergeLatestRegionalTaxRegistry,
  resolveEffectiveRegionalTax,
} from './regional-tax-indonesia';
import { calculateOrderTax } from './indonesia-tax-engine';

test('Regional tax registry includes 35+ Indonesian cities/regencies including Jakarta, Bali, Surabaya, Bandung', () => {
  assert.ok(DEFAULT_INDONESIA_REGIONAL_TAXES.length >= 35);
  assert.ok(DEFAULT_INDONESIA_REGIONAL_TAXES.some((r) => r.regionCode === 'ID-JK-JKT'));
  assert.ok(DEFAULT_INDONESIA_REGIONAL_TAXES.some((r) => r.regionCode === 'ID-BA-BDG'));
  assert.ok(DEFAULT_INDONESIA_REGIONAL_TAXES.some((r) => r.regionCode === 'ID-JI-SBY'));
  assert.ok(DEFAULT_INDONESIA_REGIONAL_TAXES.some((r) => r.regionCode === 'ID-JB-BDG'));
});

test('Homestay/Villa in Badung Bali applies 10% PBJT Perhotelan cleanly', () => {
  const settings = buildDefaultTenantRegionalTax('HOMESTAY_VILLA', 'ID-BA-BDG');
  assert.equal(settings.applyRegionalTax, true);
  const res = resolveEffectiveRegionalTax('HOMESTAY_VILLA', settings);
  assert.equal(res.applies, true);
  assert.equal(res.rateDecimal, '0.1000');
  assert.equal(res.taxType, 'PBJT_HOTEL_10');

  const orderTax = calculateOrderTax({
    vertical: 'HOMESTAY_VILLA',
    isPkp: false,
    items: [{ lineSubtotal: '1500000.0000', isLuxuryGoods: false, isTaxExempt: false }],
    discountAmount: '0',
    serviceCharge: '0',
    regionalTax: settings,
  });
  assert.equal(orderTax.taxType, 'PBJT_HOTEL_10');
  assert.equal(orderTax.taxAmount, '150000.0000');
});

test('UMKM opting out / exempt from regional tax cleanly resolves to 0% PBJT', () => {
  const exemptSettings = {
    regionCode: 'ID-JK-JKT',
    province: 'DKI Jakarta',
    cityName: 'Jakarta (Seluruh Wilayah DKI)',
    applyRegionalTax: false,
  };
  const res = resolveEffectiveRegionalTax('KEDAI_MAKAN', exemptSettings);
  assert.equal(res.applies, false);
  assert.equal(res.rateDecimal, '0.00');

  const orderTax = calculateOrderTax({
    vertical: 'KEDAI_MAKAN',
    isPkp: false,
    items: [{ lineSubtotal: '50000.0000', isLuxuryGoods: false, isTaxExempt: false }],
    discountAmount: '0',
    serviceCharge: '0',
    regionalTax: exemptSettings,
  });
  assert.equal(orderTax.taxType, 'NONE');
  assert.equal(orderTax.taxAmount, '0.0000');
});

test('Non-PBJT verticals (Laundry, Warung, Manufaktur, Toko Bangunan) always ignore regional PBJT', () => {
  const settings = buildDefaultTenantRegionalTax('LAUNDRY', 'ID-JK-JKT');
  assert.equal(settings.applyRegionalTax, false);
  assert.equal(resolveEffectiveRegionalTax('LAUNDRY', settings).applies, false);
  assert.equal(resolveEffectiveRegionalTax('MANUFAKTUR_KECIL', settings).applies, false);
  assert.equal(resolveEffectiveRegionalTax('TOKO_BANGUNAN', settings).applies, false);
});

test('Master Admin mergeLatestRegionalTaxRegistry preserves custom regions while refreshing defaults', () => {
  const custom = [
    ...DEFAULT_INDONESIA_REGIONAL_TAXES.slice(0, 2),
    {
      ...DEFAULT_INDONESIA_REGIONAL_TAXES[1],
      regionCode: 'ID-CUSTOM-01',
      cityName: 'Kota Baru Nusantara',
    },
  ];
  const merged = mergeLatestRegionalTaxRegistry(custom);
  assert.ok(merged.some((r) => r.regionCode === 'ID-CUSTOM-01'));
  assert.ok(merged.length >= DEFAULT_INDONESIA_REGIONAL_TAXES.length + 1);
});

test('Explicit custom regional Perda levy applies cleanly when opted in on any vertical (e.g., Kost >10 kamar or Sports PBJT)', () => {
  const customKostRegional = {
    regionCode: 'ID-JK-JKT',
    province: 'DKI Jakarta',
    cityName: 'Jakarta (Seluruh Wilayah DKI)',
    applyRegionalTax: true,
    customRateOverride: '0.10',
    customTaxName: 'PBJT Kos >10 Kamar / Perda',
  };
  const res = resolveEffectiveRegionalTax('KOST_KONTRAKAN', customKostRegional);
  assert.equal(res.applies, true);
  assert.equal(res.rateDecimal, '0.1000');
  assert.match(res.taxLabel, /PBJT Kos >10 Kamar/);

  const orderTax = calculateOrderTax({
    vertical: 'KOST_KONTRAKAN',
    isPkp: false,
    items: [{ lineSubtotal: '2000000.0000', isLuxuryGoods: false, isTaxExempt: false }],
    discountAmount: '0',
    serviceCharge: '0',
    regionalTax: customKostRegional,
  });
  assert.equal(orderTax.taxAmount, '200000.0000');
});

