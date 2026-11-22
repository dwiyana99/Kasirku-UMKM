import React, { useMemo, useState } from 'react';
import {
  Activity,
  History,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';

type ActivityCategory = 'ALL' | 'SALES' | 'STOCK' | 'EXPENSE' | 'SYSTEM';

interface UnifiedActivityRow {
  id: string;
  category: Exclude<ActivityCategory, 'ALL'>;
  categoryLabel: string;
  actorName: string;
  summary: string;
  detail: string;
  createdAt: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActivityLogPage() {
  const { activeWorkspace } = useApp();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory>('ALL');

  const unifiedLogs = useMemo<UnifiedActivityRow[]>(() => {
    const rows: UnifiedActivityRow[] = [];

    // 1. Explicit Activity Logs
    for (const log of activeWorkspace.activityLogs ?? []) {
      const cat: UnifiedActivityRow['category'] =
        log.actionType === 'POS_SALE'
          ? 'SALES'
          : log.actionType === 'RESTOCK_PURCHASE' ||
            log.actionType === 'PURCHASE_ORDER' ||
            log.actionType === 'STOCK_OPNAME' ||
            log.actionType === 'STOCK_TRANSFER'
          ? 'STOCK'
          : log.actionType === 'EXPENSE_RECORD'
          ? 'EXPENSE'
          : 'SYSTEM';

      rows.push({
        id: `act-${log.id}`,
        category: cat,
        categoryLabel:
          cat === 'SALES'
            ? 'Penjualan'
            : cat === 'STOCK'
            ? 'Stok & Belanja'
            : cat === 'EXPENSE'
            ? 'Biaya Usaha'
            : 'Pengaturan & Akun',
        actorName: log.actorName || log.actorEmail,
        summary: log.summary,
        detail: `${log.actorRole} (${log.actorEmail})`,
        createdAt: log.createdAt,
      });
    }

    // 2. Sensitive Audit Logs (if any)
    for (const audit of activeWorkspace.auditLogs ?? []) {
      rows.push({
        id: `aud-${audit.id}`,
        category: 'SYSTEM',
        categoryLabel: 'Audit Sensitif',
        actorName: audit.actorName || audit.actorEmail,
        summary: `${audit.actionType.replace(/_/g, ' ')} (${formatRupiah(audit.amount)})`,
        detail: audit.reason,
        createdAt: audit.createdAt,
      });
    }

    // 3. Recent POS Orders (ensures rich chronological history even before explicit activityLogs accumulate)
    for (const ord of activeWorkspace.orders.slice(-40)) {
      rows.push({
        id: `ord-${ord.id}`,
        category: 'SALES',
        categoryLabel: 'Penjualan',
        actorName: ord.cashierEmail || 'Kasir / Pemilik',
        summary: `Transaksi ${ord.orderNumber} untuk ${ord.customerName} sebesar ${formatRupiah(ord.grandTotal)}`,
        detail: `${ord.items.length} item (${ord.paymentStatus === 'PAID' ? 'Lunas' : ord.paymentStatus})`,
        createdAt: ord.createdAt,
      });
    }

    // 4. Stock Movements (Purchase / Opname / Adjustments)
    const productMap = new Map(activeWorkspace.products.map((p) => [p.id, p]));
    for (const mv of activeWorkspace.inventoryMovements.slice(-40)) {
      if (mv.movementType === 'OUT_SALE' || mv.movementType === 'OUT_RECIPE') continue;
      const prod = productMap.get(mv.productId);
      rows.push({
        id: `mv-${mv.id}`,
        category: 'STOCK',
        categoryLabel: 'Stok & Belanja',
        actorName: mv.actorName || 'Pemilik / Gudang',
        summary: `${mv.movementType === 'IN_PURCHASE' ? 'Kulakan masuk' : 'Penyesuaian stok'} ${
          prod?.name || 'Barang'
        } (${Number(mv.qtyChange) > 0 ? '+' : ''}${Number(mv.qtyChange)} ${prod?.unit || 'unit'})`,
        detail: mv.notes || mv.supplierName || 'Pencatatan stok otomatis',
        createdAt: mv.createdAt,
      });
    }

    // 5. Expenses
    for (const exp of activeWorkspace.expenses.slice(-30)) {
      rows.push({
        id: `exp-${exp.id}`,
        category: 'EXPENSE',
        categoryLabel: 'Biaya Usaha',
        actorName: 'Pemilik / Keuangan',
        summary: `Catat pengeluaran: ${exp.description} (${formatRupiah(exp.amount)})`,
        detail: `Tanggal biaya ${exp.expenseDate}`,
        createdAt: exp.createdAt || exp.expenseDate,
      });
    }

    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activeWorkspace]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unifiedLogs.filter((row) => {
      if (categoryFilter !== 'ALL' && row.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        row.summary.toLowerCase().includes(q) ||
        row.actorName.toLowerCase().includes(q) ||
        row.detail.toLowerCase().includes(q)
      );
    });
  }, [unifiedLogs, search, categoryFilter]);

  const counts = useMemo(() => {
    return {
      total: unifiedLogs.length,
      sales: unifiedLogs.filter((l) => l.category === 'SALES').length,
      stock: unifiedLogs.filter((l) => l.category === 'STOCK').length,
      expense: unifiedLogs.filter((l) => l.category === 'EXPENSE').length,
    };
  }, [unifiedLogs]);

  const renderIcon = (cat: UnifiedActivityRow['category']) => {
    if (cat === 'SALES') return <Receipt className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />;
    if (cat === 'STOCK') return <Package className="w-4 h-4 text-amber-700" strokeWidth={1.75} />;
    if (cat === 'EXPENSE') return <Wallet className="w-4 h-4 text-rose-700" strokeWidth={1.75} />;
    return <ShieldCheck className="w-4 h-4 text-stone-600" strokeWidth={1.75} />;
  };

  return (
    <AppShell
      title="Log Aktivitas User"
      subtitle="Jejak kronologis seluruh aktivitas kasir, perubahan stok, pengeluaran, dan pengaturan usaha."
    >
      <div className="space-y-6" data-testid="activity-log-page">
        {/* Quick Counter Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Aktivitas Tercatat</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {counts.total}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Aktivitas Penjualan</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {counts.sales}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Aktivitas Stok &amp; Kulakan</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {counts.stock}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Pencatatan Biaya</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {counts.expense}
            </p>
          </div>
        </section>

        {/* Filter + Timeline List */}
        <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama staf, no. transaksi, atau jenis aktivitas..."
                data-testid="activity-log-search"
                className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            <div className="inline-flex flex-wrap border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'SALES', label: 'Penjualan' },
                  { id: 'STOCK', label: 'Stok' },
                  { id: 'EXPENSE', label: 'Biaya' },
                  { id: 'SYSTEM', label: 'Akun & Audit' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    categoryFilter === tab.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <History className="w-6 h-6 text-stone-400 mx-auto" strokeWidth={1.75} />
              <p className="text-sm font-medium text-stone-800">
                Belum ada catatan aktivitas untuk filter ini
              </p>
              <p className="text-xs text-stone-500">
                Setiap transaksi kasir, kulakan stok, atau perubahan pengaturan akan tercatat otomatis di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredLogs.slice(0, 80).map((row) => (
                <div
                  key={row.id}
                  className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-stone-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0 mt-0.5">
                      {renderIcon(row.category)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-stone-900">
                        {row.summary}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-stone-500">
                        <span className="font-semibold text-stone-700">{row.actorName}</span>
                        <span>·</span>
                        <span>{row.categoryLabel}</span>
                        <span>·</span>
                        <span className="truncate">{row.detail}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-stone-500">
                      <Activity className="w-3 h-3 text-stone-400" strokeWidth={1.75} />
                      <span>{formatDateTime(row.createdAt)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
