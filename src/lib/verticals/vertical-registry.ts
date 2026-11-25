/**
 * KasirAkun UMKM — Unified Single Source of Truth for All 22 Active UMKM Verticals
 * (+ backward-compatible fallback for legacy 'BARBERSHOP_SALON').
 *
 * Every picker (LandingPage, DemoHubPage, OnboardingPage, LoginPage, MasterConsole, Sidebar, Dashboard)
 * consumes this registry so labels, menus, capabilities, and tax behaviors stay 100% consistent.
 */

import type {
  AddOnModuleCode,
  BusinessVertical,
  ItemType,
  SubscriptionPlanCode,
} from '../../types/domain.ts';

export type VerticalCategoryGroup =
  | 'RETAIL_DAGANG'
  | 'KULINER_FNB'
  | 'JASA_PERAWATAN'
  | 'RENTAL_PROPETI'
  | 'PRODUKSI_AGRO';

export interface VerticalFeatureItem {
  title: string;
  detail: string;
}

export interface VerticalDefinition {
  id: BusinessVertical;
  label: string;
  shortLabel: string;
  categoryGroup: VerticalCategoryGroup;
  demoBusinessName: string;
  demoOwnerName: string;
  demoEmail: string;
  demoRegionCode: string;
  headline: string;
  summary: string;
  keyBenefitTitle: string;
  keyBenefits: string[];
  features: VerticalFeatureItem[];
  recommendedPlan: SubscriptionPlanCode;
  recommendedAddOns: AddOnModuleCode[];
  supportsPos: boolean;
  supportsCatalog: boolean;
  supportsRawMaterialsAndBom: boolean;
  supportsStockProcurement: boolean;
  supportsQrTablesAndKitchen: boolean;
  supportsPromoMenu: boolean;
  dedicatedRoute?: string;
  dedicatedMenuLabel?: string;
  primarySalesLabel?: string;
  isLegacyAlias?: boolean;
}

export const VERTICAL_GROUP_LABELS: Record<VerticalCategoryGroup, string> = {
  RETAIL_DAGANG: 'Dagang & Toko Retail',
  KULINER_FNB: 'Kuliner, Bakery & Kafe',
  JASA_PERAWATAN: 'Jasa, Perawatan & Pendidikan',
  RENTAL_PROPETI: 'Rental, Properti & Lapangan',
  PRODUKSI_AGRO: 'Produksi, Manufaktur & Agro',
};

