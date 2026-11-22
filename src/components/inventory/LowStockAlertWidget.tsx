import React, { useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  PackageCheck,
  PackagePlus,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { processUploadedImageFile } from '../../lib/catalog/image-upload';
import { isValidProductImageSource } from '../../lib/catalog/recipe-bom-utils';
import {
  evaluateStockAlerts,
  type StockAlertItem,
  type StockAlertSeverity,
} from '../../lib/inventory/stock-monitoring';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { tenantHasAddOn } from '../../lib/saas/hybrid-pricing';
import { ModalShell } from '../ui/ModalShell';

export const CATALOG_INITIAL_TAB_KEY = 'kasirakun_catalog_initial_tab';

type SeverityFilter = 'ALL' | 'URGENT' | 'WARNING';

interface LowStockAlertWidgetProps {
  onRestockSuccess?: (message: string) => void;
}

export function LowStockAlertWidget({ onRestockSuccess }: LowStockAlertWidgetProps) {
  const { activeWorkspace, navigate, restockInventoryItem } = useApp();

  const evaluation = useMemo(
    () => evaluateStockAlerts(activeWorkspace.products),
    [activeWorkspace.products]
  );

  const [filter, setFilter] = useState<SeverityFilter>('ALL');
  const [restockTarget, setRestockTarget] = useState<StockAlertItem | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockUnitCost, setRestockUnitCost] = useState('');
  const [restockPayAccount, setRestockPayAccount] = useState<'1101' | '1102' | '2101'>('1101');
  const [restockReceiptNo, setRestockReceiptNo] = useState('');
  const [restockSupplier, setRestockSupplier] = useState('');
  const [restockReceiptImg, setRestockReceiptImg] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  const quickReceiptFileRef = useRef<HTMLInputElement | null>(null);

  if (evaluation.totalTrackedCount === 0) {
    return null;
  }

  const filteredAlerts = evaluation.alerts.filter((item) => {
    if (filter === 'URGENT') {
      return item.severity === 'OUT_OF_STOCK' || item.severity === 'CRITICAL';
    }
    if (filter === 'WARNING') {
      return item.severity === 'LOW_WARNING';
    }
    return true;
  });

  const openQuickRestock = (item: StockAlertItem) => {
    setRestockError(null);
    setRestockTarget(item);
    setRestockQty(String(Number(item.suggestedRestockQty)));
    setRestockUnitCost(String(Number(item.product.costPriceAvg || '0')));
    setRestockPayAccount('1101');
    setRestockReceiptNo('');
    setRestockSupplier(item.product.supplierName ?? '');
    setRestockReceiptImg('');
  };

  const handleUploadQuickReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setRestockError(null);
    try {
      const dataUrl = await processUploadedImageFile(file);
      setRestockReceiptImg(dataUrl);
    } catch (err) {
      setRestockError(err instanceof Error ? err.message : 'Gagal memproses foto nota.');
    } finally {
      setUploadingReceipt(false);
      if (quickReceiptFileRef.current) quickReceiptFileRef.current.value = '';
    }
  };

  const handleConfirmQuickRestock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    try {
      const qtyDec = new Decimal(restockQty || '0');
      const costDec = new Decimal(restockUnitCost || '0');
      if (qtyDec.lte(0)) {
        setRestockError('Jumlah restok harus lebih besar dari 0.');
        return;
      }
      if (costDec.lt(0)) {
        setRestockError('Harga beli satuan tidak boleh negatif.');
        return;
      }

      const res = restockInventoryItem({
        productId: restockTarget.product.id,
        addedQty: qtyDec.toFixed(4),
        unitPurchaseCost: costDec.toFixed(4),
        paymentAccountCode: restockPayAccount,
        receiptNumber: restockReceiptNo || undefined,
        supplierName: restockSupplier || undefined,
        receiptImageUrl: restockReceiptImg || undefined,
      });

      const msg = `Restok ${restockTarget.product.name} (+${qtyDec.toString()} ${restockTarget.product.unit}) berhasil. Stok baru: ${Number(res.newQty)} ${restockTarget.product.unit}.`;
      setRestockTarget(null);
      setInlineNotice(msg);
      onRestockSuccess?.(msg);
      window.setTimeout(() => setInlineNotice(null), 5000);
    } catch (err) {
      setRestockError(err instanceof Error ? err.message : 'Gagal memproses restok.');
    }
  };

  const handleOpenStockAdjustments = () => {
    try {
      window.sessionStorage.setItem(CATALOG_INITIAL_TAB_KEY, 'STOCK_ADJUSTMENTS');
    } catch {
      // ignore storage errors
    }
    navigate('/catalog');
  };

  const handleOpenProcurement = () => {
    try {
      window.sessionStorage.setItem(CATALOG_INITIAL_TAB_KEY, 'STOCK_RAW');
    } catch {
      // ignore storage errors
    }
    navigate('/catalog');
  };

  const renderSeverityMeta = (severity: StockAlertSeverity) => {
    if (severity === 'OUT_OF_STOCK') {
      return {
        label: 'Habis (0)',
        icon: XCircle,
        textClass: 'text-rose-700',
        barClass: 'bg-rose-600',
        rowTint: 'bg-rose-50/40',
      };
    }
    if (severity === 'CRITICAL') {
      return {
        label: 'Di Bawah Min',
        icon: AlertTriangle,
        textClass: 'text-rose-700',
        barClass: 'bg-rose-500',
        rowTint: 'bg-amber-50/35',
      };
    }
    return {
      label: 'Mendekati Batas',
      icon: AlertTriangle,
      textClass: 'text-amber-700',
      barClass: 'bg-amber-500',
      rowTint: 'bg-white',
    };
  };

  const restockPreviewTotal = (() => {
    if (!restockTarget) return '0';
    try {
      const q = new Decimal(restockQty || '0');
      const c = new Decimal(restockUnitCost || '0');
      return q.gt(0) && c.gte(0) ? q.times(c).toFixed(4) : '0';
    } catch {
      return '0';
    }
  })();

  return (
    <section
      data-testid="low-stock-dashboard-widget"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {evaluation.counts.total > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <h2 className="text-base font-semibold text-slate-900">
              Monitor Stok &amp; Peringatan Restok
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Memantau {evaluation.totalTrackedCount} barang terhadap batas stok minimum
            {evaluation.counts.total > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-rose-700">
                  {evaluation.counts.outOfStock + evaluation.counts.critical} kritis/habis
                </span>
                {evaluation.counts.lowWarning > 0 && (
                  <>
                    {' · '}
                    <span className="font-semibold text-amber-700">
                      {evaluation.counts.lowWarning} mendekati batas
                    </span>
                  </>
                )}
                {' · '}
                Est. restok{' '}
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatRupiah(evaluation.totalEstimatedRestockCost)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenStockAdjustments}
            data-testid="widget-open-adjustments-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-slate-600" />
            <span>Penyesuaian Stok</span>
          </button>
          <button
            type="button"
            onClick={handleOpenProcurement}
            data-testid="widget-open-catalog-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <span>Kulakan &amp; Stok</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {inlineNotice && (
        <div
          role="status"
          className="mx-6 mt-4 flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{inlineNotice}</span>
        </div>
      )}

      {evaluation.counts.total === 0 ? (
        <div className="px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Semua stok berada di atas batas minimum aman
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {evaluation.healthyCount} dari {evaluation.totalTrackedCount} item terpantau sehat.
                Lakukan stock opname berkala untuk menjaga akurasi fisik &amp; pembukuan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenStockAdjustments}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
          >
            Buka Penyesuaian Stok →
          </button>
        </div>
      ) : (
        <div>
          <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1" role="tablist" aria-label="Filter peringatan stok">
              {[
                { id: 'ALL' as const, label: `Semua (${evaluation.counts.total})` },
                {
                  id: 'URGENT' as const,
                  label: `Habis / Di Bawah Min (${evaluation.counts.outOfStock + evaluation.counts.critical})`,
                },
                {
                  id: 'WARNING' as const,
                  label: `Mendekati Batas (${evaluation.counts.lowWarning})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    filter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Peringatan dini aktif saat stok ≤ 150% batas minimum
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredAlerts.length === 0 ? (
              <div className="px-6 py-6 text-center text-xs text-slate-500">
                Tidak ada item pada kategori filter ini.
              </div>
            ) : (
              filteredAlerts.map((item) => {
                const meta = renderSeverityMeta(item.severity);
                const SeverityIcon = meta.icon;
                const progressWidth = Math.min(100, Math.max(4, Math.round((item.coveragePct / 150) * 100)));

                return (
                  <div
                    key={item.product.id}
                    data-testid={`low-stock-item-${item.product.id}`}
                    className={`px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${meta.rowTint}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {item.product.name}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-mono text-slate-500">{item.product.sku}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${meta.textClass}`}
                        >
                          <SeverityIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>{meta.label}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-36 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                          <div
                            className={`h-full rounded-full ${meta.barClass}`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-600 font-mono tabular-nums">
                          Sisa{' '}
                          <strong className={meta.textClass}>
                            {Number(item.currentStock)} {item.product.unit}
                          </strong>{' '}
                          / Min. {Number(item.minStockAlert)} {item.product.unit}
                        </p>
                        <span className="text-xs text-slate-300 hidden sm:inline">·</span>
                        <p className="text-xs text-slate-500 tabular-nums">
                          Saran restok:{' '}
                          <span className="font-mono font-semibold text-slate-700">
                            +{Number(item.suggestedRestockQty)} {item.product.unit}
                          </span>{' '}
                          ({formatRupiah(item.estimatedRestockCost)})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openQuickRestock(item)}
                        data-testid={`quick-restock-btn-${item.product.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        <span>Restok Cepat</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Quick Restock Modal wrapped in strict ModalShell */}
      <ModalShell
        open={Boolean(restockTarget)}
        onClose={() => setRestockTarget(null)}
        headerId="quick-restock-modal-header"
        title={restockTarget ? `Restok Cepat — ${restockTarget.product.name}` : ''}
        subtitle={
          restockTarget
            ? `Sisa ${Number(restockTarget.currentStock)} ${restockTarget.product.unit} · Min. ${Number(
                restockTarget.minStockAlert
              )} ${restockTarget.product.unit}`
            : undefined
        }
        testId="quick-restock-modal"
        maxWidthClass="max-w-md"
      >
        {restockTarget && (
          <form onSubmit={handleConfirmQuickRestock} className="p-5 space-y-4">
            {restockError && (
              <div
                role="alert"
                className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
              >
                {restockError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quick-restock-qty"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Jumlah Masuk ({restockTarget.product.unit}) *
                </label>
                <input
                  id="quick-restock-qty"
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-restock-cost"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Harga Beli / {restockTarget.product.unit} *
                </label>
                <input
                  id="quick-restock-cost"
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={restockUnitCost}
                  onChange={(e) => setRestockUnitCost(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="quick-restock-pay"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Sumber Pembayaran (Jurnal Otomatis)
              </label>
              <select
                id="quick-restock-pay"
                value={restockPayAccount}
                onChange={(e) =>
                  setRestockPayAccount(e.target.value as '1101' | '1102' | '2101')
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-emerald-600"
              >
                <option value="1101">Kas Tunai</option>
                <option value="1102">Transfer Bank / Rekening</option>
                {tenantHasAddOn(activeWorkspace.tenant, 'ADDON_PURCHASE_ORDER') && (
                  <option value="2101">Utang Usaha (Tempo Supplier)</option>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quick-restock-supplier"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Supplier (Opsional)
                </label>
                <input
                  id="quick-restock-supplier"
                  type="text"
                  value={restockSupplier}
                  onChange={(e) => setRestockSupplier(e.target.value)}
                  placeholder="Agen / Grosir"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-restock-nota"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  No. Nota (Opsional)
                </label>
                <input
                  id="quick-restock-nota"
                  type="text"
                  value={restockReceiptNo}
                  onChange={(e) => setRestockReceiptNo(e.target.value)}
                  placeholder="INV-..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Optional Purchase Receipt Upload */}
            <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-amber-950 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-amber-700" />
                  <span>Foto Bukti Pembelian / Nota (Opsional)</span>
                </span>
                <input
                  ref={quickReceiptFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadQuickReceipt(e)}
                  className="sr-only"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={uploadingReceipt}
                    onClick={() => quickReceiptFileRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-md"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{uploadingReceipt ? '...' : 'Unggah Nota'}</span>
                  </button>
                  {restockReceiptImg && (
                    <button
                      type="button"
                      onClick={() => setRestockReceiptImg('')}
                      aria-label="Hapus foto nota"
                      className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isValidProductImageSource(restockReceiptImg) && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-800">
                  <img
                    src={restockReceiptImg}
                    alt="Pratinjau nota"
                    className="w-10 h-10 rounded object-cover border border-amber-200"
                  />
                  <span>Bukti nota siap diarsipkan untuk cross-check &amp; pajak ✓</span>
                </div>
              )}
            </div>

            <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <span className="text-xs text-slate-600">Total Nilai Pembelian</span>
              <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
                {formatRupiah(restockPreviewTotal)}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRestockTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="quick-restock-submit-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Simpan Restok</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </section>
  );
}
