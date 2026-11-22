import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  computeStockForecastReport,
  type ForecastUrgency,
} from '../../lib/inventory/stock-forecasting';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { ModalShell } from '../ui/ModalShell';

interface ShoppingNotePanelProps {
  compact?: boolean;
  onNotify?: (msg: string) => void;
}

const URGENCY_BADGE: Record<ForecastUrgency, { label: string; className: string }> = {
  URGENT: { label: 'Hampir Habis', className: 'text-rose-700 font-semibold' },
  SOON: { label: 'Perlu Beli', className: 'text-amber-700 font-semibold' },
  HEALTHY: { label: 'Stok Aman', className: 'text-emerald-700 font-medium' },
};

/**
 * Practical Shopping List Note (Daftar Catatan Belanja Kulakan)
 * Rendered automatically for tenants WITHOUT Purchase Order (PO) add-on (e.g., Paket LITE & BASIC).
 * Zero PO jargon/buttons; gives the owner a printable & copyable shopping note for pasar/grosir.
 */
export function ShoppingNotePanel({ compact = false, onNotify }: ShoppingNotePanelProps) {
  const { activeWorkspace } = useApp();
  const [targetCoverDays, setTargetCoverDays] = useState<number>(14);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});
  const [printOpen, setPrintOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const report = useMemo(
    () =>
      computeStockForecastReport({
        products: activeWorkspace.products,
        orders: activeWorkspace.orders,
        inventoryMovements: activeWorkspace.inventoryMovements,
        config: {
          lookbackDays: 30,
          leadTimeDays: 2,
          targetCoverDays,
        },
      }),
    [
      activeWorkspace.inventoryMovements,
      activeWorkspace.orders,
      activeWorkspace.products,
      targetCoverDays,
    ]
  );

  // Show actionable items first; if all healthy, show lowest-stock items so user can still prep a shopping list
  const noteItems = useMemo(() => {
    const actionable = report.recommendations.filter(
      (r) => r.urgency !== 'HEALTHY' || new Decimal(r.recommendedOrderQty).gt(0)
    );
    const list = actionable.length > 0 ? actionable : report.recommendations;
    return compact ? list.slice(0, 6) : list;
  }, [report.recommendations, compact]);

  const isItemSelected = (id: string, defaultSelected: boolean) =>
    checkedIds[id] !== undefined ? checkedIds[id] : defaultSelected;

  const getBuyQty = (id: string, recommendedQty: string, minAlert: string) => {
    if (qtyOverrides[id] !== undefined) return qtyOverrides[id];
    const rec = Math.ceil(Number(recommendedQty) || 0);
    return String(rec > 0 ? rec : Math.max(5, Math.ceil(Number(minAlert) || 5)));
  };

  const selectedLines = useMemo(() => {
    return noteItems
      .map((item) => {
        const defaultSelected =
          item.urgency !== 'HEALTHY' || new Decimal(item.recommendedOrderQty).gt(0);
        const selected = isItemSelected(item.product.id, defaultSelected);
        const qtyStr = getBuyQty(item.product.id, item.recommendedOrderQty, item.minStockAlert);
        const qtyDec = new Decimal(qtyStr || '0');
        const unitCost = new Decimal(item.product.costPriceAvg || '0');
        const estCost = qtyDec.gt(0) ? qtyDec.times(unitCost) : new Decimal(0);
        return { item, selected, qtyStr, estCost };
      })
      .filter((row) => row.selected && new Decimal(row.qtyStr || '0').gt(0));
  }, [noteItems, checkedIds, qtyOverrides]);

  const totalEstimatedBudget = useMemo(
    () => selectedLines.reduce((acc, r) => acc.plus(r.estCost), new Decimal(0)),
    [selectedLines]
  );

  const flash = (msg: string) => {
    setNotice(msg);
    onNotify?.(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const buildPlainNoteText = () => {
    const today = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const lines = [
      `CATATAN BELANJA KULAKAN`,
      `${activeWorkspace.tenant.name} (${today})`,
      `--------------------------------`,
      ...selectedLines.map(
        (row, idx) =>
          `${idx + 1}. ${row.item.product.name} : ${row.qtyStr} ${row.item.product.unit} (est. ${formatRupiah(row.estCost)})`
      ),
      `--------------------------------`,
      `Estimasi Total Belanja: ${formatRupiah(totalEstimatedBudget)}`,
    ];
    return lines.join('\n');
  };

  const handleCopyNote = async () => {
    const text = buildPlainNoteText();
    try {
      await navigator.clipboard.writeText(text);
      flash('Daftar catatan belanja berhasil disalin. Siap ditempel ke WhatsApp atau catatan HP.');
    } catch {
      flash('Daftar catatan belanja siap dicetak lewat tombol Cetak Daftar.');
    }
  };

  return (
    <section
      data-testid="shopping-note-panel"
      aria-label="Daftar Catatan Belanja Kulakan"
      className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-stone-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-stone-900">
              Daftar Catatan Belanja Kulakan (Siap Cetak)
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Pegangan belanja ke agen atau pasar berdasarkan sisa stok dan barang yang paling sering terjual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Target Stok Hari"
            value={targetCoverDays}
            onChange={(e) => setTargetCoverDays(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg bg-white text-stone-700"
          >
            <option value={7}>Cukup untuk 7 Hari</option>
            <option value={14}>Cukup untuk 14 Hari</option>
            <option value={30}>Cukup untuk 30 Hari</option>
          </select>
          <button
            type="button"
            disabled={selectedLines.length === 0}
            onClick={() => void handleCopyNote()}
            data-testid="shopping-note-copy-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Salin Catatan</span>
          </button>
          <button
            type="button"
            disabled={selectedLines.length === 0}
            onClick={() => setPrintOpen(true)}
            data-testid="shopping-note-print-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Cetak Daftar Belanja ({selectedLines.length})</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs font-medium text-emerald-900 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Simple Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-stone-200 rounded-lg p-3.5">
          <p className="text-[11px] text-stone-500">Barang Perlu Dibeli</p>
          <p className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5">
            {selectedLines.length} barang
          </p>
        </div>
        <div className="border border-stone-200 rounded-lg p-3.5">
          <p className="text-[11px] text-stone-500">Perkiraan Uang Belanja</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {formatRupiah(totalEstimatedBudget)}
          </p>
        </div>
        <div className="border border-stone-200 rounded-lg p-3.5">
          <p className="text-[11px] text-stone-500">Stok Hampir Habis</p>
          <p className="text-lg font-bold font-mono tabular-nums text-rose-700 mt-0.5">
            {report.counts.urgent + report.counts.soon} item
          </p>
        </div>
      </div>

      {/* Checklist Table */}
      {noteItems.length === 0 ? (
        <div className="py-8 text-center text-xs text-stone-500 border border-dashed border-stone-200 rounded-lg">
          Belum ada data barang untuk catatan belanja. Tambahkan barang di menu Daftar Barang terlebih dahulu.
        </div>
      ) : (
        <div className="border border-stone-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">Beli</th>
                <th className="py-2.5 px-3">Nama Barang</th>
                <th className="py-2.5 px-3 text-right">Sisa Stok</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right w-32">Jumlah Beli</th>
                <th className="py-2.5 px-3 text-right">Perkiraan Modal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {noteItems.map((item) => {
                const defaultSelected =
                  item.urgency !== 'HEALTHY' || new Decimal(item.recommendedOrderQty).gt(0);
                const checked = isItemSelected(item.product.id, defaultSelected);
                const qtyStr = getBuyQty(
                  item.product.id,
                  item.recommendedOrderQty,
                  item.minStockAlert
                );
                const estCost = new Decimal(qtyStr || '0').times(
                  new Decimal(item.product.costPriceAvg || '0')
                );

                return (
                  <tr key={item.product.id} className={checked ? 'bg-white' : 'bg-stone-50/50 opacity-65'}>
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${item.product.name}`}
                        checked={checked}
                        onChange={(e) =>
                          setCheckedIds((prev) => ({
                            ...prev,
                            [item.product.id]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 rounded accent-emerald-600"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-stone-900">{item.product.name}</p>
                      <p className="text-[11px] text-stone-500">
                        Harga beli rata-rata {formatRupiah(item.product.costPriceAvg)}/{item.product.unit}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-stone-700">
                      {Number(item.currentStock)} {item.product.unit}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`whitespace-nowrap ${URGENCY_BADGE[item.urgency].className}`}>
                        {URGENCY_BADGE[item.urgency].label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={qtyStr}
                          aria-label={`Jumlah beli ${item.product.name}`}
                          onChange={(e) =>
                            setQtyOverrides((prev) => ({
                              ...prev,
                              [item.product.id]: e.target.value,
                            }))
                          }
                          className="w-16 px-2 py-1 text-right font-mono tabular-nums border border-stone-200 rounded bg-white"
                        />
                        <span className="text-[11px] text-stone-500">{item.product.unit}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-stone-900">
                      {formatRupiah(estCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Printable Shopping Note Modal */}
      <ModalShell
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        headerId="shopping-note-print-header"
        testId="shopping-note-print-modal"
        title="Daftar Catatan Belanja Kulakan"
        subtitle="Siap dicetak sebagai pegangan belanja ke pasar atau agen grosir."
        maxWidthClass="max-w-xl"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleCopyNote()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Teks WA</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Sekarang</span>
            </button>
          </div>
        }
      >
        <div className="p-6 space-y-4">
          <div className="border-b border-stone-200 pb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">
                Catatan Belanja Kulakan
              </p>
              <h3 className="text-base font-bold text-stone-900 mt-0.5">
                {activeWorkspace.tenant.name}
              </h3>
            </div>
            <p className="text-xs text-stone-500 font-mono">
              {new Date().toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>

          <table className="w-full text-left text-xs border-b border-stone-200">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">
              <tr>
                <th className="py-2 px-2 w-8">[ ]</th>
                <th className="py-2 px-2">Nama Barang</th>
                <th className="py-2 px-2 text-right">Beli</th>
                <th className="py-2 px-2 text-right">Est. Modal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {selectedLines.map((row) => (
                <tr key={row.item.product.id}>
                  <td className="py-2 px-2 font-mono text-stone-400">□</td>
                  <td className="py-2 px-2 font-medium text-stone-900">
                    {row.item.product.name}
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums font-semibold">
                    {row.qtyStr} {row.item.product.unit}
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-stone-700">
                    {formatRupiah(row.estCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between text-sm font-bold text-stone-900">
            <span>Perkiraan Total Uang Belanja</span>
            <span className="font-mono tabular-nums text-emerald-700">
              {formatRupiah(totalEstimatedBudget)}
            </span>
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
