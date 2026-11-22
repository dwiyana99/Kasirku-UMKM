import React, { useMemo, useState } from 'react';
import { ChefHat, Clock, CheckCircle2, Flame, BellRing, QrCode } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModuleGate } from '../components/ModuleGate';
import { useApp } from '../context/AppContext';
import type { KitchenStatus } from '../types/domain';

const STATUS_FLOW: KitchenStatus[] = ['PENDING', 'COOKING', 'READY', 'SERVED'];

const STATUS_META: Record<
  KitchenStatus,
  { label: string; nextAction: string | null; toneClass: string }
> = {
  PENDING: {
    label: 'Menunggu Dapur',
    nextAction: 'Mulai Masak (COOKING)',
    toneClass: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  COOKING: {
    label: 'Sedang Dimasak',
    nextAction: 'Siap Saji (READY)',
    toneClass: 'text-sky-700 bg-sky-50 border-sky-200',
  },
  READY: {
    label: 'Siap Diantar',
    nextAction: 'Tandai Disajikan (SERVED)',
    toneClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  SERVED: {
    label: 'Sudah Disajikan',
    nextAction: null,
    toneClass: 'text-slate-600 bg-slate-100 border-slate-200',
  },
};

export function KitchenPage() {
  const { activeWorkspace, updateKitchenStatus, navigate } = useApp();
  const [filterStatus, setFilterStatus] = useState<'ACTIVE' | 'ALL' | KitchenStatus>('ACTIVE');

  const paidOrders = useMemo(
    () =>
      activeWorkspace.orders.filter((o) => {
        if (o.paymentStatus !== 'PAID') return false;
        if (filterStatus === 'ACTIVE') return o.kitchenStatus !== 'SERVED';
        if (filterStatus === 'ALL') return true;
        return o.kitchenStatus === filterStatus;
      }),
    [activeWorkspace.orders, filterStatus]
  );

  // Group paid tickets by table number
  const groupedByTable = useMemo(() => {
    const groups = new Map<string, typeof paidOrders>();
    for (const order of paidOrders) {
      const key = order.tableNumber ? `Meja ${order.tableNumber}` : 'Takeaway / Kasir';
      const existing = groups.get(key) ?? [];
      groups.set(key, [...existing, order]);
    }
    return Array.from(groups.entries());
  }, [paidOrders]);

  const counts = useMemo(() => {
    const paid = activeWorkspace.orders.filter((o) => o.paymentStatus === 'PAID');
    return {
      PENDING: paid.filter((o) => o.kitchenStatus === 'PENDING').length,
      COOKING: paid.filter((o) => o.kitchenStatus === 'COOKING').length,
      READY: paid.filter((o) => o.kitchenStatus === 'READY').length,
      SERVED: paid.filter((o) => o.kitchenStatus === 'SERVED').length,
    };
  }, [activeWorkspace.orders]);

  const firstTable = activeWorkspace.tables[0];

  return (
    <AppShell
      title="Layar Dapur (Kitchen Display)"
      subtitle="Antrean pesanan lunas real-time dikelompokkan berdasarkan nomor meja"
      primaryAction={
        firstTable ? (
          <button
            type="button"
            onClick={() => navigate(`/order/${activeWorkspace.tenant.slug}/${firstTable.qrToken}`)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4" />
            <span>Simulasi QR Meja {firstTable.tableNumber}</span>
          </button>
        ) : undefined
      }
    >
      <ModuleGate requiredModule="QR_TABLE_KITCHEN" featureTitle="Layar Dapur (Kitchen Display)">
      <div className="space-y-6">
        {/* Status Counter & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ACTIVE', label: `Antrean Aktif (${counts.PENDING + counts.COOKING + counts.READY})` },
                { id: 'PENDING', label: `Pending (${counts.PENDING})` },
                { id: 'COOKING', label: `Cooking (${counts.COOKING})` },
                { id: 'READY', label: `Ready (${counts.READY})` },
                { id: 'SERVED', label: `Served (${counts.SERVED})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  filterStatus === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Hanya pesanan terverifikasi LUNAS (Kasir / QRIS Webhook) yang masuk ke dapur.
          </p>
        </div>

        {/* Grouped Kitchen Tickets */}
        {groupedByTable.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <ChefHat className="w-10 h-10 text-slate-300 mx-auto" />
            <h2 className="text-base font-semibold text-slate-900">
              Tidak ada pesanan pada filter ini
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Buat pesanan dari Kasir POS atau selesaikan pembayaran QR Self-Order agar tiket dapur
              muncul otomatis di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByTable.map(([tableLabel, tickets]) => (
              <section key={tableLabel} className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">{tableLabel}</h2>
                  <span className="text-xs text-slate-500">{tickets.length} tiket pesanan</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tickets.map((order) => {
                    const meta = STATUS_META[order.kitchenStatus];
                    const nextIdx = STATUS_FLOW.indexOf(order.kitchenStatus) + 1;
                    const nextStatus =
                      nextIdx < STATUS_FLOW.length ? STATUS_FLOW[nextIdx] : null;

                    return (
                      <article
                        key={order.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/70">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {order.tableNumber ? `Meja ${order.tableNumber}` : 'Takeaway'} ·{' '}
                                <span className="font-mono text-xs font-medium text-slate-600">
                                  {order.orderNumber}
                                </span>
                              </p>
                              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(order.createdAt).toLocaleTimeString('id-ID')}</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {order.orderSource === 'QR_SELF_ORDER' ? 'QR Self-Order' : 'POS'}
                                </span>
                              </p>
                            </div>
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${meta.toneClass}`}>
                              {order.kitchenStatus}
                            </span>
                          </div>

                          <div className="p-4 space-y-2.5">
                            <p className="text-xs text-slate-500">
                              Pelanggan: <span className="text-slate-900 font-medium">{order.customerName}</span>
                            </p>
                            <ul className="divide-y divide-slate-100">
                              {order.items.map((item) => (
                                <li key={item.id} className="py-2 first:pt-0 last:pb-0">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-mono font-bold text-emerald-700 tabular-nums">
                                      {Number(item.qty)}×
                                    </span>
                                    <span className="text-sm font-medium text-slate-900">
                                      {item.itemNameSnapshot}
                                    </span>
                                  </div>
                                  {item.notes && (
                                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                                      Catatan: {item.notes}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {/* Status Workflow Action Bar */}
                        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 space-y-2">
                          {nextStatus ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateKitchenStatus(
                                  activeWorkspace.tenant.id,
                                  order.id,
                                  nextStatus
                                )
                              }
                              className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                            >
                              {nextStatus === 'COOKING' && <Flame className="w-3.5 h-3.5" />}
                              {nextStatus === 'READY' && <BellRing className="w-3.5 h-3.5" />}
                              {nextStatus === 'SERVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                              <span>{meta.nextAction}</span>
                            </button>
                          ) : (
                            <div className="text-center text-xs font-medium text-slate-500 py-1.5">
                              Selesai Disajikan
                            </div>
                          )}

                          <div className="grid grid-cols-4 gap-1">
                            {STATUS_FLOW.map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  updateKitchenStatus(activeWorkspace.tenant.id, order.id, st)
                                }
                                className={`py-1 text-[10px] font-mono rounded border transition-colors ${
                                  order.kitchenStatus === st
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-500 border-slate-200 hover:text-slate-900'
                                }`}
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      </ModuleGate>
    </AppShell>
  );
}
