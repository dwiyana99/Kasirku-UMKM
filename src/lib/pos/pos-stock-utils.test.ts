import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLivePosStock,
  filterPosProducts,
  isSearchFirstPosVertical,
} from './pos-stock-utils';
import type { Product, ProductRecipe } from '../../types/domain';

const sampleRetailProducts: Product[] = [
  {
    id: 'p-beras',
    tenantId: 't-warung',
    categoryId: 'cat-1',
    sku: 'SMB-001',
    barcodeQr: '8991002003001',
    name: 'Beras Rojolele Premium 5kg',
    description: 'Beras pulen 5kg',
    itemType: 'RETAIL_GOODS',
    unit: 'karung',
    sellingPrice: '78000.0000',
    costPriceAvg: '67500.0000',
    stockQty: '22.0000',
    minStockAlert: '5.0000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'p-minyak',
    tenantId: 't-warung',
    categoryId: 'cat-1',
    sku: 'SMB-002',
    barcodeQr: '8991002003002',
    name: 'Minyak Goreng Bimoli Pouch 2L',
    description: 'Minyak goreng 2 liter',
    itemType: 'RETAIL_GOODS',
    unit: 'pouch',
    sellingPrice: '38500.0000',
    costPriceAvg: '33200.0000',
    stockQty: '6.0000',
    minStockAlert: '4.0000',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleFnbProducts: Product[] = [
  {
    id: 'raw-kopi',
    tenantId: 't-kedai',
    categoryId: null,
    sku: 'RAW-01',
    barcodeQr: '',
    name: 'Biji Kopi Arabika',
    description: 'Bahan mentah',
    itemType: 'RAW_MATERIAL',
    unit: 'kg',
    sellingPrice: '0.0000',
    costPriceAvg: '200000.0000',
    stockQty: '1.0000', // 1 kg = 1000g -> 50 cups at 0.02kg/cup
    minStockAlert: '0.2000',
    isLuxuryGoods: false,
    isTaxExempt: true,
    isAvailable: false,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'menu-latte',
    tenantId: 't-kedai',
    categoryId: 'cat-kopi',
    sku: 'KPI-001',
    barcodeQr: '8995550001',
    name: 'Es Kopi Susu Gula Aren',
    description: 'Signature latte',
    itemType: 'MENU_ITEM',
    unit: 'gelas',
    sellingPrice: '26000.0000',
    costPriceAvg: '7800.0000',
    stockQty: '0.0000',
    minStockAlert: '0.0000',
    isLuxuryGoods: false,
    isTaxExempt: false,
    isAvailable: true,
    customAttributes: {},
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleRecipes: ProductRecipe[] = [
  {
    id: 'rec-1',
    tenantId: 't-kedai',
    menuProductId: 'menu-latte',
    ingredientProductId: 'raw-kopi',
    quantityRequired: '0.0200', // 20g per cup -> 50 cups from 1kg
  },
];

test('Search-First POS: WARUNG_SEMBAKO and KEDAI_MAKAN start empty until search or barcode scan', () => {
  assert.equal(isSearchFirstPosVertical('WARUNG_SEMBAKO'), true);
  assert.equal(isSearchFirstPosVertical('KEDAI_MAKAN'), true);
  assert.equal(isSearchFirstPosVertical('RESTORAN'), false);
  assert.equal(isSearchFirstPosVertical('FREELANCE'), false);

  const emptyWarung = filterPosProducts({
    vertical: 'WARUNG_SEMBAKO',
    sellableProducts: sampleRetailProducts,
    searchQuery: '',
    selectedCategoryId: 'ALL',
  });
  assert.equal(emptyWarung.length, 0);

  const byBarcode = filterPosProducts({
    vertical: 'WARUNG_SEMBAKO',
    sellableProducts: sampleRetailProducts,
    searchQuery: '8991002003001',
    selectedCategoryId: 'ALL',
  });
  assert.equal(byBarcode.length, 1);
  assert.equal(byBarcode[0].id, 'p-beras');

  const byNameKedai = filterPosProducts({
    vertical: 'KEDAI_MAKAN',
    sellableProducts: [sampleFnbProducts[1]],
    searchQuery: 'kopi susu',
    selectedCategoryId: 'ALL',
  });
  assert.equal(byNameKedai.length, 1);
  assert.equal(byNameKedai[0].id, 'menu-latte');

  // Restoran shows all products immediately when search is empty
  const restoAll = filterPosProducts({
    vertical: 'RESTORAN',
    sellableProducts: [sampleFnbProducts[1]],
    searchQuery: '',
    selectedCategoryId: 'ALL',
  });
  assert.equal(restoAll.length, 1);
});

test('Live POS Stock Deduction: Retail stock decreases immediately with draft qty and cart qty', () => {
  const beras = sampleRetailProducts[0]; // 22 karung

  // Before adding, draft qty = 3 -> availableAfterCart = 22, projectedAfterDraft = 19
  const beforeAdd = computeLivePosStock({
    product: beras,
    allProducts: sampleRetailProducts,
    productRecipes: [],
    cart: [],
    draftQty: 3,
  });
  assert.equal(beforeAdd.tracksStock, true);
  assert.equal(beforeAdd.availableAfterCart.toNumber(), 22);
  assert.equal(beforeAdd.projectedAfterDraft.toNumber(), 19);
  assert.equal(beforeAdd.exceedsStock, false);

  // After adding 3 to cart, next draft qty = 2 -> availableAfterCart = 19, projectedAfterDraft = 17
  const afterAdd = computeLivePosStock({
    product: beras,
    allProducts: sampleRetailProducts,
    productRecipes: [],
    cart: [{ productId: 'p-beras', qty: 3 }],
    draftQty: 2,
  });
  assert.equal(afterAdd.inCartQty.toNumber(), 3);
  assert.equal(afterAdd.availableAfterCart.toNumber(), 19);
  assert.equal(afterAdd.projectedAfterDraft.toNumber(), 17);
  assert.equal(afterAdd.exceedsStock, false);

  // Exceeding stock flags exceedsStock = true
  const over = computeLivePosStock({
    product: beras,
    allProducts: sampleRetailProducts,
    productRecipes: [],
    cart: [{ productId: 'p-beras', qty: 20 }],
    draftQty: 5,
  });
  assert.equal(over.availableAfterCart.toNumber(), 2);
  assert.equal(over.projectedAfterDraft.toNumber(), 0);
  assert.equal(over.exceedsStock, true);
});

test('Live POS Stock Deduction: F&B BOM Menu Item deducts craftable portions from shared raw materials', () => {
  const latte = sampleFnbProducts[1]; // 1kg coffee / 0.02kg = 50 cups max

  const live = computeLivePosStock({
    product: latte,
    allProducts: sampleFnbProducts,
    productRecipes: sampleRecipes,
    cart: [{ productId: 'menu-latte', qty: 10 }],
    draftQty: 5,
  });

  assert.equal(live.tracksStock, true);
  assert.equal(live.baseStock.toNumber(), 50);
  assert.equal(live.availableAfterCart.toNumber(), 40);
  assert.equal(live.projectedAfterDraft.toNumber(), 35);
  assert.equal(live.exceedsStock, false);
});
