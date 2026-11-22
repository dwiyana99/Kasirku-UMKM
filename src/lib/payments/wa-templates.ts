/**
 * Custom WhatsApp Message Templates & Dynamic Variable Interpolation Engine
 * Shared by Master Admin Console, Payment Assistance Queue, and Demo Approvals.
 */

import type { PaymentGatewayProvider, WaMessageTemplate } from '../../types/domain';

export interface WaTemplateVariableInfo {
  token: string;
  key: string;
  label: string;
  sampleValue: string;
}

export const WA_TEMPLATE_VARIABLES: WaTemplateVariableInfo[] = [
  { token: '{{nama_pemilik}}', key: 'nama_pemilik', label: 'Nama Pemilik', sampleValue: 'Bapak Budi Santoso' },
  { token: '{{nama_umkm}}', key: 'nama_umkm', label: 'Nama UMKM', sampleValue: 'Warung Barokah Jaya' },
  { token: '{{jenis_umkm}}', key: 'jenis_umkm', label: 'Jenis UMKM', sampleValue: 'Warung Sembako' },
  { token: '{{provider}}', key: 'provider', label: 'Provider PG', sampleValue: 'Midtrans' },
  { token: '{{nama_bank}}', key: 'nama_bank', label: 'Nama Bank Cair', sampleValue: 'Bank BCA' },
  { token: '{{nama_rekening}}', key: 'nama_rekening', label: 'Pemilik Rekening', sampleValue: 'Budi Santoso' },
  {
    token: '{{link_daftar_provider}}',
    key: 'link_daftar_provider',
    label: 'Link Daftar Provider',
    sampleValue: 'https://dashboard.midtrans.com/register',
  },
  {
    token: '{{webhook_url}}',
    key: 'webhook_url',
    label: 'URL Webhook',
    sampleValue: 'https://app.kasirakun.id/api/webhooks/payment/midtrans/tnt-warung-01',
  },
  {
    token: '{{link_demo}}',
    key: 'link_demo',
    label: 'Link Demo',
    sampleValue: 'https://app.kasirakun.id/login',
  },
  { token: '{{email_demo}}', key: 'email_demo', label: 'Email Demo', sampleValue: 'demo.warung@kasirakun.id' },
  { token: '{{password_demo}}', key: 'password_demo', label: 'Password Demo', sampleValue: 'Demo123!' },
  { token: '{{tanggal_kadaluarsa}}', key: 'tanggal_kadaluarsa', label: 'Tgl Kadaluarsa', sampleValue: '30 Desember 2026' },
];

