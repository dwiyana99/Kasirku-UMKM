import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  calculateRecipeFormulationMetrics,
  getVerticalCapabilities,
  getVisibleWorkspacesForSession,
  isValidProductImageSource,
} from './recipe-bom-utils';
import { createInitialCustomers, createInitialWorkspaces } from '../../data/seedData';
import type { Product } from '../../types/domain';

test('Vertical Capabilities: Warung Sembako disables BOM/QR; Kedai/Restoran enables connected BOM flow; Freelance focuses on services', () => {
  const sembako = getVerticalCapabilities('WARUNG_SEMBAKO');
  assert.equal(sembako.supportsRawMaterialsAndBom, false);
  assert.equal(sembako.supportsQrTablesAndKitchen, false);
  assert.equal(sembako.supportsStockProcurement, true);
  assert.equal(sembako.defaultSellableItemType, 'RETAIL_GOODS');

  const resto = getVerticalCapabilities('RESTORAN');
  assert.equal(resto.supportsRawMaterialsAndBom, true);
  assert.equal(resto.supportsQrTablesAndKitchen, true);
  assert.equal(resto.defaultSellableItemType, 'MENU_ITEM');

  const freelance = getVerticalCapabilities('FREELANCE');
  assert.equal(freelance.supportsRawMaterialsAndBom, false);
  assert.equal(freelance.supportsQrTablesAndKitchen, false);
  assert.equal(freelance.defaultSellableItemType, 'SERVICE_FREELANCE');
});

test('Recipe Formulation Metrics: computes Decimal.js HPP and exact max craftable portions from remaining raw material stock', () => {
  const products: Product[] = [
    {
      id: 'ing-kopi',
      tenantId: 't1',
      categoryId: null,
      sku: 'RAW-01',
      barcodeQr: '',
      name: 'Biji Kopi Arabika',
      description: '',
      itemType: 'RAW_MATERIAL',
      unit: 'kg',
      sellingPrice: '0',
      costPriceAvg: '180000.0000',
      stockQty: '0.9000', // 0.9 / 0.018 = 50 porsi
      minStockAlert: '0.5000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'ing-susu',
      tenantId: 't1',
      categoryId: null,
      sku: 'RAW-02',
      barcodeQr: '',
      name: 'Susu UHT Full Cream',
      description: '',
      itemType: 'RAW_MATERIAL',
      unit: 'liter',
      sellingPrice: '0',
      costPriceAvg: '20000.0000',
      stockQty: '3.0000', // 3.0 / 0.15 = 20 porsi (limiting!)
      minStockAlert: '2.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  const metrics = calculateRecipeFormulationMetrics(
    [
      { ingredientProductId: 'ing-kopi', quantityRequired: '0.018' },
      { ingredientProductId: 'ing-susu', quantityRequired: '0.15' },
    ],
    products,
    1
  );

  // 0.018 * 180000 = 3240; 0.15 * 20000 = 3000 => Total HPP = 6240.0000
  assert.equal(new Decimal(metrics.unitCost).toFixed(2), '6240.00');
  assert.equal(metrics.maxCraftablePortions, 20);
  assert.equal(metrics.limitingIngredientName, 'Susu UHT Full Cream');
  assert.equal(metrics.breakdown.length, 2);
});

test('Multi-Tenant Privacy Isolation: Guests see 0 tenants, Customers see ONLY their own tenants, Master sees target or all', () => {
  const workspaces = createInitialWorkspaces();
  const customers = createInitialCustomers();

  const guestVisible = getVisibleWorkspacesForSession({
    session: { role: 'GUEST', email: '', fullName: 'Tamu' },
    workspaces,
    customers,
  });
  assert.equal(guestVisible.length, 0);

  const sembakoCustomer = customers.find((c) => c.primaryTenantId === 'tenant-warung-berkah');
  assert.ok(sembakoCustomer, 'Sembako customer must exist');

  const customerVisible = getVisibleWorkspacesForSession({
    session: {
      role: 'CUSTOMER',
      email: sembakoCustomer.email,
      fullName: sembakoCustomer.fullName,
      customerId: sembakoCustomer.id,
    },
    workspaces,
    customers,
  });
  assert.equal(customerVisible.length, 1);
  assert.equal(customerVisible[0].tenant.id, 'tenant-warung-berkah');

  const masterImpersonating = getVisibleWorkspacesForSession({
    session: {
      role: 'MASTER_ADMIN',
      email: 'master@kasirakun.id',
      fullName: 'Master',
      impersonatingCustomerId: sembakoCustomer.id,
      impersonatingCustomerName: sembakoCustomer.fullName,
    },
    workspaces,
    customers,
  });
  assert.equal(masterImpersonating.length, 1);
  assert.equal(masterImpersonating[0].tenant.id, 'tenant-warung-berkah');
});

test('Image source validation accepts uploaded data URLs and local assets', () => {
  assert.equal(isValidProductImageSource('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(isValidProductImageSource('/src/assets/images/menu_kopi.jpg'), true);
  assert.equal(isValidProductImageSource(''), false);
  assert.equal(isValidProductImageSource('javascript:alert(1)'), false);
});
