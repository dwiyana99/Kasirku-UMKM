import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  Search,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  getRemainingReturnableQtyMap,
  SALES_RETURN_REASON_LABELS,
  verticalSupportsSalesReturns,
} from '../lib/pos/sales-return-engine';
import type { SalesReturnReason } from '../types/domain';

export function SalesReturnPage() {
  const { activeWorkspace, processSalesReturn, navigate } = useApp();
  const isSupported = verticalSupportsSalesReturns(activeWorkspace.tenant.vertical);

  const paidOrders = useMemo(
    () =>
      activeWorkspace.orders.filter(
        (o) => o.paymentStatus === 'PAID' && o.items.length > 0
      ),
    [activeWorkspace.orders]
  );

  const salesReturns = activeWorkspace.salesReturns ?? [];

  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(paidOrders[0]?.id ?? '');
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [restockFlags, setRestockFlags] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<SalesReturnReason>('SALAH_BARANG_UKURAN');
  const [refundAccountCode, setRefundAccountCode] = useState<'1101' | '1102'>('1101');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return paidOrders;
    return paidOrders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.items.some((i) => i.itemNameSnapshot.toLowerCase().includes(q))
    );
  }, [orderSearch, paidOrders]);

  const selectedOrder = useMemo(
    () => paidOrders.find((o) => o.id === selectedOrderId) ?? filteredOrders[0] ?? null,
    [filteredOrders, paidOrders, selectedOrderId]
  );

  const remainingMap = useMemo(() => {
    if (!selectedOrder) return {};
    const priorForOrder = salesReturns.filter((r) => r.orderId === selectedOrder.id);
    return getRemainingReturnableQtyMap(selectedOrder, priorForOrder);
  }, [salesReturns, selectedOrder]);

  const previewTotals = useMemo(() => {
    if (!selectedOrder) {
      return { subtotal: '0', tax: '0', totalRefund: '0', cogsRestored: '0', activeCount: 0 };
    }
    let sub = new Decimal(0);
    let cogs = new Decimal(0);
    let activeCount = 0;

    for (const item of selectedOrder.items) {
      const q = new Decimal(qtyInputs[item.productId] || '0');
      if (q.gt(0)) {
        activeCount += 1;
        sub = sub.plus(new Decimal(item.unitPrice || '0').times(q));
        const shouldRestock = restockFlags[item.productId] ?? true;
        if (shouldRestock) {
          cogs = cogs.plus(new Decimal(item.unitCogs || '0').times(q));
        }
      }
    }

    const ordSub = new Decimal(selectedOrder.subtotal || '0');
    const ordDisc = new Decimal(selectedOrder.discountAmount || '0');
    const ordTax = new Decimal(selectedOrder.taxAmount || '0');
    const ratio = ordSub.gt(0) ? Decimal.min(new Decimal(1), sub.div(ordSub)) : new Decimal(0);
    const netSub = Decimal.max(new Decimal(0), sub.minus(ordDisc.times(ratio).toDecimalPlaces(0)));
    const taxRev = ordTax.times(ratio).toDecimalPlaces(0);
    return {
      subtotal: netSub.toFixed(4),
      tax: taxRev.toFixed(4),
      totalRefund: netSub.plus(taxRev).toFixed(4),
      cogsRestored: cogs.toFixed(4),
      activeCount,
    };
  }, [qtyInputs, restockFlags, selectedOrder]);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setQtyInputs({});
    setRestockFlags({});
    setFeedback(null);
  };

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    const lines = selectedOrder.items
      .map((item) => ({
        productId: item.productId,
        qtyToReturn: qtyInputs[item.productId] || '0',
        restockToWarehouse: restockFlags[item.productId] ?? true,
      }))
      .filter((l) => Number(l.qtyToReturn) > 0);

    const res = processSalesReturn({
      orderId: selectedOrder.id,
      lines,
      reason,
      notes,
      refundAccountCode,
    });

    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Retur penjualan gagal diproses.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Retur ${res.record?.returnNumber} berhasil diproses. Stok gudang & jurnal akuntansi pembalik sudah otomatis diperbarui.`,
    });
    setQtyInputs({});
    setNotes('');
  };

  const totalReturnedNominal = useMemo(
    () =>
      salesReturns
        .reduce((sum, r) => sum.plus(new Decimal(r.totalRefundAmount || '0')), new Decimal(0))
        .toFixed(4),
    [salesReturns]
  );

  if (!isSupported) {
    return (
      <AppShell
        title="Retur Penjualan"
        subtitle="Modul pengembalian barang fisik tidak digunakan pada kategori usaha jasa/sewa ini."
      >
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3">
          <RotateCcw className="w-8 h-8 mx-auto text-stone-400" strokeWidth={1.75} />
          <h2 className="text-base font-bold text-stone-900">Tidak Relevan untuk Usaha Ini</h2>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Retur Penjualan khusus untuk usaha yang menjual produk fisik/stok gudang. Gunakan Riwayat Transaksi untuk pembatalan nota biasa.
          </p>
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Buka Riwayat Transaksi
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Retur Penjualan"
      subtitle="Proses pengembalian barang pelanggan dengan pemulihan stok gudang & jurnal akuntansi otomatis."
      primaryAction={
        <button
          type="button"
          onClick={() => navigate('/accounting')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
        >
          <BookOpen className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
          <span>Lihat Jurnal Pembalik</span>
        </button>
      }
    >
      <div className="space-y-6" data-testid="sales-return-page">
        {/* KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-stone-200 border border-stone-200 rounded-xl overflow-hidden">
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Total Retur Tercatat
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-stone-900">
              {salesReturns.length}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Nota retur tersinkron ke jurnal</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Total Dana Dikembalikan
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-700">
              {formatRupiah(totalReturnedNominal)}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Pengurangan Kas / Bank otomatis</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Transaksi Lunas Tersedia
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              {paidOrders.length}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">Dapat dipilih untuk retur parsial/penuh</p>
          </div>
        </div>

        {feedback && (
          <div
            data-testid="sales-return-feedback"
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-medium ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" strokeWidth={1.75} />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Pick Order */}
          <div className="lg:col-span-5 rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="p-4 border-b border-stone-200 space-y-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900">1. Pilih Nota Penjualan</h2>
                <p className="text-xs text-stone-500">Cari berdasarkan nomor nota, nama pelanggan, atau produk.</p>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Cari no. nota atau pelanggan..."
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="divide-y divide-stone-100 max-h-[420px] overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  Belum ada transaksi lunas yang cocok.
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isActive = selectedOrder?.id === order.id;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isActive ? 'bg-emerald-50/70' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-stone-900">
                          {order.orderNumber}
                        </span>
                        <span className="font-mono text-xs font-bold tabular-nums text-emerald-700">
                          {formatRupiah(order.grandTotal)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
                        <span className="truncate">{order.customerName}</span>
                        <span className="tabular-nums">{order.createdAt.slice(0, 10)}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Return Form & Impact Preview */}
          <form
            onSubmit={handleSubmitReturn}
            className="lg:col-span-7 rounded-xl border border-stone-200 bg-white overflow-hidden"
          >
            <div className="p-4 border-b border-stone-200 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  2. Rincian Barang Diretur {selectedOrder ? `(${selectedOrder.orderNumber})` : ''}
                </h2>
                <p className="text-xs text-stone-500">
                  Pilih jumlah barang yang kembali serta tentukan apakah layak masuk stok gudang.
                </p>
              </div>
            </div>

            {!selectedOrder ? (
              <div className="p-8 text-center text-xs text-stone-500">
                Pilih nota di sebelah kiri untuk memproses retur.
              </div>
            ) : (
              <div className="p-4 space-y-5">
                <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
                  {selectedOrder.items.map((item) => {
                    const maxLeft = Number(remainingMap[item.productId] ?? '0');
                    const checkedRestock = restockFlags[item.productId] ?? true;
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-stone-900 truncate">
                            {item.itemNameSnapshot}
                          </p>
                          <p className="text-[11px] text-stone-500 font-mono tabular-nums">
                            Harga: {formatRupiah(item.unitPrice)} · Sisa bisa diretur: {maxLeft}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-stone-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checkedRestock}
                              onChange={(e) =>
                                setRestockFlags((prev) => ({
                                  ...prev,
                                  [item.productId]: e.target.checked,
                                }))
                              }
                              className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                            />
                            <span>Masuk stok gudang</span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            <label
                              htmlFor={`ret-qty-${item.productId}`}
                              className="text-[11px] font-medium text-stone-500"
                            >
                              Qty Retur
                            </label>
                            <input
                              id={`ret-qty-${item.productId}`}
                              data-testid={`return-qty-${item.productId}`}
                              type="number"
                              min={0}
                              max={maxLeft}
                              step="any"
                              disabled={maxLeft <= 0}
                              value={qtyInputs[item.productId] ?? ''}
                              onChange={(e) =>
                                setQtyInputs((prev) => ({
                                  ...prev,
                                  [item.productId]: e.target.value,
                                }))
                              }
                              placeholder="0"
                              className="w-20 rounded-lg border border-stone-200 px-2.5 py-1.5 font-mono text-xs tabular-nums text-right text-stone-900 focus:border-emerald-600 focus:outline-none disabled:bg-stone-100"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Alasan Retur
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value as SalesReturnReason)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    >
                      {(Object.keys(SALES_RETURN_REASON_LABELS) as SalesReturnReason[]).map((k) => (
                        <option key={k} value={k}>
                          {SALES_RETURN_REASON_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Sumber Pengembalian Dana
                    </label>
                    <select
                      value={refundAccountCode}
                      onChange={(e) => setRefundAccountCode(e.target.value as '1101' | '1102')}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                    >
                      <option value="1101">1101 - Kas Tunai (Laci Kasir)</option>
                      <option value="1102">1102 - Bank / Transfer / QRIS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: Kemasan penyok, pelanggan minta refund tunai"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                {/* Accounting & Stock Auto-Impact Preview */}
                <div className="rounded-lg border border-stone-200 bg-stone-50 p-3.5 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    Pratinjau Dampak Stok &amp; Jurnal Double-Entry
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-stone-500 block">Koreksi Omzet</span>
                      <span className="font-mono font-bold tabular-nums text-stone-900">
                        {formatRupiah(previewTotals.subtotal)}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Koreksi Pajak</span>
                      <span className="font-mono font-bold tabular-nums text-stone-900">
                        {formatRupiah(previewTotals.tax)}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Total Refund</span>
                      <span className="font-mono font-bold tabular-nums text-rose-700">
                        {formatRupiah(previewTotals.totalRefund)}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">HPP Dipulihkan</span>
                      <span className="font-mono font-bold tabular-nums text-emerald-700">
                        {formatRupiah(previewTotals.cogsRestored)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="submit-sales-return-btn"
                    disabled={previewTotals.activeCount === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Proses Retur &amp; Posting Jurnal Otomatis</span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* History Table */}
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-4 py-3.5 border-b border-stone-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-900">Riwayat Retur Penjualan</h2>
            <span className="text-xs text-stone-500 font-mono tabular-nums">
              {salesReturns.length} transaksi
            </span>
          </div>

          {salesReturns.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Belum ada retur penjualan yang tercatat. Semua retur yang diproses akan langsung tampil di sini beserta referensi jurnalnya.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <th className="px-4 py-2.5">No. Retur / Nota</th>
                    <th className="px-4 py-2.5">Pelanggan &amp; Alasan</th>
                    <th className="px-4 py-2.5">Barang &amp; Gudang</th>
                    <th className="px-4 py-2.5 text-right">Dana Kembali</th>
                    <th className="px-4 py-2.5 text-right">HPP Dipulihkan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {salesReturns.map((ret) => (
                    <tr key={ret.id} data-testid={`return-row-${ret.returnNumber}`}>
                      <td className="px-4 py-3">
                        <p className="font-mono font-bold text-stone-900">{ret.returnNumber}</p>
                        <p className="text-[11px] text-stone-500 font-mono">Ref: {ret.orderNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-stone-900">{ret.customerName}</p>
                        <p className="text-[11px] text-stone-500">
                          {SALES_RETURN_REASON_LABELS[ret.reason]}
                        </p>
                      </td>
                      <td className="px-4 py-3 space-y-0.5">
                        {ret.items.map((it) => (
                          <div key={it.productId} className="flex items-center gap-1.5 text-[11px]">
                            <PackageCheck
                              className={`w-3.5 h-3.5 shrink-0 ${
                                it.restockToWarehouse ? 'text-emerald-600' : 'text-amber-600'
                              }`}
                              strokeWidth={1.75}
                            />
                            <span className="text-stone-800">
                              {it.itemNameSnapshot} × {Number(it.qtyReturned)}
                            </span>
                            <span className="text-stone-400">
                              ({it.restockToWarehouse ? 'Masuk stok' : 'Rusak/Non-stok'})
                            </span>
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-rose-700">
                        {formatRupiah(ret.totalRefundAmount)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-700">
                        {formatRupiah(ret.totalCogsRestored)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
