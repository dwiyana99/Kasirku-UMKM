/**
 * KasirAkun UMKM — Digital Contract Generator Engine (Generator Kontrak Digital)
 * Zero AI tokens. Deterministic template interpolation + real PDF generation (jsPDF) + WhatsApp (wa.me) delivery.
 *
 * Strictly enabled ONLY for UMKM verticals where written customer contracts make operational sense:
 * - Rental Kendaraan (Mobil/Motor)
 * - Freelance / Jasa Profesional
 * - Kost & Kontrakan
 * - Homestay / Villa
 * - Sewa Garasi Mobil
 * - Sewa Lapangan (Turnamen / Member Rutin)
 * - Bakery, Catering & Hampers (Kontrak PO Besar / Event)
 * - Manufaktur Kecil / Konveksi / Mebel (SPK Produksi Custom)
 * - Bimbel, Kursus, Daycare & Gym (Perjanjian Program/Membership)
 * - Toko Bangunan (Kontrak Suplai Material Proyek)
 *
 * Hidden automatically for everyday counter-sales verticals (Warung Sembako, Toko Retail, Fashion,
 * Restoran, Kedai, Laundry, Cuci Kendaraan, Barbershop, Salon, SPA, Pet Shop, Peternakan).
 */

import { jsPDF } from 'jspdf';
import type {
  BusinessVertical,
  ContractCategory,
  DigitalContractTemplate,
  SubscriptionPlanCode,
} from '../../types/domain';
import { buildDirectWaMeUrl, formatRpWa } from '../messaging/whatsapp-direct';

const CONTRACT_ENABLED_VERTICALS: BusinessVertical[] = [
  'RENTAL_KENDARAAN',
  'FREELANCE',
  'KOST_KONTRAKAN',
  'HOMESTAY_VILLA',
  'SEWA_GARASI',
  'SEWA_LAPANGAN',
  'BAKERY_CATERING',
  'MANUFAKTUR_KECIL',
  'BIMBEL_KURSUS_GYM',
  'TOKO_BANGUNAN',
];

export function verticalSupportsDigitalContracts(
  vertical: BusinessVertical,
  _plan?: SubscriptionPlanCode
): boolean {
  return CONTRACT_ENABLED_VERTICALS.includes(vertical);
}

export function getDefaultContractCategoryForVertical(vertical: BusinessVertical): ContractCategory {
  switch (vertical) {
    case 'RENTAL_KENDARAAN':
      return 'RENTAL_KENDARAAN';
    case 'KOST_KONTRAKAN':
    case 'HOMESTAY_VILLA':
    case 'SEWA_GARASI':
      return 'SEWA_PROPERTI';
    case 'BIMBEL_KURSUS_GYM':
    case 'SEWA_LAPANGAN':
    case 'BAKERY_CATERING':
      return 'LAYANAN_RUTIN';
    default:
      return 'JASA_PROYEK';
  }
}

export const CONTRACT_CATEGORY_LABELS: Record<ContractCategory, string> = {
  RENTAL_KENDARAAN: 'Rental Mobil & Motor',
  JASA_PROYEK: 'Jasa, Proyek & SPK Produksi',
  SEWA_PROPERTI: 'Sewa Kost, Villa & Garasi',
  LAYANAN_RUTIN: 'Pre-Order, Lapangan & Membership',
};

export const CONTRACT_PLACEHOLDER_GUIDE: Array<{ token: string; label: string }> = [
  { token: '{{nomor_kontrak}}', label: 'Nomor Kontrak' },
  { token: '{{tanggal_kontrak}}', label: 'Tanggal Dibuat' },
  { token: '{{nama_usaha}}', label: 'Nama Usaha (Pihak Pertama)' },
  { token: '{{alamat_usaha}}', label: 'Alamat Usaha' },
  { token: '{{wa_usaha}}', label: 'No. WhatsApp Usaha' },
  { token: '{{nama_pelanggan}}', label: 'Nama Pelanggan (Pihak Kedua)' },
  { token: '{{nik_pelanggan}}', label: 'NIK / Identitas Pelanggan' },
  { token: '{{wa_pelanggan}}', label: 'No. WhatsApp Pelanggan' },
  { token: '{{objek_layanan}}', label: 'Unit / Objek Sewa / Lingkup Jasa' },
  { token: '{{tanggal_mulai}}', label: 'Tanggal Mulai' },
  { token: '{{tanggal_selesai}}', label: 'Tanggal Selesai / Kembali' },
  { token: '{{nilai_kontrak}}', label: 'Nilai Kontrak (Rp)' },
  { token: '{{nilai_deposit}}', label: 'Uang Muka / Deposit (Rp)' },
  { token: '{{catatan_khusus}}', label: 'Ketentuan / Catatan Tambahan' },
];