export const ALL_VERTICAL_DEFINITIONS: VerticalDefinition[] = [
  // =========================================================================
  // 1. DAGANG & TOKO RETAIL
  // =========================================================================
  {
    id: 'WARUNG_SEMBAKO',
    label: 'Warung Sembako',
    shortLabel: 'Warung Sembako',
    categoryGroup: 'RETAIL_DAGANG',
    demoBusinessName: 'Warung Makmur Jaya',
    demoOwnerName: 'Hj. Siti Aminah',
    demoEmail: 'demo.sembako@kasirakun.id',
    demoRegionCode: 'ID-NONE',
    headline: 'Jualan Sembako Cepat, Satuan Dus/Eceran Rapi, Kasbon Pelanggan Terpantau',
    summary:
      'Dibuat khusus untuk warung kelontong dan agen sembako agar cepat melayani pembeli dengan barcode, harga grosir otomatis, dan catatan kulakan harian.',
    keyBenefitTitle: 'Manfaat Langsung untuk Pemilik Warung',
    keyBenefits: [
      'Paket LITE Rp49rb sangat ringkas: khusus bayar tunai tanpa cetak struk dan tanpa menu PO.',
      'Beli per dus, jual eceran per bungkus atau pcs, stok otomatis terhitung.',
      'Peringatan otomatis saat stok barang laris mulai menipis.',
    ],
    features: [
      { title: 'Kasir Cepat & Scan Barcode', detail: 'Scan kemasan langsung masuk keranjang atau cari nama barang singkat.' },
      { title: 'Harga Grosir & Buku Kasbon', detail: 'Potongan harga otomatis untuk pembelian banyak plus catatan piutang langganan.' },
      { title: 'Aturan Pajak Sembako', detail: 'Barang pokok seperti beras, telur, dan minyak bebas PPN sesuai aturan DJP.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    primarySalesLabel: 'Kasir POS Barcode',
  },
  {
    id: 'TOKO_RETAIL',
    label: 'Toko Retail & Minimarket',
    shortLabel: 'Toko Retail',
    categoryGroup: 'RETAIL_DAGANG',
    demoBusinessName: 'Minimarket & Retail Sentosa',
    demoOwnerName: 'Budi Santoso',
    demoEmail: 'demo.retail@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Kelola Ribuan Barang Retail, Barcode Rak & Multi-Cabang Tanpa Selisih',
    summary:
      'Cocok untuk minimarket, toko aksesoris, elektronik, ATK, dan toko serba ada yang menjual banyak kategori barang jadi dari berbagai supplier.',
    keyBenefitTitle: 'Manfaat Langsung untuk Toko Retail',
    keyBenefits: [
      'Pisah kategori, merek, dan barcode ribuan SKU secara terstruktur.',
      'Cek fisik stok berkala untuk mencegah selisih dan kehilangan barang.',
      'Pantau barang paling laris dan barang yang lama tidak terjual.',
    ],
    features: [
      { title: 'Kasir Barcode & Multi-Pembayaran', detail: 'Dukung Tunai, QRIS Dinamis, E-Wallet, dan Virtual Account otomatis.' },
      { title: 'PO Supplier & Hutang Tempo', detail: 'Catat pembelian tempo ke distributor lengkap dengan ongkir masuk modal.' },
      { title: 'Kontrol Multi-Cabang', detail: 'Transfer stok dari gudang pusat ke cabang dengan catatan barang di jalan.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    primarySalesLabel: 'Kasir Retail & Barcode',
  },
  {
    id: 'TOKO_FASHION',
    label: 'Toko Fashion, Distro & Sepatu',
    shortLabel: 'Toko Fashion',
    categoryGroup: 'RETAIL_DAGANG',
    demoBusinessName: 'Distro & Footwear Urban',
    demoOwnerName: 'Rendi Pratama',
    demoEmail: 'demo.fashion@kasirakun.id',
    demoRegionCode: 'ID-JB-BDG',
    headline: 'Stok Ukuran S/M/L/XL & Nomor Sepatu 38–44 Tertata Rapi per Warna',
    summary:
      'Khusus toko baju jadi, distro, hijab, dan toko sepatu yang kulakan barang jadi (bukan jahit sendiri), lengkap dengan SKU varian ukuran, warna, dan diskon musiman.',
    keyBenefitTitle: 'Manfaat Langsung untuk Toko Fashion & Distro',
    keyBenefits: [
      'Cari cepat sisa ukuran sepatu (39, 40, 41, 42) atau kaos (M, L, XL) saat pembeli bertanya.',
      'Beda jelas dengan Konveksi/Manufaktur: fokus jual barang jadi, retur tukar ukuran & promo cuci gudang.',
      'Cetak label harga/barcode SKU dan pantau model paling cepat habis.',
    ],
    features: [
      { title: 'Varian Ukuran & Warna', detail: 'Kelola setiap artikel baju/sepatu dengan stok terpisah per ukuran dan warna.' },
      { title: 'Promo Diskon & Bundle', detail: 'Atur promo Beli 2 Gratis 1, diskon akhir musim, dan harga khusus reseller.' },
      { title: 'Laporan Laba per Artikel', detail: 'Ketahui koleksi mana yang paling menguntungkan sebelum restock batch berikutnya.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    primarySalesLabel: 'Kasir Fashion & Varian',
  },
  {
    id: 'TOKO_BANGUNAN',
    label: 'Toko Bangunan & Material',
    shortLabel: 'Toko Bangunan',
    categoryGroup: 'RETAIL_DAGANG',
    demoBusinessName: 'TB Karya Mandiri Material',
    demoOwnerName: 'H. Agus Wijaya',
    demoEmail: 'demo.bangunan@kasirakun.id',
    demoRegionCode: 'ID-JT-SMG',
    headline: 'Jual Eceran & Grosir Proyek, Surat Jalan Truk & Kasbon Kontraktor Rapi',
    summary:
      'Dirancang untuk toko material dan besi bangunan: menangani satuan sak, kubik, batang, dus keramik, harga grosir proyek, surat jalan pengiriman, hingga piutang mandor.',
    keyBenefitTitle: 'Manfaat Langsung untuk Toko Bangunan',
    keyBenefits: [
      'Kelola harga eceran tukang sekaligus harga grosir proyek dalam satu katalog.',
      'Buat dan pantau Surat Jalan pengiriman material (sopir, nopol truk, status diterima proyek).',
      'Catat kasbon/tempo kontraktor beserta pengingat tagihan via WhatsApp.',
    ],
    features: [
      { title: 'Pengiriman & Surat Jalan Proyek', detail: 'Pantau muatan truk dari gudang hingga tiba di lokasi proyek pembeli.' },
      { title: 'Satuan Material Fleksibel', detail: 'Mendukung sak, dus, batang, lembar, m3 (kubik), hingga kg eceran paku/cat.' },
      { title: 'Kontrol Piutang & Tempo', detail: 'Pisahkan nota tunai dan nota tempo kontraktor agar arus kas toko tetap sehat.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Surat Jalan & Proyek',
    primarySalesLabel: 'Kasir Material & Grosir',
  },

  // =========================================================================
  // 2. PRODUKSI, MANUFAKTUR & AGRO
  // =========================================================================
  {
    id: 'MANUFAKTUR_KECIL',
    label: 'Manufaktur Kecil (Konveksi / Butik Jahit / Mebel)',
    shortLabel: 'Manufaktur & Konveksi',
    categoryGroup: 'PRODUKSI_AGRO',
    demoBusinessName: 'Konveksi & Butik Jahit Nusantara',
    demoOwnerName: 'Ibu Kartika Sari',
    demoEmail: 'demo.manufaktur@kasirakun.id',
    demoRegionCode: 'ID-JT-SLO',
    headline: 'Hitung Modal Kain/Kayu + Ongkos Tukang Menjadi HPP Barang Jadi Otomatis',
    summary:
      'Berbeda dengan toko baju jadi, modul ini khusus untuk konveksi, butik jahit dari kain mentah, serta bengkel mebel kayu yang mengolah bahan baku menjadi produk jadi.',
    keyBenefitTitle: 'Manfaat Langsung untuk Konveksi & Mebel',
    keyBenefits: [
      'Kelola SPK Produksi: potong bahan baku (kain, benang, kancing, kayu jati, pelitur) + ongkos penjahit/tukang.',
      'HPP per potong baju atau unit lemari terhitung otomatis agar harga jual tidak pernah rugi.',
      'Pantau progres produksi dari Pola/Potong -> Jahit/Rakit -> Finishing QC -> Stok Barang Jadi.',
    ],
    features: [
      { title: 'SPK Produksi & Konversi Bahan', detail: 'Ubah bahan mentah menjadi stok barang jadi lengkap dengan kalkulasi biaya tenaga kerja.' },
      { title: 'Gudang Bahan Baku & Barang Jadi', detail: 'Pisahkan stok kain/kayu mentah dengan produk siap jual atau pesanan custom.' },
      { title: 'Kasir & Invoice Pesanan Custom', detail: 'Terima DP pesanan seragam/mebel custom dan lacak pelunasan saat selesai.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: true,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Produksi & SPK Barang',
    primarySalesLabel: 'Kasir & Pesanan Jadi',
  },
  {
    id: 'PETERNAKAN_PERTANIAN',
    label: 'Peternakan & Pertanian',
    shortLabel: 'Peternakan & Agro',
    categoryGroup: 'PRODUKSI_AGRO',
    demoBusinessName: 'Agro Ternak Mandiri',
    demoOwnerName: 'Pak Slamet Raharjo',
    demoEmail: 'demo.agro@kasirakun.id',
    demoRegionCode: 'ID-NONE',
    headline: 'Pantau Biaya Pakan & Pupuk per Siklus hingga HPP Panen per Kilogram',
    summary:
      'Khusus peternak ayam, lele, kambing, serta petani sayur dan padi untuk mencatat pemakaian pakan/pupuk tiap siklus dan menghitung keuntungan bersih saat panen.',
    keyBenefitTitle: 'Manfaat Langsung untuk Peternak & Petani',
    keyBenefits: [
      'Biaya bibit, pakan, vitamin, dan pupuk terkumpul per batch kandang atau petak lahan.',
      'Saat panen, modal per kg atau per ekor langsung ketemu otomatis.',
      'Simpan kontak pengepul dan riwayat penjualan hasil panen.',
    ],
    features: [
      { title: 'Siklus Batch Ternak & Lahan', detail: 'Catat populasi awal, kematian, dan total biaya produksi setiap siklus.' },
      { title: 'Stok Pakan & Pupuk', detail: 'Pemakaian pakan dari gudang otomatis menjadi biaya produksi batch aktif.' },
      { title: 'Penjualan Panen ke Pengepul', detail: 'Catat timbangan panen, harga per kg, dan pembayaran dari pengepul.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/agro',
    dedicatedMenuLabel: 'Siklus Ternak & Panen',
    primarySalesLabel: 'Kasir Penjualan Panen',
  },

  // =========================================================================
  // 3. KULINER, BAKERY & KAFE
  // =========================================================================
  {
    id: 'KEDAI_MAKAN',
    label: 'Kedai Makan & Kopi',
    shortLabel: 'Kedai & Kopi',
    categoryGroup: 'KULINER_FNB',
    demoBusinessName: 'Kedai Nusantara',
    demoOwnerName: 'Dimas Pratama',
    demoEmail: 'demo.kedai@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Kasir Cepat Antrean Kopi, Potong Bahan Resep Otomatis & Pajak Daerah Rapi',
    summary:
      'Cocok untuk kedai kopi, warteg modern, geprek, dan warung makan dengan pesanan cepat dine-in atau takeaway serta pemotongan stok bahan baku otomatis.',
    keyBenefitTitle: 'Manfaat Langsung untuk Kedai Makan & Kopi',
    keyBenefits: [
      'Setiap 1 gelas kopi atau porsi makan laku, stok susu, biji kopi, atau ayam langsung terpotong.',
      'Hitung HPP resep otomatis supaya harga menu tidak tergerus kenaikan harga bahan.',
      'Pajak daerah PBJT 10% (opsional sesuai batas UMKM daerah) terpisah dari omzet bersih.',
    ],
    features: [
      { title: 'Kasir Klik Cepat', detail: 'Pilih menu, catatan level pedas/es, dan bayar tunai atau QRIS dalam hitungan detik.' },
      { title: 'Resep BOM & Bahan Mentah', detail: 'Atur takaran gram/ml per menu agar modal per porsi akurat.' },
      { title: 'Add-On QR Meja & KDS', detail: 'Bisa ditambah kapan saja jika kedai mulai ramai dan butuh layar dapur.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: true,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: true,
    supportsPromoMenu: true,
    primarySalesLabel: 'Kasir POS',
  },
  {
    id: 'RESTORAN',
    label: 'Restoran & Rumah Makan',
    shortLabel: 'Restoran',
    categoryGroup: 'KULINER_FNB',
    demoBusinessName: 'Resto Rasa Bali',
    demoOwnerName: 'Pak Budi Santoso',
    demoEmail: 'demo.resto@kasirakun.id',
    demoRegionCode: 'ID-BA-BDG',
    headline: 'QR Meja Self-Order, Layar Dapur KDS, Split Bill & PBJT Restoran Terpisah',
    summary:
      'Dirancang untuk restoran dengan layanan meja penuh, banyak pelayan, dapur terpisah, split bill rombongan, dan pemisahan pajak restoran daerah (PB1/PBJT 10%).',
    keyBenefitTitle: 'Manfaat Langsung untuk Restoran',
    keyBenefits: [
      'Pelanggan scan QR meja, pesan sendiri, pesanan langsung tampil di Layar Dapur (KDS).',
      'Dukung Open Bill, Split Bill rombongan, serta Pindah atau Gabung Meja.',
      'Pajak daerah PBJT 10% dan service charge tercatat terpisah dari penjualan bersih.',
    ],
    features: [
      { title: 'Meja QR & Layar Dapur KDS', detail: 'Kurangi antrean kasir dan salah catat pesanan antara pelayan dan koki.' },
      { title: 'Resep Dapur & HPP Akurat', detail: 'Potong stok bahan mentah dapur otomatis setiap menu dipesan.' },
      { title: 'Laporan Laba Rugi & Pajak Daerah', detail: 'Siap setor PBJT bulanan ke Bapenda sesuai kabupaten/kota lokasi resto.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: ['ADDON_RESTO_QR_KDS'],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: true,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: true,
    supportsPromoMenu: true,
    primarySalesLabel: 'Kasir POS',
  },
  {
    id: 'BAKERY_CATERING',
    label: 'Bakery, Catering & Hampers (Pre-Order)',
    shortLabel: 'Bakery & Catering',
    categoryGroup: 'KULINER_FNB',
    demoBusinessName: 'Dapur Kue & Catering Melati',
    demoOwnerName: 'Chef Nadia Putri',
    demoEmail: 'demo.bakery@kasirakun.id',
    demoRegionCode: 'ID-JB-BDG',
    headline: 'Jadwal Pre-Order Kue, Nasi Kotak & Hampers + Catatan DP Tanpa Terlewat',
    summary:
      'Khusus toko roti/bakery, usaha catering harian/acara, dan pembuat hampers musiman yang mengandalkan sistem Pre-Order (PO), pembayaran DP, dan resep bahan kue.',
    keyBenefitTitle: 'Manfaat Langsung untuk Bakery, Catering & Hampers',
    keyBenefits: [
      'Jadwal Pre-Order tersusun per tanggal & jam kirim agar tidak ada pesanan kue/nasi kotak yang lupa dibuat.',
      'Simpan catatan tulisan di kue, kartu ucapan hampers, DP masuk, dan sisa pelunasan.',
      'Kirim konfirmasi jadwal ambil/antar langsung ke WhatsApp pemesan (wa.me gratis di Paket LITE).',
    ],
    features: [
      { title: 'Kalender Pre-Order & Status Produksi', detail: 'Pantau status PO Masuk -> Produksi/Baking -> Siap Kirim -> Selesai.' },
      { title: 'Resep Bahan Kue & HPP Box', detail: 'Hitung modal tepung, mentega, kotak hampers, hingga pita secara akurat.' },
      { title: 'Kasir Ready Stock & Pre-Order', detail: 'Layani pembeli roti etalase langsung sekaligus pesanan PO acara.' },
    ],
    recommendedPlan: 'BASIC',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: true,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Pre-Order Bakery & Catering',
    primarySalesLabel: 'Kasir Etalase Bakery',
  },

  // =========================================================================
  // 4. JASA, PERAWATAN & PENDIDIKAN
  // =========================================================================
  {
    id: 'LAUNDRY',
    label: 'Laundry Kiloan & Satuan',
    shortLabel: 'Laundry',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Laundry Kilat Bersih Wangi',
    demoOwnerName: 'Ibu Dewi Lestari',
    demoEmail: 'demo.laundry@kasirakun.id',
    demoRegionCode: 'ID-NONE',
    headline: 'Catat Kiloan/Satuan, Nomor Rak & Kirim Notif WA Gratis (wa.me) Tanpa Fonnte',
    summary:
      'Dibuat khusus untuk laundry kiloan, laundry satuan/dry clean, dan laundry sepatu. Pantau status cucian dari Diterima hingga Siap Ambil dan kabari pelanggan via WhatsApp langsung.',
    keyBenefitTitle: 'Manfaat Langsung untuk Usaha Laundry',
    keyBenefits: [
      'Mulai Paket LITE Rp49rb sudah bisa kirim status cucian ke pelanggan via wa.me memakai nomor WA Anda sendiri tanpa wajib beli Add-On Fonnte.',
      'Catat berat (kg), jumlah potong, pilihan parfum, nomor rak penyimpanan, dan estimasi selesai.',
      'Bisa catat DP di depan atau bayar saat ambil, mencegah cucian tertukar atau lupa ditagih.',
    ],
    features: [
      { title: 'Pelacak Status Cucian & Rak', detail: 'Ubah status Diterima -> Dicuci -> Setrika -> Siap Ambil -> Selesai dengan 1 klik.' },
      { title: 'Kirim WA Langsung (wa.me)', detail: 'Kirim nota & pemberitahuan cucian selesai langsung dari aplikasi menggunakan WA Anda.' },
      { title: 'Stok Deterjen & Parfum', detail: 'Pantau belanja deterjen, pewangi, dan plastik packing di menu Gudang & Pembelian.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Order & Status Laundry',
    primarySalesLabel: 'Kasir Cepat Laundry',
  },
  {
    id: 'CUCI_KENDARAAN',
    label: 'Cuci Motor & Mobil',
    shortLabel: 'Cuci Motor & Mobil',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Kilau Steam Motor & Mobil',
    demoOwnerName: 'Bang Rizal Hakim',
    demoEmail: 'demo.cuci@kasirakun.id',
    demoRegionCode: 'ID-NONE',
    headline: 'Antrean Plat Nomor, Hitung Komisi Petugas Cuci & Kabari Pemilik via WA',
    summary:
      'Khusus doorsmeer, cuci steam motor, cuci salju mobil, hingga salon poles mobil. Catat plat nomor kendaraan, pilih paket cuci, dan hitung otomatis komisi tukang cuci.',
    keyBenefitTitle: 'Manfaat Langsung untuk Cuci Motor & Mobil',
    keyBenefits: [
      'Catat plat nomor & tipe kendaraan (Motor / Mobil Kecil / SUV) agar antrean jelas.',
      'Komisi petugas cuci per kendaraan terhitung otomatis setiap akhir hari.',
      'Kirim pesan WA langsung (wa.me) saat motor/mobil selesai dilap dan siap diambil.',
    ],
    features: [
      { title: 'Antrean Cuci per Plat Nomor', detail: 'Pantau status Antri -> Dicuci -> Finishing -> Selesai secara real-time.' },
      { title: 'Rekap Komisi Tukang Cuci', detail: 'Hitung bagi hasil petugas cuci otomatis tanpa coret-coretan kertas.' },
      { title: 'Penjualan Tambahan (Kopi/Pewangi)', detail: 'Jual minuman ruang tunggu atau parfum mobil langsung di kasir.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Antrean Cuci & Komisi',
    primarySalesLabel: 'Kasir Cuci & Produk',
  },
  {
    id: 'BARBERSHOP',
    label: 'Barbershop (Khusus Pria)',
    shortLabel: 'Barbershop',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Gentleman Cuts Barbershop',
    demoOwnerName: 'Mas Bagus Saputra',
    demoEmail: 'demo.barber@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Kasir Cukur Pria, Komisi Kapster Otomatis & Stok Pomade Terjaga',
    summary:
      'Dipisahkan khusus untuk Barbershop pria: fokus pada jasa potong rambut, fade, shave, hair tonic, pembagian komisi kapster per kepala, dan penjualan pomade/clay.',
    keyBenefitTitle: 'Manfaat Langsung untuk Barbershop',
    keyBenefits: [
      'Menu ringkas khusus perawatan pria (Haircut, Beard Trim, Hair Wash, Coloring) tanpa menu salon wanita.',
      'Pilih nama kapster di setiap layanan agar komisi harian/bulanan langsung terekap.',
      'Kelola stok pomade, powder, dan sampo yang dijual eceran di meja kasir.',
    ],
    features: [
      { title: 'Jadwal Kursi & Komisi Kapster', detail: 'Catat siapa kapster yang melayani tiap pelanggan beserta persentase komisinya.' },
      { title: 'Kasir Jasa + Produk Pomade', detail: 'Gabungkan jasa cukur dan pembelian produk haircare dalam satu nota.' },
      { title: 'Kontak Member Langganan', detail: 'Ingat potongan favorit pelanggan tetap dan kirim promo potong rambut.' },
    ],
    recommendedPlan: 'BASIC',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Antrean & Komisi Kapster',
    primarySalesLabel: 'Kasir Barbershop',
  },
  {
    id: 'SALON_KECANTIKAN',
    label: 'Salon Kecantikan (Wanita)',
    shortLabel: 'Salon Kecantikan',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Cantika Hair & Nail Salon',
    demoOwnerName: 'Mba Clara Wijaya',
    demoEmail: 'demo.salon@kasirakun.id',
    demoRegionCode: 'ID-JI-SBY',
    headline: 'Kelola Treatment Rebounding, Nail Art, Mani-Pedi, Stylist & Stok Serum',
    summary:
      'Khusus salon kecantikan wanita dengan beragam treatment durasi panjang (rebounding, smoothing, hair coloring, creambath, nail art, manicure/pedicure, eyelash) serta komisi stylist.',
    keyBenefitTitle: 'Manfaat Langsung untuk Salon Kecantikan',
    keyBenefits: [
      'Booking jam treatment panjang (60-180 menit) per kursi/stylist agar jadwal tidak tumpang tindih.',
      'Dukung multi-treatment dalam satu kunjungan (misal Hair Spa + Nail Art + Manicure).',
      'Pantau stok obat smoothing, cat rambut, kuteks gel, dan serum retail.',
    ],
    features: [
      { title: 'Booking Treatment & Stylist', detail: 'Atur jadwal rebounding, coloring, nail art, mani-pedi, dan komisi tiap stylist.' },
      { title: 'Kasir Paket Perawatan & Produk', detail: 'Gabungkan layanan salon dan penjualan serum/masker rambut.' },
      { title: 'Pengingat Jadwal via WA', detail: 'Kirim konfirmasi booking treatment ke pelanggan langsung lewat WhatsApp.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Booking Salon & Stylist',
    primarySalesLabel: 'Kasir Salon Kecantikan',
  },
  {
    id: 'SPA_WELLNESS',
    label: 'SPA & Refleksi',
    shortLabel: 'SPA & Refleksi',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Tirta Serenity SPA & Refleksi',
    demoOwnerName: 'Ibu Ayu Purnama',
    demoEmail: 'demo.spa@kasirakun.id',
    demoRegionCode: 'ID-BA-DPS',
    headline: 'Jadwal Ruang Treatment, Terapis, Paket Lulur/Massage & PBJT SPA Sesuai Daerah',
    summary:
      'Khusus usaha SPA, pijat refleksi, aromaterapi, dan body wellness. Mengatur ruangan/bed treatment, durasi sesi (60/90/120 menit), komisi terapis, serta pajak daerah PBJT SPA.',
    keyBenefitTitle: 'Manfaat Langsung untuk SPA & Refleksi',
    keyBenefits: [
      'Pantau ketersediaan ruang VIP/reguler dan jadwal terapis berdasarkan durasi sesi.',
      'Hitung komisi terapis per sesi treatment otomatis.',
      'Mendukung perhitungan PBJT SPA / Hiburan sesuai tarif daerah (atau dinonaktifkan jika dikecualikan).',
    ],
    features: [
      { title: 'Jadwal Ruangan & Terapis SPA', detail: 'Atur sesi Balinese Massage, Lulur, Refleksi, dan Aromaterapi per ruangan.' },
      { title: 'Stok Oil, Scrub & Aromaterapi', detail: 'Pantau persediaan minyak pijat, lulur, dan produk wellness retail.' },
      { title: 'Pajak Daerah SPA Transparan', detail: 'Tarif PBJT menyesuaikan domisili kota/kabupaten dan terpisah dari omzet bersih.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Ruang SPA & Terapis',
    primarySalesLabel: 'Kasir SPA & Paket',
  },
  {
    id: 'PET_SHOP',
    label: 'Pet Shop, Grooming & Penitipan Hewan',
    shortLabel: 'Pet Shop & Grooming',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Paws & Whiskers Pet Care',
    demoOwnerName: 'drh. Kevin Halim',
    demoEmail: 'demo.petshop@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Jual Makanan Hewan, Antrean Grooming & Pet Hotel dalam Satu Aplikasi',
    summary:
      'Dirancang untuk Pet Shop yang sekaligus melayani mandi/grooming kucing & anjing serta penitipan hewan (Pet Hotel) per malam, lengkap dengan catatan vaksin dan makan.',
    keyBenefitTitle: 'Manfaat Langsung untuk Pet Shop',
    keyBenefits: [
      'Antrean Grooming (mandi sehat, anti kutu/jamur, potong bulu) dengan notif WA saat anabul siap dijemput.',
      'Penitipan Hewan / Pet Hotel mencatat nomor kandang, tanggal check-in/out, dan aturan makan khusus.',
      'POS Barcode untuk penjualan dry food, wet food, pasir kucing, vitamin, dan aksesoris.',
    ],
    features: [
      { title: 'Antrean Grooming & Pet Hotel', detail: 'Simpan nama hewan, ras, info vaksin, nomor kandang, dan status layanan.' },
      { title: 'Kasir Pakan & Aksesoris', detail: 'Kelola penjualan karungan maupun repack eceran pakan hewan.' },
      { title: 'Notif WA Pemilik Hewan', detail: 'Kabari pemilik saat anabul selesai grooming atau laporan kondisi penitipan.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Grooming & Pet Hotel',
    primarySalesLabel: 'Kasir Pet Shop',
  },
  {
    id: 'BIMBEL_KURSUS_GYM',
    label: 'Bimbel, Kursus, Daycare & Gym / Fitness',
    shortLabel: 'Bimbel, Daycare & Gym',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Akademi Cerdas & Fit Studio',
    demoOwnerName: 'Ibu Rina Kusuma',
    demoEmail: 'demo.bimbel@kasirakun.id',
    demoRegionCode: 'ID-YO-YOG',
    headline: 'Tagihan SPP/Membership Rutin, Pengingat WA, Absensi & Honor Tutor per Sesi',
    summary:
      'Khusus lembaga bimbel, tempat kursus musik/bahasa/coding, daycare anak, serta gym/studio fitness berbasis iuran bulanan, kehadiran sesi, dan honor pengajar.',
    keyBenefitTitle: 'Manfaat Langsung untuk Bimbel, Kursus, Daycare & Gym',
    keyBenefits: [
      'Kelola tagihan SPP atau iuran membership bulanan dengan deteksi jatuh tempo otomatis.',
      'Kirim pengingat jatuh tempo langsung via WhatsApp (wa.me gratis atau Fonnte otomatis).',
      'Catat absensi kehadiran siswa/member dan hitung honor tutor/instruktur per sesi otomatis.',
    ],
    features: [
      { title: 'Tagihan SPP & Membership Rutin', detail: 'Pantau siswa/member yang sudah lunas maupun melewati tanggal jatuh tempo.' },
      { title: 'Absensi Kehadiran Sesi', detail: 'Tandai Hadir, Izin, atau Alpha per pertemuan kelas atau kunjungan gym.' },
      { title: 'Rekap Honor Tutor & Instruktur', detail: 'Jumlah sesi mengajar × tarif per sesi langsung menjadi rekap gaji pengajar.' },
    ],
    recommendedPlan: 'BASIC',
    recommendedAddOns: [],
    supportsPos: false,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'SPP, Absensi & Honor',
    primarySalesLabel: 'SPP, Absensi & Honor',
  },
  {
    id: 'FREELANCE',
    label: 'Jasa & Freelance',
    shortLabel: 'Jasa & Freelance',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Studio Desain Kreatif',
    demoOwnerName: 'Raka Mahendra',
    demoEmail: 'demo.freelance@kasirakun.id',
    demoRegionCode: 'ID-NONE',
    headline: 'Invoice Proyek, Pembayaran Termin & PPh Pekerjaan Bebas Pasal 56',
    summary:
      'Khusus desainer, fotografer, konsultan, programmer, dan agensi jasa perorangan untuk membuat tagihan proyek tanpa kerumitan menu gudang dan stok barang.',
    keyBenefitTitle: 'Manfaat Langsung untuk Freelancer & Jasa',
    keyBenefits: [
      'Menu bersih tanpa gudang, PO, maupun stock opname yang tidak relevan.',
      'Katalog paket layanan jasa dan riwayat tagihan klien tersusun rapi.',
      'Perhitungan pajak khusus Pekerjaan Bebas (Pasal 56 PP 20/2026 & kredit PPh 23).',
    ],
    features: [
      { title: 'Invoice Proyek & Jasa', detail: 'Buat tagihan DP maupun pelunasan proyek dengan tampilan profesional.' },
      { title: 'Daftar Klien & Riwayat Proyek', detail: 'Simpan kontak klien dan total nilai kerja sama sepanjang tahun.' },
      { title: 'Biaya Operasional & Alat Kerja', detail: 'Catat langganan software, internet, hingga penyusutan kamera/laptop.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    primarySalesLabel: 'Invoice Proyek & Jasa',
  },

  // =========================================================================
  // 5. RENTAL, PROPERTI & LAPANGAN
  // =========================================================================
  {
    id: 'RENTAL_KENDARAAN',
    label: 'Rental Mobil & Motor',
    shortLabel: 'Rental Mobil & Motor',
    categoryGroup: 'RENTAL_PROPETI',
    demoBusinessName: 'Nusantara Trans Rental',
    demoOwnerName: 'Pak Hendra Gunawan',
    demoEmail: 'demo.rental@kasirakun.id',
    demoRegionCode: 'ID-BA-DPS',
    headline: 'Pantau Jadwal Armada, Overtime, KM & Bensin, Upload KTP/SIM + Cetak Kontrak',
    summary:
      'Khusus usaha sewa mobil dan motor harian/mingguan: memantau status armada, menghitung denda overtime & selisih BBM otomatis, menyimpan bukti syarat (KTP/SIM), dan mencetak surat kontrak.',
    keyBenefitTitle: 'Manfaat Langsung untuk Rental Mobil & Motor',
    keyBenefits: [
      'Deteksi keterlambatan (overtime) otomatis × tarif per jam serta hitung denda jika BBM kembali kurang.',
      'Upload bukti syarat peminjaman (foto KTP, SIM, dan foto serah terima odometer/body) langsung di transaksi.',
      'Buat & cetak Surat Kontrak Peminjaman Kendaraan resmi siap tanda tangan dalam 1 klik.',
    ],
    features: [
      { title: 'Kontrol Armada, KM & Bensin', detail: 'Catat KM berangkat vs kembali serta level BBM awal vs akhir tiap sewa.' },
      { title: 'Upload Syarat KTP/SIM & Kontrak PDF', detail: 'Dokumen identitas tersimpan rapi dan kontrak sewa langsung siap cetak.' },
      { title: 'Hitung Overtime & Deposit Otomatis', detail: 'Tidak ada lagi selisih perhitungan jam lembur atau uang jaminan penyewa.' },
    ],
    recommendedPlan: 'BASIC',
    recommendedAddOns: [],
    supportsPos: false,
    supportsCatalog: false,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Armada & Kontrak Rental',
    primarySalesLabel: 'Armada & Kontrak Rental',
  },
  {
    id: 'SEWA_LAPANGAN',
    label: 'Sewa Lapangan (Badminton / Futsal / Padel)',
    shortLabel: 'Sewa Lapangan',
    categoryGroup: 'RENTAL_PROPETI',
    demoBusinessName: 'Arena Sport Badminton & Padel',
    demoOwnerName: 'Coach Arif Wibowo',
    demoEmail: 'demo.lapangan@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Jadwal Booking per Jam Teratur, Bayar DP & Sewa Raket/Shuttlecock',
    summary:
      'Khusus pengelola GOR badminton, lapangan futsal, mini soccer, dan lapangan padel. Atur slot jam main, terima DP booking, lunasi di lokasi, plus jual minuman/alat olahraga.',
    keyBenefitTitle: 'Manfaat Langsung untuk Pengelola Lapangan',
    keyBenefits: [
      'Sistem otomatis mencegah jadwal ganda pada lapangan dan jam yang sama.',
      'Catat uang muka (DP) saat booking dan sisa pelunasan saat pemain datang bermain.',
      'Tambahkan sewa raket/padel, beli shuttlecock, atau minuman dingin dalam satu catatan.',
    ],
    features: [
      { title: 'Jadwal Slot Lapangan Bebas Ganda', detail: 'Pilih lapangan Badminton/Futsal/Padel, tanggal, jam mulai, dan durasi.' },
      { title: 'Kelola DP & Pelunasan Cepat', detail: 'Pantau booking berstatus DP vs Lunas + kirim konfirmasi jadwal via WA.' },
      { title: 'Kantin & Sewa Alat Olahraga', detail: 'Jual minuman, shuttlecock, dan sewa perlengkapan di kasir kantin.' },
    ],
    recommendedPlan: 'BASIC',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Booking Lapangan & DP',
    primarySalesLabel: 'Kasir Kantin & Alat',
  },
  {
    id: 'HOMESTAY_VILLA',
    label: 'Homestay, Villa & Penginapan',
    shortLabel: 'Homestay & Villa',
    categoryGroup: 'RENTAL_PROPETI',
    demoBusinessName: 'Villa Sawah Tenang Ubud',
    demoOwnerName: 'Ibu Ni Luh Sari',
    demoEmail: 'demo.villa@kasirakun.id',
    demoRegionCode: 'ID-BA-GYR',
    headline: 'Kalender Booking Malam/Jam, Komisi OTA (Traveloka/Airbnb) & PBJT 10% Terpisah',
    summary:
      'Khusus pemilik homestay, guest house, cabin, dan villa harian/slot jam. Menghitung otomatis komisi OTA (Traveloka, Airbnb, Tiket.com) dan memisahkan PBJT Perhotelan Daerah 10% dari omzet bersih.',
    keyBenefitTitle: 'Manfaat Langsung untuk Homestay & Villa',
    keyBenefits: [
      'Dukung booking per malam maupun per slot jam lengkap dengan status Check-In, Check-Out & Cleaning.',
      'Komisi OTA (Traveloka/Airbnb/Booking.com) langsung terhitung agar pemilik tahu uang bersih diterima.',
      'PBJT Perhotelan Daerah (10% atau sesuai Perda domisili) dicatat terpisah sebagai kewajiban pajak daerah, bukan omzet pemilik.',
    ],
    features: [
      { title: 'Kalender Booking & Check-In/Out', detail: 'Pantau ketersediaan setiap villa/kamar dan jadwal pembersihan (housekeeping).' },
      { title: 'Rekonsiliasi Komisi OTA', detail: 'Bandingkan booking langsung (Direct 0%) vs OTA (15%–18%) secara transparan.' },
      { title: 'Pemisahan PBJT Perhotelan Daerah', detail: 'Pajak daerah 10% otomatis dipisah dari omzet sehingga laporan pajak daerah akurat.' },
    ],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: false,
    supportsCatalog: false,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Booking Homestay & Villa',
    primarySalesLabel: 'Booking Homestay & Villa',
  },
  {
    id: 'KOST_KONTRAKAN',
    label: 'Kost & Kontrakan',
    shortLabel: 'Kost & Kontrakan',
    categoryGroup: 'RENTAL_PROPETI',
    demoBusinessName: 'Kost Griya Nyaman',
    demoOwnerName: 'Ibu Dewi Hartono',
    demoEmail: 'demo.kost@kasirakun.id',
    demoRegionCode: 'ID-YO-SLM',
    headline: 'Status Kamar, Utang Deposit Penghuni (2106), Tagihan WA & PPh 4(2) 10%',
    summary:
      'Khusus pemilik kost bulanan dan kontrakan: kelola kamar kosong/terisi, uang deposit penghuni yang tidak tercampur omzet, tagihan WA, dan pajak sewa bangunan.',
    keyBenefitTitle: 'Manfaat Langsung untuk Pemilik Kost',
    keyBenefits: [
      'Tampilan bersih tanpa menu kasir toko, gudang, atau PO yang membingungkan.',
      'Uang jaminan (deposit) dicatat sebagai kewajiban (2106), bukan omzet dan bukan objek pajak.',
      'Kirim pengingat sewa kamar bulanan langsung ke WhatsApp penghuni.',
    ],
    features: [
      { title: 'Kamar & Tagihan Bulanan', detail: 'Pantau kamar terisi, tanggal jatuh tempo, dan riwayat pembayaran penghuni.' },
      { title: 'Deposit Aman Terpisah', detail: 'Mudah mengembalikan deposit saat penghuni keluar tanpa merusak laporan laba.' },
      { title: 'PPh Final Sewa Pasal 4(2)', detail: 'Hitung PPh Final sewa bangunan 10% secara otomatis.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: false,
    supportsCatalog: false,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/kost',
    dedicatedMenuLabel: 'Kamar & Tagihan Kost',
    primarySalesLabel: 'Kamar & Tagihan Kost',
  },
  {
    id: 'SEWA_GARASI',
    label: 'Sewa Garasi Mobil',
    shortLabel: 'Sewa Garasi Mobil',
    categoryGroup: 'RENTAL_PROPETI',
    demoBusinessName: 'Garasi Aman Residence',
    demoOwnerName: 'Pak Bambang Setyawan',
    demoEmail: 'demo.garasi@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Kelola Petak Garasi Mobil, Plat Nomor Penghuni & Pengingat Jatuh Tempo WA',
    summary:
      'Khusus pemilik usaha sewa garasi mobil bulanan atau harian di area perumahan/perkotaan. Catat nomor petak garasi, plat nomor mobil, jatuh tempo sewa, dan kirim pengingat WA.',
    keyBenefitTitle: 'Manfaat Langsung untuk Usaha Sewa Garasi',
    keyBenefits: [
      'Tampilan sangat sederhana cocok untuk Paket LITE Rp49rb, tanpa menu gudang atau stok yang ribet.',
      'Lihat petak garasi mana yang kosong, terisi, atau sudah jatuh tempo pembayaran.',
      'Kirim pengingat perpanjangan sewa bulanan lewat WhatsApp langsung (wa.me).',
    ],
    features: [
      { title: 'Peta Petak Garasi & Plat Nomor', detail: 'Catat kode slot (G-01 s.d. G-12), tipe indoor/kanopi, mobil, dan pemiliknya.' },
      { title: 'Tagihan Bulanan & Pengingat WA', detail: 'Tandai lunas atau jatuh tempo dan kirim pengingat ke pemilik mobil.' },
      { title: 'Aturan Pajak Fleksibel', detail: 'Mendukung PPh Sewa Bangunan 4(2) atau opsi PBJT Parkir komersial sesuai domisili.' },
    ],
    recommendedPlan: 'LITE',
    recommendedAddOns: [],
    supportsPos: false,
    supportsCatalog: false,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: false,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: false,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Slot & Tagihan Garasi',
    primarySalesLabel: 'Slot & Tagihan Garasi',
  },

  // Backward-compatible legacy alias (hidden from new pickers, keeps old persisted workspaces working)
  {
    id: 'BARBERSHOP_SALON',
    label: 'Barbershop & Salon (Legacy)',
    shortLabel: 'Barbershop & Salon',
    categoryGroup: 'JASA_PERAWATAN',
    demoBusinessName: 'Gentleman Cuts & Salon',
    demoOwnerName: 'Mas Bagus',
    demoEmail: 'demo.barber@kasirakun.id',
    demoRegionCode: 'ID-JK-JKT',
    headline: 'Kasir Jasa Potong & Perawatan dengan Komisi Kapster',
    summary: 'Mode kompatibilitas untuk workspace lama Barbershop & Salon.',
    keyBenefitTitle: 'Manfaat Utama',
    keyBenefits: ['Kasir jasa potong & produk haircare.', 'Komisi kapster otomatis.'],
    features: [{ title: 'Kasir Jasa & Produk', detail: 'Gabungkan layanan potong dan produk retail.' }],
    recommendedPlan: 'PRO',
    recommendedAddOns: [],
    supportsPos: true,
    supportsCatalog: true,
    supportsRawMaterialsAndBom: false,
    supportsStockProcurement: true,
    supportsQrTablesAndKitchen: false,
    supportsPromoMenu: true,
    dedicatedRoute: '/operations',
    dedicatedMenuLabel: 'Antrean & Komisi Kapster',
    primarySalesLabel: 'Kasir Salon & Kapster',
    isLegacyAlias: true,
  },
];

export const ACTIVE_VERTICAL_DEFINITIONS: VerticalDefinition[] = ALL_VERTICAL_DEFINITIONS.filter(
  (v) => !v.isLegacyAlias
);

export const VERTICAL_LABELS_MAP: Record<BusinessVertical, string> = ALL_VERTICAL_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.label;
    return acc;
  },
  {} as Record<BusinessVertical, string>
);

export const VERTICAL_SHORT_LABELS_MAP: Record<BusinessVertical, string> =
  ALL_VERTICAL_DEFINITIONS.reduce(
    (acc, item) => {
      acc[item.id] = item.shortLabel;
      return acc;
    },
    {} as Record<BusinessVertical, string>
  );

export interface ResolvedVerticalMeta extends VerticalDefinition {
  defaultCategoryName: string;
  defaultItemType: ItemType;
}

function resolveDefaultCategoryAndItemType(
  vertical: BusinessVertical
): { defaultCategoryName: string; defaultItemType: ItemType } {
  switch (vertical) {
    case 'WARUNG_SEMBAKO':
      return { defaultCategoryName: 'Sembako & Kebutuhan Pokok', defaultItemType: 'RETAIL_GOODS' };
    case 'TOKO_RETAIL':
      return { defaultCategoryName: 'Produk Utama', defaultItemType: 'RETAIL_GOODS' };
    case 'TOKO_FASHION':
      return { defaultCategoryName: 'Pakaian & Sepatu', defaultItemType: 'RETAIL_GOODS' };
    case 'TOKO_BANGUNAN':
      return { defaultCategoryName: 'Material Bangunan', defaultItemType: 'RETAIL_GOODS' };
    case 'KEDAI_MAKAN':
    case 'RESTORAN':
      return { defaultCategoryName: 'Menu Utama', defaultItemType: 'MENU_ITEM' };
    case 'BAKERY_CATERING':
      return { defaultCategoryName: 'Roti, Kue & Hampers', defaultItemType: 'MENU_ITEM' };
    case 'BARBERSHOP':
    case 'BARBERSHOP_SALON':
      return { defaultCategoryName: 'Layanan Cukur & Grooming', defaultItemType: 'SERVICE_FREELANCE' };
    case 'SALON_KECANTIKAN':
      return { defaultCategoryName: 'Perawatan & Treatment Salon', defaultItemType: 'SERVICE_FREELANCE' };
    case 'SPA_WELLNESS':
      return { defaultCategoryName: 'Paket SPA & Refleksi', defaultItemType: 'SERVICE_FREELANCE' };
    case 'LAUNDRY':
      return { defaultCategoryName: 'Layanan Cuci Kiloan & Satuan', defaultItemType: 'SERVICE_FREELANCE' };
    case 'CUCI_KENDARAAN':
      return { defaultCategoryName: 'Paket Cuci Motor & Mobil', defaultItemType: 'SERVICE_FREELANCE' };
    case 'PET_SHOP':
      return { defaultCategoryName: 'Pakan & Grooming Hewan', defaultItemType: 'RETAIL_GOODS' };
    case 'BIMBEL_KURSUS_GYM':
      return { defaultCategoryName: 'Paket Kelas & Membership', defaultItemType: 'SERVICE_FREELANCE' };
    case 'FREELANCE':
      return { defaultCategoryName: 'Paket Layanan Jasa', defaultItemType: 'SERVICE_FREELANCE' };
    case 'RENTAL_KENDARAAN':
      return { defaultCategoryName: 'Armada Sewa Mobil & Motor', defaultItemType: 'SERVICE_FREELANCE' };
    case 'SEWA_LAPANGAN':
      return { defaultCategoryName: 'Tarif Sewa Lapangan & Kantin', defaultItemType: 'SERVICE_FREELANCE' };
    case 'HOMESTAY_VILLA':
      return { defaultCategoryName: 'Kamar, Villa & Layanan Tamu', defaultItemType: 'SERVICE_FREELANCE' };
    case 'KOST_KONTRAKAN':
      return { defaultCategoryName: 'Sewa Kamar & Utilitas', defaultItemType: 'SERVICE_FREELANCE' };
    case 'SEWA_GARASI':
      return { defaultCategoryName: 'Tarif Sewa Slot Garasi', defaultItemType: 'SERVICE_FREELANCE' };
    case 'MANUFAKTUR_KECIL':
      return { defaultCategoryName: 'Produk Jadi & Custom Jahit/Mebel', defaultItemType: 'RETAIL_GOODS' };
    case 'PETERNAKAN_PERTANIAN':
      return { defaultCategoryName: 'Hasil Panen, Pakan & Bibit', defaultItemType: 'RETAIL_GOODS' };
    default:
      return { defaultCategoryName: 'Produk Utama', defaultItemType: 'RETAIL_GOODS' };
  }
}

export function getVerticalMeta(vertical: BusinessVertical): ResolvedVerticalMeta {
  const base =
    ALL_VERTICAL_DEFINITIONS.find((v) => v.id === vertical) ?? ALL_VERTICAL_DEFINITIONS[0];
  const defaults = resolveDefaultCategoryAndItemType(base.id);
  return {
    ...base,
    ...defaults,
  };
}
