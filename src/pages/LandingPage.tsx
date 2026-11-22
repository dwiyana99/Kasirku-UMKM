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

interface VerticalInfoItem {
  id: BusinessVertical;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  headline: string;
  summary: string;
  keyBenefitTitle: string;
  keyBenefits: string[];
  features: VerticalFeatureGroup[];
}

const VERTICAL_SHOWCASES: VerticalInfoItem[] = [
  {
    id: 'WARUNG_SEMBAKO',
    label: 'Warung Sembako',
    icon: Store,
    headline: 'Kasir cepat untuk warung, bisa tanpa printer struk, dan stok dus ke eceran selalu rapi.',
    summary:
      'Dibuat khusus untuk warung kelontong, toko sembako, dan agen beras atau minyak. Anda tidak perlu pusing soal istilah pembukuan. Layani pembeli seperti biasa, catatan stok dan untung harian langsung beres sendiri.',
    keyBenefitTitle: 'Kenapa cocok untuk Warung Sembako',
    keyBenefits: [
      'Beli kulakan per dus atau karung, lalu jual eceran per bungkus atau kilo dengan stok terpotong otomatis.',
      'Tidak punya printer struk? Tinggal pilih selesai tanpa cetak struk atau kirim nota ke WhatsApp pembeli.',
      'Ada buku catatan kasbon pelanggan dan harga grosir otomatis untuk pembeli langganan.',
    ],
    features: [
      {
        title: 'Melayani Pembeli Lebih Cepat',
        detail:
          'Scan barcode langsung dari kamera HP atau alat scan USB. Transaksi selesai dalam hitungan detik, tanpa harus mencetak kertas jika tidak diperlukan.',
      },
      {
        title: 'Stok Kulakan & Harga Jual Aman',
        detail:
          'Catat belanja kulakan harian beserta ongkos kirimnya. Tersedia bantu hitung harga jual dari harga beli agar tidak pernah salah pasang harga atau merugi.',
      },
      {
        title: 'Catatan Untung Harian Jelas',
        detail:
          'Setiap kali barang terjual, modal barang dan uang untung bersih langsung tercatat otomatis sehingga Anda tahu persis berapa hasil dagang hari ini.',
      },
      {
        title: 'Urusan Pajak Usaha Kecil Jadi Tenang',
        detail:
          'Memantau batas omzet bebas pajak Rp500 Juta per tahun untuk usaha perorangan serta memisahkan bahan pokok yang memang tidak kena PPN.',
      },
    ],
  },
  {
    id: 'TOKO_RETAIL',
    label: 'Toko Retail',
    icon: ShoppingBag,
    headline: 'Kelola banyak merek dan ukuran, harga reseller, hingga stok antar cabang dengan rapi.',
    summary:
      'Pas untuk toko baju, sepatu, kosmetik, aksesoris, alat tulis, elektronik, hingga minimarket. Semua jenis dan ukuran barang tertata rapi supaya kasir cepat menemukan barang dan Anda tahu barang mana yang paling laku.',
    keyBenefitTitle: 'Kenapa cocok untuk Toko Retail',
    keyBenefits: [
      'Kelompokkan barang dengan rapi dari kategori, jenis, merek, sampai ukuran kemasan.',
      'Pasang harga khusus reseller, promo diskon, atau paket hemat tanpa hitung manual.',
      'Terima bayar tunai, QRIS, GoPay, DANA, OVO, hingga transfer bank yang langsung tercek otomatis.',
    ],
    features: [
      {
        title: 'Kasir Cepat & Pilihan Bayar Lengkap',
        detail:
          'Cari barang lewat barcode, nama, merek, atau ukuran. Pembayaran non-tunai langsung tercatat lunas secara otomatis begitu pembeli selesai membayar.',
      },
      {
        title: 'Cek Fisik Stok Gudang Lebih Jujur',
        detail:
          'Saat pegawai menghitung ulang barang di rak, jumlah stok di layar disembunyikan agar hitungan mereka benar-benar sesuai barang fisik di toko.',
      },
      {
        title: 'Tahu Barang Terlaris & Modal Aman',
        detail:
          'Pantau barang yang cepat habis agar segera kulakan, dan gunakan simulasi harga jual agar biaya sewa, listrik, serta potongan QRIS tetap tertutup untung.',
      },
      {
        title: 'Siap Tambah Cabang Kapan Saja',
        detail:
          'Mulai dari 1 toko dulu tanpa tampilan rumit. Saat nanti membuka toko kedua, tinggal aktifkan Add-On Cabang untuk memantau semua toko dari satu tempat.',
      },
    ],
  },
  {
    id: 'BARBERSHOP_SALON',
    label: 'Barbershop & Salon',
    icon: Scissors,
    headline: 'Catat layanan potong dan perawatan, hitung komisi kapster otomatis, plus jual produk.',
    summary:
      'Dirancang untuk barbershop, salon kecantikan, studio kuku, dan klinik perawatan. Tidak perlu lagi merekap buku catatan bagi hasil kapster secara manual setiap minggu.',
    keyBenefitTitle: 'Kenapa cocok untuk Barbershop & Salon',
    keyBenefits: [
      'Gabungkan jasa potong rambut dan produk seperti pomade atau serum dalam satu nota.',
      'Cukup pilih nama kapster atau stylist saat transaksi agar komisi langsung terhitung rapi.',
      'Uang hasil jasa dan hasil jualan produk tercatat terpisah sehingga mudah dipantau.',
    ],
    features: [
      {
        title: 'Nota Layanan & Produk Jadi Satu',
        detail:
          'Kasir tinggal memilih layanan yang dipakai pelanggan beserta produk tambahan yang dibeli, lalu pilih nama kapster yang menangani.',
      },
      {
        title: 'Komisi Tim Terhitung Tanpa Salah',
        detail:
          'Setiap transaksi langsung menambah catatan komisi kapster yang bersangkutan. Saat hari gajian, rekap komisi masing-masing pegawai sudah siap dipakai.',
      },
      {
        title: 'Stok Produk & Peralatan Terpantau',
        detail:
          'Sisa stok sampo, vitamin, cat rambut, dan pomade selalu terpantau. Peralatan besar seperti kursi barber dan mesin cukur juga tercatat rapi sebagai aset.',
      },
      {
        title: 'Pembayaran Non-Tunai Praktis',
        detail:
          'Pelanggan bisa membayar lewat QRIS, GoPay, DANA, OVO, atau transfer dan status lunas langsung muncul otomatis di layar kasir.',
      },
    ],
  },
  {
    id: 'KEDAI_MAKAN',
    label: 'Kedai Makan & Kopi',
    icon: Coffee,
    headline: 'Pencet menu cepat, bahan baku berkurang sendiri sesuai resep, dan antrean dapur rapi.',
    summary:
      'Cocok untuk warung makan, kedai kopi, minuman kekinian, ayam geprek, dan toko roti. Setiap kali satu porsi makanan atau gelas minuman laku, stok bahan bakunya langsung terpotong otomatis.',
    keyBenefitTitle: 'Kenapa cocok untuk Kedai Makan & Kopi',
    keyBenefits: [
      'Tampilan menu bergambar yang besar dan mudah ditekan kasir saat antrean ramai.',
      'Takaran resep per porsi otomatis memotong stok biji kopi, susu, ayam, atau tepung.',
      'Modal per porsi langsung ketahuan sehingga harga jual tidak pernah salah pasang.',
    ],
    features: [
      {
        title: 'Kasir Cepat untuk Antrean Ramai',
        detail:
          'Catat pesanan makan di tempat, bungkus, atau ojek online lengkap dengan catatan pembeli seperti tingkat pedas, sedikit es, atau tanpa gula.',
      },
      {
        title: 'Stok Bahan Baku Terjaga Otomatis',
        detail:
          'Isi takaran bahan per menu satu kali saja. Setiap penjualan langsung mengurangi stok di dapur dan memberi tahu bahan mana yang hampir habis.',
      },
      {
        title: 'Laci Kasir Aman Saat Ganti Shift',
        detail:
          'Kasir membuka dan menutup shift dengan catatan uang laci yang jelas, membantu pemilik memastikan uang tunai dan transfer selalu cocok.',
      },
      {
        title: 'Pajak Rumah Makan Terpisah Rapi',
        detail:
          'Pajak daerah kedai atau restoran (PB1 10%) dipisahkan dari uang penjualan utama agar tidak tercampur saat melihat untung bersih.',
      },
    ],
  },
  {
    id: 'RESTORAN',
    label: 'Restoran',
    icon: UtensilsCrossed,
    headline: 'Atur meja, pisah atau gabung tagihan, layar dapur langsung jalan, dan bisa QR Meja.',
    summary:
      'Membantu restoran keluarga dan kafe yang melayani banyak meja agar pelayan, kasir, dan tim dapur bekerja serempak tanpa kertas pesanan yang terselip atau salah antar.',
    keyBenefitTitle: 'Kenapa cocok untuk Restoran',
    keyBenefits: [
      'Kelola meja kosong atau terisi, buka tagihan meja, pisah bayar, hingga pindah atau gabung meja.',
      'Pesanan langsung tampil di layar dapur (Kitchen Display) sehingga koki tahu urutan masak.',
      'Tersedia Add-On QR Meja agar tamu bisa memilih menu dan membayar langsung dari HP mereka.',
    ],
    features: [
      {
        title: 'Layanan Meja Tanpa Salah Antar',
        detail:
          'Pelayan dapat membuka tagihan per meja, menambah pesanan susulan, memisahkan pembayaran per tamu, atau memindahkan meja dengan mudah.',
      },
      {
        title: 'Dapur & Kasir Selalu Sinkron',
        detail:
          'Begitu pesanan masuk, daftar masakan langsung muncul di layar dapur beserta catatan khusus tamu, lalu status siap saji langsung terlihat oleh pelayan.',
      },
      {
        title: 'Bahan Baku & Modal Menu Terukur',
        detail:
          'Setiap menu terhubung dengan resep bahan mentah sehingga stok gudang dapur dan keuntungan bersih harian selalu akurat.',
      },
      {
        title: 'Laporan Lengkap Siap Dikembangkan',
        detail:
          'Pemasukan harian, biaya listrik atau sewa, pajak PB1, hingga laporan keuangan bulanan tersedia otomatis tanpa perlu rekap ulang.',
      },
    ],
  },
  {
    id: 'FREELANCE',
    label: 'Jasa & Freelance',
    icon: Briefcase,
    headline: 'Kirim tagihan proyek dan DP klien dengan rapi, pantau pelunasan, dan pajak aman.',
    summary:
      'Dibuat untuk desainer, fotografer, konsultan, penulis, programmer, dan penyedia jasa lainnya agar penagihan klien lebih profesional dan keuangan usaha tidak bercampur dengan uang pribadi.',
    keyBenefitTitle: 'Kenapa cocok untuk Jasa & Freelance',
    keyBenefits: [
      'Buat paket layanan jasa dan kirim tagihan DP maupun pelunasan lewat PDF atau WhatsApp.',
      'Tahu jelas klien mana yang sudah lunas dan mana yang masih menunggu pelunasan.',
      'Pencatatan pajak khusus pekerja bebas, termasuk bukti potong dari klien perusahaan.',
    ],
    features: [
      {
        title: 'Tagihan Proyek Lebih Profesional',
        detail:
          'Susun daftar jasa dan buat nota tagihan resmi dengan jadwal DP serta pelunasan, lalu kirim ke klien hanya dalam beberapa klik.',
      },
      {
        title: 'Catat Pengeluaran & Alat Kerja',
        detail:
          'Simpan catatan biaya operasional seperti langganan software, transportasi, hingga pembelian laptop atau kamera yang dicatat rapi sebagai aset.',
      },
      {
        title: 'Arus Kas Bersih Mudah Dipantau',
        detail:
          'Lihat total pemasukan yang sudah diterima, tagihan yang belum dibayar klien, dan penghasilan bersih Anda setiap bulan.',
      },
      {
        title: 'Sesuai Aturan Pajak Pekerja Bebas',
        detail:
          'Tidak keliru memakai aturan pajak warung biasa; pencatatan sudah menyesuaikan pajak pekerja bebas beserta bukti potong PPh 23.',
      },
    ],
  },
  {
    id: 'KOST_KONTRAKAN',
    label: 'Kost & Kontrakan',
    icon: Home,
    headline: 'Pantau kamar kosong atau terisi, kirim tagihan bulanan lewat WA, dan uang deposit aman.',
    summary:
      'Memudahkan pemilik kost, paviliun, dan rumah kontrakan mengelola data penghuni, menagih uang sewa tepat waktu, serta menjaga uang jaminan penghuni tetap terpisah.',
    keyBenefitTitle: 'Kenapa cocok untuk Kost & Kontrakan',
    keyBenefits: [
      'Lihat status seluruh kamar (kosong, terisi, atau perbaikan) dalam satu layar bersih.',
      'Buat tagihan sewa plus listrik, air, atau WiFi lalu kirim rinciannya lewat WhatsApp.',
      'Uang jaminan (deposit) penghuni tercatat terpisah sebagai titipan, bukan keuntungan.',
    ],
    features: [
      {
        title: 'Data Kamar & Penghuni Selalu Rapi',
        detail:
          'Simpan nama penghuni, nomor HP, kontak darurat, tanggal masuk, dan masa sewa agar tidak ada jadwal jatuh tempo yang terlewat.',
      },
      {
        title: 'Penagihan Sewa Bulanan Lebih Mudah',
        detail:
          'Gabungkan tarif kamar dengan biaya tambahan seperti listrik atau iuran sampah, lalu kirim pengingat tagihan langsung ke WhatsApp penghuni.',
      },
      {
        title: 'Uang Deposit Tidak Tercampur Omzet',
        detail:
          'Deposit penghuni baru otomatis dipisahkan sebagai uang titipan. Saat penghuni keluar dan deposit dikembalikan, catatan uang Anda tetap tepat.',
      },
      {
        title: 'Catatan Pajak Sewa Bangunan Rapi',
        detail:
          'Total penerimaan sewa dan perkiraan kewajiban pajak sewa bangunan tercatat rapi setiap bulan tanpa harus menghitung manual.',
      },
    ],
  },
  {
    id: 'PETERNAKAN_PERTANIAN',
    label: 'Peternakan & Pertanian',
    icon: Sprout,
    headline: 'Catat pakan, bibit, dan pupuk per masa panen agar modal per kilo langsung ketahuan.',
    summary:
      'Pas untuk peternak ayam, lele, kambing, maupun petani sayur dan padi. Semua biaya sejak awal tebar bibit sampai panen terkumpul rapi per kandang atau per lahan.',
    keyBenefitTitle: 'Kenapa cocok untuk Peternakan & Pertanian',
    keyBenefits: [
      'Catat perjalanan setiap kandang atau blok lahan dari awal bibit masuk hingga panen.',
      'Pemakaian pakan, obat, dan pupuk otomatis mengurangi stok gudang Anda.',
      'Saat panen, modal per kilogram atau per ekor langsung ketahuan sebelum menjual ke tengkulak.',
    ],
    features: [
      {
        title: 'Kelola Per Kandang atau Per Lahan',
        detail:
          'Buat catatan terpisah untuk tiap angkatan ternak atau musim tanam, termasuk jumlah bibit awal dan catatan penyusutan harian.',
      },
      {
        title: 'Stok Pakan, Pupuk & Obat Terkendali',
        detail:
          'Catat pembelian pakan atau pupuk ke gudang, lalu catat setiap kali diambil untuk kandang tertentu agar stok selalu akurat.',
      },
      {
        title: 'Tahu Modal Panen Sebelum Jual',
        detail:
          'Masukkan total hasil panen bersih (kg, ekor, atau ton). Sistem langsung membagi seluruh biaya periode itu sehingga Anda tahu batas harga jual aman.',
      },
      {
        title: 'Catatan Penjualan & Untung Jelas',
        detail:
          'Hasil penjualan panen dan seluruh biaya perawatan langsung tersusun menjadi laporan untung-rugi bulanan yang mudah dibaca.',
      },
    ],
  },
];

