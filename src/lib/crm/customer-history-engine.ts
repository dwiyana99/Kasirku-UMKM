/**
 * Pure Customer Contact & Transaction History Engine (0 AI Token, Decimal.js)
 * Powers the clean Lite CRM view and customer history lookup across all UMKM verticals.
 */

import Decimal from 'decimal.js';
import type { BusinessVertical, CrmCustomer, Order } from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface CustomerHistorySummary {
  customer: CrmCustomer;
  matchedOrders: Order[];
  orderCount: number;
  liveTotalSpend: string;
  lastOrderAt: string | null;
}

export interface CrmVerticalCopy {
  pageTitle: string;
  pageSubtitle: string;
  sidebarLabelLite: string;
  sidebarLabelPro: string;
  entitySingular: string;
  addButtonLabel: string;
  emptyTitle: string;
  emptySubtitle: string;
}

export function getCrmVerticalCopy(vertical: BusinessVertical): CrmVerticalCopy {
  if (vertical === 'FREELANCE') {
    return {
      pageTitle: 'Kontak Klien & Riwayat Proyek',
      pageSubtitle:
        'Simpan nomor kontak klien dan pantau seluruh riwayat tagihan proyek secara ringkas.',
      sidebarLabelLite: 'Kontak Klien',
      sidebarLabelPro: 'Daftar Klien & CRM',
      entitySingular: 'Klien',
      addButtonLabel: 'Tambah Klien',
      emptyTitle: 'Belum ada kontak klien tersimpan',
      emptySubtitle: 'Tambahkan data klien di sini atau langsung saat membuat invoice baru.',
    };
  }
  if (vertical === 'KOST_KONTRAKAN') {
    return {
      pageTitle: 'Kontak Penghuni & Riwayat Sewa',
      pageSubtitle:
        'Simpan kontak WhatsApp penghuni kamar beserta catatan pembayaran sewa yang rapi.',
      sidebarLabelLite: 'Kontak Penghuni',
      sidebarLabelPro: 'Daftar Penghuni',
      entitySingular: 'Penghuni',
      addButtonLabel: 'Tambah Penghuni',
      emptyTitle: 'Belum ada kontak penghuni tersimpan',
      emptySubtitle: 'Simpan nama dan nomor WhatsApp penghuni agar mudah dihubungi kapan saja.',
    };
  }
  if (vertical === 'HOMESTAY_VILLA') {
    return {
      pageTitle: 'Daftar Tamu & Riwayat Menginap',
      pageSubtitle:
        'Simpan nomor kontak tamu Direct maupun OTA untuk memudahkan promo kunjungan ulang.',
      sidebarLabelLite: 'Kontak Tamu',
      sidebarLabelPro: 'Daftar Tamu',
      entitySingular: 'Tamu',
      addButtonLabel: 'Tambah Tamu',
      emptyTitle: 'Belum ada data tamu tersimpan',
      emptySubtitle: 'Data tamu akan memudahkan pengingat check-in dan penawaran menginap ulang.',
    };
  }
  if (vertical === 'RENTAL_KENDARAAN' || vertical === 'SEWA_GARASI') {
    return {
      pageTitle: 'Daftar Penyewa & Riwayat Sewa',
      pageSubtitle:
        'Simpan kontak penyewa terverifikasi beserta riwayat penyewaan dan pembayaran.',
      sidebarLabelLite: 'Kontak Penyewa',
      sidebarLabelPro: 'Daftar Penyewa',
      entitySingular: 'Penyewa',
      addButtonLabel: 'Tambah Penyewa',
      emptyTitle: 'Belum ada data penyewa tersimpan',
      emptySubtitle: 'Simpan kontak penyewa agar proses perpanjangan atau sewa ulang lebih cepat.',
    };
  }
  if (vertical === 'BIMBEL_KURSUS_GYM') {
    return {
      pageTitle: 'Kontak Siswa, Orang Tua & Member',
      pageSubtitle:
        'Simpan nomor WhatsApp siswa, wali murid, atau member gym beserta riwayat iuran bulanan.',
      sidebarLabelLite: 'Kontak Siswa / Member',
      sidebarLabelPro: 'Daftar Siswa & Member',
      entitySingular: 'Siswa / Member',
      addButtonLabel: 'Tambah Siswa / Member',
      emptyTitle: 'Belum ada kontak siswa/member tersimpan',
      emptySubtitle: 'Tambahkan data siswa atau member agar pengingat SPP via WA lebih mudah.',
    };
  }
  if (vertical === 'PET_SHOP') {
    return {
      pageTitle: 'Daftar Pemilik Hewan & Riwayat Kunjungan',
      pageSubtitle:
        'Simpan kontak pemilik anabul beserta catatan grooming, penitipan & pembelian pakan.',
      sidebarLabelLite: 'Pemilik Hewan',
      sidebarLabelPro: 'Daftar Pemilik Hewan',
      entitySingular: 'Pemilik Hewan',
      addButtonLabel: 'Tambah Pemilik Hewan',
      emptyTitle: 'Belum ada kontak pemilik hewan',
      emptySubtitle: 'Simpan kontak pemilik untuk mengirim pengingat grooming berkala.',
    };
  }
  if (vertical === 'TOKO_BANGUNAN') {
    return {
      pageTitle: 'Kontak Pelanggan, Tukang & Kontraktor',
      pageSubtitle:
        'Simpan daftar kontraktor, mandor, dan pembeli material beserta riwayat belanja & tempo proyek.',
      sidebarLabelLite: 'Kontak Kontraktor',
      sidebarLabelPro: 'Pelanggan & Kontraktor',
      entitySingular: 'Kontraktor / Pembeli',
      addButtonLabel: 'Tambah Kontraktor',
      emptyTitle: 'Belum ada kontak kontraktor tersimpan',
      emptySubtitle: 'Catat kontak mandor dan pelanggan proyek untuk memudahkan pengiriman & tagihan.',
    };
  }
  if (vertical === 'PETERNAKAN_PERTANIAN') {
    return {
      pageTitle: 'Kontak Pembeli & Riwayat Panen',
      pageSubtitle:
        'Simpan kontak pengepul atau pembeli hasil panen beserta riwayat pembelian mereka.',
      sidebarLabelLite: 'Kontak Pembeli',
      sidebarLabelPro: 'Daftar Pembeli & Pengepul',
      entitySingular: 'Pembeli',
      addButtonLabel: 'Tambah Pembeli',
      emptyTitle: 'Belum ada kontak pembeli tersimpan',
      emptySubtitle: 'Tambahkan kontak pengepul atau pembeli di sini atau langsung dari kasir panen.',
    };
  }
  return {
    pageTitle: 'Kontak Pelanggan & Riwayat Belanja',
    pageSubtitle:
      'Simpan kontak pelanggan setia dan lihat riwayat belanja mereka tanpa pengaturan yang rumit.',
    sidebarLabelLite: 'Kontak Pelanggan',
    sidebarLabelPro: 'Daftar Pelanggan',
    entitySingular: 'Pelanggan',
    addButtonLabel: 'Tambah Pelanggan',
    emptyTitle: 'Belum ada kontak pelanggan tersimpan',
    emptySubtitle:
      'Tambahkan pelanggan di sini atau langsung klik "+ Member Baru" saat melayani transaksi di kasir.',
  };
}

