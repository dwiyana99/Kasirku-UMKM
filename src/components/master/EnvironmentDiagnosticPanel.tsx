import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import type {
  EnvDiagnosticKeyRow,
  EnvironmentDiagnosticReport,
  EnvSyncKeyStatus,
} from '../../lib/configSync';

interface LiveProbeResult {
  checkedAt: string;
  healthOk: boolean;
  databaseStatus: string;
  databaseLatencyMs: number | null;
  storageConfigured: boolean;
  googleAuthConfigured: boolean;
  betterAuthConfigured: boolean;
  authDiagnosticsOk: boolean;
  betterAuthUrl: string;
}

type DiagnosticFilter = 'ALL' | 'ISSUES' | 'SYNCED' | 'NOT_CONFIGURED';

function getStatusBadgeStyle(status: EnvSyncKeyStatus): string {
  switch (status) {
    case 'MATCHED':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'HOST_SPECIFIC_OK':
      return 'bg-stone-100 text-stone-700 border-stone-200';
    case 'MISMATCH':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'MISSING_NEON':
    case 'MISSING_LOCAL':
    case 'MISSING_RUNTIME':
      return 'bg-amber-50 text-amber-900 border-amber-200';
    default:
      return 'bg-stone-50 text-stone-500 border-stone-200';
  }
}

