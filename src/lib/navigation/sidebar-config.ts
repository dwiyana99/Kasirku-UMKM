/**
 * Pure, Vertical-Adaptive & Plan-Aware Sidebar Navigation Builder for KasirAkun UMKM (22 Active Verticals).
 *
 * Design principles:
 * 1. Show ONLY menus relevant to the active UMKM vertical & active subscription/add-ons
 *    (zero irrelevant or locked add-on clutter for everyday laypersons).
 * 2. Group complex warehouse/purchasing workflows (Kulakan Cepat, Purchase Order,
 *    Stock Opname, Multi-Branch Matrix & Transfers) cleanly inside the 'Gudang & Pembelian' dropdown.
 * 3. Place high-clarity situational items (Ringkasan, Notifikasi) in 'Utama',
 *    and daily customer/sales/specialized vertical operations in 'Transaksi & Pelanggan'
 *    so every business type sees an intuitive, clean sidebar.
 */

import type {
  AddOnModuleCode,
  AppSession,
  BusinessVertical,
  SubscriptionPlanCode,
} from '../../types/domain.ts';
import { getVerticalCapabilities } from '../catalog/recipe-bom-utils.ts';
import { getCrmVerticalCopy } from '../crm/customer-history-engine.ts';
import { canAccessRouteWithStaffPermissions } from '../rbac/staff-rbac.ts';
import { getVerticalMeta } from '../verticals/vertical-registry.ts';
import { verticalSupportsSalesReturns } from '../pos/sales-return-engine.ts';
import { verticalSupportsDigitalContracts } from '../contracts/digital-contract-engine.ts';

export type SidebarIconKey =
  | 'dashboard'
  | 'bell'
  | 'pos'
  | 'history'
  | 'users'
  | 'kost'
  | 'agro'
  | 'qr'
  | 'kitchen'
  | 'catalog'
  | 'warehouse'
  | 'expenses'
  | 'accounting'
  | 'tax'
  | 'ai'
  | 'payment'
  | 'billing'
  | 'staff'
  | 'activity'
  | 'settings'
  | 'master'
  | 'operations'
  | 'returns'
  | 'contracts'
  | 'globe';

export interface SidebarSubItem {
  path: string;
  label: string;
}

export interface SidebarNavItem {
  path: string;
  label: string;
  iconKey: SidebarIconKey;
  badgeCount?: number;
  children?: SidebarSubItem[];
}

export interface SidebarNavGroup {
  id: 'UTAMA' | 'TRANSAKSI' | 'STOK_GUDANG' | 'KEUANGAN' | 'PENGATURAN';
  title: string;
  items: SidebarNavItem[];
}

export interface BuildSidebarInput {
  vertical: BusinessVertical;
  plan: SubscriptionPlanCode;
  hasAddOn: (code: AddOnModuleCode) => boolean;
  session: Pick<AppSession, 'role' | 'staffPermissions'>;
  notifBadgeCount: number;
}

