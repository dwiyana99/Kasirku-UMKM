import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessCatalogTab,
  canAccessRouteWithStaffPermissions,
  getDefaultHomeRouteForSession,
  hasStaffPermission,
} from './staff-rbac';
import {
  buildSuggestedProductName,
  mergeUniqueTaxonomyValues,
} from '../catalog/taxonomy-presets';
import type { AppSession } from '../../types/domain';

describe('Staff RBAC Permissions & Route/Tab Gating', () => {
  it('grants full access to Owner (CUSTOMER) and MASTER_ADMIN', () => {
    const owner: AppSession = {
      role: 'CUSTOMER',
      email: 'owner@warung.id',
      fullName: 'Pemilik Warung',
      customerId: 'cust-1',
    };
    assert.equal(canAccessRouteWithStaffPermissions('/staff', owner), true);
    assert.equal(canAccessRouteWithStaffPermissions('/accounting', owner), true);
    assert.equal(canAccessCatalogTab('STOCK_ADJUSTMENTS', owner), true);
    assert.equal(getDefaultHomeRouteForSession(owner), '/dashboard');
  });

  it('restricts Kasir-only staff strictly to POS and blocks Accounting, Expenses, Catalog & Staff Admin', () => {
    const kasir: AppSession = {
      role: 'STAFF',
      email: 'kasir@warung.id',
      fullName: 'Rina Kasir',
      staffId: 'stf-1',
      staffTenantId: 't-sembako',
      staffRoleTitle: 'Kasir',
      staffPermissions: ['POS_CASHIER'],
    };

    assert.equal(getDefaultHomeRouteForSession(kasir), '/pos');
    assert.equal(canAccessRouteWithStaffPermissions('/pos', kasir), true);
    assert.equal(canAccessRouteWithStaffPermissions('/catalog', kasir), false);
    assert.equal(canAccessRouteWithStaffPermissions('/expenses', kasir), false);
    assert.equal(canAccessRouteWithStaffPermissions('/accounting', kasir), false);
    assert.equal(canAccessRouteWithStaffPermissions('/tax', kasir), false);
    assert.equal(canAccessRouteWithStaffPermissions('/staff', kasir), false);
    assert.equal(canAccessCatalogTab('STOCK_ADJUSTMENTS', kasir), false);
  });

  it('isolates Stock Opname (SO) staff to Stock Adjustments tab while blocking Restock & POS', () => {
    const soStaff: AppSession = {
      role: 'STAFF',
      email: 'so@warung.id',
      fullName: 'Budi SO',
      staffId: 'stf-2',
      staffTenantId: 't-sembako',
      staffRoleTitle: 'Petugas SO',
      staffPermissions: ['INVENTORY_OPNAME'],
    };

    assert.equal(getDefaultHomeRouteForSession(soStaff), '/catalog');
    assert.equal(canAccessRouteWithStaffPermissions('/catalog', soStaff), true);
    assert.equal(canAccessCatalogTab('STOCK_ADJUSTMENTS', soStaff), true);
    assert.equal(canAccessCatalogTab('STOCK_RAW', soStaff), false);
    assert.equal(canAccessCatalogTab('PRODUCTS', soStaff), false);
    assert.equal(canAccessRouteWithStaffPermissions('/pos', soStaff), false);
  });

  it('allows Akuntansi staff to access Accounting & Tax while blocking POS and Staff settings', () => {
    const accStaff: AppSession = {
      role: 'STAFF',
      email: 'akun@warung.id',
      fullName: 'Sari Akuntansi',
      staffId: 'stf-3',
      staffTenantId: 't-sembako',
      staffRoleTitle: 'Staf Akuntansi',
      staffPermissions: ['ACCOUNTING_TAX', 'EXPENSE_INPUT'],
    };

    assert.equal(hasStaffPermission(accStaff, 'ACCOUNTING_TAX'), true);
    assert.equal(canAccessRouteWithStaffPermissions('/accounting', accStaff), true);
    assert.equal(canAccessRouteWithStaffPermissions('/tax', accStaff), true);
    assert.equal(canAccessRouteWithStaffPermissions('/expenses', accStaff), true);
    assert.equal(canAccessRouteWithStaffPermissions('/pos', accStaff), false);
    assert.equal(canAccessRouteWithStaffPermissions('/staff', accStaff), false);
  });
});

describe('Catalog Taxonomy Presets & Auto Name Builder', () => {
  it('deduplicates taxonomy entries case-insensitively and composes clean product names', () => {
    const merged = mergeUniqueTaxonomyValues(['Bimoli', 'Gulaku'], ['bimoli', 'Tropical', '  Sania  ', '']);
    assert.deepEqual(merged, ['Bimoli', 'Gulaku', 'Tropical', 'Sania']);

    assert.equal(
      buildSuggestedProductName({ productType: 'Minyak Goreng', brand: 'Bimoli', sizeLabel: '2 L' }),
      'Minyak Goreng Bimoli 2 L'
    );
    assert.equal(
      buildSuggestedProductName({ productType: 'Telur Ayam', brand: 'Tanpa Merek / Curah', sizeLabel: '1 kg' }),
      'Telur Ayam 1 kg'
    );
  });
});
