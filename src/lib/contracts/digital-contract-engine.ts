/**
 * Digital Contract Template Engine (Perjanjian Sewa / Jasa Digital)
 * - Strictly locked per active UMKM vertical (a Kost owner NEVER sees Rental Mobil templates).
 * - Supports Master Admin global default templates + Tenant custom templates.
 * - Pure deterministic placeholder substitution, Indonesian date formatting, PDF download (jsPDF), and printable HTML export.
 */

import Decimal from 'decimal.js';
import { jsPDF } from 'jspdf';
import type {
  BusinessVertical,
  ContractCategory,
  DigitalContractTemplate,
  SubscriptionPlanCode,
} from '../../types/domain.ts';
import { formatDateIndo } from '../date/indonesia-date.ts';
import { buildDirectWaMeUrl } from '../messaging/whatsapp-direct.ts';

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  RENTAL_KENDARAAN: 'Rental Mobil & Motor',
  SEWA_PROPERTI: 'Sewa Kamar Kost / Villa / Garasi',
  JASA_PROYEK: 'Jasa Profesional & Proyek',
  LAYANAN_RUTIN: 'Pre-Order, Lapangan & Member',
};

export const CONTRACT_PLACEHOLDER_GUIDE: Array<{ token: string; label: string }> = [
  { token: '{{nomor_kontrak}}', label: 'Nomor Kontrak' },
  { token: '{{tanggal_kontrak}}', label: 'Tanggal Kontrak (Indo)' },
  { token: '{{nama_usaha}}', label: 'Nama Usaha' },
  { token: '{{alamat_usaha}}', label: 'Alamat Usaha' },
  { token: '{{wa_usaha}}', label: 'WhatsApp Usaha' },
  { token: '{{nama_pelanggan}}', label: 'Nama Pelanggan / Penghuni' },
  { token: '{{nik_pelanggan}}', label: 'NIK / Identitas' },
  { token: '{{wa_pelanggan}}', label: 'WhatsApp Pelanggan' },
  { token: '{{objek_layanan}}', label: 'Kamar / Unit / Lingkup Layanan' },
  { token: '{{tanggal_mulai}}', label: 'Tanggal Mulai (Indo)' },
  { token: '{{tanggal_selesai}}', label: 'Tanggal Selesai / Jatuh Tempo (Indo)' },
  { token: '{{nilai_kontrak}}', label: 'Nilai Kontrak (Rp)' },
  { token: '{{nilai_deposit}}', label: 'Deposit / DP (Rp)' },
  { token: '{{catatan_khusus}}', label: 'Catatan / Add-On / Klausul Khusus' },
];

export interface ContractPlaceholderValues {
  nomorKontrak: string;
  tanggalKontrak: string;
  namaUsaha: string;
  alamatUsaha: string;
  waUsaha: string;
  namaPelanggan: string;
  nikPelanggan: string;
  waPelanggan: string;
  objekLayanan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  nilaiKontrak: string;
  nilaiDeposit: string;
  catatanKhusus: string;
}

export interface VerticalContractFormMeta {
  verticalLabel: string;
  partyLabel: string;
  idLabel: string;
  objectLabel: string;
  objectPlaceholder: string;
  startDateLabel: string;
  endDateLabel: string;
  valueLabel: string;
  depositLabel: string;
  extraNotesLabel: string;
  extraNotesPlaceholder: string;
  allowedCategories: ContractCategory[];
  defaultCategory: ContractCategory;
}

export const CONTRACT_SUPPORTED_VERTICALS: BusinessVertical[] = [
  'RENTAL_KENDARAAN',
  'KOST_KONTRAKAN',
  'HOMESTAY_VILLA',
  'SEWA_GARASI',
  'FREELANCE',
  'BAKERY_CATERING',
  'SEWA_LAPANGAN',
  'BIMBEL_KURSUS_GYM',
];

export function verticalSupportsDigitalContracts(
  vertical: BusinessVertical,
  _plan?: SubscriptionPlanCode
): boolean {
  return CONTRACT_SUPPORTED_VERTICALS.includes(vertical);
}

export function getDefaultContractCategoryForVertical(
  vertical: BusinessVertical
): ContractCategory {
  switch (vertical) {
    case 'RENTAL_KENDARAAN':
      return 'RENTAL_KENDARAAN';
    case 'KOST_KONTRAKAN':
    case 'HOMESTAY_VILLA':
    case 'SEWA_GARASI':
      return 'SEWA_PROPERTI';
    case 'FREELANCE':
      return 'JASA_PROYEK';
    default:
      return 'LAYANAN_RUTIN';
  }
}

