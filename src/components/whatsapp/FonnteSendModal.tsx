import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ModalShell } from '../ui/ModalShell';

interface FonnteSendModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  defaultPhone?: string;
  defaultMessage: string;
  documentType: 'RECEIPT' | 'ORDER' | 'INVOICE' | 'PO';
  referenceNo?: string;
}

interface FonnteDispatchResponse {
  ok: boolean;
  mode: 'LIVE_FONNTE' | 'SANDBOX_SIMULATED';
  provider: string;
  target: string;
  messageId: string;
  detail: string;
  waFallbackUrl: string;
  error?: string;
}

export function FonnteSendModal({
  open,
  onClose,
  title = 'Kirim via WhatsApp Gateway (Fonnte)',
  defaultPhone = '',
  defaultMessage,
  documentType,
  referenceNo,
}: FonnteSendModalProps) {
  const { activeWorkspace, session, hasAddOn, activateAddOn, navigate } = useApp();
  const isUnlocked = hasAddOn('ADDON_WA_FONNTE');
  const isDemo = activeWorkspace.tenant.accountScope === 'DEMO';

  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<FonnteDispatchResponse | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      setMessage(defaultMessage);
      setErrorMsg(null);
      setResult(null);
    }
  }, [open, defaultPhone, defaultMessage]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !message.trim()) {
      setErrorMsg('Nomor WhatsApp tujuan dan isi pesan wajib diisi.');
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await fetch('/api/whatsapp/fonnte/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: activeWorkspace.tenant.id,
          targetPhone: phone.trim(),
          message: message.trim(),
          documentType,
          referenceNo,
          demoAddOnActivated: isDemo && isUnlocked,
        }),
      });
      const data = (await res.json()) as FonnteDispatchResponse & { dispatched?: boolean };
      if (!res.ok || (!data.ok && !data.dispatched)) {
        setErrorMsg(data.error || 'Gagal mengirim pesan WhatsApp via Fonnte.');
      } else {
        setResult(data);
      }
    } catch {
      setErrorMsg('Koneksi ke server Fonnte terputus. Periksa jaringan dan coba lagi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      headerId="fonnte-wa-modal-title"
      testId="fonnte-wa-modal"
      title={title}
      subtitle="Integrasi resmi Fonnte WhatsApp Gateway · Add-On Rp66.000/bulan (0 token AI)"
      maxWidthClass="max-w-lg"
    >
      <div className="p-6 space-y-4">
        {!isUnlocked ? (
          <div
            data-testid="fonnte-addon-locked-panel"
            className="space-y-4 text-center py-2"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Fitur Kirim WhatsApp Otomatis (Add-On Fonnte)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
                Untuk mengirim struk belanja, notifikasi pesanan, atau tagihan langsung ke
                WhatsApp pelanggan melalui <strong>Fonnte Gateway</strong>, aktifkan Add-On{' '}
                <strong className="text-emerald-700">WhatsApp Gateway (Rp66.000/bulan)</strong>.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-1.5">
              <p className="font-semibold text-slate-800">Keunggulan Add-On Fonnte (+Rp66.000/bln):</p>
              <ul className="space-y-1 text-slate-600 list-disc pl-4">
                <li>Kirim struk POS, pesanan restoran, &amp; tagihan kost 1-klik langsung ke WA</li>
                <li>Token perangkat Fonnte tersimpan aman di sisi server (anti-bocor)</li>
                <li>Tanpa biaya token AI — tarif flat Rp66.000/bulan</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              {isDemo && (
                <button
                  type="button"
                  data-testid="fonnte-demo-activate-btn"
                  onClick={() => activateAddOn('ADDON_WA_FONNTE')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulasikan Aktifkan Fonnte (+Rp66rb)</span>
                </button>
              )}
              <button
                type="button"
                data-testid="fonnte-goto-billing-btn"
                onClick={() => {
                  onClose();
                  navigate('/billing');
                }}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                  isDemo
                    ? 'text-slate-800 bg-slate-100 hover:bg-slate-200'
                    : 'text-white bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Kelola di Paket &amp; Add-On</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
            <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 rounded-lg px-3.5 py-2 text-xs text-emerald-900">
              <span className="font-semibold flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-emerald-700" />
                Add-On Fonnte WhatsApp Gateway Aktif
              </span>
              <span className="font-mono text-[11px] text-emerald-700">Rp66.000/bln</span>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {result && (
              <div
                data-testid="fonnte-send-success-banner"
                className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-950"
              >
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      Pesan terkirim ke {result.target} ({result.mode === 'LIVE_FONNTE' ? 'Fonnte Live' : 'Sandbox Fonnte'})
                    </p>
                    <p className="text-[11px] text-emerald-800">{result.detail}</p>
                    <p className="text-[11px] font-mono text-emerald-700">ID: {result.messageId}</p>
                  </div>
                </div>
                {result.waFallbackUrl && (
                  <a
                    href={result.waFallbackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Buka cadangan di WhatsApp Web / Aplikasi</span>
                  </a>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="fonnte-target-phone"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Nomor WhatsApp Tujuan *
              </label>
              <input
                id="fonnte-target-phone"
                data-testid="fonnte-target-phone-input"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890 atau 6281234567890"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="fonnte-message-body"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Isi Pesan WhatsApp
              </label>
              <textarea
                id="fonnte-message-body"
                rows={7}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={sending}
                data-testid="fonnte-send-submit-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirim via Fonnte...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim via Fonnte Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
}
