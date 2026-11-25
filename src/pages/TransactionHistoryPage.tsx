import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  CreditCard,
  Eye,
  MessageCircle,
  Printer,
  Receipt,
  Search,
  Settings,
  Wallet,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModalShell } from '../components/ui/ModalShell';
import { DirectWaCustomerModal } from '../components/whatsapp/DirectWaCustomerModal';
import { FonnteSendModal } from '../components/whatsapp/FonnteSendModal';
import {
  isOwnerWaReminderDismissed,
  OwnerWaReminderModal,
} from '../components/whatsapp/OwnerWaReminderModal';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import { tenantHasAddOn } from '../lib/saas/hybrid-pricing';
import { canAccessRouteWithStaffPermissions } from '../lib/rbac/staff-rbac';
import {
  buildCustomerReceiptWaMessage,
  evaluateWhatsappSendingPolicy,
} from '../lib/messaging/whatsapp-policy';
import type { Order, PaymentMethod } from '../types/domain';

type MethodFilter = 'ALL' | 'CASH' | 'NON_CASH';
type PeriodFilter = 'ALL' | 'TODAY' | '7D' | '30D';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tunai',
  QRIS_DYNAMIC: 'QRIS',
  EWALLET_GOPAY: 'GoPay',
  EWALLET_DANA: 'DANA',
  EWALLET_OVO: 'OVO',
  EWALLET_SHOPEEPAY: 'ShopeePay',
  VIRTUAL_ACCOUNT: 'Virtual Account',
  BANK_TRANSFER: 'Transfer Bank',
};

