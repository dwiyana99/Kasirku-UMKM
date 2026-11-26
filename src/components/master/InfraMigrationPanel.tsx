import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Download,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { InfraMigrationConfig } from '../../types/domain';

interface PreflightAuditSummary {
  totalCustomers: number;
  realCustomers: number;
  demoCustomers: number;
  totalWorkspaces: number;
  totalBranches: number;
  totalProducts: number;
  totalOrders: number;
  totalJournalEntries: number;
  totalJournalLines: number;
  unbalancedJournalsCount: number;
  allDoubleEntryBalanced: boolean;
  checkedAt: string;
}

interface InfraStatusPayload {
  ok: boolean;
  config: InfraMigrationConfig;
  audit: PreflightAuditSummary;
  envSnippet: string;
  serverEnvReady: {
    hasDatabaseUrl: boolean;
    hasBetterAuthSecret: boolean;
    hasNeonObjectStorage: boolean;
    hasMidtrans: boolean;
    hasFonnteToken: boolean;
  };
}

export function InfraMigrationPanel() {
  const { session } = useApp();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<InfraStatusPayload | null>(null);

  // Target DB & Storage Form State (Focused on Neon PostgreSQL + Neon Object Storage)
  const [targetDbProvider, setTargetDbProvider] = useState<'NEON_POSTGRES'>('NEON_POSTGRES');
  const [targetStorageProvider, setTargetStorageProvider] =
    useState<'NEON_OBJECT_STORAGE'>('NEON_OBJECT_STORAGE');
  const [connectionUri, setConnectionUri] = useState(
    'postgresql://neondb_owner:CHANGE_ME@ep-kasirakun-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
  );
  const [storageBucket, setStorageBucket] = useState('kasirakun-assets');
  const [storageEndpoint, setStorageEndpoint] = useState(
    'https://br-kasirakun.storage.c-1.ap-southeast-1.aws.neon.tech'
  );
  const [storagePublicUrl, setStoragePublicUrl] = useState(
    'https://br-kasirakun.storage.c-1.ap-southeast-1.aws.neon.tech/kasirakun-assets'
  );

  const [testing, setTesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cuttingOver, setCuttingOver] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const authHeaders: Record<string, string> = session.token
    ? { Authorization: `Bearer ${session.token}` }
    : {};

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/master/infra/status', { headers: authHeaders });
      const data = (await res.json()) as InfraStatusPayload & { error?: string };
      if (!res.ok || data.ok === false) {
        setErrorMsg(data.error || 'Gagal memuat status infrastruktur migrasi.');
      } else {
        setStatusData(data);
        setTargetDbProvider('NEON_POSTGRES');
        setTargetStorageProvider('NEON_OBJECT_STORAGE');
        if (data.config.storageBucketName) setStorageBucket(data.config.storageBucketName);
        if (
          data.config.storageEndpointPreview &&
          !data.config.storageEndpointPreview.includes('<')
        ) {
          setStorageEndpoint(data.config.storageEndpointPreview);
        }
        if (data.config.storagePublicBaseUrl) setStoragePublicUrl(data.config.storagePublicBaseUrl);
      }
    } catch {
      setErrorMsg('Gagal terhubung ke endpoint status migrasi server.');
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetch('/api/master/infra/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          targetDbProvider,
          targetStorageProvider,
          postgresUri: connectionUri,
          storageBucketName: storageBucket,
          storageEndpointUrl: storageEndpoint,
          storagePublicBaseUrl: storagePublicUrl,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        errors?: string[];
        config?: InfraMigrationConfig;
        envSnippet?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(
          data.errors?.join(' ') || data.error || 'Konfigurasi target gagal divalidasi.'
        );
      } else {
        if (data.config) {
          setStatusData((prev) =>
            prev
              ? {
                  ...prev,
                  config: data.config!,
                  envSnippet: data.envSnippet ?? prev.envSnippet,
                }
              : prev
          );
        }
        setNotice(
          'Validasi koneksi Neon PostgreSQL & Neon Object Storage berhasil! Tahap Pre-Flight siap.'
        );
        await fetchStatus();
      }
    } catch {
      setErrorMsg('Gagal menghubungi server validasi migrasi.');
    } finally {
      setTesting(false);
    }
  };

  const handleExportSql = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/master/infra/export-sql', { headers: authHeaders });
      if (!res.ok) {
        setErrorMsg('Gagal mengekspor skrip SQL migrasi PostgreSQL.');
        return;
      }
      const sqlText = await res.text();
      const blob = new Blob([sqlText], { type: 'application/sql;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const datePart = new Date().toISOString().slice(0, 10);
      a.download = `kasirakun-postgres-migration-${datePart}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(
        `Dump PostgreSQL idempotent (.sql, ${(sqlText.length / 1024).toFixed(1)} KB) berhasil diunduh dengan skema NUMERIC(19,4) & JSONB.`
      );
    } catch {
      setErrorMsg('Terjadi kesalahan saat mengunduh file SQL migrasi.');
    } finally {
      setExporting(false);
    }
  };

  const handleCutoverAction = async (
    action: 'PREPARE_DUAL_WRITE' | 'ACTIVATE_CUTOVER' | 'ROLLBACK'
  ) => {
    setCuttingOver(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetch('/api/master/infra/cutover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Gagal memperbarui tahap cutover.');
      } else {
        setNotice(data.message || 'Status migrasi infrastruktur berhasil diperbarui.');
        await fetchStatus();
      }
    } catch {
      setErrorMsg('Gagal mengirim perintah cutover ke server.');
    } finally {
      setCuttingOver(false);
    }
  };

  const handleAutoSync = async () => {
    setAutoSyncing(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetch('/api/master/infra/auto-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        config?: InfraMigrationConfig;
        serverEnvReady?: InfraStatusPayload['serverEnvReady'];
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Gagal menjalankan pengecekan sinkronisasi otomatis.');
      } else {
        setNotice(data.message || 'Paket sinkronisasi otomatis berhasil disiapkan.');
        await fetchStatus();
      }
    } catch {
      setErrorMsg('Gagal menghubungi server untuk sinkronisasi otomatis.');
    } finally {
      setAutoSyncing(false);
    }
  };

  const handleCopyEnv = async () => {
    if (!statusData?.envSnippet) return;
    try {
      await navigator.clipboard.writeText(statusData.envSnippet);
      setCopiedEnv(true);
      window.setTimeout(() => setCopiedEnv(false), 2500);
    } catch {
      // ignore clipboard restrictions
    }
  };

  if (loading && !statusData) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
        <span>Memuat status database &amp; pre-flight audit migrasi...</span>
      </div>
    );
  }

  const cfg = statusData?.config;
  const audit = statusData?.audit;

  return (
    <div data-testid="infra-migration-panel" className="space-y-6">
      {notice && (
        <div
          role="status"
          data-testid="infra-migration-notice"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            {errorMsg}
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Top Status & Pre-Flight Audit Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-700" />
            <span>Database Aktif Saat Ini</span>
          </p>
          <p className="text-sm font-bold text-slate-900">
            {cfg?.activeDbProvider === 'CURRENT_LOCAL_FIRESTORE'
              ? 'Mode Lokal Preview (Siap ke Neon)'
              : 'Neon Serverless Postgres'}
          </p>
          <p className="text-[11px] text-slate-500">
            Tahap: <span className="font-mono font-semibold text-emerald-700">{cfg?.cutoverStage}</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-emerald-700" />
            <span>Object Storage Aktif</span>
          </p>
          <p className="text-sm font-bold text-slate-900">
            {cfg?.activeStorageProvider === 'CURRENT_LOCAL_FIRESTORE'
              ? 'Mode Lokal Preview (Siap ke Neon)'
              : 'Neon Object Storage (S3)'}
          </p>
          <p className="text-[11px] text-slate-500 font-mono truncate">
            Bucket: {cfg?.storageBucketName || 'kasirakun-assets'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Audit Double-Entry Pre-Flight</span>
          </p>
          <p
            data-testid="infra-audit-balance-status"
            className={`text-sm font-bold ${
              audit?.allDoubleEntryBalanced ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {audit?.allDoubleEntryBalanced
              ? '100% Seimbang (Debit = Kredit)'
              : `${audit?.unbalancedJournalsCount ?? 0} Jurnal Perlu Cek`}
          </p>
          <p className="text-[11px] font-mono text-slate-500">
            {audit?.totalWorkspaces ?? 0} tenant ({audit?.realCustomers ?? 0} real ·{' '}
            {audit?.demoCustomers ?? 0} demo)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 text-emerald-700" />
            <span>Volume Data Siap Sinkron</span>
          </p>
          <p className="text-sm font-bold font-mono tabular-nums text-slate-900">
            {audit?.totalJournalEntries ?? 0} Jurnal · {audit?.totalOrders ?? 0} Order
          </p>
          <p className="text-[11px] font-mono text-slate-500">
            {audit?.totalProducts ?? 0} SKU · {audit?.totalBranches ?? 0} Lokasi
          </p>
        </div>
      </div>

      {/* Server Environment Secrets Readiness & Auto-Sync Panel (No secrets entered in browser) */}
      <div
        data-testid="infra-server-env-panel"
        className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Status Kunci Rahasia Server (Secret Value) &amp; Sinkronisasi Otomatis
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Status kesiapan 5 layanan produksi Anda di Vercel:{' '}
              <span className="font-mono">DATABASE_URL</span> (Neon),{' '}
              <span className="font-mono">BETTER_AUTH_SECRET</span> (Better Auth),{' '}
              <span className="font-mono">AWS_ENDPOINT_URL_S3</span> (Neon Object Storage),{' '}
              <span className="font-mono">MIDTRANS_SERVER_KEY</span>, dan{' '}
              <span className="font-mono">FONNTE_TOKEN</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cek Ulang Server</span>
            </button>
            <button
              type="button"
              data-testid="infra-auto-sync-btn"
              disabled={autoSyncing}
              onClick={() => void handleAutoSync()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              {autoSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Siapkan &amp; Jalankan Sinkron Otomatis</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Neon PostgreSQL</p>
              <p className="text-[11px] text-slate-500 font-mono">DATABASE_URL</p>
            </div>
            <span
              className={`text-[11px] font-semibold ${
                statusData?.serverEnvReady?.hasDatabaseUrl ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {statusData?.serverEnvReady?.hasDatabaseUrl ? 'Terhubung' : 'Belum Diisi'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Better Auth (Neon)</p>
              <p className="text-[11px] text-slate-500 font-mono">BETTER_AUTH_SECRET</p>
            </div>
            <span
              className={`text-[11px] font-semibold ${
                statusData?.serverEnvReady?.hasBetterAuthSecret ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {statusData?.serverEnvReady?.hasBetterAuthSecret ? 'Aktif' : 'Belum Diisi'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Neon Object Storage</p>
              <p className="text-[11px] text-slate-500 font-mono">AWS_* + S3_BUCKET</p>
            </div>
            <span
              className={`text-[11px] font-semibold ${
                statusData?.serverEnvReady?.hasNeonObjectStorage ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {statusData?.serverEnvReady?.hasNeonObjectStorage ? 'Terhubung' : 'Belum Diisi'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Midtrans Master</p>
              <p className="text-[11px] text-slate-500 font-mono">MIDTRANS_SERVER_KEY</p>
            </div>
            <span
              className={`text-[11px] font-semibold ${
                statusData?.serverEnvReady?.hasMidtrans ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {statusData?.serverEnvReady?.hasMidtrans ? 'Aktif' : 'Belum Diisi'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">WhatsApp Fonnte</p>
              <p className="text-[11px] text-slate-500 font-mono">FONNTE_TOKEN</p>
            </div>
            <span
              className={`text-[11px] font-semibold ${
                statusData?.serverEnvReady?.hasFonnteToken ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {statusData?.serverEnvReady?.hasFonnteToken ? 'Terhubung' : 'Mode Sandbox'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split: Configuration Form + 1-Click Zero-Downtime Cutover Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Provider Configuration & Validation */}
        <form
          onSubmit={(e) => void handleTestConnection(e)}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                1. Konfigurasi Target PostgreSQL &amp; Object Storage
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sistem tetap berjalan normal di database saat ini sampai Anda menekan tombol
                Cutover Zero-Downtime.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Segarkan audit migrasi"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Neon PostgreSQL Target */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Database Target Produksi</p>
            <div className="p-3.5 rounded-xl border border-emerald-600 bg-emerald-50/50">
              <p className="text-xs font-bold text-slate-900">
                Neon Serverless PostgreSQL + Better Auth (Neon)
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Auto-scale &amp; scale-to-zero · Region Singapore (ap-southeast-1) · Skema Prisma &amp;
                Better Auth otomatis tersinkron
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="pg-uri-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Neon PostgreSQL Pooled URI (<code className="font-mono">DATABASE_URL</code>)
            </label>
            <input
              id="pg-uri-input"
              data-testid="infra-pg-uri-input"
              type="text"
              required
              value={connectionUri}
              onChange={(e) => setConnectionUri(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Kredensial sandi hanya divalidasi dan tidak disimpan plaintext di browser. Untuk
              produksi, tempel URI ke Environment Variable <code className="font-mono">DATABASE_URL</code> di Vercel.
            </p>
          </div>

          {/* Neon Object Storage Target */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700">
              Object Storage Target (Foto Produk, Logo &amp; Bukti Bayar)
            </p>
            <div className="p-3.5 rounded-xl border border-emerald-600 bg-emerald-50/50">
              <p className="text-xs font-bold text-slate-900">
                Neon Object Storage (S3-Compatible)
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Satu ekosistem langsung di proyek Neon Anda · Menggunakan standar AWS_ENDPOINT_URL_S3,
                AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY &amp; S3_BUCKET
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="storage-bucket" className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Bucket Storage
              </label>
              <input
                id="storage-bucket"
                type="text"
                required
                value={storageBucket}
                onChange={(e) => setStorageBucket(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="storage-public" className="block text-xs font-semibold text-slate-700 mb-1">
                Public CDN Base URL
              </label>
              <input
                id="storage-public"
                type="url"
                required
                value={storagePublicUrl}
                onChange={(e) => setStoragePublicUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="storage-endpoint" className="block text-xs font-semibold text-slate-700 mb-1">
                Endpoint API Storage (HTTPS)
              </label>
              <input
                id="storage-endpoint"
                type="url"
                required
                value={storageEndpoint}
                onChange={(e) => setStorageEndpoint(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={testing}
              data-testid="infra-test-connection-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {testing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Validasi &amp; Simpan Target Migrasi</span>
            </button>
          </div>
        </form>

        {/* Right 5 cols: 1-Click Migration Actions & Zero-Downtime Cutover */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                2. Eksekusi Migrasi 1-Klik (Zero-Downtime)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pindahkan seluruh tenant, stok, transaksi &amp; jurnal double-entry tanpa memutus
                sesi kasir yang sedang berjalan.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={exporting}
                data-testid="infra-export-sql-btn"
                onClick={() => void handleExportSql()}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    A. Unduh Skrip Migrasi PostgreSQL (.sql)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Skema DDL NUMERIC(19,4), indeks GIN JSONB &amp; INSERT idempotent
                  </p>
                </div>
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700 shrink-0" />
                ) : (
                  <Download className="w-4 h-4 text-emerald-700 shrink-0" />
                )}
              </button>

              <button
                type="button"
                disabled={cuttingOver || !cfg?.lastTestOk}
                data-testid="infra-prepare-dual-write-btn"
                onClick={() => void handleCutoverAction('PREPARE_DUAL_WRITE')}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-white hover:bg-emerald-50/50 border border-slate-200 disabled:opacity-45 rounded-xl transition-colors"
              >
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    B. Aktifkan Mode Dual-Write Sinkronisasi
                  </p>
                  <p className="text-[11px] text-slate-500">
                    User tetap operasional normal sambil data baru direplikasi ke target
                  </p>
                </div>
                <RefreshCw className="w-4 h-4 text-slate-600 shrink-0" />
              </button>

              <button
                type="button"
                disabled={cuttingOver || cfg?.cutoverStage !== 'DUAL_WRITE_READY'}
                data-testid="infra-activate-cutover-btn"
                onClick={() => void handleCutoverAction('ACTIVATE_CUTOVER')}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 rounded-xl transition-colors"
              >
                <div>
                  <p className="text-xs font-bold">C. Cutover 1-Klik ke PostgreSQL + Storage Baru</p>
                  <p className="text-[11px] text-emerald-100">
                    Alihkan trafik produksi secara mulus (Zero-Downtime)
                  </p>
                </div>
                <Zap className="w-4 h-4 shrink-0" />
              </button>

              {cfg?.cutoverStage !== 'IDLE' && (
                <button
                  type="button"
                  disabled={cuttingOver}
                  data-testid="infra-rollback-btn"
                  onClick={() => void handleCutoverAction('ROLLBACK')}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rollback 1-Klik ke Database &amp; Storage Awal</span>
                </button>
              )}
            </div>
          </div>

          {/* Environment Variables Snippet */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-white">Konfigurasi .env.production Siap Pakai</p>
                <p className="text-[11px] text-slate-400">
                  Tempel di Vercel / Cloud Run / VPS saat siap go-live skala besar
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyEnv()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedEnv ? 'Tersalin!' : 'Salin .env'}</span>
              </button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto leading-relaxed">
              {statusData?.envSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
