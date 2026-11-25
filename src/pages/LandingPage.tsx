import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BedDouble,
  Briefcase,
  CakeSlice,
  Car,
  Check,
  ChevronDown,
  Coffee,
  Droplets,
  Factory,
  GraduationCap,
  Hammer,
  Home,
  LayoutGrid,
  PawPrint,
  Scissors,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sprout,
  Store,
  Trophy,
  UtensilsCrossed,
  Warehouse,
  WashingMachine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ADDON_DEFINITIONS, HYBRID_PLANS } from '../lib/saas/hybrid-pricing';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  VERTICAL_GROUP_LABELS,
  type VerticalCategoryGroup,
} from '../lib/verticals/vertical-registry';
import { PackageComparisonModal } from '../components/PackageComparisonModal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import type { BusinessVertical } from '../types/domain';

function getVerticalIcon(id: BusinessVertical) {
  switch (id) {
    case 'WARUNG_SEMBAKO':
      return Store;
    case 'TOKO_RETAIL':
      return ShoppingBag;
    case 'TOKO_FASHION':
      return Shirt;
    case 'TOKO_BANGUNAN':
      return Hammer;
    case 'KEDAI_MAKAN':
      return Coffee;
    case 'RESTORAN':
      return UtensilsCrossed;
    case 'BAKERY_CATERING':
      return CakeSlice;
    case 'BARBERSHOP':
    case 'BARBERSHOP_SALON':
      return Scissors;
    case 'SALON_KECANTIKAN':
    case 'SPA_WELLNESS':
      return Sparkles;
    case 'LAUNDRY':
      return WashingMachine;
    case 'CUCI_KENDARAAN':
      return Droplets;
    case 'PET_SHOP':
      return PawPrint;
    case 'BIMBEL_KURSUS_GYM':
      return GraduationCap;
    case 'FREELANCE':
      return Briefcase;
    case 'RENTAL_KENDARAAN':
      return Car;
    case 'SEWA_LAPANGAN':
      return Trophy;
    case 'HOMESTAY_VILLA':
      return BedDouble;
    case 'KOST_KONTRAKAN':
      return Home;
    case 'SEWA_GARASI':
      return Warehouse;
    case 'MANUFAKTUR_KECIL':
      return Factory;
    case 'PETERNAKAN_PERTANIAN':
      return Sprout;
    default:
      return Store;
  }
}

const GROUP_FILTER_OPTIONS: Array<{ id: 'ALL' | VerticalCategoryGroup; label: string }> = [
  { id: 'ALL', label: `Semua (${ACTIVE_VERTICAL_DEFINITIONS.length})` },
  { id: 'RETAIL_DAGANG', label: VERTICAL_GROUP_LABELS.RETAIL_DAGANG },
  { id: 'KULINER_FNB', label: VERTICAL_GROUP_LABELS.KULINER_FNB },
  { id: 'JASA_PERAWATAN', label: VERTICAL_GROUP_LABELS.JASA_PERAWATAN },
  { id: 'RENTAL_PROPETI', label: VERTICAL_GROUP_LABELS.RENTAL_PROPETI },
  { id: 'PRODUKSI_AGRO', label: VERTICAL_GROUP_LABELS.PRODUKSI_AGRO },
];

const CORE_POINTS = [
  {
    title: 'Menu khusus sesuai usaha',
    detail: 'Warung tidak melihat menu meja resto. Kost tidak diganggu menu gudang.',
  },
  {
    title: 'Tetap jalan saat internet terputus',
    detail: 'Kasir dan QR meja memakai penyimpanan lokal, bisa langsung selesai tanpa printer struk.',
  },
  {
    title: 'Stok, retur, dan untung sinkron',
    detail: 'Kulakan, retur barang, dan laporan laba-rugi langsung cocok tanpa rekap ulang.',
  },
  {
    title: 'Siap pajak nasional & daerah',
    detail: 'Pantau batas bebas Rp500 juta, PPN 11%, dan tarif PBJT sesuai kota domisili.',
  },
];