export const DEFAULT_WA_MESSAGE_TEMPLATES: WaMessageTemplate[] = [
  {
    id: 'wa-tpl-payment-greeting',
    code: 'PAYMENT_ASSIST_GREETING',
    title: 'Sapaan Awal Bantuan Setting Pembayaran',
    category: 'PAYMENT_ASSIST',
    isActive: true,
    updatedByAdminId: 'system-seed',
    updatedAt: '2026-01-01T00:00:00.000Z',
    bodyTemplate: `Halo {{nama_pemilik}}, pemilik *{{nama_umkm}}* ({{jenis_umkm}}).
Saya Tim Support *KasirAkun UMKM* yang siap membantu mengaktifkan pembayaran QRIS Dinamis, E-Wallet & Virtual Account menggunakan *{{provider}}* agar pencairan masuk langsung ke rekening *{{nama_bank}} a.n. {{nama_rekening}}*.

Sebagai langkah pertama, mohon konfirmasi:
1. Apakah {{nama_pemilik}} sudah punya akun {{provider}} atau ingin kami pandu daftar dari awal?
2. Kapan waktu santai untuk kami pandu via chat/telepon WA?

⚠️ *PENTING DEMI KEAMANAN ANDA:*
Mohon JANGAN PERNAH mengirimkan foto KTP, PIN ATM, Password m-Banking, Password akun {{provider}}, ataupun kode OTP kepada siapa pun termasuk tim kami. Semua pendaftaran dilakukan langsung dari HP/laptop Bapak/Ibu sendiri.`,
  },
  {
    id: 'wa-tpl-payment-guide',
    code: 'PAYMENT_ASSIST_GUIDE',
    title: 'Panduan Daftar Akun & Kirim API Key',
    category: 'PAYMENT_ASSIST',
    isActive: true,
    updatedByAdminId: 'system-seed',
    updatedAt: '2026-01-01T00:00:00.000Z',
    bodyTemplate: `Halo {{nama_pemilik}} (*{{nama_umkm}}*), berikut panduan singkat aktivasi *{{provider}}*:

1️⃣ Daftar akun merchant langsung di website resmi:
{{link_daftar_provider}}
(Gunakan data pemilik usaha & rekening pencairan {{nama_bank}} a.n. {{nama_rekening}}).

2️⃣ Setelah akun {{provider}} diverifikasi aktif, buka menu *Settings → Access Keys / API Keys*.
3️⃣ Pasang URL Webhook otomatis KasirAkun berikut di dashboard {{provider}}:
{{webhook_url}}

4️⃣ Jika ingin kami bantu pasang API Key ke aplikasi KasirAkun, cukup salin *Merchant Code / Server Key / Client Key* saja (boleh tempel sendiri di menu Pengaturan Pembayaran atau kirim di sini agar kami bantu konfigurasi).

🔒 *Pengingat Keamanan:* Jangan pernah bagikan Password Login, PIN, atau Kode OTP Anda kepada siapa pun.`,
  },
  {
    id: 'wa-tpl-payment-activated',
    code: 'PAYMENT_ACTIVATED',
    title: 'Konfirmasi Pembayaran Non-Tunai Sudah Aktif',
    category: 'PAYMENT_ASSIST',
    isActive: true,
    updatedByAdminId: 'system-seed',
    updatedAt: '2026-01-01T00:00:00.000Z',
    bodyTemplate: `Kabar baik, {{nama_pemilik}}! 🎉
Integrasi pembayaran non-tunai *{{provider}}* untuk *{{nama_umkm}}* kini SUDAH AKTIF dan terhubung otomatis ke KasirAkun UMKM.

✅ QRIS Dinamis, E-Wallet, & Virtual Account siap dipakai di layar Kasir & Layar Pelanggan.
✅ Setiap pembayaran sukses otomatis terverifikasi lunas dan langsung masuk jurnal akuntansi (tanpa catat manual).
✅ Dana penjualan akan cair otomatis ke rekening *{{nama_bank}} a.n. {{nama_rekening}}* sesuai jadwal settlement {{provider}}.

Silakan coba tes transaksi pertama di aplikasi. Jika butuh bantuan tambahan, tinggal balas pesan ini ya!`,
  },
  {
    id: 'wa-tpl-demo-approved',
    code: 'DEMO_APPROVED',
    title: 'Persetujuan Akses Akun Demo UMKM',
    category: 'DEMO',
    isActive: true,
    updatedByAdminId: 'system-seed',
    updatedAt: '2026-01-01T00:00:00.000Z',
    bodyTemplate: `Halo {{nama_pemilik}}! 👋
Permintaan akses demo *KasirAkun UMKM* untuk usaha *{{nama_umkm}}* ({{jenis_umkm}}) sudah kami aktifkan.

🔗 Link Login: {{link_demo}}
📧 Email Demo: {{email_demo}}
🔑 Password: {{password_demo}}
📅 Berlaku s/d: {{tanggal_kadaluarsa}}

Silakan coba transaksi kasir, cek laporan keuangan otomatis, hingga QRIS Dinamis. Jika ada pertanyaan atau mau lanjut berlangganan akun asli, langsung balas pesan ini ya!`,
  },
];

export function getProviderRegisterLink(provider: PaymentGatewayProvider): string {
  switch (provider) {
    case 'MIDTRANS':
      return 'https://dashboard.midtrans.com/register';
    case 'DUITKU':
      return 'https://passport.duitku.com/register';
    case 'TRIPAY':
      return 'https://tripay.co.id/register';
    case 'MANUAL_ONLY':
      return 'https://kasirakun.id/panduan-transfer-manual';
    default:
      return 'https://dashboard.midtrans.com/register';
  }
}

export function getProviderDisplayName(provider: PaymentGatewayProvider): string {
  switch (provider) {
    case 'MIDTRANS':
      return 'Midtrans';
    case 'DUITKU':
      return 'Duitku';
    case 'TRIPAY':
      return 'Tripay';
    case 'MANUAL_ONLY':
      return 'Transfer Manual (Kode Unik)';
    case 'SIMULATOR':
    default:
      return 'Mode Simulasi (Demo)';
  }
}

/**
 * Replaces all {{variable_key}} tokens in templateBody with provided values.
 * Unknown/missing keys fall back to empty string or keep placeholder if preserveUnmatched=true.
 */
export function renderWaTemplate(
  templateBody: string,
  variables: Record<string, string | null | undefined>,
  preserveUnmatched = false
): string {
  return templateBody.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const val = variables[key];
    if (val === undefined || val === null || val === '') {
      return preserveUnmatched ? match : '-';
    }
    return String(val);
  });
}

/**
 * Normalizes Indonesian phone numbers to international 628... format for wa.me links.
 */
export function normalizeWaPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

/**
 * Builds a ready-to-click https://wa.me/<phone>?text=<encoded> URL.
 */
export function buildWaMeUrl(rawPhone: string, message: string): string {
  const phone = normalizeWaPhone(rawPhone);
  const encoded = encodeURIComponent(message);
  if (!phone) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${phone}?text=${encoded}`;
}
