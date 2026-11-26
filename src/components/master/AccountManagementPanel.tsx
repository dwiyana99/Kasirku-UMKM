import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import {
  DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
  DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  formatIdleTimeoutLabel,
  IDLE_TIMEOUT_PRESETS,
} from '../../lib/auth/session-timeout';
import { ACTIVE_VERTICAL_DEFINITIONS } from '../../lib/verticals/vertical-registry';
import type {
  BillingCycle,
  BusinessVertical,
  CustomerAccountStatus,
  ManagedCustomerAccount,
  MasterAdminAccountSummary,
  SubscriptionPlanCode,
} from '../../types/domain';

interface CustomerAccountRow extends ManagedCustomerAccount {
  businessName: string;
  vertical: BusinessVertical;
  tenantSlug: string;
}

interface AuthInfraStatus {
  googleAuthConfigured: boolean;
  betterAuthSecretConfigured: boolean;
  databaseConfigured: boolean;
  betterAuthReady: boolean;
  baseURL: string;
  googleCallbackUrl: string;
  pgUserCount: number;
}

interface AccountsApiResponse {
  masterAccounts: MasterAdminAccountSummary[];
  realAccounts: CustomerAccountRow[];
  simulationAccounts?: CustomerAccountRow[];
  demoAccounts: CustomerAccountRow[];
  authInfraStatus: AuthInfraStatus;
  ok?: boolean;
  message?: string;
  error?: string;
}

type AccountScopeFilter = 'ALL' | 'REAL' | 'SIMULATION' | 'DEMO' | 'MASTER';
type AccountTypeKey = 'MASTER' | 'REAL' | 'SIMULATION' | 'DEMO';

interface UnifiedAccountItem {
  id: string;
  accountType: AccountTypeKey;
  fullName: string;
  username?: string;
  email: string;
  phone: string;
  status: string;
  allowGoogleLogin: boolean;
  allowPasswordLogin: boolean;
  isPrimaryOwner: boolean;
  businessName?: string;
  vertical?: BusinessVertical;
  subscriptionPlan?: SubscriptionPlanCode;
  billingCycle?: BillingCycle;
  demoExpiresAt?: string | null;
  demoPasswordHint?: string;
  maxTenantsAllowed?: number;
  idleTimeoutMinutes: number;
  notes: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Aktif',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  TRIAL: {
    label: 'Uji Coba',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  SUSPENDED: {
    label: 'Ditangguhkan',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  DEACTIVATED: {
    label: 'Nonaktif',
    className: 'bg-stone-200 text-stone-700 border-stone-300',
  },
  PENDING_PAYMENT: {
    label: 'Menunggu Bayar',
    className: 'bg-stone-100 text-stone-700 border-stone-200',
  },
};

function formatIndoDateShort(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AccountManagementPanel({
  authToken,
  currentMasterEmail,
  onOpenEnvSecrets,
  onImpersonateCustomer,
  onStartSimulationFlow,
  onAccountsMutated,
}: {
  authToken?: string;
  currentMasterEmail: string;
  onOpenEnvSecrets: () => void;
  onImpersonateCustomer: (customerId: string) => void;
  onStartSimulationFlow?: () => void;
  onAccountsMutated: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [syncingPg, setSyncingPg] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [copiedCallback, setCopiedCallback] = useState(false);

  const [masterAccounts, setMasterAccounts] = useState<MasterAdminAccountSummary[]>([]);
  const [realAccounts, setRealAccounts] = useState<CustomerAccountRow[]>([]);
  const [simulationAccounts, setSimulationAccounts] = useState<CustomerAccountRow[]>([]);
  const [demoAccounts, setDemoAccounts] = useState<CustomerAccountRow[]>([]);
  const [infraStatus, setInfraStatus] = useState<AuthInfraStatus | null>(null);
  const [resettingSimId, setResettingSimId] = useState<string | null>(null);

  const [scopeFilter, setScopeFilter] = useState<AccountScopeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Account Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newType, setNewType] = useState<AccountTypeKey>('REAL');
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAllowGoogle, setNewAllowGoogle] = useState(true);
  const [newAllowPassword, setNewAllowPassword] = useState(true);
  const [newIdleTimeout, setNewIdleTimeout] = useState<number>(DEFAULT_USER_IDLE_TIMEOUT_MINUTES);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newVertical, setNewVertical] = useState<BusinessVertical>('WARUNG_SEMBAKO');
  const [newPlan, setNewPlan] = useState<SubscriptionPlanCode>('PRO');
  const [newCycle, setNewCycle] = useState<BillingCycle>('MONTHLY');
  const [newDemoDays, setNewDemoDays] = useState('7');
  const [newNotes, setNewNotes] = useState('');

