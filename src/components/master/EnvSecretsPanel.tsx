import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EnvironmentDiagnosticPanel } from './EnvironmentDiagnosticPanel';

type EnvSecretCategory =
  | 'AUTH_SSO'
  | 'DATABASE_STORAGE'
  | 'PAYMENT_GATEWAY'
  | 'WHATSAPP_AI'
  | 'SECURITY_CUSTOM';

interface MasterEnvSecretSummary {
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

interface EnvSecretsStats {
  totalKeys: number;
  configuredCount: number;
  syncedCount: number;
  customCount: number;
}

const CATEGORY_TABS: Array<{ id: 'ALL' | EnvSecretCategory; label: string }> = [
  { id: 'ALL', label: 'Semua Variabel' },
  { id: 'DATABASE_STORAGE', label: 'Neon DB & Object Storage' },
  { id: 'AUTH_SSO', label: 'Better Auth & Google OAuth' },
  { id: 'PAYMENT_GATEWAY', label: 'Midtrans' },
  { id: 'WHATSAPP_AI', label: 'WhatsApp Fonnte' },
  { id: 'SECURITY_CUSTOM', label: 'Custom' },
];

export function EnvSecretsPanel() {
  const { session } = useApp();
  const [items, setItems] = useState<MasterEnvSecretSummary[]>([]);
  const [stats, setStats] = useState<EnvSecretsStats>({
    totalKeys: 0,
    configuredCount: 0,
    syncedCount: 0,
    customCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [viewMode, setViewMode] = useState<'KEYS' | 'DIAGNOSTIC'>('KEYS');
  const [activeCategory, setActiveCategory] = useState<'ALL' | EnvSecretCategory>('ALL');
  const [expandedGuideKey, setExpandedGuideKey] = useState<string | null>('DATABASE_URL');

  // Inline edit drafts per key
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Add custom env key form state
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customService, setCustomService] = useState('Custom Integration');
  const [customCategory, setCustomCategory] = useState<EnvSecretCategory>('SECURITY_CUSTOM');
  const [customDesc, setCustomDesc] = useState('');
  const [customIsSecret, setCustomIsSecret] = useState(true);

  // 1-click Bulk .env import from Vercel
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkEnvText, setBulkEnvText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [neonConnected, setNeonConnected] = useState(false);

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    }),
    [session.token]
  );

  const fetchSecrets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/master/env-secrets', { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat daftar Environment API & Secret Key.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      if (data.neonVaultSync) setNeonConnected(Boolean(data.neonVaultSync.neonConnected));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan API.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void fetchSecrets();
  }, [fetchSecrets]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'ALL') return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  const handleSaveKey = async (item: MasterEnvSecretSummary) => {
    const val = (draftValues[item.key] || '').trim();
    if (!val) {
      setError(`Masukkan nilai untuk ${item.key} terlebih dahulu.`);
      return;
    }
    setSavingKey(item.key);
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/env-secrets', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          key: item.key,
          value: val,
          label: item.label,
          category: item.category,
          serviceName: item.serviceName,
          description: item.description,
          isSecret: item.isSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan kunci.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      if (data.neonVaultSync) setNeonConnected(Boolean(data.neonVaultSync.neonConnected));
      setDraftValues((prev) => ({ ...prev, [item.key]: '' }));
      setFeedback(data.message || `${item.key} berhasil disimpan dan tersinkron otomatis.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan kunci.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleAddCustomKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedKey = customKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!normalizedKey || !customValue.trim()) {
      setError('Nama Key dan Nilai Secret wajib diisi.');
      return;
    }
    setSavingKey('__CUSTOM__');
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/env-secrets', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          key: normalizedKey,
          value: customValue.trim(),
          label: customLabel.trim() || normalizedKey,
          category: customCategory,
          serviceName: customService.trim() || 'Custom Environment Key',
          description: customDesc.trim(),
          isSecret: customIsSecret,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menambahkan environment key custom.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      setCustomKey('');
      setCustomValue('');
      setCustomLabel('');
      setCustomDesc('');
      setShowAddCustom(false);
      setFeedback(data.message || `${normalizedKey} berhasil ditambahkan dan langsung aktif.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambahkan key custom.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    setSavingKey(keyName);
    setError('');
    setFeedback('');
    try {
      const res = await fetch(`/api/master/env-secrets/${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghapus key.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      setFeedback(data.message || `${keyName} berhasil dihapus.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus key.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/env-secrets/sync', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal sinkronisasi runtime.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      if (data.neonVaultSync) setNeonConnected(Boolean(data.neonVaultSync.neonConnected));
      setFeedback(data.message || 'Sinkronisasi otomatis selesai.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyinkronkan ke runtime.');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleBulkImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkEnvText.trim()) {
      setError('Tempel isi variabel .env dari Vercel terlebih dahulu.');
      return;
    }
    setBulkImporting(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/env-secrets/bulk-import', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rawEnvText: bulkEnvText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengimpor variabel .env.');
      }
      setItems(data.items ?? []);
      if (data.stats) setStats(data.stats);
      if (data.neonVaultSync) setNeonConnected(Boolean(data.neonVaultSync.neonConnected));
      setBulkEnvText('');
      setShowBulkImport(false);
      setFeedback(data.message || 'Variabel berhasil diimpor dan disinkronkan.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengimpor variabel .env.');
    } finally {
      setBulkImporting(false);
    }
  };

  return (
    <div data-testid="env-secrets-panel" className="space-y-6">
      {/* Summary Strip */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-stone-200">
          <div className="space-y-1 max-w-[65ch]">
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
              <span>Brankas AES-256-GCM &amp; Sinkronisasi Runtime Otomatis</span>
            </div>
            <h2 className="text-lg font-bold text-stone-900 tracking-[-0.02em]">
              Peta API &amp; Environment Produksi (Vercel + Neon + Google OAuth + Midtrans + Fonnte)
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              Kelola 16 variabel produksi: Neon PostgreSQL, Neon Object Storage, Better Auth di
              Neon, <strong>Google OAuth (GOOGLE_CLIENT_ID &amp; GOOGLE_CLIENT_SECRET)</strong>{' '}
              untuk login Google Master &amp; user baru, Midtrans Master Admin, dan WhatsApp Fonnte.
            </p>
            {typeof window !== 'undefined' && (() => {
              const host = window.location.host;
              const isAiStudioPreview =
                host.endsWith('.run.app') ||
                host.startsWith('localhost') ||
                host.startsWith('127.0.0.1');
              const envLabel = isAiStudioPreview
                ? 'Gemini AI Studio Preview'
                : host.endsWith('.vercel.app')
                ? 'Vercel Produksi'
                : 'Domain Produksi';
              return (
                <div className="space-y-2 pt-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      data-testid="active-runtime-env-badge"
                      className="text-[11px] font-semibold rounded-lg px-2.5 py-1 border border-stone-300 bg-stone-100 text-stone-800"
                    >
                      Lingkungan Aktif: {envLabel} ({host})
                    </span>
                    <span
                      data-testid="neon-vault-sync-badge"
                      className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border ${
                        neonConnected
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                          : 'text-amber-900 bg-amber-50 border-amber-200'
                      }`}
                    >
                      {neonConnected
                        ? 'Sinkronisasi 2-Arah Neon DB ↔ Vercel ↔ AI Studio Aktif'
                        : 'Belum Terhubung ke Neon DB (Isi DATABASE_URL di bawah untuk tarik otomatis 14–16 variabel dari Vercel)'}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 inline-block break-words">
                    Redirect URI Google OAuth server ini: {window.location.origin}/api/auth/callback/google
                  </p>
                  {isAiStudioPreview && !neonConnected && (
                    <p
                      data-testid="ai-studio-sync-hint"
                      className="text-xs text-stone-700 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 leading-relaxed"
                    >
                      <strong>Cara sinkron 1-langkah:</strong> Vercel dan Gemini AI Studio adalah dua
                      server terpisah yang berbagi kunci lewat Neon PostgreSQL. Cukup tempel{' '}
                      <code className="font-mono text-stone-900">DATABASE_URL</code> Neon di kartu
                      pertama lalu klik <strong>Simpan</strong>, maka seluruh variabel dari Vercel
                      akan otomatis tertarik ke AI Studio.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowBulkImport((v) => !v);
                setShowAddCustom(false);
              }}
              data-testid="btn-toggle-bulk-import-env"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" strokeWidth={1.75} />
              <span>Impor .env Vercel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddCustom((v) => !v);
                setShowBulkImport(false);
              }}
              data-testid="btn-toggle-add-custom-env"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              <span>Tambah Key Custom</span>
            </button>
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncingAll}
              data-testid="btn-sync-all-env"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`}
                strokeWidth={1.75}
              />
              <span>{syncingAll ? 'Menyinkronkan...' : 'Sinkronkan 2-Arah'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 bg-stone-50/50">
          <div className="p-4">
            <p className="text-xs font-medium text-stone-500">Total Variabel Terdaftar</p>
            <p className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {stats.totalKeys}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-stone-500">Sudah Terisi &amp; Terenkripsi</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {stats.configuredCount}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-stone-500">Aktif di Runtime Server</p>
            <p className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {stats.syncedCount}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs font-medium text-stone-500">Variabel Custom Master</p>
            <p className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {stats.customCount}
            </p>
          </div>
        </div>
      </section>

      {/* Clean Sub-View Switcher: Daftar Kunci API vs Environment Diagnostic */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'KEYS'}
          data-testid="env-subtab-keys"
          onClick={() => setViewMode('KEYS')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            viewMode === 'KEYS'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Daftar Variabel API ({stats.totalKeys})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'DIAGNOSTIC'}
          data-testid="env-subtab-diagnostic"
          onClick={() => setViewMode('DIAGNOSTIC')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            viewMode === 'DIAGNOSTIC'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
          }`}
        >
          <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Environment Diagnostic (Vercel vs Lokal)</span>
        </button>
      </div>

      {viewMode === 'DIAGNOSTIC' ? (
        <EnvironmentDiagnosticPanel
          authToken={session.token}
          onSyncTriggered={fetchSecrets}
        />
      ) : (
        <>
      {feedback && (
        <div
          data-testid="env-secrets-feedback"
          className="flex items-start gap-2.5 px-4 py-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-xs font-medium text-rose-900 bg-rose-50 border border-rose-200 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchSecrets()}
            className="underline font-semibold shrink-0"
          >
            Muat Ulang
          </button>
        </div>
      )}

      {/* 1-Click Bulk .env Import from Vercel */}
      {showBulkImport && (
        <form
          onSubmit={handleBulkImportSubmit}
          data-testid="bulk-import-env-form"
          className="bg-white border border-emerald-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Impor Sekaligus dari Vercel Environment Variables (.env)
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Tempel daftar <code>KEY=VALUE</code> (misalnya <code>GOOGLE_CLIENT_ID=...</code>,{' '}
                <code>MIDTRANS_SERVER_KEY=...</code>, <code>FONNTE_TOKEN=...</code>) untuk langsung
                menyamakan Gemini AI Studio dengan Vercel &amp; Neon PostgreSQL dalam 1 klik.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkImport(false)}
              className="text-xs font-medium text-stone-500 hover:text-stone-900"
            >
              Tutup
            </button>
          </div>
          <textarea
            rows={6}
            value={bulkEnvText}
            onChange={(e) => setBulkEnvText(e.target.value)}
            data-testid="textarea-bulk-env"
            placeholder={'MIDTRANS_SERVER_KEY="SB-Mid-server-..."\nMIDTRANS_CLIENT_KEY="SB-Mid-client-..."\nFONNTE_TOKEN="..."\nGOOGLE_CLIENT_ID="...apps.googleusercontent.com"\nGOOGLE_CLIENT_SECRET="GOCSPX-..."'}
            className="w-full px-3 py-2.5 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={bulkImporting}
              data-testid="btn-submit-bulk-env"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{bulkImporting ? 'Mengimpor...' : 'Impor & Sinkronkan Semua'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Add Custom Environment API / Secret Form */}
      {showAddCustom && (
        <form
          onSubmit={handleAddCustomKey}
          data-testid="custom-env-form"
          className="bg-white border border-emerald-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Tambah Environment API / Secret Key Custom
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Variabel baru akan langsung dienkripsi dan tersedia pada runtime server setelah
                disimpan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddCustom(false)}
              className="text-xs font-medium text-stone-500 hover:text-stone-900"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nama Environment Key (HURUF_KAPITAL) *
              </label>
              <input
                type="text"
                required
                data-testid="input-custom-env-key"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value.toUpperCase())}
                placeholder="Contoh: GOOGLE_CLIENT_ID atau S3_PUBLIC_URL"
                className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nilai API / Secret Key *
              </label>
              <input
                type={customIsSecret ? 'password' : 'text'}
                required
                data-testid="input-custom-env-value"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="Tempel nilai API key / secret di sini"
                className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nama Layanan / Label
              </label>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Contoh: Custom Domain CDN Storage"
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Kategori</label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as EnvSecretCategory)}
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
                >
                  <option value="DATABASE_STORAGE">Neon DB &amp; Object Storage</option>
                  <option value="AUTH_SSO">Better Auth &amp; Google OAuth</option>
                  <option value="PAYMENT_GATEWAY">Midtrans</option>
                  <option value="WHATSAPP_AI">WhatsApp Fonnte</option>
                  <option value="SECURITY_CUSTOM">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nama Penyedia
                </label>
                <input
                  type="text"
                  value={customService}
                  onChange={(e) => setCustomService(e.target.value)}
                  placeholder="Contoh: Neon / Midtrans / Custom"
                  className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Catatan Kegunaan (Opsional)
            </label>
            <input
              type="text"
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="Jelaskan singkat fungsi key ini untuk tim operasional"
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-200">
            <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={customIsSecret}
                onChange={(e) => setCustomIsSecret(e.target.checked)}
                className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>Sembunyikan nilai dengan masking (direkomendasikan untuk API Secret)</span>
            </label>
            <button
              type="submit"
              disabled={savingKey === '__CUSTOM__'}
              data-testid="btn-submit-custom-env"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>
                {savingKey === '__CUSTOM__' ? 'Menyimpan...' : 'Simpan & Sinkron Otomatis'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-stone-200">
        {CATEGORY_TABS.map((tab) => {
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-emerald-600 text-emerald-800'
                  : 'border-transparent text-stone-500 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-200">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="p-5 animate-pulse space-y-2.5">
              <div className="h-4 w-56 bg-stone-200 rounded" />
              <div className="h-3 w-96 bg-stone-100 rounded" />
              <div className="h-9 w-full bg-stone-100 rounded-lg" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <KeyRound className="w-8 h-8 text-stone-400 mx-auto" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-stone-900">
            Belum ada variabel pada kategori ini
          </p>
          <p className="text-xs text-stone-500">
            Tambahkan Environment API atau Secret Key custom sesuai kebutuhan integrasi Anda.
          </p>
          <button
            type="button"
            onClick={() => setShowAddCustom(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            <span>Tambah Key Custom</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-200 overflow-hidden">
          {filteredItems.map((item) => {
            const isGuideOpen = expandedGuideKey === item.key;
            const isSaving = savingKey === item.key;
            return (
              <div key={item.key} data-testid={`env-row-${item.key}`} className="p-5 space-y-3.5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        {item.key}
                      </code>
                      <span className="text-xs font-medium text-stone-500">{item.serviceName}</span>
                      {item.configured ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
                          {item.syncedToRuntime ? 'Aktif & Tersinkron' : 'Tersimpan'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                          Belum Diisi
                        </span>
                      )}
                      {item.isCustom && (
                        <span className="text-[11px] font-medium text-stone-700 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-stone-900">{item.label}</p>
                    <p className="text-xs text-stone-600 max-w-[65ch] leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedGuideKey(isGuideOpen ? null : item.key)}
                      data-testid={`btn-guide-${item.key}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                      <span>Panduan Buat Key</span>
                      {isGuideOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
                      )}
                    </button>
                    {item.configured && item.source === 'MASTER_VAULT' && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteKey(item.key)}
                        disabled={isSaving}
                        title={`Hapus ${item.key}`}
                        className="p-1.5 text-stone-500 hover:text-rose-700 hover:bg-rose-50 border border-stone-200 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Masked Current Value + Input Save Bar */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="flex-1 relative">
                    <input
                      type={item.isSecret ? 'password' : 'text'}
                      data-testid={`input-env-${item.key}`}
                      value={draftValues[item.key] ?? ''}
                      onChange={(e) =>
                        setDraftValues((prev) => ({ ...prev, [item.key]: e.target.value }))
                      }
                      placeholder={
                        item.maskedPreview
                          ? `Terisi (${item.maskedPreview}). Masukkan nilai baru untuk mengganti`
                          : item.placeholder
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus:bg-white focus:border-emerald-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveKey(item)}
                    disabled={isSaving || !(draftValues[item.key] || '').trim()}
                    data-testid={`btn-save-env-${item.key}`}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-500 rounded-lg transition-colors shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan & Sinkron'}</span>
                  </button>
                </div>

                {item.maskedPreview && (
                  <p className="text-[11px] font-mono text-stone-500">
                    Nilai aktif tersamar: <span className="text-stone-800">{item.maskedPreview}</span>
                    {item.updatedAt && (
                      <span>
                        {' '}
                        · Diperbarui {new Date(item.updatedAt).toLocaleString('id-ID')}
                      </span>
                    )}
                  </p>
                )}

                {/* Collapsible Step-by-Step Indonesian Guide */}
                {isGuideOpen && (
                  <div
                    data-testid={`guide-box-${item.key}`}
                    className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-stone-900">
                        Cara Mendapatkan &amp; Mengaktifkan {item.key}
                      </p>
                      {item.portalUrl && (
                        <a
                          href={item.portalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          <span>Buka Portal {item.serviceName}</span>
                          <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                        </a>
                      )}
                    </div>
                    <ol className="space-y-1.5 text-xs text-stone-700 list-decimal pl-4">
                      {item.guideSteps.map((step, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
