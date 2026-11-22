/**
 * Master Admin Encrypted Environment API & Secret Key Manager
 * - Stores Master Admin-managed API keys & secrets encrypted with AES-256-GCM in `.data/db/_env_secrets.enc.json`.
 * - Auto-hydrates saved secrets directly into `process.env` on server boot and immediately after every save/delete.
 * - Never returns plaintext secrets back to the browser — strictly returns masked previews (`maskSecretKey`).
 * - Supports both standard integration presets (with step-by-step Indonesian guides) and unlimited custom env keys.
 */

import path from 'node:path';
import type express from 'express';
import { z } from 'zod';
import { decryptSecret, encryptSecret, maskSecretKey } from '../lib/payments/crypto';
import type { SignedSessionPayload } from '../lib/db/tenant-db';

export type EnvSecretCategory =
  | 'DATABASE_STORAGE'
  | 'PAYMENT_GATEWAY'
  | 'WHATSAPP_AI'
  | 'SECURITY_CUSTOM';

export interface EnvSecretCatalogItem {
  key: string;
  label: string;
  category: EnvSecretCategory;
  serviceName: string;
  isSecret: boolean;
  placeholder: string;
  description: string;
  portalUrl: string;
  guideSteps: string[];
}

export interface StoredEncryptedSecretRecord {
  key: string;
  encryptedValue: string;
  label?: string;
  category?: EnvSecretCategory;
  serviceName?: string;
  description?: string;
  isSecret?: boolean;
  isCustom?: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface MasterEnvSecretSummary {
  key: string;
  label: string;
  category: EnvSecretCategory;
  serviceName: string;
  isSecret: boolean;
  isCustom: boolean;
  placeholder: string;
  description: string;
  portalUrl: string;
  guideSteps: string[];
  configured: boolean;
  source: 'MASTER_VAULT' | 'SERVER_ENV' | 'NOT_SET';
  maskedPreview: string | null;
  syncedToRuntime: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const STANDARD_ENV_CATALOG: EnvSecretCatalogItem[] = [
  {
    key: 'DATABASE_URL',
    label: 'PostgreSQL Connection String (Supabase / Neon / Cloud SQL)',
    category: 'DATABASE_STORAGE',
    serviceName: 'PostgreSQL Database',
    isSecret: true,
    placeholder: 'postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
    description: 'Koneksi database PostgreSQL produksi untuk menyimpan seluruh transaksi, stok, dan jurnal double-entry secara permanen.',
    portalUrl: 'https://supabase.com/dashboard',
    guideSteps: [
      'Daftar / masuk ke Supabase (supabase.com) atau Neon (neon.tech), lalu klik New Project dan pilih region Singapore (ap-southeast-1).',
      'Buka menu Project Settings > Database > Connection String > pilih mode Transaction Pooler (port 6543) atau Session Pooler.',
      'Salin URI lengkap, ganti bagian [YOUR-PASSWORD] dengan kata sandi database Anda, lalu tempel di kolom ini dan klik Simpan & Sinkron.',
    ],
  },
  {
    key: 'R2_ACCOUNT_ID',
    label: 'Cloudflare R2 Account ID',
    category: 'DATABASE_STORAGE',
    serviceName: 'Cloudflare R2 Storage',
    isSecret: false,
    placeholder: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'ID akun Cloudflare untuk penyimpanan foto menu, bukti bayar, dan arsip dokumen pajak tanpa biaya egress.',
    portalUrl: 'https://dash.cloudflare.com',
    guideSteps: [
      'Masuk ke Cloudflare Dashboard (dash.cloudflare.com) dan buka menu R2 Object Storage di sidebar kiri.',
      'Salin nilai Account ID pada panel kanan halaman ringkasan R2.',
      'Tempel di kolom ini, lalu lengkapi R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET_NAME.',
    ],
  },
  {
    key: 'R2_ACCESS_KEY_ID',
    label: 'Cloudflare R2 Access Key ID',
    category: 'DATABASE_STORAGE',
    serviceName: 'Cloudflare R2 Storage',
    isSecret: true,
    placeholder: 'r2_access_key_xxxxxxxxxxxx',
    description: 'Kunci akses API S3-compatible untuk unggah file foto produk dan nota PDF ke bucket Cloudflare R2.',
    portalUrl: 'https://dash.cloudflare.com',
    guideSteps: [
      'Di halaman R2 Object Storage, klik Manage R2 API Tokens > Create API Token.',
      'Beri izin Object Read & Write dan pilih bucket khusus KasirAkun UMKM.',
      'Salin Access Key ID yang muncul sekali saat pembuatan token, lalu simpan di sini.',
    ],
  },
  {
    key: 'R2_SECRET_ACCESS_KEY',
    label: 'Cloudflare R2 Secret Access Key',
    category: 'DATABASE_STORAGE',
    serviceName: 'Cloudflare R2 Storage',
    isSecret: true,
    placeholder: 'r2_secret_xxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Pasangan secret key Cloudflare R2 yang dienkripsi AES-256-GCM di sisi server.',
    portalUrl: 'https://dash.cloudflare.com',
    guideSteps: [
      'Salin Secret Access Key tepat dari layar hasil pembuatan R2 API Token (bersamaan dengan Access Key ID).',
      'Simpan segera di form ini karena Cloudflare tidak menampilkan ulang secret key tersebut setelah halaman ditutup.',
    ],
  },
  {
    key: 'R2_BUCKET_NAME',
    label: 'Cloudflare R2 Bucket Name',
    category: 'DATABASE_STORAGE',
    serviceName: 'Cloudflare R2 Storage',
    isSecret: false,
    placeholder: 'kasirakun-umkm-media',
    description: 'Nama bucket R2 tujuan penyimpanan gambar produk, logo tenant, dan file backup.',
    portalUrl: 'https://dash.cloudflare.com',
    guideSteps: [
      'Di Cloudflare R2, klik Create bucket dan beri nama unik huruf kecil (contoh: kasirakun-umkm-media).',
      'Pilih lokasi Asia-Pacific (APAC) agar akses gambar cepat dari Indonesia, lalu masukkan nama bucket ke kolom ini.',
    ],
  },
  {
    key: 'MIDTRANS_SERVER_KEY',
    label: 'Midtrans Server Key (Platform Default)',
    category: 'PAYMENT_GATEWAY',
    serviceName: 'Midtrans',
    isSecret: true,
    placeholder: 'Mid-server-xxxxxxxxxxxxxxxx atau SB-Mid-server-xxxx',
    description: 'Kunci server Midtrans untuk tagihan langganan SaaS dan fallback pembayaran QRIS Dinamis, GoPay, serta Virtual Account.',
    portalUrl: 'https://dashboard.midtrans.com',
    guideSteps: [
      'Masuk ke dashboard.midtrans.com, pilih mode Sandbox (uji coba) atau Production (live).',
      'Buka menu Settings > Access Keys pada sidebar kiri.',
      'Salin Server Key (diawali SB-Mid-server- atau Mid-server-), tempel di sini, lalu atur Notification URL Midtrans ke /api/webhooks/payment/midtrans.',
    ],
  },
  {
    key: 'DUITKU_API_KEY',
    label: 'Duitku API Key & Project Key',
    category: 'PAYMENT_GATEWAY',
    serviceName: 'Duitku',
    isSecret: true,
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'API Key Duitku untuk verifikasi pembayaran QRIS, VA Bank, dan E-Wallet otomatis tanpa token manual.',
    portalUrl: 'https://passport.duitku.com',
    guideSteps: [
      'Login ke Duitku Merchant Portal (passport.duitku.com) lalu buka menu Proyek Saya.',
      'Pilih proyek aplikasi Anda dan klik tombol Lihat API Key untuk menyalin Merchant API Key.',
      'Pastikan Callback URL proyek Duitku diarahkan ke domain Anda + /api/webhooks/payment/duitku.',
    ],
  },
  {
    key: 'TRIPAY_API_KEY',
    label: 'Tripay API Key / Private Key',
    category: 'PAYMENT_GATEWAY',
    serviceName: 'Tripay',
    isSecret: true,
    placeholder: 'DEV-xxxxxxxx atau PROD-xxxxxxxx',
    description: 'Kunci integrasi Tripay untuk gerbang pembayaran QRIS, ShopeePay, OVO, DANA, dan Virtual Account.',
    portalUrl: 'https://tripay.co.id/member',
    guideSteps: [
      'Masuk ke Dashboard Tripay (tripay.co.id/member) dan pilih tab Merchant.',
      'Klik tombol Opsi > Detail pada merchant aktif Anda untuk melihat API Key dan Private Key.',
      'Salin API Key ke sini, lalu tambahkan TRIPAY_PRIVATE_KEY via tombol Tambah Key Custom bila memakai mode live Tripay.',
    ],
  },
  {
    key: 'FONNTE_TOKEN',
    label: 'Fonnte WhatsApp Device Token',
    category: 'WHATSAPP_AI',
    serviceName: 'Fonnte WhatsApp API',
    isSecret: true,
    placeholder: 'fonnte_device_token_xxxxxxxx',
    description: 'Token perangkat WhatsApp Fonnte untuk mengirim resi otomatis, notifikasi order, dan pengingat tagihan ke pelanggan UMKM.',
    portalUrl: 'https://md.fonnte.com',
    guideSteps: [
      'Buat akun di fonnte.com lalu login ke md.fonnte.com.',
      'Buka menu Device > Add Device, masukkan nomor WhatsApp bisnis Anda, lalu scan QR Code dari HP untuk menghubungkan perangkat.',
      'Klik tombol Token pada baris perangkat yang sudah Connected, salin tokennya, lalu simpan di kolom ini agar pengiriman WA langsung aktif.',
    ],
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API Key (Asisten AI & OCR Struk)',
    category: 'WHATSAPP_AI',
    serviceName: 'Google AI Studio',
    isSecret: true,
    placeholder: 'AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Kunci API untuk mengaktifkan Asisten AI Bisnis, analisis margin otomatis, dan fitur baca struk kulakan bagi tenant berlangganan add-on AI.',
    portalUrl: 'https://aistudio.google.com/apikey',
    guideSteps: [
      'Buka Google AI Studio (aistudio.google.com/apikey) menggunakan akun Google pengelola.',
      'Klik tombol Create API key lalu pilih atau buat proyek Google Cloud baru.',
      'Salin kunci yang diawali AIzaSy..., tempel di kolom ini, lalu klik Simpan & Sinkron Otomatis.',
    ],
  },
  {
    key: 'PAYMENT_CREDENTIAL_ENCRYPTION_KEY',
    label: 'Kunci Master Enkripsi AES-256 (64 Hex)',
    category: 'SECURITY_CUSTOM',
    serviceName: 'Keamanan Vault Server',
    isSecret: true,
    placeholder: '64 karakter hex acak (contoh: openssl rand -hex 32)',
    description: 'Kunci utama enkripsi AES-256-GCM untuk melindungi seluruh API Key payment gateway milik tenant di database.',
    portalUrl: '',
    guideSteps: [
      'Buat 64 karakter hex acak melalui terminal: openssl rand -hex 32 (atau kombinasikan 32+ karakter acak kuat).',
      'Catat kunci ini di password manager cadangan Anda sebelum menggantinya agar data terenkripsi selalu dapat dipulihkan.',
    ],
  },
  {
    key: 'QRIS_WEBHOOK_SECRET',
    label: 'HMAC-SHA256 Webhook Signing Secret',
    category: 'SECURITY_CUSTOM',
    serviceName: 'Verifikasi Webhook',
    isSecret: true,
    placeholder: 'kasirakun-prod-hmac-secret-minimal-32-karakter',
    description: 'Rahasia penandatanganan HMAC-SHA256 untuk memastikan setiap callback pembayaran QRIS berasal dari server resmi.',
    portalUrl: '',
    guideSteps: [
      'Buat string acak minimal 32 karakter (kombinasi huruf besar, kecil, angka, dan tanda hubung).',
      'Gunakan nilai yang sama pada konfigurasi webhook verifier internal bila memakai proxy gateway tambahan.',
    ],
  },
];

const saveEnvSecretSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Nama key wajib HURUF KAPITAL, angka, dan garis bawah (contoh: MIDTRANS_CLIENT_KEY).'),
  value: z.string().trim().min(1, 'Nilai API / Secret Key tidak boleh kosong.').max(4000),
  label: z.string().trim().max(120).optional(),
  category: z.enum(['DATABASE_STORAGE', 'PAYMENT_GATEWAY', 'WHATSAPP_AI', 'SECURITY_CUSTOM']).optional(),
  serviceName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  isSecret: z.boolean().optional(),
});

