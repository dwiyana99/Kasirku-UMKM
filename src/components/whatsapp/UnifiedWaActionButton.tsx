import React, { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { evaluateWhatsappSendingPolicy } from '../../lib/messaging/whatsapp-policy';
import { DirectWaCustomerModal } from './DirectWaCustomerModal';
import { FonnteSendModal } from './FonnteSendModal';

interface UnifiedWaActionButtonProps {
  customerPhone?: string | null;
  customerName?: string | null;
  message: string;
  modalTitle?: string;
  documentType?: 'RECEIPT' | 'ORDER' | 'INVOICE' | 'PO';
  referenceNo?: string;
  label?: string;
  variant?: 'emerald' | 'outline' | 'amber';
  className?: string;
  testId?: string;
}

/**
 * Unified WhatsApp Send Trigger respecting KasirAkun Owner WA Policy:
 * - If Owner WA is unset AND Fonnte Add-On is inactive -> returns null (hidden to avoid confusing users).
 * - If Fonnte Add-On is active -> opens FonnteSendModal (automated gateway + fallback).
 * - If Owner WA is configured (without Fonnte) -> opens DirectWaCustomerModal (wa.me direct + CRM save + copy fallback).
 */
export function UnifiedWaActionButton({
  customerPhone,
  customerName,
  message,
  modalTitle = 'Kirim Pesan WhatsApp ke Pelanggan',
  documentType = 'INVOICE',
  referenceNo,
  label = 'Kirim WA',
  variant = 'outline',
  className = '',
  testId,
}: UnifiedWaActionButtonProps) {
  const { activeWorkspace, hasAddOn } = useApp();
  const [open, setOpen] = useState(false);

  const policy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: activeWorkspace.tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [activeWorkspace.tenant.settings?.businessWhatsappNumber, hasAddOn]
  );

  if (!policy.canShowSendButtons) {
    return null;
  }

  const resolvedLabel =
    policy.channel === 'FONNTE' && label === 'Kirim WA'
      ? 'Kirim WA (Fonnte)'
      : label;

  const variantClasses =
    variant === 'emerald'
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
      : variant === 'amber'
      ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
      : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50';

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${variantClasses} ${className}`}
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={1.75} />
        <span>{resolvedLabel}</span>
      </button>

      {policy.channel === 'FONNTE' ? (
        <FonnteSendModal
          open={open}
          onClose={() => setOpen(false)}
          title={modalTitle}
          defaultPhone={customerPhone ?? ''}
          defaultMessage={message}
          documentType={documentType}
          referenceNo={referenceNo}
        />
      ) : (
        <DirectWaCustomerModal
          open={open}
          onClose={() => setOpen(false)}
          title={modalTitle}
          subtitle="Mengirim pesan langsung lewat WhatsApp pemilik (wa.me) tanpa Add-On Fonnte."
          businessWhatsappNumber={activeWorkspace.tenant.settings?.businessWhatsappNumber}
          defaultCustomerPhone={customerPhone ?? ''}
          defaultCustomerName={customerName ?? ''}
          defaultMessage={message}
        />
      )}
    </>
  );
}
