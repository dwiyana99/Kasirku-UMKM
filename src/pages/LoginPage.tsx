import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Store,
  User,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  authClient,
  fetchAuthConfigStatus,
  type AuthConfigStatusResponse,
} from '../lib/auth-client';

interface LoginPageProps {
  initialTab?: 'CUSTOMER' | 'MASTER';
  initialMode?: 'LOGIN' | 'REGISTER';
}

type RecoveryView = 'NONE' | 'FORGOT_PASSWORD' | 'FIND_ACCOUNT';

function GoogleLogoIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.29a12 12 0 0 0 0 10.8l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4 3.1C6.23 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  );
}

export function LoginPage({
  initialTab = 'CUSTOMER',
  initialMode = 'LOGIN',
}: LoginPageProps) {
  const {
    loginAsMaster,
    loginAsCustomer,
    hydrateFromBetterAuthSession,
    betterAuthError,
    navigate,
  } = useApp();

  const [tab, setTab] = useState<'CUSTOMER' | 'MASTER'>(initialTab);
  const [customerMode, setCustomerMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);
  const [recoveryView, setRecoveryView] = useState<RecoveryView>('NONE');

  // Shared credentials state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration state (unified Better Auth email sign-up -> onboarding)
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Recovery state (Forgot Password / Find Account)
  const [recIdentifier, setRecIdentifier] = useState('');
  const [recStep, setRecStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [recCode, setRecCode] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recConfirmPassword, setRecConfirmPassword] = useState('');
  const [recMaskedTarget, setRecMaskedTarget] = useState('');
  const [recDevCode, setRecDevCode] = useState<string | null>(null);
  const [recMessage, setRecMessage] = useState<string | null>(null);
  const [recFoundAccounts, setRecFoundAccounts] = useState<
    Array<{
      roleLabel: string;
      maskedEmail: string;
      maskedUsername: string | null;
      fullName: string;
      allowGoogleLogin: boolean;
      allowPasswordLogin: boolean;
    }>
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [authConfig, setAuthConfig] = useState<AuthConfigStatusResponse>({
    googleAuthConfigured: false,
    betterAuthSecretConfigured: false,
    databaseConfigured: false,
    betterAuthReady: false,
  });

  // Sync tab/mode with route changes & detect ?reason=idle_timeout
  useEffect(() => {
    setTab(initialTab);
    setCustomerMode(initialMode);
    setRecoveryView('NONE');
    setError(null);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'idle_timeout') {
        setNotice(
          'Sesi Anda berakhir otomatis karena tidak ada aktivitas. Silakan masuk kembali.'
        );
      } else {
        setNotice(null);
      }
    }
  }, [initialTab, initialMode]);

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
    if (betterAuthError) {
      setError(betterAuthError);
    }
  }, [betterAuthError]);

  // Listen for Google OAuth popup completion postMessage (iframe-safe)
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as
        | { type?: string; handoffCode?: string; error?: string }
        | null;
      if (!payload || payload.type !== 'KASIRAKUN_OAUTH_COMPLETE') return;
      if (payload.error) {
        setIsGoogleLoading(false);
        setError(payload.error);
        return;
      }
      if (!payload.handoffCode) {
        setIsGoogleLoading(false);
        setError('Kode verifikasi Google tidak ditemukan. Silakan coba lagi.');
        return;
      }
      const res = await hydrateFromBetterAuthSession(payload.handoffCode);
      setIsGoogleLoading(false);
      if (!res.ok) {
        setError(res.error || 'Gagal memuat sesi Google.');
        return;
      }
      if (res.needsOnboarding) {
        navigate('/onboarding?mode=real&source=oauth');
      } else if (res.defaultRoute) {
        navigate(res.defaultRoute);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [hydrateFromBetterAuthSession, navigate]);

  const handleTabSwitch = (nextTab: 'CUSTOMER' | 'MASTER') => {
    setTab(nextTab);
    setCustomerMode('LOGIN');
    setRecoveryView('NONE');
    setError(null);
    setRecMessage(null);
    setIdentifier('');
    setPassword('');
  };

  /**
   * Unified Google OAuth launcher shared by BOTH Pemilik/Staf and Master Admin tabs.
   * Uses Better Auth social sign-in (`provider: 'google'`) matching the single
   * Google Cloud Console Redirect URI: `{origin}/api/auth/callback/google`.
   */
  const launchGoogleOAuth = async (targetRole: 'CUSTOMER' | 'MASTER') => {
    setError(null);
    if (!authConfig.googleAuthConfigured || !authConfig.betterAuthReady) {
      setError(
        'Login Google belum aktif di server ini. Gunakan email/username dan kata sandi, atau lengkapi konfigurasi Google OAuth di server.'
      );
      return;
    }

    setIsGoogleLoading(true);
    try {
      let inIframe = false;
      try {
        inIframe = window.self !== window.top;
      } catch {
        inIframe = true;
      }

      const callbackURL = inIframe
        ? `${window.location.origin}/api/auth/oauth-popup-done`
        : targetRole === 'MASTER'
        ? `${window.location.origin}/master`
        : `${window.location.origin}/dashboard`;

      if (inIframe) {
        const res = await authClient.signIn.social({
          provider: 'google',
          callbackURL,
          newUserCallbackURL: `${window.location.origin}/api/auth/oauth-popup-done`,
          disableRedirect: true,
        });
        if (res.error) {
          setIsGoogleLoading(false);
          setError(res.error.message || 'Gagal memulai login Google.');
          return;
        }
        const authUrl = (res.data as { url?: string } | null)?.url;
        if (!authUrl) {
          setIsGoogleLoading(false);
          setError('URL otorisasi Google tidak tersedia dari server.');
          return;
        }
        const popup = window.open(
          authUrl,
          'kasirakun_google_oauth',
          'width=520,height=660,menubar=no,toolbar=no,status=no'
        );
        if (!popup) {
          setIsGoogleLoading(false);
          setError('Jendela popup diblokir browser. Izinkan popup untuk melanjutkan login Google.');
          return;
        }
        const pollTimer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(pollTimer);
            setIsGoogleLoading(false);
          }
        }, 700);
        return;
      }

      const res = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        newUserCallbackURL: `${window.location.origin}/onboarding?mode=real&source=oauth`,
      });
      if (res.error) {
        setIsGoogleLoading(false);
        setError(res.error.message || 'Gagal memulai login Google.');
      }
    } catch {
      setIsGoogleLoading(false);
      setError('Gagal menghubungi layanan autentikasi Google.');
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const idTrim = identifier.trim();
    if (!idTrim || !password) {
      setError('Masukkan email atau username beserta kata sandi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (tab === 'MASTER') {
        const res = await loginAsMaster(idTrim, password);
        if (!res.ok) {
          setError(res.error || 'Email/username atau kata sandi Master Admin tidak cocok.');
          return;
        }
        navigate('/master');
        return;
      }

      const res = await loginAsCustomer(idTrim, password);
      if (!res.ok) {
        setError(res.error || 'Email/username atau kata sandi tidak cocok.');
        return;
      }
      navigate(res.defaultRoute || '/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      setError('Lengkapi nama lengkap, email, dan kata sandi.');
      return;
    }
    if (regPassword.length < 8) {
      setError('Kata sandi minimal 8 karakter.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authConfig.betterAuthReady) {
        const signUpRes = await authClient.signUp.email({
          email: regEmail.trim().toLowerCase(),
          password: regPassword,
          name: regName.trim(),
        });
        if (signUpRes.error) {
          setError(
            signUpRes.error.message ||
              'Pendaftaran akun gagal. Pastikan email belum pernah terdaftar.'
          );
          return;
        }
        await hydrateFromBetterAuthSession();
      }
      navigate('/onboarding?mode=real');
    } catch {
      setError('Gagal membuat akun baru. Silakan coba kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecMessage(null);
    if (!recIdentifier.trim()) {
      setError('Masukkan email atau username akun Anda.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: recIdentifier.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        maskedEmail?: string;
        devCode?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || 'Gagal mengirim kode pemulihan.');
        return;
      }
      setRecMaskedTarget(data.maskedEmail || recIdentifier.trim());
      setRecDevCode(data.devCode ?? null);
      setRecMessage(data.message || 'Kode pemulihan 6 digit telah dibuat.');
      setRecStep('VERIFY');
    } catch {
      setError('Gagal menghubungi server pemulihan sandi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!recCode.trim() || recNewPassword.length < 6) {
      setError('Masukkan kode 6 digit dan kata sandi baru minimal 6 karakter.');
      return;
    }
    if (recNewPassword !== recConfirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: recIdentifier.trim(),
          code: recCode.trim(),
          newPassword: recNewPassword,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'Kode verifikasi salah atau kedaluwarsa.');
        return;
      }
      setRecoveryView('NONE');
      setRecStep('REQUEST');
      setRecCode('');
      setRecNewPassword('');
      setRecConfirmPassword('');
      setRecDevCode(null);
      setNotice(data.message || 'Kata sandi berhasil diperbarui. Silakan masuk.');
    } catch {
      setError('Gagal memperbarui kata sandi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFindAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecFoundAccounts([]);
    if (!recIdentifier.trim()) {
      setError('Masukkan nomor HP, username, atau nama usaha Anda.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: recIdentifier.trim() }),
      });
      const data = (await res.json()) as {
        matches?: typeof recFoundAccounts;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'Pencarian akun gagal.');
        return;
      }
      setRecFoundAccounts(data.matches ?? []);
      if (!data.matches || data.matches.length === 0) {
        setError('Tidak ditemukan akun yang cocok dengan data tersebut.');
      }
    } catch {
      setError('Gagal mencari akun di server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] text-stone-900 flex flex-col">
      {/* Minimal Header */}
      <header className="w-full border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 transition-colors hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md px-1.5 py-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Beranda
          </button>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Store className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">
              KasirAkun <span className="font-medium text-stone-500">UMKM</span>
            </span>
          </button>

          <div className="w-16" aria-hidden="true" />
        </div>
      </header>

      {/* Single-Column Centered Auth Card */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="rounded-xl border border-stone-200 bg-white p-6 sm:p-7">
            {/* Heading */}
            <div className="mb-5">
              <h1 className="text-xl font-bold tracking-[-0.02em] text-stone-900">
                {recoveryView === 'FORGOT_PASSWORD'
                  ? 'Reset Kata Sandi'
                  : recoveryView === 'FIND_ACCOUNT'
                  ? 'Cari Akun Anda'
                  : tab === 'MASTER'
                  ? 'Masuk Master Admin'
                  : customerMode === 'REGISTER'
                  ? 'Buat Akun Usaha'
                  : 'Masuk ke KasirAkun'}
              </h1>
              <p className="mt-1 text-xs text-stone-500">
                {recoveryView === 'FORGOT_PASSWORD'
                  ? 'Verifikasi dengan kode 6 digit untuk membuat sandi baru.'
                  : recoveryView === 'FIND_ACCOUNT'
                  ? 'Temukan email atau username terdaftar melalui nomor HP atau nama usaha.'
                  : tab === 'MASTER'
                  ? 'Akses konsol pengelolaan platform dan akun pelanggan.'
                  : customerMode === 'REGISTER'
                  ? 'Mulai daftar akun pemilik usaha baru.'
                  : 'Masuk sebagai pemilik usaha atau pegawai.'}
              </p>
            </div>

            {/* Clean 2-Tab Switcher (hidden while inside Recovery view) */}
            {recoveryView === 'NONE' && (
              <div
                role="tablist"
                aria-label="Pilih tipe akun"
                className="mb-5 grid grid-cols-2 rounded-lg border border-stone-200 bg-stone-50 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'CUSTOMER'}
                  onClick={() => handleTabSwitch('CUSTOMER')}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    tab === 'CUSTOMER'
                      ? 'bg-white text-stone-900 shadow-xs border border-stone-200'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Store className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Pemilik & Staf
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'MASTER'}
                  onClick={() => handleTabSwitch('MASTER')}
                  className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                    tab === 'MASTER'
                      ? 'bg-white text-stone-900 shadow-xs border border-stone-200'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Master Admin
                </button>
              </div>
            )}

            {/* Idle timeout / success notice */}
            {notice && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>{notice}</span>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span>{error}</span>
              </div>
            )}

            {/* ================= RECOVERY: FORGOT PASSWORD ================= */}
            {recoveryView === 'FORGOT_PASSWORD' && (
              <div className="space-y-4">
                {recMessage && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <div>
                        <p>{recMessage}</p>
                        {recDevCode && (
                          <p className="mt-1 font-mono font-bold tabular-nums text-emerald-900">
                            Kode Verifikasi: {recDevCode}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {recStep === 'REQUEST' ? (
                  <form onSubmit={handleForgotPasswordRequest} className="space-y-3.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Email atau Username
                      </label>
                      <input
                        type="text"
                        value={recIdentifier}
                        onChange={(e) => setRecIdentifier(e.target.value)}
                        placeholder="nama@usaha.com atau username"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                      )}
                      Kirim Kode Reset
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordConfirm} className="space-y-3.5">
                    <p className="text-xs text-stone-600">
                      Akun target: <span className="font-semibold text-stone-900">{recMaskedTarget}</span>
                    </p>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Kode 6 Digit
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={recCode}
                        onChange={(e) => setRecCode(e.target.value)}
                        placeholder="000000"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 font-mono text-sm tracking-widest tabular-nums text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Kata Sandi Baru
                      </label>
                      <input
                        type="password"
                        value={recNewPassword}
                        onChange={(e) => setRecNewPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Ulangi Kata Sandi Baru
                      </label>
                      <input
                        type="password"
                        value={recConfirmPassword}
                        onChange={(e) => setRecConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi baru"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
                      Simpan Kata Sandi Baru
                    </button>
                  </form>
                )}

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryView('NONE');
                      setRecStep('REQUEST');
                      setError(null);
                      setRecMessage(null);
                    }}
                    className="font-medium text-stone-600 hover:text-stone-900"
                  >
                    Kembali ke Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryView('FIND_ACCOUNT');
                      setError(null);
                      setRecMessage(null);
                    }}
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Lupa email / username?
                  </button>
                </div>
              </div>
            )}

            {/* ================= RECOVERY: FIND ACCOUNT ================= */}
            {recoveryView === 'FIND_ACCOUNT' && (
              <div className="space-y-4">
                <form onSubmit={handleFindAccount} className="space-y-3.5">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-stone-700">
                      Nomor HP, Username, atau Nama Usaha
                    </label>
                    <input
                      type="text"
                      value={recIdentifier}
                      onChange={(e) => setRecIdentifier(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
                    Cari Akun
                  </button>
                </form>

                {recFoundAccounts.length > 0 && (
                  <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-stone-50">
                    {recFoundAccounts.map((acc, idx) => (
                      <div key={idx} className="p-3 text-xs">
                        <p className="font-semibold text-stone-900">
                          {acc.fullName}{' '}
                          <span className="font-normal text-stone-500">({acc.roleLabel})</span>
                        </p>
                        <p className="mt-0.5 font-mono text-stone-700">
                          {acc.maskedEmail}
                          {acc.maskedUsername ? ` · @${acc.maskedUsername}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryView('NONE');
                      setError(null);
                    }}
                    className="font-medium text-stone-600 hover:text-stone-900"
                  >
                    Kembali ke Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryView('FORGOT_PASSWORD');
                      setRecStep('REQUEST');
                      setError(null);
                    }}
                    className="font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Reset kata sandi
                  </button>
                </div>
              </div>
            )}

            {/* ================= MAIN LOGIN / REGISTER FORM ================= */}
            {recoveryView === 'NONE' && (
              <div className="space-y-4">
                {/* Unified Google OAuth Button (Identical across Customer & Master Admin) */}
                <button
                  type="button"
                  disabled={isGoogleLoading}
                  onClick={() => void launchGoogleOAuth(tab)}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition-colors hover:bg-stone-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-stone-600" strokeWidth={1.75} />
                  ) : (
                    <GoogleLogoIcon />
                  )}
                  <span>
                    {customerMode === 'REGISTER' && tab === 'CUSTOMER'
                      ? 'Daftar dengan Google'
                      : 'Masuk dengan Google'}
                  </span>
                </button>

                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-stone-200" />
                  <span className="mx-3 text-[11px] font-medium text-stone-400">atau</span>
                  <div className="flex-grow border-t border-stone-200" />
                </div>

                {tab === 'CUSTOMER' && customerMode === 'REGISTER' ? (
                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Nama Lengkap
                      </label>
                      <div className="relative">
                        <User
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                          strokeWidth={1.75}
                        />
                        <input
                          type="text"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="Nama pemilik usaha"
                          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Email
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                          strokeWidth={1.75}
                        />
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="pemilik@usaha.com"
                          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Kata Sandi
                      </label>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                          strokeWidth={1.75}
                        />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Minimal 8 karakter"
                          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-10 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-stone-700">
                        Ulangi Kata Sandi
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi"
                        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <>
                          Lanjut Pilih Paket
                          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                        </>
                      )}
                    </button>

                    <p className="pt-1 text-center text-xs text-stone-500">
                      Sudah punya akun?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerMode('LOGIN');
                          setError(null);
                        }}
                        className="font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Masuk di sini
                      </button>
                    </p>
                  </form>
                ) : (
                  <form onSubmit={handleManualLogin} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="login-identifier"
                        className="mb-1.5 block text-xs font-medium text-stone-700"
                      >
                        Email atau Username
                      </label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                          strokeWidth={1.75}
                        />
                        <input
                          id="login-identifier"
                          type="text"
                          autoComplete="username"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          placeholder={
                            tab === 'MASTER'
                              ? 'master@kasirakun.id atau master'
                              : 'email@usaha.com atau username'
                          }
                          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor="login-password"
                          className="block text-xs font-medium text-stone-700"
                        >
                          Kata Sandi
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryView('FORGOT_PASSWORD');
                            setRecStep('REQUEST');
                            setRecIdentifier(identifier);
                            setError(null);
                          }}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          Lupa sandi?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                          strokeWidth={1.75}
                        />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Masukkan kata sandi"
                          className="w-full rounded-lg border border-stone-300 bg-white py-2.5 pl-9 pr-10 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" strokeWidth={1.75} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={1.75} />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                      ) : (
                        <>
                          Masuk
                          <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Compact Single-Line Footer Links */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-stone-500">
            <button
              type="button"
              onClick={() => navigate('/onboarding?mode=real')}
              className="font-medium text-stone-700 transition-colors hover:text-emerald-700"
            >
              Daftar Akun
            </button>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <button
              type="button"
              onClick={() => navigate('/onboarding?mode=simulation')}
              className="font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
            >
              Mulai Simulasi
            </button>
            <span aria-hidden="true" className="text-stone-300">
              ·
            </span>
            <button
              type="button"
              onClick={() => navigate('/demo')}
              className="font-medium text-stone-700 transition-colors hover:text-emerald-700"
            >
              Coba Demo
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
