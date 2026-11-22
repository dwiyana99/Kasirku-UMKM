import React from 'react';
import { Check, Minus, X, Sparkles, MessageCircle } from 'lucide-react';
import { ADDON_DEFINITIONS, HYBRID_PLANS } from '../lib/saas/hybrid-pricing';
import { formatRupiah } from '../lib/pos/checkout-service';

interface PackageComparisonModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDemo?: () => void;
}

interface ComparisonRow {
  category: string;
  label: string;
  hint?: string;
  lite: string | boolean;
  basic: string | boolean;
  pro: string | boolean;
  expert: string | boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    category: 'Kapasitas Usaha',
    label: 'Jumlah Cabang / Outlet',
    lite: '1 Lokasi',
    basic: '1 Lokasi',
    pro: '1 Lokasi (+Add-On Cabang)',
    expert: '1 Lokasi (+Add-On Cabang)',
  },
  {
    category: 'Kapasitas Usaha',
    label: 'Akun Kasir & Staf',
    lite: '1 Pemilik',
    basic: 'Hingga 3 Akun',
    pro: 'Hingga 10 Akun',
    expert: 'Hingga 20 Akun + RBAC',
  },
  {
    category: 'Kasir & Pembayaran',
    label: 'Kasir Harian & Catat Penjualan',
    lite: true,
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Kasir & Pembayaran',
    label: 'Metode Pembayaran',
    hint: 'Paket LITE fokus Tunai agar cepat dan sederhana',
    lite: 'Tunai (Non-Tunai via Add-On)',
    basic: 'Tunai, QRIS, Transfer, E-Wallet',
    pro: 'Lengkap + Multi Gateway',
    expert: 'Lengkap + Multi Gateway',
  },
  {
    category: 'Kasir & Pembayaran',
    label: 'Cetak Struk Thermal (58mm/80mm)',
    lite: 'Add-On (+Rp15rb)',
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Kasir & Pembayaran',
    label: 'Kirim Pesan WA Langsung (wa.me)',
    hint: 'Pakai nomor WA usaha Anda sendiri, gratis tanpa biaya tambahan',
    lite: true,
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Kasir & Pembayaran',
    label: 'Kirim WA Otomatis Server (Fonnte)',
    hint: 'Kirim struk & tagihan otomatis tanpa klik manual',
    lite: 'Add-On (+Rp35rb)',
    basic: 'Add-On (+Rp35rb)',
    pro: 'Add-On (+Rp35rb)',
    expert: 'Add-On (+Rp35rb)',
  },
  {
    category: 'Operasional 22 Jenis UMKM',
    label: 'Modul Khusus Jenis Usaha',
    hint: 'Laundry, Rental Mobil, Homestay, Lapangan, Bimbel, Pet Shop, Manufaktur, Bakery, dll.',
    lite: true,
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Operasional 22 Jenis UMKM',
    label: 'Kontak Pelanggan (CRM) & Riwayat Transaksi',
    lite: 'CRM Sederhana',
    basic: 'CRM + Piutang',
    pro: 'CRM + Poin & Promo',
    expert: 'CRM + Poin & Promo',
  },
  {
    category: 'Stok & Harga Jual',
    label: 'Hitung Harga Jual Otomatis',
    lite: 'Margin % / Manual',
    basic: 'Simulasi Margin + Pajak',
    pro: 'Simulasi Margin + Pajak',
    expert: 'Simulasi Margin + Pajak',
  },
  {
    category: 'Stok & Harga Jual',
    label: 'Purchase Order (PO), Supplier & Stock Opname',
    lite: 'Add-On (+Rp25rb)',
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Stok & Harga Jual',
    label: 'Transfer Stok Antar Cabang & Harga Grosir',
    lite: false,
    basic: false,
    pro: true,
    expert: true,
  },
  {
    category: 'Keuangan & Pajak Indonesia',
    label: 'Laporan Laba Rugi Sederhana (Harian/Bulanan/YTD) & Cetak PDF',
    lite: true,
    basic: true,
    pro: true,
    expert: true,
  },
  {
    category: 'Keuangan & Pajak Indonesia',
    label: 'Akuntansi Lengkap SAK EMKM (Neraca, Arus Kas, Jurnal, Penyusutan)',
    lite: 'Add-On',
    basic: 'Add-On',
    pro: true,
    expert: true,
  },
  {
    category: 'Keuangan & Pajak Indonesia',
    label: 'Pajak Nasional (PP 20/2026 & PPN) + Pajak Daerah PBJT 38+ Wilayah',
    lite: 'Pantau Omzet + PBJT',
    basic: 'Pantau Omzet + PBJT',
    pro: 'Lengkap + Siap Coretax',
    expert: 'Lengkap + Siap Coretax',
  },
];

