/**
 * KasirAkun UMKM — Curated Anti-AI-Slop Landing Page Theme Presets
 * & Automatic Adaptation Engine for ALL 22 Active UMKM Verticals.
 */

import type {
  BusinessVertical,
  LandingPageOpeningHour,
  LandingThemePreset,
  Tenant,
  TenantLandingPageConfig,
} from '../../types/domain.ts';
import { normalizeSlugCandidate } from './url-helper.ts';

export interface LandingThemeTokens {
  code: LandingThemePreset;
  name: string;
  tagline: string;
  swatchPrimary: string;
  swatchBg: string;
  swatchText: string;
  // Tailwind class tokens verified for WCAG AA >= 4.5:1 contrast
  pageBgClass: string;
  surfaceBgClass: string;
  surfaceSubtleClass: string;
  borderClass: string;
  headingTextClass: string;
  bodyTextClass: string;
  mutedTextClass: string;
  accentTextClass: string;
  accentBgClass: string;
  accentHoverClass: string;
  accentSoftBgClass: string;
  accentBorderClass: string;
  heroFrameClass: string;
  ctaTextClass: string;
}

export const LANDING_THEME_PRESETS: Record<LandingThemePreset, LandingThemeTokens> = {
  WARM_EMERALD: {
    code: 'WARM_EMERALD',
    name: 'Warm Stone & Emerald',
    tagline: 'Bersih, hangat & terpercaya untuk semua jenis UMKM',
    swatchPrimary: '#059669',
    swatchBg: '#FAFAF9',
    swatchText: '#1C1917',
    pageBgClass: 'bg-[#FAFAF9]',
    surfaceBgClass: 'bg-white',
    surfaceSubtleClass: 'bg-[#F5F5F4]',
    borderClass: 'border-[#E7E5E4]',
    headingTextClass: 'text-[#1C1917]',
    bodyTextClass: 'text-[#44403C]',
    mutedTextClass: 'text-[#57534E]',
    accentTextClass: 'text-[#047857]',
    accentBgClass: 'bg-[#059669]',
    accentHoverClass: 'hover:bg-[#047857]',
    accentSoftBgClass: 'bg-[#ECFDF5]',
    accentBorderClass: 'border-[#A7F3D0]',
    heroFrameClass: 'bg-[#F5F5F4] border-[#E7E5E4]',
    ctaTextClass: 'text-white',
  },
  TERRACOTTA_CRAFT: {
    code: 'TERRACOTTA_CRAFT',
    name: 'Terracotta Craft',
    tagline: 'Nuansa hangat & menggugah untuk kuliner, bakery & kriya',
    swatchPrimary: '#B45309',
    swatchBg: '#FAF7F2',
    swatchText: '#29211B',
    pageBgClass: 'bg-[#FAF7F2]',
    surfaceBgClass: 'bg-white',
    surfaceSubtleClass: 'bg-[#F3ECE1]',
    borderClass: 'border-[#E6DCD0]',
    headingTextClass: 'text-[#29211B]',
    bodyTextClass: 'text-[#4A3E35]',
    mutedTextClass: 'text-[#6B5B4E]',
    accentTextClass: 'text-[#9A3412]',
    accentBgClass: 'bg-[#B45309]',
    accentHoverClass: 'hover:bg-[#92400E]',
    accentSoftBgClass: 'bg-[#FEF3C7]',
    accentBorderClass: 'border-[#FCD34D]',
    heroFrameClass: 'bg-[#F3ECE1] border-[#E6DCD0]',
    ctaTextClass: 'text-white',
  },
  SLATE_NAVY: {
    code: 'SLATE_NAVY',
    name: 'Slate & Navy',
    tagline: 'Tegas, rapi & profesional untuk jasa, properti & rental',
    swatchPrimary: '#1E3A5F',
    swatchBg: '#F8FAFC',
    swatchText: '#0F172A',
    pageBgClass: 'bg-[#F8FAFC]',
    surfaceBgClass: 'bg-white',
    surfaceSubtleClass: 'bg-[#F1F5F9]',
    borderClass: 'border-[#E2E8F0]',
    headingTextClass: 'text-[#0F172A]',
    bodyTextClass: 'text-[#334155]',
    mutedTextClass: 'text-[#475569]',
    accentTextClass: 'text-[#1E3A5F]',
    accentBgClass: 'bg-[#1E3A5F]',
    accentHoverClass: 'hover:bg-[#172C49]',
    accentSoftBgClass: 'bg-[#EFF6FF]',
    accentBorderClass: 'border-[#BFDBFE]',
    heroFrameClass: 'bg-[#F1F5F9] border-[#E2E8F0]',
    ctaTextClass: 'text-white',
  },
  ORGANIC_SAGE: {
    code: 'ORGANIC_SAGE',
    name: 'Organic Sage',
    tagline: 'Segar & natural untuk agro, peternakan, spa & wellness',
    swatchPrimary: '#2F6F4E',
    swatchBg: '#F6F8F5',
    swatchText: '#1A241E',
    pageBgClass: 'bg-[#F6F8F5]',
    surfaceBgClass: 'bg-white',
    surfaceSubtleClass: 'bg-[#ECF1EA]',
    borderClass: 'border-[#DCE5D9]',
    headingTextClass: 'text-[#1A241E]',
    bodyTextClass: 'text-[#37483D]',
    mutedTextClass: 'text-[#516558]',
    accentTextClass: 'text-[#24593E]',
    accentBgClass: 'bg-[#2F6F4E]',
    accentHoverClass: 'hover:bg-[#24593E]',
    accentSoftBgClass: 'bg-[#E9F5EE]',
    accentBorderClass: 'border-[#B6DBC4]',
    heroFrameClass: 'bg-[#ECF1EA] border-[#DCE5D9]',
    ctaTextClass: 'text-white',
  },
};

