/**
 * Master Admin Panel: Pengaturan Pembayaran Non-Tunai per User (Terisolasi Penuh)
 * - Tab 1: Atur Langsung per User (Tanpa Perlu Request Terlebih Dahulu)
 *   Master Admin bisa langsung memilih akun usaha mana saja dan mengisi kredensial
 *   Midtrans / Duitku / Tripay / Transfer Manual secara terenkripsi & 100% terpisah per tenant.
 * - Tab 2: Antrean Permintaan Bantuan (Tiket dari UMKM + Template WA 1-Klik)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Lock,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  buildWaMeUrl,
  getProviderDisplayName,
  getProviderRegisterLink,
  renderWaTemplate,
} from '../../lib/payments/wa-templates';
import type {
  FeeBearer,
  GatewayEnvironment,
  PaymentGatewayProvider,
  PaymentSetupAssistanceRequest,
  TenantPaymentConfig,
  WaMessageTemplate,
} from '../../types/domain';

interface SanitizedTenantPaymentConfig extends TenantPaymentConfig {
  webhookUrls?: Record<'MIDTRANS' | 'DUITKU' | 'TRIPAY', string>;
}

interface DirectTenantPaymentItem {
  tenantId: string;
  tenantName: string;
  vertical: string;
  planCode: string;
  isDemo: boolean;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  config: SanitizedTenantPaymentConfig;
}

interface EnrichedAssistRequest extends PaymentSetupAssistanceRequest {
  currentConfig?: SanitizedTenantPaymentConfig;
}

interface PaymentAssistancePanelProps {
  authToken?: string;
}

type ActiveTarget =
  | { kind: 'DIRECT'; tenant: DirectTenantPaymentItem }
  | { kind: 'TICKET'; ticket: EnrichedAssistRequest };

export const PaymentAssistancePanel: React.FC<PaymentAssistancePanelProps> = ({ authToken }) => {
  const [subTab, setSubTab] = useState<'DIRECT' | 'QUEUE'>('DIRECT');
  const [tenantItems, setTenantItems] = useState<DirectTenantPaymentItem[]>([]);
  const [requests, setRequests] = useState<EnrichedAssistRequest[]>([]);
  const [templates, setTemplates] = useState<WaMessageTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'REAL' | 'DEMO'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedTemplateByTicket, setSelectedTemplateByTicket] = useState<Record<string, string>>(
    {}
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Unified Drawer state (works for both Direct per-user setup & Ticket-based setup)
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [cfgProvider, setCfgProvider] = useState<PaymentGatewayProvider>('MIDTRANS');
  const [cfgEnv, setCfgEnv] = useState<GatewayEnvironment>('PRODUCTION');
  const [cfgMerchantCode, setCfgMerchantCode] = useState('');
  const [cfgServerKey, setCfgServerKey] = useState('');
  const [cfgClientKey, setCfgClientKey] = useState('');
  const [cfgPrivateKey, setCfgPrivateKey] = useState('');
  const [cfgFeeBearer, setCfgFeeBearer] = useState<FeeBearer>('CUSTOMER');
  const [cfgNotes, setCfgNotes] = useState('');
  const [configuring, setConfiguring] = useState(false);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    }),
    [authToken]
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [directRes, reqRes, tplRes] = await Promise.all([
        fetch('/api/master/tenants/payment-configs', { headers }),
        fetch('/api/master/payment-assistance', { headers }),
        fetch('/api/master/wa-templates', { headers }),
      ]);
      if (!directRes.ok) {
        const j = (await directRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || 'Gagal memuat daftar pembayaran non-tunai per user.');
      }
      const directJson = (await directRes.json()) as { tenants: DirectTenantPaymentItem[] };
      setTenantItems(directJson.tenants || []);

      if (reqRes.ok) {
        const reqJson = (await reqRes.json()) as { requests: EnrichedAssistRequest[] };
        setRequests(reqJson.requests || []);
      }
      if (tplRes.ok) {
        const tplJson = (await tplRes.json()) as { templates: WaMessageTemplate[] };
        setTemplates((tplJson.templates || []).filter((t) => t.isActive));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan pembayaran.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTenants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tenantItems.filter((item) => {
      if (scopeFilter === 'REAL' && item.isDemo) return false;
      if (scopeFilter === 'DEMO' && !item.isDemo) return false;
      if (!q) return true;
      return (
        item.tenantName.toLowerCase().includes(q) ||
        item.ownerName.toLowerCase().includes(q) ||
        item.ownerEmail.toLowerCase().includes(q) ||
        item.tenantId.toLowerCase().includes(q)
      );
    });
  }, [tenantItems, searchQuery, scopeFilter]);

  const openDirectDrawer = (tenant: DirectTenantPaymentItem) => {
    setActiveTarget({ kind: 'DIRECT', tenant });
    setCfgProvider(
      tenant.config.provider === 'SIMULATOR' ? 'MIDTRANS' : tenant.config.provider || 'MIDTRANS'
    );
    setCfgEnv(tenant.config.environment || 'PRODUCTION');
    setCfgMerchantCode(tenant.config.merchantCode || '');
    setCfgServerKey('');
    setCfgClientKey('');
    setCfgPrivateKey('');
    setCfgFeeBearer(tenant.config.feeBearer || 'CUSTOMER');
    setCfgNotes('');
    setFeedback(null);
  };

  const openTicketDrawer = (ticket: EnrichedAssistRequest) => {
    setActiveTarget({ kind: 'TICKET', ticket });
    setCfgProvider(ticket.preferredProvider);
    setCfgEnv(ticket.currentConfig?.environment || 'PRODUCTION');
    setCfgMerchantCode(ticket.currentConfig?.merchantCode || '');
    setCfgServerKey('');
    setCfgClientKey('');
    setCfgPrivateKey('');
    setCfgFeeBearer(ticket.currentConfig?.feeBearer || 'CUSTOMER');
    setCfgNotes(ticket.adminNotes || '');
    setFeedback(null);
  };

  const buildMessageForTicket = (
    ticket: EnrichedAssistRequest,
    templateCodeOverride?: string
  ): { text: string; waUrl: string } => {
    const chosenCode =
      templateCodeOverride ||
      selectedTemplateByTicket[ticket.id] ||
      (ticket.status === 'COMPLETED' ? 'PAYMENT_ACTIVATED' : 'PAYMENT_ASSIST_GREETING');

    const tpl =
      templates.find((t) => t.code === chosenCode) ||
      templates.find((t) => t.category === 'PAYMENT_ASSIST') ||
      templates[0];

    const providerKey: 'MIDTRANS' | 'DUITKU' | 'TRIPAY' =
      ticket.preferredProvider === 'DUITKU' || ticket.preferredProvider === 'TRIPAY'
        ? ticket.preferredProvider
        : 'MIDTRANS';
    const webhookUrl =
      ticket.currentConfig?.webhookUrls?.[providerKey] ||
      `${window.location.origin}/api/webhooks/payment/${providerKey.toLowerCase()}/${ticket.tenantId}`;

    const body = tpl?.bodyTemplate || 'Halo {{nama_pemilik}}, kami siap membantu setting {{provider}}.';
    const text = renderWaTemplate(body, {
      nama_pemilik: ticket.ownerName || ticket.settlementAccountHolder,
      nama_umkm: ticket.tenantName || ticket.tenantId,
      jenis_umkm: ticket.tenantVertical || 'UMKM',
      provider: getProviderDisplayName(ticket.preferredProvider),
      nama_bank: ticket.settlementBankName,
      nama_rekening: ticket.settlementAccountHolder,
      link_daftar_provider: getProviderRegisterLink(ticket.preferredProvider),
      webhook_url: webhookUrl,
    });

    return {
      text,
      waUrl: buildWaMeUrl(ticket.whatsappNumber, text),
    };
  };

  const handleMarkStatus = async (
    ticketId: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
  ) => {
    try {
      const res = await fetch(`/api/master/payment-assistance/${encodeURIComponent(ticketId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Gagal memperbarui status tiket.');
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal memperbarui status.',
      });
    }
  };

  const handleSaveGatewayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTarget) return;
    setConfiguring(true);
    setFeedback(null);
    try {
      if (activeTarget.kind === 'DIRECT') {
        const t = activeTarget.tenant;
        const res = await fetch(
          `/api/master/tenants/${encodeURIComponent(t.tenantId)}/payment-config`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              provider: cfgProvider,
              environment: cfgEnv,
              merchantCode: cfgMerchantCode.trim() || null,
              serverKey: cfgServerKey.trim() || undefined,
              clientKey: cfgClientKey.trim() || undefined,
              privateKey: cfgPrivateKey.trim() || undefined,
              feeBearer: cfgFeeBearer,
            }),
          }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error || 'Gagal menyimpan pengaturan non-tunai user.');
        setFeedback({
          type: 'success',
          text: `Pembayaran non-tunai ${getProviderDisplayName(cfgProvider)} khusus untuk ${t.tenantName} berhasil disimpan terenkripsi & langsung aktif (terisolasi dari user lain).`,
        });
      } else {
        const ticket = activeTarget.ticket;
        const res = await fetch(
          `/api/master/payment-assistance/${encodeURIComponent(ticket.id)}/configure`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              provider: cfgProvider,
              environment: cfgEnv,
              merchantCode: cfgMerchantCode.trim() || null,
              serverKey: cfgServerKey.trim() || undefined,
              clientKey: cfgClientKey.trim() || undefined,
              privateKey: cfgPrivateKey.trim() || undefined,
              feeBearer: cfgFeeBearer,
              adminNotes: cfgNotes.trim() || undefined,
            }),
          }
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error || 'Gagal menyimpan konfigurasi tenant.');
        setFeedback({
          type: 'success',
          text: `Pembayaran ${getProviderDisplayName(cfgProvider)} untuk ${ticket.tenantName} berhasil dienkripsi & diaktifkan!`,
        });
      }
      setActiveTarget(null);
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan pembayaran.',
      });
    } finally {
      setConfiguring(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-stone-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
        Memuat daftar pengaturan pembayaran non-tunai...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-2">
        <p className="text-sm font-semibold text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold"
        >
          Muat Ulang
        </button>
      </div>
    );
  }

  const activeTargetTenantId =
    activeTarget?.kind === 'DIRECT'
      ? activeTarget.tenant.tenantId
      : activeTarget?.ticket.tenantId ?? '';
  const activeTargetTenantName =
    activeTarget?.kind === 'DIRECT'
      ? activeTarget.tenant.tenantName
      : activeTarget?.ticket.tenantName ?? '';
  const activeTargetConfig =
    activeTarget?.kind === 'DIRECT'
      ? activeTarget.tenant.config
      : activeTarget?.ticket.currentConfig;

  return (
    <div data-testid="payment-assistance-panel" className="space-y-5">
      {/* Header & Isolation Guarantee */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-700" strokeWidth={1.75} />
              <span>Pembayaran Non-Tunai Per User (Terpisah 100%)</span>
            </h2>
            <p className="text-xs text-stone-600 max-w-[68ch] leading-relaxed">
              Master Admin dapat langsung mengatur Midtrans, Duitku, Tripay, atau Transfer Manual
              untuk setiap akun usaha <strong>tanpa perlu menunggu user mengirim request</strong>.
              Kunci API dan alamat webhook disimpan terenkripsi khusus per akun usaha sehingga dana
              dan transaksi non-tunai 1 user tidak pernah tercampur dengan user lain.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700 text-xs font-semibold hover:bg-stone-100"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3">
          <button
            type="button"
            data-testid="master-direct-payment-tab"
            onClick={() => setSubTab('DIRECT')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'DIRECT'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Atur Langsung per User ({tenantItems.length})
          </button>
          <button
            type="button"
            data-testid="master-assist-queue-tab"
            onClick={() => setSubTab('QUEUE')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              subTab === 'QUEUE'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Antrean Permintaan Bantuan ({requests.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          data-testid="master-payment-feedback"
          className={`px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: DIRECT PER-TENANT PAYMENT CONFIGURATION (NO REQUEST NEEDED) */}
      {subTab === 'DIRECT' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search
                className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama usaha, pemilik, atau email..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-stone-200 rounded-lg text-stone-900"
              />
            </div>

            <div className="inline-flex items-center bg-stone-100 border border-stone-200 rounded-lg p-0.5 text-xs font-semibold">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'REAL', label: 'Akun Asli' },
                  { id: 'DEMO', label: 'Akun Demo' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setScopeFilter(f.id)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    scopeFilter === f.id
                      ? 'bg-white text-stone-900 border border-stone-200'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-200 overflow-hidden">
            {filteredTenants.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500">
                Tidak ada akun usaha yang cocok dengan pencarian Anda.
              </div>
            ) : (
              filteredTenants.map((item) => {
                const providerName = getProviderDisplayName(item.config.provider);
                const isLiveConfigured =
                  item.config.setupStatus === 'ACTIVE' &&
                  item.config.provider !== 'SIMULATOR' &&
                  item.config.provider !== 'MANUAL_ONLY';
                const webhookPreview =
                  item.config.webhookUrls?.MIDTRANS ||
                  `${window.location.origin}/api/webhooks/payment/midtrans/${item.tenantId}`;

                return (
                  <div
                    key={item.tenantId}
                    data-testid={`direct-payment-row-${item.tenantId}`}
                    className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-stone-50/70 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-stone-900 text-sm">{item.tenantName}</span>
                        <span className="text-stone-300">·</span>
                        <span className="text-stone-600">{item.ownerName}</span>
                        <span className="text-stone-300">·</span>
                        <span className="font-mono text-[11px] text-stone-500">
                          Paket {item.planCode}
                        </span>
                        {item.isDemo && (
                          <span className="text-[11px] font-semibold text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded">
                            Demo
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
                        <span>
                          Jalur Aktif:{' '}
                          <strong
                            className={
                              isLiveConfigured ? 'text-emerald-700' : 'text-stone-800'
                            }
                          >
                            {providerName} ({item.config.environment})
                          </strong>
                        </span>
                        {item.config.maskedServerKey && (
                          <span className="font-mono text-[11px] text-stone-500">
                            Key: {item.config.maskedServerKey}
                          </span>
                        )}
                        <span className="text-[11px] text-stone-500">
                          Biaya Admin:{' '}
                          {item.config.feeBearer === 'CUSTOMER' ? 'Pembeli' : 'Toko'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-stone-500">
                        <Lock className="w-3 h-3 text-emerald-700 shrink-0" strokeWidth={1.75} />
                        <span className="truncate font-mono">
                          Webhook khusus akun ini: {webhookPreview}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(webhookPreview).catch(() => {});
                          setCopiedId(item.tenantId);
                          window.setTimeout(() => setCopiedId(null), 1600);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-100"
                      >
                        <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>{copiedId === item.tenantId ? 'Disalin' : 'Salin Webhook'}</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`btn-direct-config-${item.tenantId}`}
                        onClick={() => openDirectDrawer(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                        <span>Atur Non-Tunai User Ini</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: USER ASSISTANCE REQUEST QUEUE */}
      {subTab === 'QUEUE' && (
        <>
          {requests.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-xl p-10 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" strokeWidth={1.75} />
              <p className="font-bold text-stone-900 text-sm">
                Belum ada permintaan bantuan dari user
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Anda tetap bisa langsung mengatur pembayaran non-tunai untuk user mana saja lewat tab
                &ldquo;Atur Langsung per User&rdquo; di atas tanpa menunggu request.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((ticket) => {
                const { text, waUrl } = buildMessageForTicket(ticket);
                const activatedMsg = buildMessageForTicket(ticket, 'PAYMENT_ACTIVATED');

                return (
                  <div
                    key={ticket.id}
                    data-testid={`assist-ticket-${ticket.id}`}
                    className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <h3 className="text-base font-bold text-stone-900">
                            {ticket.tenantName || ticket.tenantId}
                          </h3>
                          <span className="text-stone-400">·</span>
                          <span className="font-medium text-stone-600">
                            {ticket.tenantVertical}
                          </span>
                          <span className="text-stone-400">·</span>
                          <span
                            className={`font-semibold ${
                              ticket.status === 'COMPLETED'
                                ? 'text-emerald-700'
                                : ticket.status === 'IN_PROGRESS'
                                  ? 'text-sky-700'
                                  : ticket.status === 'REJECTED'
                                    ? 'text-rose-700'
                                    : 'text-amber-700'
                            }`}
                          >
                            {ticket.status}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1">
                          Provider:{' '}
                          <strong>{getProviderDisplayName(ticket.preferredProvider)}</strong> ·
                          Rekening: <strong>{ticket.settlementBankName}</strong> a.n.{' '}
                          <strong>{ticket.settlementAccountHolder}</strong> · Legalitas:{' '}
                          <strong>{ticket.businessLegality}</strong>
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5">
                          WA:{' '}
                          <span className="font-mono font-semibold text-stone-700">
                            {ticket.whatsappNumber}
                          </span>{' '}
                          ·{' '}
                          {ticket.hasExistingAccount
                            ? 'Sudah punya akun provider'
                            : 'Belum punya akun (perlu dipandu daftar)'}
                          {ticket.notes ? ` · Catatan: "${ticket.notes}"` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {ticket.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => void handleMarkStatus(ticket.id, 'IN_PROGRESS')}
                            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-stone-800 text-xs font-semibold hover:bg-stone-100"
                          >
                            Tandai Diproses
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid={`btn-configure-ticket-${ticket.id}`}
                          onClick={() => openTicketDrawer(ticket)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                          <span>Atur API Key Akun Ini</span>
                        </button>
                      </div>
                    </div>

                    {/* WhatsApp Template Dispatch Row */}
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-stone-700">
                          Pilih Template WA:
                        </span>
                        <select
                          value={
                            selectedTemplateByTicket[ticket.id] ||
                            (ticket.status === 'COMPLETED'
                              ? 'PAYMENT_ACTIVATED'
                              : 'PAYMENT_ASSIST_GREETING')
                          }
                          onChange={(e) =>
                            setSelectedTemplateByTicket((prev) => ({
                              ...prev,
                              [ticket.id]: e.target.value,
                            }))
                          }
                          className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-xs font-medium text-stone-800"
                        >
                          {templates.map((t) => (
                            <option key={t.id} value={t.code}>
                              {t.title} ({t.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(text).catch(() => {});
                            setCopiedId(ticket.id);
                            window.setTimeout(() => setCopiedId(null), 1800);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-100"
                        >
                          <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>{copiedId === ticket.id ? 'Tersalin' : 'Salin Teks'}</span>
                        </button>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`wa-send-link-${ticket.id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        >
                          <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>Kirim WA ke User</span>
                          <ExternalLink className="w-3 h-3 opacity-80" strokeWidth={1.75} />
                        </a>

                        {ticket.status === 'COMPLETED' && (
                          <a
                            href={activatedMsg.waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Kirim WA Konfirmasi Aktif</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Unified Encrypted Gateway Config Drawer */}
      {activeTarget && (
        <div className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-xs flex justify-end">
          <div
            data-testid="assisted-config-drawer"
            className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-5 border-l border-stone-200"
          >
            <div className="flex items-start justify-between border-b border-stone-200 pb-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                  Pengaturan Non-Tunai Terisolasi Per User
                </p>
                <h3 className="text-lg font-bold text-stone-900">{activeTargetTenantName}</h3>
                <p className="text-xs text-stone-500">
                  ID Usaha: <span className="font-mono text-stone-700">{activeTargetTenantId}</span>{' '}
                  · Kunci langsung dienkripsi AES-256-GCM dan hanya berlaku untuk akun ini.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTarget(null)}
                aria-label="Tutup panel pengaturan pembayaran"
                className="text-stone-400 hover:text-stone-800 font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {activeTargetConfig?.maskedServerKey && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700">
                Key tersimpan saat ini:{' '}
                <span className="font-mono font-semibold text-stone-900">
                  {activeTargetConfig.maskedServerKey}
                </span>{' '}
                (kosongkan kolom key jika hanya ingin mengganti pengaturan lain).
              </div>
            )}

            <form onSubmit={handleSaveGatewayConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Penyedia Pembayaran
                  </label>
                  <select
                    data-testid="drawer-payment-provider"
                    value={cfgProvider}
                    onChange={(e) => setCfgProvider(e.target.value as PaymentGatewayProvider)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
                  >
                    <option value="MIDTRANS">Midtrans (QRIS, GoPay, VA)</option>
                    <option value="DUITKU">Duitku (QRIS, OVO, DANA, VA)</option>
                    <option value="TRIPAY">Tripay (QRIS, E-Wallet, VA)</option>
                    <option value="MANUAL_ONLY">Transfer Bank Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Mode Jalur
                  </label>
                  <select
                    data-testid="drawer-payment-env"
                    value={cfgEnv}
                    onChange={(e) => setCfgEnv(e.target.value as GatewayEnvironment)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
                  >
                    <option value="PRODUCTION">PRODUCTION (Transaksi Asli)</option>
                    <option value="SANDBOX">SANDBOX (Uji Coba)</option>
                  </select>
                </div>
              </div>

              {(cfgProvider === 'DUITKU' || cfgProvider === 'TRIPAY') && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Merchant Code
                  </label>
                  <input
                    type="text"
                    data-testid="drawer-payment-merchant-code"
                    value={cfgMerchantCode}
                    onChange={(e) => setCfgMerchantCode(e.target.value)}
                    placeholder="Masukkan Kode Merchant khusus user ini"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
                  />
                </div>
              )}

              {cfgProvider !== 'MANUAL_ONLY' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    {cfgProvider === 'MIDTRANS' ? 'Server Key' : 'API Key'}
                  </label>
                  <input
                    type="password"
                    data-testid="drawer-payment-server-key"
                    value={cfgServerKey}
                    onChange={(e) => setCfgServerKey(e.target.value)}
                    placeholder="Masukkan Server Key / API Key milik user ini"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
                  />
                </div>
              )}

              {cfgProvider === 'MIDTRANS' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Client Key
                  </label>
                  <input
                    type="password"
                    data-testid="drawer-payment-client-key"
                    value={cfgClientKey}
                    onChange={(e) => setCfgClientKey(e.target.value)}
                    placeholder="Masukkan Client Key Midtrans"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
                  />
                </div>
              )}

              {cfgProvider === 'TRIPAY' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Private Key
                  </label>
                  <input
                    type="password"
                    data-testid="drawer-payment-private-key"
                    value={cfgPrivateKey}
                    onChange={(e) => setCfgPrivateKey(e.target.value)}
                    placeholder="Masukkan Private Key Tripay"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Penanggung Biaya Admin Pembayaran Non-Tunai
                </label>
                <select
                  value={cfgFeeBearer}
                  onChange={(e) => setCfgFeeBearer(e.target.value as FeeBearer)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
                >
                  <option value="CUSTOMER">Ditanggung Pembeli (Tidak Mengurangi Omzet Toko)</option>
                  <option value="MERCHANT">Ditanggung Toko (Dicatat sebagai Biaya Pembayaran)</option>
                </select>
              </div>

              {activeTarget.kind === 'TICKET' && (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Catatan Admin (Internal)
                  </label>
                  <textarea
                    rows={2}
                    value={cfgNotes}
                    onChange={(e) => setCfgNotes(e.target.value)}
                    placeholder="Contoh: Webhook sudah dipasang dan tes QRIS sukses"
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setActiveTarget(null)}
                  className="px-4 py-2 rounded-lg border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  data-testid="btn-save-master-tenant-payment"
                  disabled={configuring}
                  className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                  {configuring ? 'Menyimpan...' : 'Simpan & Aktifkan untuk User Ini'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