export function getContractFormMetaForVertical(
  vertical: BusinessVertical
): VerticalContractFormMeta {
  switch (vertical) {
    case 'KOST_KONTRAKAN':
      return {
        verticalLabel: 'Kost & Kontrakan',
        partyLabel: 'Nama Penghuni Kamar',
        idLabel: 'NIK KTP Penghuni',
        objectLabel: 'Kamar, Tipe & Fasilitas Termasuk (Include)',
        objectPlaceholder:
          'Contoh: Kamar 104 (Standar AC + KM Dalam) · Include Air PDAM, Listrik, Wi-Fi, Kasur',
        startDateLabel: 'Tanggal Masuk (Check-In)',
        endDateLabel: 'Tanggal Jatuh Tempo / Berakhir',
        valueLabel: 'Biaya Sewa Kamar (Rp)',
        depositLabel: 'Uang Jaminan / Deposit Kamar (Rp)',
        extraNotesLabel: 'Tambahan Fasilitas (Add-On) & Tata Tertib Kost',
        extraNotesPlaceholder:
          'Contoh: Add-on Parkir Mobil Rp150.000/bln; tamu menginap wajib lapor pengurus kost.',
        allowedCategories: ['SEWA_PROPERTI'],
        defaultCategory: 'SEWA_PROPERTI',
      };
    case 'HOMESTAY_VILLA':
      return {
        verticalLabel: 'Homestay & Villa',
        partyLabel: 'Nama Tamu Menginap',
        idLabel: 'NIK / Paspor Tamu',
        objectLabel: 'Unit Villa / Kamar & Jumlah Tamu',
        objectPlaceholder: 'Contoh: Villa Melati 2 Bedroom (Maks. 4 tamu, Check-in 14:00)',
        startDateLabel: 'Tanggal Check-In',
        endDateLabel: 'Tanggal Check-Out',
        valueLabel: 'Total Biaya Sewa (Rp)',
        depositLabel: 'Deposit Keamanan / Kunci (Rp)',
        extraNotesLabel: 'Aturan Check-In / Check-Out & Fasilitas',
        extraNotesPlaceholder:
          'Contoh: Check-out maksimal pukul 12:00 WIB; dilarang merokok di dalam kamar.',
        allowedCategories: ['SEWA_PROPERTI'],
        defaultCategory: 'SEWA_PROPERTI',
      };
    case 'SEWA_GARASI':
      return {
        verticalLabel: 'Sewa Garasi & Parkir',
        partyLabel: 'Nama Penyewa Slot',
        idLabel: 'NIK KTP Penyewa',
        objectLabel: 'Kode Slot Garasi & Kendaraan Terdaftar',
        objectPlaceholder: 'Contoh: Slot A-03 (Tertutup Indoor) · Honda Brio B 1234 XYZ',
        startDateLabel: 'Tanggal Mulai Sewa',
        endDateLabel: 'Jatuh Tempo Berikutnya',
        valueLabel: 'Biaya Sewa Slot (Rp)',
        depositLabel: 'Deposit Kartu Akses / Remote (Rp)',
        extraNotesLabel: 'Ketentuan Akses & Jam Operasional Garasi',
        extraNotesPlaceholder:
          'Contoh: Hanya untuk kendaraan yang terdaftar; kehilangan kartu akses denda Rp50.000.',
        allowedCategories: ['SEWA_PROPERTI'],
        defaultCategory: 'SEWA_PROPERTI',
      };
    case 'RENTAL_KENDARAAN':
      return {
        verticalLabel: 'Rental Mobil & Motor',
        partyLabel: 'Nama Penyewa Kendaraan',
        idLabel: 'NIK KTP / No. SIM',
        objectLabel: 'Unit Kendaraan & Nomor Polisi',
        objectPlaceholder: 'Contoh: Toyota Avanza 2024 (B 1234 XYZ), KM awal 24.500, BBM 100%',
        startDateLabel: 'Tanggal Mulai Sewa',
        endDateLabel: 'Tanggal Kembali',
        valueLabel: 'Nilai Sewa Kendaraan (Rp)',
        depositLabel: 'Uang Jaminan / Deposit Unit (Rp)',
        extraNotesLabel: 'Ketentuan BBM, Overtime & Area Pemakaian',
        extraNotesPlaceholder:
          'Contoh: BBM wajib dikembalikan penuh; overtime Rp50.000/jam; khusus area Jabodetabek.',
        allowedCategories: ['RENTAL_KENDARAAN'],
        defaultCategory: 'RENTAL_KENDARAAN',
      };
    case 'FREELANCE':
      return {
        verticalLabel: 'Jasa Profesional & Freelance',
        partyLabel: 'Nama Klien / PIC',
        idLabel: 'NIK / NPWP Klien',
        objectLabel: 'Ruang Lingkup Pekerjaan / Deliverable',
        objectPlaceholder:
          'Contoh: Desain Identitas Visual & Website Company Profile (3 halaman + 2x revisi)',
        startDateLabel: 'Tanggal Mulai Proyek',
        endDateLabel: 'Target Selesai',
        valueLabel: 'Nilai Proyek (Rp)',
        depositLabel: 'Uang Muka / DP Pekerjaan (Rp)',
        extraNotesLabel: 'Jadwal Revisi, Hak Cipta & Termin Pembayaran',
        extraNotesPlaceholder:
          'Contoh: DP 50% di awal, pelunasan 50% sebelum serah terima file final.',
        allowedCategories: ['JASA_PROYEK'],
        defaultCategory: 'JASA_PROYEK',
      };
    case 'BAKERY_CATERING':
      return {
        verticalLabel: 'Bakery, Kue & Catering',
        partyLabel: 'Nama Pemesan',
        idLabel: 'NIK / Identitas Pemesan',
        objectLabel: 'Rincian Menu, Jumlah Porsi & Lokasi Kirim',
        objectPlaceholder:
          'Contoh: 100 Box Nasi Ayam Bakar Komplit + 2 Kue Tart Custom (Kirim jam 10:00)',
        startDateLabel: 'Tanggal Pesan',
        endDateLabel: 'Tanggal Kirim',
        valueLabel: 'Total Nilai Pre-Order (Rp)',
        depositLabel: 'Uang Muka / DP Pesanan (Rp)',
        extraNotesLabel: 'Ketentuan Pembatalan & Pelunasan',
        extraNotesPlaceholder:
          'Contoh: Perubahan jumlah porsi maksimal H-2; pelunasan wajib sebelum pengiriman.',
        allowedCategories: ['LAYANAN_RUTIN'],
        defaultCategory: 'LAYANAN_RUTIN',
      };
    case 'SEWA_LAPANGAN':
      return {
        verticalLabel: 'Sewa Lapangan Olahraga',
        partyLabel: 'Nama Penyewa / Ketua Tim',
        idLabel: 'NIK / Identitas',
        objectLabel: 'Lapangan, Hari & Jam Rutin Member',
        objectPlaceholder:
          'Contoh: Lapangan Badminton 2 (Member Rutin Setiap Selasa & Kamis jam 19:00-21:00)',
        startDateLabel: 'Tanggal Mulai Berlaku',
        endDateLabel: 'Tanggal Berakhir',
        valueLabel: 'Total Biaya Sewa (Rp)',
        depositLabel: 'Uang Muka / DP Member (Rp)',
        extraNotesLabel: 'Ketentuan Reschedule & Sepatu Lapangan',
        extraNotesPlaceholder:
          'Contoh: Wajib sepatu sol non-marking; perubahan jadwal maksimal H-1.',
        allowedCategories: ['LAYANAN_RUTIN'],
        defaultCategory: 'LAYANAN_RUTIN',
      };
    case 'BIMBEL_KURSUS_GYM':
      return {
        verticalLabel: 'Bimbel, Kursus & Gym',
        partyLabel: 'Nama Peserta / Wali Murid',
        idLabel: 'NIK / Nomor Induk',
        objectLabel: 'Program Kelas / Paket Membership',
        objectPlaceholder:
          'Contoh: Program Bimbel Intensif SMA IPA (3x pertemuan/minggu) / Member Gym Bulanan',
        startDateLabel: 'Tanggal Mulai Program',
        endDateLabel: 'Berlaku Sampai',
        valueLabel: 'Biaya Program / SPP (Rp)',
        depositLabel: 'Biaya Pendaftaran / DP (Rp)',
        extraNotesLabel: 'Ketentuan Izin, Cuti & Pembayaran SPP',
        extraNotesPlaceholder:
          'Contoh: Pembayaran SPP paling lambat tanggal 10 setiap bulan; cuti maksimal 1 bulan.',
        allowedCategories: ['LAYANAN_RUTIN'],
        defaultCategory: 'LAYANAN_RUTIN',
      };
    default:
      return {
        verticalLabel: 'Usaha UMKM',
        partyLabel: 'Nama Pelanggan / Klien',
        idLabel: 'NIK / Identitas',
        objectLabel: 'Objek Sewa / Layanan',
        objectPlaceholder: 'Masukkan rincian layanan atau objek perjanjian',
        startDateLabel: 'Tanggal Mulai',
        endDateLabel: 'Tanggal Selesai',
        valueLabel: 'Nilai Kontrak (Rp)',
        depositLabel: 'Uang Muka / Deposit (Rp)',
        extraNotesLabel: 'Catatan / Klausul Tambahan',
        extraNotesPlaceholder: 'Masukkan catatan kesepakatan tambahan bila ada',
        allowedCategories: ['LAYANAN_RUTIN', 'JASA_PROYEK'],
        defaultCategory: 'LAYANAN_RUTIN',
      };
  }
}