export function EnvironmentDiagnosticPanel({
  authToken,
  onSyncTriggered,
}: {
  authToken?: string;
  onSyncTriggered?: () => Promise<void>;
}) {
  const [report, setReport] = useState<EnvironmentDiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<LiveProbeResult | null>(null);
  const [filter, setFilter] = useState<DiagnosticFilter>('ALL');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    }),
    [authToken],
  );

  const loadDiagnostic = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/master/env-secrets/diagnostic', { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menjalankan Environment Diagnostic.');
      }
      setReport(data as EnvironmentDiagnosticReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat diagnostik environment.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const runLiveProbe = useCallback(async () => {
    setProbing(true);
    try {
      const [healthRes, authDiagRes] = await Promise.all([
        fetch('/api/health').catch(() => null),
        fetch('/api/auth/diagnostics').catch(() => null),
      ]);
      const healthJson = healthRes && healthRes.ok ? await healthRes.json() : null;
      const authJson = authDiagRes && authDiagRes.ok ? await authDiagRes.json() : null;
      setProbe({
        checkedAt: new Date().toISOString(),
        healthOk: Boolean(healthRes?.ok && healthJson?.status === 'ok'),
        databaseStatus: String(healthJson?.database || 'unknown'),
        databaseLatencyMs:
          typeof healthJson?.databaseLatencyMs === 'number' ? healthJson.databaseLatencyMs : null,
        storageConfigured: Boolean(healthJson?.storageConfigured),
        googleAuthConfigured: Boolean(healthJson?.googleAuthConfigured),
        betterAuthConfigured: Boolean(healthJson?.betterAuthConfigured),
        authDiagnosticsOk: Boolean(authDiagRes?.ok),
        betterAuthUrl: String(authJson?.baseURL || authJson?.betterAuthUrl || window.location.origin),
      });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostic();
    void runLiveProbe();
  }, [loadDiagnostic, runLiveProbe]);

  const handleSyncNow = async () => {
    setSyncing(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/env-secrets/sync', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyinkronkan variabel environment.');
      }
      setFeedback(data.message || 'Sinkronisasi 2-arah selesai.');
      await loadDiagnostic();
      await runLiveProbe();
      if (onSyncTriggered) await onSyncTriggered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyinkronkan environment.');
    } finally {
      setSyncing(false);
    }
  };

  const filteredRows = useMemo<EnvDiagnosticKeyRow[]>(() => {
    if (!report) return [];
    return report.rows.filter((row) => {
      if (filter === 'ALL') return true;
      if (filter === 'ISSUES') {
        return (
          row.status === 'MISMATCH' ||
          row.status === 'MISSING_NEON' ||
          row.status === 'MISSING_LOCAL' ||
          row.status === 'MISSING_RUNTIME'
        );
      }
      if (filter === 'SYNCED') {
        return row.status === 'MATCHED' || row.status === 'HOST_SPECIFIC_OK';
      }
      return row.status === 'NOT_CONFIGURED';
    });
  }, [filter, report]);

  return (
    <div data-testid="environment-diagnostic-panel" className="space-y-5">
      {/* Header & Actions */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200">
          <div className="space-y-1 max-w-[65ch]">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
              <Activity className="w-4 h-4" strokeWidth={1.75} />
              <span>Environment Diagnostic · Perbandingan Runtime vs Neon Vault vs Lokal</span>
            </div>
            <h3 className="text-base font-bold text-stone-900 tracking-[-0.02em]">
              Deteksi Ketidaksesuaian API Key Lintas Server Secara Transparan
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Membandingkan sidik jari SHA-256 (<code className="font-mono">fp:xxxxxxxx</code>)
              antara variabel aktif di server ini, Neon Shared Vault (sumber bersama Vercel), dan
              brankas lokal tanpa pernah membuka nilai rahasia asli ke browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="btn-diagnostic-recheck"
              disabled={loading || probing}
              onClick={() => {
                void loadDiagnostic();
                void runLiveProbe();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading || probing ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span>Cek Ulang</span>
            </button>
            <button
              type="button"
              data-testid="btn-diagnostic-sync-now"
              disabled={syncing}
              onClick={() => void handleSyncNow()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
              ) : (
                <Cloud className="w-3.5 h-3.5" strokeWidth={1.75} />
              )}
              <span>{syncing ? 'Menyinkronkan...' : 'Samakan Semua (2-Arah)'}</span>
            </button>
          </div>
        </div>

        {/* Active Runtime & Live Health Summary Strip */}
        {report && (
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 bg-stone-50/60">
            <div className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-stone-500 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-stone-500" strokeWidth={1.75} />
                <span>Runtime Server Aktif</span>
              </p>
              <p
                data-testid="diagnostic-runtime-label"
                className="text-sm font-bold text-stone-900"
              >
                {report.runtime.label}
              </p>
              <p className="text-[11px] font-mono text-stone-500 truncate">{report.runtime.host}</p>
            </div>

            <div className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-stone-500 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-stone-500" strokeWidth={1.75} />
                <span>Neon Shared Vault</span>
              </p>
              <p
                className={`text-sm font-bold ${
                  report.neonConnected ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {report.neonConnected ? 'Terhubung & Aktif' : 'Belum Terhubung'}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-stone-500">
                {probe?.databaseLatencyMs !== null && probe?.databaseLatencyMs !== undefined
                  ? `Latensi DB: ${probe.databaseLatencyMs} ms`
                  : 'Isi DATABASE_URL untuk sinkron Vercel'}
              </p>
            </div>

            <div className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-stone-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-500" strokeWidth={1.75} />
                <span>Variabel Sinkron</span>
              </p>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-700">
                {report.summary.matchedCount + report.summary.hostSpecificOkCount}
                <span className="text-xs font-normal text-stone-400">
                  {' '}
                  / {report.summary.totalKeys}
                </span>
              </p>
              <p className="text-[11px] text-stone-500">
                Belum diisi: <span className="font-mono tabular-nums">{report.summary.notConfiguredCount}</span>
              </p>
            </div>

            <div className="p-4 space-y-1">
              <p className="text-[11px] font-medium text-stone-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-stone-500" strokeWidth={1.75} />
                <span>Beda Nilai / Perlu Sinkron</span>
              </p>
              <p
                data-testid="diagnostic-issue-count"
                className={`text-xl font-bold font-mono tabular-nums ${
                  report.summary.issueCount > 0 ? 'text-rose-700' : 'text-stone-900'
                }`}
              >
                {report.summary.issueCount}
              </p>
              <p className="text-[11px] text-stone-500">
                Google OAuth:{' '}
                <strong className={probe?.googleAuthConfigured ? 'text-emerald-700' : 'text-amber-700'}>
                  {probe?.googleAuthConfigured ? 'Aktif' : 'Belum Aktif'}
                </strong>
              </p>
            </div>
          </div>
        )}
      </section>

      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-rose-900 bg-rose-50 border border-rose-200 rounded-xl"
        >
          <span>{error}</span>
          <button type="button" onClick={() => void loadDiagnostic()} className="underline font-semibold">
            Coba Lagi
          </button>
        </div>
      )}

      {/* Filter Bar + Comparison Matrix Table */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist">
            {(
              [
                { id: 'ALL', label: `Semua (${report?.summary.totalKeys ?? 0})` },
                { id: 'ISSUES', label: `Perlu Perhatian (${report?.summary.issueCount ?? 0})` },
                {
                  id: 'SYNCED',
                  label: `Sinkron (${(report?.summary.matchedCount ?? 0) + (report?.summary.hostSpecificOkCount ?? 0)})`,
                },
                { id: 'NOT_CONFIGURED', label: `Belum Diisi (${report?.summary.notConfiguredCount ?? 0})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  filter === tab.id
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {report && (
            <span className="text-[11px] font-mono text-stone-400">
              Terakhir cek: {new Date(report.checkedAt).toLocaleTimeString('id-ID')}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" strokeWidth={1.75} />
            <span>Membandingkan konfigurasi runtime, Neon Vault, dan brankas lokal...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            Tidak ada variabel pada filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-testid="environment-diagnostic-table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  <th className="py-3 px-4">Variabel &amp; Layanan</th>
                  <th className="py-3 px-4">
                    <span className="inline-flex items-center gap-1">
                      <Server className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Runtime Aktif
                    </span>
                  </th>
                  <th className="py-3 px-4">
                    <span className="inline-flex items-center gap-1">
                      <Database className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Neon Vault (Vercel)
                    </span>
                  </th>
                  <th className="py-3 px-4">
                    <span className="inline-flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Brankas Lokal
                    </span>
                  </th>
                  <th className="py-3 px-4">Status &amp; Rekomendasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredRows.map((row) => (
                  <tr
                    key={row.key}
                    data-testid={`diagnostic-row-${row.key}`}
                    className="hover:bg-stone-50/70 transition-colors"
                  >
                    <td className="py-3.5 px-4 align-top">
                      <code className="text-[11px] font-mono font-bold text-stone-900 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
                        {row.key}
                      </code>
                      <p className="text-[11px] text-stone-500 mt-1">{row.serviceName}</p>
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      {row.runtime.present ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-[11px] font-semibold text-emerald-800">
                            {row.runtime.fingerprint}
                          </span>
                          <p className="font-mono text-[10px] text-stone-500 max-w-[180px] truncate">
                            {row.runtime.maskedPreview}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-stone-400">Kosong</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      {row.isHostSpecific ? (
                        <span className="text-[11px] text-stone-400">Khusus per domain</span>
                      ) : !report?.neonConnected ? (
                        <span className="text-[11px] text-amber-700">DB belum terhubung</span>
                      ) : row.neonVault.present ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-[11px] font-semibold text-stone-800">
                            {row.neonVault.fingerprint}
                          </span>
                          <p className="font-mono text-[10px] text-stone-500 max-w-[180px] truncate">
                            {row.neonVault.maskedPreview}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-stone-400">Belum ada</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top">
                      {row.localVault.present ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-[11px] font-semibold text-stone-800">
                            {row.localVault.fingerprint}
                          </span>
                          <p className="font-mono text-[10px] text-stone-500 max-w-[180px] truncate">
                            {row.localVault.maskedPreview}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-stone-400">Kosong</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-[300px]">
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border ${getStatusBadgeStyle(
                          row.status,
                        )}`}
                      >
                        {row.statusLabel}
                      </span>
                      <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                        {row.recommendation}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