export type LandingCatalogPresentationMode =
  | 'RETAIL_WHOLESALE'
  | 'CULINARY_MENU'
  | 'SERVICE_PACKAGES'
  | 'KOST_ROOMS'
  | 'AGRO_HARVEST'
  | 'ASSET_BOOKING'
  | 'PREORDER_PRODUCTION';

export interface VerticalLandingProfile {
  vertical: BusinessVertical;
  verticalLabel: string;
  recommendedTheme: LandingThemePreset;
  catalogMode: LandingCatalogPresentationMode;
  catalogSectionTitle: string;
  catalogSectionSubtitle: string;
  primaryCtaLabel: string;
  itemActionLabel: string;
  highlightsTitle: string;
  defaultSubtitle: string;
  defaultHighlights: string[];
  waPrimaryGreeting: (tenantName: string) => string;
  waItemMessage: (tenantName: string, itemName: string, priceLabel?: string) => string;
}

const DEFAULT_OPENING_HOURS: LandingPageOpeningHour[] = [
  { day: 'Senin - Jumat', hours: '08:00 - 21:00 WIB' },
  { day: 'Sabtu', hours: '08:00 - 21:00 WIB' },
  { day: 'Minggu', hours: '09:00 - 18:00 WIB' },
];

export const VERTICAL_LANDING_PROFILES: Record<BusinessVertical, VerticalLandingProfile> = {
  WARUNG_SEMBAKO: {
    vertical: 'WARUNG_SEMBAKO',
    verticalLabel: 'Warung Sembako & Grosir',
    recommendedTheme: 'WARM_EMERALD',
    catalogMode: 'RETAIL_WHOLESALE',
    catalogSectionTitle: 'Daftar Sembako & Harga Grosir',
    catalogSectionSubtitle: 'Cek ketersediaan stok terbaru dan harga ecer maupun partai grosir.',
    primaryCtaLabel: 'Pesan Sembako via WhatsApp',
    itemActionLabel: 'Pesan via WA',
    highlightsTitle: 'Keunggulan Belanja di Sini',
    defaultSubtitle: 'Kebutuhan pokok lengkap dengan harga jujur untuk belanja harian maupun kulakan warung.',
    defaultHighlights: [
      'Harga ecer & grosir transparan sesuai daftar stok aktif',
      'Bisa pesan dulu lewat WhatsApp lalu ambil di toko atau antar sekitar',
      'Barang sembako segar dengan perputaran stok cepat setiap hari',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan daftar harga sembako & pesan belanja hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin memesan *${item}*${price ? ` (${price})` : ''}. Apakah stok tersedia hari ini?`,
  },
  TOKO_RETAIL: {
    vertical: 'TOKO_RETAIL',
    verticalLabel: 'Toko Retail & Minimarket',
    recommendedTheme: 'WARM_EMERALD',
    catalogMode: 'RETAIL_WHOLESALE',
    catalogSectionTitle: 'Katalog Produk Pilihan',
    catalogSectionSubtitle: 'Telusuri produk harian yang tersedia langsung di toko kami.',
    primaryCtaLabel: 'Tanya Stok via WhatsApp',
    itemActionLabel: 'Tanya / Pesan',
    highlightsTitle: 'Kenapa Belanja di Toko Kami',
    defaultSubtitle: 'Produk harian terkurasi, stok terpantau rapi, dan pelayanan ramah.',
    defaultHighlights: [
      'Pilihan produk kebutuhan harian lengkap dan terjamin asli',
      'Cek ketersediaan barang lebih cepat lewat WhatsApp',
      'Transaksi nyaman di kasir dengan rincian harga jelas',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya melihat katalog online Anda dan ingin menanyakan ketersediaan produk.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, apakah produk *${item}*${price ? ` (${price})` : ''} masih tersedia? Saya ingin pesan.`,
  },
  TOKO_FASHION: {
    vertical: 'TOKO_FASHION',
    verticalLabel: 'Toko Fashion & Distro',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'RETAIL_WHOLESALE',
    catalogSectionTitle: 'Koleksi Terbaru & Katalog',
    catalogSectionSubtitle: 'Pilih model, ukuran, dan cek ketersediaan warna terbaru langsung via WhatsApp.',
    primaryCtaLabel: 'Tanya Ukuran & Pesan',
    itemActionLabel: 'Cek Ukuran / WA',
    highlightsTitle: 'Standar Koleksi Kami',
    defaultSubtitle: 'Koleksi pakaian, sepatu, dan aksesori pilihan dengan kualitas bahan terkurasi.',
    defaultHighlights: [
      'Bahan nyaman dipakai harian dengan jahitan rapi',
      'Tersedia berbagai pilihan ukuran dan potongan modern',
      'Konsultasi ukuran cepat melalui WhatsApp sebelum membeli',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya tertarik dengan koleksi fashion di katalog online Anda.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya tertarik dengan *${item}*${price ? ` (${price})` : ''}. Ukuran apa saja yang ready saat ini?`,
  },
  TOKO_BANGUNAN: {
    vertical: 'TOKO_BANGUNAN',
    verticalLabel: 'Toko Bangunan & Material',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'RETAIL_WHOLESALE',
    catalogSectionTitle: 'Katalog Material & Harga Proyek',
    catalogSectionSubtitle: 'Melayani pembelian eceran rumah tangga maupun pengiriman material proyek.',
    primaryCtaLabel: 'Minta Penawaran Material',
    itemActionLabel: 'Pesan / Tanya Kirim',
    highlightsTitle: 'Layanan Toko Material',
    defaultSubtitle: 'Material bangunan lengkap dari pondasi hingga finishing, siap kirim ke lokasi proyek.',
    defaultHighlights: [
      'Harga grosir khusus untuk pembelian borongan & kontraktor',
      'Pengiriman terjadwal langsung ke lokasi renovasi atau proyek',
      'Konsultasi estimasi kebutuhan material via WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin meminta penawaran harga material bangunan & ongkos kirim.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin pesan material *${item}*${price ? ` (${price})` : ''}. Bisa info estimasi pengiriman?`,
  },
  MANUFAKTUR_KECIL: {
    vertical: 'MANUFAKTUR_KECIL',
    verticalLabel: 'Konveksi, Mebel & Produksi',
    recommendedTheme: 'TERRACOTTA_CRAFT',
    catalogMode: 'PREORDER_PRODUCTION',
    catalogSectionTitle: 'Produk Jadi & Layanan Custom Produksi',
    catalogSectionSubtitle: 'Menerima pesanan satuan, seragam, maupun produksi custom sesuai spesifikasi Anda.',
    primaryCtaLabel: 'Konsultasi Pesanan Custom',
    itemActionLabel: 'Tanya Produksi',
    highlightsTitle: 'Alur Kerja Produksi Kami',
    defaultSubtitle: 'Dikerjakan langsung oleh pengrajin dan workshop internal dengan kontrol kualitas ketat.',
    defaultHighlights: [
      'Bisa pesan ukuran, bahan, dan warna custom sesuai kebutuhan',
      'Transparansi estimasi waktu pengerjaan dan harga pokok yang bersaing',
      'Cocok untuk pesanan partai kecil hingga produksi seragam/mebel proyek',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin berkonsultasi mengenai pesanan produksi custom.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin menanyakan detail produksi / custom untuk *${item}*${price ? ` (estimasi ${price})` : ''}.`,
  },
  PETERNAKAN_PERTANIAN: {
    vertical: 'PETERNAKAN_PERTANIAN',
    verticalLabel: 'Peternakan, Pertanian & Agro',
    recommendedTheme: 'ORGANIC_SAGE',
    catalogMode: 'AGRO_HARVEST',
    catalogSectionTitle: 'Stok Hasil Panen & Produk Agro Siap Kirim',
    catalogSectionSubtitle: 'Langsung dari kandang dan kebun kami dengan kualitas segar dan timbangan akurat.',
    primaryCtaLabel: 'Hubungi Pengepul / Pesan Panen',
    itemActionLabel: 'Pesan Panen',
    highlightsTitle: 'Jaminan Mutu Hasil Panen',
    defaultSubtitle: 'Hasil peternakan dan pertanian segar langsung dari sumbernya untuk eceran maupun partai besar.',
    defaultHighlights: [
      'Stok panen terpantau langsung dan siap kirim sesuai jadwal',
      'Melayani pembelian rumah tangga, katering, restoran, hingga pengepul',
      'Kualitas pakan dan budidaya terkontrol secara konsisten',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan stok hasil panen / harga partai hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, apakah stok *${item}*${price ? ` (${price})` : ''} ready panen hari ini? Saya ingin pesan.`,
  },
  KEDAI_MAKAN: {
    vertical: 'KEDAI_MAKAN',
    verticalLabel: 'Kedai Kopi & Kuliner',
    recommendedTheme: 'TERRACOTTA_CRAFT',
    catalogMode: 'CULINARY_MENU',
    catalogSectionTitle: 'Daftar Menu & Minuman',
    catalogSectionSubtitle: 'Disajikan hangat dan segar setiap hari. Pilih kategori menu favorit Anda.',
    primaryCtaLabel: 'Pesan / Reservasi via WA',
    itemActionLabel: 'Pesan Menu',
    highlightsTitle: 'Kenapa Singgah di Kedai Kami',
    defaultSubtitle: 'Racikan kopi dan hidangan rumahan pilihan untuk santai, kerja, maupun kumpul bersama.',
    defaultHighlights: [
      'Menu dibuat segar saat dipesan dengan bahan pilihan',
      'Tersedia pesan ambil di tempat (takeaway) maupun makan di kedai',
      'Harga bersahabat dengan porsi pas dan rasa konsisten',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin memesan menu / menanyakan reservasi meja hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin memesan menu *${item}*${price ? ` (${price})` : ''}.`,
  },
  RESTORAN: {
    vertical: 'RESTORAN',
    verticalLabel: 'Restoran & Rumah Makan',
    recommendedTheme: 'TERRACOTTA_CRAFT',
    catalogMode: 'CULINARY_MENU',
    catalogSectionTitle: 'Menu Unggulan Restoran',
    catalogSectionSubtitle: 'Jelajahi sajian utama, minuman, dan paket makan keluarga kami.',
    primaryCtaLabel: 'Reservasi Meja / Pesan WA',
    itemActionLabel: 'Pesan Sajian',
    highlightsTitle: 'Pengalaman Bersantap',
    defaultSubtitle: 'Hidangan Nusantara dan spesialisasi dapur kami untuk acara keluarga, rapat, dan santap harian.',
    defaultHighlights: [
      'Menerima reservasi meja rombongan dan paket makan bersama',
      'Bahan dapur segar dengan standar kebersihan terjaga',
      'Pemesanan mudah melalui WhatsApp maupun langsung di lokasi',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin melakukan reservasi meja / pemesanan makanan.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin memesan *${item}*${price ? ` (${price})` : ''} dari daftar menu restoran.`,
  },
  BAKERY_CATERING: {
    vertical: 'BAKERY_CATERING',
    verticalLabel: 'Bakery, Catering & Hampers',
    recommendedTheme: 'TERRACOTTA_CRAFT',
    catalogMode: 'PREORDER_PRODUCTION',
    catalogSectionTitle: 'Menu Bakery, Paket Catering & Pre-Order',
    catalogSectionSubtitle: 'Tersedia produk ready harian serta sistem pre-order untuk acara dan hampers.',
    primaryCtaLabel: 'Pesan Pre-Order / Catering',
    itemActionLabel: 'Pre-Order WA',
    highlightsTitle: 'Keunggulan Dapur Kami',
    defaultSubtitle: 'Roti hangat, kue acara, nasi kotak, dan hampers eksklusif dibuat berdasarkan pesanan.',
    defaultHighlights: [
      'Menerima jadwal pre-order fleksibel dengan sistem DP yang jelas',
      'Bisa request kartu ucapan dan kemasan hampers khusus acara',
      'Bahan baku halal, segar, dan selalu dipanggang/dimasak di hari pengiriman',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan slot pre-order bakery / catering / hampers.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin pre-order *${item}*${price ? ` (${price})` : ''}. Kapan jadwal terdekat yang tersedia?`,
  },
  LAUNDRY: {
    vertical: 'LAUNDRY',
    verticalLabel: 'Laundry Kiloan & Satuan',
    recommendedTheme: 'WARM_EMERALD',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Daftar Layanan & Tarif Laundry',
    catalogSectionSubtitle: 'Pilihan cuci kiloan reguler, ekspres, hingga perawatan satuan kain khusus.',
    primaryCtaLabel: 'Jadwalkan Antar-Jemput WA',
    itemActionLabel: 'Pilih Layanan',
    highlightsTitle: 'Standar Perawatan Cucian',
    defaultSubtitle: 'Cucian bersih, wangi tahan lama, dan tertata rapi dengan estimasi selesai tepat waktu.',
    defaultHighlights: [
      '1 mesin untuk 1 pelanggan agar pakaian lebih higienis',
      'Pilihan parfum lembut dan pengerjaan setrika uap rapi',
      'Konfirmasi status cucian siap ambil langsung ke WhatsApp Anda',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menggunakan layanan laundry / tanya jadwal antar-jemput.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin pesan layanan laundry *${item}*${price ? ` (${price})` : ''}.`,
  },
  CUCI_KENDARAAN: {
    vertical: 'CUCI_KENDARAAN',
    verticalLabel: 'Cuci Motor & Mobil',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Paket Cuci & Perawatan Kendaraan',
    catalogSectionSubtitle: 'Pengerjaan bersih mendetail untuk motor, mobil harian, hingga SUV.',
    primaryCtaLabel: 'Cek Antrean / Booking WA',
    itemActionLabel: 'Booking Layanan',
    highlightsTitle: 'Standar Cuci Kami',
    defaultSubtitle: 'Cuci salju bersih menyeluruh dengan sampo pH netral yang aman untuk cat kendaraan.',
    defaultHighlights: [
      'Menggunakan sampo pH seimbang dan kain microfiber terpisah',
      'Pembersihan kolong, velg, dan interior dilakukan teliti',
      'Ruang tunggu nyaman dan update selesai cepat via WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan antrean cuci kendaraan hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin booking layanan *${item}*${price ? ` (${price})` : ''} untuk kendaraan saya.`,
  },
  BARBERSHOP: {
    vertical: 'BARBERSHOP',
    verticalLabel: 'Barbershop & Grooming Pria',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Layanan Potong Rambut & Grooming',
    catalogSectionSubtitle: 'Pilihan potongan rapi, perawatan jenggot, dan hair styling pria.',
    primaryCtaLabel: 'Booking Kursi via WhatsApp',
    itemActionLabel: 'Booking Slot',
    highlightsTitle: 'Kenapa Cukur di Sini',
    defaultSubtitle: 'Potongan presisi oleh kapster berpengalaman dengan alat steril di setiap sesi.',
    defaultHighlights: [
      'Konsultasi gaya rambut sesuai bentuk wajah sebelum potong',
      'Peralatan gunting dan clipper selalu disterilkan setiap pelanggan',
      'Bisa booking jadwal lebih dulu lewat WhatsApp tanpa antre lama',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin booking jadwal potong rambut hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin booking layanan *${item}*${price ? ` (${price})` : ''}. Jam berapa kapster tersedia?`,
  },
  SALON_KECANTIKAN: {
    vertical: 'SALON_KECANTIKAN',
    verticalLabel: 'Salon Kecantikan Wanita',
    recommendedTheme: 'TERRACOTTA_CRAFT',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Menu Perawatan Rambut & Kecantikan',
    catalogSectionSubtitle: 'Hair treatment, coloring, nail art, hingga perawatan lengkap oleh terapis berpengalaman.',
    primaryCtaLabel: 'Reservasi Treatment via WA',
    itemActionLabel: 'Booking Treatment',
    highlightsTitle: 'Kenyamanan Perawatan Anda',
    defaultSubtitle: 'Perawatan kecantikan menyeluruh dengan produk berkualitas dan ruangan nyaman.',
    defaultHighlights: [
      'Produk perawatan rambut dan kuku pilihan yang lembut dan aman',
      'Stylist & terapis ramah siap membantu konsultasi perawatan',
      'Reservasi mudah via WhatsApp untuk memilih jam kunjungan',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin reservasi jadwal perawatan di salon Anda.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin booking treatment *${item}*${price ? ` (${price})` : ''}. Jadwal apa yang tersedia?`,
  },
  BARBERSHOP_SALON: {
    vertical: 'BARBERSHOP_SALON',
    verticalLabel: 'Barbershop & Salon',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Daftar Layanan & Treatment',
    catalogSectionSubtitle: 'Pilih layanan potong rambut, creambath, atau perawatan yang Anda butuhkan.',
    primaryCtaLabel: 'Booking Jadwal via WA',
    itemActionLabel: 'Booking Layanan',
    highlightsTitle: 'Standar Layanan Kami',
    defaultSubtitle: 'Pelayanan ramah, hasil rapi, dan penjadwalan praktis langsung lewat WhatsApp.',
    defaultHighlights: [
      'Kapster dan stylist berpengalaman dengan hasil konsisten',
      'Ruangan bersih dan peralatan rutin disterilkan',
      'Bisa pesan jadwal lebih dulu agar tidak menunggu lama',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin booking jadwal kunjungan hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin booking layanan *${item}*${price ? ` (${price})` : ''}.`,
  },
  SPA_WELLNESS: {
    vertical: 'SPA_WELLNESS',
    verticalLabel: 'SPA, Refleksi & Wellness',
    recommendedTheme: 'ORGANIC_SAGE',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Menu Terapi, Pijat & Paket Relaksasi',
    catalogSectionSubtitle: 'Pulihkan energi tubuh dengan sesi refleksi, pijat tradisional, dan body spa.',
    primaryCtaLabel: 'Reservasi Sesi SPA via WA',
    itemActionLabel: 'Reservasi Sesi',
    highlightsTitle: 'Suasana Tenang & Terjaga',
    defaultSubtitle: 'Ruang terapi hening, aroma alami, dan terapis terlatih untuk relaksasi maksimal.',
    defaultHighlights: [
      'Ruangan privat bersih dengan minyak aromaterapi pilihan',
      'Terapis bersertifikat dan ramah menyesuaikan tekanan pijatan',
      'Booking jam sesi mudah melalui WhatsApp sebelum kedatangan',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin reservasi sesi terapi / refleksi hari ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin reservasi paket *${item}*${price ? ` (${price})` : ''}. Jam berapa terapis tersedia?`,
  },
  PET_SHOP: {
    vertical: 'PET_SHOP',
    verticalLabel: 'Pet Shop, Grooming & Pet Hotel',
    recommendedTheme: 'ORGANIC_SAGE',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Layanan Grooming, Penitipan & Produk Hewan',
    catalogSectionSubtitle: 'Pakan bergizi, grooming lembut, dan pet hotel bersih untuk anabul kesayangan.',
    primaryCtaLabel: 'Booking Grooming / Tanya Produk',
    itemActionLabel: 'Pesan / Booking',
    highlightsTitle: 'Perawatan Aman untuk Anabul',
    defaultSubtitle: 'Semua kebutuhan makanan, vitamin, grooming, dan penitipan hewan dalam satu tempat.',
    defaultHighlights: [
      'Area grooming dan kandang penitipan dibersihkan setiap sesi',
      'Groomer sabar dan berpengalaman menangani kucing maupun anjing',
      'Tersedia pilihan pakan dan aksesori terpercaya siap kirim',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan layanan grooming / penitipan / produk pet shop.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin pesan / booking *${item}*${price ? ` (${price})` : ''} untuk anabul saya.`,
  },
  BIMBEL_KURSUS_GYM: {
    vertical: 'BIMBEL_KURSUS_GYM',
    verticalLabel: 'Bimbel, Kursus, Daycare & Gym',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Program Kelas, Kursus & Keanggotaan',
    catalogSectionSubtitle: 'Pilih program bulanan atau paket sesi yang sesuai dengan target belajar dan kebugaran.',
    primaryCtaLabel: 'Daftar Program via WhatsApp',
    itemActionLabel: 'Tanya Program',
    highlightsTitle: 'Keunggulan Program Kami',
    defaultSubtitle: 'Pendampingan terstruktur bersama pengajar dan instruktur berpengalaman dengan jadwal jelas.',
    defaultHighlights: [
      'Kurikulum dan jadwal kelas tertata dengan evaluasi rutin',
      'Pilihan kelas reguler, privat, maupun membership bulanan fleksibel',
      'Konsultasi penempatan kelas dan jadwal uji coba gratis via WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan info pendaftaran & jadwal program terbaru.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya tertarik mendaftar program *${item}*${price ? ` (${price})` : ''}. Bisa info jadwalnya?`,
  },
  FREELANCE: {
    vertical: 'FREELANCE',
    verticalLabel: 'Jasa Profesional & Freelance',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'SERVICE_PACKAGES',
    catalogSectionTitle: 'Paket Layanan & Jasa Profesional',
    catalogSectionSubtitle: 'Lingkup kerja jelas, estimasi waktu transparan, dan komunikasi langsung tanpa perantara.',
    primaryCtaLabel: 'Konsultasi Proyek via WhatsApp',
    itemActionLabel: 'Diskusi Paket',
    highlightsTitle: 'Cara Kerja & Komitmen Kami',
    defaultSubtitle: 'Membantu kebutuhan bisnis dan proyek Anda selesai tepat waktu dengan hasil terukur.',
    defaultHighlights: [
      'Brief awal, ruang lingkup, dan estimasi biaya disepakati transparan sejak awal',
      'Pembaruan progres berkala di setiap tahap pengerjaan',
      'Dokumen tagihan dan bukti kerja rapi untuk kebutuhan administrasi bisnis',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin berdiskusi mengenai kebutuhan proyek / jasa Anda.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya tertarik dengan paket jasa *${item}*${price ? ` (${price})` : ''}. Bisa diskusi lingkup proyeknya?`,
  },
  RENTAL_KENDARAAN: {
    vertical: 'RENTAL_KENDARAAN',
    verticalLabel: 'Rental Mobil & Motor',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'ASSET_BOOKING',
    catalogSectionTitle: 'Armada Siap Sewa & Tarif Harian',
    catalogSectionSubtitle: 'Cek ketersediaan armada terbaru lengkap dengan tarif transparan.',
    primaryCtaLabel: 'Cek Ketersediaan Armada WA',
    itemActionLabel: 'Sewa Unit Ini',
    highlightsTitle: 'Syarat Mudah & Unit Terawat',
    defaultSubtitle: 'Armada rutin servis, kabin bersih, dan serah terima terjadwal dengan kontrak jelas.',
    defaultHighlights: [
      'Seluruh unit rutin diperiksa mesin, rem, dan kebersihan sebelum berangkat',
      'Tarif sewa harian dan ketentuan overtime dijelaskan secara transparan',
      'Proses pemesanan dan verifikasi syarat cepat via WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin mengecek ketersediaan unit sewa mobil/motor.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, apakah unit *${item}*${price ? ` (${price})` : ''} tersedia untuk disewa?`,
  },
  SEWA_LAPANGAN: {
    vertical: 'SEWA_LAPANGAN',
    verticalLabel: 'Sewa Lapangan Olahraga',
    recommendedTheme: 'WARM_EMERALD',
    catalogMode: 'ASSET_BOOKING',
    catalogSectionTitle: 'Daftar Lapangan & Tarif Per Jam',
    catalogSectionSubtitle: 'Pilih arena olahraga dan amankan jadwal main Anda melalui booking DP.',
    primaryCtaLabel: 'Booking Jadwal Lapangan WA',
    itemActionLabel: 'Booking Jam',
    highlightsTitle: 'Fasilitas Arena Olahraga',
    defaultSubtitle: 'Lapangan terawat, pencahayaan terang, dan booking jam main praktis via WhatsApp.',
    defaultHighlights: [
      'Permukaan lapangan bersih dengan pencahayaan standar nyaman di mata',
      'Bisa amankan jadwal lebih dulu dengan sistem DP dan pelunasan di tempat',
      'Tersedia area parkir, ruang ganti, serta minuman segar di lokasi',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin cek jadwal kosong & booking lapangan.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya ingin booking *${item}*${price ? ` (${price})` : ''}. Jam berapa yang kosong?`,
  },
  HOMESTAY_VILLA: {
    vertical: 'HOMESTAY_VILLA',
    verticalLabel: 'Homestay, Penginapan & Villa',
    recommendedTheme: 'ORGANIC_SAGE',
    catalogMode: 'ASSET_BOOKING',
    catalogSectionTitle: 'Pilihan Unit & Tarif Menginap',
    catalogSectionSubtitle: 'Pesan langsung ke pengelola untuk harga terbaik tanpa biaya perantara tambahan.',
    primaryCtaLabel: 'Cek Tanggal & Booking WA',
    itemActionLabel: 'Tanya Tanggal',
    highlightsTitle: 'Fasilitas Menginap',
    defaultSubtitle: 'Penginapan nyaman dan bersih untuk liburan keluarga, perjalanan dinas, maupun staycation.',
    defaultHighlights: [
      'Pesan langsung via WhatsApp dengan konfirmasi cepat dari pengelola',
      'Unit dibersihkan menyeluruh setiap pergantian tamu',
      'Lokasi strategis dengan akses mudah dan informasi rute jelas',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin mengecek ketersediaan tanggal menginap.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, apakah unit *${item}*${price ? ` (${price})` : ''} tersedia untuk tanggal menginap saya?`,
  },
  KOST_KONTRAKAN: {
    vertical: 'KOST_KONTRAKAN',
    verticalLabel: 'Kost & Kontrakan',
    recommendedTheme: 'WARM_EMERALD',
    catalogMode: 'KOST_ROOMS',
    catalogSectionTitle: 'Ketersediaan Kamar & Tarif Sewa',
    catalogSectionSubtitle: 'Pantau jumlah kamar kosong secara real-time beserta fasilitas dan harga per bulan.',
    primaryCtaLabel: 'Tanya Kamar & Jadwal Survey',
    itemActionLabel: 'Booking Kamar',
    highlightsTitle: 'Keunggulan Lingkungan Hunian',
    defaultSubtitle: 'Hunian kost bersih, aman, dan nyaman dengan akses strategis serta pengelolaan tertib.',
    defaultHighlights: [
      'Status kamar kosong selalu terbarui langsung dari sistem pengelola',
      'Lingkungan tenang, bersih, dan aman untuk mahasiswa maupun pekerja',
      'Bisa jadwalkan survey lokasi langsung via WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya melihat info kamar kost Anda dan ingin menanyakan kamar kosong serta jadwal survey.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, saya tertarik dengan *${item}*${price ? ` (${price})` : ''}. Apakah kamar ini masih kosong untuk survey?`,
  },
  SEWA_GARASI: {
    vertical: 'SEWA_GARASI',
    verticalLabel: 'Sewa Garasi & Penitipan Mobil',
    recommendedTheme: 'SLATE_NAVY',
    catalogMode: 'ASSET_BOOKING',
    catalogSectionTitle: 'Slot Garasi & Tarif Sewa Bulanan',
    catalogSectionSubtitle: 'Lihat ketersediaan slot parkir tertutup dan tarif sewa harian maupun bulanan.',
    primaryCtaLabel: 'Tanya Slot Garasi via WA',
    itemActionLabel: 'Booking Slot',
    highlightsTitle: 'Keamanan & Akses Garasi',
    defaultSubtitle: 'Garasi kendaraan bersih, teduh, dan aman dengan akses teratur bagi penyewa.',
    defaultHighlights: [
      'Slot garasi terlindung dari panas dan hujan dengan akses keluar-masuk rapi',
      'Sistem sewa bulanan dan tahunan jelas tanpa biaya tersembunyi',
      'Survei lokasi dan cek slot kosong cepat melalui WhatsApp',
    ],
    waPrimaryGreeting: (name) => `Halo ${name}, saya ingin menanyakan ketersediaan slot garasi mobil bulan ini.`,
    waItemMessage: (name, item, price) =>
      `Halo ${name}, apakah *${item}*${price ? ` (${price})` : ''} masih tersedia untuk disewa?`,
  },
};

export function getVerticalLandingProfile(vertical: BusinessVertical): VerticalLandingProfile {
  return VERTICAL_LANDING_PROFILES[vertical] ?? VERTICAL_LANDING_PROFILES.TOKO_RETAIL;
}

export function buildDefaultTenantLandingPage(
  tenant: Pick<Tenant, 'id' | 'name' | 'slug' | 'vertical' | 'address' | 'logoUrl' | 'settings'>
): TenantLandingPageConfig {
  const profile = getVerticalLandingProfile(tenant.vertical);
  const now = new Date().toISOString();
  const baseSlug = normalizeSlugCandidate(tenant.slug || tenant.name) || `umkm-${tenant.id.slice(0, 6).toLowerCase()}`;
  const validSlug = baseSlug.length >= 3 ? baseSlug : `${baseSlug}-umkm`;

  return {
    id: `lp-${tenant.id}`,
    tenantId: tenant.id,
    slug: validSlug,
    customDomain: null,
    isPublished: false,
    themePreset: profile.recommendedTheme,
    logoUrl: tenant.logoUrl ?? null,
    heroTitle: tenant.name,
    heroSubtitle: profile.defaultSubtitle,
    heroImageUrl: null,
    aboutText: `${tenant.name} melayani pelanggan dengan mengutamakan kualitas produk, ketepatan layanan, dan transparansi harga. Hubungi kami langsung melalui WhatsApp untuk pemesanan maupun informasi lebih lanjut.`,
    whatsappNumber: tenant.settings?.businessWhatsappNumber ?? '',
    address: tenant.address ?? '',
    googleMapsUrl: null,
    openingHoursJson: DEFAULT_OPENING_HOURS,
    socialLinksJson: {},
    highlightsJson: [...profile.defaultHighlights],
    sectionsVisibilityJson: {
      hero: true,
      catalog: true,
      highlights: true,
      about: true,
      location: true,
      contact: true,
    },
    seoTitle: `${tenant.name} | ${profile.verticalLabel}`,
    seoDescription: profile.defaultSubtitle,
    updatedByAdminId: null,
    lastCustomizedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