export const DEFAULT_GLOBAL_CONTRACT_TEMPLATES: DigitalContractTemplate[] = [
  {
    id: 'tpl-sewa-kendaraan',
    code: 'MASTER_RENTAL_KENDARAAN',
    name: 'Perjanjian Sewa Kendaraan (Mobil / Motor)',
    category: 'RENTAL_KENDARAAN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['RENTAL_KENDARAAN'],
    headerTitle: 'SURAT PERJANJIAN SEWA KENDARAAN',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms:
      'Demikian perjanjian ini dibuat secara sah dan disetujui oleh kedua belah pihak.',
    bodyTemplate: `SURAT PERJANJIAN SEWA KENDARAAN
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PIHAK PERTAMA (Pemilik / Pengelola):
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PIHAK KEDUA (Penyewa):
Nama Lengkap : {{nama_pelanggan}}
NIK / SIM    : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

OBJEK & PERIODE SEWA:
Unit / Layanan  : {{objek_layanan}}
Mulai Sewa      : {{tanggal_mulai}}
Batas Kembali   : {{tanggal_selesai}}
Nilai Sewa      : {{nilai_kontrak}}
Uang Jaminan    : {{nilai_deposit}}

KETENTUAN UTAMA:
1. PIHAK KEDUA wajib mengembalikan unit tepat waktu dalam kondisi baik dan level BBM sesuai kondisi serah terima awal.
2. Keterlambatan pengembalian dikenakan biaya overtime sesuai tarif yang disepakati.
3. PIHAK KEDUA dilarang memindahtangankan, menggadaikan, atau menyewakan kembali kendaraan kepada pihak ketiga.
4. Segala risiko kehilangan, kerusakan akibat kelalaian, atau pelanggaran lalu lintas selama masa sewa menjadi tanggung jawab PIHAK KEDUA.
5. Catatan Tambahan: {{catatan_khusus}}

PIHAK PERTAMA ({{nama_usaha}})            PIHAK KEDUA ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-sewa-properti',
    code: 'MASTER_SEWA_KOST',
    name: 'Perjanjian Sewa Kamar Kost & Fasilitas',
    category: 'SEWA_PROPERTI',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['KOST_KONTRAKAN'],
    headerTitle: 'SURAT PERJANJIAN SEWA KAMAR KOST / KONTRAKAN',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms:
      'Perjanjian ini mengikat pengelola kost dan penghuni selama masa sewa berlangsung.',
    bodyTemplate: `SURAT PERJANJIAN SEWA KAMAR KOST / KONTRAKAN
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PIHAK PERTAMA (Pengelola Kost):
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PIHAK KEDUA (Penghuni):
Nama Lengkap : {{nama_pelanggan}}
NIK / KTP    : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

DETAIL KAMAR, FASILITAS & SEWA:
Kamar & Fasilitas Include : {{objek_layanan}}
Tanggal Masuk / Mulai     : {{tanggal_mulai}}
Jatuh Tempo / Selesai     : {{tanggal_selesai}}
Biaya Sewa                : {{nilai_kontrak}}
Deposit / Jaminan Kamar   : {{nilai_deposit}}

KETENTUAN HUNIAN:
1. Harga sewa kamar sudah mencakup fasilitas standar (include) yang disepakati saat Check-In. Penambahan fasilitas ekstra (add-on) dicatat terpisah pada tagihan atau perpanjangan sewa.
2. Pembayaran sewa dilakukan maksimal pada tanggal jatuh tempo setiap periode bulanan atau tahunan.
3. Uang jaminan (deposit) akan dikembalikan penuh saat check-out apabila kondisi kamar, kunci, dan seluruh inventaris lengkap tanpa kerusakan maupun tunggakan.
4. Penghuni wajib menjaga kebersihan, ketertiban lingkungan kost, dan mematuhi aturan jam kunjung tamu.
5. Catatan & Add-On Fasilitas: {{catatan_khusus}}

PIHAK PERTAMA ({{nama_usaha}})            PIHAK KEDUA ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-sewa-homestay',
    code: 'MASTER_HOMESTAY_VILLA',
    name: 'Perjanjian Reservasi Homestay & Villa',
    category: 'SEWA_PROPERTI',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['HOMESTAY_VILLA'],
    headerTitle: 'PERJANJIAN RESERVASI HOMESTAY / VILLA',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Disetujui oleh pengelola villa dan tamu menginap.',
    bodyTemplate: `PERJANJIAN RESERVASI HOMESTAY / VILLA
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENGELOLA VILLA / HOMESTAY:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

TAMU / PENYEWA:
Nama Lengkap : {{nama_pelanggan}}
NIK / Paspor : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

RINCIAN RESERVASI:
Unit Villa / Kamar : {{objek_layanan}}
Check-In           : {{tanggal_mulai}}
Check-Out          : {{tanggal_selesai}}
Total Biaya Sewa   : {{nilai_kontrak}}
Deposit Keamanan   : {{nilai_deposit}}

KETENTUAN MENGINAP:
1. Tamu wajib menjaga kebersihan, fasilitas villa, serta tidak melebihi kapasitas maksimal penghuni.
2. Deposit keamanan dikembalikan penuh saat check-out setelah pemeriksaan kondisi kamar dan kunci selesai.
3. Kerusakan properti akibat kelalaian tamu akan diperhitungkan dari deposit sesuai biaya perbaikan wajar.
4. Catatan Tambahan: {{catatan_khusus}}

PENGELOLA ({{nama_usaha}})            TAMU ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-sewa-garasi',
    code: 'MASTER_SEWA_GARASI',
    name: 'Perjanjian Sewa Slot Garasi & Parkir',
    category: 'SEWA_PROPERTI',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['SEWA_GARASI'],
    headerTitle: 'PERJANJIAN SEWA SLOT GARASI / PARKIR',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Berlaku selama slot garasi digunakan oleh penyewa.',
    bodyTemplate: `PERJANJIAN SEWA SLOT GARASI / PARKIR
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENGELOLA GARASI:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PENYEWA SLOT:
Nama Lengkap : {{nama_pelanggan}}
NIK / KTP    : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

DETAIL SLOT & KENDARAAN:
Slot & Kendaraan : {{objek_layanan}}
Mulai Sewa       : {{tanggal_mulai}}
Jatuh Tempo      : {{tanggal_selesai}}
Biaya Sewa       : {{nilai_kontrak}}
Deposit Akses    : {{nilai_deposit}}

KETENTUAN PARKIR:
1. Slot parkir hanya diperuntukkan bagi kendaraan yang terdaftar dalam perjanjian ini.
2. Penyewa wajib mematikan mesin saat parkir dan tidak menyimpan bahan berbahaya di area garasi.
3. Pembayaran sewa dilakukan maksimal pada tanggal jatuh tempo bulanan yang disepakati.
4. Catatan Tambahan: {{catatan_khusus}}

PENGELOLA ({{nama_usaha}})            PENYEWA ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-jasa-proyek',
    code: 'MASTER_JASA_PROYEK',
    name: 'Perjanjian Kerja Sama Proyek & Jasa (SPK)',
    category: 'JASA_PROYEK',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['FREELANCE'],
    headerTitle: 'PERJANJIAN KERJA SAMA JASA / PROYEK (SPK)',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Disetujui oleh penyedia jasa dan klien.',
    bodyTemplate: `PERJANJIAN KERJA SAMA JASA / PROYEK (SPK)
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENYEDIA JASA:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

KLIEN / PEMBERI KERJA:
Nama Lengkap / PIC : {{nama_pelanggan}}
NIK / NPWP         : {{nik_pelanggan}}
WhatsApp           : {{wa_pelanggan}}

RUANG LINGKUP & NILAI PROYEK:
Deskripsi Pekerjaan : {{objek_layanan}}
Tanggal Mulai       : {{tanggal_mulai}}
Target Selesai      : {{tanggal_selesai}}
Nilai Proyek        : {{nilai_kontrak}}
Uang Muka (DP)      : {{nilai_deposit}}

SYARAT & KETENTUAN:
1. Pekerjaan dimulai setelah KLIEN menyelesaikan pembayaran Uang Muka (DP) sesuai kesepakatan.
2. Revisi dilayani sesuai batas ruang lingkup awal; permintaan di luar lingkup akan disepakati sebagai pekerjaan tambahan.
3. Hak penggunaan penuh hasil karya diserahkan kepada KLIEN setelah pelunasan 100% nilai proyek diterima.
4. Catatan Tambahan: {{catatan_khusus}}

PENYEDIA JASA ({{nama_usaha}})            KLIEN ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-bakery-catering',
    code: 'MASTER_BAKERY_CATERING',
    name: 'Kontrak Pre-Order Catering & Pesanan Kue',
    category: 'LAYANAN_RUTIN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['BAKERY_CATERING'],
    headerTitle: 'KONTRAK PRE-ORDER CATERING / BAKERY',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Pesanan mulai diproduksi setelah DP diterima.',
    bodyTemplate: `KONTRAK PRE-ORDER CATERING / BAKERY
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENYEDIA CATERING / BAKERY:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PEMESAN:
Nama Lengkap : {{nama_pelanggan}}
NIK / ID     : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

RINCIAN PESANAN:
Menu & Jumlah   : {{objek_layanan}}
Tanggal Pesan   : {{tanggal_mulai}}
Tanggal Kirim   : {{tanggal_selesai}}
Total Nilai PO  : {{nilai_kontrak}}
Uang Muka (DP)  : {{nilai_deposit}}

KETENTUAN PRE-ORDER:
1. Pesanan dikunci dalam jadwal produksi setelah uang muka (DP) diterima.
2. Perubahan jumlah porsi atau jadwal pengiriman maksimal dikonfirmasi H-2 sebelum hari pengiriman.
3. Pelunasan sisa pembayaran dilakukan paling lambat saat pesanan siap dikirim atau diambil.
4. Catatan Tambahan: {{catatan_khusus}}

PENYEDIA ({{nama_usaha}})            PEMESAN ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-sewa-lapangan',
    code: 'MASTER_SEWA_LAPANGAN',
    name: 'Perjanjian Member & Booking Rutin Lapangan',
    category: 'LAYANAN_RUTIN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['SEWA_LAPANGAN'],
    headerTitle: 'PERJANJIAN MEMBER & BOOKING LAPANGAN',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Slot lapangan terkunci setelah DP diterima.',
    bodyTemplate: `PERJANJIAN MEMBER & BOOKING LAPANGAN
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENGELOLA LAPANGAN:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PEMESAN / KETUA TIM:
Nama Lengkap : {{nama_pelanggan}}
NIK / ID     : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

RINCIAN JADWAL:
Lapangan & Jadwal : {{objek_layanan}}
Mulai Berlaku     : {{tanggal_mulai}}
Berakhir          : {{tanggal_selesai}}
Total Biaya       : {{nilai_kontrak}}
Uang Muka (DP)    : {{nilai_deposit}}

KETENTUAN LAPANGAN:
1. Slot lapangan terkunci secara eksklusif setelah uang muka (DP) diterima.
2. Perubahan jadwal (reschedule) hanya dapat dilakukan maksimal H-1 selama slot pengganti tersedia.
3. Pemain wajib menjaga kebersihan area lapangan dan menggunakan alas kaki olahraga yang sesuai.
4. Catatan Tambahan: {{catatan_khusus}}

PENGELOLA ({{nama_usaha}})            PEMESAN ({{nama_pelanggan}})`,
  },
  {
    id: 'tpl-layanan-rutin',
    code: 'MASTER_BIMBEL_GYM',
    name: 'Perjanjian Peserta Program Bimbel / Kursus / Member Gym',
    category: 'LAYANAN_RUTIN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['BIMBEL_KURSUS_GYM'],
    headerTitle: 'PERJANJIAN PROGRAM & KEANGGOTAAN',
    updatedAt: '2026-11-20T00:00:00.000Z',
    footerTerms: 'Berlaku selama peserta terdaftar pada program aktif.',
    bodyTemplate: `PERJANJIAN PROGRAM & KEANGGOTAAN
Nomor: {{nomor_kontrak}}
Tanggal: {{tanggal_kontrak}}

PENGELOLA LEMBAGA / GYM:
Nama Usaha : {{nama_usaha}}
Alamat     : {{alamat_usaha}}
WhatsApp   : {{wa_usaha}}

PESERTA / WALI MURID:
Nama Lengkap : {{nama_pelanggan}}
NIK / ID     : {{nik_pelanggan}}
WhatsApp     : {{wa_pelanggan}}

RINCIAN PROGRAM:
Paket / Program   : {{objek_layanan}}
Tanggal Mulai     : {{tanggal_mulai}}
Berlaku Sampai    : {{tanggal_selesai}}
Biaya Program/SPP : {{nilai_kontrak}}
Biaya Daftar / DP : {{nilai_deposit}}

KETENTUAN KEANGGOTAAN:
1. Peserta berhak mengikuti sesi belajar atau latihan sesuai jadwal paket yang dipilih.
2. Pembayaran iuran atau SPP bulanan dilakukan tepat waktu sebelum tanggal jatuh tempo setiap bulannya.
3. Izin ketidakhadiran atau pengajuan cuti sementara diinformasikan kepada admin minimal 1 hari sebelumnya.
4. Catatan Tambahan: {{catatan_khusus}}

PENGELOLA ({{nama_usaha}})            PESERTA / WALI ({{nama_pelanggan}})`,
  },
];

