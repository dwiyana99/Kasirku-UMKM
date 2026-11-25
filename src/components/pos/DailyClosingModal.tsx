import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileDown,
  MessageCircle,
  Package,
  Settings,
  Wallet,
} from 'lucide-react';
import Decimal from 'decimal.js';
import { useApp } from '../../context/AppContext';
import { computeDailyClosingSummary } from '../../lib/analytics/owner-insights-engine';
import {
  buildOwnerRecapWaUrl,
  evaluateWhatsappSendingPolicy,
} from '../../lib/messaging/whatsapp-policy';
import { downloadDailyClosingPdf } from '../../lib/pdf/tier1-report-pdf';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';
import { FonnteSendModal } from '../whatsapp/FonnteSendModal';

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
  const { activeWorkspace, hasAddOn, navigate, session } = useApp();
  const savedOwnerWa = activeWorkspace.tenant.settings?.businessWhatsappNumber?.trim() || '';
  const [openingCash, setOpeningCash] = useState<string>('200000');
  const [actualCash, setActualCash] = useState<string>('');
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);
  const [fonnteOpen, setFonnteOpen] = useState(false);

  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: savedOwnerWa,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [savedOwnerWa, hasAddOn]
  );

  const lowStockCount = useMemo(() => {
    return activeWorkspace.products.filter(
      (p) =>
        p.itemType !== 'SERVICE_FREELANCE' &&
        new Decimal(p.stockQty || '0').lte(new Decimal(p.minStockAlert || '5'))
    ).length;
  }, [activeWorkspace.products]);

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
      const msg = 'Rekap Tutup Kasir Harian berhasil disalin ke clipboard.';
      setCopiedNotice(msg);
      onNotify?.(msg);
      window.setTimeout(() => setCopiedNotice(null), 4000);
    } catch {
      setCopiedNotice('Salin teks rekap dari kotak pratinjau di bawah.');
    }
  };

  const ownerRecapLink = useMemo(
    () =>
      buildOwnerRecapWaUrl({
        businessWhatsappNumber: savedOwnerWa,
        message: closing.whatsappMessage,
      }),
    [savedOwnerWa, closing.whatsappMessage]
  );

  const handleDownloadPdf = () => {
    const fileName = downloadDailyClosingPdf({
      tenantName: activeWorkspace.tenant.name,
      dateLabel: closing.dateLabel,
      orderCount: closing.orderCount,
      totalSales: closing.totalSales,
      cashSales: closing.cashSales,
      nonCashSales: closing.nonCashSales,
      cashExpenses: closing.cashExpenses,
      openingCash: closing.openingCash,
      expectedCashInDrawer: closing.expectedCashInDrawer,
      actualCashCounted: closing.actualCashCounted,
      cashVariance: closing.cashVariance,
      varianceStatus: closing.varianceStatus,
      lowStockCount,
      cashierName: session.fullName,
    });
    const msg = `Arsip PDF rekap tutup kasir berhasil diunduh (${fileName}).`;
    setCopiedNotice(msg);
    onNotify?.(msg);
    window.setTimeout(() => setCopiedNotice(null), 4000);
  };

  return (
    <>
      <ModalShell
        open={open}
        onClose={onClose}
        closeOnEscape={true}
        headerId="daily-closing-modal-header"
        testId="daily-closing-modal"
        title="Tutup Toko & Rekap Kasir Hari Ini"
        subtitle={`Cocokkan uang fisik di laci untuk ${closing.dateLabel} beserta ringkasan belanja stok.`}
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              data-testid="daily-closing-pdf-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
            >
              <FileDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Unduh PDF</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyRecap()}
              data-testid="daily-closing-copy-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Salin Rekap</span>
            </button>

            {waPolicy.canSendOwnerRecap && waPolicy.channel === 'FONNTE' && (
              <button
                type="button"
                data-testid="daily-closing-wa-link"
                onClick={() => setFonnteOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Kirim ke WA Pemilik (Fonnte)</span>
              </button>
            )}

            {waPolicy.canSendOwnerRecap &&
              waPolicy.channel === 'WA_ME_DIRECT' &&
              ownerRecapLink.ok &&
              ownerRecapLink.url && (
                <a
                  href={ownerRecapLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="daily-closing-wa-link"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Kirim Rekap ke WA Pemilik</span>
                  <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                </a>
              )}
          </div>
        }
      >
        <div className="p-6 space-y-4">
          {copiedNotice && (
            <div
              role="status"
              className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
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
              <p className="text-[10px] text-stone-500">{closing.orderCount} nota</p>
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

          {lowStockCount > 0 && (
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-700">
              <span className="inline-flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={1.75} />
                <span>
                  Ada <strong className="text-stone-900">{lowStockCount} barang</strong> yang stoknya menipis untuk belanja besok.
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/inventory/restock-monitor');
                }}
                className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
              >
                Lihat Daftar
              </button>
            </div>
          )}

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

          {/* Owner WhatsApp Policy Status */}
          {waPolicy.canSendOwnerRecap ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs">
              <span className="text-stone-600">
                Tujuan WA Pemilik:{' '}
                <strong className="font-mono text-stone-900">{savedOwnerWa}</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/settings/custom-fields?tab=payments_wa');
                }}
                className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
              >
                Ubah Nomor
              </button>
            </div>
          ) : (
            <div
              data-testid="daily-closing-wa-missing-notice"
              className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 text-xs text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <p className="font-semibold">Nomor WhatsApp Pemilik belum diisi</p>
                  <p className="text-[11px] text-amber-900/90 mt-0.5 leading-relaxed">
                    Tambahkan nomor WhatsApp pemilik di Pengaturan terlebih dahulu untuk mengaktifkan tombol kirim rekap ke WhatsApp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="daily-closing-goto-settings-wa"
                onClick={() => {
                  onClose();
                  navigate('/settings/custom-fields?tab=payments_wa');
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Isi di Pengaturan</span>
              </button>
            </div>
          )}

          {/* WhatsApp Message Preview */}
          <div>
            <p className="text-[11px] font-medium text-stone-500 mb-1">Pratinjau Ringkasan Rekap</p>
            <pre className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-[11px] font-mono text-stone-800 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
              {closing.whatsappMessage}
            </pre>
          </div>
        </div>
      </ModalShell>

      {waPolicy.channel === 'FONNTE' && (
        <FonnteSendModal
          open={fonnteOpen}
          onClose={() => setFonnteOpen(false)}
          title="Kirim Rekap Tutup Kasir ke WA Pemilik (Fonnte)"
          defaultPhone={savedOwnerWa}
          defaultMessage={closing.whatsappMessage}
          documentType="RECEIPT"
          referenceNo={`CLOSING-${closing.dateLabel}`}
        />
      )}
    </>
  );
}

