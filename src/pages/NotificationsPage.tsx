import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Package,
  Truck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import { evaluateStockAlerts } from '../lib/inventory/stock-monitoring';
import { computeDueReminders } from '../lib/analytics/owner-insights-engine';
import { formatRupiah } from '../lib/pos/checkout-service';

/**
 * Dedicated Notifications Center accessible directly from Left Sidebar & Top Bell.
 * Shows clear, readable low-stock alerts and due reminders strictly matched to active add-ons.
 */
export function NotificationsPage() {
  const { activeWorkspace, navigate } = useApp();

  const stockEvaluation = useMemo(
    () => evaluateStockAlerts(activeWorkspace.products),
    [activeWorkspace.products]
  );

  const dueReminders = useMemo(
    () => computeDueReminders(activeWorkspace),
    [activeWorkspace]
  );

  const totalNotifCount = stockEvaluation.counts.total + dueReminders.length;

  return (
    <AppShell
      title="Notifikasi Usaha"
      subtitle="Pantau peringatan stok barang menipis dan pengingat jatuh tempo secara jelas di satu halaman."
    >
      <div className="space-y-5" data-testid="notifications-page">
        {/* Clean Summary Header */}
        <section className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                totalNotifCount > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              <Bell className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                {totalNotifCount > 0
                  ? `${totalNotifCount} Pemberitahuan Perlu Perhatian`
                  : 'Semua Kondisi Usaha Aman'}
              </h2>
              <p className="text-xs text-stone-500">
                {stockEvaluation.counts.total} peringatan stok · {dueReminders.length} pengingat jatuh tempo
              </p>
            </div>
          </div>

          {stockEvaluation.counts.total > 0 && (
            <button
              type="button"
              onClick={() => navigate('/purchasing/restock')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              <Truck className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Buka Kulakan Cepat</span>
            </button>
          )}
        </section>

        {/* Empty State */}
        {totalNotifCount === 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-2.5">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" strokeWidth={1.75} />
            <h3 className="text-sm font-semibold text-stone-900">Tidak Ada Peringatan Mendesak</h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Seluruh stok barang saat ini berada di atas batas minimum dan tidak ada tagihan jatuh tempo yang tertunda.
            </p>
          </div>
        )}

        {/* Low Stock Alerts List */}
        {stockEvaluation.alerts.length > 0 && (
          <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-stone-50/70 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-700" strokeWidth={1.75} />
                <h3 className="text-xs font-bold text-stone-900">
                  Peringatan Stok Minimum ({stockEvaluation.alerts.length} barang)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/catalog/products')}
                className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
              >
                <span>Lihat Daftar Barang</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="divide-y divide-stone-100">
              {stockEvaluation.alerts.map((item) => {
                const isUrgent =
                  item.severity === 'OUT_OF_STOCK' || item.severity === 'CRITICAL';
                const statusLabel =
                  item.severity === 'OUT_OF_STOCK'
                    ? 'Stok Habis'
                    : item.severity === 'CRITICAL'
                    ? 'Di Bawah Batas Minimum'
                    : 'Mendekati Minimum';

                return (
                  <div
                    key={item.product.id}
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-stone-900">
                          {item.product.name}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            isUrgent
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />
                          <span>{statusLabel}</span>
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 font-mono tabular-nums">
                        Sisa stok: <strong>{Number(item.currentStock)} {item.product.unit}</strong> ·
                        Batas minimum: {Number(item.minStockAlert)} {item.product.unit} ·
                        Saran belanja: +{Number(item.suggestedRestockQty)} {item.product.unit} (est.{' '}
                        {formatRupiah(item.estimatedRestockCost)})
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate('/purchasing/restock')}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap self-start sm:self-center"
                    >
                      <span>Restok Cepat</span>
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Due Reminders Section */}
        {dueReminders.length > 0 && (
          <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-stone-50/70">
              <h3 className="text-xs font-bold text-stone-900">
                Pengingat Jatuh Tempo ({dueReminders.length})
              </h3>
            </div>
            <div className="divide-y divide-stone-100">
              {dueReminders.map((rem) => (
                <div
                  key={rem.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold text-stone-900">{rem.title}</p>
                    <p className="text-xs text-stone-600">{rem.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(rem.route)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg whitespace-nowrap self-start sm:self-center"
                  >
                    <span>{rem.ctaLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