export interface DynamicContractServiceOption {
  id: string;
  label: string;
  objectSummary: string;
  customerName?: string;
  customerIdNumber?: string;
  customerPhone?: string;
  startDate?: string;
  endDate?: string;
  contractValue?: string;
  depositValue?: string;
  includedFacilities?: string[];
  facilityAddOns?: Array<{ id: string; name: string; monthlyFee: string }>;
  extraNotes?: string;
}

/**
 * Dynamically extracts live services/units strictly for the active UMKM vertical
 * so contract creation auto-populates real rooms, vehicles, villas, garage slots, courts, or services
 * with ZERO cross-vertical leakage.
 */
export function getDynamicContractServiceOptions(
  vertical: BusinessVertical,
  workspace: {
    boardingRooms?: Array<{
      id: string;
      roomNumber: string;
      roomType: string;
      monthlyRate?: string;
      monthlyPrice?: string;
      yearlyRate?: string;
      annualPrice?: string;
      includedFacilities?: string[];
      status: string;
    }>;
    boardingTenants?: Array<{
      id: string;
      roomId: string | null;
      fullName: string;
      nikKtp: string;
      phoneWa: string;
      checkInDate: string;
      nextDueDate?: string;
      billingCycle?: 'BULANAN' | 'TAHUNAN';
      depositAmount: string;
      includedFacilities?: string[];
      facilityAddOns?: Array<{ id: string; name: string; monthlyFee: string }>;
      isActive: boolean;
    }>;
    products?: Array<{
      id: string;
      name: string;
      sellingPrice: string;
      unit: string;
      isActive?: boolean;
    }>;
    verticalOps?: {
      rentalVehicles?: Array<{
        id: string;
        name: string;
        plateNumber: string;
        vehicleType?: string;
        dailyRate: string;
        status: string;
      }>;
      homestayUnits?: Array<{
        id: string;
        name: string;
        unitType?: string;
        nightlyRate?: string;
        maxGuests?: number;
        capacityGuests?: number;
      }>;
      garageSlots?: Array<{
        id: string;
        slotCode: string;
        zoneLabel?: string;
        monthlyRate?: string;
        status?: string;
        tenantName?: string;
        tenantPhone?: string;
        plateNumber?: string;
        nextDueDate?: string;
      }>;
      sportsCourts?: Array<{
        id: string;
        name: string;
        sportType?: string;
        hourlyRate?: string;
      }>;
    };
  }
): DynamicContractServiceOption[] {
  if (vertical === 'KOST_KONTRAKAN') {
    const rooms = workspace.boardingRooms ?? [];
    const tenants = (workspace.boardingTenants ?? []).filter((t) => t.isActive);
    const options: DynamicContractServiceOption[] = [];

    for (const room of rooms) {
      const occupant = tenants.find((t) => t.roomId === room.id);
      const rateMonthly = room.monthlyRate ?? room.monthlyPrice ?? '1500000';
      const rateYearly = room.yearlyRate ?? room.annualPrice ?? rateMonthly;
      const included =
        occupant?.includedFacilities && occupant.includedFacilities.length > 0
          ? occupant.includedFacilities
          : room.includedFacilities && room.includedFacilities.length > 0
          ? room.includedFacilities
          : ['Air PDAM', 'Listrik', 'Wi-Fi', 'Kasur & Lemari'];

      const isAnnual = occupant?.billingCycle === 'TAHUNAN';
      const rentVal = isAnnual ? rateYearly : rateMonthly;
      const includeText = included.join(', ');

      options.push({
        id: occupant ? `kost-tenant-${occupant.id}` : `kost-room-${room.id}`,
        label: occupant
          ? `Kamar ${room.roomNumber} (${room.roomType}) · Penghuni: ${occupant.fullName}`
          : `Kamar ${room.roomNumber} (${room.roomType}) · Siap Huni`,
        objectSummary: `Kamar ${room.roomNumber} (${room.roomType}) · Include: ${includeText}`,
        customerName: occupant?.fullName,
        customerIdNumber: occupant?.nikKtp,
        customerPhone: occupant?.phoneWa,
        startDate: occupant?.checkInDate,
        endDate: occupant?.nextDueDate,
        contractValue: new Decimal(rentVal || '0').toFixed(0),
        depositValue: occupant?.depositAmount
          ? new Decimal(occupant.depositAmount).toFixed(0)
          : '1000000',
        includedFacilities: included,
        facilityAddOns: occupant?.facilityAddOns ?? [],
      });
    }
    return options;
  }

  if (vertical === 'RENTAL_KENDARAAN') {
    return (workspace.verticalOps?.rentalVehicles ?? []).map((v) => ({
      id: `rental-${v.id}`,
      label: `${v.name} (${v.plateNumber}) · ${v.vehicleType || 'Kendaraan'}`,
      objectSummary: `${v.name} · Plat ${v.plateNumber} (${v.vehicleType || 'Kendaraan'})`,
      contractValue: new Decimal(v.dailyRate || '0').toFixed(0),
      depositValue: '500000',
      extraNotes: 'BBM wajib dikembalikan sesuai posisi awal serah terima.',
    }));
  }

  if (vertical === 'HOMESTAY_VILLA') {
    return (workspace.verticalOps?.homestayUnits ?? []).map((u) => {
      const guests = u.maxGuests ?? u.capacityGuests ?? 2;
      const unitKind = u.unitType || 'Unit Villa / Homestay';
      return {
        id: `homestay-${u.id}`,
        label: `${u.name} (${unitKind}, maks. ${guests} tamu)`,
        objectSummary: `${u.name} · ${unitKind} (Kapasitas maks. ${guests} tamu)`,
        contractValue: new Decimal(u.nightlyRate || '0').toFixed(0),
        depositValue: '500000',
        extraNotes: 'Check-in mulai pukul 14:00 WIB, Check-out maksimal pukul 12:00 WIB.',
      };
    });
  }

  if (vertical === 'SEWA_GARASI') {
    return (workspace.verticalOps?.garageSlots ?? []).map((g) => ({
      id: `garage-${g.id}`,
      label: g.tenantName
        ? `Slot ${g.slotCode} (${g.zoneLabel || 'Garasi'}) · ${g.tenantName}`
        : `Slot ${g.slotCode} (${g.zoneLabel || 'Garasi'}) · Tersedia`,
      objectSummary: `Slot Garasi ${g.slotCode}${g.zoneLabel ? ` (${g.zoneLabel})` : ''}${
        g.plateNumber ? ` · Kendaraan ${g.plateNumber}` : ''
      }`,
      customerName: g.tenantName,
      customerPhone: g.tenantPhone,
      endDate: g.nextDueDate,
      contractValue: new Decimal(g.monthlyRate || '0').toFixed(0),
      depositValue: '100000',
    }));
  }

  if (vertical === 'SEWA_LAPANGAN') {
    return (workspace.verticalOps?.sportsCourts ?? []).map((c) => ({
      id: `court-${c.id}`,
      label: `${c.name} (${c.sportType || 'Olahraga'})`,
      objectSummary: `${c.name} · Cabang ${c.sportType || 'Olahraga'} (Member / Booking Rutin)`,
      contractValue: new Decimal(c.hourlyRate || '0').times(4).toFixed(0),
      depositValue: new Decimal(c.hourlyRate || '0').toFixed(0),
    }));
  }

  // FREELANCE, BAKERY_CATERING, BIMBEL_KURSUS_GYM -> pull active vertical services/packages from catalog
  return (workspace.products ?? [])
    .filter((p) => p.isActive !== false)
    .slice(0, 20)
    .map((p) => ({
      id: `svc-${p.id}`,
      label: `${p.name} (${formatRupiahPlain(p.sellingPrice)}/${p.unit || 'paket'})`,
      objectSummary: `${p.name} (1 ${p.unit || 'paket'})`,
      contractValue: new Decimal(p.sellingPrice || '0').toFixed(0),
      depositValue: new Decimal(p.sellingPrice || '0').times('0.5').toFixed(0),
    }));
}

