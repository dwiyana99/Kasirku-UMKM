import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSidebarNavGroups, type SidebarNavGroup } from './sidebar-config';
import { tenantHasAddOn } from '../saas/hybrid-pricing';
import type { AddOnModuleCode, BusinessVertical, SubscriptionPlanCode } from '../../types/domain';

function makeHasAddOn(plan: SubscriptionPlanCode, activeAddOns: AddOnModuleCode[] = []) {
  const tenant = {
    subscriptionPlan: plan,
    activeAddOns,
  } as Parameters<typeof tenantHasAddOn>[0];
  return (code: AddOnModuleCode) => tenantHasAddOn(tenant, code);
}

function collectAllPaths(groups: SidebarNavGroup[]): string[] {
  const paths: string[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      paths.push(item.path);
      if (item.children) {
        for (const sub of item.children) {
          paths.push(sub.path);
        }
      }
    }
  }
  return paths;
}

const OWNER_SESSION = { role: 'CUSTOMER' as const };

test('Warung Sembako PRO places PO and Stock Opname strictly inside Gudang & Pembelian dropdown and hides F&B/Kost/Agro menus', () => {
  const groups = buildSidebarNavGroups({
    vertical: 'WARUNG_SEMBAKO',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO'),
    session: OWNER_SESSION,
    notifBadgeCount: 3,
  });

  const stokGroup = groups.find((g) => g.id === 'STOK_GUDANG');
  assert.ok(stokGroup, 'STOK_GUDANG group should exist for Warung Sembako');

  const gudangDropdown = stokGroup.items.find((i) => i.path === 'dd-gudang-pembelian');
  assert.ok(gudangDropdown, 'Gudang & Pembelian dropdown must exist');
  assert.equal(gudangDropdown.label, 'Gudang & Pembelian');

  const childPaths = (gudangDropdown.children ?? []).map((c) => c.path);
  assert.ok(childPaths.includes('/purchasing/restock'));
  assert.ok(childPaths.includes('/purchasing/po'), 'PO must be inside Gudang & Pembelian');
  assert.ok(childPaths.includes('/opname'), 'Stock Opname must be inside Gudang & Pembelian');

  // Ensure PO and Opname are NOT top-level items
  const topLevelPaths = groups.flatMap((g) => g.items.map((i) => i.path));
  assert.ok(!topLevelPaths.includes('/purchasing/po'));
  assert.ok(!topLevelPaths.includes('/opname'));

  // Irrelevant vertical features must be hidden
  const allPaths = collectAllPaths(groups);
  assert.ok(!allPaths.includes('/tables'));
  assert.ok(!allPaths.includes('/kitchen'));
  assert.ok(!allPaths.includes('/catalog/recipes'));
  assert.ok(!allPaths.includes('/catalog/raw-materials'));
  assert.ok(!allPaths.includes('/kost'));
  assert.ok(!allPaths.includes('/agro'));
  assert.ok(!allPaths.includes('/ai-assistant'), 'Unpurchased AI add-on must stay hidden');
  assert.ok(!allPaths.includes('/tax'), 'Unpurchased Tax Coretax add-on on PRO must stay hidden');
});

test('Warung Sembako LITE keeps sidebar ultra-simple: no PO, no Opname, no locked menus, and clean Notifikasi + Kontak Pelanggan placement', () => {
  const groups = buildSidebarNavGroups({
    vertical: 'WARUNG_SEMBAKO',
    plan: 'LITE',
    hasAddOn: makeHasAddOn('LITE'),
    session: OWNER_SESSION,
    notifBadgeCount: 2,
  });

  const utama = groups.find((g) => g.id === 'UTAMA');
  assert.deepEqual(
    utama?.items.map((i) => i.path),
    ['/dashboard', '/notifications']
  );
  assert.equal(utama?.items[1].badgeCount, 2);

  const transaksi = groups.find((g) => g.id === 'TRANSAKSI');
  assert.deepEqual(
    transaksi?.items.map((i) => i.path),
    ['/pos', '/transactions', '/crm']
  );

  const allPaths = collectAllPaths(groups);
  assert.ok(!allPaths.includes('/purchasing/po'), 'LITE must not show PO');
  assert.ok(!allPaths.includes('/opname'), 'LITE must not show Stock Opname');
  assert.ok(!allPaths.includes('/promo-crm'), 'LITE must not show Promo/CRM Pro');
  assert.ok(!allPaths.includes('/settings/payments'), 'LITE cash-only hides Payment Settings');
  assert.ok(!allPaths.includes('/staff'), 'LITE hides Staff RBAC');
});

test('KOST_KONTRAKAN hides all inventory, POS, PO, Opname, and F&B items completely', () => {
  const groups = buildSidebarNavGroups({
    vertical: 'KOST_KONTRAKAN',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO'),
    session: OWNER_SESSION,
    notifBadgeCount: 1,
  });

  assert.equal(
    groups.find((g) => g.id === 'STOK_GUDANG'),
    undefined,
    'Kost must not show Produk & Gudang section'
  );
  const allPaths = collectAllPaths(groups);
  assert.ok(allPaths.includes('/kost'));
  assert.ok(allPaths.includes('/transactions'));
  assert.ok(allPaths.includes('/crm'));
  assert.ok(!allPaths.includes('/pos'));
  assert.ok(!allPaths.includes('/purchasing/po'));
  assert.ok(!allPaths.includes('/opname'));
  assert.ok(!allPaths.includes('/promo-crm'));
});

