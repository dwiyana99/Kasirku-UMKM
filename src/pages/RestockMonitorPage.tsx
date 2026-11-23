import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  PackageSearch,
  ShoppingCart,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LowStockAlertWidget } from '../components/inventory/LowStockAlertWidget';
import { ShoppingNotePanel } from '../components/inventory/ShoppingNotePanel';
import { useApp } from '../context/AppContext';
import { evaluateStockAlerts } from '../lib/inventory/stock-monitoring';
import { tenantHasAddOn } from '../lib/saas/hybrid-pricing';

export function RestockMonitorPage() {
  const { activeWorkspace, navigate } = useApp();
  const [notice, setNotice] = useState<string | null>(null);

  const hasPo = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_PURCHASE_ORDER');
  const evaluation = evaluateStockAlerts(activeWorkspace.products);

  return (
    <AppShell
      title="Monitor Stok & Peringatan Restok"
      subtitle="Pantau barang menipis, catatan belanja kulakan siap cetak, dan tindak lanjut pembelian stok."
      primaryAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/purchasing/restock')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>Kulakan Cepat (Tunai)</span>
          </button>
          {hasPo && (
            <button
              type="button"
              onClick={() => navigate('/purchasing/po')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
            >
              <span>Buat PO Supplier</span>
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6" data-testid="restock-monitor-page">
        {notice && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
              {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-emerald-700 hover:underline font-semibold"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Top Summary Strip — Clean Hairline Surface */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stone-200 border border-stone-200 rounded-xl overflow-hidden">
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Barang Dipantau
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-stone-900">
              {evaluation.totalTrackedCount}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">SKU aktif di gudang</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">
              Stok Habis / Kritis
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-700">
              {evaluation.counts.outOfStock + evaluation.counts.critical}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Perlu segera dibeli</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              Mendekati Minimum
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700">
              {evaluation.counts.lowWarning}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Siapkan rencana belanja</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Stok Aman
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {Math.max(0, evaluation.totalTrackedCount - evaluation.counts.total)}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Di atas batas minimum</p>
          </div>
        </div>

        {evaluation.totalTrackedCount === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3">
            <PackageSearch className="w-8 h-8 mx-auto text-stone-400" strokeWidth={1.75} />
            <h2 className="text-base font-bold text-stone-900">Belum Ada Barang Stok yang Dipantau</h2>
            <p className="text-sm text-stone-500 max-w-md mx-auto">
              Tambahkan barang atau bahan baku di Katalog terlebih dahulu agar peringatan stok menipis dan catatan belanja otomatis aktif.
            </p>
            <button
              type="button"
              onClick={() => navigate('/catalog/products')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <span>Buka Katalog Barang</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <>
            {/* Monitor Stok & Peringatan Restok Widget */}
            <LowStockAlertWidget
              onRestockSuccess={(msg) => setNotice(msg)}
            />

            {/* Daftar Catatan Belanja Kulakan (Siap Cetak) */}
            <ShoppingNotePanel onNotify={(msg) => setNotice(msg)} />
          </>
        )}
      </div>
    </AppShell>
  );
}