const HERO_PILLARS = [
  {
    title: 'Tampilan Menyesuaikan Usaha Anda',
    detail:
      'Pemilik warung tidak akan melihat menu meja restoran. Pemilik kost tidak dibingungkan menu bahan dapur. Hanya menu yang Anda pakai yang tampil.',
  },
  {
    title: 'Bisa Langsung Pakai Tanpa Printer Struk',
    detail:
      'Belum punya printer kasir? Transaksi tetap bisa diselesaikan cepat tanpa cetak kertas, atau kirim nota langsung ke WhatsApp pembeli.',
  },
  {
    title: 'Bantu Hitung Harga Jual Agar Tidak Rugi',
    detail:
      'Tersedia simulasi harga jual dari modal beli (HPP) yang ikut menghitung biaya operasional, potongan QRIS, dan pajak supaya untung benar-benar aman.',
  },
  {
    title: 'Pembayaran Non-Tunai Tercek Otomatis',
    detail:
      'Terima tunai, QRIS, GoPay, DANA, OVO, hingga transfer bank. Status lunas langsung tercatat sendiri dan terpisah aman untuk setiap toko.',
  },
];

const EDITORIAL_ADVANTAGES = [
  {
    num: '01.',
    title: 'Mulai dari 1 Toko, Siap Tambah Cabang Saat Usaha Membesar',
    body: 'Jika usaha Anda masih 1 tempat, tampilannya sangat bersih tanpa menu cabang yang membingungkan. Saat nanti membuka cabang kedua atau gudang, tinggal aktifkan Add-On Cabang untuk memantau semua lokasi dari satu layar.',
    meta: '1 Toko ke Multi-Cabang',
  },
  {
    num: '02.',
    title: 'Hitung Harga Jual Lebih Pasti Supaya Tidak Salah Margin',
    body: 'Banyak usaha merasa ramai tetapi uang tidak terkumpul karena lupa menghitung biaya listrik, kemasan, potongan QRIS, atau pajak. Mulai Paket BASIC, Anda bisa mensimulasikan harga jual dari persentase HPP sebelum menetapkan harga.',
    meta: 'Cek Harga Anti-Rugi',
  },
  {
    num: '03.',
    title: 'Cek Fisik Stok Lebih Jujur & Belanja Supplier Lebih Tertib',
    body: 'Saat pegawai menghitung barang di rak, angka stok komputer disembunyikan agar laporan mereka benar-benar sesuai barang asli. Belanja tempo ke supplier, ongkos kirim, hingga surat jalan antar cabang juga tercatat rapi.',
    meta: 'Kontrol Gudang & Kulakan',
  },
  {
    num: '04.',
    title: 'Pembayaran Non-Tunai Tercek Otomatis & Rekening Terpisah Aman',
    body: 'Setiap akun usaha memiliki jalur pembayaran non-tunai sendiri yang tidak tercampur dengan toko lain. Saat pembeli membayar lewat QRIS, e-wallet, atau VA, kasir langsung menerima tanda lunas tanpa perlu cek mutasi manual.',
    meta: 'Non-Tunai Otomatis',
  },
];

