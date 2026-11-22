import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  computeBulkAdjustmentPreview,
  isStockTrackedProduct,
  STOCK_ADJUSTMENT_REASONS,
  type BulkAdjustmentLineInput,
} from '../../lib/inventory/stock-monitoring';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';
import type { StockAdjustmentReasonCode } from '../../types/domain';

interface BulkStockAdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (summaryMessage: string) => void;
}

interface RowDraft {
  actualStockQty: string;
  reasonCode: StockAdjustmentReasonCode;
  reasonTouched: boolean;
  notes: string;
}

export function BulkStockAdjustmentModal({
  open,
  onClose,
  onSuccess,
}: BulkStockAdjustmentModalProps) {
  const { activeWorkspace, bulkAdjustInventoryStock } = useApp();

  const trackedProducts = useMemo(
    () =>
      activeWorkspace.products
        .filter(isStockTrackedProduct)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeWorkspace.products]
  );

  const [defaultReason, setDefaultReason] = useState<StockAdjustmentReasonCode>('BREAKAGE');
  const [batchNotes, setBatchNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize fresh row drafts whenever modal opens
  useEffect(() => {
    if (!open) return;
    const initial: Record<string, RowDraft> = {};
    for (const prod of trackedProducts) {
      initial[prod.id] = {
        actualStockQty: String(Number(prod.stockQty || '0')),
        reasonCode: 'BREAKAGE',
        reasonTouched: false,
        notes: '',
      };
    }
    setDrafts(initial);
    setDefaultReason('BREAKAGE');
    setBatchNotes('');
    setSearchQuery('');
    setOnlyChanged(false);
    setSubmitError(null);
  }, [open, trackedProducts]);

  const entryInputs: BulkAdjustmentLineInput[] = useMemo(() => {
    return trackedProducts.map((p) => {
      const row = drafts[p.id];
      return {
        productId: p.id,
        actualStockQty: row ? row.actualStockQty : String(Number(p.stockQty || '0')),
        reasonCode: row ? row.reasonCode : defaultReason,
        notes: row ? row.notes : '',
      };
    });
  }, [trackedProducts, drafts, defaultReason]);

  const preview = useMemo(
    () => computeBulkAdjustmentPreview(entryInputs, trackedProducts),
    [entryInputs, trackedProducts]
  );

  const previewByProductId = useMemo(
    () => new Map(preview.lines.map((l) => [l.productId, l])),
    [preview.lines]
  );

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trackedProducts.filter((p) => {
      const line = previewByProductId.get(p.id);
      if (onlyChanged && !line?.hasChange) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcodeQr.toLowerCase().includes(q)
      );
    });
  }, [trackedProducts, previewByProductId, onlyChanged, searchQuery]);

  const updateRowQty = (productId: string, rawVal: string, systemStockStr: string) => {
    setDrafts((prev) => {
      const current = prev[productId] ?? {
        actualStockQty: String(Number(systemStockStr || '0')),
        reasonCode: defaultReason,
        reasonTouched: false,
        notes: '',
      };
      let nextReason = current.reasonCode;
      if (!current.reasonTouched && rawVal.trim() !== '') {
        try {
          const entered = new Decimal(rawVal);
          const sys = new Decimal(systemStockStr || '0');
          if (entered.gt(sys)) {
            nextReason = 'OPNAME_SURPLUS';
          } else if (entered.lt(sys) && nextReason === 'OPNAME_SURPLUS') {
            nextReason = defaultReason === 'OPNAME_SURPLUS' ? 'LOSS' : defaultReason;
          }
        } catch {
          // keep current reason
        }
      }
      return {
        ...prev,
        [productId]: {
          ...current,
          actualStockQty: rawVal,
          reasonCode: nextReason,
        },
      };
    });
  };

  const updateRowReason = (productId: string, reasonCode: StockAdjustmentReasonCode) => {
    setDrafts((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          reasonCode,
          reasonTouched: true,
        },
      };
    });
  };

  const updateRowNotes = (productId: string, notes: string) => {
    setDrafts((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          notes,
        },
      };
    });
  };

  const applyDefaultReasonToAll = () => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const [id, row] of Object.entries(prev)) {
        next[id] = {
          ...row,
          reasonCode: defaultReason,
          reasonTouched: false,
        };
      }
      return next;
    });
  };

  const resetAllQuantities = () => {
    const reset: Record<string, RowDraft> = {};
    for (const prod of trackedProducts) {
      reset[prod.id] = {
        actualStockQty: String(Number(prod.stockQty || '0')),
        reasonCode: defaultReason,
        reasonTouched: false,
        notes: '',
      };
    }
    setDrafts(reset);
    setSubmitError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preview.changedCount === 0) {
      setSubmitError('Ubah minimal 1 jumlah stok fisik untuk menerapkan penyesuaian.');
      return;
    }

    const result = bulkAdjustInventoryStock({
      entries: preview.changedLines.map((l) => ({
        productId: l.productId,
        actualStockQty: l.actualQty,
        reasonCode: l.reasonCode,
        notes: l.notes,
      })),
      batchNotes,
    });

    const journalText = result.journalEntryNumber
      ? ` Jurnal penyesuaian ${result.journalEntryNumber} otomatis diposting.`
      : '';
    onSuccess(
      `Bulk Stock Opname berhasil memperbarui ${result.adjustedCount} item (dampak nilai bersih: ${formatRupiah(result.netValuationDelta)}).${journalText}`
    );
    onClose();
  };

  const netDeltaDec = new Decimal(preview.netValuationDelta);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      headerId="bulk-adjustment-modal-header"
      title="Bulk Stock Opname & Penyesuaian Massal"
      subtitle="Masukkan jumlah fisik aktual pada beberapa item sekaligus, pilih kode alasan, lalu simpan dalam 1 transaksi atomik beserta jurnal otomatis."
      testId="bulk-adjustment-modal"
      maxWidthClass="max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Batch Controls Toolbar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 space-y-3">
          {submitError && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3 min-w-0">
              <label
                htmlFor="bulk-search-input"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Cari Produk / SKU
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="bulk-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nama, SKU, barcode..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="md:col-span-5 min-w-0">
              <label
                htmlFor="bulk-default-reason"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Kode Alasan Default Batch
              </label>
              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  id="bulk-default-reason"
                  data-testid="bulk-default-reason-select"
                  value={defaultReason}
                  onChange={(e) => setDefaultReason(e.target.value as StockAdjustmentReasonCode)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600 truncate"
                >
                  {STOCK_ADJUSTMENT_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applyDefaultReasonToAll}
                  className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  Terapkan
                </button>
              </div>
            </div>

            <div className="md:col-span-4 min-w-0">
              <label
                htmlFor="bulk-batch-notes"
                className="block text-[11px] font-semibold text-slate-600 mb-1"
              >
                Catatan Batch Opname (Opsional)
              </label>
              <input
                id="bulk-batch-notes"
                data-testid="bulk-batch-notes-input"
                type="text"
                value={batchNotes}
                onChange={(e) => setBatchNotes(e.target.value)}
                placeholder="Mis. Stock opname rutin akhir pekan"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>Hanya tampilkan item yang berubah ({preview.changedCount})</span>
            </label>

            <button
              type="button"
              onClick={resetAllQuantities}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset ke Stok Sistem</span>
            </button>
          </div>
        </div>

        {/* Bulk Items Table */}
        <div className="overflow-x-auto">
          {visibleProducts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              {trackedProducts.length === 0
                ? 'Belum ada produk/bahan baku yang melacak stok.'
                : 'Tidak ada item yang cocok dengan filter pencarian.'}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Produk / Bahan</th>
                  <th className="px-3 py-2.5 text-right">Stok Sistem</th>
                  <th className="px-3 py-2.5 w-32">Stok Fisik</th>
                  <th className="px-3 py-2.5 text-right">Selisih &amp; Nilai</th>
                  <th className="px-3 py-2.5 w-52">Kode Alasan</th>
                  <th className="px-4 py-2.5 w-44">Catatan Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleProducts.map((prod) => {
                  const row = drafts[prod.id] ?? {
                    actualStockQty: String(Number(prod.stockQty || '0')),
                    reasonCode: defaultReason,
                    reasonTouched: false,
                    notes: '',
                  };
                  const line = previewByProductId.get(prod.id);
                  const deltaDec = new Decimal(line?.qtyDelta ?? '0');
                  const hasChange = Boolean(line?.hasChange);

                  return (
                    <tr
                      key={prod.id}
                      data-testid={`bulk-row-${prod.id}`}
                      className={hasChange ? 'bg-amber-50/45' : 'bg-white hover:bg-slate-50/60'}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">{prod.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {prod.sku} · HPP {formatRupiah(prod.costPriceAvg)}/{prod.unit}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {Number(prod.stockQty)} {prod.unit}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          aria-label={`Stok fisik aktual ${prod.name}`}
                          data-testid={`bulk-actual-qty-${prod.id}`}
                          value={row.actualStockQty}
                          onChange={(e) => updateRowQty(prod.id, e.target.value, prod.stockQty)}
                          className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border focus:outline-none ${
                            hasChange
                              ? 'border-amber-400 bg-white font-semibold text-slate-900 focus:border-emerald-600'
                              : 'border-slate-200 bg-white text-slate-700 focus:border-emerald-600'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        {hasChange ? (
                          <div>
                            <p
                              data-testid={`bulk-delta-${prod.id}`}
                              className={`font-bold ${
                                deltaDec.lt(0) ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {deltaDec.gt(0) ? '+' : ''}
                              {Number(deltaDec.toFixed(4))} {prod.unit}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatRupiah(line?.valueImpact ?? '0')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">0 (Sesuai)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          aria-label={`Kode alasan ${prod.name}`}
                          data-testid={`bulk-reason-${prod.id}`}
                          value={row.reasonCode}
                          onChange={(e) =>
                            updateRowReason(prod.id, e.target.value as StockAdjustmentReasonCode)
                          }
                          disabled={!hasChange}
                          className={`w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none ${
                            hasChange
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {STOCK_ADJUSTMENT_REASONS.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.shortLabel} ({r.code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          aria-label={`Catatan ${prod.name}`}
                          data-testid={`bulk-note-${prod.id}`}
                          value={row.notes}
                          onChange={(e) => updateRowNotes(prod.id, e.target.value)}
                          disabled={!hasChange}
                          placeholder={hasChange ? 'Keterangan...' : '—'}
                          className={`w-full px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none ${
                            hasChange
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sticky Summary Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-slate-900">
              {preview.changedCount} item disesuaikan
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600">
              Selisih Kurang:{' '}
              <strong className="font-mono text-rose-700 tabular-nums">
                -{formatRupiah(preview.totalShortageValue)}
              </strong>
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600">
              Surplus:{' '}
              <strong className="font-mono text-emerald-700 tabular-nums">
                +{formatRupiah(preview.totalSurplusValue)}
              </strong>
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-700 font-semibold">
              Dampak Bersih:{' '}
              <span
                data-testid="bulk-net-valuation-delta"
                className={`font-mono tabular-nums ${
                  netDeltaDec.lt(0)
                    ? 'text-rose-700'
                    : netDeltaDec.gt(0)
                    ? 'text-emerald-700'
                    : 'text-slate-700'
                }`}
              >
                {formatRupiah(preview.netValuationDelta)}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={preview.changedCount === 0}
              data-testid="bulk-adjustment-submit-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Terapkan Penyesuaian ({preview.changedCount} Item)</span>
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
