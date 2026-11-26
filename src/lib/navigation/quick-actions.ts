/**
 * Pure, Vertical-Adaptive & Plan-Aware Primary Quick Actions and Onboarding Checklist Engine.
 * Designed for non-tech-savvy UMKM owners so the 3 core tasks (POS/Sales, Stock/Catalog, Reports)
 * are always 1-tap reachable, consistent across Desktop and Mobile, and tailored to active plan & vertical.
 */

import type {
  AddOnModuleCode,
  AppSession,
  BusinessVertical,
  SubscriptionPlanCode,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import { canAccessRouteWithStaffPermissions } from '../rbac/staff-rbac.ts';
import { getVerticalMeta } from '../verticals/vertical-registry.ts';
import { verticalSupportsDigitalContracts } from '../contracts/digital-contract-engine.ts';

export type QuickActionIconKey =
  | 'dashboard'
  | 'pos'
  | 'catalog'
  | 'accounting'
  | 'kost'
  | 'agro'
  | 'operations'
  | 'history'
  | 'contracts';

export interface PrimaryNavAction {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  iconKey: QuickActionIconKey;
  emphasis?: 'primary' | 'default';
}

export interface AdaptiveQuickStartStep {
  id: string;
  stepNumber: 1 | 2 | 3;
  title: string;
  description: string;
  done: boolean;
  path: string;
}

function resolvePrimarySalesTarget(vertical: BusinessVertical): {
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  iconKey: QuickActionIconKey;
} {
  const meta = getVerticalMeta(vertical);
  if (vertical === 'KOST_KONTRAKAN') {
    return {
      label: 'Kamar & Tagihan Kost',
      shortLabel: 'Kamar',
      description: 'Cek kamar kosong, penghuni, dan catat bayar sewa.',
      path: '/kost',
      iconKey: 'kost',
    };
  }
  if (vertical === 'PETERNAKAN_PERTANIAN') {
    return {
      label: 'Siklus Ternak & Panen',
      shortLabel: 'Ternak',
      description: 'Catat pakan, bibit, dan hasil panen per batch.',
      path: '/agro',
      iconKey: 'agro',
    };
  }
  if (vertical === 'RENTAL_KENDARAAN') {
    return {
      label: meta.dedicatedMenuLabel || 'Armada & Kontrak Sewa',
      shortLabel: 'Armada',
      description: 'Cek kendaraan siap sewa, catat kontrak baru, dan jadwal kembali.',
      path: '/operations',
      iconKey: 'operations',
    };
  }
  if (vertical === 'HOMESTAY_VILLA') {
    return {
      label: meta.dedicatedMenuLabel || 'Kalender Unit & Booking',
      shortLabel: 'Kamar',
      description: 'Kelola check-in/out tamu, ketersediaan villa, dan status bersih-bersih.',
      path: '/operations',
      iconKey: 'kost',
    };
  }
  if (vertical === 'SEWA_GARASI') {
    return {
      label: meta.dedicatedMenuLabel || 'Peta Slot Garasi',
      shortLabel: 'Garasi',
      description: 'Pantau slot parkir terisi/kosong, jatuh tempo bulanan, dan plat mobil.',
      path: '/operations',
      iconKey: 'operations',
    };
  }
  if (vertical === 'BIMBEL_KURSUS_GYM') {
    return {
      label: meta.dedicatedMenuLabel || 'Tagihan SPP & Absensi',
      shortLabel: 'SPP & Kelas',
      description: 'Kelola iuran SPP/member bulanan, absensi kelas, dan honor pengajar.',
      path: '/operations',
      iconKey: 'operations',
    };
  }
  if (vertical === 'FREELANCE') {
    return {
      label: 'Buat Tagihan / Kasir',
      shortLabel: 'Tagihan',
      description: 'Terbitkan nota proyek klien dan catat pembayaran.',
      path: '/pos',
      iconKey: 'pos',
    };
  }
  if (vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN') {
    return {
      label: 'Buka Kasir POS',
      shortLabel: 'Kasir',
      description: 'Catat pesanan pelanggan, dine-in, atau bawa pulang.',
      path: '/pos',
      iconKey: 'pos',
    };
  }
  return {
    label: meta.primarySalesLabel || 'Buka Kasir POS',
    shortLabel: 'Kasir',
    description: 'Scan barcode atau pilih barang untuk cetak nota cepat.',
    path: '/pos',
    iconKey: 'pos',
  };
}

function resolvePrimaryCatalogTarget(
  vertical: BusinessVertical,
  plan: SubscriptionPlanCode,
): {
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  iconKey: QuickActionIconKey;
} {
  if (vertical === 'KOST_KONTRAKAN') {
    return {
      label: 'Riwayat Pembayaran',
      shortLabel: 'Riwayat',
      description: 'Lihat riwayat pembayaran sewa dan cetak ulang kuitansi.',
      path: '/transactions',
      iconKey: 'history',
    };
  }
  if (
    vertical === 'RENTAL_KENDARAAN' ||
    vertical === 'HOMESTAY_VILLA' ||
    vertical === 'SEWA_GARASI'
  ) {
    if (verticalSupportsDigitalContracts(vertical, plan)) {
      return {
        label: 'Kontrak & Perjanjian',
        shortLabel: 'Kontrak',
        description: 'Buat surat sewa digital siap kirim via WhatsApp.',
        path: '/contracts',
        iconKey: 'contracts',
      };
    }
    return {
      label: 'Riwayat Transaksi',
      shortLabel: 'Riwayat',
      description: 'Cek semua nota sewa dan status pembayaran pelanggan.',
      path: '/transactions',
      iconKey: 'history',
    };
  }
  if (vertical === 'FREELANCE' || vertical === 'BIMBEL_KURSUS_GYM') {
    return {
      label: vertical === 'BIMBEL_KURSUS_GYM' ? 'Program & Tarif' : 'Daftar Layanan',
      shortLabel: 'Layanan',
      description: 'Atur paket layanan dan tarif yang ditawarkan ke klien.',
      path: '/catalog/products',
      iconKey: 'catalog',
    };
  }
  if (
    vertical === 'KEDAI_MAKAN' ||
    vertical === 'RESTORAN' ||
    vertical === 'BAKERY_CATERING'
  ) {
    return {
      label: 'Menu & Stok Bahan',
      shortLabel: 'Menu',
      description:
        plan === 'LITE'
          ? 'Tambah daftar menu dan atur harga jual harian.'
          : 'Kelola menu, stok bahan baku, dan takaran resep.',
      path: '/catalog/products',
      iconKey: 'catalog',
    };
  }
  if (
    vertical === 'BARBERSHOP' ||
    vertical === 'SALON_KECANTIKAN' ||
    vertical === 'SPA_WELLNESS' ||
    vertical === 'BARBERSHOP_SALON' ||
    vertical === 'LAUNDRY' ||
    vertical === 'CUCI_KENDARAAN'
  ) {
    return {
      label: 'Daftar Layanan & Harga',
      shortLabel: 'Layanan',
      description: 'Atur layanan, harga, dan produk perawatan toko.',
      path: '/catalog/products',
      iconKey: 'catalog',
    };
  }
  return {
    label: 'Stok & Katalog Barang',
    shortLabel: 'Stok',
    description:
      plan === 'LITE'
        ? 'Tambah barang jualan, harga jual, dan cek sisa stok.'
        : 'Kelola stok barang, barcode, harga grosir, dan import CSV.',
    path: '/catalog/products',
    iconKey: 'catalog',
  };
}

function resolvePrimaryReportTarget(
  plan: SubscriptionPlanCode,
  hasAccountingPro: boolean,
): {
  label: string;
  shortLabel: string;
  description: string;
  path: string;
  iconKey: QuickActionIconKey;
} {
  if (plan === 'LITE' && !hasAccountingPro) {
    return {
      label: 'Laporan Laba & Kas',
      shortLabel: 'Laporan',
      description: 'Lihat uang masuk, uang keluar, dan untung bersih hari ini.',
      path: '/accounting',
      iconKey: 'accounting',
    };
  }
  return {
    label: 'Laporan Keuangan',
    shortLabel: 'Laporan',
    description: 'Pantau Laba Rugi, Neraca, Arus Kas, dan Jurnal otomatis.',
    path: '/accounting',
    iconKey: 'accounting',
  };
}

/**
 * Builds the 3 consistent Primary Action cards on the Dashboard (POS, Stok/Katalog, Laporan),
 * respecting active UMKM vertical, subscription plan, and staff RBAC permissions.
 */
export function buildDashboardQuickActions(input: {
  vertical: BusinessVertical;
  plan: SubscriptionPlanCode;
  hasAddOn: (code: AddOnModuleCode) => boolean;
  session: Pick<AppSession, 'role' | 'staffPermissions'>;
}): PrimaryNavAction[] {
  const { vertical, plan, hasAddOn, session } = input;
  const sales = resolvePrimarySalesTarget(vertical);
  const catalog = resolvePrimaryCatalogTarget(vertical, plan);
  const report = resolvePrimaryReportTarget(plan, hasAddOn('ADDON_ACCOUNTING_PRO'));

  const candidates: PrimaryNavAction[] = [
    {
      id: 'primary-sales',
      ...sales,
      emphasis: 'primary',
    },
    {
      id: 'primary-catalog',
      ...catalog,
      emphasis: 'default',
    },
    {
      id: 'primary-report',
      ...report,
      emphasis: 'default',
    },
  ];

  return candidates.filter((item) => canAccessRouteWithStaffPermissions(item.path, session));
}

/**
 * Builds the 4 consistent Mobile Bottom Navigation items (Ringkasan, Kasir/Operasional, Stok/Katalog, Laporan)
 * plus a 5th 'Menu' button rendered by AppShell.
 */
export function buildMobileBottomNavItems(input: {
  vertical: BusinessVertical;
  plan: SubscriptionPlanCode;
  hasAddOn: (code: AddOnModuleCode) => boolean;
  session: Pick<AppSession, 'role' | 'staffPermissions'>;
}): PrimaryNavAction[] {
  const { vertical, plan, hasAddOn, session } = input;
  const sales = resolvePrimarySalesTarget(vertical);
  const catalog = resolvePrimaryCatalogTarget(vertical, plan);
  const report = resolvePrimaryReportTarget(plan, hasAddOn('ADDON_ACCOUNTING_PRO'));

  const items: PrimaryNavAction[] = [];

  if (canAccessRouteWithStaffPermissions('/dashboard', session)) {
    items.push({
      id: 'mobile-dashboard',
      label: 'Ringkasan',
      shortLabel: 'Ringkasan',
      description: 'Ringkasan usaha harian',
      path: '/dashboard',
      iconKey: 'dashboard',
    });
  }

  if (canAccessRouteWithStaffPermissions(sales.path, session)) {
    items.push({
      id: 'mobile-sales',
      ...sales,
      emphasis: 'primary',
    });
  }

  if (canAccessRouteWithStaffPermissions(catalog.path, session)) {
    items.push({
      id: 'mobile-catalog',
      ...catalog,
    });
  }

  if (canAccessRouteWithStaffPermissions(report.path, session)) {
    items.push({
      id: 'mobile-report',
      ...report,
    });
  } else if (
    catalog.path !== '/transactions' &&
    canAccessRouteWithStaffPermissions('/transactions', session)
  ) {
    items.push({
      id: 'mobile-history',
      label: 'Riwayat',
      shortLabel: 'Riwayat',
      description: 'Riwayat nota penjualan',
      path: '/transactions',
      iconKey: 'history',
    });
  }

  return items.slice(0, 4);
}

/**
 * Builds a vertical- and plan-tailored 3-step quick-start checklist for fresh workspaces.
 */
export function buildAdaptiveQuickStartSteps(input: {
  workspace: TenantWorkspaceData;
  plan: SubscriptionPlanCode;
  hasAddOn: (code: AddOnModuleCode) => boolean;
  orderCount: number;
}): AdaptiveQuickStartStep[] {
  const { workspace, plan, hasAddOn, orderCount } = input;
  const vertical = workspace.tenant.vertical;
  const waReady = Boolean(workspace.tenant.settings?.businessWhatsappNumber?.trim());

  if (vertical === 'KOST_KONTRAKAN') {
    const roomsCount = (workspace.boardingRooms ?? []).length;
    const activeTenants = (workspace.boardingTenants ?? []).filter((t) => t.isActive).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Tambahkan Daftar Kamar Kost',
        description:
          roomsCount > 0
            ? `${roomsCount} kamar sudah terdaftar`
            : 'Input nomor kamar, tipe, dan tarif bulanan.',
        done: roomsCount > 0,
        path: '/kost',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Catat Penghuni & Tagihan Sewa',
        description:
          activeTenants > 0
            ? `${activeTenants} penghuni aktif tercatat`
            : 'Masukkan data penghuni agar tagihan bulanan tercatat rapi.',
        done: activeTenants > 0,
        path: '/kost',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Isi Nomor WhatsApp Pemilik',
        description: waReady
          ? 'Nomor WA siap untuk kirim tagihan dan kuitansi sewa.'
          : 'Aktifkan kirim pengingat sewa langsung lewat WhatsApp.',
        done: waReady,
        path: '/settings/custom-fields',
      },
    ];
  }

  if (vertical === 'PETERNAKAN_PERTANIAN') {
    const batchCount = (workspace.agroBatches ?? []).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Buat Batch Ternak / Tanam Pertama',
        description:
          batchCount > 0
            ? `${batchCount} batch siklus sudah tercatat`
            : 'Catat populasi bibit dan modal awal per siklus.',
        done: batchCount > 0,
        path: '/agro',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Catat Penjualan Hasil Panen',
        description:
          orderCount > 0
            ? `${orderCount} transaksi penjualan tercatat`
            : 'Coba catat 1 penjualan panen di kasir agar laba terhitung.',
        done: orderCount > 0,
        path: '/pos',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Cek Laporan Biaya & Laba',
        description: waReady
          ? 'Nomor WA aktif untuk rekap laporan harian.'
          : 'Atur nomor WhatsApp usaha untuk menerima rekap laporan.',
        done: waReady,
        path: '/settings/custom-fields',
      },
    ];
  }

  if (vertical === 'RENTAL_KENDARAAN') {
    const vehicleCount = (workspace.verticalOps?.rentalVehicles ?? []).length;
    const contractCount = (workspace.verticalOps?.rentalContracts ?? []).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Cek Daftar Armada & Tarif Harian',
        description:
          vehicleCount > 0
            ? `${vehicleCount} unit kendaraan sudah siap disewakan`
            : 'Tambahkan unit mobil/motor, plat nomor, dan tarif sewa.',
        done: vehicleCount > 0,
        path: '/operations',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Catat Kontrak Sewa Pertama',
        description:
          contractCount > 0
            ? `${contractCount} kontrak sewa sudah tercatat`
            : 'Buat kontrak sewa baru lengkap dengan jaminan dan jam kembali.',
        done: contractCount > 0,
        path: '/operations',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Isi Nomor WhatsApp Pemilik',
        description: waReady
          ? 'Nomor WA siap untuk kirim kontrak dan pengingat pengembalian.'
          : 'Aktifkan kirim info sewa dan pengingat kembali lewat WhatsApp.',
        done: waReady,
        path: '/settings/custom-fields?tab=payments_wa',
      },
    ];
  }

  if (vertical === 'HOMESTAY_VILLA') {
    const unitCount = (workspace.verticalOps?.homestayUnits ?? []).length;
    const bookingCount = (workspace.verticalOps?.homestayBookings ?? []).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Atur Daftar Kamar / Villa & Tarif',
        description:
          unitCount > 0
            ? `${unitCount} unit kamar/villa sudah terdaftar`
            : 'Masukkan nama unit, kapasitas tamu, dan tarif per malam.',
        done: unitCount > 0,
        path: '/operations',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Catat Booking Tamu Pertama',
        description:
          bookingCount > 0
            ? `${bookingCount} jadwal booking sudah tercatat`
            : 'Catat reservasi, DP masuk, dan tanggal check-in/out tamu.',
        done: bookingCount > 0,
        path: '/operations',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Isi Nomor WhatsApp Pemilik',
        description: waReady
          ? 'Nomor WA siap untuk kirim konfirmasi booking ke tamu.'
          : 'Aktifkan tombol kirim detail reservasi langsung ke WhatsApp tamu.',
        done: waReady,
        path: '/settings/custom-fields?tab=payments_wa',
      },
    ];
  }

  if (vertical === 'SEWA_GARASI') {
    const slotCount = (workspace.verticalOps?.garageSlots ?? []).length;
    const occupiedSlots = (workspace.verticalOps?.garageSlots ?? []).filter(
      (s) => s.status === 'TERISI'
    ).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Cek Daftar Slot Garasi & Tarif',
        description:
          slotCount > 0
            ? `${slotCount} slot parkir sudah tersedia`
            : 'Siapkan kode slot parkir dan tarif sewa bulanan.',
        done: slotCount > 0,
        path: '/operations',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Isi Data Penyewa & Jatuh Tempo',
        description:
          occupiedSlots > 0
            ? `${occupiedSlots} slot sudah terisi penyewa`
            : 'Catat nama penyewa, plat nomor mobil, dan tanggal jatuh tempo.',
        done: occupiedSlots > 0,
        path: '/operations',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Isi Nomor WhatsApp Pemilik',
        description: waReady
          ? 'Nomor WA siap untuk kirim pengingat jatuh tempo garasi.'
          : 'Aktifkan tombol kirim pengingat tagihan lewat WhatsApp.',
        done: waReady,
        path: '/settings/custom-fields?tab=payments_wa',
      },
    ];
  }

  if (vertical === 'BIMBEL_KURSUS_GYM') {
    const programCount = workspace.products.length;
    const sppCount = (workspace.verticalOps?.academyInvoices ?? []).length;
    return [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Atur Program Kelas / Paket Member',
        description:
          programCount > 0
            ? `${programCount} program / paket sudah terdaftar`
            : 'Tambahkan daftar kelas bimbingan, kursus, atau paket gym.',
        done: programCount > 0,
        path: '/catalog/products',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Catat Tagihan SPP & Absensi',
        description:
          sppCount > 0
            ? `${sppCount} tagihan SPP/member tercatat`
            : 'Kelola iuran bulanan siswa/member dan absensi hadir harian.',
        done: sppCount > 0,
        path: '/operations',
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Isi Nomor WhatsApp Usaha',
        description: waReady
          ? 'Nomor WA siap untuk kirim pengingat SPP ke orang tua/member.'
          : 'Aktifkan kirim pengingat tagihan SPP langsung lewat WhatsApp.',
        done: waReady,
        path: '/settings/custom-fields?tab=payments_wa',
      },
    ];
  }

  const salesTarget = resolvePrimarySalesTarget(vertical);
  const catalogTarget = resolvePrimaryCatalogTarget(vertical, plan);
  const productCount = workspace.products.length;
  const step1Done = productCount >= 3;
  const isFnbWithQr =
    (vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN') &&
    hasAddOn('ADDON_RESTO_QR_KDS');

  return [
    {
      id: 'step-1',
      stepNumber: 1,
      title:
        vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN'
          ? 'Isi Daftar Menu & Harga Jual'
          : `Isi ${catalogTarget.label}`,
      description: step1Done
        ? `${productCount} item sudah siap dijual`
        : 'Tambahkan minimal 3 item atau import cepat dari file CSV.',
      done: step1Done,
      path: catalogTarget.path,
    },
    {
      id: 'step-2',
      stepNumber: 2,
      title: isFnbWithQr
        ? 'Coba 1 Transaksi Kasir atau QR Meja'
        : 'Coba 1 Transaksi Pertama',
      description:
        orderCount > 0
          ? `${orderCount} transaksi pertama sudah masuk laporan`
          : `Buka ${salesTarget.shortLabel} dan catat penjualan pertama Anda.`,
      done: orderCount > 0,
      path: salesTarget.path,
    },
    {
      id: 'step-3',
      stepNumber: 3,
      title: 'Isi Nomor WhatsApp Usaha',
      description: waReady
        ? 'Nomor WA aktif untuk kirim struk dan rekap tutup kasir.'
        : 'Agar nota digital dan rekap harian langsung terkirim ke WA.',
      done: waReady,
      path: '/settings/custom-fields?tab=payments_wa',
    },
  ];
}
