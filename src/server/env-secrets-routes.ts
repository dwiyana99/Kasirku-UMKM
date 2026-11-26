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
import {
  decryptSecretWithFallback,
  encryptSecret,
  maskSecretKey,
} from '../lib/payments/crypto.ts';
import { resetBetterAuthCache } from '../lib/auth.ts';
import { getPrismaClient, resetPrismaClientCache } from '../lib/prisma.ts';
import { resetS3ClientCache } from '../lib/storage/s3-client.ts';
import type { SignedSessionPayload } from '../lib/db/tenant-db.ts';

export type EnvSecretCategory =
  | 'AUTH_SSO'
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
    label: 'Neon PostgreSQL Pooled URL (Runtime Vercel)',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon PostgreSQL',
    isSecret: true,
    placeholder: 'postgresql://neondb_owner:password@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    description:
      'Connection string PostgreSQL Pooled (-pooler) dari Neon Console. Wajib untuk koneksi utama aplikasi & Better Auth di Vercel Serverless.',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Masuk ke console.neon.tech, buat proyek baru di region Asia Pacific (Singapore / ap-southeast-1).',
      'Buka menu Connect / Connection Details lalu pastikan opsi Pooled connection AKTIF (ada -pooler pada host).',
      'Salin URI lengkap hingga ?sslmode=require lalu masukkan di Vercel Environment Variables dengan nama DATABASE_URL.',
    ],
  },
  {
    key: 'DIRECT_URL',
    label: 'Neon PostgreSQL Direct URL (Migrasi Skema Prisma)',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon PostgreSQL',
    isSecret: true,
    placeholder: 'postgresql://neondb_owner:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    description:
      'Connection string langsung (tanpa -pooler) yang otomatis dipakai Vercel saat Deploy untuk membuat seluruh tabel aplikasi dan Better Auth di Neon tanpa terminal.',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Di Neon Console > Connect, MATIKAN opsi Pooled connection (atau salin DATABASE_URL_UNPOOLED bila memakai integrasi Neon di Vercel).',
      'Salin URI tanpa -pooler lalu simpan sebagai DIRECT_URL di Vercel Environment Variables. Tabel database akan otomatis dibuat saat Vercel selesai build.',
    ],
  },
  {
    key: 'AWS_ENDPOINT_URL_S3',
    label: 'Neon Object Storage Endpoint S3',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon Object Storage',
    isSecret: false,
    placeholder: 'https://br-xxxx.storage.c-1.ap-southeast-1.aws.neon.tech',
    description:
      'Endpoint S3 resmi branch Neon Object Storage untuk penyimpanan permanen foto produk, logo usaha, dan bukti bayar di Vercel.',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Buka proyek Neon Anda di browser > pilih branch main > buka menu Object Storage.',
      'Salin nilai AWS_ENDPOINT_URL_S3 (format https://br-xxxx.storage...aws.neon.tech).',
      'Aplikasi otomatis mengaktifkan mode path-style dan checksum S3 sesuai standar resmi Neon Object Storage.',
    ],
  },
  {
    key: 'AWS_REGION',
    label: 'Neon Object Storage Region',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon Object Storage',
    isSecret: false,
    placeholder: 'ap-southeast-1',
    description: 'Kode region AWS tempat proyek & bucket Neon Object Storage Anda berada.',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Cocokkan dengan region proyek Neon Anda (misal ap-southeast-1 untuk Singapore atau us-east-2).',
      'Tempel nilai AWS_REGION yang sama seperti pada tab Object Storage di Neon Console.',
    ],
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    label: 'Neon Object Storage Access Key ID',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon Object Storage',
    isSecret: true,
    placeholder: 'nak_live_xxxxxxxxxxxxxxxx',
    description: 'Access Key ID kredensial S3 dari Neon Object Storage untuk mengunggah file dari endpoint `/api/upload`.',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Di Neon Console > Object Storage > Credentials, buat atau salin Access Key ID (diawali nak_live_...).',
      'Simpan di Vercel Environment Variables dengan nama AWS_ACCESS_KEY_ID.',
    ],
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    label: 'Neon Object Storage Secret Access Key',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon Object Storage',
    isSecret: true,
    placeholder: 'nsk_live_xxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Secret Access Key pasangan AWS_ACCESS_KEY_ID dari Neon Object Storage (khusus server, tidak pernah dikirim ke browser).',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Salin Secret Access Key (diawali nsk_live_...) saat membuat kredensial di Neon Object Storage.',
      'Simpan di Vercel Environment Variables dengan nama AWS_SECRET_ACCESS_KEY.',
    ],
  },
  {
    key: 'S3_BUCKET',
    label: 'Nama Bucket Neon Object Storage',
    category: 'DATABASE_STORAGE',
    serviceName: 'Neon Object Storage',
    isSecret: false,
    placeholder: 'kasirakun-assets',
    description: 'Nama bucket di Neon Object Storage untuk menampung aset gambar yang otomatis dipartisi per tenant (`tenantId/folder/file`).',
    portalUrl: 'https://console.neon.tech',
    guideSteps: [
      'Di Neon Console > Object Storage, klik Create Bucket lalu beri nama huruf kecil (contoh: kasirakun-assets).',
      'Masukkan nama bucket persis sama ke variabel S3_BUCKET di Vercel.',
    ],
  },
  {
    key: 'BETTER_AUTH_SECRET',
    label: 'Better Auth Master Secret (64 Hex)',
    category: 'AUTH_SSO',
    serviceName: 'Better Auth (Neon)',
    isSecret: true,
    placeholder: 'Kunci acak minimal 32 karakter dari https://generate-secret.vercel.app/32',
    description:
      'Kunci rahasia utama Better Auth di Neon. Otomatis juga menurunkan kunci sesi API Vercel, enkripsi AES-256 Midtrans, dan verifikasi webhook.',
    portalUrl: 'https://generate-secret.vercel.app/32',
    guideSteps: [
      'Buka https://generate-secret.vercel.app/32 di tab browser baru lalu salin teks acak yang muncul (tanpa perlu terminal).',
      'Tempel 1 kunci ini di Vercel Environment Variables sebagai BETTER_AUTH_SECRET. Tidak perlu membuat banyak secret terpisah.',
    ],
  },
  {
    key: 'BETTER_AUTH_URL',
    label: 'URL Aplikasi Produksi Vercel (Better Auth)',
    category: 'AUTH_SSO',
    serviceName: 'Better Auth (Neon)',
    isSecret: false,
    placeholder: 'https://kasirakun-umkm.vercel.app',
    description: 'URL HTTPS publik aplikasi Vercel Anda tanpa garis miring akhir untuk origin dan cookie sesi Better Auth di Neon.',
    portalUrl: 'https://vercel.com/dashboard',
    guideSteps: [
      'Setelah deploy pertama di Vercel, salin domain produksi Anda (contoh: https://kasirakun-umkm.vercel.app atau https://kasirakun.id).',
      'Isi ke BETTER_AUTH_URL tanpa tanda / di belakang, lalu Redeploy Vercel.',
    ],
  },
  {
    key: 'MASTER_ADMIN_EMAIL',
    label: 'Email Login Master Admin',
    category: 'AUTH_SSO',
    serviceName: 'Better Auth (Neon)',
    isSecret: false,
    placeholder: 'master@kasirakun.id',
    description: 'Email akun Master Admin pemilik platform yang otomatis dibuat & disinkronkan ke database Neon.',
    portalUrl: '',
    guideSteps: [
      'Masukkan email utama Anda sebagai pemilik platform KasirAkun UMKM.',
      'Email ini otomatis mendapat hak Super Admin di Better Auth Neon dan Konsol Master.',
    ],
  },
  {
    key: 'MASTER_ADMIN_PASSWORD',
    label: 'Kata Sandi Login Master Admin',
    category: 'AUTH_SSO',
    serviceName: 'Better Auth (Neon)',
    isSecret: true,
    placeholder: 'PasswordKuatMaster2026!',
    description: 'Kata sandi awal akun Master Admin saat server Vercel menyala pertama kali.',
    portalUrl: '',
    guideSteps: [
      'Gunakan kombinasi minimal 10 karakter (huruf besar, kecil, angka, dan simbol).',
      'Simpan di Vercel Environment Variables agar tidak memakai kata sandi bawaan demo.',
    ],
  },
  {
    key: 'MIDTRANS_SERVER_KEY',
    label: 'Midtrans Server Key (Akun Master Admin)',
    category: 'PAYMENT_GATEWAY',
    serviceName: 'Midtrans',
    isSecret: true,
    placeholder: 'SB-Mid-server-xxxx (Sandbox) atau Mid-server-xxxx (Production)',
    description:
      'Kunci server Midtrans akun Master Admin untuk menerima pembayaran langganan SaaS dan QRIS Dinamis / VA / E-Wallet.',
    portalUrl: 'https://dashboard.midtrans.com',
    guideSteps: [
      'Masuk ke dashboard.midtrans.com, pilih mode Sandbox (uji coba) atau Production (live).',
      'Buka Settings > Access Keys lalu salin Server Key (diawali SB-Mid-server- atau Mid-server-).',
      'Di Settings > Configuration, isi Payment Notification URL dengan: https://DOMAIN-VERCEL-ANDA/api/webhooks/payment/midtrans/master',
    ],
  },
  {
    key: 'MIDTRANS_CLIENT_KEY',
    label: 'Midtrans Client Key (Akun Master Admin)',
    category: 'PAYMENT_GATEWAY',
    serviceName: 'Midtrans',
    isSecret: false,
    placeholder: 'SB-Mid-client-xxxx (Sandbox) atau Mid-client-xxxx (Production)',
    description: 'Pasangan Client Key dari akun Midtrans Master Admin untuk inisialisasi checkout.',
    portalUrl: 'https://dashboard.midtrans.com',
    guideSteps: [
      'Di dashboard.midtrans.com > Settings > Access Keys, salin Client Key pada mode yang sama dengan Server Key.',
      'Simpan bersama MIDTRANS_SERVER_KEY di Vercel Environment Variables.',
    ],
  },
  {
    key: 'FONNTE_TOKEN',
    label: 'Fonnte WhatsApp Device Token',
    category: 'WHATSAPP_AI',
    serviceName: 'Fonnte WhatsApp',
    isSecret: true,
    placeholder: 'Token perangkat dari md.fonnte.com',
    description:
      'Token perangkat WhatsApp Fonnte untuk mengirim struk transaksi, pengingat tagihan, dan notifikasi otomatis (kode negara otomatis 62).',
    portalUrl: 'https://md.fonnte.com',
    guideSteps: [
      'Login ke md.fonnte.com lalu buka menu Device > Add Device dan hubungkan nomor WhatsApp bisnis Anda dengan scan QR.',
      'Klik tombol Token pada perangkat yang berstatus Connected, salin tokennya, lalu tempel ke FONNTE_TOKEN di Vercel.',
    ],
  },
  {
    key: 'GOOGLE_CLIENT_ID',
    label: 'Google OAuth Client ID (Login Google Master & User Baru)',
    category: 'AUTH_SSO',
    serviceName: 'Google OAuth (Better Auth)',
    isSecret: false,
    placeholder: '1234567890-xxxx.apps.googleusercontent.com',
    description:
      'Client ID dari Google Cloud Console untuk mengaktifkan tombol Masuk/Daftar dengan Google bagi Master Admin (dwiyana99@gmail.com) maupun pendaftar UMKM baru.',
    portalUrl: 'https://console.cloud.google.com/apis/credentials',
    guideSteps: [
      'Buka console.cloud.google.com/apis/credentials, buat OAuth consent screen (External), lalu Create Credentials > OAuth client ID (Web application).',
      'Pada Authorized redirect URIs, tambahkan: https://DOMAIN-VERCEL-ANDA/api/auth/callback/google (dan domain custom / AI Studio bila dipakai).',
      'Salin Client ID berakhiran .apps.googleusercontent.com ke Vercel Environment Variables.',
    ],
  },
  {
    key: 'GOOGLE_CLIENT_SECRET',
    label: 'Google OAuth Client Secret (Login Google)',
    category: 'AUTH_SSO',
    serviceName: 'Google OAuth (Better Auth)',
    isSecret: true,
    placeholder: 'GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx',
    description:
      'Client Secret pasangan GOOGLE_CLIENT_ID dari Google Cloud Console (khusus server Better Auth, tidak pernah dikirim ke browser).',
    portalUrl: 'https://console.cloud.google.com/apis/credentials',
    guideSteps: [
      'Salin Client Secret (diawali GOCSPX-...) tepat di bawah Client ID pada Google Cloud Console.',
      'Simpan di Vercel Environment Variables sebagai GOOGLE_CLIENT_SECRET lalu Redeploy.',
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
  category: z.enum(['AUTH_SSO', 'DATABASE_STORAGE', 'PAYMENT_GATEWAY', 'WHATSAPP_AI', 'SECURITY_CUSTOM']).optional(),
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

const HOST_SPECIFIC_KEYS = new Set(['BETTER_AUTH_URL']);

function isPlaceholderEnvValue(val: string): boolean {
  const s = val.trim();
  if (!s) return true;
  return (
    s.includes('YOUR_') ||
    s.includes('USER:PASSWORD') ||
    s.includes('REPLACE_WITH_') ||
    s.includes('PASSWORD@ep-xxx') ||
    s.includes('<PASSWORD>') ||
    s.includes('<ISI_') ||
    s === 'nak_live_xxxx' ||
    s === 'nsk_live_xxxx'
  );
}

export function parseBulkEnvText(
  rawText: string,
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = withoutExport.slice(0, eqIdx).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || key.length > 80) continue;
    let val = withoutExport.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (!val || isPlaceholderEnvValue(val)) continue;
    entries.push({ key, value: val });
  }
  return entries;
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

  const decryptVaultRecord = (rec: StoredEncryptedSecretRecord): { plain: string; usedFallbackKey: boolean } => {
    const res = decryptSecretWithFallback(rec.encryptedValue);
    return { plain: res.plaintext, usedFallbackKey: res.usedFallbackKey };
  };

  const reencryptVaultWithCurrentKey = (
    vault: Record<string, StoredEncryptedSecretRecord>,
    plainEntries: Array<[string, string]>,
  ): boolean => {
    let dirty = false;
    for (const [k, plain] of plainEntries) {
      const rec = vault[k];
      if (!rec || !plain) continue;
      rec.encryptedValue = encryptSecret(plain);
      dirty = true;
    }
    return dirty;
  };

  const hydrateAllIntoRuntimeEnv = (): { syncedKeys: string[]; failedKeys: string[] } => {
    const vault = readVault();
    const syncedKeys: string[] = [];
    const failedKeys: string[] = [];
    const decryptedEntries: Array<[string, string, boolean]> = [];

    // Decrypt all vault keys before applying BETTER_AUTH_SECRET so the encryption key never flips mid-loop
    for (const [key, rec] of Object.entries(vault)) {
      try {
        const { plain, usedFallbackKey } = decryptVaultRecord(rec);
        if (plain && !isPlaceholderEnvValue(plain)) {
          decryptedEntries.push([key, plain, usedFallbackKey]);
          syncedKeys.push(key);
        }
      } catch {
        failedKeys.push(key);
      }
    }

    for (const [key, plain] of decryptedEntries) {
      if (!process.env[key] || isPlaceholderEnvValue(process.env[key] || '')) {
        process.env[key] = plain;
      } else if (vault[key]) {
        process.env[key] = plain;
      }
    }

    // Self-heal vault ciphertexts that were still encrypted with the pre-BETTER_AUTH_SECRET fallback key
    const fallbackEntries = decryptedEntries
      .filter(([, , usedFallback]) => usedFallback)
      .map(([k, p]) => [k, p] as [string, string]);
    if (fallbackEntries.length > 0 && reencryptVaultWithCurrentKey(vault, fallbackEntries)) {
      writeVault(vault);
    }

    return { syncedKeys, failedKeys };
  };

  // Sync encrypted shared secrets between local vault / Vercel process.env and Neon PostgreSQL
  const syncVaultWithNeonPostgres = async (
    actorEmail = 'system-sync',
  ): Promise<{ neonConnected: boolean; pulledKeys: string[]; pushedKeys: string[] }> => {
    const prisma = getPrismaClient();
    if (!prisma) {
      return { neonConnected: false, pulledKeys: [], pushedKeys: [] };
    }

    const pulledKeys: string[] = [];
    const pushedKeys: string[] = [];

    try {
      const neonRows = await prisma.masterEnvVaultItem.findMany();
      const neonMap = new Map(neonRows.map((row) => [row.key, row]));
      const vault = readVault();
      let vaultDirty = false;
      let authOrStorageChanged = false;

      // 1. Pull shared secrets stored in Neon into runtime + local vault (never overwrite host-specific BETTER_AUTH_URL)
      for (const row of neonRows) {
        if (HOST_SPECIFIC_KEYS.has(row.key)) continue;
        try {
          const { plaintext, usedFallbackKey } = decryptSecretWithFallback(row.encryptedValue);
          if (!plaintext || isPlaceholderEnvValue(plaintext)) continue;

          const localVaultRec = vault[row.key];
          const neonUpdatedMs = row.updatedAt.getTime();
          const localUpdatedMs = localVaultRec?.updatedAt
            ? new Date(localVaultRec.updatedAt).getTime()
            : 0;

          if (!localVaultRec || neonUpdatedMs > localUpdatedMs) {
            const meta = (row.metaJson && typeof row.metaJson === 'object'
              ? row.metaJson
              : {}) as Record<string, unknown>;
            const preset = STANDARD_ENV_CATALOG.find((item) => item.key === row.key);
            vault[row.key] = {
              key: row.key,
              encryptedValue: usedFallbackKey ? encryptSecret(plaintext) : row.encryptedValue,
              label: typeof meta.label === 'string' ? meta.label : preset?.label || row.key,
              category:
                typeof meta.category === 'string'
                  ? (meta.category as EnvSecretCategory)
                  : preset?.category || 'SECURITY_CUSTOM',
              serviceName:
                typeof meta.serviceName === 'string'
                  ? meta.serviceName
                  : preset?.serviceName || 'Custom Environment Key',
              description:
                typeof meta.description === 'string' ? meta.description : preset?.description || '',
              isSecret:
                typeof meta.isSecret === 'boolean' ? meta.isSecret : preset?.isSecret ?? true,
              isCustom: !preset,
              updatedAt: row.updatedAt.toISOString(),
              updatedBy: row.updatedBy || 'neon-sync',
            };
            vaultDirty = true;

            if (process.env[row.key] !== plaintext) {
              process.env[row.key] = plaintext;
              pulledKeys.push(row.key);
              authOrStorageChanged = true;
            }
          }
        } catch {
          // Ignore entries encrypted under a different BETTER_AUTH_SECRET
        }
      }

      if (vaultDirty) {
        writeVault(vault);
      }

      // 2. Push local/Vercel process.env or local vault entries into Neon so AI Studio & Vercel share one truth
      const pushCandidates = new Map<
        string,
        {
          plain: string;
          label?: string;
          category?: EnvSecretCategory;
          serviceName?: string;
          description?: string;
          isSecret?: boolean;
          updatedBy: string;
          updatedAtMs: number;
        }
      >();

      for (const preset of STANDARD_ENV_CATALOG) {
        if (HOST_SPECIFIC_KEYS.has(preset.key)) continue;
        const envVal = (process.env[preset.key] || '').trim();
        if (envVal && !isPlaceholderEnvValue(envVal)) {
          pushCandidates.set(preset.key, {
            plain: envVal,
            label: preset.label,
            category: preset.category,
            serviceName: preset.serviceName,
            description: preset.description,
            isSecret: preset.isSecret,
            updatedBy: process.env.VERCEL ? 'vercel-runtime' : actorEmail,
            updatedAtMs: Date.now(),
          });
        }
      }

      for (const [k, rec] of Object.entries(vault)) {
        if (HOST_SPECIFIC_KEYS.has(k)) continue;
        try {
          const { plain } = decryptVaultRecord(rec);
          if (plain && !isPlaceholderEnvValue(plain)) {
            pushCandidates.set(k, {
              plain,
              label: rec.label,
              category: rec.category,
              serviceName: rec.serviceName,
              description: rec.description,
              isSecret: rec.isSecret,
              updatedBy: rec.updatedBy || actorEmail,
              updatedAtMs: rec.updatedAt ? new Date(rec.updatedAt).getTime() : Date.now(),
            });
          }
        } catch {
          // Skip unreadable vault record
        }
      }

      for (const [key, candidate] of pushCandidates.entries()) {
        const existingNeon = neonMap.get(key);
        let shouldUpsert = !existingNeon;
        if (existingNeon) {
          let existingPlain = '';
          try {
            existingPlain = decryptSecretWithFallback(existingNeon.encryptedValue).plaintext;
          } catch {
            existingPlain = '';
          }
          const existingMs = existingNeon.updatedAt.getTime();
          if (!existingPlain || (existingPlain !== candidate.plain && candidate.updatedAtMs > existingMs)) {
            shouldUpsert = true;
          }
        }

        if (shouldUpsert) {
          const encrypted = encryptSecret(candidate.plain);
          await prisma.masterEnvVaultItem.upsert({
            where: { key },
            create: {
              key,
              encryptedValue: encrypted,
              metaJson: {
                label: candidate.label || key,
                category: candidate.category || 'SECURITY_CUSTOM',
                serviceName: candidate.serviceName || 'KasirAkun Env',
                description: candidate.description || '',
                isSecret: candidate.isSecret ?? true,
              },
              updatedBy: candidate.updatedBy,
            },
            update: {
              encryptedValue: encrypted,
              metaJson: {
                label: candidate.label || key,
                category: candidate.category || 'SECURITY_CUSTOM',
                serviceName: candidate.serviceName || 'KasirAkun Env',
                description: candidate.description || '',
                isSecret: candidate.isSecret ?? true,
              },
              updatedBy: candidate.updatedBy,
            },
          });
          pushedKeys.push(key);
        }
      }

      if (authOrStorageChanged) {
        resetBetterAuthCache();
        resetS3ClientCache();
      }

      return { neonConnected: true, pulledKeys, pushedKeys };
    } catch {
      return { neonConnected: false, pulledKeys: [], pushedKeys: [] };
    }
  };

  // Immediately hydrate saved encrypted keys into process.env on server startup
  hydrateAllIntoRuntimeEnv();
  void syncVaultWithNeonPostgres('boot-sync');

  const buildSummaries = (): MasterEnvSecretSummary[] => {
    const vault = readVault();
    const standardKeys = new Set(STANDARD_ENV_CATALOG.map((item) => item.key));
    const list: MasterEnvSecretSummary[] = [];
    const fallbackToHeal: Array<[string, string]> = [];

    for (const preset of STANDARD_ENV_CATALOG) {
      const vaultRec = vault[preset.key];
      let runtimeVal = process.env[preset.key] || '';
      let source: MasterEnvSecretSummary['source'] = 'NOT_SET';
      if (vaultRec) {
        try {
          const { plain, usedFallbackKey } = decryptVaultRecord(vaultRec);
          if (plain && !isPlaceholderEnvValue(plain)) {
            runtimeVal = plain;
            source = 'MASTER_VAULT';
            if (usedFallbackKey) {
              fallbackToHeal.push([preset.key, plain]);
            }
          }
        } catch {
          // Fall back safely to SERVER_ENV below if runtime env var is already active
        }
      }
      if (source === 'NOT_SET' && runtimeVal && !isPlaceholderEnvValue(runtimeVal)) {
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
        const dec = decryptVaultRecord(rec);
        plain = dec.plain ?? '';
        if (dec.usedFallbackKey && plain) {
          fallbackToHeal.push([key, plain]);
        }
      } catch {
        plain = process.env[key] || '';
      }
      const isSecret = rec.isSecret ?? true;
      const configured = Boolean(plain) && !isPlaceholderEnvValue(plain);
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

    if (fallbackToHeal.length > 0 && reencryptVaultWithCurrentKey(vault, fallbackToHeal)) {
      writeVault(vault);
    }

    return list;
  };

  // GET /api/master/env-secrets — Sync with Neon shared vault then return masked status & Indonesian setup guides
  app.get('/api/master/env-secrets', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mengakses brankas API & Secret Key.' });
    }
    const syncInfo = await syncVaultWithNeonPostgres(session.email);
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
      neonVaultSync: syncInfo,
      lastCheckedAt: new Date().toISOString(),
    });
  });

  // PUT /api/master/env-secrets — Save/update standard or custom key, encrypt AES-256-GCM, and auto-sync to process.env + Neon
  app.put('/api/master/env-secrets', async (req, res) => {
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

    // If BETTER_AUTH_SECRET is about to change, decrypt existing vault values first so we can re-encrypt under the new key
    const existingPlains: Array<[string, string]> = [];
    if (key === 'BETTER_AUTH_SECRET') {
      for (const [k, rec] of Object.entries(vault)) {
        if (k === key) continue;
        try {
          const { plain } = decryptVaultRecord(rec);
          if (plain) existingPlains.push([k, plain]);
        } catch {
          // Skip unreadable record
        }
      }
    }

    // Immediate live auto-sync to active Node.js runtime process.env
    process.env[key] = value;

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

    if (key === 'BETTER_AUTH_SECRET' && existingPlains.length > 0) {
      reencryptVaultWithCurrentKey(vault, existingPlains);
    }

    writeVault(vault);
    resetBetterAuthCache();
    resetS3ClientCache();
    if (key === 'DATABASE_URL' || key === 'DIRECT_URL') {
      resetPrismaClientCache();
    }

    const syncInfo = await syncVaultWithNeonPostgres(session.email);
    const items = buildSummaries();
    const savedItem = items.find((i) => i.key === key);
    return res.status(200).json({
      ok: true,
      message: syncInfo.neonConnected
        ? `${key} berhasil dienkripsi (AES-256-GCM), aktif di server ini, dan tersinkron ke Neon PostgreSQL.`
        : `${key} berhasil dienkripsi (AES-256-GCM) dan langsung tersinkron otomatis ke runtime server.`,
      item: savedItem,
      items,
      neonVaultSync: syncInfo,
      stats: {
        totalKeys: items.length,
        configuredCount: items.filter((i) => i.configured).length,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });

  // POST /api/master/env-secrets/bulk-import — 1-click import from Vercel .env copy-paste
  app.post('/api/master/env-secrets/bulk-import', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang mengimpor Environment Variables.' });
    }
    const rawEnvText = typeof req.body?.rawEnvText === 'string' ? req.body.rawEnvText : '';
    const parsedEntries = parseBulkEnvText(rawEnvText);
    if (parsedEntries.length === 0) {
      return res.status(400).json({
        error: 'Tidak ditemukan baris KEY=VALUE yang valid. Tempel isi .env atau variabel Vercel Anda.',
      });
    }

    const vault = readVault();
    const nowIso = new Date().toISOString();

    // Decrypt existing keys first in case BETTER_AUTH_SECRET is among imported entries
    const existingPlains = new Map<string, string>();
    for (const [k, rec] of Object.entries(vault)) {
      try {
        const { plain } = decryptVaultRecord(rec);
        if (plain) existingPlains.set(k, plain);
      } catch {
        // ignore
      }
    }

    // Apply imported plain values to process.env first (BETTER_AUTH_SECRET included)
    const importedKeys: string[] = [];
    for (const { key, value } of parsedEntries) {
      process.env[key] = value;
      existingPlains.set(key, value);
      importedKeys.push(key);
    }

    // Re-encrypt all entries consistently with the active key
    for (const [key, plainVal] of existingPlains.entries()) {
      const preset = STANDARD_ENV_CATALOG.find((item) => item.key === key);
      const prev = vault[key];
      vault[key] = {
        key,
        encryptedValue: encryptSecret(plainVal),
        label: prev?.label || preset?.label || key,
        category: prev?.category || preset?.category || 'SECURITY_CUSTOM',
        serviceName: prev?.serviceName || preset?.serviceName || 'Custom Environment Key',
        description: prev?.description || preset?.description || '',
        isSecret: prev?.isSecret ?? preset?.isSecret ?? true,
        isCustom: !preset,
        updatedAt: importedKeys.includes(key) ? nowIso : prev?.updatedAt || nowIso,
        updatedBy: importedKeys.includes(key) ? session.email : prev?.updatedBy || session.email,
      };
    }

    writeVault(vault);
    resetBetterAuthCache();
    resetS3ClientCache();
    resetPrismaClientCache();

    const syncInfo = await syncVaultWithNeonPostgres(session.email);
    const items = buildSummaries();
    return res.status(200).json({
      ok: true,
      importedKeys,
      neonVaultSync: syncInfo,
      message: `${importedKeys.length} variabel berhasil diimpor, dienkripsi, dan disinkronkan (${importedKeys.join(', ')}).`,
      items,
      stats: {
        totalKeys: items.length,
        configuredCount: items.filter((i) => i.configured).length,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });

  // DELETE /api/master/env-secrets/:key — Remove key from encrypted vault & Neon & clear from runtime process.env
  app.delete('/api/master/env-secrets/:key', async (req, res) => {
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
    const prisma = getPrismaClient();
    if (prisma) {
      try {
        await prisma.masterEnvVaultItem.deleteMany({ where: { key: targetKey } });
      } catch {
        // ignore if table not created yet
      }
    }
    resetBetterAuthCache();
    resetS3ClientCache();
    if (targetKey === 'DATABASE_URL' || targetKey === 'DIRECT_URL') {
      resetPrismaClientCache();
    }

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

  // POST /api/master/env-secrets/sync — Force re-hydrate all encrypted vault keys to process.env + Neon two-way sync
  app.post('/api/master/env-secrets/sync', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang menjalankan sinkronisasi.' });
    }
    const result = hydrateAllIntoRuntimeEnv();
    const syncInfo = await syncVaultWithNeonPostgres(session.email);
    resetBetterAuthCache();
    resetS3ClientCache();
    resetPrismaClientCache();
    const items = buildSummaries();
    const activeCount = items.filter((i) => i.configured).length;
    return res.status(200).json({
      ok: true,
      message: syncInfo.neonConnected
        ? `Sinkronisasi 2-arah Neon selesai: ${activeCount} variabel aktif (${syncInfo.pulledKeys.length} ditarik dari Neon/Vercel, ${syncInfo.pushedKeys.length} dikirim ke Neon).`
        : result.syncedKeys.length > 0
        ? `${result.syncedKeys.length} kunci API & secret berhasil disinkronisasi ulang ke runtime server dan siap langsung dipakai.`
        : 'Sinkronisasi selesai. Belum ada secret tersimpan di brankas; tambahkan API Key atau impor .env Vercel di bawah.',
      syncedKeys: result.syncedKeys,
      failedKeys: result.failedKeys,
      neonVaultSync: syncInfo,
      items,
      stats: {
        totalKeys: items.length,
        configuredCount: activeCount,
        syncedCount: items.filter((i) => i.syncedToRuntime).length,
        customCount: items.filter((i) => i.isCustom).length,
      },
    });
  });
}