/**
 * STRICT vertical lock: returns ONLY templates applicable to the active UMKM vertical.
 * Never leaks Rental Mobil templates into Kost & Kontrakan or vice versa.
 */
export function getTemplatesForVertical(
  vertical: BusinessVertical,
  allTemplates: DigitalContractTemplate[]
): DigitalContractTemplate[] {
  return allTemplates.filter((tpl) => {
    if (!Array.isArray(tpl.applicableVerticals) || tpl.applicableVerticals.length === 0) {
      return false;
    }
    return tpl.applicableVerticals.includes(vertical);
  });
}

function formatRupiahPlain(amount: string): string {
  try {
    const val = new Decimal(amount || '0').toDecimalPlaces(0).toNumber();
    return `Rp${val.toLocaleString('id-ID')}`;
  } catch {
    return 'Rp0';
  }
}

export function renderContractTemplate(
  template: DigitalContractTemplate,
  values: ContractPlaceholderValues
): string {
  const map: Record<string, string> = {
    '{{nomor_kontrak}}': values.nomorKontrak || '-',
    '{{tanggal_kontrak}}': values.tanggalKontrak ? formatDateIndo(values.tanggalKontrak) : '-',
    '{{nama_usaha}}': values.namaUsaha || '-',
    '{{alamat_usaha}}': values.alamatUsaha || '-',
    '{{wa_usaha}}': values.waUsaha || '-',
    '{{nama_pelanggan}}': values.namaPelanggan || '-',
    '{{nik_pelanggan}}': values.nikPelanggan || '-',
    '{{wa_pelanggan}}': values.waPelanggan || '-',
    '{{objek_layanan}}': values.objekLayanan || '-',
    '{{tanggal_mulai}}': values.tanggalMulai ? formatDateIndo(values.tanggalMulai) : '-',
    '{{tanggal_selesai}}': values.tanggalSelesai ? formatDateIndo(values.tanggalSelesai) : '-',
    '{{nilai_kontrak}}': formatRupiahPlain(values.nilaiKontrak),
    '{{nilai_deposit}}': formatRupiahPlain(values.nilaiDeposit),
    '{{catatan_khusus}}': values.catatanKhusus?.trim() || 'Tidak ada catatan khusus.',
  };

  let output = template.bodyTemplate;
  for (const [token, val] of Object.entries(map)) {
    output = output.split(token).join(val);
  }
  return output;
}

