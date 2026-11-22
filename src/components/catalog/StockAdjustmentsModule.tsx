import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ClipboardCheck,
  History,
  Layers,
  Search,
  TrendingDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  evaluateStockAlerts,
  getReasonMeta,
  STOCK_ADJUSTMENT_REASONS,
} from '../../lib/inventory/stock-monitoring';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import type { InventoryMovement, StockAdjustmentReasonCode } from '../../types/domain';
import { BulkStockAdjustmentModal } from './BulkStockAdjustmentModal';

interface StockAdjustmentsModuleProps {
  onNotify: (msg: string) => void;
}

export function StockAdjustmentsModule({ onNotify }: StockAdjustmentsModuleProps) {
  const { activeWorkspace } = useApp();

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<'ALL' | StockAdjustmentReasonCode>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const productMap = useMemo(
    () => new Map(activeWorkspace.products.map((p) => [p.id, p])),
    [activeWorkspace.products]
  );

  const stockAlerts = useMemo(
    () => evaluateStockAlerts(activeWorkspace.products),
    [activeWorkspace.products]
  );

  const adjustmentMovements = useMemo(
    () =>
      activeWorkspace.inventoryMovements.filter((m) => m.movementType === 'OPNAME_ADJ'),
    [activeWorkspace.inventoryMovements]
  );

  const netAdjustmentValue = useMemo(() => {
    return adjustmentMovements.reduce((sum, m) => {
      const qty = new Decimal(m.qtyChange || '0');
      const cost = new Decimal(m.unitCost || '0');
      return sum.plus(qty.times(cost));
    }, new Decimal(0));
  }, [adjustmentMovements]);

  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return adjustmentMovements.filter((m) => {
      const effectiveReason = m.reasonCode ?? 'CORRECTION';
      if (reasonFilter !== 'ALL' && effectiveReason !== reasonFilter) return false;
      if (!q) return true;
      const prod = productMap.get(m.productId);
      const prodName = prod?.name.toLowerCase() ?? '';
      const prodSku = prod?.sku.toLowerCase() ?? '';
      const notes = (m.notes ?? '').toLowerCase();
      return prodName.includes(q) || prodSku.includes(q) || notes.includes(q);
    });
  }, [adjustmentMovements, reasonFilter, searchQuery, productMap]);

  const columns: DataTableColumn<InventoryMovement>[] = [
    {
      key: 'time',
      header: 'Waktu & Petugas',
      render: (mov) => {
        const dt = new Date(mov.createdAt);
        const formattedTime = Number.isNaN(dt.getTime())
          ? mov.createdAt
          : dt.toLocaleString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
        return (
          <div>
            <p className="font-mono text-[11px] text-slate-700 whitespace-nowrap">{formattedTime}</p>
            {mov.actorName && (
              <p className="text-[11px] text-slate-500">Oleh {mov.actorName}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'product',
      header: 'Produk / Bahan',
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        return (
          <div>
            <p className="font-semibold text-slate-900">{prod?.name ?? mov.productId}</p>
            {prod && <p className="text-[11px] font-mono text-slate-500">{prod.sku}</p>}
          </div>
        );
      },
    },
    {
      key: 'reason',
      header: 'Kode Alasan',
      render: (mov) => {
        const reasonMeta = getReasonMeta(mov.reasonCode);
        return (
          <div className="whitespace-nowrap">
            <span className="font-semibold text-slate-800">{reasonMeta.shortLabel}</span>
            <span className="ml-1.5 text-[11px] font-mono text-slate-400">{reasonMeta.code}</span>
          </div>
        );
      },
    },
    {
      key: 'delta',
      header: 'Selisih Qty',
      align: 'right',
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        const deltaDec = new Decimal(mov.qtyChange || '0');
        return (
          <span
            className={`font-mono font-bold tabular-nums whitespace-nowrap ${
              deltaDec.lt(0) ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {deltaDec.gt(0) ? '+' : ''}
            {Number(deltaDec.toFixed(4))} {prod?.unit ?? ''}
          </span>
        );
      },
    },
    {
      key: 'value',
      header: 'Dampak Nilai',
      align: 'right',
      render: (mov) => {
        const deltaDec = new Decimal(mov.qtyChange || '0');
        const valueImpact = deltaDec
          .times(new Decimal(mov.unitCost || '0'))
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        return (
          <span
            className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
              valueImpact.lt(0) ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatRupiah(valueImpact.toFixed(4))}
          </span>
        );
      },
    },
    {
      key: 'notes',
      header: 'Catatan',
      render: (mov) => (
        <span className="text-slate-600 block max-w-xs truncate">{mov.notes || '—'}</span>
      ),
    },
  ];

  return (
    <div data-testid="stock-adjustments-module" className="space-y-6">
      {/* Module Header Banner + Primary CTA */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Stock Adjustments &amp; Opname Massal
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
            Lakukan penghitungan stok fisik secara serentak untuk banyak produk/bahan dalam satu
            modal dengan kode alasan standar (barang rusak/pecah, kehilangan, kedaluwarsa, susut,
            atau surplus). Jurnal penyesuaian persediaan diposting otomatis &amp; seimbang.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setBulkModalOpen(true)}
          data-testid="open-bulk-adjustment-modal-btn"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Mulai Bulk Stock Opname</span>
        </button>
      </section>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Item Terpantau Stok</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {stockAlerts.totalTrackedCount}
          </p>
          <p className="text-[11px] text-slate-500">
            {stockAlerts.healthyCount} di atas batas aman
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Peringatan Stok Rendah</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold font-mono text-amber-700 tabular-nums">
            {stockAlerts.counts.total}
          </p>
          <p className="text-[11px] text-slate-500">
            {stockAlerts.counts.outOfStock + stockAlerts.counts.critical} kritis ·{' '}
            {stockAlerts.counts.lowWarning} mendekati batas
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Baris Penyesuaian</span>
            <History className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {adjustmentMovements.length}
          </p>
          <p className="text-[11px] text-slate-500">Tercatat pada log audit stok</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Dampak Nilai Kumulatif</span>
            <TrendingDown className="w-4 h-4 text-slate-400" />
          </div>
          <p
            className={`text-xl font-bold font-mono tabular-nums ${
              netAdjustmentValue.lt(0)
                ? 'text-rose-700'
                : netAdjustmentValue.gt(0)
                ? 'text-emerald-700'
                : 'text-slate-900'
            }`}
          >
            {formatRupiah(netAdjustmentValue.toFixed(4))}
          </p>
          <p className="text-[11px] text-slate-500">Akun 1105 Persediaan vs 5101 HPP</p>
        </div>
      </div>

      {/* Paginated Audit Log History DataTable */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Riwayat Penyesuaian Stok (Audit Log)
            </h3>
            <p className="text-xs text-slate-500">
              Setiap penyesuaian fisik tercatat permanen lengkap dengan kode alasan &amp; nilai
              persediaan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari item / catatan..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <select
              aria-label="Filter kode alasan penyesuaian"
              value={reasonFilter}
              onChange={(e) =>
                setReasonFilter(e.target.value as 'ALL' | StockAdjustmentReasonCode)
              }
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            >
              <option value="ALL">Semua Kode Alasan</option>
              {STOCK_ADJUSTMENT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.shortLabel} ({r.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          data={filteredMovements}
          columns={columns}
          getRowKey={(m) => m.id}
          defaultPageSize={10}
          testId="stock-adjustments-history"
          emptyState={
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {adjustmentMovements.length === 0
                  ? 'Belum ada riwayat penyesuaian stok opname.'
                  : 'Tidak ada catatan penyesuaian untuk filter ini.'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Gunakan tombol Bulk Stock Opname untuk mencatat barang pecah/rusak, kehilangan,
                kedaluwarsa, atau selisih lebih secara sekaligus.
              </p>
              {adjustmentMovements.length === 0 && (
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>Mulai Stock Opname Pertama</span>
                </button>
              )}
            </div>
          }
        />
      </section>

      <BulkStockAdjustmentModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={onNotify}
      />
    </div>
  );
}