/**
 * Normalizes an Indonesian phone number into a clickable WhatsApp URL.
 * Returns null if no digits exist.
 */
export function normalizeWhatsAppUrl(phoneWa?: string | null, message?: string): string | null {
  const digits = (phoneWa || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
    ? digits
    : `62${digits}`;
  return message
    ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${intl}`;
}

function normalizeCustomerKey(name?: string | null): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Matches all paid orders to a customer and computes exact Decimal spend & visit metadata.
 */
export function getCustomerTransactionSummary(
  customer: CrmCustomer,
  orders: Order[]
): CustomerHistorySummary {
  const targetKey = normalizeCustomerKey(customer.name);
  const matchedOrders = orders
    .filter((o) => {
      if (o.paymentStatus === 'VOID') return false;
      if (!targetKey) return false;
      return normalizeCustomerKey(o.customerName) === targetKey;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let ordersSum = new Decimal(0);
  for (const ord of matchedOrders) {
    if (ord.paymentStatus === 'PAID') {
      ordersSum = ordersSum.plus(new Decimal(ord.grandTotal || '0'));
    }
  }

  const storedSpend = new Decimal(customer.totalSpent || customer.totalSpend || '0');
  const liveTotalSpend = Decimal.max(storedSpend, ordersSum);

  return {
    customer,
    matchedOrders,
    orderCount: matchedOrders.length,
    liveTotalSpend: liveTotalSpend.toFixed(4),
    lastOrderAt: matchedOrders[0]?.createdAt ?? null,
  };
}

/**
 * Builds filtered & sorted customer summaries for the CRM list view.
 */
export function buildCustomerSummaries(
  customers: CrmCustomer[],
  orders: Order[],
  query: string
): CustomerHistorySummary[] {
  const q = query.trim().toLowerCase();
  const summaries = customers.map((c) => getCustomerTransactionSummary(c, orders));
  const filtered = q
    ? summaries.filter((s) => {
        const nameMatch = s.customer.name.toLowerCase().includes(q);
        const phoneMatch = (s.customer.phoneWa || '').toLowerCase().includes(q);
        const notesMatch = (s.customer.notes || '').toLowerCase().includes(q);
        return nameMatch || phoneMatch || notesMatch;
      })
    : summaries;

  return filtered.sort((a, b) => {
    const timeA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
    const timeB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    return new Decimal(b.liveTotalSpend).comparedTo(new Decimal(a.liveTotalSpend));
  });
}
