import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, MessageCircle, UserPlus } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { useApp } from '../../context/AppContext';
import { buildDirectWaMeUrl } from '../../lib/messaging/whatsapp-direct';

interface DirectWaCustomerModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  businessWhatsappNumber?: string | null;
  defaultCustomerPhone?: string;
  defaultPhone?: string;
  defaultCustomerName?: string;
  defaultMessage: string;
}

/**
 * Direct WhatsApp (`wa.me`) composer for sending transaction/order details to customers
 * without Fonnte Add-On (requires owner WA number configured in Settings).
 * Includes optional 1-click auto-save of the customer's WhatsApp number to the CRM contact book.
 */
export function DirectWaCustomerModal({
  open,
  onClose,
  title = 'Kirim Rincian Pesanan ke WhatsApp Pelanggan',
  subtitle = 'Mengirim rincian langsung lewat WhatsApp Anda (wa.me) tanpa biaya tambahan.',
  businessWhatsappNumber,
  defaultCustomerPhone,
  defaultPhone,
  defaultCustomerName,
  defaultMessage,
}: DirectWaCustomerModalProps) {
  const { activeWorkspace, addCrmCustomer } = useApp();
  const resolvedOwnerWa =
    businessWhatsappNumber ?? activeWorkspace.tenant.settings?.businessWhatsappNumber ?? null;
  const resolvedInitialPhone = defaultCustomerPhone ?? defaultPhone ?? '';
  const resolvedInitialName =
    defaultCustomerName && defaultCustomerName.trim() !== ''
      ? defaultCustomerName.trim()
      : 'Pelanggan Umum';

  const [customerPhone, setCustomerPhone] = useState(resolvedInitialPhone);
  const [customerName, setCustomerName] = useState(resolvedInitialName);
  const [saveToContacts, setSaveToContacts] = useState(true);
  const [message, setMessage] = useState(defaultMessage);
  const [copiedNotice, setCopiedNotice] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerPhone(resolvedInitialPhone);
      setCustomerName(resolvedInitialName);
      setSaveToContacts(true);
      setMessage(defaultMessage);
      setCopiedNotice(false);
    }
  }, [open, resolvedInitialPhone, resolvedInitialName, defaultMessage]);

  const linkResult = useMemo(
    () =>
      buildDirectWaMeUrl({
        businessWhatsappNumber: resolvedOwnerWa,
        customerPhone,
        message,
      }),
    [resolvedOwnerWa, customerPhone, message]
  );

  const existingCrmCustomer = useMemo(() => {
    const digits = customerPhone.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const normalizedInput = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
    return (
      (activeWorkspace.crmCustomers ?? []).find((c) => {
        const cDigits = (c.phoneWa || '').replace(/\D/g, '');
        if (cDigits.length < 8) return false;
        const normalizedC = cDigits.startsWith('0') ? `62${cDigits.slice(1)}` : cDigits;
        return normalizedC === normalizedInput || cDigits === digits;
      }) ?? null
    );
  }, [activeWorkspace.crmCustomers, customerPhone]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 3000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSendClick = () => {
    if (linkResult.ok && saveToContacts && !existingCrmCustomer && customerPhone.trim().length >= 8) {
      addCrmCustomer({
        name: customerName.trim() || 'Pelanggan Umum',
        phoneWa: customerPhone.trim(),
        loyaltyPoints: 0,
        notes: 'Disimpan otomatis saat kirim rincian transaksi via WhatsApp',
      });
    }
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeOnEscape={true}
      headerId="direct-wa-customer-modal-title"
      testId="direct-wa-customer-modal"
      title={title}
      subtitle={subtitle}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{copiedNotice ? 'Tersalin' : 'Salin Teks'}</span>
          </button>
          {linkResult.ok && linkResult.url ? (
            <a
              href={linkResult.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="direct-wa-send-link"
              onClick={handleSendClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Buka WhatsApp &amp; Kirim</span>
              <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
            </a>
          ) : (
            <button
              type="button"
              disabled
              data-testid="direct-wa-send-disabled"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-400 bg-stone-200 rounded-lg cursor-not-allowed"
            >
              <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Isi Nomor WA Pelanggan</span>
            </button>
          )}
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {copiedNotice && (
          <div
            role="status"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>Rincian pesanan berhasil disalin ke clipboard.</span>
          </div>
        )}

        <div>
          <label
            htmlFor="direct-wa-customer-phone"
            className="block text-xs font-semibold text-stone-700 mb-1"
          >
            Nomor WhatsApp Pelanggan *
          </label>
          <input
            id="direct-wa-customer-phone"
            data-testid="direct-wa-customer-phone-input"
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Contoh: 081234567890"
            className="w-full px-3 py-2 text-sm font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
          />
          {!linkResult.ok && customerPhone.trim().length > 0 && (
            <p className="text-[11px] text-rose-600 mt-1">
              Masukkan minimal 8 digit nomor WhatsApp pelanggan yang aktif.
            </p>
          )}
        </div>

        {/* Optional Auto-Save to CRM Contact Book */}
        {existingCrmCustomer ? (
          <div
            data-testid="direct-wa-crm-existing-badge"
            className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>
              Nomor ini sudah tersimpan di Daftar Pelanggan sebagai{' '}
              <strong>{existingCrmCustomer.name}</strong>.
            </span>
          </div>
        ) : (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="direct-wa-save-crm-checkbox"
                checked={saveToContacts}
                onChange={(e) => setSaveToContacts(e.target.checked)}
                className="mt-0.5 rounded border-stone-300 text-emerald-600 accent-emerald-600 focus:ring-emerald-600"
              />
              <span className="text-xs text-stone-700 leading-snug">
                <span className="font-semibold text-stone-900 inline-flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                  <span>Simpan nomor ini ke Daftar Pelanggan</span>
                </span>
                <span className="block text-[11px] text-stone-500 mt-0.5">
                  Agar transaksi berikutnya tidak perlu mengetik ulang nomor pelanggan langganan.
                </span>
              </span>
            </label>
            {saveToContacts && (
              <div>
                <label
                  htmlFor="direct-wa-customer-name"
                  className="block text-[11px] font-medium text-stone-600 mb-1"
                >
                  Nama Pelanggan untuk Buku Kontak
                </label>
                <input
                  id="direct-wa-customer-name"
                  data-testid="direct-wa-customer-name-input"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Ibu Ani"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="direct-wa-customer-message"
            className="block text-xs font-semibold text-stone-700 mb-1"
          >
            Rincian Pesanan yang Dikirim
          </label>
          <textarea
            id="direct-wa-customer-message"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg text-stone-800 leading-relaxed focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>
    </ModalShell>
  );
}
