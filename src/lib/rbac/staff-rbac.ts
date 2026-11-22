/**
 * KasirAkun UMKM — Staff Role-Based Access Control (RBAC) & Permission Gating
 * Supports granular employee permissions across all business verticals (Warung Sembako, Kedai, Restoran, Freelance).
 */

import type { AppSession, BusinessVertical, StaffPermission } from '../../types/domain';

export interface StaffPermissionMeta {
  code: StaffPermission;
  label: string;
  shortLabel: string;
  description: string;
  fbOnly?: boolean;
  stockOnly?: boolean;
}

export const STAFF_PERMISSIONS_META: StaffPermissionMeta[] = [
  {
    code: 'POS_CASHIER',
    label: 'Kasir POS & Penjualan',
    shortLabel: 'Kasir POS',
    description: 'Scan barcode, input transaksi pelanggan, terima pembayaran & cetak struk.',
  },
  {
    code: 'INVENTORY_RESTOCK',
    label: 'Pembelian / Restok Barang & Upload Nota',
    shortLabel: 'Restok & Nota',
    description: 'Input kulakan/belanja supplier, update HPP Moving Average & unggah bukti nota.',
    stockOnly: true,
  },
  {
    code: 'INVENTORY_OPNAME',
    label: 'Stock Opname (SO) & Penyesuaian Stok',
    shortLabel: 'Stock Opname',
    description: 'Lakukan Bulk Stock Opname, catat barang rusak/hilang/susut & audit selisih stok.',
    stockOnly: true,
  },
  {
    code: 'CATALOG_MANAGE',
    label: 'Kelola Katalog Barang, Kategori & Master Atribut',
    shortLabel: 'Kelola Barang',
    description: 'Tambah/edit/hapus barang, kategori, jenis, merek, ukuran, satuan & resep BOM.',
  },
  {
    code: 'EXPENSE_INPUT',
    label: 'Penginputan Biaya Operasional',
    shortLabel: 'Biaya Operasional',
    description: 'Catat pengeluaran toko (listrik, gaji, sewa, kemasan) beserta potongan pajak.',
  },
  {
    code: 'ACCOUNTING_TAX',
    label: 'Akuntansi, Laporan Keuangan & Pelaporan Pajak',
    shortLabel: 'Akuntansi & Pajak',
    description: 'Akses Neraca, Laba Rugi 3-Tier, Jurnal Umum, Depresiasi & SPT/Coretax DJP.',
  },
  {
    code: 'TABLES_KITCHEN',
    label: 'Meja QR Self-Order & Layar Dapur',
    shortLabel: 'Meja & Dapur',
    description: 'Kelola QR meja pelanggan dan update status antrean pesanan dapur (F&B).',
    fbOnly: true,
  },
];

export interface StaffRolePreset {
  id: string;
  roleTitle: string;
  description: string;
  permissions: StaffPermission[];
}

export const STAFF_ROLE_PRESETS: StaffRolePreset[] = [
  {
    id: 'KASIR',
    roleTitle: 'Kasir',
    description: 'Hanya dapat membuka Kasir POS & melayani transaksi penjualan.',
    permissions: ['POS_CASHIER'],
  },
  {
    id: 'GUDANG_RESTOK',
    roleTitle: 'Admin Gudang / Kulakan',
    description: 'Melakukan pembelian/restok supplier, unggah bukti nota & kelola daftar barang.',
    permissions: ['INVENTORY_RESTOCK', 'CATALOG_MANAGE'],
  },
  {
    id: 'PETUGAS_SO',
    roleTitle: 'Petugas Stock Opname (SO)',
    description: 'Fokus pengecekan fisik gudang & penyesuaian stok (Stock Adjustments).',
    permissions: ['INVENTORY_OPNAME'],
  },
  {
    id: 'ADMIN_OPS',
    roleTitle: 'Admin Operasional',
    description: 'Input biaya operasional harian & pembelian stok barang.',
    permissions: ['EXPENSE_INPUT', 'INVENTORY_RESTOCK'],
  },
  {
    id: 'AKUNTANSI',
    roleTitle: 'Staf Akuntansi & Pajak',
    description: 'Fokus laporan keuangan 3-Tier, jurnal, cross-check nota & pelaporan pajak DJP.',
    permissions: ['ACCOUNTING_TAX', 'EXPENSE_INPUT'],
  },
];

export function getAvailablePermissionsForVertical(vertical: BusinessVertical): StaffPermissionMeta[] {
  const isFb = vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN';
  const nonStockVerticals: BusinessVertical[] = [
    'FREELANCE',
    'KOST_KONTRAKAN',
    'HOMESTAY_VILLA',
    'RENTAL_KENDARAAN',
    'SEWA_GARASI',
    'BIMBEL_KURSUS_GYM',
  ];
  const hasStock = !nonStockVerticals.includes(vertical);
  return STAFF_PERMISSIONS_META.filter((p) => {
    if (p.fbOnly && !isFb) return false;
    if (p.stockOnly && !hasStock) return false;
    return true;
  });
}