  // Edit & Reset Password Modal
  const [editTarget, setEditTarget] = useState<UnifiedAccountItem | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<string>('ACTIVE');
  const [editAllowGoogle, setEditAllowGoogle] = useState(true);
  const [editAllowPassword, setEditAllowPassword] = useState(true);
  const [editIdleTimeout, setEditIdleTimeout] = useState<number>(0);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editPlan, setEditPlan] = useState<SubscriptionPlanCode>('PRO');
  const [editExtendDemoDays, setEditExtendDemoDays] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<UnifiedAccountItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    }),
    [authToken],
  );

  const applyServerPayload = useCallback((data: AccountsApiResponse) => {
    setMasterAccounts(data.masterAccounts || []);
    setRealAccounts(data.realAccounts || []);
    setSimulationAccounts(data.simulationAccounts || []);
    setDemoAccounts(data.demoAccounts || []);
    if (data.authInfraStatus) {
      setInfraStatus(data.authInfraStatus);
    }
  }, []);

  const fetchDirectory = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/master/accounts', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setError(data.error || 'Gagal memuat daftar akun login.');
        return;
      }
      applyServerPayload(data);
    } catch {
      setError('Gagal terhubung ke server untuk memuat manajemen akun.');
    } finally {
      setLoading(false);
    }
  }, [applyServerPayload, authToken]);

  useEffect(() => {
    void fetchDirectory();
  }, [fetchDirectory]);

  const unifiedRows = useMemo<UnifiedAccountItem[]>(() => {
    const masters: UnifiedAccountItem[] = masterAccounts.map((m) => ({
      id: m.id,
      accountType: 'MASTER',
      fullName: m.fullName,
      username: m.username,
      email: m.email,
      phone: m.phone,
      status: m.status,
      allowGoogleLogin: m.allowGoogleLogin,
      allowPasswordLogin: m.allowPasswordLogin,
      isPrimaryOwner: m.isPrimaryOwner,
      idleTimeoutMinutes: m.idleTimeoutMinutes ?? DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
      notes: m.notes,
      lastLoginAt: m.lastLoginAt,
      createdAt: m.createdAt,
    }));

    const reals: UnifiedAccountItem[] = realAccounts.map((c) => ({
      id: c.id,
      accountType: 'REAL',
      fullName: c.fullName,
      username: c.username,
      email: c.email,
      phone: c.phone,
      status: c.status,
      allowGoogleLogin: c.allowGoogleLogin ?? true,
      allowPasswordLogin: c.allowPasswordLogin ?? true,
      isPrimaryOwner: false,
      businessName: c.businessName,
      vertical: c.vertical,
      subscriptionPlan: c.subscriptionPlan || 'BASIC',
      billingCycle: c.billingCycle,
      maxTenantsAllowed: c.maxTenantsAllowed,
      idleTimeoutMinutes: c.idleTimeoutMinutes ?? DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      notes: c.adminNotes,
      createdAt: c.createdAt,
    }));

    const sims: UnifiedAccountItem[] = simulationAccounts.map((c) => ({
      id: c.id,
      accountType: 'SIMULATION',
      fullName: c.fullName,
      username: c.username,
      email: c.email,
      phone: c.phone,
      status: c.status,
      allowGoogleLogin: c.allowGoogleLogin ?? true,
      allowPasswordLogin: c.allowPasswordLogin ?? true,
      isPrimaryOwner: false,
      businessName: c.businessName,
      vertical: c.vertical,
      subscriptionPlan: c.subscriptionPlan || 'PRO',
      billingCycle: c.billingCycle,
      maxTenantsAllowed: c.maxTenantsAllowed,
      idleTimeoutMinutes: c.idleTimeoutMinutes ?? DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      notes: c.adminNotes,
      createdAt: c.createdAt,
    }));

    const demos: UnifiedAccountItem[] = demoAccounts.map((c) => ({
      id: c.id,
      accountType: 'DEMO',
      fullName: c.fullName,
      username: c.username,
      email: c.email,
      phone: c.phone,
      status: c.status,
      allowGoogleLogin: c.allowGoogleLogin ?? true,
      allowPasswordLogin: c.allowPasswordLogin ?? true,
      isPrimaryOwner: false,
      businessName: c.businessName,
      vertical: c.vertical,
      subscriptionPlan: c.subscriptionPlan || 'PRO',
      billingCycle: c.billingCycle,
      demoExpiresAt: c.demoExpiresAt,
      demoPasswordHint: c.passwordDemo,
      maxTenantsAllowed: c.maxTenantsAllowed,
      idleTimeoutMinutes: c.idleTimeoutMinutes ?? DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      notes: c.adminNotes,
      createdAt: c.createdAt,
    }));

    return [...masters, ...reals, ...sims, ...demos];
  }, [demoAccounts, masterAccounts, realAccounts, simulationAccounts]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedRows.filter((row) => {
      if (scopeFilter !== 'ALL' && row.accountType !== scopeFilter) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.username || '').toLowerCase().includes(q) ||
        (row.businessName || '').toLowerCase().includes(q) ||
        (row.phone || '').toLowerCase().includes(q)
      );
    });
  }, [scopeFilter, searchQuery, unifiedRows]);

  const handleCopyCallback = async () => {
    if (!infraStatus?.googleCallbackUrl) return;
    try {
      await navigator.clipboard.writeText(infraStatus.googleCallbackUrl);
      setCopiedCallback(true);
      window.setTimeout(() => setCopiedCallback(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSyncPostgres = async () => {
    setSyncingPg(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch('/api/master/accounts/sync-postgres', {
        method: 'POST',
        headers: authHeaders,
      });
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setError(data.error || 'Gagal menyinkronkan akun ke Neon PostgreSQL.');
        return;
      }
      if (data.masterAccounts) applyServerPayload(data);
      if (data.ok === false) {
        setError(data.message || 'DATABASE_URL belum dikonfigurasi.');
      } else {
        setFeedback(data.message || 'Seluruh akun berhasil disinkronkan ke Neon PostgreSQL.');
      }
    } catch {
      setError('Gagal menghubungi endpoint sinkronisasi PostgreSQL.');
    } finally {
      setSyncingPg(false);
    }
  };

  const resetCreateForm = (defaultType: AccountTypeKey = 'REAL') => {
    setNewType(defaultType);
    setNewFullName('');
    setNewUsername('');
    setNewEmail('');
    setNewPhone('');
    setNewPassword('');
    setNewAllowGoogle(true);
    setNewAllowPassword(true);
    setNewIdleTimeout(
      defaultType === 'MASTER'
        ? DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES
        : DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
    );
    setNewBusinessName('');
    setNewVertical('WARUNG_SEMBAKO');
    setNewPlan(defaultType === 'DEMO' || defaultType === 'SIMULATION' ? 'PRO' : 'BASIC');
    setNewCycle('MONTHLY');
    setNewDemoDays('7');
    setNewNotes('');
    setCreateError('');
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setFeedback('');

    if (!newFullName.trim() || !newEmail.trim()) {
      setCreateError('Nama lengkap dan email wajib diisi.');
      return;
    }
    if (newAllowPassword && newPassword.length < 6) {
      setCreateError('Kata sandi minimal 6 karakter saat Login Email/Username & Sandi diaktifkan.');
      return;
    }
    if (!newAllowPassword && !newAllowGoogle) {
      setCreateError('Aktifkan minimal satu metode login (Email/Username & Sandi atau Google OAuth).');
      return;
    }

    setCreateSaving(true);
    try {
      const res = await fetch('/api/master/accounts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          accountType: newType,
          fullName: newFullName.trim(),
          username: newUsername.trim() || undefined,
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim(),
          password: newPassword || undefined,
          allowGoogleLogin: newAllowGoogle,
          allowPasswordLogin: newAllowPassword,
          idleTimeoutMinutes: Math.max(0, Math.min(1440, Math.round(newIdleTimeout || 0))),
          notes: newNotes.trim(),
          businessName: newType === 'MASTER' ? undefined : newBusinessName.trim() || undefined,
          vertical: newType === 'MASTER' ? undefined : newVertical,
          planCode: newType === 'MASTER' ? undefined : newPlan,
          billingCycle: newType === 'MASTER' ? undefined : newCycle,
          demoDurationDays: newType === 'DEMO' ? Number(newDemoDays) || 7 : undefined,
        }),
      });
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setCreateError(data.error || 'Gagal membuat akun login baru.');
        return;
      }
      applyServerPayload(data);
      setCreateOpen(false);
      setFeedback(data.message || 'Akun login baru berhasil ditambahkan.');
      await onAccountsMutated();
    } catch {
      setCreateError('Terjadi kendala saat menyimpan akun baru ke server.');
    } finally {
      setCreateSaving(false);
    }
  };

  const openEditModal = (item: UnifiedAccountItem) => {
    setEditTarget(item);
    setEditFullName(item.fullName);
    setEditUsername(item.username || '');
    setEditPhone(item.phone || '');
    setEditStatus(item.status);
    setEditAllowGoogle(item.allowGoogleLogin);
    setEditAllowPassword(item.allowPasswordLogin);
    setEditIdleTimeout(item.idleTimeoutMinutes);
    setEditNewPassword('');
    setEditPlan(item.subscriptionPlan || 'PRO');
    setEditExtendDemoDays('');
    setEditNotes(item.notes || '');
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError('');
    setFeedback('');

    if (editNewPassword.trim() && editNewPassword.trim().length < 6) {
      setEditError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (!editAllowGoogle && !editAllowPassword) {
      setEditError('Aktifkan minimal satu metode login (Google OAuth atau Email/Username & Sandi).');
      return;
    }

    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        fullName: editFullName.trim(),
        username: editUsername.trim(),
        phone: editPhone.trim(),
        status: editStatus as CustomerAccountStatus,
        allowGoogleLogin: editAllowGoogle,
        allowPasswordLogin: editAllowPassword,
        idleTimeoutMinutes: Math.max(0, Math.min(1440, Math.round(editIdleTimeout || 0))),
        notes: editNotes.trim(),
      };
      if (editNewPassword.trim()) {
        body.newPassword = editNewPassword.trim();
      }
      if (editTarget.accountType !== 'MASTER') {
        body.planCode = editPlan;
      }
      if (editTarget.accountType === 'DEMO' && Number(editExtendDemoDays) > 0) {
        body.extendDemoDays = Number(editExtendDemoDays);
      }

      const res = await fetch(
        `/api/master/accounts/${editTarget.accountType}/${encodeURIComponent(editTarget.id)}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setEditError(data.error || 'Gagal menyimpan perubahan akun.');
        return;
      }
      applyServerPayload(data);
      setEditTarget(null);
      setFeedback(data.message || 'Perubahan akun berhasil disimpan.');
      await onAccountsMutated();
    } catch {
      setEditError('Gagal menghubungi server saat menyimpan akun.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetSimulation = async (item: UnifiedAccountItem) => {
    setResettingSimId(item.id);
    setError('');
    setFeedback('');
    try {
      const res = await fetch(
        `/api/master/accounts/simulation/${encodeURIComponent(item.id)}/reset`,
        {
          method: 'POST',
          headers: authHeaders,
        },
      );
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setError(data.error || 'Gagal mereset data akun simulasi.');
        return;
      }
      applyServerPayload(data);
      setFeedback(data.message || `Data simulasi ${item.businessName || item.email} berhasil direset.`);
      await onAccountsMutated();
    } catch {
      setError('Gagal menghubungi server saat mereset akun simulasi.');
    } finally {
      setResettingSimId(null);
    }
  };

  const handleQuickToggleStatus = async (item: UnifiedAccountItem) => {
    setError('');
    setFeedback('');
    const nextStatus =
      item.status === 'SUSPENDED' || item.status === 'DEACTIVATED'
        ? item.accountType === 'DEMO'
          ? 'TRIAL'
          : 'ACTIVE'
        : 'SUSPENDED';

    try {
      const res = await fetch(
        `/api/master/accounts/${item.accountType}/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setError(data.error || 'Gagal mengubah status akun.');
        return;
      }
      applyServerPayload(data);
      setFeedback(data.message || `Status akun ${item.email} diperbarui.`);
      await onAccountsMutated();
    } catch {
      setError('Gagal memperbarui status akun.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch(
        `/api/master/accounts/${deleteTarget.accountType}/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: 'DELETE',
          headers: authHeaders,
        },
      );
      const data = (await res.json()) as AccountsApiResponse;
      if (!res.ok) {
        setError(data.error || 'Gagal menghapus akun.');
        setDeleteTarget(null);
        return;
      }
      applyServerPayload(data);
      setDeleteTarget(null);
      setFeedback(data.message || 'Akun berhasil dihapus.');
      await onAccountsMutated();
    } catch {
      setError('Gagal menghubungi server saat menghapus akun.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Better Auth + Neon PostgreSQL & Google OAuth Readiness Card */}
      <section
        data-testid="auth-infra-status-card"
        className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
              <span>Koneksi Better Auth · Neon PostgreSQL · Google OAuth</span>
            </h2>
            <p className="text-xs text-stone-600 max-w-[70ch]">
              Kelola akun login Master Admin, Akun Real (Berbayar), dan Akun Demo dalam satu tempat.
              Setiap akun dapat login memakai Email &amp; Sandi maupun Google OAuth melalui Better Auth
              yang tersinkron ke database Neon PostgreSQL.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="sync-accounts-postgres-btn"
              disabled={syncingPg}
              onClick={() => void handleSyncPostgres()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {syncingPg ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{syncingPg ? 'Menyinkronkan...' : 'Sinkron ke Neon PostgreSQL'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenEnvSecrets}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-stone-600" />
              <span>Atur Env Neon &amp; Google</span>
            </button>
          </div>
        </div>

        {infraStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-stone-100 text-xs">
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <p className="text-[11px] font-medium text-stone-500">Neon / PostgreSQL</p>
              <p
                className={`font-semibold ${
                  infraStatus.databaseConfigured ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {infraStatus.databaseConfigured ? 'Terhubung (Aktif)' : 'Belum Diisi di Env Vault'}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-stone-500">
                User PostgreSQL: {infraStatus.pgUserCount ?? 'Belum Terhubung'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <p className="text-[11px] font-medium text-stone-500">Better Auth Engine</p>
              <p
                className={`font-semibold ${
                  infraStatus.betterAuthReady ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {infraStatus.betterAuthReady ? 'Siap (Email & Sesi Aktif)' : 'Menunggu DATABASE_URL'}
              </p>
              <p className="text-[11px] text-stone-500">
                Secret: {infraStatus.betterAuthSecretConfigured ? 'Tersimpan' : 'Default Fallback'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <p className="text-[11px] font-medium text-stone-500">Login Google OAuth</p>
              <p
                className={`font-semibold ${
                  infraStatus.googleAuthConfigured ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {infraStatus.googleAuthConfigured ? 'Client ID & Secret Aktif' : 'Belum Dikonfigurasi'}
              </p>
              <p className="text-[11px] text-stone-500">
                {infraStatus.googleAuthConfigured
                  ? 'Siap dipakai user & master'
                  : 'Isi di Pengaturan API & Secret'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
              <p className="text-[11px] font-medium text-stone-500">Redirect URI Google Console</p>
              <div className="flex items-center justify-between gap-1.5">
                <code className="text-[10px] font-mono text-stone-800 truncate">
                  {infraStatus.googleCallbackUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyCallback()}
                  aria-label="Salin URL Callback Google OAuth"
                  className="p-1 text-stone-500 hover:text-stone-900 rounded shrink-0"
                >
                  {copiedCallback ? (
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-stone-500">
                Daftarkan URI ini di Google Cloud Console
              </p>
            </div>
          </div>
        )}
      </section>

      {feedback && (
        <div
          role="status"
          data-testid="accounts-feedback-banner"
          className="flex items-center gap-2 text-xs font-medium text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="accounts-error-banner"
          className="flex items-center gap-2 text-xs font-medium text-rose-900 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Account Directory Table Card */}
      <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Scope Tabs */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist">
            {(
              [
                { id: 'ALL', label: `Semua (${unifiedRows.length})` },
                { id: 'REAL', label: `Akun Real (${realAccounts.length})` },
                { id: 'SIMULATION', label: `Akun Simulasi (${simulationAccounts.length})` },
                { id: 'DEMO', label: `Akun Demo (${demoAccounts.length})` },
                { id: 'MASTER', label: `Master Admin (${masterAccounts.length})` },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                role="tab"
                aria-selected={scopeFilter === tabItem.id}
                data-testid={`accounts-filter-${tabItem.id.toLowerCase()}`}
                onClick={() => setScopeFilter(tabItem.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  scopeFilter === tabItem.id
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>

          {/* Search & Add Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, username, email..."
                className="w-full sm:w-64 pl-8 pr-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            {onStartSimulationFlow && (
              <button
                type="button"
                data-testid="start-simulation-from-scratch-btn"
                onClick={onStartSimulationFlow}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Mulai Simulasi Dari Awal</span>
              </button>
            )}
            <button
              type="button"
              data-testid="add-login-account-btn"
              onClick={() => {
                resetCreateForm(
                  scopeFilter === 'MASTER'
                    ? 'MASTER'
                    : scopeFilter === 'SIMULATION'
                    ? 'SIMULATION'
                    : scopeFilter === 'DEMO'
                    ? 'DEMO'
                    : 'REAL',
                );
                setCreateOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Akun Login</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-stone-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            <span>Memuat direktori akun login...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-xs text-stone-500 space-y-2">
            <Users className="w-6 h-6 text-stone-300 mx-auto" />
            <p>Belum ada akun login yang cocok dengan pencarian Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              data-testid="master-accounts-table"
              className="w-full text-left border-collapse text-xs"
            >
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  <th className="py-3 px-4">Pemilik / Email Login</th>
                  <th className="py-3 px-4">Tipe &amp; Ruang Kerja</th>
                  <th className="py-3 px-4">Metode Login</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredRows.map((row) => {
                  const st = STATUS_LABELS[row.status] || {
                    label: row.status,
                    className: 'bg-stone-100 text-stone-700 border-stone-200',
                  };
                  const isCurrentActor =
                    row.accountType === 'MASTER' &&
                    row.email.toLowerCase() === currentMasterEmail.toLowerCase();

                  return (
                    <tr
                      key={`${row.accountType}-${row.id}`}
                      data-testid={`account-row-${row.email}`}
                      className="hover:bg-stone-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-stone-900">{row.fullName}</span>
                          {row.isPrimaryOwner && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-900 text-white">
                              Pemilik Utama
                            </span>
                          )}
                          {isCurrentActor && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Sesi Aktif
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-stone-600 mt-0.5">{row.email}</p>
                        {row.username && (
                          <p className="font-mono text-[11px] text-emerald-700 mt-0.5">
                            Username: @{row.username}
                          </p>
                        )}
                        {row.phone && (
                          <p className="font-mono tabular-nums text-[11px] text-stone-400 mt-0.5">
                            WA/HP: {row.phone}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              row.accountType === 'MASTER'
                                ? 'bg-stone-900 text-white border-stone-900'
                                : row.accountType === 'SIMULATION'
                                ? 'bg-stone-100 text-stone-900 border-stone-300'
                                : row.accountType === 'DEMO'
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            }`}
                          >
                            {row.accountType === 'MASTER'
                              ? 'MASTER ADMIN'
                              : row.accountType === 'SIMULATION'
                              ? 'AKUN SIMULASI'
                              : row.accountType === 'DEMO'
                              ? 'AKUN DEMO'
                              : 'AKUN REAL'}
                          </span>
                          {row.subscriptionPlan && row.accountType !== 'MASTER' && (
                            <span className="text-[10px] font-mono font-semibold text-stone-600">
                              {row.subscriptionPlan}
                            </span>
                          )}
                        </div>
                        {row.accountType === 'MASTER' ? (
                          <p className="text-[11px] text-stone-500 mt-1">
                            Konsol Master &amp; Manajemen Tenant
                          </p>
                        ) : (
                          <div className="mt-1 space-y-0.5">
                            <p className="font-medium text-stone-800">
                              {row.businessName || 'Usaha UMKM'}
                            </p>
                            {row.accountType === 'SIMULATION' && (
                              <p className="text-[11px] text-stone-500">
                                Ruang kerja terisolasi setara Real (Rp 0 MRR)
                              </p>
                            )}
                            {row.accountType === 'DEMO' && row.demoExpiresAt && (
                              <p className="text-[11px] text-stone-500 tabular-nums">
                                Berlaku s/d {formatIndoDateShort(row.demoExpiresAt)}
                                {row.demoPasswordHint ? ` · Sandi Demo: ${row.demoPasswordHint}` : ''}
                              </p>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="space-y-1 text-[11px]">
                          <p
                            className={
                              row.allowPasswordLogin ? 'text-stone-800 font-medium' : 'text-stone-400'
                            }
                          >
                            Email / Username: {row.allowPasswordLogin ? 'Aktif' : 'Nonaktif'}
                          </p>
                          <p
                            className={
                              row.allowGoogleLogin ? 'text-emerald-700 font-medium' : 'text-stone-400'
                            }
                          >
                            Google OAuth: {row.allowGoogleLogin ? 'Diizinkan' : 'Diblokir'}
                          </p>
                          <p className="text-stone-500 font-mono tabular-nums">
                            Auto-Logout: {formatIdleTimeoutLabel(row.idleTimeoutMinutes)}
                          </p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            aria-label={`Edit & Reset Sandi ${row.email}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-stone-800 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit / Sandi</span>
                          </button>

                          {row.accountType === 'SIMULATION' && (
                            <button
                              type="button"
                              disabled={resettingSimId === row.id}
                              onClick={() => void handleResetSimulation(row)}
                              title="Reset transaksi & stok simulasi kembali bersih"
                              className="px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors disabled:opacity-60"
                            >
                              {resettingSimId === row.id ? 'Mereset...' : 'Reset Data'}
                            </button>
                          )}

                          {!isCurrentActor && (
                            <button
                              type="button"
                              onClick={() => void handleQuickToggleStatus(row)}
                              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                                row.status === 'SUSPENDED' || row.status === 'DEACTIVATED'
                                  ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                  : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
                              }`}
                            >
                              {row.status === 'SUSPENDED' || row.status === 'DEACTIVATED'
                                ? 'Aktifkan'
                                : 'Tangguhkan'}
                            </button>
                          )}

                          {row.accountType !== 'MASTER' && (
                            <button
                              type="button"
                              onClick={() => onImpersonateCustomer(row.id)}
                              aria-label={`Buka Ruang Kerja ${row.email}`}
                              title="Masuk ke Ruang Kerja Usaha ini"
                              className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          )}

                          {!isCurrentActor && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              aria-label={`Hapus Akun ${row.email}`}
                              className="p-1.5 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal Tambah Akun Login Baru */}
      <ModalShell
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        headerId="create-account-modal-title"
        testId="create-account-modal"
        title="Tambah Akun Login Baru (Real / Simulasi / Demo / Master)"
        subtitle="Akun langsung bisa dipakai login via Google OAuth maupun Username/Email + Sandi."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
          {createError && (
            <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          <div>
            <span className="block text-xs font-semibold text-stone-700 mb-1.5">
              Tipe Akun Login
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'REAL', label: 'Akun Real', desc: 'Usaha berbayar' },
                  { id: 'SIMULATION', label: 'Akun Simulasi', desc: 'Setara Real, Rp 0' },
                  { id: 'DEMO', label: 'Akun Demo', desc: 'Uji coba terbatas' },
                  { id: 'MASTER', label: 'Master Admin', desc: 'Pengelola sistem' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`new-account-type-${opt.id.toLowerCase()}`}
                  onClick={() => {
                    setNewType(opt.id);
                    setNewIdleTimeout(
                      opt.id === 'MASTER'
                        ? DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES
                        : DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
                    );
                  }}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    newType === opt.id
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                      : 'border-stone-200 bg-white hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-acc-name" className="block text-xs font-semibold text-stone-700 mb-1">
                Nama Lengkap *
              </label>
              <input
                id="new-acc-name"
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nama pemilik atau admin"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="new-acc-username" className="block text-xs font-semibold text-stone-700 mb-1">
                Username Login (Opsional)
              </label>
              <input
                id="new-acc-username"
                type="text"
                data-testid="input-new-account-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="contoh: toko_berkah (otomatis jika kosong)"
                className="w-full px-3 py-2 text-sm font-mono border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-acc-email" className="block text-xs font-semibold text-stone-700 mb-1">
                Email Login (Google / Email) *
              </label>
              <input
                id="new-acc-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="nama@gmail.com"
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="new-acc-phone" className="block text-xs font-semibold text-stone-700 mb-1">
                No. WhatsApp / HP (Untuk pemulihan akun)
              </label>
              <input
                id="new-acc-phone"
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-acc-pass" className="block text-xs font-semibold text-stone-700 mb-1">
              Kata Sandi {newAllowPassword ? '*' : '(Opsional)'}
            </label>
            <input
              id="new-acc-pass"
              type="password"
              required={newAllowPassword}
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>

          {newType !== 'MASTER' && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-acc-biz" className="block text-xs font-semibold text-stone-700 mb-1">
                    Nama Usaha UMKM
                  </label>
                  <input
                    id="new-acc-biz"
                    type="text"
                    value={newBusinessName}
                    onChange={(e) => setNewBusinessName(e.target.value)}
                    placeholder="Contoh: Kedai Kopi Nusantara"
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="new-acc-vertical" className="block text-xs font-semibold text-stone-700 mb-1">
                    Jenis Usaha (22 Bidang UMKM)
                  </label>
                  <select
                    id="new-acc-vertical"
                    value={newVertical}
                    onChange={(e) => setNewVertical(e.target.value as BusinessVertical)}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                  >
                    {ACTIVE_VERTICAL_DEFINITIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-acc-plan" className="block text-xs font-semibold text-stone-700 mb-1">
                    Paket Fitur
                  </label>
                  <select
                    id="new-acc-plan"
                    value={newPlan}
                    onChange={(e) => setNewPlan(e.target.value as SubscriptionPlanCode)}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                  >
                    <option value="LITE">LITE (Kasir &amp; Stok Dasar)</option>
                    <option value="BASIC">BASIC (Pembukuan &amp; Pajak UMKM)</option>
                    <option value="PRO">PRO (Multi-Cabang &amp; Inventori Lanjut)</option>
                    <option value="EXPERT">EXPERT (Audit Lengkap &amp; Coretax)</option>
                  </select>
                </div>
                {newType === 'DEMO' ? (
                  <div>
                    <label htmlFor="new-acc-demo-days" className="block text-xs font-semibold text-stone-700 mb-1">
                      Masa Berlaku Demo (Hari)
                    </label>
                    <input
                      id="new-acc-demo-days"
                      type="number"
                      min={1}
                      max={90}
                      value={newDemoDays}
                      onChange={(e) => setNewDemoDays(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg"
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="new-acc-cycle" className="block text-xs font-semibold text-stone-700 mb-1">
                      Siklus Langganan
                    </label>
                    <select
                      id="new-acc-cycle"
                      value={newCycle}
                      onChange={(e) => setNewCycle(e.target.value as BillingCycle)}
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                    >
                      <option value="MONTHLY">Bulanan</option>
                      <option value="ANNUAL">Tahunan (Hemat 15%)</option>
                    </select>
                  </div>
                )}
              </div>

              {newType === 'SIMULATION' && (
                <p className="pt-1 text-[11px] text-stone-600 leading-relaxed">
                  Akun Simulasi selalu dimulai <strong>100% kosong</strong> (0 produk, 0 transaksi,
                  modal Rp 0) seperti usaha baru pertama kali — tanpa data dummy dan Rp 0 tagihan.
                </p>
              )}
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="new-acc-timeout" className="text-xs font-semibold text-stone-800">
                Batas Waktu Sesi (Auto-Logout Tidak Aktif)
              </label>
              <span className="font-mono text-[11px] text-stone-600">
                {formatIdleTimeoutLabel(newIdleTimeout)}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <select
                id="new-acc-timeout"
                value={
                  IDLE_TIMEOUT_PRESETS.some((p) => p.minutes === newIdleTimeout)
                    ? String(newIdleTimeout)
                    : 'CUSTOM'
                }
                onChange={(e) =>
                  setNewIdleTimeout(e.target.value === 'CUSTOM' ? 45 : Number(e.target.value))
                }
                className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
              >
                {IDLE_TIMEOUT_PRESETS.map((p) => (
                  <option key={p.minutes} value={String(p.minutes)}>
                    {p.label}
                  </option>
                ))}
                <option value="CUSTOM">Durasi Kustom (Menit)...</option>
              </select>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={newIdleTimeout}
                  onChange={(e) => setNewIdleTimeout(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg"
                />
                <span className="text-[11px] text-stone-500 shrink-0">menit (0 = mati)</span>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-start gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={newAllowPassword}
                onChange={(e) => setNewAllowPassword(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-emerald-600"
              />
              <span>
                <strong className="block text-stone-900">Login Email &amp; Sandi</strong>
                <span className="text-[11px] text-stone-500">
                  Verifikasi via Better Auth &amp; scrypt hash
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={newAllowGoogle}
                onChange={(e) => setNewAllowGoogle(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-emerald-600"
              />
              <span>
                <strong className="block text-stone-900">Login Google OAuth</strong>
                <span className="text-[11px] text-stone-500">
                  Izinkan masuk 1-klik dengan email Google ini
                </span>
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="new-acc-notes" className="block text-xs font-semibold text-stone-700 mb-1">
              Catatan Admin (Opsional)
            </label>
            <input
              id="new-acc-notes"
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Catatan internal pengelola"
              className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="submit-create-account-btn"
              disabled={createSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-60"
            >
              {createSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{createSaving ? 'Menyimpan...' : 'Simpan & Aktifkan Akun'}</span>
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Modal Edit & Reset Password */}
      <ModalShell
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        headerId="edit-account-modal-title"
        testId="edit-account-modal"
        title={`Edit Akun & Reset Sandi: ${editTarget?.fullName || ''}`}
        subtitle={editTarget?.email}
        maxWidthClass="max-w-lg"
      >
        {editTarget && (
          <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
            {editError && (
              <div className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-acc-name" className="block text-xs font-semibold text-stone-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  id="edit-acc-name"
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="edit-acc-username" className="block text-xs font-semibold text-stone-700 mb-1">
                  Username Login
                </label>
                <input
                  id="edit-acc-username"
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="username_akun"
                  className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-acc-phone" className="block text-xs font-semibold text-stone-700 mb-1">
                No. WhatsApp / HP
              </label>
              <input
                id="edit-acc-phone"
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-acc-status" className="block text-xs font-semibold text-stone-700 mb-1">
                  Status Akses Login
                </label>
                <select
                  id="edit-acc-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  <option value="ACTIVE">Aktif</option>
                  {editTarget.accountType !== 'MASTER' && <option value="TRIAL">Uji Coba (Trial)</option>}
                  <option value="SUSPENDED">Ditangguhkan (Blokir Login)</option>
                  {editTarget.accountType !== 'MASTER' && (
                    <option value="DEACTIVATED">Nonaktif Permanen</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="edit-acc-pw" className="block text-xs font-semibold text-stone-700 mb-1">
                  Reset Kata Sandi Baru (Opsional)
                </label>
                <input
                  id="edit-acc-pw"
                  type="password"
                  minLength={6}
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Kosongkan jika tidak diubah"
                  className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
                />
              </div>
            </div>

            {editTarget.accountType !== 'MASTER' && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-acc-plan" className="block text-xs font-semibold text-stone-700 mb-1">
                    Paket Langganan
                  </label>
                  <select
                    id="edit-acc-plan"
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value as SubscriptionPlanCode)}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                  >
                    <option value="LITE">LITE</option>
                    <option value="BASIC">BASIC</option>
                    <option value="PRO">PRO</option>
                    <option value="EXPERT">EXPERT</option>
                  </select>
                </div>
                {editTarget.accountType === 'DEMO' && (
                  <div>
                    <label htmlFor="edit-acc-extend" className="block text-xs font-semibold text-stone-700 mb-1">
                      Perpanjang Demo (+Hari)
                    </label>
                    <input
                      id="edit-acc-extend"
                      type="number"
                      min={0}
                      max={365}
                      value={editExtendDemoDays}
                      onChange={(e) => setEditExtendDemoDays(e.target.value)}
                      placeholder="Contoh: 7 atau 30"
                      className="w-full px-3 py-2 text-xs font-mono border border-stone-200 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAllowPassword}
                  onChange={(e) => setEditAllowPassword(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-600"
                />
                <span className="font-medium text-stone-800">Izinkan Email &amp; Sandi</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAllowGoogle}
                  onChange={(e) => setEditAllowGoogle(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-600"
                />
                <span className="font-medium text-stone-800">Izinkan Google OAuth</span>
              </label>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="edit-acc-timeout" className="text-xs font-semibold text-stone-800">
                  Batas Waktu Sesi (Auto-Logout Tidak Aktif)
                </label>
                <span className="font-mono text-[11px] text-stone-600">
                  {formatIdleTimeoutLabel(editIdleTimeout)}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                <select
                  id="edit-acc-timeout"
                  data-testid="edit-account-timeout-select"
                  value={
                    IDLE_TIMEOUT_PRESETS.some((p) => p.minutes === editIdleTimeout)
                      ? String(editIdleTimeout)
                      : 'CUSTOM'
                  }
                  onChange={(e) =>
                    setEditIdleTimeout(e.target.value === 'CUSTOM' ? 45 : Number(e.target.value))
                  }
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  {IDLE_TIMEOUT_PRESETS.map((p) => (
                    <option key={p.minutes} value={String(p.minutes)}>
                      {p.label}
                    </option>
                  ))}
                  <option value="CUSTOM">Durasi Kustom (Menit)...</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={editIdleTimeout}
                    onChange={(e) => setEditIdleTimeout(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg"
                  />
                  <span className="text-[11px] text-stone-500 shrink-0">menit (0 = mati)</span>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="edit-acc-notes" className="block text-xs font-semibold text-stone-700 mb-1">
                Catatan Admin
              </label>
              <input
                id="edit-acc-notes"
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
              />
            </div>

            <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="submit-edit-account-btn"
                disabled={editSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg disabled:opacity-60"
              >
                {editSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editSaving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* Modal Konfirmasi Hapus Akun */}
      <ModalShell
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        headerId="delete-account-modal-title"
        testId="delete-account-modal"
        title="Hapus Akun Login?"
        subtitle={deleteTarget?.email}
        maxWidthClass="max-w-md"
      >
        {deleteTarget && (
          <div className="p-6 space-y-4 text-xs">
            <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
              <ShieldCheck className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Akun <strong>{deleteTarget.fullName}</strong> ({deleteTarget.email}) beserta akses
                login di aplikasi dan PostgreSQL akan dihapus permanen. Tindakan ini tidak dapat
                dibatalkan.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
              >
                Batal
              </button>
              <button
                type="button"
                data-testid="confirm-delete-account-btn"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-60"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleting ? 'Menghapus...' : 'Ya, Hapus Akun'}</span>
              </button>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
