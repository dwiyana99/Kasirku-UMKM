import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Database,
  FileSignature,
  Globe,
  KeyRound,
  Landmark,
  LogOut,
  Menu,
  MessageSquareText,
  Play,
  Settings2,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { AccountModal } from '../components/AccountModal';
import { AccountManagementPanel } from '../components/master/AccountManagementPanel';
import { ContractTemplatesPanel } from '../components/master/ContractTemplatesPanel';
import { DemoControlPanel } from '../components/master/DemoControlPanel';
import { EnvSecretsPanel } from '../components/master/EnvSecretsPanel';
import { InfraMigrationPanel } from '../components/master/InfraMigrationPanel';
import { MasterLandingPagesPanel } from '../components/master/MasterLandingPagesPanel';
import { RegionalTaxPanel } from '../components/master/RegionalTaxPanel';
import { WaTemplatesPanel } from '../components/master/WaTemplatesPanel';
import { PaymentAssistancePanel } from '../components/master/PaymentAssistancePanel';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { useApp } from '../context/AppContext';
import { FEATURE_MODULES } from '../data/seedData';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  formatIdleTimeoutLabel,
  IDLE_TIMEOUT_PRESETS,
} from '../lib/auth/session-timeout';
import {
  calculatePlatformMrrSummary,
  calculateSubscriptionPricing,
} from '../lib/saas/onboarding-service';
import type {
  BillingCycle,
  CustomerAccountStatus,
  FeatureModule,
  ManagedCustomerAccount,
  TaxEntityType,
} from '../types/domain';

const STATUS_META: Record<
  CustomerAccountStatus,
  { label: string; badgeClass: string }
