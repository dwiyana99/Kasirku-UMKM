import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHierarchicalTaxonomyFromPresets,
  getBrandsForSelection,
  getProductTypesForCategory,
  getSizesForSelection,
  getUnitsForSelection,
  buildSuggestedProductName,
} from './taxonomy-presets';
import type { Category } from '../../types/domain';

test('Cascading taxonomy filters Kertas & ATK -> A4 / Folio -> Sinar Dunia -> 70 gsm -> rim/dus', () => {
  const categories: Category[] = [
    { id: 'cat-pokok', tenantId: 't1', name: 'Bahan Pokok', sortOrder: 1 },
    { id: 'cat-kertas', tenantId: 't1', name: 'Kertas & ATK', sortOrder: 2 },
  ];

  const taxonomy = buildHierarchicalTaxonomyFromPresets('WARUNG_SEMBAKO', categories);

  // 1. Selecting Kertas & ATK only shows Kertas types (A4, Folio, A3), NOT Beras/Minyak Goreng
  const kertasTypes = getProductTypesForCategory(taxonomy, 'cat-kertas');
  const kertasTypeNames = kertasTypes.map((t) => t.name);
  assert.ok(kertasTypeNames.includes('A4'));
  assert.ok(kertasTypeNames.includes('Folio (F4)'));
  assert.ok(!kertasTypeNames.includes('Beras'));

  // 2. Selecting A4 filters brands to paper brands (Sinar Dunia, PaperOne), NOT Bimoli/Gulaku
  const a4Type = kertasTypes.find((t) => t.name === 'A4')!;
  const a4Brands = getBrandsForSelection(taxonomy, 'cat-kertas', a4Type.id);
  const a4BrandNames = a4Brands.map((b) => b.name);
  assert.ok(a4BrandNames.includes('Sinar Dunia (SiDU)'));
  assert.ok(a4BrandNames.includes('PaperOne'));
  assert.ok(!a4BrandNames.includes('Bimoli'));

  // 3. Selecting A4 puts 70 gsm / 80 gsm sizes first and rim / dus units first
  const a4Sizes = getSizesForSelection(taxonomy, 'cat-kertas', a4Type.id);
  assert.equal(a4Sizes[0].label, '70 gsm');
  const a4Units = getUnitsForSelection(taxonomy, 'cat-kertas', a4Type.id);
  assert.equal(a4Units[0].name, 'rim');
  assert.ok(a4Units.some((u) => u.name === 'dus'));

  // 4. Suggested product name joins cleanly
  assert.equal(
    buildSuggestedProductName({
      productType: 'A4',
      brand: 'Sinar Dunia (SiDU)',
      sizeLabel: '70 gsm',
    }),
    'A4 Sinar Dunia (SiDU) 70 gsm'
  );
});

test('Bahan Pokok -> Minyak Goreng cascades to Bimoli and liter/ml sizes', () => {
  const categories: Category[] = [
    { id: 'cat-pokok', tenantId: 't1', name: 'Bahan Pokok', sortOrder: 1 },
  ];
  const taxonomy = buildHierarchicalTaxonomyFromPresets('WARUNG_SEMBAKO', categories);
  const types = getProductTypesForCategory(taxonomy, 'cat-pokok');
  const minyak = types.find((t) => t.name === 'Minyak Goreng')!;
  const brands = getBrandsForSelection(taxonomy, 'cat-pokok', minyak.id);
  assert.ok(brands.some((b) => b.name === 'Bimoli'));
  const sizes = getSizesForSelection(taxonomy, 'cat-pokok', minyak.id);
  assert.ok(sizes.some((s) => s.label === '2 liter'));
  const units = getUnitsForSelection(taxonomy, 'cat-pokok', minyak.id);
  assert.equal(units[0].name, 'pouch');
});