const PLAN_FRIENDLY_COPY: Record<
  string,
  { idealFor: string; subtitle: string; bullets: string[]; footerNote: string }
> = {
  LITE: {
    idealFor: 'Untuk pemula & usaha 1 orang',
    subtitle:
      'Paling hemat dan sangat sederhana untuk warung sembako, jasa freelance, kost, atau tani dan ternak.',
    bullets: [
      '1 lokasi usaha dan 1 akun pemilik dengan menu super ringkas',
      'Kasir tunai cepat yang langsung selesai tanpa ribet cetak struk',
      'Tanpa menu PO Supplier yang rumit, fokus catat jualan dan biaya harian',
      'Catat stok barang, kamar kost, proyek jasa, atau siklus panen serta untung harian',
      'Butuh QRIS, cetak struk, atau PO nanti? Tinggal tambah Add-On sesuai kebutuhan',
    ],
    footerNote: 'Harga tetap bulanan · bebas biaya tambahan tersembunyi',
  },
  BASIC: {
    idealFor: 'Untuk toko harian & kasir non-tunai',
    subtitle:
      'Pilihan pas untuk toko dengan 1 lokasi yang butuh bayar non-tunai, cetak struk, dan cek harga jual anti-rugi.',
    bullets: [
      '1 lokasi usaha + hingga 3 akun pegawai atau kasir',
      'Kasir tunai + QRIS, GoPay, DANA, OVO, Virtual Account & Transfer otomatis',
      'Cetak struk thermal 58mm/80mm + tetap ada opsi selesai tanpa cetak struk',
      'Termasuk Simulasi Harga Jual (% dari HPP) agar untung tidak tergerus biaya',
      'Catatan stok barang, shift kasir, dan laporan untung-rugi otomatis',
    ],
    footerNote: 'Harga tetap bulanan · sudah termasuk non-tunai & struk',
  },
  PRO: {
    idealFor: 'Untuk usaha berkembang & punya tim',
    subtitle:
      'Pilihan favorit untuk usaha yang ingin kontrol gudang ketat, belanja supplier tempo, dan harga grosir.',
    bullets: [
      'Semua keunggulan Paket BASIC + hingga 10 akun pegawai dengan pembagian tugas',
      'Purchase Order (PO Supplier), catatan hutang tempo, ongkir masuk modal & cetak PDF',
      'Stok lanjutan: satuan dus ke eceran, resep bahan baku dapur & cek stok fisik jujur',
      'Harga grosir otomatis, promo diskon, buku kasbon pelanggan & komisi kapster',
      'Pengawasan shift kasir otomatis untuk mencegah selisih laci',
    ],
    footerNote: 'Harga tetap bulanan · fitur Restoran & Tambah Cabang bisa ditambah opsional',
  },
  EXPERT: {
    idealFor: 'Untuk usaha mapan, CV/PT & laporan lengkap',
    subtitle:
      'Untuk pemilik usaha yang membutuhkan laporan keuangan lengkap dan kesiapan pelaporan pajak 2026.',
    bullets: [
      'Semua keunggulan Paket PRO + hingga 20 akun pegawai',
      'Laporan keuangan lengkap: Neraca, Laba Rugi, Arus Kas, Perubahan Modal & Rasio',
      'Pencatatan aset peralatan usaha dan penyusutan otomatis tiap bulan',
      'Pantauan pajak lengkap (batas bebas Rp500 Juta, PPN, PB1, PPh 21/23/Sewa)',
      'Bisa menambah kolom data sendiri sesuai kebutuhan khusus usaha Anda',
    ],
    footerNote: 'Harga tetap bulanan · siap berkembang ke banyak cabang kapan saja',
  },
};