export function buildContractWaDeliveryUrl(params: {
  businessWhatsappNumber?: string | null;
  customerPhone: string;
  businessName: string;
  contractNumber: string;
  customerName: string;
  renderedText: string;
}): { ok: boolean; url?: string; error?: string; message?: string } {
  const ownerWa = (params.businessWhatsappNumber ?? '').replace(/\D/g, '');
  if (!ownerWa || ownerWa.length < 8) {
    return {
      ok: false,
      error:
        'Nomor WhatsApp pemilik usaha belum diisi. Silakan isi di Pengaturan Usaha terlebih dahulu agar bisa mengirim kontrak lewat WA.',
    };
  }
  const message = [
    `Halo *${params.customerName}*,`,
    `Berikut salinan *Perjanjian Digital* dari *${params.businessName}* (No: ${params.contractNumber}):`,
    '',
    params.renderedText,
    '',
    `Mohon balas *"SETUJU"* pada pesan ini sebagai tanda persetujuan digital Anda. Terima kasih.`,
  ].join('\n');

  const res = buildDirectWaMeUrl({
    businessWhatsappNumber: params.businessWhatsappNumber,
    customerPhone: params.customerPhone,
    message,
  });
  if (!res.ok || !res.url) {
    return {
      ok: false,
      error: res.error || 'Nomor WhatsApp pelanggan tidak valid. Gunakan format angka seperti 0812xxxx.',
    };
  }
  return { ok: true, url: res.url, message };
}