const PLAN_SHORT_COPY: Record<string, { forWho: string; bullets: string[] }> = {
  LITE: {
    forWho: 'Usaha perorangan, 1 kasir',
    bullets: [
      'Kasir tunai cepat, bisa tanpa cetak struk',
      'Catatan belanja kulakan & monitor stok',
      'Laporan untung-rugi sederhana (harian sampai YTD)',
      'Kirim nota & pengingat lewat WhatsApp usaha (wa.me)',
    ],
  },
  BASIC: {
    forWho: 'Toko harian dengan QRIS & tim kecil',
    bullets: [
      'Semua fitur LITE + hingga 3 akun pegawai',
      'QRIS, e-wallet, VA & transfer bank otomatis',
      'Cetak struk thermal 58mm/80mm',
      'Simulasi harga jual agar untung tetap terjaga',
    ],
  },
  PRO: {
    forWho: 'Usaha berkembang dengan kontrol stok ketat',
    bullets: [
      'Semua fitur BASIC + hingga 10 akun pegawai',
      'Purchase Order (PO) supplier & hutang tempo',
      'Cek fisik stok berkala, resep bahan baku & satuan dus-eceran',
      'Harga grosir, promo, buku kasbon & komisi tim',
    ],
  },
  EXPERT: {
    forWho: 'Usaha mapan, CV/PT & pelaporan lengkap',
    bullets: [
      'Semua fitur PRO + hingga 20 akun pegawai',
      'Neraca, Arus Kas, Jurnal Umum & penyusutan aset',
      'Proyeksi pajak bulanan, Coretax & PBJT daerah',
      'Kolom data custom sesuai kebutuhan usaha',
    ],
  },
};

const SHORT_FAQ = [
  {
    q: 'Apakah harus paham akuntansi dulu?',
    a: 'Tidak. Cukup catat jualan, kulakan, retur, dan pengeluaran harian. Laporan keuangan serta jurnal tersusun otomatis di belakang layar.',
  },
  {
    q: 'Bisa dipakai kalau belum punya printer struk?',
    a: 'Bisa. Di kasir ada pilihan selesai tanpa cetak struk, atau kirim nota langsung ke WhatsApp pembeli.',
  },
  {
    q: 'Apakah bisa kirim pesan WA tanpa add-on berbayar?',
    a: 'Bisa mulai Paket LITE lewat tautan wa.me memakai nomor WhatsApp usaha Anda sendiri. Add-on WA otomatis hanya dibutuhkan jika ingin kirim tanpa klik.',
  },
  {
    q: 'Bagaimana kalau internet toko tiba-tiba mati?',
    a: 'Halaman kasir dan QR order tersimpan di cache browser (PWA), jadi pencatatan dasar tetap berjalan dan tersinkron saat koneksi kembali.',
  },
];

