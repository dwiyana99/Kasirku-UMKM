/**
 * Tenant Payment Gateway Settings, 4-Step Beginner Tutorial Wizard,
 * Fee Bearer Toggle (Ditanggung Pembeli vs Ditanggung Toko), H+1 Settlement Reconciliation,
 * and "Minta Tolong Master Admin Bantu Setting" Request Form with Anti-OTP/PIN Safety Banner.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Landmark,
  Monitor,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatRupiah as formatIDR } from '../lib/pos/checkout-service';
import {
  DEFAULT_ENABLED_CHANNELS,
  DEFAULT_PAYMENT_CONFIG_RATES,
  computePaymentBreakdown,
} from '../lib/payments/fee-calculator';
import {
  getProviderDisplayName,
  getProviderRegisterLink,
} from '../lib/payments/wa-templates';
import type {
  BusinessLegalityType,
  EnabledPaymentChannels,
  FeeBearer,
  GatewayEnvironment,
  ManualBankAccount,
  PaymentGatewayProvider,
  PaymentSetupAssistanceRequest,
  SettlementBatch,
  TenantPaymentConfig,
} from '../types/domain';

interface ClientPaymentConfig extends TenantPaymentConfig {
  webhookUrls?: Record<'MIDTRANS', string>;
}

const PROVIDER_CARDS: Array<{
  code: PaymentGatewayProvider;
  title: string;
  badge: string;
  desc: string;
  bestFor: string;
}> = [
  {
    code: 'MIDTRANS',
    title: 'Midtrans',
    badge: 'Resmi & Populer',
    desc: 'QRIS Dinamis, Direct GoPay App-to-App, ShopeePay, dan VA BCA/Mandiri/BRI/BNI/Permata.',
    bestFor: 'Restoran, Kedai Makan, Retail, Kost & Jasa UMKM',
  },
  {
    code: 'MANUAL_ONLY',
    title: 'Transfer Manual (Kode Unik)',
    badge: 'Biaya Admin Rp0',
    desc: 'Pelanggan transfer ke rekening toko dengan kode unik 3 digit, lalu kasir klik ACC.',
    bestFor: 'Usaha baru yang belum daftar payment gateway',
  },
  {
    code: 'SIMULATOR',
    title: 'Mode Simulasi (Demo)',
    badge: 'Siap Tes Langsung',
    desc: 'Coba layar QRIS Dinamis, Layar Pelanggan, dan pelunasan otomatis tanpa daftar dulu.',
    bestFor: 'Uji coba & pelatihan kasir baru',
  },
];

const TUTORIAL_STEPS = [
  {
    step: 1,
    title: 'Daftar Akun Merchant Midtrans',
    desc: 'Daftar di dashboard resmi Midtrans memakai KTP/NIB & rekening pencairan milik Anda. Dana penjualan langsung cair ke rekening Anda, bukan ke KasirAkun.',
  },
  {
    step: 2,
    title: 'Salin Server Key & Client Key',
    desc: 'Setelah akun aktif, buka menu Settings → Access Keys di dashboard Midtrans, lalu salin Server Key dan Client Key.',
  },
  {
    step: 3,
    title: 'Tempel URL Webhook Otomatis',
    desc: 'Salin URL Webhook di bawah ini lalu tempel ke menu Settings → Configuration → Payment Notification URL di dashboard Midtrans agar QRIS/VA otomatis lunas.',
  },
  {
    step: 4,
    title: 'Klik Tes Koneksi & Mulai Jualan',
    desc: 'Simpan kunci (otomatis terenkripsi AES-256-GCM), klik "Tes Koneksi", lalu buka Layar Pelanggan di tablet/HP kasir. QRIS Dinamis langsung siap dipakai!',
  },
];

export const PaymentSettingsPage: React.FC = () => {
  const { activeWorkspace, activeBranchId, session, hasAddOn, navigate } = useApp();
  const tenant = activeWorkspace.tenant;
  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    }),
    [session.token]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [config, setConfig] = useState<ClientPaymentConfig | null>(null);
  const [provider, setProvider] = useState<PaymentGatewayProvider>('SIMULATOR');
  const [environment, setEnvironment] = useState<GatewayEnvironment>('SANDBOX');
  const [merchantCode, setMerchantCode] = useState('');
  const [serverKeyInput, setServerKeyInput] = useState('');
  const [clientKeyInput, setClientKeyInput] = useState('');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [feeBearer, setFeeBearer] = useState<FeeBearer>('CUSTOMER');
  const [qrisMdrPercent, setQrisMdrPercent] = useState<string>(DEFAULT_PAYMENT_CONFIG_RATES.qrisMdrPercent);
  const [vaFlatFee, setVaFlatFee] = useState<string>(DEFAULT_PAYMENT_CONFIG_RATES.vaFlatFee);
  const [ewalletFeePercent, setEwalletFeePercent] = useState<string>(
    DEFAULT_PAYMENT_CONFIG_RATES.ewalletFeePercent
  );
  const [enabledChannels, setEnabledChannels] = useState<EnabledPaymentChannels>({
    ...DEFAULT_ENABLED_CHANNELS,
  });
  const [manualBanks, setManualBanks] = useState<ManualBankAccount[]>([]);
  const [newBankName, setNewBankName] = useState('BCA');
  const [newBankNumber, setNewBankNumber] = useState('');
  const [newBankHolder, setNewBankHolder] = useState('');

  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const [activeTutorialStep, setActiveTutorialStep] = useState(1);

  // H+1 Settlement Reconciliation state
  const [settlements, setSettlements] = useState<SettlementBatch[]>([]);
  const [pendingReceivable, setPendingReceivable] = useState('0.0000');
  const [unsettledCount, setUnsettledCount] = useState(0);
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0, 10));
  const [settleGross, setSettleGross] = useState('');
  const [settleFee, setSettleFee] = useState('0');
  const [settleNotes, setSettleNotes] = useState('');
  const [settling, setSettling] = useState(false);

  // Assistance Request Modal state
  const [assistModalOpen, setAssistModalOpen] = useState(false);
  const [assistRequests, setAssistRequests] = useState<PaymentSetupAssistanceRequest[]>([]);
  const [assistProvider, setAssistProvider] = useState<'MIDTRANS' | 'MANUAL_ONLY'>('MIDTRANS');
  const [assistHasAccount, setAssistHasAccount] = useState(false);
  const [assistBankName, setAssistBankName] = useState('BCA');
  const [assistAccountHolder, setAssistAccountHolder] = useState(session.fullName || '');
  const [assistWhatsapp, setAssistWhatsapp] = useState(session.phone || '');
  const [assistLegality, setAssistLegality] = useState<BusinessLegalityType>('PERORANGAN_KTP');
  const [assistNotes, setAssistNotes] = useState('');
  const [assistSubmitting, setAssistSubmitting] = useState(false);

  const nonCashAllowed = hasAddOn('ADDON_NON_CASH_PAYMENT');
  const displayBranchId =
    activeBranchId && activeBranchId !== 'ALL'
      ? activeBranchId
      : activeWorkspace.branches?.[0]?.id || tenant.id;

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, stlRes, astRes] = await Promise.all([
        fetch(`/api/payments/config?tenantId=${encodeURIComponent(tenant.id)}`, {
          headers: authHeaders,
        }),
        fetch(`/api/payments/settlements?tenantId=${encodeURIComponent(tenant.id)}`, {
          headers: authHeaders,
        }),
        fetch(`/api/payments/assistance-requests?tenantId=${encodeURIComponent(tenant.id)}`, {
          headers: authHeaders,
        }),
      ]);
      if (!cfgRes.ok) {
        const errJson = (await cfgRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error || 'Gagal memuat konfigurasi pembayaran.');
      }
      const cfgJson = (await cfgRes.json()) as { config: ClientPaymentConfig };
      const c = cfgJson.config;
      setConfig(c);
      setProvider(c.provider);
      setEnvironment(c.environment);
      setMerchantCode(c.merchantCode || '');
      setFeeBearer(c.feeBearer);
      setQrisMdrPercent(c.qrisMdrPercent);
      setVaFlatFee(c.vaFlatFee);
      setEwalletFeePercent(c.ewalletFeePercent);
      setEnabledChannels(c.enabledChannels);
      setManualBanks(c.manualBankAccounts || []);

      if (stlRes.ok) {
        const stlJson = (await stlRes.json()) as {
          batches: SettlementBatch[];
          pendingReceivable: string;
          unsettledCount: number;
        };
        setSettlements(stlJson.batches || []);
        setPendingReceivable(stlJson.pendingReceivable || '0.0000');
        setUnsettledCount(stlJson.unsettledCount || 0);
        if (Number(stlJson.pendingReceivable) > 0 && !settleGross) {
          setSettleGross(String(Math.round(Number(stlJson.pendingReceivable))));
        }
      }
      if (astRes.ok) {
        const astJson = (await astRes.json()) as { requests: PaymentSetupAssistanceRequest[] };
        setAssistRequests(astJson.requests || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan pembayaran.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/config', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          tenantId: tenant.id,
          provider,
          environment,
          merchantCode: merchantCode.trim() || null,
          serverKey: serverKeyInput.trim() || undefined,
          clientKey: clientKeyInput.trim() || undefined,
          privateKey: privateKeyInput.trim() || undefined,
          feeBearer,
          qrisMdrPercent,
          vaFlatFee,
          ewalletFeePercent,
          enabledChannels,
          manualBankAccounts: manualBanks,
        }),
      });
      const json = (await res.json()) as { config?: ClientPaymentConfig; error?: string };
      if (!res.ok || !json.config) {
        throw new Error(json.error || 'Gagal menyimpan pengaturan pembayaran.');
      }
      setConfig(json.config);
      setServerKeyInput('');
      setClientKeyInput('');
      setPrivateKeyInput('');
      setFeedback({
        type: 'success',
        text: 'Pengaturan pembayaran tersimpan aman (API Key terenkripsi AES-256-GCM).',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/config/test', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tenantId: tenant.id,
          provider,
          environment,
          merchantCode: merchantCode.trim() || undefined,
          serverKey: serverKeyInput.trim() || undefined,
          clientKey: clientKeyInput.trim() || undefined,
          privateKey: privateKeyInput.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        message?: string;
        config?: ClientPaymentConfig;
        error?: string;
      };
      if (json.config) setConfig(json.config);
      setFeedback({
        type: json.ok ? 'success' : 'error',
        text: json.message || json.error || 'Tes koneksi selesai.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Gagal menghubungi server untuk tes koneksi.' });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhook = async (key: 'MIDTRANS', url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(key);
      window.setTimeout(() => setCopiedWebhook(null), 2000);
    } catch {
      setCopiedWebhook(key);
    }
  };

  const handleAddManualBank = () => {
    if (!newBankNumber.trim() || !newBankHolder.trim()) return;
    setManualBanks((prev) => [
      ...prev,
      {
        id: `bank-${Date.now().toString(36)}`,
        bankName: newBankName.trim() || 'BCA',
        accountNumber: newBankNumber.trim(),
        accountHolder: newBankHolder.trim(),
        isActive: true,
      },
    ]);
    setNewBankNumber('');
    setNewBankHolder('');
  };

  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const grossNum = Number(settleGross || 0);
    const feeNum = Number(settleFee || 0);
    const netNum = Math.max(0, grossNum - feeNum);
    if (grossNum <= 0) return;

    setSettling(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/settlements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tenantId: tenant.id,
          provider,
          settlementDate: settleDate,
          totalGross: String(grossNum),
          totalGatewayFee: String(feeNum),
          totalNetReceived: String(netNum),
          destinationBankAccountId: '1102',
          notes: settleNotes.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { batch?: SettlementBatch; error?: string };
      if (!res.ok) throw new Error(json.error || 'Gagal mencatat settlement.');
      setSettleGross('');
      setSettleFee('0');
      setSettleNotes('');
      setFeedback({
        type: 'success',
        text: 'Pencairan Settlement H+1 berhasil dicatat & jurnal Debit Bank (1102) / Kredit Piutang PG (1103) otomatis terbentuk!',
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat settlement.',
      });
    } finally {
      setSettling(false);
    }
  };

  const handleSubmitAssistRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssistSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/assistance-requests', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          tenantId: tenant.id,
          preferredProvider: assistProvider,
          hasExistingAccount: assistHasAccount,
          settlementBankName: assistBankName,
          settlementAccountHolder: assistAccountHolder,
          whatsappNumber: assistWhatsapp,
          businessLegality: assistLegality,
          notes: assistNotes,
        }),
      });
      const json = (await res.json()) as {
        request?: PaymentSetupAssistanceRequest;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Gagal mengirim permintaan bantuan.');
      setAssistModalOpen(false);
      setAssistNotes('');
      setFeedback({
        type: 'success',
        text: 'Permintaan bantuan setting pembayaran terkirim! Master Admin akan segera menghubungi WhatsApp Anda.',
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengirim permintaan bantuan.',
      });
    } finally {
      setAssistSubmitting(false);
    }
  };

  // Live preview of Rp100.000 transaction under current Fee Bearer setting
  const qrisSample = computePaymentBreakdown({
    baseAmount: 100000,
    paymentCategory: 'QRIS_DYNAMIC',
    feeBearer,
    qrisMdrPercent,
  });
  const vaSample = computePaymentBreakdown({
    baseAmount: 100000,
    paymentCategory: 'VIRTUAL_ACCOUNT',
    feeBearer,
    vaFlatFee,
  });

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
        Memuat pengaturan pembayaran non-tunai...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <p className="text-rose-800 font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
          >
            Coba Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  const activeWebhookProvider = 'MIDTRANS' as const;
  const activeWebhookUrl =
    config?.webhookUrls?.MIDTRANS ||
    `${window.location.origin}/api/webhooks/payment/midtrans/${tenant.id}`;

  return (
    <div className="space-y-6 pb-10">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Pembayaran Non-Tunai, QRIS Dinamis &amp; Rekening
            </h1>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {config?.setupStatus === 'ACTIVE'
                ? 'Aktif Terhubung'
                : config?.setupStatus === 'ASSISTANCE_REQUESTED'
                  ? 'Menunggu Bantuan Admin'
                  : config?.setupStatus === 'MANUAL_ONLY'
                    ? 'Transfer Manual'
                    : 'Mode Simulasi'}
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Hubungkan akun <strong>Midtrans</strong> milik toko Anda sendiri agar QRIS Dinamis,
            GoPay, ShopeePay, dan Virtual Account otomatis lunas &amp; cair langsung ke rekening Anda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={`/customer-display/${encodeURIComponent(displayBranchId)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="open-customer-display-link"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Monitor className="w-4 h-4 text-emerald-400" />
            Buka Layar Pelanggan
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>

          <button
            type="button"
            data-testid="btn-request-payment-assist"
            onClick={() => setAssistModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs sm:text-sm font-bold hover:bg-amber-400 transition-colors shadow-sm"
          >
            <HelpCircle className="w-4 h-4" />
            Minta Tolong Master Admin Bantu Setting
          </button>
        </div>
      </div>

      {/* Paket LITE Gate Notice */}
      {!nonCashAllowed && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-bold">Paket LITE hanya mengaktifkan pembayaran Tunai di Kasir</p>
              <p className="text-amber-800 mt-0.5">
                Anda tetap dapat menyiapkan pengaturan di sini. Untuk membuka pembayaran QRIS Dinamis,
                E-Wallet &amp; Virtual Account di Kasir, tambahkan <strong>Add-On Pembayaran Non-Tunai (+Rp25.000/bln)</strong> atau upgrade ke Paket BASIC.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings/plans')}
            className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
          >
            Kelola Paket &amp; Add-On
          </button>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 4-Step Beginner Tutorial Wizard */}
      <div className="bg-gradient-to-br from-emerald-50 via-white to-slate-50 border border-emerald-200/80 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Panduan Pemula 4 Langkah
            </p>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Cara Aktivasi QRIS Dinamis &amp; Pembayaran Otomatis (Tanpa Bingung)
            </h2>
          </div>
          <a
            href={getProviderRegisterLink(provider)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-50"
          >
            Daftar Resmi {getProviderDisplayName(provider)}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TUTORIAL_STEPS.map((item) => {
            const isActive = activeTutorialStep === item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setActiveTutorialStep(item.step)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-white border-emerald-500 shadow-sm ring-2 ring-emerald-100'
                    : 'bg-white/70 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {item.step}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{item.title}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Configuration Form */}
      <form onSubmit={handleSaveConfig} className="space-y-6">
        {/* Step 1: Provider Selection */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              1. Pilih Penyedia Pembayaran (Payment Gateway)
            </h2>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['SANDBOX', 'PRODUCTION'] as const).map((env) => (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvironment(env)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    environment === env
                      ? env === 'PRODUCTION'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {env === 'SANDBOX' ? 'Sandbox (Tes)' : 'Production (Live)'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PROVIDER_CARDS.map((card) => {
              const selected = provider === card.code;
              return (
                <button
                  key={card.code}
                  type="button"
                  data-testid={`provider-card-${card.code}`}
                  onClick={() => setProvider(card.code)}
                  className={`text-left p-4 rounded-xl border-2 transition-all flex flex-col justify-between ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-bold text-sm text-slate-900">{card.title}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </div>
                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 mb-2">
                      {card.badge}
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed">{card.desc}</p>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-semibold mt-3 pt-2 border-t border-slate-100">
                    Cocok: {card.bestFor}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Credentials & Webhook URL */}
        {provider !== 'SIMULATOR' && provider !== 'MANUAL_ONLY' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                  2. Kunci API {getProviderDisplayName(provider)} (Terenkripsi AES-256-GCM)
                </h2>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="w-4 h-4" /> Disimpan Terenkripsi
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Server Key Midtrans
                    {config?.maskedServerKey && (
                      <span className="ml-2 font-mono font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Tersimpan: {config.maskedServerKey}
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={serverKeyInput}
                    onChange={(e) => setServerKeyInput(e.target.value)}
                    placeholder={
                      config?.hasServerKey
                        ? 'Biarkan kosong jika tidak ingin mengganti kunci yang tersimpan'
                        : 'SB-Mid-server-xxxx atau Mid-server-xxxx'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                {provider === 'MIDTRANS' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Client Key Midtrans
                      {config?.maskedClientKey && (
                        <span className="ml-2 font-mono font-normal text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          Tersimpan: {config.maskedClientKey}
                        </span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={clientKeyInput}
                      onChange={(e) => setClientKeyInput(e.target.value)}
                      placeholder="SB-Mid-client-xxxx atau Mid-client-xxxx"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Webhook Copy Box */}
            <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                  Wajib Dipasang di Dashboard {getProviderDisplayName(provider)}
                </span>
                <h3 className="text-base font-bold">URL Webhook Pelunasan Otomatis</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Salin tautan di bawah ini lalu tempel di kolom <strong>Payment Notification / Callback URL</strong>{' '}
                  dashboard {getProviderDisplayName(provider)}. Setiap kali pelanggan selesai scan QRIS/VA,
                  kasir &amp; dapur langsung otomatis lunas!
                </p>
                <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs text-emerald-300 break-all">
                  {activeWebhookUrl}
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-copy-webhook"
                onClick={() => void handleCopyWebhook(activeWebhookProvider, activeWebhookUrl)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 transition-colors"
              >
                {copiedWebhook === activeWebhookProvider ? (
                  <>
                    <Check className="w-4 h-4" /> URL Webhook Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> 1-Klik Salin URL Webhook
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Manual Bank Accounts (always customizable as backup / MANUAL_ONLY) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" />
            Rekening Bank Toko (Untuk Transfer Manual Kode Unik)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {manualBanks.map((b) => (
              <div
                key={b.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-2"
              >
                <div>
                  <p className="text-xs font-bold text-emerald-700">{b.bankName}</p>
                  <p className="text-sm font-extrabold font-mono text-slate-900">{b.accountNumber}</p>
                  <p className="text-xs text-slate-600">a.n. {b.accountHolder}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setManualBanks((prev) => prev.filter((x) => x.id !== b.id))}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
            <input
              type="text"
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              placeholder="Nama Bank (BCA/BRI/Mandiri)"
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="text"
              value={newBankNumber}
              onChange={(e) => setNewBankNumber(e.target.value)}
              placeholder="Nomor Rekening"
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
            />
            <input
              type="text"
              value={newBankHolder}
              onChange={(e) => setNewBankHolder(e.target.value)}
              placeholder="Nama Pemilik Rekening"
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
            <button
              type="button"
              onClick={handleAddManualBank}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              + Tambah Rekening
            </button>
          </div>
        </div>

        {/* Step 3: Fee Bearer Toggle (Anti-Tax-Inflation) + Channels */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              3. Siapa yang Menanggung Biaya Admin / MDR Payment Gateway?
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Sesuai akuntansi pajak UMKM (PP 20/2026), jika biaya admin ditanggung pembeli maka
              dicatat ke akun Titipan <code className="font-mono">2109</code> agar{' '}
              <strong>tidak menggembungkan Omzet Bruto PPh Final 0,5%</strong> Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              data-testid="fee-bearer-customer"
              onClick={() => setFeeBearer('CUSTOMER')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                feeBearer === 'CUSTOMER'
                  ? 'border-emerald-600 bg-emerald-50/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-900">
                  Ditanggung Pembeli (Direkomendasikan)
                </span>
                {feeBearer === 'CUSTOMER' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <p className="text-xs text-slate-600">
                Toko menerima utuh 100% harga jual. Contoh belanja Rp100.000: pembeli bayar{' '}
                <strong>{formatIDR(qrisSample.totalPayable)}</strong> (QRIS) atau{' '}
                <strong>{formatIDR(vaSample.totalPayable)}</strong> (VA).
              </p>
            </button>

            <button
              type="button"
              data-testid="fee-bearer-merchant"
              onClick={() => setFeeBearer('MERCHANT')}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                feeBearer === 'MERCHANT'
                  ? 'border-emerald-600 bg-emerald-50/60'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-slate-900">Ditanggung Toko (Merchant)</span>
                {feeBearer === 'MERCHANT' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <p className="text-xs text-slate-600">
                Pembeli bayar pas Rp100.000. Potongan MDR otomatis dibukukan sebagai Beban Admin PG
                (Akun <code className="font-mono">6105</code>).
              </p>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tarif MDR QRIS (Desimal, 0.0070 = 0,7%)
              </label>
              <input
                type="text"
                value={qrisMdrPercent}
                onChange={(e) => setQrisMdrPercent(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Biaya Flat Virtual Account (Rp)
              </label>
              <input
                type="text"
                value={vaFlatFee}
                onChange={(e) => setVaFlatFee(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tarif E-Wallet Direct (0.0200 = 2%)
              </label>
              <input
                type="text"
                value={ewalletFeePercent}
                onChange={(e) => setEwalletFeePercent(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              />
            </div>
          </div>

          {/* Enabled Channels Toggle Grid */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-700 mb-2.5">
              Metode Pembayaran Aktif di Kasir &amp; Self-Order:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(
                [
                  ['qris_dynamic', 'QRIS Dinamis'],
                  ['ewallet_gopay', 'GoPay Direct'],
                  ['ewallet_shopeepay', 'ShopeePay Direct'],
                  ['ewallet_dana', 'DANA Direct'],
                  ['ewallet_ovo', 'OVO Push-to-Pay'],
                  ['va_bca', 'VA BCA'],
                  ['va_mandiri', 'VA Mandiri'],
                  ['va_bri', 'VA BRI'],
                  ['va_bni', 'VA BNI'],
                  ['va_bsi', 'VA BSI'],
                  ['va_permata', 'VA Permata'],
                  ['manual_transfer', 'Transfer Manual Kode Unik'],
                ] as Array<[keyof EnabledPaymentChannels, string]>
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(enabledChannels[key])}
                    onChange={(e) =>
                      setEnabledChannels((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4 text-emerald-600" />
              {testing ? 'Menguji Koneksi...' : 'Tes Koneksi'}
            </button>

            <button
              type="submit"
              data-testid="btn-save-payment-config"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Pembayaran'}
            </button>
          </div>
        </div>
      </form>

      {/* H+1 Settlement Reconciliation Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" />
              Rekonsiliasi Pencairan Dana Settlement (H+1 / H+2)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Saat dana QRIS/VA dari Midtrans masuk ke rekening bank Anda, catat di sini
              agar saldo otomatis pindah dari <strong>Piutang PG (1103)</strong> ke{' '}
              <strong>Bank Utama (1102)</strong>.
            </p>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-right">
            <p className="text-[11px] font-semibold text-emerald-700">
              Estimasi Piutang PG Belum Cair ({unsettledCount} transaksi)
            </p>
            <p className="text-lg font-extrabold font-mono text-emerald-900">
              {formatIDR(pendingReceivable)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmitSettlement} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Tanggal Cair</label>
            <input
              type="date"
              value={settleDate}
              onChange={(e) => setSettleDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Total Cair Masuk Bank (Rp)</label>
            <input
              type="number"
              min="1"
              value={settleGross}
              onChange={(e) => setSettleGross(e.target.value)}
              placeholder="Contoh: 450000"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Biaya Transfer Payout (Rp)</label>
            <input
              type="number"
              min="0"
              value={settleFee}
              onChange={(e) => setSettleFee(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Catatan</label>
            <input
              type="text"
              value={settleNotes}
              onChange={(e) => setSettleNotes(e.target.value)}
              placeholder="Pencairan ke BCA"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={settling}
              className="w-full px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 disabled:opacity-60"
            >
              {settling ? 'Mencatat...' : 'Catat Dana Cair'}
            </button>
          </div>
        </form>

        {settlements.length > 0 && (
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Tanggal</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3 text-right">Net Masuk Bank (1102)</th>
                  <th className="py-2 pr-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.slice(0, 6).map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3 font-mono">{b.settlementDate}</td>
                    <td className="py-2 pr-3 font-semibold">{b.provider}</td>
                    <td className="py-2 pr-3 text-right font-mono font-bold text-emerald-700">
                      {formatIDR(b.totalNetReceived)}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{b.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Existing Assistance Requests History */}
      {assistRequests.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Riwayat Permintaan Bantuan Setting Pembayaran Anda
          </h3>
          <div className="space-y-2">
            {assistRequests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {getProviderDisplayName(req.preferredProvider)} → Rekening {req.settlementBankName}{' '}
                    a.n. {req.settlementAccountHolder}
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    WA: {req.whatsappNumber} • Dibuat {new Date(req.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg font-bold ${
                    req.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : req.status === 'IN_PROGRESS'
                        ? 'bg-sky-100 text-sky-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {req.status === 'COMPLETED'
                    ? 'Selesai & Aktif'
                    : req.status === 'IN_PROGRESS'
                      ? 'Sedang Diproses Admin'
                      : 'Menunggu Dihubungi'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Minta Tolong Master Admin Bantu Setting */}
      {assistModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            data-testid="payment-assist-modal"
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Minta Tolong Master Admin Bantu Setting
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Bingung daftar Midtrans atau pasang API Key? Tim kami siap pandu sampai QRIS aktif!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssistModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Yellow Anti-OTP / PIN / Password Warning Banner */}
            <div
              data-testid="anti-otp-warning-banner"
              className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3.5 flex items-start gap-3"
            >
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 leading-relaxed">
                <p className="font-extrabold uppercase tracking-wide text-amber-800 mb-0.5">
                  Peringatan Keamanan Penting!
                </p>
                <p>
                  <strong>JANGAN PERNAH</strong> membagikan foto KTP, PIN ATM, Password m-Banking,
                  Password login Midtrans, ataupun <strong>Kode OTP</strong> kepada
                  siapa pun termasuk Master Admin. Tim kami hanya membantu panduan langkah demi
                  langkah &amp; pemasangan API Key.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitAssistRequest} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Provider Pilihan
                  </label>
                  <select
                    value={assistProvider}
                    onChange={(e) =>
                      setAssistProvider(
                        e.target.value as 'MIDTRANS' | 'MANUAL_ONLY'
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  >
                    <option value="MIDTRANS">Midtrans (QRIS + GoPay + VA)</option>
                    <option value="MANUAL_ONLY">Transfer Manual Kode Unik</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Legalitas Usaha
                  </label>
                  <select
                    value={assistLegality}
                    onChange={(e) => setAssistLegality(e.target.value as BusinessLegalityType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  >
                    <option value="PERORANGAN_KTP">Perorangan (KTP Pribadi)</option>
                    <option value="PT_PERORANGAN">PT Perorangan / NIB</option>
                    <option value="CV_PT">CV / PT Badan Usaha</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assistHasAccount}
                  onChange={(e) => setAssistHasAccount(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Saya sudah punya akun di provider tersebut (tinggal bantu pasang API Key)</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bank Rekening Pencairan
                  </label>
                  <input
                    type="text"
                    value={assistBankName}
                    onChange={(e) => setAssistBankName(e.target.value)}
                    placeholder="BCA / BRI / Mandiri / BSI"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Pemilik Rekening
                  </label>
                  <input
                    type="text"
                    value={assistAccountHolder}
                    onChange={(e) => setAssistAccountHolder(e.target.value)}
                    placeholder="Sesuai buku tabungan"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nomor WhatsApp Aktif (Untuk Dihubungi Tim Support)
                </label>
                <input
                  type="tel"
                  value={assistWhatsapp}
                  onChange={(e) => setAssistWhatsapp(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={assistNotes}
                  onChange={(e) => setAssistNotes(e.target.value)}
                  placeholder="Contoh: Mohon hubungi jam 14.00 WIB saat toko agak senggang"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssistModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={assistSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                >
                  {assistSubmitting ? 'Mengirim...' : 'Kirim Permintaan Bantuan'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