function renderCellValue(val: string | boolean, isHighlighted?: boolean) {
  if (val === true) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }
  if (val === false) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center text-stone-300">
        <Minus className="h-4 w-4" strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span
      className={`text-xs leading-snug ${
        isHighlighted ? 'font-semibold text-emerald-800' : 'font-medium text-stone-700'
      }`}
    >
      {val}
    </span>
  );
}

export function PackageComparisonModal({
  open,
  onClose,
  onSelectDemo,
}: PackageComparisonModalProps) {
  if (!open) return null;

  const groupedCategories = Array.from(new Set(COMPARISON_ROWS.map((r) => r.category)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pkg-compare-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 bg-stone-50 px-5 py-4 sm:px-6">
          <div>
            <h2
              id="pkg-compare-title"
              className="text-lg font-bold tracking-[-0.02em] text-stone-900 sm:text-xl"
            >
              Perbandingan Lengkap Paket KasirAkun UMKM
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Pilih paket paling pas untuk skala usaha Anda. Semua paket sudah mendukung 22 jenis UMKM, Pajak Daerah PBJT, dan kirim WhatsApp langsung (wa.me).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup perbandingan paket"
            className="rounded-lg border border-stone-200 bg-white p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Free WA note */}
          <div className="mb-5 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              <p className="text-xs leading-relaxed sm:text-sm">
                <strong className="font-semibold">Kirim WhatsApp Gratis mulai Paket LITE:</strong> Cukup simpan nomor WA usaha Anda sendiri di Pengaturan, lalu kirim info cucian selesai, pengingat SPP, atau jadwal booking lewat <span className="font-mono font-semibold">wa.me</span> tanpa perlu Add-On Fonnte.
              </p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="w-[34%] px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Fitur & Kemampuan
                  </th>
                  {HYBRID_PLANS.map((plan) => {
                    const isPopular = plan.code === 'PRO';
                    return (
                      <th
                        key={plan.code}
                        className={`w-[16.5%] px-3 py-3.5 text-center align-top ${
                          isPopular ? 'bg-emerald-50/60' : ''
                        }`}
                      >
                        <div className="text-sm font-bold text-stone-900">{plan.name}</div>
                        <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-emerald-700">
                          {formatRupiah(plan.monthlyPrice)}
                          <span className="font-sans text-[11px] font-normal text-stone-500">/bln</span>
                        </div>
                        <div className="mt-1 text-[11px] font-normal text-stone-500">
                          {plan.code === 'LITE'
                            ? 'Usaha Mikro & Sederhana'
                            : plan.code === 'BASIC'
                            ? 'Toko 1 Lokasi Lengkap'
                            : plan.code === 'PRO'
                            ? 'Paling Populer (Tim & Gudang)'
                            : 'Lengkap SAK EMKM & Pajak'}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {groupedCategories.map((cat) => (
                  <React.Fragment key={cat}>
                    <tr className="bg-stone-50/80">
                      <td
                        colSpan={5}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-stone-600"
                      >
                        {cat}
                      </td>
                    </tr>
                    {COMPARISON_ROWS.filter((r) => r.category === cat).map((row) => (
                      <tr key={row.label} className="hover:bg-stone-50/60">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-stone-900">{row.label}</div>
                          {row.hint && (
                            <div className="mt-0.5 text-xs text-stone-500">{row.hint}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">{renderCellValue(row.lite)}</td>
                        <td className="px-3 py-3 text-center">{renderCellValue(row.basic)}</td>
                        <td className="bg-emerald-50/25 px-3 py-3 text-center">
                          {renderCellValue(row.pro, true)}
                        </td>
                        <td className="px-3 py-3 text-center">{renderCellValue(row.expert)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional Add-Ons Section */}
          <div className="mt-6">
            <h3 className="text-sm font-bold text-stone-900">
              Daftar Fitur Tambahan (Add-On Opsional)
            </h3>
            <p className="mt-0.5 text-xs text-stone-600">
              Bisa dipasang kapan saja pada paket LITE atau paket lainnya bila usaha Anda mulai membutuhkannya.
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {ADDON_DEFINITIONS.map((addon) => (
                <div
                  key={addon.code}
                  className="flex flex-col justify-between rounded-lg border border-stone-200 bg-stone-50/50 p-3"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-stone-900">{addon.name}</span>
                      <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-emerald-700">
                        +{formatRupiah(addon.monthlyPrice)}/bln
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-stone-600">
                      {addon.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-5 py-3.5 sm:px-6">
          <p className="text-xs text-stone-600">
            Harga belum termasuk PPN sesuai ketentuan berlaku. Bisa upgrade atau tambah Add-On kapan saja.
          </p>
          <div className="flex items-center gap-2.5">
            {onSelectDemo && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectDemo();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                Coba Gratis Sekarang
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
