import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { computeDailyClosingSummary } from '../../lib/analytics/owner-insights-engine';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';

interface DailyClosingModalProps {
  open: boolean;
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

/**
 * 1-Click Daily Cashier Closing + WhatsApp Owner Recap (100% Zero AI Token, Decimal.js)
 * Available on ALL plans including Paket LITE.
 */
export function DailyClosingModal({ open, onClose, onNotify }: DailyClosingModalProps) {
  const { activeWorkspace } = useApp();
  const defaultWaPhone = activeWorkspace.tenant.settings?.businessWhatsappNumber || '';
  const [openingCash, setOpeningCash] = useState<string>('200000');
  const [actualCash, setActualCash] = useState<string>('');
  const [ownerWaPhone, setOwnerWaPhone] = useState<string>(defaultWaPhone);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (open && !ownerWaPhone && defaultWaPhone) {
      setOwnerWaPhone(defaultWaPhone);
    }
  }, [open, defaultWaPhone, ownerWaPhone]);

  const baseClosing = useMemo(
    () =>
      computeDailyClosingSummary({
        tenantName: activeWorkspace.tenant.name,
        orders: activeWorkspace.orders,
        expenses: activeWorkspace.expenses,
        openingCash,
        actualCashCounted: actualCash || '0',
      }),
    [activeWorkspace.tenant.name, activeWorkspace.orders, activeWorkspace.expenses, openingCash, actualCash]
  );

  // When user hasn't typed actualCash yet, prefill helper button uses expectedCashInDrawer
  const closing = useMemo(() => {
    const effectiveActual =
      actualCash.trim() !== ''
        ? actualCash
        : String(Math.round(Number(baseClosing.expectedCashInDrawer)));
    return computeDailyClosingSummary({
      tenantName: activeWorkspace.tenant.name,
      orders: activeWorkspace.orders,
      expenses: activeWorkspace.expenses,
      openingCash,
      actualCashCounted: effectiveActual,
    });
  }, [
    activeWorkspace.tenant.name,
    activeWorkspace.orders,
    activeWorkspace.expenses,
    openingCash,
    actualCash,
    baseClosing.expectedCashInDrawer,
  ]);

  const handleCopyRecap = async () => {
    try {
      await navigator.clipboard.writeText(closing.whatsappMessage);
      const msg = 'Rekap Tutup Kasir Harian berhasil disalin ke clipboard (siap tempel ke WA).';
      setCopiedNotice(msg);
      onNotify?.(msg);
      window.setTimeout(() => setCopiedNotice(null), 4000);
    } catch {
      setCopiedNotice('Salin teks rekap dari kotak pratinjau di bawah.');
    }
  };

  const waUrl = useMemo(() => {
    const digits = ownerWaPhone.replace(/\D/g, '');
    const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
    const encoded = encodeURIComponent(closing.whatsappMessage);
    return normalized
      ? `https://wa.me/${normalized}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  }, [ownerWaPhone, closing.whatsappMessage]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      headerId="daily-closing-modal-header"
      testId="daily-closing-modal"
      title="Tutup Kasir Harian & Rekap WA Pemilik"
      subtitle={`Cocokkan uang fisik di laci untuk ${closing.dateLabel} lalu kirim rekap cepat ke WhatsApp.`}
      maxWidthClass="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleCopyRecap()}
            data-testid="daily-closing-copy-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Salin Rekap WA</span>
          </button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="daily-closing-wa-link"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Kirim ke WhatsApp</span>
            <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
          </a>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {copiedNotice && (
          <div
            role="status"
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{copiedNotice}</span>
          </div>
        )}

        {/* Sales & Cash Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="border border-stone-200 rounded-lg p-3">
            <p className="text-[11px] text-stone-500">Total Omzet</p>
            <p className="text-sm font-bold font-mono tabular-nums text-stone-900 mt-0.5">
              {formatRupiah(closing.totalSales)}
            </p>
            <p className="text-[10px] text-stone-500">{closing.orderCount} struk</p>
          </div>
          <div className="border border-stone-200 rounded-lg p-3">
            <p className="text-[11px] text-stone-500">Penjualan Tunai</p>
            <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {formatRupiah(closing.cashSales)}
            </p>
          </div>
          <div className="border border-stone-200 rounded-lg p-3">
            <p className="text-[11px] text-stone-500">Non-Tunai</p>
            <p className="text-sm font-bold font-mono tabular-nums text-stone-900 mt-0.5">
              {formatRupiah(closing.nonCashSales)}
            </p>
          </div>
          <div className="border border-stone-200 rounded-lg p-3">
            <p className="text-[11px] text-stone-500">Biaya Keluar</p>
            <p className="text-sm font-bold font-mono tabular-nums text-rose-700 mt-0.5">
              {formatRupiah(closing.cashExpenses)}
            </p>
          </div>
        </div>

        {/* Drawer Reconciliation Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="closing-opening-cash"
              className="block text-xs font-medium text-stone-700 mb-1"
            >
              Modal Awal Laci (Rp)
            </label>
            <input
              id="closing-opening-cash"
              type="number"
              min="0"
              step="1000"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="closing-actual-cash"
                className="block text-xs font-medium text-stone-700"
              >
                Uang Fisik Dihitung di Laci (Rp)
              </label>
              <button
                type="button"
                onClick={() =>
                  setActualCash(String(Math.round(Number(baseClosing.expectedCashInDrawer))))
                }
                className="text-[11px] font-medium text-emerald-700 hover:underline"
              >
                Isi Pas
              </button>
            </div>
            <input
              id="closing-actual-cash"
              data-testid="daily-closing-actual-cash"
              type="number"
              min="0"
              step="1000"
              value={actualCash}
              placeholder={String(Math.round(Number(baseClosing.expectedCashInDrawer)))}
              onChange={(e) => setActualCash(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Expected vs Variance Banner */}
        <div
          className={`p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${
            closing.varianceStatus === 'MATCH'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : closing.varianceStatus === 'SURPLUS'
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <div className="text-xs">
              <p className="font-semibold">
                Seharusnya di laci: {formatRupiah(closing.expectedCashInDrawer)}
              </p>
              <p className="opacity-85">
                {closing.varianceStatus === 'MATCH'
                  ? 'Uang fisik cocok 100% dengan catatan sistem.'
                  : closing.varianceStatus === 'SURPLUS'
                  ? `Terdapat selisih lebih ${formatRupiah(closing.cashVariance)}.`
                  : `Terdapat selisih kurang ${formatRupiah(closing.cashVariance)}.`}
              </p>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="closing-wa-phone" className="block text-xs font-medium text-stone-700 mb-1">
            Nomor WhatsApp Pemilik (Opsional)
          </label>
          <input
            id="closing-wa-phone"
            type="tel"
            value={ownerWaPhone}
            onChange={(e) => setOwnerWaPhone(e.target.value)}
            placeholder="Contoh: 081234567890"
            className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        {/* WhatsApp Message Preview */}
        <div>
          <p className="text-[11px] font-medium text-stone-500 mb-1">Pratinjau Pesan Rekap WA</p>
          <pre className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-mono text-stone-800 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
            {closing.whatsappMessage}
          </pre>
        </div>
      </div>
    </ModalShell>
  );
}