> = {
  ACTIVE: {
    label: 'Aktif Lunas',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  TRIAL: {
    label: 'Masa Uji Coba',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  SUSPENDED: {
    label: 'Ditangguhkan',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  DEACTIVATED: {
    label: 'Nonaktif',
    badgeClass: 'bg-stone-200 text-stone-700 border-stone-300',
  },
  PENDING_PAYMENT: {
    label: 'Menunggu Bayar',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  },
};

export function MasterConsolePage() {
  const {
    navigate,
    session,
    customers,
    workspaces,
    updateManagedCustomer,
    updateTenantStaffIdleTimeout,
    deactivateManagedCustomer,
    reactivateManagedCustomer,
    impersonateCustomer,
    refreshMasterBootstrap,
    logoutSession,
  } = useApp();

  const [masterTab, setMasterTab] = useState<
    | 'CUSTOMERS'
    | 'ACCOUNTS'
    | 'LANDING_PAGES'
    | 'DEMO_CONTROL'
    | 'REGIONAL_TAX'
    | 'CONTRACT_TEMPLATES'
    | 'PAYMENT_ASSIST'
    | 'WA_TEMPLATES'
    | 'ENV_SECRETS'
    | 'INFRA_MIGRATION'
  >('CUSTOMERS');
  const [pendingLandingAssistCount, setPendingLandingAssistCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerAccountStatus>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  // Editable per-user form state
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<CustomerAccountStatus>('ACTIVE');
  const [editBillingCycle, setEditBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [editModules, setEditModules] = useState<FeatureModule['code'][]>(['POS_BASIC']);
  const [editMaxTenants, setEditMaxTenants] = useState('3');
  const [editIdleTimeoutMinutes, setEditIdleTimeoutMinutes] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');
  // Per-user tenant operational settings
  const [editTaxEntity, setEditTaxEntity] = useState<TaxEntityType>('WP_OP');
  const [editIsPkp, setEditIsPkp] = useState(false);
  const [editThermalWidth, setEditThermalWidth] = useState<'58mm' | '80mm'>('80mm');
  const [editAutoPrint, setEditAutoPrint] = useState(true);
  const [editMdrPct, setEditMdrPct] = useState('0.7');
  const [editServicePct, setEditServicePct] = useState('0');

  const summary = useMemo(() => calculatePlatformMrrSummary(customers), [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      return true;
    });
  }, [customers, statusFilter]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const openUserSettings = (cust: ManagedCustomerAccount) => {
    const ws = workspaces.find((w) => w.tenant.id === cust.primaryTenantId);
    setSelectedCustomerId(cust.id);
    setEditFullName(cust.fullName);
    setEditPhone(cust.phone);
    setEditStatus(cust.status);
    setEditBillingCycle(cust.billingCycle);
    setEditModules(cust.activeModules);
    setEditMaxTenants(String(cust.maxTenantsAllowed));
    setEditIdleTimeoutMinutes(cust.idleTimeoutMinutes ?? 0);
    setEditNotes(cust.adminNotes);

    if (ws) {
      setEditTaxEntity(ws.tenant.taxEntity);
      setEditIsPkp(ws.tenant.isPkp);
      setEditThermalWidth(ws.tenant.settings.thermalPaperWidth);
      setEditAutoPrint(ws.tenant.settings.autoPrintQrOrders);
      setEditMdrPct(new Decimal(ws.tenant.settings.qrisMdrRate || '0.007').times(100).toFixed(2));
      setEditServicePct(new Decimal(ws.tenant.serviceChargeRate || '0').times(100).toFixed(1));
    }
    setSaveFeedback('');
  };

  const toggleEditModule = (code: FeatureModule['code']) => {
    if (code === 'POS_BASIC') return;
    setEditModules((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code]
    );
  };

  const previewPricing = useMemo(
    () => calculateSubscriptionPricing(editModules, editBillingCycle),
    [editModules, editBillingCycle]
  );

  const handleSaveUserSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const mdrRateDec = Decimal.max(
      new Decimal(0),
      Decimal.min(new Decimal('0.1'), new Decimal(editMdrPct || '0.7').div(100))
    );
    const serviceRateDec = Decimal.max(
      new Decimal(0),
      Decimal.min(new Decimal('0.25'), new Decimal(editServicePct || '0').div(100))
    );

    updateManagedCustomer(
      selectedCustomer.id,
      {
        fullName: editFullName,
        phone: editPhone,
        status: editStatus,
        billingCycle: editBillingCycle,
        activeModules: editModules,
        maxTenantsAllowed: Number(editMaxTenants) || 1,
        idleTimeoutMinutes: editIdleTimeoutMinutes,
        adminNotes: editNotes,
      },
      {
        taxEntity: editTaxEntity,
        isPkp: editIsPkp,
        thermalPaperWidth: editThermalWidth,
        autoPrintQrOrders: editAutoPrint,
        qrisMdrRate: mdrRateDec.toFixed(4),
        serviceChargeRate: serviceRateDec.toFixed(4),
      }
    );

    setSaveFeedback(`Pengaturan akun ${editFullName} berhasil disimpan dan langsung aktif.`);
  };

  // Master authentication guard
  if (session.role !== 'MASTER_ADMIN') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-900">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Akses Khusus Master Pemilik</h1>
          <p className="text-sm text-slate-500">
            Silakan masuk menggunakan kredensial Master Admin untuk mengelola semua user pembeli
            paket dan pengaturan masing-masing akun UMKM.
          </p>
          <button
            type="button"
            onClick={() => navigate('/master/login')}
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Ke Halaman Login Master
          </button>
        </div>
      </div>
    );
  }

  const sectionTitleMap: Record<typeof masterTab, { title: string; subtitle: string }> = {
    CUSTOMERS: {
      title: 'Pelanggan & Pengaturan Per User',
      subtitle:
        'Pantau seluruh pengguna berbayar, atur paket aktif, status akun, batas cabang, dan parameter operasional.',
    },
    ACCOUNTS: {
      title: 'Manajemen Akun Login (Demo, Real & Master)',
      subtitle:
        'Kelola seluruh akun login Master Admin, Akun Usaha Asli, Akun Demo, akses Google OAuth, dan sinkronisasi Neon PostgreSQL.',
    },
    LANDING_PAGES: {
      title: 'Landing Page UMKM & Bantuan Kustomisasi Gratis',
      subtitle:
        'Kelola tiket bantuan kustomisasi gratis dari UMKM atau bantu menyetel, pratinjau, dan menerbitkan Landing Page secara proaktif.',
    },
    DEMO_CONTROL: {
      title: 'Kontrol Demo & Persetujuan Jadwal',
      subtitle:
        'Atur visibilitas demo untuk 22 bidang UMKM, kebijakan wajib daftar, durasi masa uji coba, dan permintaan jadwal.',
    },
    REGIONAL_TAX: {
      title: 'Pajak Daerah Indonesia (PBJT / UU HKPD)',
      subtitle:
        'Kelola tarif PBJT 38+ Kota/Kabupaten (Makanan, Homestay/Villa, SPA, Parkir) dan sinkronkan otomatis ke tenant sesuai domisili.',
    },
    CONTRACT_TEMPLATES: {
      title: 'Master Template Kontrak Digital',
      subtitle:
        'Kelola template standar kontrak sewa kendaraan, properti, jasa proyek, dan layanan rutin untuk seluruh pelanggan UMKM.',
    },
    PAYMENT_ASSIST: {
      title: 'Pembayaran Non-Tunai User (Terpisah Per Akun)',
      subtitle:
        'Atur langsung Midtrans, Duitku, Tripay, atau Transfer per akun usaha tanpa perlu menunggu request. Kunci API & webhook terenkripsi dan 100% terisolasi.',
    },
    WA_TEMPLATES: {
      title: 'Template Pesan WhatsApp Custom',
      subtitle:
        'Kelola template pesan WA dinamis dengan variabel otomatis & live preview untuk seluruh tim support.',
    },
    ENV_SECRETS: {
      title: 'API, Secret & Diagnostik Lingkungan',
      subtitle:
        'Kelola variabel API serta bandingkan kesiapan runtime Vercel, Brankas Neon, dan konfigurasi lokal secara transparan.',
    },
    INFRA_MIGRATION: {
      title: 'Migrasi Database, Storage & Sinkronisasi',
      subtitle:
        'Kelola kesiapan Neon PostgreSQL, Object Storage, Better Auth, Google OAuth, dan pemindahan server ke VPS atau cloud lain.',
    },
  };

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMasterTab('CUSTOMERS')}
          className="flex items-center gap-2.5 text-left"
        >
          <span className="w-8 h-8 rounded-lg bg-stone-900 text-emerald-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900 leading-tight truncate">KasirAkun</p>
            <p className="text-[11px] text-emerald-700 font-semibold leading-tight">
              Konsol Master Admin
            </p>
          </div>
        </button>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Tutup menu master"
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Clean 3-Group Master Navigation */}
      <nav
        aria-label="Navigasi Master Admin"
        data-testid="master-sidebar-nav"
        className="flex-1 overflow-y-auto px-3 py-5 space-y-6"
      >
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Pelanggan &amp; Akun
          </p>
          <button
            type="button"
            data-testid="master-tab-customers"
            onClick={() => {
              setMasterTab('CUSTOMERS');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'CUSTOMERS'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Users className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              <span className="truncate">Pelanggan &amp; Langganan</span>
            </span>
            <span className="text-[11px] font-mono tabular-nums text-stone-500">
              {customers.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="master-tab-accounts"
            onClick={() => {
              setMasterTab('ACCOUNTS');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'ACCOUNTS'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <UserCheck className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              <span className="truncate">Akun Login &amp; Simulasi</span>
            </span>
          </button>

          <button
            type="button"
            data-testid="master-tab-demo-control"
            onClick={() => {
              setMasterTab('DEMO_CONTROL');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'DEMO_CONTROL'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <Play className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Kontrol Demo &amp; Jadwal</span>
          </button>
        </div>

        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Layanan UMKM
          </p>
          <button
            type="button"
            data-testid="master-tab-landing-pages"
            onClick={() => {
              setMasterTab('LANDING_PAGES');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'LANDING_PAGES'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Globe className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              <span className="truncate">Landing Page UMKM</span>
            </span>
            {pendingLandingAssistCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] tabular-nums">
                {pendingLandingAssistCount}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="master-tab-regional-tax"
            onClick={() => {
              setMasterTab('REGIONAL_TAX');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'REGIONAL_TAX'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <Landmark className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Pajak Daerah (PBJT)</span>
          </button>

          <button
            type="button"
            data-testid="master-tab-contract-templates"
            onClick={() => {
              setMasterTab('CONTRACT_TEMPLATES');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'CONTRACT_TEMPLATES'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <FileSignature className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Template Kontrak Digital</span>
          </button>

          <button
            type="button"
            data-testid="master-tab-payment-assist"
            onClick={() => {
              setMasterTab('PAYMENT_ASSIST');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'PAYMENT_ASSIST'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <Wrench className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Pembayaran Non-Tunai User</span>
          </button>

          <button
            type="button"
            data-testid="master-tab-wa-templates"
            onClick={() => {
              setMasterTab('WA_TEMPLATES');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'WA_TEMPLATES'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <MessageSquareText className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Template Pesan WA</span>
          </button>
        </div>

        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
            Sistem &amp; Cloud
          </p>
          <button
            type="button"
            data-testid="master-tab-env-secrets"
            onClick={() => {
              setMasterTab('ENV_SECRETS');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'ENV_SECRETS'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <KeyRound className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">API, Secret &amp; Diagnostik</span>
          </button>
          <button
            type="button"
            data-testid="master-tab-infra-migration"
            onClick={() => {
              setMasterTab('INFRA_MIGRATION');
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
              masterTab === 'INFRA_MIGRATION'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-transparent'
            }`}
          >
            <Database className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
            <span className="truncate">Migrasi DB, Storage &amp; Sync</span>
          </button>
        </div>
      </nav>

      {/* Sidebar Account Footer */}
      <div className="p-4 border-t border-stone-200 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => setAccountModalOpen(true)}
          data-testid="master-account-btn"
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors"
        >
          <UserCog className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-stone-900 truncate">Akun Master</p>
            <p className="text-[11px] text-stone-500 truncate">{session.email}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={async () => {
            await logoutSession();
            navigate('/master/login');
          }}
          data-testid="master-logout-btn"
          aria-label="Keluar Master Admin"
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 flex">
      {/* Desktop Master Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-stone-200 z-30">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full shadow-xl z-10 flex flex-col">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean Top Header Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-stone-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka navigasi master"
              className="lg:hidden p-2 -ml-2 text-stone-600 hover:text-stone-900 rounded-lg"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-stone-900 truncate leading-tight">
                {sectionTitleMap[masterTab].title}
              </h1>
              <p className="text-xs text-stone-500 hidden md:block truncate">
                {sectionTitleMap[masterTab].subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-stone-600 bg-stone-100 px-3 py-1.5 rounded-lg">
              MRR: <strong className="text-emerald-700">{formatRupiah(summary.totalMrr)}</strong>
            </span>
          </div>
        </header>

        <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Show Executive SaaS KPIs on Customers Overview (Hairline Divided Warm Stone Strip) */}
          {masterTab === 'CUSTOMERS' && (
            <section className="bg-white border border-stone-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
              <div className="p-5">
                <p className="text-xs font-medium text-stone-500">Total MRR Langganan Aktif</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
                  {formatRupiah(summary.totalMrr)}
                </p>
                <p className="text-xs text-stone-500 mt-1">Pendapatan berulang bulanan</p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-stone-500">Total User Terdaftar</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                  {customers.length}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  {summary.activeCount} aktif/trial · {summary.suspendedCount} tangguh ·{' '}
                  {summary.deactivatedCount} nonaktif
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-stone-500">Total Unit Usaha UMKM</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                  {workspaces.length}
                </p>
                <p className="text-xs text-stone-500 mt-1">22 Bidang Usaha UMKM</p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-stone-500">22 Akun Demo Kategori Usaha</p>
                <p className="text-sm font-bold font-mono text-stone-900 mt-2 truncate">
                  Sandi: Demo2026!
                </p>
                <p className="text-xs text-stone-500 mt-1.5">
                  Retail · F&amp;B · Laundry · Rental · Homestay · Lapangan · Bimbel · dll.
                </p>
              </div>
            </section>
          )}

          {masterTab === 'ACCOUNTS' ? (
            <AccountManagementPanel
              authToken={session.token}
              currentMasterEmail={session.email}
              onOpenEnvSecrets={() => setMasterTab('ENV_SECRETS')}
              onImpersonateCustomer={(custId) => impersonateCustomer(custId)}
              onStartSimulationFlow={() => navigate('/onboarding?mode=simulation')}
              onAccountsMutated={refreshMasterBootstrap}
            />
          ) : masterTab === 'LANDING_PAGES' ? (
            <MasterLandingPagesPanel onPendingCountChange={setPendingLandingAssistCount} />
          ) : masterTab === 'DEMO_CONTROL' ? (
            <DemoControlPanel />
          ) : masterTab === 'REGIONAL_TAX' ? (
            <RegionalTaxPanel />
          ) : masterTab === 'CONTRACT_TEMPLATES' ? (
            <ContractTemplatesPanel />
          ) : masterTab === 'PAYMENT_ASSIST' ? (
            <PaymentAssistancePanel authToken={session.token} />
          ) : masterTab === 'WA_TEMPLATES' ? (
            <WaTemplatesPanel authToken={session.token} />
          ) : masterTab === 'ENV_SECRETS' ? (
            <EnvSecretsPanel />
          ) : masterTab === 'INFRA_MIGRATION' ? (
            <InfraMigrationPanel />
          ) : (
        /* Main Workspace Split: Customers DataTable + Per-User Settings Panel */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Subscribers DataTable */}
          <section
            className={`${
              selectedCustomer ? 'xl:col-span-7' : 'xl:col-span-12'
            } bg-white border border-stone-200 rounded-xl overflow-hidden`}
          >
            <DataTable
              data={filteredCustomers}
              getRowKey={(cust) => cust.id}
              defaultPageSize={10}
              pageSizeOptions={[10, 25, 50, 100]}
              searchable
              searchPlaceholder="Cari nama user, email, username, usaha, atau no. invoice..."
              searchFn={(cust, q) => {
                const ws = workspaces.find((w) => w.tenant.id === cust.primaryTenantId);
                return (
                  cust.fullName.toLowerCase().includes(q) ||
                  cust.email.toLowerCase().includes(q) ||
                  (cust.username?.toLowerCase().includes(q) ?? false) ||
                  cust.lastInvoiceNumber.toLowerCase().includes(q) ||
                  (ws?.tenant.name.toLowerCase().includes(q) ?? false)
                );
              }}
              exportFilename="daftar-pelanggan-kasirakun"
              testId="master-customers-datatable"
              rowClassName={(cust) =>
                cust.id === selectedCustomerId
                  ? 'bg-emerald-50/50 transition-colors'
                  : 'hover:bg-stone-50 transition-colors'
              }
              filterControls={
                <div className="flex items-center gap-1 overflow-x-auto">
                  {(['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED', 'DEACTIVATED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors ${
                        statusFilter === st
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {st === 'ALL'
                        ? `Semua (${customers.length})`
                        : st === 'ACTIVE'
                        ? 'Aktif'
                        : st === 'TRIAL'
                        ? 'Trial'
                        : st === 'SUSPENDED'
                        ? 'Ditangguhkan'
                        : 'Nonaktif'}
                    </button>
                  ))}
                </div>
              }
              columns={
                [
                  {
                    key: 'user',
                    header: 'Pemilik Usaha / User',
                    sortValue: (cust) => cust.fullName,
                    csvHeader: 'Nama & Email',
                    csvValue: (cust) => `${cust.fullName} (${cust.email})`,
                    render: (cust) => (
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-stone-900">{cust.fullName}</p>
                          {cust.accountScope === 'SIMULATION' ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                              SIMULASI
                            </span>
                          ) : cust.isDemoAccount ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-900 text-white">
                              DEMO
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-stone-500 font-mono">
                          {cust.email}
                          {cust.username ? ` · @${cust.username}` : ''}
                        </p>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          Inv: {cust.lastInvoiceNumber}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'tenant',
                    header: 'Usaha & Modul Aktif',
                    sortValue: (cust) =>
                      workspaces.find((w) => w.tenant.id === cust.primaryTenantId)?.tenant.name ??
                      'Usaha UMKM',
                    csvHeader: 'Nama Usaha',
                    csvValue: (cust) =>
                      workspaces.find((w) => w.tenant.id === cust.primaryTenantId)?.tenant.name ??
                      'Usaha UMKM',
                    render: (cust) => {
                      const ws = workspaces.find((w) => w.tenant.id === cust.primaryTenantId);
                      return (
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {ws?.tenant.name ?? 'Usaha UMKM'}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {cust.activeModules.length} modul · Maks {cust.maxTenantsAllowed} usaha
                          </p>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'mrr',
                    header: 'MRR / Siklus',
                    align: 'right',
                    sortValue: (cust) => Number(cust.monthlyRecurringRevenue || 0),
                    csvHeader: 'MRR (Rp)',
                    csvValue: (cust) => cust.monthlyRecurringRevenue,
                    render: (cust) => (
                      <div className="whitespace-nowrap">
                        <p className="font-mono font-semibold tabular-nums text-slate-900">
                          {formatRupiah(cust.monthlyRecurringRevenue)}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {cust.billingCycle === 'ANNUAL' ? 'Tahunan (-15%)' : 'Bulanan'}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortValue: (cust) => cust.status,
                    csvHeader: 'Status',
                    csvValue: (cust) => STATUS_META[cust.status].label,
                    render: (cust) => {
                      const statusStyle = STATUS_META[cust.status];
                      return (
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-md border whitespace-nowrap ${statusStyle.badgeClass}`}
                        >
                          {statusStyle.label}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'actions',
                    header: 'Pengaturan',
                    align: 'right',
                    render: (cust) => (
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openUserSettings(cust)}
                          aria-label={`Atur User ${cust.fullName}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:border-slate-900 rounded-lg transition-colors"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          <span>Atur User</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => impersonateCustomer(cust.id)}
                          aria-label={`Buka Workspace ${cust.fullName}`}
                          title="Masuk ke Workspace Usaha User Ini"
                          className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    ),
                  },
                ] as DataTableColumn<ManagedCustomerAccount>[]
              }
              emptyState={
                <div className="py-6 text-center text-sm text-slate-500">
                  <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  Tidak ada akun pelanggan yang cocok dengan filter pencarian.
                </div>
              }
            />
          </section>

          {/* Per-User Settings Inspector Panel */}
          {selectedCustomer && (
            <aside className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                    Pengaturan Khusus User
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 truncate mt-0.5">
                    {selectedCustomer.fullName}
                  </h2>
                  <p className="text-xs font-mono text-slate-500 truncate">
                    {selectedCustomer.email} ·{' '}
                    {selectedCustomer.isDemoAccount || selectedCustomer.accountScope === 'DEMO'
                      ? `Sandi Demo: ${selectedCustomer.passwordDemo}`
                      : 'Sandi Terenkripsi (scrypt)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerId(null)}
                  aria-label="Tutup Panel Pengaturan User"
                  className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {saveFeedback && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{saveFeedback}</span>
                </div>
              )}

              <form onSubmit={handleSaveUserSettings} className="space-y-5">
                {/* 1. Account Identity & Status */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    1. Profil &amp; Status Akses Akun
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="edit-user-name"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Nama Pemilik Akun
                      </label>
                      <input
                        id="edit-user-name"
                        type="text"
                        required
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-user-phone"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        No. WhatsApp / HP
                      </label>
                      <input
                        id="edit-user-phone"
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-user-status"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Status Langganan
                      </label>
                      <select
                        id="edit-user-status"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as CustomerAccountStatus)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="ACTIVE">Aktif Lunas (ACTIVE)</option>
                        <option value="TRIAL">Uji Coba (TRIAL)</option>
                        <option value="SUSPENDED">Ditangguhkan / Blokir Login (SUSPENDED)</option>
                        <option value="DEACTIVATED">Nonaktif Permanen / Cabut Modul (DEACTIVATED)</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="edit-user-max-tenants"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Batas Maksimal Usaha/Cabang
                      </label>
                      <input
                        id="edit-user-max-tenants"
                        type="number"
                        min={1}
                        max={100}
                        value={editMaxTenants}
                        onChange={(e) => setEditMaxTenants(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Per-User Feature Modules & Billing Cycle */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      2. Kontrol Modul Fitur Per User
                    </h3>
                    <select
                      aria-label="Siklus Tagihan User"
                      value={editBillingCycle}
                      onChange={(e) => setEditBillingCycle(e.target.value as BillingCycle)}
                      className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                    >
                      <option value="MONTHLY">Bulanan</option>
                      <option value="ANNUAL">Tahunan (-15%)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    {FEATURE_MODULES.map((mod) => {
                      const active = editModules.includes(mod.code);
                      return (
                        <button
                          key={mod.code}
                          type="button"
                          onClick={() => toggleEditModule(mod.code)}
                          disabled={mod.isCore}
                          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                            active
                              ? 'border-emerald-600 bg-emerald-50/60'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          } ${mod.isCore ? 'opacity-80 cursor-default' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                                active
                                  ? 'bg-emerald-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {active && <Check className="w-3 h-3" />}
                            </span>
                            <span className="text-xs font-medium text-slate-900 truncate">
                              {mod.name}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-semibold text-slate-700 shrink-0 tabular-nums">
                            {mod.isCore ? 'Core' : formatRupiah(mod.monthlyPrice)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
                    <span className="text-slate-600">Estimasi MRR Efektif User Ini</span>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      {formatRupiah(previewPricing.effectiveMonthlyMrr)} / bln
                    </span>
                  </div>
                </div>

                {/* 3. Per-User Operational, Tax & Printer Settings */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    3. Pengaturan Operasional, Pajak &amp; Printer User
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="edit-tax-entity"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Entitas Pajak (PP 20/2026)
                      </label>
                      <select
                        id="edit-tax-entity"
                        value={editTaxEntity}
                        onChange={(e) => setEditTaxEntity(e.target.value as TaxEntityType)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="WP_OP">WP Orang Pribadi</option>
                        <option value="PT_PERORANGAN">PT Perorangan</option>
                        <option value="CV_FIRMA">CV / Firma</option>
                        <option value="PT_BIASA">PT Biasa</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="edit-paper-width"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Kertas Printer Thermal
                      </label>
                      <select
                        id="edit-paper-width"
                        value={editThermalWidth}
                        onChange={(e) => setEditThermalWidth(e.target.value as '58mm' | '80mm')}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="58mm">Thermal 58mm (Ringkas)</option>
                        <option value="80mm">Thermal 80mm (Standar Resto)</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="edit-mdr-rate"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Tarif MDR QRIS (%)
                      </label>
                      <input
                        id="edit-mdr-rate"
                        type="number"
                        step="0.05"
                        min="0"
                        max="5"
                        value={editMdrPct}
                        onChange={(e) => setEditMdrPct(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-service-rate"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Service Charge Resto (%)
                      </label>
                      <input
                        id="edit-service-rate"
                        type="number"
                        step="0.5"
                        min="0"
                        max="20"
                        value={editServicePct}
                        onChange={(e) => setEditServicePct(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsPkp}
                        onChange={(e) => setEditIsPkp(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span>Status PKP (PPN 12% × 11/12)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editAutoPrint}
                        onChange={(e) => setEditAutoPrint(e.target.checked)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span>Auto-Print Struk Pesanan QR</span>
                    </label>
                  </div>

                  <div>
                    <label
                      htmlFor="edit-admin-notes"
                      className="block text-xs font-medium text-stone-700 mb-1"
                    >
                      Catatan Internal Master Admin
                    </label>
                    <textarea
                      id="edit-admin-notes"
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* 3b. Batas Waktu Sesi (Auto-Logout Pemilik & Pegawai UMKM) */}
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    3b. Batas Waktu Sesi (Auto-Logout Pemilik &amp; Pegawai)
                  </h3>
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="master-owner-timeout" className="text-xs font-semibold text-stone-800">
                        Akun Pemilik ({selectedCustomer.fullName})
                      </label>
                      <span className="font-mono text-[11px] text-stone-600">
                        {formatIdleTimeoutLabel(editIdleTimeoutMinutes)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        id="master-owner-timeout"
                        data-testid="master-customer-timeout-select"
                        value={
                          IDLE_TIMEOUT_PRESETS.some((p) => p.minutes === editIdleTimeoutMinutes)
                            ? String(editIdleTimeoutMinutes)
                            : 'CUSTOM'
                        }
                        onChange={(e) =>
                          setEditIdleTimeoutMinutes(
                            e.target.value === 'CUSTOM' ? 45 : Number(e.target.value)
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg"
                      >
                        {IDLE_TIMEOUT_PRESETS.map((p) => (
                          <option key={p.minutes} value={String(p.minutes)}>
                            {p.label}
                          </option>
                        ))}
                        <option value="CUSTOM">Kustom (Menit)...</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        max={1440}
                        value={editIdleTimeoutMinutes}
                        onChange={(e) =>
                          setEditIdleTimeoutMinutes(Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Per-Staff Timeout Overrides across this Customer's Tenants */}
                  {(() => {
                    const staffEntries = selectedCustomer.tenantIds.flatMap((tid) => {
                      const ws = workspaces.find((w) => w.tenant.id === tid);
                      return (ws?.staffAccounts ?? []).map((staff) => ({
                        tenantId: tid,
                        tenantName: ws?.tenant.name ?? tid,
                        staff,
                      }));
                    });
                    if (staffEntries.length === 0) {
                      return (
                        <p className="text-[11px] text-stone-500">
                          Belum ada akun pegawai/sub-user pada usaha ini.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-stone-600">
                          Pegawai / Sub-User ({staffEntries.length} akun)
                        </p>
                        {staffEntries.map(({ tenantId, staff }) => (
                          <div
                            key={staff.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-stone-800 truncate">
                                {staff.fullName}{' '}
                                <span className="font-normal text-stone-500">({staff.roleTitle})</span>
                              </p>
                              <p className="text-[10px] font-mono text-stone-500 truncate">
                                {staff.email}
                              </p>
                            </div>
                            <select
                              aria-label={`Auto-logout ${staff.fullName}`}
                              data-testid={`master-staff-timeout-${staff.id}`}
                              value={
                                IDLE_TIMEOUT_PRESETS.some(
                                  (p) => p.minutes === (staff.idleTimeoutMinutes ?? 0)
                                )
                                  ? String(staff.idleTimeoutMinutes ?? 0)
                                  : '0'
                              }
                              onChange={(e) => {
                                const mins = Number(e.target.value);
                                updateTenantStaffIdleTimeout(tenantId, staff.id, mins);
                                setSaveFeedback(
                                  `Auto-logout pegawai ${staff.fullName} diubah menjadi ${formatIdleTimeoutLabel(mins)}.`
                                );
                              }}
                              className="px-2 py-1 text-[11px] bg-stone-50 border border-stone-200 rounded-md shrink-0"
                            >
                              {IDLE_TIMEOUT_PRESETS.map((p) => (
                                <option key={p.minutes} value={String(p.minutes)}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* 4. Associated Tenants & Account Deactivation Lifecycle */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    4. Tenant Usaha Terkait &amp; Siklus Nonaktif Akun
                  </h3>
                  <div className="space-y-1.5">
                    {selectedCustomer.tenantIds.map((tid) => {
                      const tWs = workspaces.find((w) => w.tenant.id === tid);
                      return (
                        <div
                          key={tid}
                          className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">
                              {tWs?.tenant.name ?? tid}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {tWs?.tenant.vertical ?? 'UMKM'} · {tWs?.tenant.activeModules.length ?? 1} modul aktif
                            </p>
                          </div>
                          <span className="font-mono text-[10px] text-slate-500 shrink-0">
                            {tWs?.tenant.slug ?? tid}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {selectedCustomer.status === 'DEACTIVATED' ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-700">
                        Akun ini sedang <strong>Nonaktif</strong> (login &amp; modul berbayar dicabut).
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          reactivateManagedCustomer(selectedCustomer.id, [
                            'POS_BASIC',
                            'QR_TABLE_KITCHEN',
                            'ACCOUNTING_FULL',
                            'TAX_CORETAX',
                          ]);
                          setEditStatus('ACTIVE');
                          setEditModules([
                            'POS_BASIC',
                            'QR_TABLE_KITCHEN',
                            'ACCOUNTING_FULL',
                            'TAX_CORETAX',
                          ]);
                          setSaveFeedback(
                            `Akun ${selectedCustomer.fullName} & langganan tenant telah diaktifkan kembali.`
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                      >
                        Aktifkan Kembali
                      </button>
                    </div>
                  ) : confirmDeactivateId === selectedCustomer.id ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2.5">
                      <p className="text-xs font-medium text-rose-900">
                        Konfirmasi nonaktifkan akun <strong>{selectedCustomer.fullName}</strong>?
                        Login user akan diblokir dan seluruh modul berbayar pada tenant terkait akan
                        dicabut (MRR menjadi Rp0).
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            deactivateManagedCustomer(
                              selectedCustomer.id,
                              'Dinonaktifkan via Konsol Master'
                            );
                            setEditStatus('DEACTIVATED');
                            setEditModules(['POS_BASIC']);
                            setConfirmDeactivateId(null);
                            setSaveFeedback(
                              `Akun ${selectedCustomer.fullName} & langganan tenant berhasil dinonaktifkan.`
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
                        >
                          Ya, Nonaktifkan Akun
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeactivateId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeactivateId(selectedCustomer.id)}
                      className="w-full py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                    >
                      Nonaktifkan Akun &amp; Cabut Langganan Tenant
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    Simpan Pengaturan User
                  </button>
                  <button
                    type="button"
                    onClick={() => impersonateCustomer(selectedCustomer.id)}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <span>Buka Workspace</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
          )}
        </main>
      </div>
      <AccountModal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} />
    </div>
  );
}