const FAQ_ITEMS = [
  {
    q: 'Apakah saya harus mengerti akuntansi untuk memakai KasirAkun UMKM?',
    a: 'Tidak perlu sama sekali. Anda dan kasir cukup mencatat penjualan, pembelian barang, dan biaya harian dengan bahasa yang sederhana. Semua pembukuan, modal barang, untung-rugi, hingga perkiraan pajak langsung tersusun sendiri.',
  },
  {
    q: 'Apa bedanya tombol "Pilih Paket" di daftar harga dengan tombol "Coba Gratis"?',
    a: 'Tombol "Pilih Paket" langsung membawa Anda ke pendaftaran akun usaha asli sesuai paket yang dipilih. Jika ingin mencoba dulu secara gratis dan melihat tampilan sesuai jenis usaha Anda, silakan klik tombol "Coba Gratis".',
  },
  {
    q: 'Apakah warung atau usaha tanpa printer struk tetap bisa menggunakan aplikasi ini?',
    a: 'Bisa. Di kasir tersedia pilihan "Selesai Tanpa Cetak Struk" agar pelayanan tetap cepat. Jika pembeli meminta bukti bayar, Anda tetap bisa mengirim nota lewat WhatsApp.',
  },
  {
    q: 'Apakah pembayaran non-tunai (QRIS/transfer) toko saya terpisah dari pengguna lain?',
    a: 'Ya, 100% terpisah. Setiap akun usaha memiliki pengaturan dan jalur pembayaran non-tunai sendiri yang dienkripsi, sehingga uang dan catatan transaksi Anda tidak pernah tercampur dengan usaha lain.',
  },
  {
    q: 'Kenapa fitur QR Meja Restoran, WA Otomatis, dan Tambah Cabang dijadikan Add-On?',
    a: 'Agar Anda tidak membayar fitur yang tidak dipakai. Warung 1 lokasi cukup bayar sesuai kebutuhan warung, dan baru menambahkan fitur cabang atau WA otomatis ketika usahanya sudah membutuhkan.',
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

  const currentShowcase = useMemo(() => {
    const def =
      ACTIVE_VERTICAL_DEFINITIONS.find((v) => v.id === activeVertical) ??
      ACTIVE_VERTICAL_DEFINITIONS[0];
    const richOverride = VERTICAL_SHOWCASES.find((v) => v.id === def.id);
    if (richOverride) {
      return {
        id: def.id,
        label: def.label,
        headline: richOverride.headline,
        summary: richOverride.summary,
        keyBenefitTitle: richOverride.keyBenefitTitle,
        keyBenefits: richOverride.keyBenefits,
        features: richOverride.features,
        recommendedPlan: def.recommendedPlan,
        categoryLabel: VERTICAL_GROUP_LABELS[def.categoryGroup],
      };
    }
    return {
      id: def.id,
      label: def.label,
      headline: def.headline,
      summary: def.summary,
      keyBenefitTitle: def.keyBenefitTitle,
      keyBenefits: def.keyBenefits,
      features: def.features,
      recommendedPlan: def.recommendedPlan,
      categoryLabel: VERTICAL_GROUP_LABELS[def.categoryGroup],
    };
  }, [activeVertical]);

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
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 antialiased">
      {/* Minimalist 3-Zone Sticky Navbar */}
      <header className="sticky top-0 z-40 bg-stone-50/90 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
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
              className="hover:text-stone-900 whitespace-nowrap shrink-0 transition-colors"
            >
              22 Jenis Usaha
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('fitur')}
              className="hover:text-stone-900 whitespace-nowrap shrink-0 transition-colors"
            >
              Keunggulan
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('harga')}
              className="hover:text-stone-900 whitespace-nowrap shrink-0 transition-colors"
            >
              Paket &amp; Harga
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
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
              className="px-4 py-2 text-sm font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg whitespace-nowrap transition-colors"
            >
              Login
            </button>
            <button
              type="button"
              data-testid="landing-goto-demo-btn"
              onClick={() => navigate('/demo')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap transition-colors"
            >
              <span>Coba Gratis</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 1. ASYMMETRIC SPLIT HERO (Pure Product Value & Clarity — Zero Calculation Tables) */}
        <section className="bg-stone-50 border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-7 space-y-6">
              <p className="text-xs font-semibold text-emerald-700">
                Aplikasi Kasir, Operasional, Stok &amp; Keuangan untuk 22 Jenis Usaha UMKM
              </p>

              <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] text-stone-900 leading-[1.08] text-balance">
                Jualan Lebih Cepat, Operasional Rapi, Untung &amp; Pajak Langsung Beres
              </h1>

              <p className="text-base text-stone-600 leading-relaxed max-w-[54ch]">
                Mendukung 22 jenis UMKM: Warung Sembako, Toko Fashion, Toko Bangunan, Laundry, Cuci
                Kendaraan, Barbershop, Salon, SPA, Kedai, Restoran, Bakery &amp; Catering, Rental
                Mobil/Motor, Sewa Lapangan, Pet Shop, Bimbel/Gym, Homestay/Villa, Kost, Sewa Garasi,
                Manufaktur Kecil, hingga Peternakan. Menu otomatis menyesuaikan usaha Anda.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  data-testid="landing-hero-demo-btn"
                  onClick={() => navigate('/demo')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <span>Coba Gratis Sesuai Usaha Anda</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  data-testid="landing-hero-onboarding-btn"
                  onClick={() => navigate('/onboarding?mode=real')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg transition-colors"
                >
                  <span>Daftar Akun Usaha Asli</span>
                </button>
              </div>

              <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-stone-600">
                <span>Menu ringkas anti-bingung</span>
                <span className="text-stone-300">/</span>
                <span>Bisa tanpa printer struk</span>
                <span className="text-stone-300">/</span>
                <span>Siap aturan pajak UMKM 2026</span>
              </div>
            </div>

            {/* Right Column: Pure Informational Product Highlights (Zero Fake Tables/Calculations) */}
            <div className="lg:col-span-5">
              <div
                data-testid="landing-hero-overview"
                className="bg-white border border-stone-200 rounded-xl overflow-hidden"
              >
                <div className="px-5 py-4 bg-stone-50 border-b border-stone-200">
                  <p className="text-xs font-semibold text-emerald-700">
                    Kenapa Pemilik Usaha Memilih KasirAkun
                  </p>
                  <h2 className="text-base font-bold text-stone-900 mt-0.5">
                    Langsung Siap Dipakai Sehari-Hari Tanpa Ribet
                  </h2>
                </div>

                <div className="divide-y divide-stone-200">
                  {HERO_PILLARS.map((pillar, idx) => (
                    <div key={pillar.title} className="px-5 py-4 flex items-start gap-3.5">
                      <span className="font-mono text-xs font-bold text-emerald-700 pt-0.5 shrink-0">
                        0{idx + 1}.
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-stone-900">{pillar.title}</h3>
                        <p className="text-xs text-stone-600 leading-relaxed">{pillar.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 22-UMKM CATEGORY FILTER + CLEAR BENEFITS PER BUSINESS TYPE */}
        <section id="umkm" className="py-16 lg:py-20 bg-white border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="max-w-3xl space-y-2">
                <p className="text-xs font-semibold text-emerald-700">
                  Keunggulan Khusus 22 Jenis Usaha UMKM
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
                  Pilih Jenis Usaha Anda untuk Melihat Keunggulan yang Didapat
                </h2>
                <p className="text-sm sm:text-base text-stone-600 max-w-[65ch]">
                  Setiap jenis usaha punya cara kerja berbeda. Di KasirAkun, menu operasional,
                  kasir, hingga pajak daerah otomatis menyesuaikan bidang usaha Anda agar langsung
                  mudah dipakai.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-stone-500 tabular-nums shrink-0">
                Menampilkan {filteredVerticals.length} dari {ACTIVE_VERTICAL_DEFINITIONS.length}{' '}
                bidang usaha
              </span>
            </div>

            {/* Category Group Filter Row */}
            <div className="flex flex-wrap items-center gap-2">
              {GROUP_FILTER_OPTIONS.map((grp) => {
                const active = activeGroup === grp.id;
                return (
                  <button
                    key={grp.id}
                    type="button"
                    data-testid={`landing-group-filter-${grp.id}`}
                    onClick={() => handleSelectGroup(grp.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      active
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:text-stone-900 hover:bg-stone-100'
                    }`}
                  >
                    {grp.label}
                  </button>
                );
              })}
            </div>

            {/* Scannable 22-Vertical Selector Grid */}
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
                    className={`flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold rounded-lg border transition-colors ${
                      isActive
                        ? 'border-emerald-600 text-emerald-900 bg-emerald-50/70'
                        : 'border-stone-200 text-stone-600 bg-white hover:text-stone-900 hover:border-stone-300'
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

            {/* 2-Column Editorial Workflow Showcase Panel */}
            <div
              data-testid="landing-vertical-panel"
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2"
            >
              {/* Left Column: Summary & Key Practical Benefits */}
              <div className="lg:col-span-5 space-y-5">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-emerald-700">
                    Untuk {currentShowcase.label}
                  </p>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-[-0.02em] text-stone-900 leading-snug">
                    {currentShowcase.headline}
                  </h3>
                  <p className="text-sm text-stone-600 leading-relaxed max-w-[54ch]">
                    {currentShowcase.summary}
                  </p>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 space-y-3">
                  <p className="text-xs font-bold text-stone-900">
                    {currentShowcase.keyBenefitTitle}
                  </p>
                  <ul className="space-y-2.5 text-xs text-stone-700 leading-relaxed">
                    {currentShowcase.keyBenefits.map((benefit) => (
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
              </div>

              {/* Right Column: Clean Hairline-Divided Everyday Advantages */}
              <div className="lg:col-span-7 bg-stone-50/50 border border-stone-200 rounded-xl divide-y divide-stone-200">
                {currentShowcase.features.map((feat, idx) => (
                  <div key={feat.title} className="p-5 flex items-start gap-4">
                    <span className="font-mono text-xs font-bold text-emerald-700 pt-0.5 shrink-0">
                      0{idx + 1}.
                    </span>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-stone-900">{feat.title}</h4>
                      <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-[60ch]">
                        {feat.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. EDITORIAL NUMBERED LIST: EVERYDAY STRENGTHS */}
        <section id="fitur" className="py-16 lg:py-20 bg-stone-50 border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-4 space-y-3 lg:sticky lg:top-24">
              <p className="text-xs font-semibold text-emerald-700">Keunggulan Sistem</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900 leading-tight">
                Bantu Usaha Bebas Bocor Stok, Salah Harga &amp; Selisih Kas
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                Dirancang agar pemilik toko dan pegawai langsung nyaman memakainya tanpa perlu
                belajar istilah yang rumit.
              </p>
            </div>

            <div className="lg:col-span-8 divide-y divide-stone-200 border-t border-b border-stone-200">
              {EDITORIAL_ADVANTAGES.map((item) => (
                <div
                  key={item.num}
                  className="py-6 grid grid-cols-1 sm:grid-cols-12 gap-4 items-start"
                >
                  <div className="sm:col-span-3 flex sm:flex-col items-baseline gap-2">
                    <span className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                      {item.num}
                    </span>
                    <span className="text-xs font-medium text-stone-500">{item.meta}</span>
                  </div>
                  <div className="sm:col-span-9 space-y-1.5">
                    <h3 className="text-base sm:text-lg font-bold text-stone-900">{item.title}</h3>
                    <p className="text-sm text-stone-600 leading-relaxed max-w-[62ch]">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. PRICING & PACKAGE ADVANTAGES + INTERACTIVE COMPARISON MODAL */}
        <section id="harga" className="py-16 lg:py-20 bg-white border-b border-stone-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="max-w-3xl space-y-2">
                <p className="text-xs font-semibold text-emerald-700">
                  Keunggulan Paket &amp; Harga Jelas
                </p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
                  Mulai Rp49.000/bulan, Pilih Paket yang Paling Pas untuk Usaha Anda
                </h2>
                <p className="text-sm sm:text-base text-stone-600 max-w-[65ch]">
                  Setiap paket sudah disiapkan sesuai tahapan usaha tanpa biaya tersembunyi.
                  Kirim pesan WhatsApp lewat <span className="font-mono font-semibold">wa.me</span>{' '}
                  gratis mulai Paket LITE cukup dengan nomor WA usaha Anda sendiri.
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

            {/* 4 Core Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {HYBRID_PLANS.map((plan) => {
                const friendly = PLAN_FRIENDLY_COPY[plan.code];
                const isPopular = plan.code === 'PRO';
                return (
                  <div
                    key={plan.code}
                    data-testid={`landing-plan-card-${plan.code}`}
                    className={`rounded-xl p-6 flex flex-col justify-between border bg-white ${
                      isPopular
                        ? 'border-emerald-600 ring-1 ring-emerald-600/20'
                        : 'border-stone-200'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-bold text-stone-900">{plan.name}</h3>
                          {plan.badge && (
                            <span className="text-xs font-semibold text-emerald-700">
                              {plan.badge}
                            </span>
                          )}
                        </div>
                        {friendly?.idealFor && (
                          <p className="text-xs font-medium text-emerald-800">{friendly.idealFor}</p>
                        )}
                      </div>

                      <p className="text-xs text-stone-600 leading-relaxed">
                        {friendly?.subtitle ?? plan.tagline}
                      </p>

                      <div className="pt-3 border-t border-stone-200">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-bold font-mono tabular-nums text-stone-900">
                            {formatRupiah(plan.monthlyPrice)}
                          </span>
                          <span className="text-xs text-stone-500">/bulan</span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-1">
                          Bayar tahunan lebih hemat 15%: setara{' '}
                          <span className="font-mono font-semibold text-stone-700 tabular-nums">
                            {formatRupiah(plan.annualMonthlyEquivalent)}/bln
                          </span>
                        </p>
                        <p className="text-[11px] font-medium text-emerald-700 mt-1">
                          {friendly?.footerNote ?? plan.zeroAiTokenNote}
                        </p>
                      </div>

                      <ul className="space-y-2.5 pt-2">
                        {(friendly?.bullets ?? plan.highlights).map((h) => (
                          <li
                            key={h}
                            className="flex items-start gap-2 text-xs text-stone-700 leading-snug"
                          >
                            <Check
                              className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
                              strokeWidth={1.75}
                            />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      data-testid={`landing-select-plan-${plan.code}`}
                      onClick={() => navigate(`/onboarding?mode=real&plan=${plan.code}`)}
                      className={`mt-6 w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors ${
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

            {/* Informational Modular Add-On Directory */}
            <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Fitur Tambahan Opsional (Add-On)
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Bisa ditambahkan saat mendaftar atau kapan saja nanti bila usaha Anda sudah
                  membutuhkannya, agar biaya bulanan tetap ringan.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {ADDON_DEFINITIONS.map((addon) => (
                  <div
                    key={addon.code}
                    className={`p-4 rounded-lg border flex flex-col justify-between gap-2 ${
                      addon.isSeparateAi
                        ? 'bg-stone-900 text-white border-stone-800'
                        : 'bg-white border-stone-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            addon.isSeparateAi ? 'text-white' : 'text-stone-900'
                          }`}
                        >
                          {addon.shortLabel}
                        </span>
                        {addon.isSeparateAi && (
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                        )}
                      </div>
                      <p
                        className={`text-[11px] leading-snug ${
                          addon.isSeparateAi ? 'text-stone-300' : 'text-stone-600'
                        }`}
                      >
                        {addon.description}
                      </p>
                    </div>
                    <p
                      className={`text-xs font-mono font-bold tabular-nums pt-2 border-t ${
                        addon.isSeparateAi
                          ? 'text-emerald-400 border-stone-800'
                          : 'text-emerald-700 border-stone-200'
                      }`}
                    >
                      +{formatRupiah(addon.monthlyPrice)}/bln
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 5. FAQ ACCORDION */}
        <section className="py-16 bg-stone-50 border-b border-stone-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-emerald-700">Pertanyaan Umum</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
                Hal yang Sering Ditanyakan Pemilik Usaha
              </h2>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 divide-y divide-stone-200">
              {FAQ_ITEMS.map((item, idx) => {
                const open = openFaqIdx === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIdx(open ? null : idx)}
                      className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-stone-50 transition-colors"
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
                      <div className="px-6 pb-5 text-sm text-stone-600 leading-relaxed max-w-[65ch]">
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

      {/* MINIMALIST FOOTER */}
      <footer className="bg-stone-900 text-stone-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <span className="w-7 h-7 rounded-md bg-emerald-600 text-white text-xs flex items-center justify-center">
                KA
              </span>
              <span>KasirAkun UMKM</span>
            </div>
            <p className="text-xs text-stone-400">
              Aplikasi kasir, operasional, stok, pembukuan, dan pajak daerah sederhana untuk 22
              jenis usaha UMKM Indonesia.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium">
            <button
              type="button"
              onClick={() => navigate('/demo')}
              className="hover:text-white transition-colors"
            >
              Coba Gratis
            </button>
            <button
              type="button"
              onClick={() => navigate('/onboarding?mode=real')}
              className="hover:text-white transition-colors"
            >
              Daftar Akun Asli
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="hover:text-white transition-colors"
            >
              Login Pengguna
            </button>
            <button
              type="button"
              onClick={() => navigate('/master/login')}
              className="hover:text-white transition-colors"
            >
              Portal Master Admin
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
