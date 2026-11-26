/**
 * KasirAkun UMKM — Standardized Environment Configuration & Cross-Runtime Sync Utility
 *
 * Ensures consistent reading, sanitization, placeholder filtering, and non-reversible
 * fingerprint comparison of environment variables across:
 *  - Local Development (`localhost` / `127.0.0.1`)
 *  - Gemini AI Studio Preview (`*.run.app`)
 *  - Vercel Preview & Production (`*.vercel.app` / custom domains)
 *  - Custom VPS / Cloud Servers (e.g. Biznet GIO Cloud)
 *
 * Security guarantee:
 *  - Never exposes raw secret values in diagnostics or browser payloads.
 *  - Uses deterministic domain-tagged SHA-256 short fingerprints (`fp:xxxxxxxx`) so
 *    mismatches between Vercel OS env, Neon Shared Vault, and Local Vault are detected
 *    accurately without leaking credentials.
 */

import crypto from 'node:crypto';
import { maskSecretKey } from './payments/crypto.ts';

export type RuntimeEnvironmentType =
  | 'VERCEL_PRODUCTION'
  | 'VERCEL_PREVIEW'
  | 'AI_STUDIO_PREVIEW'
  | 'LOCAL_DEV'
  | 'CUSTOM_SERVER';

export type EnvSyncKeyStatus =
  | 'MATCHED'
  | 'HOST_SPECIFIC_OK'
  | 'MISMATCH'
  | 'MISSING_NEON'
  | 'MISSING_LOCAL'
  | 'MISSING_RUNTIME'
  | 'NOT_CONFIGURED';

export interface RuntimeEnvironmentIdentity {
  type: RuntimeEnvironmentType;
  label: string;
  host: string;
  isVercel: boolean;
  isAiStudio: boolean;
  isLocal: boolean;
}

