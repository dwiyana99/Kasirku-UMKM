import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  KeyRound,
  Lock,
  LogIn,
  Play,
  ShieldCheck,
  Sparkles,
  Store,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  VERTICAL_GROUP_LABELS,
  type VerticalCategoryGroup,
} from '../lib/verticals/vertical-registry';
import {
  buildDefaultTenantRegionalTax,
  getVerticalPbjtCategory,
} from '../lib/tax/regional-tax-indonesia';
import type { BusinessVertical } from '../types/domain';

const SIGNUP_GROUP_ORDER: VerticalCategoryGroup[] = [
  'RETAIL_DAGANG',
  'KULINER_FNB',
  'JASA_PERAWATAN',
  'RENTAL_PROPETI',
  'PRODUKSI_AGRO',
];

export function LoginPage({ initialTab = 'CUSTOMER' }: { initialTab?: 'CUSTOMER' | 'MASTER' }) {
  const {
    navigate,
    loginAsMaster,
    loginAsCustomer,
    signInWithGoogle,
    signInWithFirebaseEmail,
    signUpWithFirebaseEmail,
    regionalTaxRegistry,
    authLoading,
  } = useApp();

  const [tab, setTab] = useState<'CUSTOMER' | 'MASTER'>(initialTab);
  const [customerAuthMode, setCustomerAuthMode] = useState<
    'SAAS_LOGIN' | 'FIREBASE_SIGNIN' | 'FIREBASE_SIGNUP'
  >('SAAS_LOGIN');

  // Master Login state
  const [masterEmail, setMasterEmail] = useState('master@kasirakun.id');
  const [masterPassword, setMasterPassword] = useState('');
  const [masterError, setMasterError] = useState('');
  const [masterSubmitting, setMasterSubmitting] = useState(false);

  // Registered / Paid Customer Login state
  const [custEmail, setCustEmail] = useState('');
  const [custPassword, setCustPassword] = useState('');
  const [custError, setCustError] = useState('');

  // Firebase Email Sign-Up state
  const [signupFullName, setSignupFullName] = useState('');
  const [signupBusinessName, setSignupBusinessName] = useState('');
  const [signupVertical, setSignupVertical] = useState<BusinessVertical>('WARUNG_SEMBAKO');
  const [signupRegionCode, setSignupRegionCode] = useState<string>('ID-NONE');
  const [signupApplyRegionalTax, setSignupApplyRegionalTax] = useState<boolean>(false);
  const [signupWaNumber, setSignupWaNumber] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const handleMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterError('');
    setMasterSubmitting(true);
    const res = await loginAsMaster(masterEmail, masterPassword);
    setMasterSubmitting(false);
    if (!res.ok) {
      setMasterError(res.error || 'Login Master gagal.');
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
      setMasterError(res.error || 'Login Master gagal.');
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    const res = await loginAsCustomer(custEmail, custPassword);
    if (!res.ok) {
      setCustError(res.error || 'Login akun UMKM gagal. Pastikan email & kata sandi terdaftar.');
      return;
    }
    navigate(res.defaultRoute || '/dashboard');
  };

  const handleGoogleCustomer = async () => {
    setCustError('');
    const res = await signInWithGoogle();
    if (!res.ok) {
      setCustError(res.error || 'Login Google gagal.');
      return;
    }
    navigate(res.defaultRoute || '/dashboard');
  };

  const handleFirebaseEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    const res = await signInWithFirebaseEmail(custEmail, custPassword);
    if (!res.ok) {
      setCustError(res.error || 'Login Firebase Email gagal.');
      return;
    }
    navigate(res.defaultRoute || '/dashboard');
  };

  const handleFirebaseEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustError('');
    if (!signupFullName.trim() || !signupBusinessName.trim()) {
      setCustError('Nama pemilik dan nama usaha wajib diisi.');
      return;
    }
    const baseRegional = buildDefaultTenantRegionalTax(
      signupVertical,
      signupRegionCode,
      regionalTaxRegistry
    );
    const regionalTax = {
      ...baseRegional,
      applyRegionalTax: signupRegionCode !== 'ID-NONE' && signupApplyRegionalTax,
    };
    const res = await signUpWithFirebaseEmail({
      email: signupEmail,
      password: signupPassword,
      fullName: signupFullName,
      businessName: signupBusinessName,
      vertical: signupVertical,
      businessWhatsappNumber: signupWaNumber.trim() || undefined,
      regionalTax,
    });
    if (!res.ok) {
      setCustError(res.error || 'Pendaftaran akun Firebase gagal.');
      return;
    }
    navigate(res.defaultRoute || '/dashboard');
  };

  const handleGoogleMaster = async () => {
    setMasterError('');
    const res = await signInWithGoogle();
    if (!res.ok) {
      setMasterError(res.error || 'Login Google dibatalkan atau gagal.');
      return;
    }
    navigate(res.defaultRoute || '/master');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Beranda</span>
        </button>
        <span className="text-base font-bold tracking-tight text-slate-900">KasirAkun UMKM</span>
        <button
          type="button"
          onClick={() => navigate('/demo')}
          className="text-xs sm:text-sm font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
        >
          Coba Demo Gratis
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-12 gap-6 items-start">
          {/* Left: Strictly Registered/Paid User & Master Admin Login Card */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Portal Login Khusus Pengguna Terdaftar &amp; Master Admin
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                Masuk ke KasirAkun UMKM
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Halaman ini khusus untuk pengguna UMKM yang telah terdaftar / berlangganan paket,
                pegawai kasir/gudang, serta Master Admin.
              </p>
            </div>

            {/* Role Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'CUSTOMER'}
                onClick={() => {
                  setTab('CUSTOMER');
                  setCustError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'CUSTOMER'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Store className="w-4 h-4 text-emerald-600" />
                <span>Pengguna Terdaftar / Staf</span>
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
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'MASTER'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Master Admin</span>
              </button>
            </div>

            {tab === 'MASTER' ? (
              <form onSubmit={handleMasterSubmit} className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Akses Master Pemilik Aplikasi</span>
                  </p>
                  <p>
                    Kelola seluruh pengguna berbayar, atur kebijakan akses demo (wajib daftar /
                    persetujuan jadwal / durasi hari), dan kontrol modul aktif per akun.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="master-email"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="master-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Kata Sandi Master
                  </label>
                  <input
                    id="master-password"
                    type="password"
                    required
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="Masukkan kata sandi Master..."
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>

                {masterError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {masterError}
                  </p>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    data-testid="master-login-submit-btn"
                    disabled={masterSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4" />
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
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Masuk Cepat Master</span>
                    </button>
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={() => void handleGoogleMaster()}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Google Master (Cloud)</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={() => void handleGoogleCustomer()}
                  data-testid="google-cloud-login-btn"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-60"
                >
                  <Cloud className="w-4 h-4 text-emerald-700" />
                  <span>
                    {authLoading
                      ? 'Menghubungkan Firebase...'
                      : 'Masuk Cloud Firestore dengan Google'}
                  </span>
                </button>

                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthMode('SAAS_LOGIN');
                      setCustError('');
                    }}
                    className={`py-1.5 px-2 rounded-md transition-colors ${
                      customerAuthMode === 'SAAS_LOGIN'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Akun Berbayar / Staf
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthMode('FIREBASE_SIGNIN');
                      setCustError('');
                    }}
                    className={`py-1.5 px-2 rounded-md transition-colors ${
                      customerAuthMode === 'FIREBASE_SIGNIN'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Email Cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerAuthMode('FIREBASE_SIGNUP');
                      setCustError('');
                    }}
                    data-testid="firebase-signup-tab-btn"
                    className={`py-1.5 px-2 rounded-md transition-colors ${
                      customerAuthMode === 'FIREBASE_SIGNUP'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Daftar Cloud
                  </button>
                </div>

                {customerAuthMode === 'FIREBASE_SIGNUP' ? (
                  <form onSubmit={handleFirebaseEmailSignUp} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="fb-signup-name"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Nama Pemilik
                        </label>
                        <input
                          id="fb-signup-name"
                          type="text"
                          required
                          value={signupFullName}
                          onChange={(e) => setSignupFullName(e.target.value)}
                          placeholder="Sari Kusuma"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="fb-signup-biz"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Nama Usaha / Toko
                        </label>
                        <input
                          id="fb-signup-biz"
                          type="text"
                          required
                          value={signupBusinessName}
                          onChange={(e) => setSignupBusinessName(e.target.value)}
                          placeholder="Toko Berkah Mandiri"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="fb-signup-vertical"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Bidang Usaha UMKM (22 Pilihan)
                      </label>
                      <select
                        id="fb-signup-vertical"
                        value={signupVertical}
                        onChange={(e) => {
                          const nextV = e.target.value as BusinessVertical;
                          setSignupVertical(nextV);
                          const pbjtCat = getVerticalPbjtCategory(nextV);
                          setSignupApplyRegionalTax(
                            signupRegionCode !== 'ID-NONE' && pbjtCat !== 'NONE'
                          );
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                      >
                        {SIGNUP_GROUP_ORDER.map((groupKey) => (
                          <optgroup key={groupKey} label={VERTICAL_GROUP_LABELS[groupKey]}>
                            {ACTIVE_VERTICAL_DEFINITIONS.filter(
                              (v) => v.categoryGroup === groupKey
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
                          htmlFor="fb-signup-region"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Domisili Pajak Daerah (PBJT)
                        </label>
                        <select
                          id="fb-signup-region"
                          value={signupRegionCode}
                          onChange={(e) => {
                            const code = e.target.value;
                            setSignupRegionCode(code);
                            const pbjtCat = getVerticalPbjtCategory(signupVertical);
                            setSignupApplyRegionalTax(code !== 'ID-NONE' && pbjtCat !== 'NONE');
                          }}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
                        >
                          {regionalTaxRegistry.map((r) => (
                            <option key={r.regionCode} value={r.regionCode}>
                              {r.regionCode === 'ID-NONE'
                                ? 'Bebas / Tanpa Pajak Daerah (0%)'
                                : `${r.cityName} (${r.province})`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="fb-signup-wa"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Nomor WhatsApp Usaha (wa.me Gratis)
                        </label>
                        <input
                          id="fb-signup-wa"
                          type="tel"
                          value={signupWaNumber}
                          onChange={(e) => setSignupWaNumber(e.target.value)}
                          placeholder="0812-xxxx-xxxx"
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    {signupRegionCode !== 'ID-NONE' &&
                      getVerticalPbjtCategory(signupVertical) !== 'NONE' && (
                        <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={signupApplyRegionalTax}
                            onChange={(e) => setSignupApplyRegionalTax(e.target.checked)}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600"
                          />
                          <span>
                            Terapkan Pajak Daerah (PBJT) sesuai domisili. Hapus centang bila omzet
                            di bawah batas pengecualian UMKM daerah.
                          </span>
                        </label>
                      )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="fb-signup-email"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Email
                        </label>
                        <input
                          id="fb-signup-email"
                          type="email"
                          required
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          placeholder="pemilik@usahaku.id"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="fb-signup-pass"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Kata Sandi (min. 6 karakter)
                        </label>
                        <input
                          id="fb-signup-pass"
                          type="password"
                          required
                          minLength={6}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    {custError && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {custError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      data-testid="firebase-signup-submit-btn"
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>
                        {authLoading
                          ? 'Mendaftarkan Akun Cloud...'
                          : 'Daftar & Mulai Workspace Cloud'}
                      </span>
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={
                      customerAuthMode === 'FIREBASE_SIGNIN'
                        ? handleFirebaseEmailSignIn
                        : handleCustomerSubmit
                    }
                    className="space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="cust-email"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        {customerAuthMode === 'FIREBASE_SIGNIN'
                          ? 'Email Firebase Cloud'
                          : 'Email Akun Terdaftar / Pegawai'}
                      </label>
                      <input
                        id="cust-email"
                        type="email"
                        required
                        value={custEmail}
                        onChange={(e) => setCustEmail(e.target.value)}
                        placeholder="nama@usahaku.id"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cust-password"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Kata Sandi
                      </label>
                      <input
                        id="cust-password"
                        type="password"
                        required
                        value={custPassword}
                        onChange={(e) => setCustPassword(e.target.value)}
                        placeholder="Masukkan kata sandi akun..."
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    {custError && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {custError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      data-testid="customer-login-submit-btn"
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>
                        {customerAuthMode === 'FIREBASE_SIGNIN'
                          ? 'Masuk via Firebase Email'
                          : 'Masuk ke Workspace Usaha'}
                      </span>
                    </button>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Pemilik usaha yang sudah membeli paket, pengguna demo terdaftar, maupun pegawai
                      (Kasir, Gudang, Kapster, Akuntansi) masuk dengan email &amp; sandi terdaftar.
                    </p>
                  </form>
                )}
              </div>
            )}
          </section>

          {/* Right: Guidance Panel — Real Registration vs Coba Gratis & Simulasi */}
          <aside className="lg:col-span-5 space-y-4">
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-emerald-950">
                    Belum Punya Akun? Daftar Akun Usaha Asli
                  </h2>
                  <p className="text-xs text-emerald-900/80 mt-1.5 leading-relaxed">
                    Pilih paket berlangganan (BASIC Rp100rb, PRO Rp199rb, atau EXPERT Rp349rb)
                    sesuai kebutuhan usaha Anda dan langsung aktifkan ruang kerja bersih untuk toko
                    Anda.
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="login-goto-onboarding-btn"
                onClick={() => navigate('/onboarding?mode=real')}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <span>Daftar &amp; Beli Paket Akun Asli</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center">
                <Play className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Ingin Coba Dulu Sebelum Berlangganan?
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Gunakan halaman <strong>Coba Gratis &amp; Simulasi</strong> untuk memilih jenis
                  UMKM dan mencoba langsung simulasi paket fitur secara gratis.
                </p>
              </div>
              <button
                type="button"
                data-testid="login-goto-demo-btn"
                onClick={() => navigate('/demo')}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <span>Buka Menu Coba Gratis &amp; Simulasi</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-900 text-slate-300 rounded-2xl p-5 space-y-2 text-xs">
              <p className="font-semibold text-white flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Data Usaha Aman &amp; Terpisah</span>
              </p>
              <p className="leading-relaxed">
                Setiap akun usaha memiliki ruang data sendiri yang terpisah. Catatan transaksi,
                stok barang, dan laporan keuangan Anda tidak pernah bercampur dengan akun demo atau
                usaha lain.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
