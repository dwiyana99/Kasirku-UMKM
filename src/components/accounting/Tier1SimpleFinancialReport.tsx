import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Calendar,
  CheckCircle2,
  Copy,
  FileDown,
  MessageCircle,
  Printer,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  buildTier1ReceiptText,
  computeTier1PeriodReport,
  FINANCIAL_PERIOD_OPTIONS,
  type FinancialReportPeriod,
} from '../../lib/accounting/tier1-period-report';
import { downloadTier1ReportPdf } from '../../lib/pdf/tier1-report-pdf';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';

interface Tier1SimpleFinancialReportProps {
  /** Retained as optional no-op for backward compatibility */
  showUpgradeBanner?: boolean;
}

/**
 * Tier-1 Simple Financial Report (Harian, Mingguan, Bulanan, Triwulan, YTD)
 * Unlocked for ALL plans including Paket LITE (0 AI Token, Decimal.js).
 * - Unduh PDF: Always available via jsPDF (works reliably on mobile, desktop, and iframe).
 * - Kirim ke WA: Shown ONLY when ADDON_WA_FONNTE is active.
 * - Cetak Struk Ringkasan: Shown ONLY when ADDON_THERMAL_RECEIPT is active.
 */
export function Tier1SimpleFinancialReport(_props: Tier1SimpleFinancialReportProps) {
  const { activeWorkspace, navigate, hasAddOn } = useApp();
  const [period, setPeriod] = useState<FinancialReportPeriod>('MONTHLY');
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('58mm');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const canSendWa = hasAddOn('ADDON_WA_FONNTE');
  const canPrintReceipt = hasAddOn('ADDON_THERMAL_RECEIPT');

  const report = useMemo(
    () =>
      computeTier1PeriodReport({
        orders: activeWorkspace.orders,
        expenses: activeWorkspace.expenses,
        products: activeWorkspace.products,
        accounts: activeWorkspace.accounts,
        period,
      }),
    [
      activeWorkspace.orders,
      activeWorkspace.expenses,
      activeWorkspace.products,
      activeWorkspace.accounts,
      period,
    ]
  );

  const receiptText = useMemo(
    () =>
      buildTier1ReceiptText({
        tenantName: activeWorkspace.tenant.name,
        report,
        paperWidth,
      }),
    [activeWorkspace.tenant.name, report, paperWidth]
  );

  const waShareUrl = useMemo(() => {
    const lines = [
      `*${report.periodLabel}*`,
      `${activeWorkspace.tenant.name}`,
      `Periode: ${report.rangeLabel}`,
      `--------------------------------`,
      `Penjualan Bersih: ${formatRupiah(report.netSales)} (${report.orderCount} nota)`,
      `Modal Barang (HPP): ${formatRupiah(report.totalHpp)}`,
      `Untung Kotor: ${formatRupiah(report.grossProfit)}`,
      `Biaya Usaha: ${formatRupiah(report.totalExpenses)}`,
      `*Untung Bersih: ${formatRupiah(report.netProfit)}* (Margin ${report.netMarginPct}%)`,
      `--------------------------------`,
      `Tunai: ${formatRupiah(report.cashSales)}`,
      `Non-Tunai: ${formatRupiah(report.nonCashSales)}`,
    ].join('\n');
    return `https://wa.me/?text=${encodeURIComponent(lines)}`;
  }, [activeWorkspace.tenant.name, report]);

  const isProfit = new Decimal(report.netProfit).gte(0);

  const handleDownloadPdf = () => {
    try {
      const fileName = downloadTier1ReportPdf({
        tenantName: activeWorkspace.tenant.name,
        report,
      });
      setPdfNotice(`Laporan PDF berhasil diunduh (${fileName}).`);
      window.setTimeout(() => setPdfNotice(null), 4500);
    } catch {
      setPdfNotice('Gagal membuat file PDF. Silakan coba lagi.');
    }
  };

  const handlePrintThermalReceipt = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    const widthCss = paperWidth === '80mm' ? '76mm' : '54mm';
    const escapedText = receiptText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Struk Ringkasan - ${activeWorkspace.tenant.name}</title>
<style>
  @page { margin: 4mm; size: ${paperWidth} auto; }
  body { margin: 0; padding: 6px; font-family: 'JetBrains Mono', 'Courier New', monospace; color: #1c1917; background: #fff; }
  pre { margin: 0 auto; width: ${widthCss}; font-size: 11px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body><pre>${escapedText}</pre></body>
</html>`);
    doc.close();

    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }, 120);
  };

  const handleCopyReceiptText = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      setCopyStatus('Teks struk ringkasan berhasil disalin.');
      window.setTimeout(() => setCopyStatus(null), 3500);
    } catch {
      setCopyStatus('Salin teks struk secara manual dari kotak pratinjau.');
    }
  };

  return (
    <div className="space-y-5" data-testid="tier1-simple-financial-report">
      {pdfNotice && (
        <div
          role="status"
          data-testid="tier1-pdf-status"
          className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{pdfNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setPdfNotice(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Period Selector + Export Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-stone-900">
              {report.periodLabel}
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Periode data: <span className="font-mono text-stone-700">{report.rangeLabel}</span> ·{' '}
            {report.orderCount} transaksi lunas · {report.expenseCount} catatan biaya
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            data-testid="tier1-period-tabs"
            role="tablist"
            aria-label="Pilih periode laporan keuangan"
            className="w-full sm:w-auto grid grid-cols-5 sm:inline-flex border border-stone-200 rounded-lg overflow-hidden bg-stone-50"
          >
            {FINANCIAL_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                role="tab"
                aria-selected={period === opt.code}
                data-testid={`tier1-period-${opt.code.toLowerCase()}`}
                onClick={() => setPeriod(opt.code)}
                className={`px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium text-center whitespace-nowrap ${
                  period === opt.code
                    ? 'bg-emerald-600 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>

          {canPrintReceipt && (
            <button
              type="button"
              onClick={() => setReceiptModalOpen(true)}
              data-testid="btn-print-tier1-receipt"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg whitespace-nowrap"
            >
              <ReceiptText className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>Cetak Struk Ringkasan</span>
            </button>
          )}

          {canSendWa && (
            <a
              href={waShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="btn-wa-tier1-report"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Kirim ke WA</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleDownloadPdf}
            data-testid="btn-download-tier1-pdf"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Unduh PDF</span>
          </button>
        </div>
      </div>

      {/* 4-Column Hairline KPI Summary */}
      <section className="bg-white border border-stone-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
        <div className="p-5">
          <p className="text-xs text-stone-500">Total Penjualan Bersih</p>
          <p
            data-testid="tier1-net-sales"
            className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1"
          >
            {formatRupiah(report.netSales)}
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            {report.orderCount} transaksi lunas
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-stone-500">Modal Barang Terjual (HPP)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-stone-800 mt-1">
            {formatRupiah(report.totalHpp)}
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            Laba kotor: {formatRupiah(report.grossProfit)}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-stone-500">Total Biaya Usaha</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">
            {formatRupiah(report.totalExpenses)}
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            {report.expenseCount} pengeluaran tercatat
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs text-stone-500">Untung (Rugi) Bersih</p>
          <p
            data-testid="tier1-net-profit"
            className={`text-2xl font-bold font-mono tabular-nums mt-1 flex items-center gap-1.5 ${
              isProfit ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isProfit ? (
              <TrendingUp className="w-5 h-5 shrink-0" strokeWidth={1.75} />
            ) : (
              <TrendingDown className="w-5 h-5 shrink-0" strokeWidth={1.75} />
            )}
            <span>{formatRupiah(report.netProfit)}</span>
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            Margin bersih {report.netMarginPct}%
          </p>
        </div>
      </section>

      {/* 2-Column Detailed Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Ringkasan Laba Rugi Sederhana */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Rincian Untung Rugi ({report.rangeLabel})
            </h3>
            <p className="text-xs text-stone-500">
              Dihitung otomatis dari transaksi kasir dan biaya operasional yang Anda catat.
            </p>
          </div>

          <div className="divide-y divide-stone-100 text-xs sm:text-sm">
            <div className="py-2.5 flex justify-between">
              <span className="text-stone-600">Penjualan Kotor</span>
              <span className="font-mono tabular-nums text-stone-900">
                {formatRupiah(report.grossSales)}
              </span>
            </div>
            {new Decimal(report.discountTotal).gt(0) && (
              <div className="py-2.5 flex justify-between">
                <span className="text-stone-600">Potongan / Diskon</span>
                <span className="font-mono tabular-nums text-rose-700">
                  -{formatRupiah(report.discountTotal)}
                </span>
              </div>
            )}
            <div className="py-2.5 flex justify-between font-medium">
              <span className="text-stone-800">Penjualan Bersih</span>
              <span className="font-mono tabular-nums text-stone-900">
                {formatRupiah(report.netSales)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-stone-600">Modal Barang (HPP)</span>
              <span className="font-mono tabular-nums text-stone-700">
                -{formatRupiah(report.totalHpp)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between font-semibold">
              <span className="text-stone-900">Untung Kotor</span>
              <span className="font-mono tabular-nums text-stone-900">
                {formatRupiah(report.grossProfit)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-stone-600">Biaya Operasional Usaha</span>
              <span className="font-mono tabular-nums text-rose-700">
                -{formatRupiah(report.totalExpenses)}
              </span>
            </div>
            <div className="py-3 flex justify-between text-base font-bold">
              <span className="text-stone-900">Untung Bersih Periode Ini</span>
              <span
                className={`font-mono tabular-nums ${
                  isProfit ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatRupiah(report.netProfit)}
              </span>
            </div>
          </div>
        </section>

        {/* Penerimaan Uang & Rincian Biaya */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
              <h3 className="text-sm font-semibold text-stone-900">
                Penerimaan Tunai vs Non-Tunai
              </h3>
            </div>
            <div className="divide-y divide-stone-100 text-xs sm:text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-stone-600">Uang Tunai (Laci Kasir)</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700">
                  {formatRupiah(report.cashSales)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-stone-600">Non-Tunai (QRIS / Transfer / E-Wallet)</span>
                <span className="font-mono font-semibold tabular-nums text-stone-900">
                  {formatRupiah(report.nonCashSales)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Rincian Biaya Usaha</h3>
              <button
                type="button"
                onClick={() => navigate('/expenses')}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                Catat Biaya
              </button>
            </div>
            {report.expenseBreakdown.length === 0 ? (
              <p className="text-xs text-stone-500 py-2">
                Belum ada pengeluaran biaya operasional tercatat pada periode ini.
              </p>
            ) : (
              <div className="divide-y divide-stone-100 text-xs">
                {report.expenseBreakdown.map((row) => (
                  <div key={row.category} className="py-2 flex justify-between gap-2">
                    <span className="text-stone-700">
                      {row.category}{' '}
                      <span className="text-stone-400">({row.count}x)</span>
                    </span>
                    <span className="font-mono font-medium tabular-nums text-rose-700">
                      {formatRupiah(row.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Thermal Receipt Summary Modal (mounted ONLY when ADDON_THERMAL_RECEIPT is active) */}
      {canPrintReceipt && (
        <ModalShell
          open={receiptModalOpen}
          onClose={() => setReceiptModalOpen(false)}
          headerId="tier1-receipt-modal-header"
          testId="tier1-receipt-modal"
          maxWidthClass="max-w-md"
          title="Pratinjau Struk Ringkasan Keuangan"
          subtitle={`${report.periodLabel} (${report.rangeLabel}) siap dicetak ke printer thermal.`}
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleCopyReceiptText()}
                data-testid="btn-copy-tier1-receipt"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Salin Teks</span>
              </button>
              <button
                type="button"
                onClick={handlePrintThermalReceipt}
                data-testid="btn-confirm-print-tier1-receipt"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Cetak Struk ({paperWidth})</span>
              </button>
            </div>
          }
        >
          <div className="p-5 space-y-4">
            {copyStatus && (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
                <span>{copyStatus}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-stone-600">Lebar Kertas Thermal</span>
              <div className="inline-flex border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
                {(['58mm', '80mm'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPaperWidth(w)}
                    className={`px-3 py-1 text-xs font-mono font-medium ${
                      paperWidth === w
                        ? 'bg-emerald-600 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-stone-100 border border-stone-200 rounded-xl p-4 flex justify-center overflow-x-auto">
              <pre
                data-testid="tier1-receipt-preview"
                className="bg-white border border-stone-200 rounded-lg px-4 py-4 font-mono text-[11px] leading-relaxed text-stone-900 shadow-xs whitespace-pre"
              >
                {receiptText}
              </pre>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