function formatDateTimeId(iso: string): string {
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

export function TransactionHistoryPage() {
  const { activeWorkspace, navigate, session } = useApp();
  const hasThermalReceipt = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_THERMAL_RECEIPT');
  const hasNonCash = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_NON_CASH_PAYMENT');
  const hasWaFonnte = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_WA_FONNTE');
  const canOpenSettings = canAccessRouteWithStaffPermissions('/settings/custom-fields', session);
  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: activeWorkspace.tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasWaFonnte,
      }),
    [activeWorkspace.tenant.settings?.businessWhatsappNumber, hasWaFonnte]
  );

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [directWaOrder, setDirectWaOrder] = useState<Order | null>(null);
  const [fonnteOrder, setFonnteOrder] = useState<Order | null>(null);
  const [waReminderModalOpen, setWaReminderModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (
      canOpenSettings &&
      waPolicy.needsOwnerWaReminder &&
      !isOwnerWaReminderDismissed(activeWorkspace.tenant.id)
    ) {
      setWaReminderModalOpen(true);
    } else if (!waPolicy.needsOwnerWaReminder) {
      setWaReminderModalOpen(false);
    }
  }, [canOpenSettings, waPolicy.needsOwnerWaReminder, activeWorkspace.tenant.id]);

  const sortedOrders = useMemo(() => {
    return [...activeWorkspace.orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [activeWorkspace.orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    return sortedOrders.filter((ord) => {
      const method = ord.payment?.paymentMethod ?? 'CASH';
      if (methodFilter === 'CASH' && method !== 'CASH') return false;
      if (methodFilter === 'NON_CASH' && method === 'CASH') return false;

      if (periodFilter !== 'ALL') {
        const ts = new Date(ord.createdAt).getTime();
        if (periodFilter === 'TODAY' && ts < startToday.getTime()) return false;
        if (periodFilter === '7D' && now - ts > 7 * 86_400_000) return false;
        if (periodFilter === '30D' && now - ts > 30 * 86_400_000) return false;
      }

      if (!q) return true;
      const inItems = ord.items.some((i) => i.itemNameSnapshot.toLowerCase().includes(q));
      return (
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        (ord.cashierEmail || '').toLowerCase().includes(q) ||
        inItems
      );
    });
  }, [sortedOrders, search, methodFilter, periodFilter]);

  const totals = useMemo(() => {
    let paidCount = 0;
    let totalAmount = new Decimal(0);
    let cashAmount = new Decimal(0);
    let nonCashAmount = new Decimal(0);

    for (const o of filteredOrders) {
      if (o.paymentStatus !== 'PAID') continue;
      paidCount += 1;
      const amt = new Decimal(o.grandTotal || '0');
      totalAmount = totalAmount.plus(amt);
      const method = o.payment?.paymentMethod ?? 'CASH';
      if (method === 'CASH') {
        cashAmount = cashAmount.plus(amt);
      } else {
        nonCashAmount = nonCashAmount.plus(amt);
      }
    }

    return {
      paidCount,
      totalAmount: totalAmount.toFixed(4),
      cashAmount: cashAmount.toFixed(4),
      nonCashAmount: nonCashAmount.toFixed(4),
    };
  }, [filteredOrders]);

  return (
    <AppShell
      title="Riwayat Transaksi"
      subtitle="Daftar lengkap transaksi penjualan yang tercatat, rincian barang dibeli, dan metode pembayarannya."
      primaryAction={
        <button
          type="button"
          onClick={() => {
            const v = activeWorkspace.tenant.vertical;
            if (v === 'KOST_KONTRAKAN') navigate('/kost');
            else if (v === 'PETERNAKAN_PERTANIAN') navigate('/agro');
            else if (
              v === 'RENTAL_KENDARAAN' ||
              v === 'HOMESTAY_VILLA' ||
              v === 'SEWA_GARASI' ||
              v === 'BIMBEL_KURSUS_GYM'
            ) {
              navigate('/operations');
            } else {
              navigate('/pos');
            }
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <Receipt className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>
            {activeWorkspace.tenant.vertical === 'KOST_KONTRAKAN'
              ? 'Kamar & Tagihan Kost'
              : activeWorkspace.tenant.vertical === 'RENTAL_KENDARAAN' ||
                activeWorkspace.tenant.vertical === 'HOMESTAY_VILLA' ||
                activeWorkspace.tenant.vertical === 'SEWA_GARASI' ||
                activeWorkspace.tenant.vertical === 'BIMBEL_KURSUS_GYM'
              ? 'Buka Operasional'
              : 'Transaksi Baru'}
          </span>
        </button>
      }
    >
      <div className="space-y-6" data-testid="transaction-history-page">
        {notice && (
          <div
            role="status"
            className="flex items-center gap-2 px-4 py-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{notice}</span>
          </div>
        )}

        {waPolicy.needsOwnerWaReminder && (
          <section
            data-testid="tx-history-owner-wa-reminder"
            className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 text-xs text-amber-950">
              <MessageCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" strokeWidth={1.75} />
              <div>
                <p className="font-semibold">Nomor WhatsApp Pemilik belum dikonfigurasi</p>
                <p className="text-amber-900/90 mt-0.5 leading-relaxed">
                  Tombol kirim rincian transaksi ke WhatsApp disembunyikan sementara. Lengkapi Nomor
                  WA Pemilik untuk mengaktifkan kirim nota langsung ke pelanggan.
                </p>
              </div>
            </div>
            {canOpenSettings ? (
              <button
                type="button"
                data-testid="tx-history-open-wa-reminder-btn"
                onClick={() => setWaReminderModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Atur WhatsApp</span>
              </button>
            ) : (
              <span className="text-xs font-medium text-amber-900 shrink-0">
                Hubungi Pemilik Usaha untuk mengisi
              </span>
            )}
          </section>
        )}

        {/* Summary KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-xs text-stone-500">Total Penjualan (Filter Aktif)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {formatRupiah(totals.totalAmount)}
            </p>
            <p className="text-xs text-stone-500 mt-1">{totals.paidCount} transaksi lunas</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <Wallet className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>Pembayaran Tunai</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatRupiah(totals.cashAmount)}
            </p>
            <p className="text-xs text-stone-500 mt-1">Masuk langsung ke laci kasir</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <CreditCard className="w-3.5 h-3.5 text-stone-600" strokeWidth={1.75} />
              <span>Pembayaran Non-Tunai</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1">
              {formatRupiah(totals.nonCashAmount)}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {hasNonCash
                ? 'QRIS, e-wallet, VA & transfer bank'
                : 'Riwayat pembayaran non-tunai'}
            </p>
          </div>
        </section>

        {/* Filters + Table */}
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
                placeholder="Cari no. struk, nama pembeli, atau barang..."
                data-testid="tx-history-search"
                className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
                {(
                  [
                    { id: 'ALL', label: 'Semua' },
                    { id: 'TODAY', label: 'Hari Ini' },
                    { id: '7D', label: '7 Hari' },
                    { id: '30D', label: '30 Hari' },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriodFilter(p.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      periodFilter === p.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {hasNonCash && (
                <select
                  aria-label="Filter metode pembayaran"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-700"
                >
                  <option value="ALL">Semua Metode</option>
                  <option value="CASH">Tunai saja</option>
                  <option value="NON_CASH">Non-Tunai saja</option>
                </select>
              )}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <p className="text-sm font-medium text-stone-800">
                Belum ada transaksi yang sesuai filter
              </p>
              <p className="text-xs text-stone-500">
                Ubah kata kunci pencarian atau mulai catat penjualan di layar Kasir (POS).
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-3 px-4">No. Transaksi &amp; Waktu</th>
                    <th className="py-3 px-4">Pembeli &amp; Ringkasan Barang</th>
                    <th className="py-3 px-4">Pembayaran</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredOrders.map((ord) => {
                    const method = ord.payment?.paymentMethod ?? 'CASH';
                    return (
                      <tr
                        key={ord.id}
                        className="hover:bg-stone-50/70 transition-colors"
                        data-testid={`tx-row-${ord.id}`}
                      >
                        <td className="py-3 px-4">
                          <p className="font-mono font-semibold text-stone-900">
                            {ord.orderNumber}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {formatDateTimeId(ord.createdAt)}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-stone-900">{ord.customerName}</p>
                          <p className="text-[11px] text-stone-500 truncate max-w-xs">
                            {ord.items
                              .map((i) => `${i.itemNameSnapshot} (${Number(i.qty)})`)
                              .join(', ')}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-stone-700 font-medium whitespace-nowrap">
                          {METHOD_LABELS[method] || method}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              ord.paymentStatus === 'PAID'
                                ? 'text-emerald-700'
                                : ord.paymentStatus === 'VOID'
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {ord.paymentStatus === 'PAID'
                              ? 'Lunas'
                              : ord.paymentStatus === 'VOID'
                              ? 'Dibatalkan'
                              : 'Menunggu'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-stone-900 whitespace-nowrap">
                          {formatRupiah(ord.grandTotal)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Rincian</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Transaction Detail Modal */}
      <ModalShell
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        closeOnEscape={true}
        headerId="tx-detail-modal-header"
        testId="tx-detail-modal"
        title={selectedOrder ? `Rincian Transaksi ${selectedOrder.orderNumber}` : 'Rincian'}
        subtitle={selectedOrder ? formatDateTimeId(selectedOrder.createdAt) : undefined}
        maxWidthClass="max-w-lg"
        footer={
          selectedOrder ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!waPolicy.canSendCustomerMessage && canOpenSettings ? (
                <button
                  type="button"
                  data-testid="tx-detail-setup-wa-btn"
                  onClick={() => setWaReminderModalOpen(true)}
                  className="text-xs font-medium text-amber-800 hover:text-amber-950 hover:underline"
                >
                  Aktifkan kirim rincian ke WA
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {waPolicy.canSendCustomerMessage && (
                  <button
                    type="button"
                    data-testid="tx-detail-send-wa-btn"
                    onClick={() => {
                      if (waPolicy.channel === 'FONNTE') {
                        setFonnteOrder(selectedOrder);
                      } else {
                        setDirectWaOrder(selectedOrder);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
                  >
                    <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>
                      {waPolicy.channel === 'FONNTE' ? 'Kirim WA (Fonnte)' : 'Kirim WA ke Pelanggan'}
                    </span>
                  </button>
                )}
                {hasThermalReceipt && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Cetak Ulang Struk</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="px-3.5 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg"
                >
                  Tutup
                </button>
              </div>
            </div>
          ) : null
        }
      >
        {selectedOrder && (
          <div className="p-6 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-stone-50 border border-stone-200 rounded-lg p-3">
              <div>
                <p className="text-stone-500">Pelanggan</p>
                <p className="font-semibold text-stone-900">{selectedOrder.customerName}</p>
              </div>
              <div className="text-right">
                <p className="text-stone-500">Metode Pembayaran</p>
                <p className="font-semibold text-stone-900">
                  {METHOD_LABELS[selectedOrder.payment?.paymentMethod ?? 'CASH']}
                </p>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                  <tr>
                    <th className="py-2 px-3">Barang / Layanan</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-stone-900">{item.itemNameSnapshot}</p>
                        <p className="text-[11px] font-mono tabular-nums text-stone-500">
                          @ {formatRupiah(item.unitPrice)}
                        </p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {Number(item.qty)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatRupiah(
                          new Decimal(item.unitPrice || '0').times(new Decimal(item.qty || '0'))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 border-t border-stone-200 pt-3">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatRupiah(selectedOrder.subtotal)}
                </span>
              </div>
              {new Decimal(selectedOrder.discountAmount || '0').gt(0) && (
                <div className="flex justify-between text-rose-700">
                  <span>Diskon</span>
                  <span className="font-mono tabular-nums">
                    -{formatRupiah(selectedOrder.discountAmount)}
                  </span>
                </div>
              )}
              {new Decimal(selectedOrder.taxAmount || '0').gt(0) && (
                <div className="flex justify-between text-stone-600">
                  <span>Pajak</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(selectedOrder.taxAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-stone-900 pt-1.5 border-t border-stone-100">
                <span>Total Dibayar</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatRupiah(selectedOrder.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      <DirectWaCustomerModal
        open={Boolean(directWaOrder)}
        onClose={() => setDirectWaOrder(null)}
        title={
          directWaOrder
            ? `Kirim Rincian Transaksi ${directWaOrder.orderNumber}`
            : 'Kirim Rincian ke Pelanggan'
        }
        subtitle="Rincian transaksi akan dibuka di WhatsApp Anda agar siap dikirim ke pelanggan."
        businessWhatsappNumber={activeWorkspace.tenant.settings?.businessWhatsappNumber}
        defaultCustomerPhone={directWaOrder?.customerPhoneWa ?? ''}
        defaultCustomerName={directWaOrder?.customerName}
        defaultMessage={
          directWaOrder
            ? buildCustomerReceiptWaMessage({
                tenant: activeWorkspace.tenant,
                order: directWaOrder,
              })
            : ''
        }
      />

      <FonnteSendModal
        open={Boolean(fonnteOrder)}
        onClose={() => setFonnteOrder(null)}
        title={fonnteOrder ? `Kirim Struk ${fonnteOrder.orderNumber} via Fonnte` : 'Kirim Struk WA'}
        defaultPhone={fonnteOrder?.customerPhoneWa ?? ''}
        defaultMessage={
          fonnteOrder
            ? buildCustomerReceiptWaMessage({
                tenant: activeWorkspace.tenant,
                order: fonnteOrder,
              })
            : ''
        }
        documentType="RECEIPT"
        referenceNo={fonnteOrder?.orderNumber}
      />

      <OwnerWaReminderModal
        open={waReminderModalOpen}
        onClose={() => setWaReminderModalOpen(false)}
        contextLabel="ringkasan transaksi"
        onSaved={(num) => {
          setNotice(`Nomor WhatsApp Pemilik (${num}) berhasil disimpan. Tombol kirim WhatsApp kini aktif.`);
          window.setTimeout(() => setNotice(null), 5000);
        }}
      />
    </AppShell>
  );
}