test('FREELANCE hides Gudang & Pembelian, PO, and Opname while showing Katalog Jasa and Daftar Klien', () => {
  const groups = buildSidebarNavGroups({
    vertical: 'FREELANCE',
    plan: 'EXPERT',
    hasAddOn: makeHasAddOn('EXPERT'),
    session: OWNER_SESSION,
    notifBadgeCount: 0,
  });

  const allPaths = collectAllPaths(groups);
  assert.ok(allPaths.includes('/pos'));
  assert.ok(allPaths.includes('/catalog/products'));
  assert.ok(!allPaths.includes('dd-gudang-pembelian'));
  assert.ok(!allPaths.includes('/purchasing/po'));
  assert.ok(!allPaths.includes('/opname'));
  assert.ok(!allPaths.includes('/tables'));
  assert.ok(allPaths.includes('/tax'), 'EXPERT includes Tax Coretax');
});

test('RESTORAN with QR/KDS groups Meja QR & Layar Dapur cleanly and includes Bahan Mentah & Resep BOM when Inventory Pro is active', () => {
  const groups = buildSidebarNavGroups({
    vertical: 'RESTORAN',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO', ['ADDON_RESTO_QR_KDS']),
    session: OWNER_SESSION,
    notifBadgeCount: 0,
  });

  const allPaths = collectAllPaths(groups);
  assert.ok(allPaths.includes('dd-meja-dapur'));
  assert.ok(allPaths.includes('/tables'));
  assert.ok(allPaths.includes('/kitchen'));
  assert.ok(allPaths.includes('/catalog/raw-materials'));
  assert.ok(allPaths.includes('/catalog/recipes'));
  assert.ok(allPaths.includes('dd-pelanggan-crm'));
});

test('Specialized verticals expose exact tailored menus and hide irrelevant modules', () => {
  const laundryGroups = buildSidebarNavGroups({
    vertical: 'LAUNDRY',
    plan: 'LITE',
    hasAddOn: makeHasAddOn('LITE'),
    session: OWNER_SESSION,
    notifBadgeCount: 1,
  });
  assert.ok(collectAllPaths(laundryGroups).includes('/operations'));
  assert.ok(!collectAllPaths(laundryGroups).includes('/purchasing/po'));

  const rentalGroups = buildSidebarNavGroups({
    vertical: 'RENTAL_KENDARAAN',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO'),
    session: OWNER_SESSION,
    notifBadgeCount: 0,
  });
  assert.equal(rentalGroups.some((g) => g.id === 'STOK_GUDANG'), false);
  assert.ok(collectAllPaths(rentalGroups).includes('/operations'));

  const homestayGroups = buildSidebarNavGroups({
    vertical: 'HOMESTAY_VILLA',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO'),
    session: OWNER_SESSION,
    notifBadgeCount: 0,
  });
  assert.equal(homestayGroups.some((g) => g.id === 'STOK_GUDANG'), false);
  assert.ok(collectAllPaths(homestayGroups).includes('/operations'));

  const mfgGroups = buildSidebarNavGroups({
    vertical: 'MANUFAKTUR_KECIL',
    plan: 'PRO',
    hasAddOn: makeHasAddOn('PRO'),
    session: OWNER_SESSION,
    notifBadgeCount: 0,
  });
  assert.ok(collectAllPaths(mfgGroups).includes('/operations'));
  assert.ok(collectAllPaths(mfgGroups).includes('/catalog/raw-materials'));
});

test('Every UMKM vertical (all 22 active + legacy) only exposes valid non-empty groups', () => {
  const verticals: BusinessVertical[] = [
    'WARUNG_SEMBAKO',
    'TOKO_RETAIL',
    'TOKO_FASHION',
    'TOKO_BANGUNAN',
    'MANUFAKTUR_KECIL',
    'BARBERSHOP',
    'SALON_KECANTIKAN',
    'SPA_WELLNESS',
    'BARBERSHOP_SALON',
    'KEDAI_MAKAN',
    'RESTORAN',
    'BAKERY_CATERING',
    'LAUNDRY',
    'CUCI_KENDARAAN',
    'RENTAL_KENDARAAN',
    'SEWA_LAPANGAN',
    'PET_SHOP',
    'BIMBEL_KURSUS_GYM',
    'HOMESTAY_VILLA',
    'SEWA_GARASI',
    'FREELANCE',
    'KOST_KONTRAKAN',
    'PETERNAKAN_PERTANIAN',
  ];

  for (const vertical of verticals) {
    const groups = buildSidebarNavGroups({
      vertical,
      plan: 'BASIC',
      hasAddOn: makeHasAddOn('BASIC'),
      session: OWNER_SESSION,
      notifBadgeCount: 0,
    });
    assert.ok(groups.length >= 4, `Expected >= 4 groups for ${vertical}`);
    for (const g of groups) {
      assert.ok(g.items.length > 0, `Group ${g.id} must not be empty for ${vertical}`);
    }
  }
});