export function buildSidebarNavGroups(input: BuildSidebarInput): SidebarNavGroup[] {
  const { vertical, plan, hasAddOn, session, notifBadgeCount } = input;
  const verticalCaps = getVerticalCapabilities(vertical);
  const verticalMeta = getVerticalMeta(vertical);
  const crmCopy = getCrmVerticalCopy(vertical);
  const isMaster = session.role === 'MASTER_ADMIN';

  const hasPromoCrm = hasAddOn('ADDON_PROMO_CRM');
  const hasRestoQrKds = hasAddOn('ADDON_RESTO_QR_KDS');
  const hasPurchaseOrder = hasAddOn('ADDON_PURCHASE_ORDER');
  const hasInventoryPro = hasAddOn('ADDON_INVENTORY_PRO');
  const hasExtraBranch = hasAddOn('ADDON_EXTRA_BRANCH');
  const hasAccountingPro = hasAddOn('ADDON_ACCOUNTING_PRO');
  const hasTaxCoretax = hasAddOn('ADDON_TAX_CORETAX');
  const hasAiActive = hasAddOn('ADDON_AI_ASSISTANT');
  const hasNonCash = hasAddOn('ADDON_NON_CASH_PAYMENT');

  // 1. UTAMA — Situational overview & alerts
  const utamaItems: SidebarNavItem[] = [
    { path: '/dashboard', label: 'Ringkasan', iconKey: 'dashboard' },
    {
      path: '/notifications',
      label: 'Notifikasi',
      iconKey: 'bell',
      badgeCount: notifBadgeCount,
    },
  ];

  // 2. TRANSAKSI & PELANGGAN — Daily selling, specialized vertical workflow, history & customer relationships
  const supportsPromoMenu = verticalMeta.supportsPromoMenu;

  const promoLabel =
    vertical === 'WARUNG_SEMBAKO' ||
    vertical === 'TOKO_RETAIL' ||
    vertical === 'TOKO_BANGUNAN'
      ? 'Promo & Harga Grosir'
      : vertical === 'TOKO_FASHION'
      ? 'Promo & Diskon Artikel'
      : vertical === 'BARBERSHOP' ||
        vertical === 'SALON_KECANTIKAN' ||
        vertical === 'SPA_WELLNESS' ||
        vertical === 'BARBERSHOP_SALON'
      ? 'Promo & Member Perawatan'
      : 'Promo & Diskon';

  const customerItem: SidebarNavItem =
    hasPromoCrm && supportsPromoMenu
      ? {
          path: 'dd-pelanggan-crm',
          label: 'Pelanggan & CRM',
          iconKey: 'users',
          children: [
            { path: '/crm', label: crmCopy.sidebarLabelPro },
            { path: '/promo-crm', label: promoLabel },
          ],
        }
      : {
          path: '/crm',
          label: hasPromoCrm ? crmCopy.sidebarLabelPro : crmCopy.sidebarLabelLite,
          iconKey: 'users',
        };

  const transaksiItems: SidebarNavItem[] = [];

  if (vertical === 'KOST_KONTRAKAN') {
    transaksiItems.push(
      { path: '/kost', label: 'Kamar & Tagihan Kost', iconKey: 'kost' },
      { path: '/transactions', label: 'Riwayat Transaksi', iconKey: 'history' },
      customerItem
    );
  } else if (vertical === 'PETERNAKAN_PERTANIAN') {
    transaksiItems.push(
      { path: '/agro', label: 'Siklus Ternak & Panen', iconKey: 'agro' },
      { path: '/pos', label: 'Kasir Penjualan Panen', iconKey: 'pos' },
      { path: '/transactions', label: 'Riwayat Transaksi', iconKey: 'history' },
      customerItem
    );
  } else if (
    vertical === 'RENTAL_KENDARAAN' ||
    vertical === 'HOMESTAY_VILLA' ||
    vertical === 'SEWA_GARASI' ||
    vertical === 'BIMBEL_KURSUS_GYM'
  ) {
    // Pure specialized operational module without retail POS clutter
    transaksiItems.push(
      {
        path: '/operations',
        label: verticalMeta.dedicatedMenuLabel ?? 'Operasional Usaha',
        iconKey: vertical === 'HOMESTAY_VILLA' ? 'kost' : 'operations',
      },
      { path: '/transactions', label: 'Riwayat Transaksi', iconKey: 'history' },
      customerItem
    );
  } else if (vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN') {
    transaksiItems.push({ path: '/pos', label: 'Kasir POS', iconKey: 'pos' });
    if (hasRestoQrKds) {
      transaksiItems.push({
        path: 'dd-meja-dapur',
        label: 'Meja QR & Dapur',
        iconKey: 'qr',
        children: [
          { path: '/tables', label: 'Meja QR Self-Order' },
          { path: '/kitchen', label: 'Layar Dapur (KDS)' },
        ],
      });
    }
    transaksiItems.push(
      { path: '/transactions', label: 'Riwayat Transaksi', iconKey: 'history' },
      customerItem
    );
  } else {
    // Verticals with a dedicated workflow page AND/OR POS Kasir
    if (verticalMeta.dedicatedRoute === '/operations' && verticalMeta.dedicatedMenuLabel) {
      transaksiItems.push({
        path: '/operations',
        label: verticalMeta.dedicatedMenuLabel,
        iconKey: 'operations',
      });
    }
    if (verticalMeta.supportsPos) {
      transaksiItems.push({
        path: '/pos',
        label: verticalMeta.primarySalesLabel ?? 'Kasir POS',
        iconKey: 'pos',
      });
    }
    transaksiItems.push(
      { path: '/transactions', label: 'Riwayat Transaksi', iconKey: 'history' },
      customerItem
    );
  }

  // Vertical-gated Transaksi additions: Retur Penjualan (goods verticals) & Kontrak Digital (rental/service/property verticals)
  if (verticalSupportsSalesReturns(vertical)) {
    transaksiItems.push({
      path: '/returns',
      label: 'Retur Penjualan',
      iconKey: 'returns',
    });
  }
  if (verticalSupportsDigitalContracts(vertical, plan)) {
    transaksiItems.push({
      path: '/contracts',
      label: 'Kontrak Digital',
      iconKey: 'contracts',
    });
  }

  // 3. PRODUK & GUDANG — Strictly vertical-adaptive; PO, Opname & Branch Transfers neatly inside 'Gudang & Pembelian'
  let stokGudangTitle = 'Produk & Gudang';
  const stokGudangItems: SidebarNavItem[] = [];

  if (
    vertical === 'KOST_KONTRAKAN' ||
    vertical === 'RENTAL_KENDARAAN' ||
    vertical === 'HOMESTAY_VILLA' ||
    vertical === 'SEWA_GARASI'
  ) {
    // These asset/property rental verticals have no retail product warehouse or purchasing module
  } else if (vertical === 'FREELANCE' || vertical === 'BIMBEL_KURSUS_GYM') {
    stokGudangTitle = vertical === 'BIMBEL_KURSUS_GYM' ? 'Program & Kelas' : 'Katalog Jasa';
    stokGudangItems.push({
      path: 'dd-katalog',
      label: vertical === 'BIMBEL_KURSUS_GYM' ? 'Program & Membership' : 'Paket & Layanan Jasa',
      iconKey: 'catalog',
      children: [
        {
          path: '/catalog/products',
          label: vertical === 'BIMBEL_KURSUS_GYM' ? 'Daftar Program & Tarif' : 'Daftar Paket & Jasa',
        },
        {
          path: '/catalog/taxonomy',
          label: vertical === 'BIMBEL_KURSUS_GYM' ? 'Kategori Kelas' : 'Kategori Jasa',
        },
      ],
    });
  } else {
    // Stock-bearing verticals: Warung, Retail, Fashion, Bangunan, Manufaktur, Kedai, Restoran, Bakery,
    // Laundry, Cuci Kendaraan, Barbershop, Salon, SPA, Pet Shop, Sewa Lapangan (Kantin), Peternakan
    const isManufaktur = vertical === 'MANUFAKTUR_KECIL';
    const isBakery = vertical === 'BAKERY_CATERING';

    const katalogSubItems: SidebarSubItem[] = verticalCaps.supportsRawMaterialsAndBom
      ? [
          {
            path: '/catalog/products',
            label: isManufaktur
              ? 'Produk Jadi Siap Jual'
              : isBakery
              ? 'Kue, Box & Hampers'
              : 'Menu & Produk Jual',
          },
          ...(hasInventoryPro || isManufaktur
            ? [
                {
                  path: '/catalog/raw-materials',
                  label: isManufaktur ? 'Bahan Baku (Kain/Kayu)' : 'Bahan Mentah Dapur',
                },
                {
                  path: '/catalog/recipes',
                  label: isManufaktur ? 'Formula Bahan & HPP' : 'Resep BOM & HPP',
                },
              ]
            : []),
          { path: '/catalog/taxonomy', label: 'Kategori & Satuan' },
        ]
      : [
          {
            path: '/catalog/products',
            label:
              vertical === 'BARBERSHOP'
                ? 'Jasa Cukur & Pomade'
                : vertical === 'SALON_KECANTIKAN'
                ? 'Treatment Salon & Produk'
                : vertical === 'SPA_WELLNESS'
                ? 'Paket SPA & Aromaterapi'
                : vertical === 'LAUNDRY'
                ? 'Daftar Tarif Laundry'
                : vertical === 'CUCI_KENDARAAN'
                ? 'Paket Cuci & Produk'
                : vertical === 'TOKO_FASHION'
                ? 'Artikel Fashion & Ukuran'
                : vertical === 'TOKO_BANGUNAN'
                ? 'Material & Harga Grosir'
                : vertical === 'PET_SHOP'
                ? 'Pakan, Aksesoris & Grooming'
                : vertical === 'SEWA_LAPANGAN'
                ? 'Kantin & Sewa Alat'
                : vertical === 'PETERNAKAN_PERTANIAN'
                ? 'Hasil Panen & Pakan'
                : vertical === 'BARBERSHOP_SALON'
                ? 'Daftar Layanan & Produk'
                : 'Daftar Barang & Harga',
          },
          { path: '/catalog/taxonomy', label: 'Kategori, Merek & Satuan' },
        ];

    const katalogLabel = isManufaktur
      ? 'Produk & Bahan Baku'
      : verticalCaps.supportsRawMaterialsAndBom
      ? 'Menu & Resep'
      : vertical === 'BARBERSHOP'
      ? 'Jasa & Pomade'
      : vertical === 'SALON_KECANTIKAN'
      ? 'Treatment & Produk'
      : vertical === 'SPA_WELLNESS'
      ? 'Paket SPA & Oil'
      : vertical === 'LAUNDRY'
      ? 'Tarif & Deterjen'
      : vertical === 'CUCI_KENDARAAN'
      ? 'Paket Cuci'
      : vertical === 'TOKO_FASHION'
      ? 'Katalog Fashion'
      : vertical === 'TOKO_BANGUNAN'
      ? 'Katalog Material'
      : vertical === 'PET_SHOP'
      ? 'Katalog Pet Shop'
      : vertical === 'SEWA_LAPANGAN'
      ? 'Kantin & Alat'
      : vertical === 'PETERNAKAN_PERTANIAN'
      ? 'Katalog Panen & Pakan'
      : 'Katalog Barang';

    const restockLabel = isManufaktur
      ? 'Belanja Bahan & Catatan'
      : verticalCaps.supportsRawMaterialsAndBom
      ? 'Belanja Bahan & Catatan'
      : vertical === 'BARBERSHOP' ||
        vertical === 'SALON_KECANTIKAN' ||
        vertical === 'SPA_WELLNESS' ||
        vertical === 'BARBERSHOP_SALON'
      ? 'Belanja Produk & Catatan'
      : vertical === 'LAUNDRY'
      ? 'Belanja Deterjen & Catatan'
      : vertical === 'CUCI_KENDARAAN'
      ? 'Belanja Sampo & Catatan'
      : vertical === 'TOKO_BANGUNAN'
      ? 'Belanja Material & Catatan'
      : vertical === 'PETERNAKAN_PERTANIAN'
      ? 'Belanja Pakan & Catatan'
      : 'Kulakan & Catatan Belanja';

    // Always place Monitor Stok, Kulakan & Catatan Belanja, PO, Stock Opname, and Multi-Branch inside 'Gudang & Pembelian'
    const gudangPembelianSubItems: SidebarSubItem[] = [
      { path: '/inventory/restock-monitor', label: 'Monitor Stok & Restok' },
      { path: '/purchasing/restock', label: restockLabel },
      ...(hasPurchaseOrder
        ? [{ path: '/purchasing/po', label: 'Purchase Order (PO)' }]
        : []),
      ...(hasInventoryPro ? [{ path: '/opname', label: 'Stock Opname' }] : []),
      ...(hasExtraBranch
        ? [
            { path: '/branches/matrix', label: 'Stok per Cabang' },
            { path: '/branches/transfers', label: 'Transfer Antar Cabang' },
          ]
        : []),
    ];

    stokGudangItems.push(
      {
        path: 'dd-katalog',
        label: katalogLabel,
        iconKey: 'catalog',
        children: katalogSubItems,
      },
      {
        path: 'dd-gudang-pembelian',
        label: 'Gudang & Pembelian',
        iconKey: 'warehouse',
        children: gudangPembelianSubItems,
      }
    );
  }

  // 4. KEUANGAN — Active financial & tax tools only (no locked add-on noise)
  const keuanganItems: SidebarNavItem[] = [
    { path: '/expenses', label: 'Biaya Operasional', iconKey: 'expenses' },
    {
      path: '/accounting',
      label: hasAccountingPro ? 'Akuntansi & Laporan' : 'Laporan Laba & Kas',
      iconKey: 'accounting',
    },
    ...(hasTaxCoretax
      ? [{ path: '/tax', label: 'Pajak DJP & Daerah', iconKey: 'tax' as const }]
      : []),
    ...(hasAiActive
      ? [{ path: '/ai-assistant', label: 'Asisten Bisnis AI', iconKey: 'ai' as const }]
      : []),
  ];

  // 5. PENGATURAN — Account, payments, team & plan management (Pengaturan Usaha always first for fast access)
  const pengaturanItems: SidebarNavItem[] = [
    { path: '/settings/custom-fields', label: 'Pengaturan Usaha', iconKey: 'settings' },
    ...(hasNonCash
      ? [{ path: '/settings/payments', label: 'Pembayaran & QRIS', iconKey: 'payment' as const }]
      : []),
    ...(plan !== 'LITE'
      ? [{ path: '/staff', label: 'Pegawai & Hak Akses', iconKey: 'staff' as const }]
      : []),
    { path: '/settings/landing-page', label: 'Landing Page Usaha', iconKey: 'globe' },
    { path: '/billing', label: 'Paket & Add-On', iconKey: 'billing' },
    ...(plan !== 'LITE' || isMaster
      ? [{ path: '/activity-log', label: 'Log Aktivitas', iconKey: 'activity' as const }]
      : []),
    ...(isMaster
      ? [{ path: '/master-admin', label: 'Master Admin Console', iconKey: 'master' as const }]
      : []),
  ];

  const filterAllowed = (items: SidebarNavItem[]): SidebarNavItem[] =>
    items
      .map((item) => {
        if (item.children) {
          const allowedChildren = item.children.filter((sub) =>
            canAccessRouteWithStaffPermissions(sub.path, session)
          );
          return allowedChildren.length > 0 ? { ...item, children: allowedChildren } : null;
        }
        return canAccessRouteWithStaffPermissions(item.path, session) ? item : null;
      })
      .filter((x): x is SidebarNavItem => x !== null);

  const groups: SidebarNavGroup[] = [
    { id: 'UTAMA', title: 'Utama', items: filterAllowed(utamaItems) },
    { id: 'TRANSAKSI', title: 'Transaksi & Pelanggan', items: filterAllowed(transaksiItems) },
    { id: 'STOK_GUDANG', title: stokGudangTitle, items: filterAllowed(stokGudangItems) },
    { id: 'KEUANGAN', title: 'Keuangan', items: filterAllowed(keuanganItems) },
    { id: 'PENGATURAN', title: 'Pengaturan', items: filterAllowed(pengaturanItems) },
  ];

  return groups.filter((g) => g.items.length > 0);
}