export const DEFAULT_GLOBAL_CONTRACT_TEMPLATES: DigitalContractTemplate[] = [
  {
    id: 'tpl-rental-kendaraan',
    code: 'RENTAL_STD_V1',
    name: 'Perjanjian Sewa Kendaraan (Mobil / Motor)',
    category: 'RENTAL_KENDARAAN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['RENTAL_KENDARAAN'],
    headerTitle: 'SURAT PERJANJIAN SEWA KENDARAAN',
    bodyTemplate: [
      'Nomor: {{nomor_kontrak}}',
      'Tanggal: {{tanggal_kontrak}}',
      '',
      'Yang bertanda tangan di bawah ini:',
      '1. PIHAK PERTAMA (Penyedia Rental): {{nama_usaha}}, beralamat di {{alamat_usaha}}, Telp/WA: {{wa_usaha}}.',
      '2. PIHAK KEDUA (Penyewa): {{nama_pelanggan}}, NIK/SIM: {{nik_pelanggan}}, Telp/WA: {{wa_pelanggan}}.',
      '',
      'PASAL 1 — OBJEK & MASA SEWA',
      'Pihak Pertama menyewakan kepada Pihak Kedua unit: {{objek_layanan}}.',
      'Masa sewa berlaku mulai {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}.',
      '',
      'PASAL 2 — BIAYA SEWA, DEPOSIT & OVERTIME',
      'Total biaya sewa disepakati sebesar {{nilai_kontrak}} dengan jaminan/deposit sebesar {{nilai_deposit}}.',
      'Keterlambatan pengembalian (overtime) dan selisih BBM dibandingkan saat serah terima menjadi tanggung jawab Pihak Kedua.',
      '',
      'PASAL 3 — TANGGUNG JAWAB PENYEWA',
      'Pihak Kedua dilarang memindahtangankan, menggadaikan, atau menggunakan kendaraan untuk tindakan melanggar hukum. Segala kerusakan akibat kelalaian pemakaian ditanggung oleh Pihak Kedua.',
      '',
      'CATATAN TAMBAHAN:',
      '{{catatan_khusus}}',
    ].join('\n'),
    footerTerms:
      'Dokumen ini dibuat secara sah dan berlaku sejak disetujui kedua belah pihak (termasuk persetujuan digital via WhatsApp).',
    updatedBy: 'Master Admin',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'tpl-jasa-proyek',
    code: 'JASA_SPK_V1',
    name: 'Perjanjian Jasa / SPK Produksi & Suplai Proyek',
    category: 'JASA_PROYEK',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['FREELANCE', 'MANUFAKTUR_KECIL', 'TOKO_BANGUNAN'],
    headerTitle: 'SURAT PERINTAH KERJA (SPK) & PERJANJIAN JASA',
    bodyTemplate: [
      'Nomor: {{nomor_kontrak}}',
      'Tanggal: {{tanggal_kontrak}}',
      '',
      'PIHAK PERTAMA (Pelaksana/Penyedia): {{nama_usaha}} ({{alamat_usaha}}, WA: {{wa_usaha}}).',
      'PIHAK KEDUA (Klien/Pemesan): {{nama_pelanggan}} (ID/NIK: {{nik_pelanggan}}, WA: {{wa_pelanggan}}).',
      '',
      'LINGKUP PEKERJAAN / PESANAN:',
      '{{objek_layanan}}',
      '',
      'JADWAL PELAKSANAAN:',
      'Mulai: {{tanggal_mulai}} | Target Selesai / Kirim: {{tanggal_selesai}}.',
      '',
      'NILAI KONTRAK & TERMIN PEMBAYARAN:',
      'Total nilai kontrak disepakati sebesar {{nilai_kontrak}}.',
      'Uang Muka (DP) sebesar {{nilai_deposit}} dibayarkan saat kesepakatan, dan sisa pelunasan dibayarkan saat serah terima pekerjaan/barang.',
      '',
      'KETENTUAN TAMBAHAN & REVISI:',
      '{{catatan_khusus}}',
    ].join('\n'),
    footerTerms:
      'Perubahan spesifikasi di luar lingkup awal akan disesuaikan biayanya berdasarkan kesepakatan tertulis kedua belah pihak.',
    updatedBy: 'Master Admin',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'tpl-sewa-properti',
    code: 'PROPERTI_SEWA_V1',
    name: 'Perjanjian Sewa Kamar Kost / Villa / Slot Garasi',
    category: 'SEWA_PROPERTI',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['KOST_KONTRAKAN', 'HOMESTAY_VILLA', 'SEWA_GARASI'],
    headerTitle: 'PERJANJIAN SEWA TEMPAT / HUNIAN / GARASI',
    bodyTemplate: [
      'Nomor: {{nomor_kontrak}}',
      'Tanggal: {{tanggal_kontrak}}',
      '',
      'PIHAK PERTAMA (Pengelola): {{nama_usaha}}, alamat {{alamat_usaha}}, WA {{wa_usaha}}.',
      'PIHAK KEDUA (Penyewa): {{nama_pelanggan}}, NIK {{nik_pelanggan}}, WA {{wa_pelanggan}}.',
      '',
      'UNIT / OBJEK SEWA: {{objek_layanan}}',
      'PERIODE SEWA: {{tanggal_mulai}} s/d {{tanggal_selesai}}',
      'BIAYA SEWA: {{nilai_kontrak}} | DEPOSIT JAMINAN: {{nilai_deposit}}',
      '',
      'TATA TERTIB & JAMINAN:',
      '1. Uang deposit akan dikembalikan setelah masa sewa berakhir dan kondisi unit/fasilitas dicek lengkap tanpa kerusakan.',
      '2. Pihak Kedua wajib menjaga ketertiban, kebersihan, dan tidak mengalihkan sewa ke pihak lain tanpa izin Pihak Pertama.',
      '',
      'CATATAN KHUSUS:',
      '{{catatan_khusus}}',
    ].join('\n'),
    footerTerms:
      'Deposit dicatat sebagai titipan jaminan dan dikembalikan penuh apabila tidak ada tunggakan atau kerusakan fasilitas.',
    updatedBy: 'Master Admin',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'tpl-layanan-rutin',
    code: 'LAYANAN_PO_V1',
    name: 'Kontrak Pre-Order Catering / Booking Lapangan / Membership',
    category: 'LAYANAN_RUTIN',
    scope: 'GLOBAL_MASTER',
    applicableVerticals: ['BAKERY_CATERING', 'SEWA_LAPANGAN', 'BIMBEL_KURSUS_GYM'],
    headerTitle: 'KONFIRMASI PERJANJIAN PESANAN / MEMBERSHIP',
    bodyTemplate: [
      'Nomor: {{nomor_kontrak}}',
      'Tanggal: {{tanggal_kontrak}}',
      '',
      'PENYEDIA LAYANAN: {{nama_usaha}} ({{alamat_usaha}}, WA: {{wa_usaha}}).',
      'PELANGGAN / MEMBER: {{nama_pelanggan}} (ID: {{nik_pelanggan}}, WA: {{wa_pelanggan}}).',
      '',
      'RINCIAN PAKET / PESANAN: {{objek_layanan}}',
      'BERLAKU / JADWAL: {{tanggal_mulai}} s/d {{tanggal_selesai}}',
      'TOTAL BIAYA: {{nilai_kontrak}} | DP / TERBAYAR: {{nilai_deposit}}',
      '',
      'KETENTUAN PEMBATALAN & PENJADWALAN ULANG:',
      'Konfirmasi perubahan jadwal maksimal H-2 sebelum pelaksanaan. Pembatalan sepihak setelah persiapan berjalan mengikuti ketentuan DP yang berlaku.',
      '',
      'CATATAN:',
      '{{catatan_khusus}}',
    ].join('\n'),
    footerTerms:
      'Terima kasih telah mempercayakan kebutuhan layanan Anda kepada kami.',
    updatedBy: 'Master Admin',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

export interface ContractRenderValues {
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

export function renderContractTemplate(
  template: DigitalContractTemplate,
  values: ContractRenderValues
): string {
  const map: Record<string, string> = {
    '{{nomor_kontrak}}': values.nomorKontrak,
    '{{tanggal_kontrak}}': values.tanggalKontrak,
    '{{nama_usaha}}': values.namaUsaha,
    '{{alamat_usaha}}': values.alamatUsaha || '-',
    '{{wa_usaha}}': values.waUsaha || '-',
    '{{nama_pelanggan}}': values.namaPelanggan || '-',
    '{{nik_pelanggan}}': values.nikPelanggan || '-',
    '{{wa_pelanggan}}': values.waPelanggan || '-',
    '{{objek_layanan}}': values.objekLayanan || '-',
    '{{tanggal_mulai}}': values.tanggalMulai || '-',
    '{{tanggal_selesai}}': values.tanggalSelesai || '-',
    '{{nilai_kontrak}}': formatRpWa(values.nilaiKontrak || '0'),
    '{{nilai_deposit}}': formatRpWa(values.nilaiDeposit || '0'),
    '{{catatan_khusus}}': values.catatanKhusus?.trim() || 'Tidak ada catatan tambahan.',
  };

  let body = template.bodyTemplate;
  for (const [token, val] of Object.entries(map)) {
    body = body.split(token).join(val);
  }
  return `${template.headerTitle}\n${'='.repeat(48)}\n\n${body}\n\n${template.footerTerms}`;
}

export function buildContractWaDeliveryUrl(params: {
  businessWhatsappNumber?: string | null;
  customerPhone: string;
  businessName: string;
  contractNumber: string;
  customerName: string;
  renderedText: string;
}): { ok: boolean; url: string | null; error?: string } {
  const message = [
    `Halo Bapak/Ibu *${params.customerName}*,`,
    `Berikut salinan kontrak digital dari *${params.businessName}* (No: ${params.contractNumber}):`,
    '',
    params.renderedText,
    '',
    'Mohon balas pesan ini dengan kata *SETUJU* sebagai tanda persetujuan digital. File PDF juga dapat dilampirkan menyusul.',
  ].join('\n');

  return buildDirectWaMeUrl({
    businessWhatsappNumber: params.businessWhatsappNumber,
    customerPhone: params.customerPhone,
    message,
  });
}

export function downloadDigitalContractPdf(params: {
  contractNumber: string;
  headerTitle: string;
  businessName: string;
  customerName: string;
  renderedText: string;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const maxWidth = pageWidth - margin * 2;

  // Emerald header bar
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(params.headerTitle.toUpperCase(), margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${params.businessName}  |  No. Dokumen: ${params.contractNumber}`, margin, 18);

  doc.setTextColor(28, 25, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  let y = 34;
  const rawLines = params.renderedText.split('\n');
  for (const rawLine of rawLines) {
    if (rawLine.startsWith('====')) {
      doc.setDrawColor(214, 211, 209);
      doc.line(margin, y - 1, pageWidth - margin, y - 1);
      y += 4;
      continue;
    }
    const wrapped = doc.splitTextToSize(rawLine || ' ', maxWidth) as string[];
    for (const line of wrapped) {
      if (y > pageHeight - 42) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 5.4;
    }
  }

  // Signature block
  if (y > pageHeight - 48) {
    doc.addPage();
    y = 24;
  }
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('PIHAK PERTAMA (Penyedia)', margin, y);
  doc.text('PIHAK KEDUA (Pelanggan)', pageWidth - margin - 55, y);

  y += 22;
  doc.setDrawColor(120, 113, 108);
  doc.line(margin, y, margin + 55, y);
  doc.line(pageWidth - margin - 55, y, pageWidth - margin, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(params.businessName, margin, y);
  doc.text(params.customerName || 'Pelanggan', pageWidth - margin - 55, y);

  const safeFile = params.contractNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Kontrak_${safeFile}.pdf`);
}

export function buildDigitalContractPrintHtml(params: {
  contractNumber: string;
  headerTitle: string;
  businessName: string;
  customerName: string;
  renderedText: string;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Kontrak ${esc(params.contractNumber)}</title>
  <style>
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #1C1917; margin: 32px; line-height: 1.6; }
    .hdr { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 20px; }
    .hdr h1 { margin: 0; font-size: 18px; letter-spacing: -0.02em; }
    .hdr p { margin: 4px 0 0; font-size: 12px; color: #57534E; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; margin: 0; }
    .sig { display: flex; justify-content: space-between; margin-top: 48px; page-break-inside: avoid; }
    .sig-box { width: 42%; text-align: center; font-size: 12px; }
    .sig-line { margin-top: 64px; border-top: 1px solid #57534E; padding-top: 6px; font-weight: 600; }
    @media print { body { margin: 16mm; } }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>${esc(params.headerTitle)}</h1>
    <p>${esc(params.businessName)} · Nomor Dokumen: ${esc(params.contractNumber)}</p>
  </div>
  <pre>${esc(params.renderedText)}</pre>
  <div class="sig">
    <div class="sig-box">
      <div>PIHAK PERTAMA</div>
      <div class="sig-line">${esc(params.businessName)}</div>
    </div>
    <div class="sig-box">
      <div>PIHAK KEDUA</div>
      <div class="sig-line">${esc(params.customerName || 'Pelanggan')}</div>
    </div>
  </div>
</body>
</html>`;
}