export function LandingPage() {
  const { navigate, session } = useApp();
  const [activeGroup, setActiveGroup] = useState<'ALL' | VerticalCategoryGroup>('ALL');
  const [activeVertical, setActiveVertical] = useState<BusinessVertical>('WARUNG_SEMBAKO');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);
  const [compareOpen, setCompareOpen] = useState(false);

  const filteredVerticals = useMemo(
    () =>
      activeGroup === 'ALL'
        ? ACTIVE_VERTICAL_DEFINITIONS
        : ACTIVE_VERTICAL_DEFINITIONS.filter((v) => v.categoryGroup === activeGroup),
    [activeGroup]
  );

  const currentVertical = useMemo(
    () =>
      ACTIVE_VERTICAL_DEFINITIONS.find((v) => v.id === activeVertical) ??
      ACTIVE_VERTICAL_DEFINITIONS[0],
    [activeVertical]
  );

  const handleSelectGroup = (group: 'ALL' | VerticalCategoryGroup) => {
    setActiveGroup(group);
    const list =
      group === 'ALL'
        ? ACTIVE_VERTICAL_DEFINITIONS
        : ACTIVE_VERTICAL_DEFINITIONS.filter((v) => v.categoryGroup === group);
    if (list.length > 0 && !list.some((v) => v.id === activeVertical)) {
      setActiveVertical(list[0].id);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 antialiased">
      {/* Sticky Navbar */}
      <header className="sticky top-0 z-40 bg-[#FAFAF9]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 shrink-0"
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-600 text-white font-bold text-sm flex items-center justify-center">
              KA
            </span>
            <span className="text-base font-bold tracking-tight text-stone-900 whitespace-nowrap">
              KasirAkun <span className="text-emerald-700">UMKM</span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
            <button
              type="button"
              onClick={() => scrollToSection('umkm')}
              className="hover:text-stone-900 whitespace-nowrap transition-colors"
            >
              22 Jenis Usaha
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('harga')}
              className="hover:text-stone-900 whitespace-nowrap transition-colors"
            >
              Paket &amp; Harga
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('faq')}
              className="hover:text-stone-900 whitespace-nowrap transition-colors"
            >
              FAQ
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton />
            </div>
            <button
              type="button"
              data-testid="landing-login-btn"
              onClick={() =>
                navigate(
                  session.role !== 'GUEST'
                    ? session.role === 'MASTER_ADMIN'
                      ? '/master'
                      : '/dashboard'
                    : '/login'
                )
              }
              className="px-3.5 py-2 text-sm font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg whitespace-nowrap transition-colors"
            >
              Login
            </button>
            <button
              type="button"
              data-testid="landing-goto-demo-btn"
              onClick={() => navigate('/demo')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap transition-colors"
            >
              <span>Coba Demo</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 1. Asymmetric Split Hero */}
        <section className="bg-[#FAFAF9] border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7 space-y-5">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-stone-900 leading-[1.08] text-balance">
                Kasir, Stok, dan Pembukuan Rapi untuk 22 Jenis UMKM
              </h1>

              <p className="text-base text-stone-600 leading-relaxed max-w-[52ch] text-pretty">
                Pilih bidang usaha Anda saat daftar. Menu, catatan stok, kontrak digital, hingga hitungan pajak otomatis menyesuaikan agar tampilan tetap ringkas dan tepat guna.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  data-testid="landing-hero-demo-btn"
                  onClick={() => navigate('/demo')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <span>Coba Demo Gratis</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  data-testid="landing-hero-onboarding-btn"
                  onClick={() => navigate('/onboarding?mode=real')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors"
                >
                  <span>Daftar Usaha Baru</span>
                </button>
              </div>

              <ul className="pt-3 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-medium text-stone-600">
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
                  <span>Mulai Rp49.000/bln</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
                  <span>Bisa tanpa printer struk</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.75} />
                  <span>Mode offline POS (PWA)</span>
                </li>
              </ul>
            </div>

            <div
              data-testid="landing-hero-overview"
              className="lg:col-span-5 bg-white border border-stone-200 rounded-xl divide-y divide-stone-200 overflow-hidden"
            >
              {CORE_POINTS.map((pt, idx) => (
                <div key={pt.title} className="px-5 py-4 flex items-start gap-3.5">
                  <span className="font-mono text-xs font-bold text-emerald-700 pt-0.5 tabular-nums shrink-0">
                    0{idx + 1}.
                  </span>
                  <div className="space-y-0.5">
                    <h2 className="text-sm font-bold text-stone-900">{pt.title}</h2>
                    <p className="text-xs text-stone-600 leading-relaxed">{pt.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 2. 22 UMKM Verticals — Compact Interactive Picker */}
        <section id="umkm" className="py-14 bg-white border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
                  Pilih Jenis Usaha Anda
                </h2>
                <p className="text-sm text-stone-600 mt-1">
                  Klik bidang usaha di bawah untuk melihat fitur inti yang otomatis aktif.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-stone-500 tabular-nums">
                {filteredVerticals.length} / {ACTIVE_VERTICAL_DEFINITIONS.length} usaha
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {GROUP_FILTER_OPTIONS.map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  data-testid={`landing-group-filter-${grp.id}`}
                  onClick={() => handleSelectGroup(grp.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    activeGroup === grp.id
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            <div
              role="tablist"
              aria-label="Pilih 22 Jenis Usaha UMKM"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
            >
              {filteredVerticals.map((item) => {
                const Icon = getVerticalIcon(item.id);
                const isActive = item.id === activeVertical;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-testid={`landing-vertical-tab-${item.id}`}
                    onClick={() => setActiveVertical(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold rounded-lg border transition-colors ${
                      isActive
                        ? 'border-emerald-600 text-emerald-900 bg-emerald-50/70'
                        : 'border-stone-200 text-stone-600 bg-white hover:border-stone-300 hover:text-stone-900'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-emerald-700' : 'text-stone-400'
                      }`}
                      strokeWidth={1.75}
                    />
                    <span className="truncate">{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Concise Vertical Summary Panel */}
            <div
              data-testid="landing-vertical-panel"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start bg-stone-50 border border-stone-200 rounded-xl p-5"
            >
              <div className="lg:col-span-5 space-y-3">
                <p className="text-xs font-semibold text-emerald-700">{currentVertical.label}</p>
                <h3 className="text-lg font-bold text-stone-900 leading-snug">
                  {currentVertical.headline}
                </h3>
                <ul className="space-y-2 text-xs text-stone-700">
                  {currentVertical.keyBenefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <Check
                        className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
                        strokeWidth={1.75}
                      />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentVertical.features.map((feat) => (
                  <div
                    key={feat.title}
                    className="bg-white border border-stone-200 rounded-lg p-3.5 space-y-1"
                  >
                    <h4 className="text-xs font-bold text-stone-900">{feat.title}</h4>
                    <p className="text-xs text-stone-600 leading-relaxed">{feat.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Pricing & Comparison Modal */}
        <section id="harga" className="py-14 bg-[#FAFAF9] border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
                  Paket Bulanan Transparan
                </h2>
                <p className="text-sm text-stone-600 mt-1">
                  Bayar hanya yang dipakai. Tambah Add-On kapan saja bila usaha berkembang.
                </p>
              </div>
              <button
                type="button"
                data-testid="open-package-comparison-btn"
                onClick={() => setCompareOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0 transition-colors"
              >
                <LayoutGrid className="w-4 h-4" strokeWidth={1.75} />
                <span>Bandingkan Semua Paket (LITE vs BASIC vs PRO vs EXPERT)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {HYBRID_PLANS.map((plan) => {
                const shortCopy = PLAN_SHORT_COPY[plan.code];
                const isPopular = plan.code === 'PRO';
                return (
                  <div
                    key={plan.code}
                    data-testid={`landing-plan-card-${plan.code}`}
                    className={`rounded-xl p-5 flex flex-col justify-between border bg-white ${
                      isPopular
                        ? 'border-emerald-600 ring-1 ring-emerald-600/15'
                        : 'border-stone-200'
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-stone-900">{plan.name}</h3>
                          {plan.badge && (
                            <span className="text-[11px] font-semibold text-emerald-700">
                              {plan.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">{shortCopy?.forWho}</p>
                      </div>

                      <div className="pt-3 border-t border-stone-200">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold font-mono tabular-nums text-stone-900">
                            {formatRupiah(plan.monthlyPrice)}
                          </span>
                          <span className="text-xs text-stone-500">/bln</span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5 font-mono tabular-nums">
                          Tahunan: {formatRupiah(plan.annualMonthlyEquivalent)}/bln
                        </p>
                      </div>

                      <ul className="space-y-2">
                        {(shortCopy?.bullets ?? plan.highlights).map((b) => (
                          <li key={b} className="flex items-start gap-2 text-xs text-stone-700">
                            <Check
                              className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5"
                              strokeWidth={1.75}
                            />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      data-testid={`landing-select-plan-${plan.code}`}
                      onClick={() => navigate(`/onboarding?mode=real&plan=${plan.code}`)}
                      className={`mt-5 w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors ${
                        isPopular
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-stone-900 text-white hover:bg-stone-800'
                      }`}
                    >
                      Pilih {plan.name}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Compact Add-On Strip */}
            <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-stone-900">Add-On Opsional (Aktifkan Jika Perlu)</h3>
                <p className="text-xs text-stone-600">
                  Termasuk <strong className="text-stone-900">Landing Page Usaha (+Rp25.000/bln)</strong>: website profil &amp; katalog otomatis sesuai jenis UMKM, gratis bantuan kustomisasi awal oleh admin.
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {ADDON_DEFINITIONS.map((addon) => (
                  <div
                    key={addon.code}
                    className={`px-3 py-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                      addon.code === 'ADDON_LANDING_PAGE'
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : 'border-stone-200 bg-stone-50/70'
                    }`}
                  >
                    <span className="text-xs font-semibold text-stone-800 truncate">
                      {addon.shortLabel}
                    </span>
                    <span className="text-xs font-mono font-bold tabular-nums text-emerald-700 shrink-0">
                      +{formatRupiah(addon.monthlyPrice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Compact FAQ */}
        <section id="faq" className="py-14 bg-white border-b border-stone-200">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-stone-900">
              Pertanyaan Umum
            </h2>
            <div className="border border-stone-200 rounded-xl divide-y divide-stone-200">
              {SHORT_FAQ.map((item, idx) => {
                const open = openFaqIdx === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(open ? null : idx)}
                      className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-stone-50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-stone-900">{item.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-500 shrink-0 transition-transform ${
                          open ? 'rotate-180' : ''
                        }`}
                        strokeWidth={1.75}
                      />
                    </button>
                    {open && (
                      <div className="px-5 pb-4 text-xs sm:text-sm text-stone-600 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-stone-900 text-stone-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <span className="w-6 h-6 rounded-md bg-emerald-600 text-white text-xs flex items-center justify-center">
                KA
              </span>
              <span>KasirAkun UMKM</span>
            </div>
            <p className="text-xs text-stone-400">
              Kasir, stok, kontrak digital, pembukuan, dan pajak untuk 22 jenis usaha UMKM Indonesia.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-medium">
            <button type="button" onClick={() => navigate('/demo')} className="hover:text-white">
              Coba Demo
            </button>
            <button
              type="button"
              onClick={() => navigate('/onboarding?mode=real')}
              className="hover:text-white"
            >
              Daftar Akun
            </button>
            <button type="button" onClick={() => navigate('/login')} className="hover:text-white">
              Login
            </button>
            <button
              type="button"
              onClick={() => navigate('/master/login')}
              className="hover:text-white"
            >
              Master Admin
            </button>
          </div>
        </div>
      </footer>

      <PackageComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        onSelectDemo={() => navigate('/demo')}
      />
    </div>
  );
}
