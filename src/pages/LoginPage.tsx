import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  LogIn,
  Play,
  ShieldCheck,
  Store,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  authClient,
  fetchAuthConfigStatus,
  type AuthConfigStatusResponse,
} from '../lib/auth-client';
import { deriveLegacyModulesFromHybrid } from '../lib/saas/hybrid-pricing';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  VERTICAL_GROUP_LABELS,
  type VerticalCategoryGroup,
} from '../lib/verticals/vertical-registry';
import {
  buildDefaultTenantRegionalTax,
  describeNationalAndRegionalTaxSummary,
  getVerticalPbjtCategory,
} from '../lib/tax/regional-tax-indonesia';
import {
  detectRegionFromLocationText,
  lookupRegionalTaxRecommendations,
} from '../lib/tax/regional-tax-lookup';
import type { BusinessVertical } from '../types/domain';

const SIGNUP_GROUP_ORDER: VerticalCategoryGroup[] = [
  'RETAIL_DAGANG',
  'KULINER_FNB',
  'JASA_PERAWATAN',
  'RENTAL_PROPETI',
  'PRODUKSI_AGRO',
];

function GoogleBrandMark() {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

export function LoginPage({
  initialTab = 'CUSTOMER',
  initialMode = 'LOGIN',
}: {
  initialTab?: 'CUSTOMER' | 'MASTER';
  initialMode?: 'LOGIN' | 'REGISTER';
}) {
  const {
    navigate,
    loginAsMaster,
    loginAsCustomer,
    completeCustomerOnboarding,
    hydrateFromBetterAuthSession,
    betterAuthError,
    enterInstantDemo,
    systemDemoConfig,
    regionalTaxRegistry,
  } = useApp();

  const [tab, setTab] = useState<'CUSTOMER' | 'MASTER'>(initialTab);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);
  const [authConfig, setAuthConfig] = useState<AuthConfigStatusResponse>({
    googleAuthConfigured: false,
    betterAuthSecretConfigured: false,
    databaseConfigured: false,
    betterAuthReady: false,
  });

  // Sync mode when navigating directly between /login and /register
  useEffect(() => {
    setTab(initialTab);
    setAuthMode(initialMode);
  }, [initialTab, initialMode]);

  // Check server auth capabilities
  useEffect(() => {
    let active = true;
    void fetchAuthConfigStatus().then((cfg) => {
      if (active) setAuthConfig(cfg);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!betterAuthError) return;
    if (tab === 'MASTER') {
      setMasterError(betterAuthError);
    } else {
      setCustError(betterAuthError);
    }
  }, [betterAuthError, tab]);

  // Master Login state
  const [masterEmail, setMasterEmail] = useState('master@kasirakun.id');
  const [masterPassword, setMasterPassword] = useState('');
  const [masterError, setMasterError] = useState('');
  const [masterSubmitting, setMasterSubmitting] = useState(false);

  // Customer Login & Register state
  const [custEmail, setCustEmail] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [custError, setCustError] = useState('');
  const [custSuccess, setCustSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // Registration form fields
  const [signupFullName, setSignupFullName] = useState('');
  const [signupBusinessName, setSignupBusinessName] = useState('');
  const [signupVertical, setSignupVertical] = useState<BusinessVertical>('WARUNG_SEMBAKO');
  const [signupRegionCode, setSignupRegionCode] = useState<string>('ID-NONE');
  const [signupApplyRegionalTax, setSignupApplyRegionalTax] = useState<boolean>(false);
  const [signupCustomTaxName, setSignupCustomTaxName] = useState<string>('');
  const [signupCustomRatePct, setSignupCustomRatePct] = useState<string>('');
  const [signupLocationQuery, setSignupLocationQuery] = useState<string>('');
  const [showSignupCustomTax, setShowSignupCustomTax] = useState<boolean>(false);
  const [signupWaNumber, setSignupWaNumber] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const signupTaxLookup = useMemo(
    () =>
      lookupRegionalTaxRecommendations({
        vertical: signupVertical,
        regionCode: signupRegionCode,
        taxEntity: 'WP_OP',
        isPkp: false,
        registry: regionalTaxRegistry,
      }),
    [signupVertical, signupRegionCode, regionalTaxRegistry]
  );

  const signupCustomRateDecimal = useMemo(() => {
    const num = Number(signupCustomRatePct.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0 || num > 100) return null;
    return (num / 100).toFixed(4);
  }, [signupCustomRatePct]);

  const signupTaxPreview = useMemo(() => {
    const baseRegional = buildDefaultTenantRegionalTax(
      signupVertical,
      signupRegionCode,
      regionalTaxRegistry,
    );
    const hasCustom = signupRegionCode !== 'ID-NONE' && signupCustomRateDecimal !== null;
    return describeNationalAndRegionalTaxSummary({
      vertical: signupVertical,
      taxEntity: 'WP_OP',
      isPkp: false,
      regionalTax: {
        ...baseRegional,
        applyRegionalTax:
          signupRegionCode !== 'ID-NONE' && (signupApplyRegionalTax || hasCustom),
        customTaxName: signupCustomTaxName.trim() || null,
        customRateOverride: signupCustomRateDecimal,
      },
      registry: regionalTaxRegistry,
    });
  }, [
    regionalTaxRegistry,
    signupApplyRegionalTax,
    signupCustomRateDecimal,
    signupCustomTaxName,
    signupRegionCode,
    signupVertical,
  ]);

  const isPublicInstantDemo =
    (systemDemoConfig.globalDemoMode ?? systemDemoConfig.demoMode ?? 'PUBLIC_INSTANT') ===
      'PUBLIC_INSTANT' && !systemDemoConfig.requireRegistrationForDemo;

  const handleMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterError('');
    setMasterSubmitting(true);
    const res = await loginAsMaster(masterEmail, masterPassword);
    setMasterSubmitting(false);
    if (!res.ok) {
      setMasterError(res.error || 'Email atau kata sandi Master Admin tidak cocok.');
      return;
    }
    navigate('/master');
  };

  const handleQuickMasterLogin = async () => {
    setMasterEmail('master@kasirakun.id');
    setMasterPassword('Master2026!');
    setMasterError('');
    setMasterSubmitting(true);
    const res = await loginAsMaster('master@kasirakun.id', 'Master2026!');
    setMasterSubmitting(false);
    if (res.ok) {
      navigate('/master');
    } else {
      setMasterError(res.error || 'Masuk cepat Master gagal.');
    }
  };

  const handleGoogleCustomer = async () => {
    setCustError('');
    setCustSuccess('');
    setGoogleSubmitting(true);
    try {
      if (authConfig.betterAuthReady && authConfig.googleAuthConfigured) {
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: '/dashboard',
          newUserCallbackURL: '/onboarding?mode=real&source=oauth',
        });
        if (result?.error) {
          setCustError(
            result.error.message || 'Gagal menghubungkan akun Google Better Auth. Silakan coba lagi.',
          );
          setGoogleSubmitting(false);
          return;
        }
        setCustSuccess('Mengarahkan ke halaman persetujuan Google...');
        return;
      }

      if (!authConfig.betterAuthReady) {
        setCustError(
          'Login Google membutuhkan Neon PostgreSQL (DATABASE_URL) & BETTER_AUTH_SECRET aktif di server. Silakan masuk dengan Email & Kata Sandi atau lengkapi env Neon di Vercel / Master Admin.',
        );
      } else {
        setCustError(
          'Google OAuth belum dikonfigurasi. Lengkapi GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di Vercel atau Master Admin -> Pengaturan API & Secret Key.',
        );
      }
    } catch {
      setCustError('Terjadi kendala saat menghubungkan akun Google. Coba lagi beberapa saat.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    setCustSuccess('');
    setSubmitting(true);

    try {
      const normalizedEmail = custEmail.trim().toLowerCase();

      // 1. When Better Auth + Neon PostgreSQL is active, verify via Better Auth first
      if (authConfig.betterAuthReady) {
        const baRes = await authClient.signIn.email({
          email: normalizedEmail,
          password: custPassword,
        });
        if (!baRes?.error && baRes?.data) {
          const exchanged = await hydrateFromBetterAuthSession();
          if (!exchanged.ok) {
            setCustError(
              exchanged.error || 'Akses akun ditolak atau sesi tidak dapat dimuat.',
            );
            return;
          }
          setCustSuccess('Berhasil masuk via Better Auth. Mengarahkan ke ruang kerja...');
          navigate(exchanged.defaultRoute || '/dashboard');
          return;
        }
      }

      // 2. Check registered SaaS Owner / Demo / Staff accounts in partitioned backend DB
      const saasRes = await loginAsCustomer(normalizedEmail, custPassword);
      if (saasRes.ok) {
        setCustSuccess('Berhasil masuk. Mengarahkan ke ruang kerja Anda...');
        navigate(saasRes.defaultRoute || '/dashboard');
        return;
      }

      setCustError(
        saasRes.error || 'Email atau kata sandi tidak cocok. Periksa kembali data masuk Anda.',
      );
    } catch {
      setCustError('Gagal memverifikasi akun. Periksa koneksi internet Anda lalu coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    setCustSuccess('');

    if (!signupFullName.trim() || !signupBusinessName.trim()) {
      setCustError('Nama pemilik dan nama usaha wajib diisi.');
      return;
    }
    if (signupPassword.length < 6) {
      setCustError('Kata sandi minimal 6 karakter.');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedEmail = signupEmail.trim().toLowerCase();
      const baseRegional = buildDefaultTenantRegionalTax(
        signupVertical,
        signupRegionCode,
        regionalTaxRegistry,
      );
      const hasCustom = signupRegionCode !== 'ID-NONE' && signupCustomRateDecimal !== null;
      const regionalTax = {
        ...baseRegional,
        applyRegionalTax:
          signupRegionCode !== 'ID-NONE' && (signupApplyRegionalTax || hasCustom),
        customTaxName: signupCustomTaxName.trim() || null,
        customRateOverride: signupCustomRateDecimal,
      };

      // 1. Primary path when Neon PostgreSQL + Better Auth is active
      if (authConfig.betterAuthReady) {
        const baSignUp = await authClient.signUp.email({
          name: signupFullName.trim(),
          email: normalizedEmail,
          password: signupPassword,
        });
        if (baSignUp?.error) {
          setCustError(
            baSignUp.error.message || 'Pendaftaran gagal. Pastikan email belum terdaftar.',
          );
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const suffix = Date.now().toString(36).toUpperCase();
      await completeCustomerOnboarding({
        invoice: {
          id: `inv-reg-${suffix}`,
          invoiceNumber: `REG-${suffix}`,
          customerEmail: normalizedEmail,
          billingCycle: 'MONTHLY',
          planCode: 'LITE',
          selectedAddOns: [],
          selectedModules: deriveLegacyModulesFromHybrid('LITE', []),
          subtotalAmount: '49000.0000',
          dppNilaiLain: '0.0000',
          ppnAmount: '0.0000',
          grandTotal: '49000.0000',
          paymentMethod: 'QRIS_DYNAMIC',
          paymentStatus: 'VERIFIED_PAID',
          gatewayRefId: authConfig.betterAuthReady
            ? `BA-SIGNUP-${suffix}`
            : `LOCAL-SIGNUP-${suffix}`,
          paidAt: nowIso,
          createdAt: nowIso,
        },
        fullName: signupFullName.trim(),
        email: normalizedEmail,
        passwordDemo: signupPassword,
        phone: signupWaNumber.trim() || '081200000000',
        businessName: signupBusinessName.trim(),
        vertical: signupVertical,
        taxEntity: 'WP_OP',
        isPkp: false,
        npwp16: '3174010000000001',
        nitku22: '3174010000000001000001',
        address: 'Indonesia',
        receiptFooter: `Terima kasih telah berkunjung ke ${signupBusinessName.trim()}!`,
        thermalPaperWidth: '80mm',
        autoPrintQrOrders: true,
        tableCount:
          signupVertical === 'RESTORAN' || signupVertical === 'KEDAI_MAKAN' ? 6 : 0,
        initialCapital: '25000000',
        menuDrafts: [],
        customFields: [],
        regionalTax,
        businessWhatsappNumber: signupWaNumber.trim() || undefined,
      });

      setCustSuccess(
        authConfig.betterAuthReady
          ? 'Akun Better Auth & ruang kerja usaha siap digunakan!'
          : 'Akun usaha siap digunakan. Membuka dashboard...',
      );
      navigate('/dashboard');
    } catch (err) {
      setCustError(
        err instanceof Error
          ? err.message
          : 'Terjadi kendala saat membuat akun baru. Coba beberapa saat lagi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemoEntry = async () => {
    setDemoLoading(true);
    setCustError('');
    try {
      const res = await enterInstantDemo('WARUNG_SEMBAKO');
      if (res.ok) {
        navigate('/dashboard');
        return;
      }
      navigate('/demo');
    } catch {
      navigate('/demo');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleGoogleMaster = async () => {
    setMasterError('');
    if (authConfig.betterAuthReady && authConfig.googleAuthConfigured) {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/master',
      });
      if (result?.error) {
        setMasterError(
          result.error.message || 'Gagal menghubungkan akun Google Master via Better Auth.',
        );
      }
      return;
    }

    setMasterError(
      !authConfig.betterAuthReady
        ? 'Login Google Master memerlukan Neon PostgreSQL (DATABASE_URL) & BETTER_AUTH_SECRET aktif di server.'
        : 'Google OAuth belum dikonfigurasi (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET).',
    );
  };

  const busy = submitting || googleSubmitting;

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 flex flex-col">
      <header className="h-16 bg-white border-b border-stone-200 px-4 sm:px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-lg px-2 py-1"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          <span>Beranda</span>
        </button>
        <span className="text-base font-bold tracking-[-0.02em] text-stone-900">
          KasirAkun UMKM
        </span>
        <button
          type="button"
          onClick={() => navigate('/demo')}
          className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-lg px-2 py-1"
        >
          Coba Demo Gratis
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-6 items-start">
          {/* Left: Auth Card */}
          <section className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-[-0.03em] leading-[1.15] text-stone-900">
                {tab === 'MASTER'
                  ? 'Masuk Konsol Master Admin'
                  : authMode === 'REGISTER'
                  ? 'Daftar Akun KasirAkun UMKM'
                  : 'Masuk ke Ruang Kerja Usaha'}
              </h1>
              <p className="text-sm text-stone-600 leading-relaxed max-w-[58ch]">
                {tab === 'MASTER'
                  ? 'Akses khusus pengelola platform untuk memantau tenant, kebijakan demo, dan brankas API.'
                  : authMode === 'REGISTER'
                  ? 'Buat akun pemilik usaha untuk mulai mencatat kasir, stok barang, dan pembukuan otomatis.'
                  : 'Masuk sebagai pemilik usaha atau pegawai kasir, dapur, dan gudang menggunakan akun terdaftar.'}
              </p>
            </div>

            {/* Role Tabs */}
            <div
              className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 border border-stone-200 rounded-xl"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'CUSTOMER'}
                onClick={() => {
                  setTab('CUSTOMER');
                  setCustError('');
                  setCustSuccess('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  tab === 'CUSTOMER'
                    ? 'bg-white text-stone-900 border border-stone-200'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Store className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
                <span>Pemilik Usaha &amp; Staf</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'MASTER'}
                data-testid="login-tab-master"
                onClick={() => {
                  setTab('MASTER');
                  setMasterError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  tab === 'MASTER'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                <span>Master Admin</span>
              </button>
            </div>

            {tab === 'MASTER' ? (
              <form onSubmit={handleMasterSubmit} className="space-y-4">
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-1 text-xs text-stone-600">
                  <p className="font-semibold text-stone-900 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                    <span>Akses Pengelola Platform</span>
                  </p>
                  <p className="leading-relaxed">
                    Kelola akun pelanggan, paket langganan, kebijakan demo, serta brankas API
                    terenkripsi (Neon PostgreSQL, Better Auth, Midtrans, dan WhatsApp Fonnte).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="master-email"
                    className="block text-xs font-semibold text-stone-700 mb-1.5"
                  >
                    Email Master Admin
                  </label>
                  <input
                    id="master-email"
                    type="email"
                    required
                    value={masterEmail}
                    onChange={(e) => setMasterEmail(e.target.value)}
                    placeholder="master@kasirakun.id"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="master-password"
                    className="block text-xs font-semibold text-stone-700 mb-1.5"
                  >
                    Kata Sandi Master
                  </label>
                  <input
                    id="master-password"
                    type="password"
                    required
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Master"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                {masterError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" strokeWidth={1.75} />
                    <span>{masterError}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    data-testid="master-login-submit-btn"
                    disabled={masterSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    {masterSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                    )}
                    <span>{masterSubmitting ? 'Memverifikasi...' : 'Masuk ke Konsol Master'}</span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      data-testid="master-quick-login-btn"
                      disabled={masterSubmitting}
                      onClick={() => void handleQuickMasterLogin()}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Masuk Cepat Master</span>
                    </button>
                    <button
                      type="button"
                      disabled={masterSubmitting}
                      onClick={() => void handleGoogleMaster()}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Masuk Google Master</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                {/* Primary Google OAuth Button */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleGoogleCustomer()}
                  data-testid="google-cloud-login-btn"
                  className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 px-4 text-sm font-semibold text-stone-800 bg-white hover:bg-stone-50 border border-stone-300 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {googleSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" strokeWidth={1.75} />
                  ) : (
                    <GoogleBrandMark />
                  )}
                  <span>
                    {googleSubmitting
                      ? 'Menghubungkan akun Google...'
                      : authMode === 'REGISTER'
                      ? 'Daftar dengan Google'
                      : 'Masuk dengan Google'}
                  </span>
                </button>

                <p
                  data-testid="auth-provider-status-note"
                  className="text-[11px] text-stone-500 text-center -mt-2"
                >
                  {authConfig.betterAuthReady
                    ? authConfig.googleAuthConfigured
                      ? 'Terhubung ke Better Auth + Neon PostgreSQL (Login Email & Google aktif)'
                      : 'Terhubung ke Better Auth + Neon PostgreSQL (Login Email aktif · Google OAuth menunggu Secret)'
                    : 'Login Email & Akun Terkelola aktif · Neon PostgreSQL / Google OAuth opsional via Master Admin'}
                </p>

                <div className="relative flex items-center">
                  <div className="flex-1 border-t border-stone-200" />
                  <span className="px-3 text-xs font-medium text-stone-500">
                    atau gunakan email &amp; kata sandi
                  </span>
                  <div className="flex-1 border-t border-stone-200" />
                </div>

                {/* Clean 2-option Login / Register Toggle */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-100 rounded-lg text-xs font-semibold">
                  <button
                    type="button"
                    data-testid="auth-mode-login-btn"
                    onClick={() => {
                      setAuthMode('LOGIN');
                      setCustError('');
                      setCustSuccess('');
                    }}
                    className={`py-2 px-3 rounded-md transition-colors ${
                      authMode === 'LOGIN'
                        ? 'bg-white text-stone-900 border border-stone-200'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Masuk Akun
                  </button>
                  <button
                    type="button"
                    data-testid="signup-tab-btn"
                    onClick={() => {
                      setAuthMode('REGISTER');
                      setCustError('');
                      setCustSuccess('');
                    }}
                    className={`py-2 px-3 rounded-md transition-colors ${
                      authMode === 'REGISTER'
                        ? 'bg-white text-emerald-800 border border-stone-200'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Daftar Akun Baru
                  </button>
                </div>

                {custSuccess && (
                  <div
                    role="status"
                    className="flex items-start gap-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5"
                  >
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                      strokeWidth={1.75}
                    />
                    <span>{custSuccess}</span>
                  </div>
                )}

                {custError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5"
                  >
                    <AlertCircle
                      className="w-4 h-4 text-rose-600 shrink-0 mt-0.5"
                      strokeWidth={1.75}
                    />
                    <span>{custError}</span>
                  </div>
                )}

                {authMode === 'REGISTER' ? (
                  <form onSubmit={handleEmailRegisterSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-fullname"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Nama Pemilik
                        </label>
                        <input
                          id="reg-fullname"
                          type="text"
                          required
                          value={signupFullName}
                          onChange={(e) => setSignupFullName(e.target.value)}
                          placeholder="Sari Kusuma"
                          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="reg-biz"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Nama Usaha / Toko
                        </label>
                        <input
                          id="reg-biz"
                          type="text"
                          required
                          value={signupBusinessName}
                          onChange={(e) => setSignupBusinessName(e.target.value)}
                          placeholder="Warung Berkah Mandiri"
                          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="reg-vertical"
                        className="block text-xs font-semibold text-stone-700 mb-1"
                      >
                        Jenis Usaha UMKM
                      </label>
                      <select
                        id="reg-vertical"
                        value={signupVertical}
                        onChange={(e) => {
                          const nextV = e.target.value as BusinessVertical;
                          setSignupVertical(nextV);
                          const pbjtCat = getVerticalPbjtCategory(nextV);
                          setSignupApplyRegionalTax(
                            signupRegionCode !== 'ID-NONE' && pbjtCat !== 'NONE',
                          );
                        }}
                        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                      >
                        {SIGNUP_GROUP_ORDER.map((groupKey) => (
                          <optgroup key={groupKey} label={VERTICAL_GROUP_LABELS[groupKey]}>
                            {ACTIVE_VERTICAL_DEFINITIONS.filter(
                              (v) => v.categoryGroup === groupKey,
                            ).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-region"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Domisili Pajak Daerah (PBJT)
                        </label>
                        <select
                          id="reg-region"
                          value={signupRegionCode}
                          onChange={(e) => {
                            const code = e.target.value;
                            setSignupRegionCode(code);
                            const pbjtCat = getVerticalPbjtCategory(signupVertical);
                            setSignupApplyRegionalTax(code !== 'ID-NONE' && pbjtCat !== 'NONE');
                          }}
                          className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        >
                          {regionalTaxRegistry.map((r) => (
                            <option key={r.regionCode} value={r.regionCode}>
                              {r.regionCode === 'ID-NONE'
                                ? 'Tanpa Pajak Daerah (0%)'
                                : `${r.cityName} (${r.province})`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="reg-wa"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Nomor WhatsApp Usaha
                        </label>
                        <input
                          id="reg-wa"
                          type="tel"
                          value={signupWaNumber}
                          onChange={(e) => setSignupWaNumber(e.target.value)}
                          placeholder="0812-xxxx-xxxx"
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                    </div>

                    <div
                      data-testid="signup-regional-tax-preview"
                      className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-950">
                          <Landmark className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                          Deteksi Lokasi &amp; Pajak Daerah (Perda)
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-emerald-800">
                          Daerah: {signupTaxPreview.regionalResolution.ratePercentLabel}
                        </span>
                      </div>
                      <input
                        type="text"
                        data-testid="signup-location-lookup-input"
                        value={signupLocationQuery}
                        onChange={(e) => {
                          const q = e.target.value;
                          setSignupLocationQuery(q);
                          if (q.trim().length >= 3) {
                            const found = detectRegionFromLocationText(q, regionalTaxRegistry);
                            if (found) {
                              setSignupRegionCode(found.region.regionCode);
                              const pbjtCat = getVerticalPbjtCategory(signupVertical);
                              setSignupApplyRegionalTax(
                                found.region.regionCode !== 'ID-NONE' && pbjtCat !== 'NONE'
                              );
                            }
                          }
                        }}
                        placeholder="Ketik cepat kota/kecamatan (misal: Canggu, Tebet, Dago, Sleman)..."
                        className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-emerald-200 rounded-md focus:outline-none focus:border-emerald-600"
                      />
                      <p className="text-stone-700">
                        <span className="font-semibold text-stone-900">Nasional:</span>{' '}
                        {signupTaxPreview.nationalLabel}
                      </p>
                      <p className="text-stone-700">
                        <span className="font-semibold text-stone-900">
                          Daerah ({signupTaxPreview.regionalResolution.regionName}):
                        </span>{' '}
                        {signupTaxPreview.regionalResolution.taxLabel}
                        {signupRegionCode !== 'ID-NONE' && (
                          <span className="text-stone-500">
                            {' '}
                            · {signupTaxPreview.regionalResolution.perdaReference}
                          </span>
                        )}
                      </p>
                      {signupTaxLookup.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {signupTaxLookup.suggestions.slice(0, 2).map((sug) => (
                            <button
                              key={sug.id}
                              type="button"
                              onClick={() => {
                                setSignupApplyRegionalTax(sug.presetConfig.applyRegionalTax);
                                setSignupCustomTaxName(sug.presetConfig.customTaxName ?? '');
                                if (sug.presetConfig.customRateOverride) {
                                  setSignupCustomRatePct(
                                    String(Number(sug.presetConfig.customRateOverride) * 100)
                                  );
                                  setShowSignupCustomTax(true);
                                } else {
                                  setSignupCustomRatePct('');
                                }
                              }}
                              className="px-2 py-1 rounded border border-emerald-300 bg-white hover:bg-emerald-100 text-[10px] font-semibold text-emerald-900 transition-colors"
                            >
                              Terapkan: {sug.title}
                            </button>
                          ))}
                        </div>
                      )}
                      {signupRegionCode !== 'ID-NONE' && (
                        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/70">
                          <span className="text-stone-600">
                            Batas bebas UMKM:{' '}
                            <span className="font-mono tabular-nums font-medium text-stone-800">
                              {signupTaxPreview.monthlyThresholdRupiah}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSignupCustomTax((prev) => !prev)}
                            className="font-semibold text-emerald-800 hover:text-emerald-950 underline"
                          >
                            {showSignupCustomTax
                              ? 'Sembunyikan tarif Perda khusus'
                              : '+ Tambah pajak daerah khusus (Perda)'}
                          </button>
                        </div>
                      )}
                    </div>

                    {signupRegionCode !== 'ID-NONE' &&
                      getVerticalPbjtCategory(signupVertical) !== 'NONE' && (
                        <label className="flex items-start gap-2 text-xs text-stone-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={signupApplyRegionalTax}
                            onChange={(e) => setSignupApplyRegionalTax(e.target.checked)}
                            className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <span>
                            Aktifkan Pajak Daerah (PBJT) sesuai kota. Hapus centang bila omzet di
                            bawah batas ketentuan daerah.
                          </span>
                        </label>
                      )}

                    {signupRegionCode !== 'ID-NONE' && showSignupCustomTax && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <div>
                          <label
                            htmlFor="reg-custom-tax-name"
                            className="block text-[11px] font-semibold text-stone-700 mb-1"
                          >
                            Nama Pungutan Perda Tambahan
                          </label>
                          <input
                            id="reg-custom-tax-name"
                            type="text"
                            value={signupCustomTaxName}
                            onChange={(e) => setSignupCustomTaxName(e.target.value)}
                            placeholder="Contoh: PBJT Kost >10 Kamar / Retribusi"
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="reg-custom-tax-rate"
                            className="block text-[11px] font-semibold text-stone-700 mb-1"
                          >
                            Tarif Tambahan Daerah (%)
                          </label>
                          <input
                            id="reg-custom-tax-rate"
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={signupCustomRatePct}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSignupCustomRatePct(v);
                              if (Number(v) > 0) setSignupApplyRegionalTax(true);
                            }}
                            placeholder="Contoh: 10"
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="reg-email"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Email
                        </label>
                        <input
                          id="reg-email"
                          type="email"
                          required
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="pemilik@usahaku.id"
                          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="reg-pass"
                          className="block text-xs font-semibold text-stone-700 mb-1"
                        >
                          Kata Sandi (min. 6 karakter)
                        </label>
                        <input
                          id="reg-pass"
                          type="password"
                          required
                          minLength={6}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      data-testid="signup-submit-btn"
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                      )}
                      <span>{submitting ? 'Membuat Akun...' : 'Daftar & Siapkan Usaha'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleEmailLoginSubmit} className="space-y-4">
                    <div>
                      <label
                        htmlFor="cust-email"
                        className="block text-xs font-semibold text-stone-700 mb-1.5"
                      >
                        Email Pemilik Usaha atau Pegawai
                      </label>
                      <input
                        id="cust-email"
                        type="email"
                        required
                        value={custEmail}
                        onChange={(e) => setCustEmail(e.target.value)}
                        placeholder="nama@usahaku.id"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cust-password"
                        className="block text-xs font-semibold text-stone-700 mb-1.5"
                      >
                        Kata Sandi
                      </label>
                      <input
                        id="cust-password"
                        type="password"
                        required
                        value={custPassword}
                        onChange={(e) => setCustPassword(e.target.value)}
                        placeholder="Masukkan kata sandi Anda"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      data-testid="customer-login-submit-btn"
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <UserCheck className="w-4 h-4" strokeWidth={1.75} />
                      )}
                      <span>{submitting ? 'Memeriksa Akun...' : 'Masuk ke Ruang Kerja'}</span>
                    </button>

                    <p className="text-xs text-stone-500 leading-relaxed">
                      Satu pintu masuk untuk pemilik usaha, akun demo terdaftar, maupun pegawai
                      kasir, dapur, gudang, dan pembukuan.
                    </p>
                  </form>
                )}
              </div>
            )}
          </section>

          {/* Right: Guidance & Quick Demo Panel */}
          <aside className="lg:col-span-5 space-y-4">
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-stone-900 tracking-[-0.02em]">
                  Belum Berlangganan? Pilih Paket Usaha
                </h2>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Mulai dari paket LITE Rp49rb, BASIC Rp95rb, PRO Rp175rb, hingga EXPERT Rp279rb
                  per bulan dengan ruang data bersih dan daftar akun otomatis.
                </p>
              </div>
              <button
                type="button"
                data-testid="login-goto-onboarding-btn"
                onClick={() => navigate('/onboarding?mode=real')}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <span>Pilih Paket &amp; Buat Akun Asli</span>
                <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-sm font-bold text-stone-900">
                  Coba Langsung Tanpa Daftar
                </h2>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Lihat cara kerja kasir, stok gudang, QR meja, dan laporan laba rugi memakai data
                  contoh untuk 22 jenis usaha UMKM.
                </p>
              </div>

              <div className="space-y-2">
                {isPublicInstantDemo && (
                  <button
                    type="button"
                    data-testid="login-quick-demo-btn"
                    disabled={demoLoading}
                    onClick={() => void handleQuickDemoEntry()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {demoLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Play className="w-4 h-4" strokeWidth={1.75} />
                    )}
                    <span>
                      {demoLoading ? 'Membuka Demo...' : 'Masuk Cepat Akun Demo (Warung)'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="login-goto-demo-btn"
                  onClick={() => navigate('/demo')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200/80 border border-stone-200 rounded-lg transition-colors"
                >
                  <span>Pilih Jenis Usaha Demo Lainnya</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div className="bg-stone-900 text-stone-300 rounded-xl p-5 space-y-2 text-xs">
              <p className="font-semibold text-white flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                <span>Data Usaha Terpisah &amp; Terlindungi</span>
              </p>
              <p className="leading-relaxed">
                Setiap akun usaha memiliki ruang data tersendiri. Transaksi kasir, stok barang,
                harga modal, dan laporan pajak tidak pernah bercampur dengan akun lain.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