export function buildDigitalContractPrintHtml(params: {
  contractNumber: string;
  headerTitle: string;
  businessName: string;
  customerName: string;
  renderedText: string;
}): string {
  const escaped = params.renderedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${params.headerTitle} - ${params.contractNumber}</title>
<style>
  body { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif; color: #1c1917; padding: 32px; line-height: 1.6; max-width: 780px; margin: 0 auto; }
  header { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: baseline; }
  h1 { font-size: 16px; margin: 0; color: #1c1917; }
  .meta { font-size: 12px; color: #57534e; font-family: monospace; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; margin: 0; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <header>
    <h1>${params.businessName} · ${params.headerTitle}</h1>
    <span class="meta">${params.contractNumber}</span>
  </header>
  <pre>${escaped}</pre>
</body>
</html>`;
}

export function downloadDigitalContractPdf(params: {
  contractNumber: string;
  headerTitle: string;
  businessName: string;
  customerName: string;
  renderedText: string;
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 48;
  const maxWidth = 500;
  let y = 52;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(params.businessName, marginX, y);
  y += 16;

  doc.setFontSize(10);
  doc.setTextColor(87, 83, 78);
  doc.text(`${params.headerTitle} (${params.contractNumber})`, marginX, y);
  y += 14;

  doc.setDrawColor(5, 150, 105);
  doc.line(marginX, y, marginX + maxWidth, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(28, 25, 23);

  const lines = doc.splitTextToSize(params.renderedText, maxWidth) as string[];
  for (const line of lines) {
    if (y > 775) {
      doc.addPage();
      y = 52;
    }
    doc.text(line, marginX, y);
    y += 15;
  }

  doc.save(`Kontrak_${params.contractNumber}.pdf`);
}