export interface EnvLayerSnapshot {
  present: boolean;
  maskedPreview: string | null;
  fingerprint: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface EnvDiagnosticKeyRow {
  key: string;
  label: string;
  serviceName: string;
  category: string;
  isSecret: boolean;
  isHostSpecific: boolean;
  status: EnvSyncKeyStatus;
  statusLabel: string;
  recommendation: string;
  runtime: EnvLayerSnapshot;
  neonVault: EnvLayerSnapshot;
  localVault: EnvLayerSnapshot;
}

export interface EnvironmentDiagnosticReport {
  checkedAt: string;
  runtime: RuntimeEnvironmentIdentity;
  neonConnected: boolean;
  summary: {
    totalKeys: number;
    matchedCount: number;
    hostSpecificOkCount: number;
    mismatchCount: number;
    missingNeonCount: number;
    missingLocalCount: number;
    missingRuntimeCount: number;
    notConfiguredCount: number;
    issueCount: number;
  };
  rows: EnvDiagnosticKeyRow[];
}

export const HOST_SPECIFIC_ENV_KEYS = new Set<string>(['BETTER_AUTH_URL']);

/**
 * Strips whitespace and surrounding single/double quotes from an environment variable value.
 */
export function stripEnvQuotes(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

/**
 * Detects unfilled template / placeholder values from `.env.example` or docs.
 */
export function isPlaceholderEnvValue(raw: string | undefined | null): boolean {
  const s = stripEnvQuotes(raw);
  if (!s) return true;
  return (
    s.includes('YOUR_') ||
    s.includes('USER:PASSWORD') ||
    s.includes('REPLACE_WITH_') ||
    s.includes('PASSWORD@ep-xxx') ||
    s.includes('<PASSWORD>') ||
    s.includes('<ISI_') ||
    s.includes('your-project.vercel.app') ||
    s === 'nak_live_xxxx' ||
    s === 'nsk_live_xxxx'
  );
}

/**
 * Standardized accessor for reading environment variables consistently across
 * Local Dev, Gemini AI Studio Preview, and Vercel.
 */
export function getStandardEnvValue(
  key: string,
  options?: {
    env?: Record<string, string | undefined>;
    fallbackKeys?: string[];
    allowPlaceholder?: boolean;
  },
): string {
  const sourceEnv = options?.env ?? process.env;
  const candidates = [key, ...(options?.fallbackKeys ?? [])];
  for (const name of candidates) {
    const cleaned = stripEnvQuotes(sourceEnv[name]);
    if (!cleaned) continue;
    if (!options?.allowPlaceholder && isPlaceholderEnvValue(cleaned)) continue;
    return cleaned;
  }
  return '';
}

/**
 * Computes a short, non-reversible fingerprint (`fp:8hex`) to verify whether two
 * environments hold the exact same API key or secret without exposing the value.
 */
export function computeSecretFingerprint(raw: string | undefined | null): string | null {
  const cleaned = stripEnvQuotes(raw);
  if (!cleaned || isPlaceholderEnvValue(cleaned)) return null;
  const hex = crypto
    .createHash('sha256')
    .update(`kasirakun:env-fp:v1:${cleaned}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
  return `fp:${hex}`;
}

export function maskEnvPreview(
  raw: string | undefined | null,
  isSecret: boolean,
): string | null {
  const cleaned = stripEnvQuotes(raw);
  if (!cleaned || isPlaceholderEnvValue(cleaned)) return null;
  if (isSecret) return maskSecretKey(cleaned);
  return cleaned.length > 64 ? `${cleaned.slice(0, 34)}...${cleaned.slice(-18)}` : cleaned;
}

/**
 * Identifies the active execution environment (Vercel Production/Preview, AI Studio Preview,
 * Local Dev, or Custom Cloud Server).
 */
export function detectRuntimeEnvironment(
  env: Record<string, string | undefined> = process.env,
  requestHost?: string | null,
): RuntimeEnvironmentIdentity {
  const hostRaw =
    stripEnvQuotes(requestHost) ||
    stripEnvQuotes(env.VERCEL_PROJECT_PRODUCTION_URL) ||
    stripEnvQuotes(env.VERCEL_URL) ||
    stripEnvQuotes(env.APP_URL).replace(/^https?:\/\//i, '').replace(/\/.*$/, '') ||
    'localhost:3000';
  const host = hostRaw.toLowerCase();

  const vercelEnv = stripEnvQuotes(env.VERCEL_ENV).toLowerCase();
  const isVercel = Boolean(env.VERCEL || vercelEnv || host.endsWith('.vercel.app'));
  if (isVercel) {
    const isProd = vercelEnv === 'production' || (!vercelEnv && !host.includes('-git-'));
    return {
      type: isProd ? 'VERCEL_PRODUCTION' : 'VERCEL_PREVIEW',
      label: isProd ? 'Vercel Produksi' : 'Vercel Preview',
      host,
      isVercel: true,
      isAiStudio: false,
      isLocal: false,
    };
  }

  const isAiStudio = Boolean(
    host.endsWith('.run.app') ||
      env.APP_URL?.includes('.run.app') ||
      env.K_SERVICE ||
      env.CLOUD_RUN_JOB,
  );
  if (isAiStudio) {
    return {
      type: 'AI_STUDIO_PREVIEW',
      label: 'Gemini AI Studio Preview',
      host,
      isVercel: false,
      isAiStudio: true,
      isLocal: false,
    };
  }

  const isLocal =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('0.0.0.0');
  if (isLocal) {
    return {
      type: 'LOCAL_DEV',
      label: 'Server Lokal (Dev)',
      host,
      isVercel: false,
      isAiStudio: false,
      isLocal: true,
    };
  }

  return {
    type: 'CUSTOM_SERVER',
    label: 'Server Cloud Mandiri',
    host,
    isVercel: false,
    isAiStudio: false,
    isLocal: false,
  };
}

function buildLayerSnapshot(
  rawValue: string | undefined | null,
  isSecret: boolean,
  meta?: { updatedAt?: string | null; updatedBy?: string | null },
): EnvLayerSnapshot {
  const cleaned = stripEnvQuotes(rawValue);
  const present = Boolean(cleaned) && !isPlaceholderEnvValue(cleaned);
  return {
    present,
    maskedPreview: present ? maskEnvPreview(cleaned, isSecret) : null,
    fingerprint: present ? computeSecretFingerprint(cleaned) : null,
    updatedAt: meta?.updatedAt ?? null,
    updatedBy: meta?.updatedBy ?? null,
  };
}

export interface DiagnosticKeyDescriptor {
  key: string;
  label: string;
  serviceName: string;
  category: string;
  isSecret: boolean;
}

export interface DiagnosticLayerEntry {
  value: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

/**
 * Pure diagnostic engine comparing keys across Runtime (`process.env`), Neon Shared Vault,
 * and Local Encrypted Vault. Safe for unit testing and Master Admin API responses.
 */
export function buildEnvironmentDiagnosticReport(params: {
  descriptors: DiagnosticKeyDescriptor[];
  runtimeEnv: Record<string, string | undefined>;
  neonVaultEntries: Record<string, DiagnosticLayerEntry>;
  localVaultEntries: Record<string, DiagnosticLayerEntry>;
  neonConnected: boolean;
  requestHost?: string | null;
  checkedAt?: string;
}): EnvironmentDiagnosticReport {
  const runtime = detectRuntimeEnvironment(params.runtimeEnv, params.requestHost);
  const rows: EnvDiagnosticKeyRow[] = [];

  for (const desc of params.descriptors) {
    const isHostSpecific = HOST_SPECIFIC_ENV_KEYS.has(desc.key);
    const runtimeSnap = buildLayerSnapshot(params.runtimeEnv[desc.key], desc.isSecret);
    const neonRec = params.neonVaultEntries[desc.key];
    const localRec = params.localVaultEntries[desc.key];
    const neonSnap = buildLayerSnapshot(neonRec?.value, desc.isSecret, neonRec);
    const localSnap = buildLayerSnapshot(localRec?.value, desc.isSecret, localRec);

    let status: EnvSyncKeyStatus = 'NOT_CONFIGURED';
    let statusLabel = 'Belum Diisi';
    let recommendation = `Isi ${desc.key} di brankas API atau Vercel Environment Variables bila layanan ${desc.serviceName} digunakan.`;

    if (isHostSpecific) {
      if (runtimeSnap.present) {
        status = 'HOST_SPECIFIC_OK';
        statusLabel = 'Khusus Domain Aktif';
        recommendation = `Variabel khusus domain (${desc.key}) memang berbeda antara Vercel dan AI Studio agar callback OAuth mengikuti host aktif.`;
      } else {
        status = 'HOST_SPECIFIC_OK';
        statusLabel = 'Otomatis Ikuti Host';
        recommendation = `Server otomatis memakai origin host aktif (${runtime.host}). Di Vercel produksi, isi ${desc.key} sesuai domain utama Anda.`;
      }
    } else if (!runtimeSnap.present && !neonSnap.present && !localSnap.present) {
      status = 'NOT_CONFIGURED';
      statusLabel = 'Belum Diisi';
    } else {
      const presentFingerprints = new Set(
        [runtimeSnap.fingerprint, neonSnap.fingerprint, localSnap.fingerprint].filter(
          (fp): fp is string => Boolean(fp),
        ),
      );

      if (presentFingerprints.size > 1) {
        status = 'MISMATCH';
        statusLabel = 'Nilai Berbeda';
        recommendation = `Fingerprint ${desc.key} berbeda antara Runtime aktif (${runtimeSnap.fingerprint ?? '-'}), Neon Vault (${neonSnap.fingerprint ?? '-'}), dan Lokal (${localSnap.fingerprint ?? '-'}). Klik "Sinkronkan 2-Arah" atau perbarui di brankas agar seragam.`;
      } else if (!runtimeSnap.present) {
        status = 'MISSING_RUNTIME';
        statusLabel = 'Belum Aktif di Runtime';
        recommendation = `Kunci sudah tersimpan di brankas tetapi belum termuat ke runtime server ini. Klik "Sinkronkan 2-Arah" untuk memuat ulang.`;
      } else if (params.neonConnected && !neonSnap.present) {
        status = 'MISSING_NEON';
        statusLabel = 'Belum Tersinkron ke Neon';
        recommendation = `Kunci aktif di ${runtime.label}, namun belum tersimpan di Neon Shared Vault sehingga belum muncul di server lain. Klik "Sinkronkan 2-Arah".`;
      } else if (!params.neonConnected && runtimeSnap.present && !localSnap.present) {
        status = 'MISSING_LOCAL';
        statusLabel = 'Hanya di Env Server';
        recommendation = `Terbaca dari env server tanpa koneksi Neon Shared Vault. Isi DATABASE_URL Neon agar sinkron otomatis ke Vercel & AI Studio.`;
      } else if (params.neonConnected && neonSnap.present && !localSnap.present && !runtime.isVercel) {
        status = 'MISSING_LOCAL';
        statusLabel = 'Belum di Brankas Lokal';
        recommendation = `Tersedia di Neon Vault namun belum tersimpan di brankas lokal. Klik "Sinkronkan 2-Arah" untuk menarik ke lokal.`;
      } else {
        status = 'MATCHED';
        statusLabel = params.neonConnected ? 'Sinkron Penuh' : 'Aktif di Server Ini';
        recommendation = params.neonConnected
          ? `Nilai ${desc.key} seragam (${runtimeSnap.fingerprint}) antara Runtime aktif dan Neon Shared Vault.`
          : `Nilai ${desc.key} aktif di server ini (${runtimeSnap.fingerprint}). Hubungkan DATABASE_URL Neon untuk sinkron lintas server.`;
      }
    }

    rows.push({
      key: desc.key,
      label: desc.label,
      serviceName: desc.serviceName,
      category: desc.category,
      isSecret: desc.isSecret,
      isHostSpecific,
      status,
      statusLabel,
      recommendation,
      runtime: runtimeSnap,
      neonVault: neonSnap,
      localVault: localSnap,
    });
  }

  const matchedCount = rows.filter((r) => r.status === 'MATCHED').length;
  const hostSpecificOkCount = rows.filter((r) => r.status === 'HOST_SPECIFIC_OK').length;
  const mismatchCount = rows.filter((r) => r.status === 'MISMATCH').length;
  const missingNeonCount = rows.filter((r) => r.status === 'MISSING_NEON').length;
  const missingLocalCount = rows.filter((r) => r.status === 'MISSING_LOCAL').length;
  const missingRuntimeCount = rows.filter((r) => r.status === 'MISSING_RUNTIME').length;
  const notConfiguredCount = rows.filter((r) => r.status === 'NOT_CONFIGURED').length;

  return {
    checkedAt: params.checkedAt ?? new Date().toISOString(),
    runtime,
    neonConnected: params.neonConnected,
    summary: {
      totalKeys: rows.length,
      matchedCount,
      hostSpecificOkCount,
      mismatchCount,
      missingNeonCount,
      missingLocalCount,
      missingRuntimeCount,
      notConfiguredCount,
      issueCount: mismatchCount + missingNeonCount + missingLocalCount + missingRuntimeCount,
    },
    rows,
  };
}