export function isOwnerOrMaster(session: Pick<AppSession, 'role'>): boolean {
  return session.role === 'CUSTOMER' || session.role === 'MASTER_ADMIN';
}

export function hasStaffPermission(
  session: Pick<AppSession, 'role' | 'staffPermissions'>,
  permission: StaffPermission
): boolean {
  if (session.role === 'MASTER_ADMIN' || session.role === 'CUSTOMER') {
    return true;
  }
  if (session.role === 'STAFF') {
    return Boolean(session.staffPermissions?.includes(permission));
  }
  return false;
}

export function canAccessAnyCatalogTab(
  session: Pick<AppSession, 'role' | 'staffPermissions'>
): boolean {
  return (
    hasStaffPermission(session, 'CATALOG_MANAGE') ||
    hasStaffPermission(session, 'INVENTORY_RESTOCK') ||
    hasStaffPermission(session, 'INVENTORY_OPNAME')
  );
}

export type CatalogTabId =
  | 'PRODUCTS'
  | 'STOCK_RAW'
  | 'STOCK_ADJUSTMENTS'
  | 'BOM_RECIPES'
  | 'CATEGORIES';

export function canAccessCatalogTab(
  tab: CatalogTabId,
  session: Pick<AppSession, 'role' | 'staffPermissions'>
): boolean {
  if (isOwnerOrMaster(session)) return true;
  switch (tab) {
    case 'PRODUCTS':
    case 'CATEGORIES':
    case 'BOM_RECIPES':
      return hasStaffPermission(session, 'CATALOG_MANAGE');
    case 'STOCK_RAW':
      return hasStaffPermission(session, 'INVENTORY_RESTOCK');
    case 'STOCK_ADJUSTMENTS':
      return hasStaffPermission(session, 'INVENTORY_OPNAME');
    default:
      return false;
  }
}

export function canAccessRouteWithStaffPermissions(
  route: string,
  session: Pick<AppSession, 'role' | 'staffPermissions'>
): boolean {
  if (session.role === 'GUEST') return false;
  if (isOwnerOrMaster(session)) return true;

  switch (route) {
    case '/dashboard':
    case '/notifications':
      return true;
    case '/pos':
    case '/transactions':
    case '/promo-crm':
    case '/crm':
      return hasStaffPermission(session, 'POS_CASHIER');
    case '/operations':
      return (
        hasStaffPermission(session, 'POS_CASHIER') ||
        hasStaffPermission(session, 'CATALOG_MANAGE') ||
        hasStaffPermission(session, 'INVENTORY_RESTOCK')
      );
    case '/kost':
      return hasStaffPermission(session, 'POS_CASHIER') || hasStaffPermission(session, 'ACCOUNTING_TAX');
    case '/agro':
      return hasStaffPermission(session, 'INVENTORY_RESTOCK') || hasStaffPermission(session, 'CATALOG_MANAGE');
    case '/catalog':
      return canAccessAnyCatalogTab(session);
    case '/catalog/products':
    case '/catalog/taxonomy':
    case '/catalog/recipes':
      return hasStaffPermission(session, 'CATALOG_MANAGE');
    case '/catalog/raw-materials':
    case '/purchasing/restock':
      return hasStaffPermission(session, 'INVENTORY_RESTOCK');
    case '/branches':
    case '/branches/matrix':
    case '/branches/transfers':
    case '/purchasing':
    case '/purchasing/po':
      return hasStaffPermission(session, 'INVENTORY_RESTOCK') || hasStaffPermission(session, 'CATALOG_MANAGE');
    case '/opname':
      return hasStaffPermission(session, 'INVENTORY_OPNAME');
    case '/expenses':
      return hasStaffPermission(session, 'EXPENSE_INPUT');
    case '/accounting':
    case '/tax':
    case '/ai-assistant':
      return hasStaffPermission(session, 'ACCOUNTING_TAX');
    case '/tables':
    case '/kitchen':
      return hasStaffPermission(session, 'TABLES_KITCHEN');
    case '/staff':
    case '/activity-log':
    case '/settings/custom-fields':
    case '/settings/payments':
    case '/settings/plans':
    case '/billing':
    case '/master':
    case '/master-admin':
      return false;
    default:
      return true;
  }
}

export function getDefaultHomeRouteForSession(
  session: Pick<AppSession, 'role' | 'staffPermissions'>
): string {
  if (session.role === 'MASTER_ADMIN') return '/master-admin';
  if (session.role !== 'STAFF') return '/dashboard';

  if (hasStaffPermission(session, 'POS_CASHIER')) return '/pos';
  if (canAccessAnyCatalogTab(session)) return '/catalog';
  if (hasStaffPermission(session, 'EXPENSE_INPUT')) return '/expenses';
  if (hasStaffPermission(session, 'ACCOUNTING_TAX')) return '/accounting';
  if (hasStaffPermission(session, 'TABLES_KITCHEN')) return '/kitchen';
  return '/dashboard';
}
