import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRegionFromCoordinates,
  detectRegionFromLocationText,
  lookupRegionalTaxRecommendations,
} from './regional-tax-lookup';

test('detectRegionFromCoordinates accurately resolves Badung Bali, Jakarta, and Bandung', () => {
  // Canggu / Badung Bali
  const bali = detectRegionFromCoordinates(-8.6478, 115.1385);
  assert.ok(bali);
  assert.equal(bali.region.regionCode, 'ID-BA-BDG');
  assert.ok((bali.distanceKm ?? 999) < 30);

  // Tebet Jakarta Selatan
  const jkt = detectRegionFromCoordinates(-6.2297, 106.8567);
  assert.ok(jkt);
  assert.equal(jkt.region.regionCode, 'ID-JK-JKT');

  // Dago Bandung
  const bdg = detectRegionFromCoordinates(-6.885, 107.614);
  assert.ok(bdg);
  assert.equal(bdg.region.regionCode, 'ID-JB-BDG');
});

test('detectRegionFromLocationText matches city, kabupaten, and popular kecamatan/area aliases', () => {
  const canggu = detectRegionFromLocationText('Jl. Batu Bolong, Canggu');
  assert.ok(canggu);
  assert.equal(canggu.region.regionCode, 'ID-BA-BDG');

  const sleman = detectRegionFromLocationText('Seturan, Depok Sleman');
  assert.ok(sleman);
  assert.equal(sleman.region.regionCode, 'ID-YO-SLM');

  const tebet = detectRegionFromLocationText('Tebet Barat Jakarta');
  assert.ok(tebet);
  assert.equal(tebet.region.regionCode, 'ID-JK-JKT');

  const ubud = detectRegionFromLocationText('Kawasan Wisata Ubud');
  assert.ok(ubud);
  assert.equal(ubud.region.regionCode, 'ID-BA-GYR');
});

test('lookupRegionalTaxRecommendations returns Kost exemption + Kost >10 kamar PBJT module', () => {
  const res = lookupRegionalTaxRecommendations({
    vertical: 'KOST_KONTRAKAN',
    regionCode: 'ID-JK-JKT',
    taxEntity: 'WP_OP',
    isPkp: false,
  });

  assert.equal(res.region.regionCode, 'ID-JK-JKT');
  assert.match(res.nationalSummary.label, /PPh Final Sewa Bangunan/);
  assert.equal(res.suggestions.length, 2);
  assert.equal(res.suggestions[0].isRecommended, true);
  assert.equal(res.suggestions[0].presetConfig.applyRegionalTax, false);
  assert.equal(res.suggestions[1].presetConfig.applyRegionalTax, true);
  assert.equal(res.suggestions[1].presetConfig.customRateOverride, '0.1000');
  assert.match(res.suggestions[1].accountingImpact, /2103/);
});

test('lookupRegionalTaxRecommendations suggests PBJT SPA 15% + UMKM exemption for SPA in Badung Bali', () => {
  const res = lookupRegionalTaxRecommendations({
    vertical: 'SPA_WELLNESS',
    regionCode: 'ID-BA-BDG',
    taxEntity: 'WP_OP',
    isPkp: false,
  });

  assert.equal(res.suggestions[0].isRecommended, true);
  assert.equal(res.suggestions[0].ratePercentLabel, '15%');
  assert.equal(res.suggestions[0].presetConfig.applyRegionalTax, true);
  assert.equal(res.suggestions[1].badge, 'Pengecualian UMKM');
  assert.equal(res.suggestions[1].presetConfig.applyRegionalTax, false);
});