interface MountEnvSecretsDeps {
  DATA_ROOT: string;
  extractSessionFromRequest: (req: express.Request) => SignedSessionPayload | null;
  loadJsonFile: <T>(filePath: string, fallback: T) => T;
  saveJsonFile: (filePath: string, data: unknown) => void;
}

export function mountMasterEnvSecretsRoutes(app: express.Express, deps: MountEnvSecretsDeps): void {
  const { DATA_ROOT, extractSessionFromRequest, loadJsonFile, saveJsonFile } = deps;
  const VAULT_FILE = path.join(DATA_ROOT, '_env_secrets.enc.json');

  const readVault = (): Record<string, StoredEncryptedSecretRecord> => {
    return loadJsonFile<Record<string, StoredEncryptedSecretRecord>>(VAULT_FILE, {});
  };

  const writeVault = (vault: Record<string, StoredEncryptedSecretRecord>): void => {
    saveJsonFile(VAULT_FILE, vault);
  };

  const hydrateAllIntoRuntimeEnv = (): { syncedKeys: string[]; failedKeys: string[] } => {
    const vault = readVault();
    const syncedKeys: string[] = [];
    const failedKeys: string[] = [];
    for (const [key, rec] of Object.entries(vault)) {
      try {
        const plain = decryptSecret(rec.encryptedValue);
        if (plain) {
          process.env[key] = plain;
          syncedKeys.push(key);
        }
      } catch {
        failedKeys.push(key);
      }
    }
    return { syncedKeys, failedKeys };
  };

  // Immediately hydrate saved encrypted keys into process.env on server startup
  hydrateAllIntoRuntimeEnv();

  const buildSummaries = (): MasterEnvSecretSummary[] => {
    const vault = readVault();
    const standardKeys = new Set(STANDARD_ENV_CATALOG.map((item) => item.key));
    const list: MasterEnvSecretSummary[] = [];

    for (const preset of STANDARD_ENV_CATALOG) {
      const vaultRec = vault[preset.key];
      let runtimeVal = process.env[preset.key] || '';
      let source: MasterEnvSecretSummary['source'] = 'NOT_SET';
      if (vaultRec) {
        try {
          const decrypted = decryptSecret(vaultRec.encryptedValue);
          if (decrypted) {
            runtimeVal = decrypted;
            source = 'MASTER_VAULT';
          }
        } catch {
          source = 'NOT_SET';
        }
      } else if (runtimeVal && !runtimeVal.includes('YOUR_') && !runtimeVal.includes('USER:PASSWORD')) {
        source = 'SERVER_ENV';
      }

      const configured = source !== 'NOT_SET';
      const maskedPreview = configured
        ? preset.isSecret
          ? maskSecretKey(runtimeVal)
          : runtimeVal
        : null;

      list.push({
        key: preset.key,
        label: preset.label,
        category: preset.category,
        serviceName: preset.serviceName,
        isSecret: preset.isSecret,
        isCustom: false,
        placeholder: preset.placeholder,
        description: preset.description,
        portalUrl: preset.portalUrl,
        guideSteps: preset.guideSteps,
        configured,
        source,
        maskedPreview,
        syncedToRuntime: configured && Boolean(process.env[preset.key]),
        updatedAt: vaultRec?.updatedAt ?? null,
        updatedBy: vaultRec?.updatedBy ?? null,
      });
    }

    // Append custom Master Admin env keys
    for (const [key, rec] of Object.entries(vault)) {
      if (standardKeys.has(key)) continue;
      let plain = '';
      try {
        plain = decryptSecret(rec.encryptedValue);
      } catch {
        plain = '';
      }
      const isSecret = rec.isSecret ?? true;
      const configured = Boolean(plain);
      list.push({
        key,
        label: rec.label || key,
        category: rec.category || 'SECURITY_CUSTOM',
        serviceName: rec.serviceName || 'Custom Environment Key',
        isSecret,
        isCustom: true,
        placeholder: 'Nilai environment / secret key custom',
        description:
          rec.description ||
          'Variabel environment custom yang ditambahkan oleh Master Admin dan langsung tersinkron ke runtime server.',
        portalUrl: '',
        guideSteps: [
          'Variabel custom ini langsung tersedia di runtime server (process.env.' + key + ') begitu disimpan.',
          'Anda dapat memperbarui nilainya kapan saja tanpa perlu mengedit kode atau restart manual.',
        ],
        configured,
        source: configured ? 'MASTER_VAULT' : 'NOT_SET',
        maskedPreview: configured ? (isSecret ? maskSecretKey(plain) : plain) : null,
        syncedToRuntime: configured && Boolean(process.env[key]),
        updatedAt: rec.updatedAt,
        updatedBy: rec.updatedBy,
      });
    }

    return list;
  };

  // GET /api/master/env-secrets — Masked status & Indonesian setup guides
  app.get('/api/master/env-secrets', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mengakses brankas API & Secret Key.' });
    }
    const items = buildSummaries();
    const configuredCount = items.filter((i) => i.configured).length;
    return res.status(200).json({
      items,
      stats: {
        totalKeys: items.length,
        configuredCount,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
      lastCheckedAt: new Date().toISOString(),
    });
  });

  // PUT /api/master/env-secrets — Save/update standard or custom key, encrypt AES-256-GCM, and auto-sync to process.env
  app.put('/api/master/env-secrets', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang menyimpan Environment API & Secret Key.' });
    }
    const parsed = saveEnvSecretSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Format Environment Key tidak valid.',
        details: parsed.error.flatten(),
      });
    }

    const { key, value, label, category, serviceName, description, isSecret } = parsed.data;
    const preset = STANDARD_ENV_CATALOG.find((item) => item.key === key);
    const vault = readVault();
    const nowIso = new Date().toISOString();

    vault[key] = {
      key,
      encryptedValue: encryptSecret(value),
      label: label || preset?.label || key,
      category: category || preset?.category || 'SECURITY_CUSTOM',
      serviceName: serviceName || preset?.serviceName || 'Custom Environment Key',
      description: description || preset?.description || '',
      isSecret: isSecret ?? preset?.isSecret ?? true,
      isCustom: !preset,
      updatedAt: nowIso,
      updatedBy: session.email,
    };

    writeVault(vault);
    // Immediate live auto-sync to active Node.js runtime process.env
    process.env[key] = value;

    const items = buildSummaries();
    const savedItem = items.find((i) => i.key === key);
    return res.status(200).json({
      ok: true,
      message: `${key} berhasil dienkripsi (AES-256-GCM) dan langsung tersinkron otomatis ke runtime server.`,
      item: savedItem,
      items,
      stats: {
        totalKeys: items.length,
        configuredCount: items.filter((i) => i.configured).length,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });

  // DELETE /api/master/env-secrets/:key — Remove key from encrypted vault & clear from runtime process.env
  app.delete('/api/master/env-secrets/:key', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang menghapus Secret Key.' });
    }
    const targetKey = String(req.params.key || '').trim().toUpperCase();
    const vault = readVault();
    if (vault[targetKey]) {
      delete vault[targetKey];
      writeVault(vault);
    }
    delete process.env[targetKey];

    const items = buildSummaries();
    return res.status(200).json({
      ok: true,
      message: `${targetKey} telah dihapus dari brankas terenkripsi dan dilepas dari runtime aktif.`,
      items,
      stats: {
        totalKeys: items.length,
        configuredCount: items.filter((i) => i.configured).length,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });

  // POST /api/master/env-secrets/sync — Force re-hydrate all encrypted vault keys to process.env
  app.post('/api/master/env-secrets/sync', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang menjalankan sinkronisasi.' });
    }
    const result = hydrateAllIntoRuntimeEnv();
    const items = buildSummaries();
    return res.status(200).json({
      ok: true,
      message:
        result.syncedKeys.length > 0
          ? `${result.syncedKeys.length} kunci API & secret berhasil disinkronisasi ulang ke runtime server dan siap langsung dipakai.`
          : 'Sinkronisasi selesai. Belum ada secret tersimpan di brankas; tambahkan API Key di bawah untuk mulai sinkron otomatis.',
      syncedKeys: result.syncedKeys,
      failedKeys: result.failedKeys,
      items,
      stats: {
        totalKeys: items.length,
        configuredCount: items.filter((i) => i.configured).length,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });
}
