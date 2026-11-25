import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CalendarClock,
  ClipboardCheck,
  Plus,
  Truck,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ModalShell } from '../ui/ModalShell';
import { UnifiedWaActionButton } from '../whatsapp/UnifiedWaActionButton';
import { formatRupiah } from '../../lib/pos/checkout-service';
import {
  addDaysIsoDate,
  computeDueCountdown,
  formatDateIndo,
  formatMonthIndo,
  formatVerticalStatusLabel,
  getTodayIsoDate,
} from '../../lib/date/indonesia-date';
import {
  calculateManufacturingHpp,
  calculateTutorHonorSummary,
} from '../../lib/verticals/vertical-operations-engine';
import {
  buildDueReminderWaMessage,
  buildGenericBookingWaMessage,
  buildLaundryReadyWaMessage,
} from '../../lib/messaging/whatsapp-direct';
import { resolveEffectiveRegionalTax } from '../../lib/tax/regional-tax-indonesia';
import type {
  BakeryPreOrder,
  BeautySpaAppointment,
  BuildingDeliveryOrder,
  LaundryOrder,
  ManufacturingWorkOrder,
  PetServiceOrder,
  TutorHonorSession,
  VehicleWashOrder,
} from '../../types/domain';

function aggregateStaffCommissions(
  items: Array<{ staffName: string; commissionAmount: string }>
): Array<{ staffName: string; jobCount: number; totalCommission: string }> {
  const map = new Map<string, { staffName: string; jobCount: number; total: Decimal }>();
  for (const item of items) {
    const cur = map.get(item.staffName) ?? {
      staffName: item.staffName,
      jobCount: 0,
      total: new Decimal(0),
    };
    cur.jobCount += 1;
    cur.total = cur.total.plus(new Decimal(item.commissionAmount || '0'));
    map.set(item.staffName, cur);
  }
  return Array.from(map.values()).map((r) => ({
    staffName: r.staffName,
    jobCount: r.jobCount,
    totalCommission: r.total.toFixed(4),
  }));
}

export function LaundryOpsModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const tenant = activeWorkspace.tenant;
  const orders = activeWorkspace.verticalOps?.laundryOrders ?? [];

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PROSES' | 'SIAP_AMBIL' | 'SELESAI'>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceType, setServiceType] = useState<LaundryOrder['serviceType']>('KILOAN');
  const [weightKg, setWeightKg] = useState('4');
  const [pricePerUnit, setPricePerUnit] = useState('8000');
  const [parfum, setParfum] = useState('Sakura Fresh');
  const [rackLocation, setRackLocation] = useState('RAK-A3');

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders;
    if (statusFilter === 'PROSES') {
      return orders.filter((o) => o.status !== 'SIAP_AMBIL' && o.status !== 'SELESAI');
    }
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const STATUS_FLOW: LaundryOrder['status'][] = [
    'DITERIMA',
    'DICUCI',
    'SETRIKA',
    'SIAP_AMBIL',
    'SELESAI',
  ];

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;
    const qty = Math.max(0.5, Number(weightKg) || 1);
    const total = new Decimal(qty).times(new Decimal(pricePerUnit || '8000')).toFixed(4);
    const newOrder: LaundryOrder = {
      id: `lnd-${Date.now()}`,
      ticketNumber: `LND-${String(orders.length + 1).padStart(3, '0')}`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || '0812-0000-0000',
      serviceType,
      itemSummary:
        serviceType === 'KILOAN'
          ? `Cuci Komplit Kiloan (${qty.toFixed(1)} Kg)`
          : `${serviceType === 'EXPRESS' ? 'Cuci Express' : 'Cuci Satuan'} (${Math.round(qty)} pcs)`,
      weightKg: serviceType === 'KILOAN' ? qty.toFixed(2) : '0.00',
      pieceCount: serviceType === 'KILOAN' ? Math.max(1, Math.round(qty * 4)) : Math.max(1, Math.round(qty)),
      parfum: parfum.trim() || 'Reguler',
      rackLocation: rackLocation.trim() || 'RAK-A1',
      totalAmount: total,
      paidAmount: '0.0000',
      paymentStatus: 'UNPAID',
      estimatedReadyAt: 'Besok 17:00',
      status: 'DITERIMA',
      createdAt: new Date().toISOString(),
    };
    updateVerticalOps((prev) => ({
      ...prev,
      laundryOrders: [newOrder, ...(prev.laundryOrders ?? [])],
    }));
    setShowAdd(false);
    setCustomerName('');
    setCustomerPhone('');
  };

  const advanceStatus = (order: LaundryOrder) => {
    const idx = STATUS_FLOW.indexOf(order.status);
    const nextStatus = STATUS_FLOW[Math.min(STATUS_FLOW.length - 1, idx + 1)];
    const markPaidNow = nextStatus === 'SELESAI' && order.paymentStatus !== 'PAID';
    const remaining = new Decimal(order.totalAmount || '0').minus(new Decimal(order.paidAmount || '0'));
    updateVerticalOps(
      (prev) => ({
        ...prev,
        laundryOrders: (prev.laundryOrders ?? []).map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: nextStatus,
                paymentStatus: markPaidNow ? 'PAID' : o.paymentStatus,
                paidAmount: markPaidNow ? o.totalAmount : o.paidAmount,
              }
            : o
        ),
      }),
      markPaidNow && remaining.gt(0)
        ? {
            grossAmount: remaining.toFixed(4),
            description: `Pelunasan Laundry ${order.ticketNumber} (${order.customerName})`,
          }
        : undefined
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Antrean Cucian Laundry Kiloan &amp; Satuan
          </h2>
          <p className="text-xs text-stone-600">
            Update tahapan cucian (Diterima, Dicuci, Setrika, Siap Ambil) lalu klik Kirim WA langsung lewat wa.me gratis tanpa Add-On Fonnte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Terima Cucian Baru
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="laundry-status-filter-bar">
        {(
          [
            { id: 'ALL', label: 'Semua', count: orders.length },
            {
              id: 'PROSES',
              label: 'Sedang Proses',
              count: orders.filter((o) => o.status !== 'SIAP_AMBIL' && o.status !== 'SELESAI').length,
            },
            {
              id: 'SIAP_AMBIL',
              label: 'Siap Ambil',
              count: orders.filter((o) => o.status === 'SIAP_AMBIL').length,
            },
            {
              id: 'SELESAI',
              label: 'Selesai',
              count: orders.filter((o) => o.status === 'SELESAI').length,
            },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              statusFilter === f.id
                ? 'bg-stone-900 text-white'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span>{f.label}</span>
            <span className="font-mono text-[10px] opacity-80">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="divide-y divide-stone-100">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500">
              Tidak ada cucian pada filter status ini.
            </div>
          ) : (
            filteredOrders.map((order) => {
            const isPaid = order.paymentStatus === 'PAID';
            const waMessage = buildLaundryReadyWaMessage({
              businessName: tenant.name,
              customerName: order.customerName,
              ticketNumber: order.ticketNumber,
              rackCode: order.rackLocation,
              totalAmount: order.totalAmount,
              isPaid,
            });
            return (
              <div
                key={order.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">
                      {order.ticketNumber}
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {order.serviceType === 'KILOAN'
                        ? 'Kiloan'
                        : order.serviceType === 'EXPRESS'
                        ? 'Express'
                        : 'Satuan'}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        order.status === 'SIAP_AMBIL' || order.status === 'SELESAI'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {formatVerticalStatusLabel(order.status)}
                    </span>
                    <span className="text-xs text-stone-500">
                      Rak: <strong className="font-mono text-stone-800">{order.rackLocation}</strong>
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-stone-900">
                    {order.customerName} ({order.customerPhone})
                  </div>
                  <div className="text-xs text-stone-600">
                    {order.itemSummary} ·{' '}
                    {Number(order.weightKg) > 0 ? `${order.weightKg} Kg` : `${order.pieceCount} pcs`} · Parfum:{' '}
                    {order.parfum || 'Reguler'} · Status Bayar:{' '}
                    <strong className={isPaid ? 'text-emerald-700' : 'text-amber-700'}>
                      {isPaid ? 'Lunas' : order.paymentStatus === 'DP' ? 'DP Masuk' : 'Bayar saat ambil'}
                    </strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-2 text-right font-mono text-sm font-bold tabular-nums text-stone-900">
                    {formatRupiah(order.totalAmount)}
                  </div>
                  {order.status !== 'SELESAI' && (
                    <button
                      type="button"
                      onClick={() => advanceStatus(order)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Lanjut Tahap Berikutnya
                    </button>
                  )}
                  <UnifiedWaActionButton
                    customerPhone={order.customerPhone}
                    customerName={order.customerName}
                    message={waMessage}
                    modalTitle={`Kirim Info Cucian - ${order.ticketNumber}`}
                    documentType="ORDER"
                    referenceNo={order.ticketNumber}
                    label="Kirim WA"
                    variant="emerald"
                    testId={`laundry-wa-link-${order.id}`}
                  />
                </div>
              </div>
            );
          })
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleAddOrder}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-bold text-stone-900">Terima Nota Cucian Baru</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pelanggan</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nomor WhatsApp Pelanggan</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0812-xxxx-xxxx"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Jenis Layanan</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as LaundryOrder['serviceType'])}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="KILOAN">Cuci Kiloan</option>
                  <option value="SATUAN">Cuci Satuan</option>
                  <option value="EXPRESS">Express Kilat</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  {serviceType === 'KILOAN' ? 'Berat (Kg)' : 'Jumlah Item'}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Tarif per Kg/Item (Rp)</label>
                <input
                  type="number"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Kode Rak</label>
                <input
                  type="text"
                  value={rackLocation}
                  onChange={(e) => setRackLocation(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Pilihan Parfum</label>
                <input
                  type="text"
                  value={parfum}
                  onChange={(e) => setParfum(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan Nota
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function BimbelKursusGymModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const tenant = activeWorkspace.tenant;
  const ops = activeWorkspace.verticalOps ?? {};
  const members = ops.academyMembers ?? [];
  const invoices = ops.academyInvoices ?? [];
  const attendances = ops.academyAttendances ?? [];
  const tutorSessions = ops.tutorSessions ?? [];

  const [tab, setTab] = useState<'BILLING' | 'ATTENDANCE' | 'HONOR'>('BILLING');
  const [billingFilter, setBillingFilter] = useState<'ALL' | 'OVERDUE' | 'UNPAID' | 'PAID'>('ALL');
  const [tutorName, setTutorName] = useState('Kak Nadia (Tutor Matematika)');
  const [classLabel, setClassLabel] = useState('Kelas Intensif SMA');
  const [ratePerSession, setRatePerSession] = useState('125000');

  const honorSummary = useMemo(() => calculateTutorHonorSummary(tutorSessions), [tutorSessions]);

  const billingCounts = useMemo(() => {
    let overdue = 0;
    let unpaid = 0;
    let paid = 0;
    for (const inv of invoices) {
      if (inv.status === 'PAID') {
        paid++;
      } else {
        const cd = computeDueCountdown(inv.dueDate);
        if (inv.status === 'OVERDUE' || cd.status === 'OVERDUE') overdue++;
        else unpaid++;
      }
    }
    return { all: invoices.length, overdue, unpaid, paid };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    if (billingFilter === 'ALL') return invoices;
    return invoices.filter((inv) => {
      if (billingFilter === 'PAID') return inv.status === 'PAID';
      if (inv.status === 'PAID') return false;
      const isOverdue =
        inv.status === 'OVERDUE' || computeDueCountdown(inv.dueDate).status === 'OVERDUE';
      return billingFilter === 'OVERDUE' ? isOverdue : !isOverdue;
    });
  }, [invoices, billingFilter]);

  const handlePayBilling = (billId: string, memberName: string, amount: string) => {
    updateVerticalOps(
      (prev) => ({
        ...prev,
        academyInvoices: (prev.academyInvoices ?? []).map((b) =>
          b.id === billId ? { ...b, status: 'PAID', paidAt: new Date().toISOString() } : b
        ),
      }),
      {
        grossAmount: amount,
        description: `Pembayaran SPP / Membership (${memberName})`,
      }
    );
  };

  const handleMarkAttendance = (
    memberId: string,
    memberName: string,
    status: 'HADIR' | 'IZIN' | 'ALPHA'
  ) => {
    const today = new Date().toISOString().slice(0, 10);
    updateVerticalOps((prev) => ({
      ...prev,
      academyAttendances: [
        {
          id: `att-${Date.now()}`,
          memberId,
          memberName,
          programName: members.find((m) => m.id === memberId)?.programName ?? 'Kelas Utama',
          sessionDate: today,
          status,
          tutorName: tutorName.trim() || 'Instruktur Utama',
        },
        ...(prev.academyAttendances ?? []),
      ],
    }));
  };

  const handleAddTutorSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorName.trim()) return;
    const rate = new Decimal(ratePerSession || '100000');
    const newSession: TutorHonorSession = {
      id: `ths-${Date.now()}`,
      tutorName: tutorName.trim(),
      subjectOrClass: classLabel.trim() || 'Kelas Reguler',
      sessionDate: new Date().toISOString().slice(0, 10),
      sessionCount: 1,
      ratePerSession: rate.toFixed(4),
      totalHonor: rate.toFixed(4),
      status: 'UNPAID',
    };
    updateVerticalOps((prev) => ({
      ...prev,
      tutorSessions: [newSession, ...(prev.tutorSessions ?? [])],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'BILLING' as const, label: `Tagihan SPP / Member (${invoices.length})` },
          { id: 'ATTENDANCE' as const, label: `Absensi Kehadiran (${members.length} Peserta)` },
          { id: 'HONOR' as const, label: `Honor Tutor / Instruktur (${honorSummary.byTutor.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === t.id
                ? 'bg-emerald-600 text-white'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'BILLING' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5" data-testid="bimbel-billing-filter-bar">
            {(
              [
                { id: 'ALL', label: 'Semua', count: billingCounts.all },
                { id: 'OVERDUE', label: 'Telat Bayar', count: billingCounts.overdue },
                { id: 'UNPAID', label: 'Belum Jatuh Tempo', count: billingCounts.unpaid },
                { id: 'PAID', label: 'Lunas', count: billingCounts.paid },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBillingFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  billingFilter === f.id
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>{f.label}</span>
                <span className="font-mono text-[10px] opacity-80">{f.count}</span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="divide-y divide-stone-100">
              {filteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-500">
                  Tidak ada tagihan SPP pada filter status ini.
                </div>
              ) : (
                filteredInvoices.map((b) => {
              const dueReadable = formatDateIndo(b.dueDate);
              const dueCountdown = b.status !== 'PAID' ? computeDueCountdown(b.dueDate) : null;
              const periodReadable = formatMonthIndo(b.periodLabel);
              const waMessage = buildDueReminderWaMessage({
                businessName: tenant.name,
                customerName: b.memberName,
                itemLabel: `${b.programName} (${periodReadable})`,
                dueDate: dueReadable,
                amountDue: b.amount,
              });
              return (
                <div
                  key={b.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-stone-900">{b.memberName}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          b.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700'
                            : b.status === 'OVERDUE'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {b.status === 'PAID'
                          ? 'Lunas'
                          : b.status === 'OVERDUE'
                          ? 'Telat Bayar'
                          : 'Belum Jatuh Tempo'}
                      </span>
                      {dueCountdown && dueCountdown.status !== 'UNKNOWN' && (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                            dueCountdown.tone === 'rose'
                              ? 'bg-rose-50 text-rose-700'
                              : dueCountdown.tone === 'amber'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          <CalendarClock className="h-3 w-3" strokeWidth={1.75} />
                          {dueCountdown.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-600">
                      {b.programName} · Periode {periodReadable} · Jatuh tempo:{' '}
                      <strong className="text-stone-900">{dueReadable}</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold tabular-nums text-stone-900">
                      {formatRupiah(b.amount)}
                    </span>
                    {b.status !== 'PAID' && (
                      <button
                        type="button"
                        onClick={() => handlePayBilling(b.id, b.memberName, b.amount)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Tandai Lunas
                      </button>
                    )}
                    {b.status !== 'PAID' && (
                      <UnifiedWaActionButton
                        customerPhone={b.phone}
                        customerName={b.memberName}
                        message={waMessage}
                        modalTitle={`Ingatkan Tagihan SPP - ${b.memberName}`}
                        documentType="INVOICE"
                        referenceNo={b.id}
                        label="Ingatkan WA"
                        variant="emerald"
                      />
                    )}
                  </div>
                </div>
              );
            })
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'ATTENDANCE' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-700">
              Catat Absensi Hari Ini ({formatDateIndo(getTodayIsoDate())})
            </div>
            <div className="divide-y divide-stone-100">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-sm font-bold text-stone-900">{m.fullName}</div>
                    <div className="text-xs text-stone-500">
                      {m.programName} · {m.memberCode}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {(['HADIR', 'IZIN', 'ALPHA'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleMarkAttendance(m.id, m.fullName, st)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          st === 'HADIR'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : st === 'IZIN'
                            ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
                      >
                        {st === 'HADIR' ? 'Hadir' : st === 'IZIN' ? 'Izin' : 'Alpha'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {attendances.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs font-bold text-stone-700">Riwayat Absensi Terbaru</div>
              <div className="mt-2 space-y-1.5 text-xs">
                {attendances.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex justify-between text-stone-700">
                    <span>
                      {formatDateIndo(a.sessionDate)} · <strong>{a.memberName}</strong> ({a.programName})
                    </span>
                    <span className="font-semibold text-emerald-700">
                      {formatVerticalStatusLabel(a.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'HONOR' && (
        <div className="space-y-4">
          <form
            onSubmit={handleAddTutorSession}
            className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-4"
          >
            <input
              type="text"
              value={tutorName}
              onChange={(e) => setTutorName(e.target.value)}
              placeholder="Nama Tutor / Instruktur"
              className="rounded-lg border border-stone-200 px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
              placeholder="Nama Kelas / Sesi"
              className="rounded-lg border border-stone-200 px-3 py-2 text-xs"
            />
            <input
              type="number"
              value={ratePerSession}
              onChange={(e) => setRatePerSession(e.target.value)}
              placeholder="Honor / Sesi (Rp)"
              className="rounded-lg border border-stone-200 px-3 py-2 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              + Catat Sesi Mengajar
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2">
            {honorSummary.byTutor.map((h) => {
              const totalHonor = new Decimal(h.unpaidHonor).plus(new Decimal(h.paidHonor)).toFixed(4);
              return (
                <div key={h.tutorName} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-stone-900">
                    <Users className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
                    {h.tutorName}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-stone-500">Total Sesi</div>
                      <div className="font-mono font-bold tabular-nums">{h.sessionCount}</div>
                    </div>
                    <div>
                      <div className="text-stone-500">Total Honor</div>
                      <div className="font-mono font-bold tabular-nums text-stone-900">
                        {formatRupiah(totalHonor)}
                      </div>
                    </div>
                    <div>
                      <div className="text-stone-500">Belum Dibayar</div>
                      <div className="font-mono font-bold tabular-nums text-amber-700">
                        {formatRupiah(h.unpaidHonor)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ManufakturKecilModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const orders = activeWorkspace.verticalOps?.manufacturingOrders ?? [];
  const [spkFilter, setSpkFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [productName, setProductName] = useState('');
  const [customerOrBatch, setCustomerOrBatch] = useState('Batch Produksi Reguler');
  const [qty, setQty] = useState('20');
  const [materialCost, setMaterialCost] = useState('1200000');
  const [laborCost, setLaborCost] = useState('600000');
  const [overheadCost, setOverheadCost] = useState('200000');

  const filteredSpk = useMemo(() => {
    if (spkFilter === 'ALL') return orders;
    if (spkFilter === 'COMPLETED') return orders.filter((o) => o.status === 'COMPLETED');
    return orders.filter((o) => o.status !== 'COMPLETED');
  }, [orders, spkFilter]);

  const liveHpp = useMemo(
    () =>
      calculateManufacturingHpp({
        targetQty: Math.max(1, Number(qty) || 1),
        rawMaterials: [{ name: 'Bahan Baku', qty: 1, unit: 'paket', unitCost: materialCost || '0' }],
        laborCost: laborCost || '0',
        overheadCost: overheadCost || '0',
      }),
    [laborCost, materialCost, overheadCost, qty]
  );

  const handleAddSpk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) return;
    const newSpk: ManufacturingWorkOrder = {
      id: `spk-${Date.now()}`,
      code: `SPK-${String(orders.length + 1).padStart(3, '0')}`,
      productName: productName.trim(),
      customerOrBatch: customerOrBatch.trim() || 'Stok Toko',
      targetQty: Math.max(1, Number(qty) || 1),
      unit: 'pcs',
      rawMaterialsUsed: [
        {
          name: 'Total Bahan Baku (Kain / Kayu / Aksesoris)',
          qty: 1,
          unit: 'batch',
          unitCost: new Decimal(materialCost || '0').toFixed(4),
        },
      ],
      laborCost: new Decimal(laborCost || '0').toFixed(4),
      overheadCost: new Decimal(overheadCost || '0').toFixed(4),
      totalHpp: liveHpp.totalHpp,
      hppPerUnit: liveHpp.hppPerUnit,
      sellingPricePerUnit: liveHpp.recommendedSellingPrice35Pct,
      status: 'CUTTING_PROCESS',
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    updateVerticalOps((prev) => ({
      ...prev,
      manufacturingOrders: [newSpk, ...(prev.manufacturingOrders ?? [])],
    }));
    setShowAdd(false);
    setProductName('');
  };

  const advanceSpk = (spk: ManufacturingWorkOrder) => {
    const order: ManufacturingWorkOrder['status'][] = [
      'PLANNING',
      'CUTTING_PROCESS',
      'FINISHING_QC',
      'COMPLETED',
    ];
    const next = order[Math.min(order.length - 1, order.indexOf(spk.status) + 1)];
    updateVerticalOps((prev) => ({
      ...prev,
      manufacturingOrders: (prev.manufacturingOrders ?? []).map((w) =>
        w.id === spk.id ? { ...w, status: next } : w
      ),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            SPK Produksi Konveksi, Butik Jahit &amp; Mebel
          </h2>
          <p className="text-xs text-stone-600">
            Olah bahan mentah (kain, kayu, benang) menjadi barang jadi lengkap dengan perhitungan HPP otomatis per unit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Buat SPK Produksi
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="spk-status-filter-bar">
        {(
          [
            { id: 'ALL', label: 'Semua SPK', count: orders.length },
            {
              id: 'ACTIVE',
              label: 'Sedang Berjalan',
              count: orders.filter((o) => o.status !== 'COMPLETED').length,
            },
            {
              id: 'COMPLETED',
              label: 'Selesai Produksi',
              count: orders.filter((o) => o.status === 'COMPLETED').length,
            },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSpkFilter(f.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              spkFilter === f.id
                ? 'bg-stone-900 text-white'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span>{f.label}</span>
            <span className="font-mono text-[10px] opacity-80">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredSpk.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-500">
            Tidak ada SPK produksi pada filter ini.
          </div>
        ) : (
          filteredSpk.map((spk) => (
          <div key={spk.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-stone-900">{spk.code}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                      spk.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {spk.status === 'COMPLETED'
                      ? 'Selesai Produksi'
                      : formatVerticalStatusLabel(spk.status)}
                  </span>
                  <span className="text-xs text-stone-600">
                    Target selesai: <strong>{formatDateIndo(spk.dueDate)}</strong>
                  </span>
                </div>
                <div className="mt-1 text-sm font-bold text-stone-900">
                  {spk.productName} ({spk.targetQty} {spk.unit})
                </div>
                <div className="mt-0.5 text-xs text-stone-500">{spk.customerOrBatch}</div>
                <div className="mt-1 text-xs text-stone-600">
                  Total Biaya Produksi:{' '}
                  <strong className="font-mono tabular-nums">
                    {formatRupiah(spk.totalHpp)}
                  </strong>{' '}
                  · HPP Otomatis / {spk.unit}:{' '}
                  <strong className="font-mono tabular-nums text-emerald-700">
                    {formatRupiah(spk.hppPerUnit)}
                  </strong>
                </div>
              </div>
              {spk.status !== 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => advanceSpk(spk)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Lanjut Tahap Produksi
                </button>
              )}
            </div>
          </div>
        ))
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleAddSpk}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-bold text-stone-900">Buat SPK Produksi Baru</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Produk Jadi</label>
                <input
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Contoh: Kemeja Linen Custom / Meja Jati"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Pemesan / Batch</label>
                <input
                  type="text"
                  value={customerOrBatch}
                  onChange={(e) => setCustomerOrBatch(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Target Jumlah (pcs)</label>
                  <input
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Biaya Bahan Baku (Rp)</label>
                  <input
                    type="number"
                    value={materialCost}
                    onChange={(e) => setMaterialCost(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Upah Jahit/Tukang (Rp)</label>
                  <input
                    type="number"
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Overhead Listrik/Benang (Rp)</label>
                  <input
                    type="number"
                    value={overheadCost}
                    onChange={(e) => setOverheadCost(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-emerald-800">Total Modal Produksi</span>
                  <strong className="font-mono tabular-nums text-emerald-900">
                    {formatRupiah(liveHpp.totalHpp)}
                  </strong>
                </div>
                <div className="mt-1 flex justify-between font-bold text-emerald-900">
                  <span>Estimasi HPP per Unit</span>
                  <span className="font-mono tabular-nums">{formatRupiah(liveHpp.hppPerUnit)}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan SPK
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function GeneralVerticalOpsModule() {
  const { activeWorkspace, updateVerticalOps, regionalTaxRegistry } = useApp();
  const tenant = activeWorkspace.tenant;
  const vertical = tenant.vertical;
  const ops = activeWorkspace.verticalOps ?? {};
  const [listFilter, setListFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');
  const regionalTaxInfo = resolveEffectiveRegionalTax(
    vertical,
    tenant.settings.regionalTax,
    regionalTaxRegistry
  );

  // Shared quick-add modal state for all 5 general operational verticals
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [fName, setFName] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fPrimary, setFPrimary] = useState('');
  const [fSecondary, setFSecondary] = useState('');
  const [fDate, setFDate] = useState(addDaysIsoDate(getTodayIsoDate(), 1));
  const [fTime, setFTime] = useState('10:00');
  const [fAmount, setFAmount] = useState('50000');
  const [fDp, setFDp] = useState('0');
  const [fStaff, setFStaff] = useState('');

  const resetQuickForm = (defaultAmount = '50000') => {
    setFName('');
    setFPhone('');
    setFPrimary('');
    setFSecondary('');
    setFDate(addDaysIsoDate(getTodayIsoDate(), 1));
    setFTime('10:00');
    setFAmount(defaultAmount);
    setFDp('0');
    setFStaff('');
  };

  // CUCI_KENDARAAN
  if (vertical === 'CUCI_KENDARAAN') {
    const orders = ops.vehicleWashOrders ?? [];
    const commissionSummary = aggregateStaffCommissions(
      orders.map((o) => ({ staffName: o.washerName, commissionAmount: o.washerCommissionAmount }))
    );

    const advanceWash = (o: VehicleWashOrder) => {
      const flow: VehicleWashOrder['status'][] = ['ANTRI', 'DICUCI', 'FINISHING', 'SELESAI'];
      const next = flow[Math.min(flow.length - 1, flow.indexOf(o.status) + 1)];
      updateVerticalOps(
        (prev) => ({
          ...prev,
          vehicleWashOrders: (prev.vehicleWashOrders ?? []).map((x) =>
            x.id === o.id
              ? { ...x, status: next, paymentStatus: next === 'SELESAI' ? 'PAID' : x.paymentStatus }
              : x
          ),
        }),
        next === 'SELESAI'
          ? { grossAmount: o.price, description: `Cuci ${o.plateNumber} (${o.serviceName})` }
          : undefined
      );
    };

    const handleAddWash = (e: React.FormEvent) => {
      e.preventDefault();
      if (!fPrimary.trim() || !fName.trim()) return;
      const priceDec = new Decimal(fAmount || '50000');
      const newOrder: VehicleWashOrder = {
        id: `wsh-${Date.now()}`,
        queueNumber: `CW-${String(orders.length + 1).padStart(3, '0')}`,
        plateNumber: fPrimary.trim().toUpperCase(),
        vehicleType: fSecondary === 'MOTOR' ? 'MOTOR' : 'MOBIL_KECIL',
        customerName: fName.trim(),
        customerPhone: fPhone.trim() || '0812-0000-0000',
        serviceName: fSecondary === 'MOTOR' ? 'Cuci Motor Salju' : 'Cuci Mobil Komplit + Vakum',
        washerName: fStaff.trim() || 'Petugas Utama',
        washerCommissionRate: '0.20',
        washerCommissionAmount: priceDec.times('0.2').toFixed(4),
        price: priceDec.toFixed(4),
        status: 'ANTRI',
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString(),
      };
      updateVerticalOps((prev) => ({
        ...prev,
        vehicleWashOrders: [newOrder, ...(prev.vehicleWashOrders ?? [])],
      }));
      setShowQuickAdd(false);
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Antrean Cuci Mobil &amp; Motor</h2>
            <p className="text-xs text-stone-600">
              Catat kendaraan masuk, pantau komisi petugas cuci, dan kirim kabar WA saat kendaraan selesai.
            </p>
          </div>
          <button
            type="button"
            data-testid="ops-add-wash-btn"
            onClick={() => {
              resetQuickForm('55000');
              setFSecondary('MOBIL_KECIL');
              setShowQuickAdd(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span>Catat Antrean Cuci</span>
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commissionSummary.map((c) => (
            <div key={c.staffName} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">Komisi Petugas Cuci</div>
              <div className="mt-0.5 text-sm font-bold text-stone-900">{c.staffName}</div>
              <div className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-700">
                {formatRupiah(c.totalCommission)} ({c.jobCount} kendaraan)
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Semua', count: orders.length },
              { id: 'ACTIVE', label: 'Sedang Antre / Proses', count: orders.filter((o) => o.status !== 'SELESAI').length },
              { id: 'DONE', label: 'Selesai', count: orders.filter((o) => o.status === 'SELESAI').length },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setListFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                listFilter === f.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{f.label}</span>
              <span className="font-mono text-[10px] opacity-80">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {orders
            .filter((o) =>
              listFilter === 'ALL' ? true : listFilter === 'DONE' ? o.status === 'SELESAI' : o.status !== 'SELESAI'
            )
            .map((o) => {
            const waMessage = buildGenericBookingWaMessage({
              businessName: tenant.name,
              customerName: o.customerName,
              bookingRef: o.plateNumber,
              summaryLine: `Kendaraan ${o.plateNumber} (${o.serviceName}) sudah bersih dan siap diambil.`,
              totalAmount: o.price,
            });
            return (
              <div key={o.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-stone-900">{o.plateNumber}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {formatVerticalStatusLabel(o.vehicleType)}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {formatVerticalStatusLabel(o.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600">
                    {o.customerName} · {o.serviceName} · Petugas: <strong>{o.washerName}</strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold tabular-nums">{formatRupiah(o.price)}</span>
                  {o.status !== 'SELESAI' && (
                    <button
                      type="button"
                      onClick={() => advanceWash(o)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Lanjut Status
                    </button>
                  )}
                  <UnifiedWaActionButton
                    customerPhone={o.customerPhone}
                    customerName={o.customerName}
                    message={waMessage}
                    modalTitle={`Kirim Info Selesai - ${o.plateNumber}`}
                    documentType="ORDER"
                    referenceNo={o.plateNumber}
                    label="WA Selesai"
                    variant="emerald"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <ModalShell
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          headerId="ops-modal-wash-title"
          title="Catat Antrean Cuci Kendaraan"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleAddWash} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Plat Nomor</label>
                <input
                  type="text"
                  required
                  value={fPrimary}
                  onChange={(e) => setFPrimary(e.target.value)}
                  placeholder="B 1234 XYZ"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Jenis</label>
                <select
                  value={fSecondary}
                  onChange={(e) => setFSecondary(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="MOBIL_REGULER">Mobil</option>
                  <option value="MOTOR">Motor</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pelanggan</label>
                <input
                  type="text"
                  required
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
                <input
                  type="text"
                  value={fPhone}
                  onChange={(e) => setFPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Petugas Cuci</label>
                <input
                  type="text"
                  value={fStaff}
                  onChange={(e) => setFStaff(e.target.value)}
                  placeholder="Nama petugas"
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Tarif Cuci (Rp)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={fAmount}
                  onChange={(e) => setFAmount(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700">
                Batal
              </button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                Simpan Antrean
              </button>
            </div>
          </form>
        </ModalShell>
      </div>
    );
  }

  // BAKERY_CATERING
  if (vertical === 'BAKERY_CATERING') {
    const orders = ops.bakeryPreOrders ?? [];
    const advanceBakery = (o: BakeryPreOrder) => {
      const flow: BakeryPreOrder['status'][] = ['PO_MASUK', 'PRODUKSI', 'SIAP_KIRIM', 'SELESAI'];
      const next = flow[Math.min(flow.length - 1, flow.indexOf(o.status) + 1)];
      const remaining = o.remainingAmount;
      updateVerticalOps(
        (prev) => ({
          ...prev,
          bakeryPreOrders: (prev.bakeryPreOrders ?? []).map((x) =>
            x.id === o.id
              ? {
                  ...x,
                  status: next,
                  remainingAmount: next === 'SELESAI' ? '0.0000' : x.remainingAmount,
                }
              : x
          ),
        }),
        next === 'SELESAI' && Number(remaining) > 0
          ? { grossAmount: remaining, description: `Pelunasan Pre-Order ${o.poCode} (${o.customerName})` }
          : undefined
      );
    };

    const handleAddBakeryPo = (e: React.FormEvent) => {
      e.preventDefault();
      if (!fName.trim() || !fPrimary.trim()) return;
      const total = new Decimal(fAmount || '0');
      const dp = Decimal.min(total, new Decimal(fDp || '0'));
      const rem = Decimal.max(0, total.minus(dp));
      const newPo: BakeryPreOrder = {
        id: `bpo-${Date.now()}`,
        poCode: `PO-${String(orders.length + 1).padStart(3, '0')}`,
        customerName: fName.trim(),
        customerPhone: fPhone.trim() || '0812-0000-0000',
        orderCategory: 'CATERING_BOX',
        itemDescription: fPrimary.trim(),
        qty: Math.max(1, Number(fSecondary) || 1),
        unit: 'box',
        deliveryDate: fDate,
        deliveryTime: fTime,
        totalAmount: total.toFixed(4),
        dpAmount: dp.toFixed(4),
        remainingAmount: rem.toFixed(4),
        status: 'PO_MASUK',
        createdAt: new Date().toISOString(),
      };
      updateVerticalOps(
        (prev) => ({
          ...prev,
          bakeryPreOrders: [newPo, ...(prev.bakeryPreOrders ?? [])],
        }),
        dp.gt(0)
          ? { grossAmount: dp.toFixed(4), description: `DP Pre-Order ${newPo.poCode} (${newPo.customerName})` }
          : undefined
      );
      setShowQuickAdd(false);
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Jadwal Pre-Order Kue, Hampers &amp; Catering</h2>
            <p className="text-xs text-stone-600">
              Catat pesanan PO, pantau DP dan sisa pelunasan, serta jadwal kirim agar produksi dapur tepat waktu.
            </p>
          </div>
          <button
            type="button"
            data-testid="ops-add-bakery-btn"
            onClick={() => {
              resetQuickForm('450000');
              setFSecondary('20');
              setFDp('200000');
              setShowQuickAdd(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span>Catat Pre-Order Baru</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Semua PO', count: orders.length },
              { id: 'ACTIVE', label: 'Aktif / Belum Selesai', count: orders.filter((o) => o.status !== 'SELESAI').length },
              { id: 'DONE', label: 'Selesai', count: orders.filter((o) => o.status === 'SELESAI').length },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setListFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                listFilter === f.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{f.label}</span>
              <span className="font-mono text-[10px] opacity-80">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {orders
            .filter((o) =>
              listFilter === 'ALL' ? true : listFilter === 'DONE' ? o.status === 'SELESAI' : o.status !== 'SELESAI'
            )
            .map((o) => {
            const deliveryReadable = formatDateIndo(o.deliveryDate);
            const countdown = o.status !== 'SELESAI' ? computeDueCountdown(o.deliveryDate) : null;
            const waMessage = buildGenericBookingWaMessage({
              businessName: tenant.name,
              customerName: o.customerName,
              bookingRef: o.poCode,
              summaryLine: `${o.itemDescription} (${o.qty} ${o.unit}) · Jadwal kirim ${deliveryReadable} jam ${o.deliveryTime}.`,
              totalAmount: o.totalAmount,
            });
            return (
              <div key={o.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">{o.poCode}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {formatVerticalStatusLabel(o.orderCategory)}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {formatVerticalStatusLabel(o.status)}
                    </span>
                    {countdown && countdown.status !== 'UNKNOWN' && (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                          countdown.tone === 'rose'
                            ? 'bg-rose-50 text-rose-700'
                            : countdown.tone === 'amber'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        <CalendarClock className="h-3 w-3" strokeWidth={1.75} />
                        {countdown.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-bold text-stone-900">
                    {o.customerName} · {o.itemDescription} ({o.qty} {o.unit})
                  </div>
                  <div className="text-xs text-stone-600">
                    Kirim: <strong>{deliveryReadable}, {o.deliveryTime}</strong> · DP:{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(o.dpAmount)}</span> · Sisa:{' '}
                    <strong className="font-mono tabular-nums text-amber-700">
                      {formatRupiah(o.remainingAmount)}
                    </strong>
                  </div>
                  {o.greetingCardNote && (
                    <div className="mt-1 text-xs italic text-stone-500">
                      Kartu ucapan: &ldquo;{o.greetingCardNote}&rdquo;
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.status !== 'SELESAI' && (
                    <button
                      type="button"
                      onClick={() => advanceBakery(o)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Lanjut Tahap
                    </button>
                  )}
                  <UnifiedWaActionButton
                    customerPhone={o.customerPhone}
                    customerName={o.customerName}
                    message={waMessage}
                    modalTitle={`Kirim Info Pre-Order - ${o.poCode}`}
                    documentType="ORDER"
                    referenceNo={o.poCode}
                    label="WA Pemesan"
                    variant="emerald"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <ModalShell
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          headerId="ops-modal-bakery-title"
          title="Catat Pre-Order Bakery / Catering"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleAddBakeryPo} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pemesan</label>
                <input type="text" required value={fName} onChange={(e) => setFName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
                <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Menu / Pesanan</label>
                <input type="text" required value={fPrimary} onChange={(e) => setFPrimary(e.target.value)} placeholder="Nasi Box Ayam Bakar" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Qty</label>
                <input type="number" min="1" value={fSecondary} onChange={(e) => setFSecondary(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Tanggal Kirim</label>
                <input type="date" required value={fDate} onChange={(e) => setFDate(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Jam Kirim</label>
                <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Total Pesanan (Rp)</label>
                <input type="number" min="0" required value={fAmount} onChange={(e) => setFAmount(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">DP Masuk (Rp)</label>
                <input type="number" min="0" value={fDp} onChange={(e) => setFDp(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700">Batal</button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Simpan Pre-Order</button>
            </div>
          </form>
        </ModalShell>
      </div>
    );
  }

  // PET_SHOP
  if (vertical === 'PET_SHOP') {
    const petOrders = ops.petAppointments ?? [];
    const advancePet = (o: PetServiceOrder) => {
      const flow: PetServiceOrder['status'][] = ['TERDAFTAR', 'PROSES', 'SIAP_JEMPUT', 'SELESAI'];
      const next = flow[Math.min(flow.length - 1, flow.indexOf(o.status) + 1)];
      updateVerticalOps(
        (prev) => ({
          ...prev,
          petAppointments: (prev.petAppointments ?? []).map((x) =>
            x.id === o.id
              ? { ...x, status: next, paymentStatus: next === 'SELESAI' ? 'PAID' : x.paymentStatus }
              : x
          ),
        }),
        next === 'SELESAI'
          ? { grossAmount: o.totalAmount, description: `Layanan ${o.serviceKind} Anabul ${o.petName}` }
          : undefined
      );
    };

    const handleAddPet = (e: React.FormEvent) => {
      e.preventDefault();
      if (!fName.trim() || !fPrimary.trim()) return;
      const newPet: PetServiceOrder = {
        id: `pet-${Date.now()}`,
        ticketCode: `PET-${String(petOrders.length + 1).padStart(3, '0')}`,
        ownerName: fName.trim(),
        ownerPhone: fPhone.trim() || '0812-0000-0000',
        petName: fPrimary.trim(),
        petSpecies: 'KUCING',
        breed: fSecondary.trim() || 'Domestik',
        serviceKind: 'GROOMING',
        packageName: fStaff.trim() || 'Grooming Sehat & Jamur',
        checkInDate: getTodayIsoDate(),
        nights: 1,
        totalAmount: new Decimal(fAmount || '85000').toFixed(4),
        status: 'TERDAFTAR',
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString(),
      };
      updateVerticalOps((prev) => ({
        ...prev,
        petAppointments: [newPet, ...(prev.petAppointments ?? [])],
      }));
      setShowQuickAdd(false);
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Antrean Grooming &amp; Pet Hotel</h2>
            <p className="text-xs text-stone-600">
              Catat jadwal grooming atau penitipan anabul lalu kirim kabar WA saat sudah siap dijemput.
            </p>
          </div>
          <button
            type="button"
            data-testid="ops-add-pet-btn"
            onClick={() => {
              resetQuickForm('85000');
              setShowQuickAdd(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span>Catat Grooming / Pet Hotel</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Semua', count: petOrders.length },
              { id: 'ACTIVE', label: 'Aktif / Proses', count: petOrders.filter((p) => p.status !== 'SELESAI').length },
              { id: 'DONE', label: 'Selesai', count: petOrders.filter((p) => p.status === 'SELESAI').length },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setListFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                listFilter === f.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{f.label}</span>
              <span className="font-mono text-[10px] opacity-80">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {petOrders
            .filter((p) =>
              listFilter === 'ALL' ? true : listFilter === 'DONE' ? p.status === 'SELESAI' : p.status !== 'SELESAI'
            )
            .map((p) => {
            const waMessage = buildGenericBookingWaMessage({
              businessName: tenant.name,
              customerName: p.ownerName,
              bookingRef: `${p.petName} (${p.serviceKind === 'PENITIPAN_HOTEL' ? 'Pet Hotel' : 'Grooming'})`,
              summaryLine: `Anabul ${p.petName} sudah rapi dan siap dijemput.`,
              totalAmount: p.totalAmount,
            });
            return (
              <div key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-stone-900">
                      {p.petName} ({p.petSpecies} · {p.breed})
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {p.serviceKind === 'PENITIPAN_HOTEL'
                        ? `Pet Hotel · ${p.cageNumber || 'Kandang'}`
                        : 'Grooming'}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {formatVerticalStatusLabel(p.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600">
                    Pemilik: <strong>{p.ownerName}</strong> ({p.ownerPhone}) · Paket: {p.packageName}
                  </div>
                  {(p.vaccineNote || p.feedingNote) && (
                    <div className="mt-0.5 text-xs text-stone-500">
                      {[p.vaccineNote, p.feedingNote].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold tabular-nums">{formatRupiah(p.totalAmount)}</span>
                  {p.status !== 'SELESAI' && (
                    <button
                      type="button"
                      onClick={() => advancePet(p)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Update Status
                    </button>
                  )}
                  <UnifiedWaActionButton
                    customerPhone={p.ownerPhone}
                    customerName={p.ownerName}
                    message={waMessage}
                    modalTitle={`Kirim Kabar Anabul - ${p.petName}`}
                    documentType="ORDER"
                    referenceNo={p.id}
                    label="WA Pemilik"
                    variant="emerald"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <ModalShell
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          headerId="ops-modal-pet-title"
          title="Catat Layanan Grooming / Pet Hotel"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleAddPet} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pemilik</label>
                <input type="text" required value={fName} onChange={(e) => setFName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
                <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Anabul</label>
                <input type="text" required value={fPrimary} onChange={(e) => setFPrimary(e.target.value)} placeholder="Mochi" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Ras / Jenis</label>
                <input type="text" value={fSecondary} onChange={(e) => setFSecondary(e.target.value)} placeholder="Persia / Golden" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Paket Layanan</label>
                <input type="text" value={fStaff} onChange={(e) => setFStaff(e.target.value)} placeholder="Grooming Sehat" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Biaya (Rp)</label>
                <input type="number" min="0" required value={fAmount} onChange={(e) => setFAmount(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700">Batal</button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Simpan Layanan</button>
            </div>
          </form>
        </ModalShell>
      </div>
    );
  }

  // TOKO_BANGUNAN
  if (vertical === 'TOKO_BANGUNAN') {
    const deliveries = ops.buildingDeliveries ?? [];
    const advanceDelivery = (d: BuildingDeliveryOrder) => {
      const flow: BuildingDeliveryOrder['status'][] = ['MUAT_BARANG', 'DIKIRIM', 'DITERIMA_PROYEK'];
      const next = flow[Math.min(flow.length - 1, flow.indexOf(d.status) + 1)];
      updateVerticalOps((prev) => ({
        ...prev,
        buildingDeliveries: (prev.buildingDeliveries ?? []).map((x) =>
          x.id === d.id ? { ...x, status: next } : x
        ),
      }));
    };

    const handleAddDelivery = (e: React.FormEvent) => {
      e.preventDefault();
      if (!fName.trim() || !fPrimary.trim()) return;
      const newDo: BuildingDeliveryOrder = {
        id: `bdo-${Date.now()}`,
        doNumber: `SJ-${String(deliveries.length + 1).padStart(3, '0')}`,
        customerOrContractor: fName.trim(),
        customerPhone: '0812-0000-0000',
        projectAddress: fSecondary.trim() || 'Lokasi proyek pelanggan',
        itemsSummary: fPrimary.trim(),
        driverName: fStaff.trim() || 'Sopir Armada',
        truckPlate: fPhone.trim().toUpperCase() || 'B 9012 TB',
        totalValue: new Decimal(fAmount || '0').toFixed(4),
        paymentTerm: 'TEMPO_PROYEK',
        status: 'MUAT_BARANG',
        createdAt: new Date().toISOString(),
      };
      updateVerticalOps((prev) => ({
        ...prev,
        buildingDeliveries: [newDo, ...(prev.buildingDeliveries ?? [])],
      }));
      setShowQuickAdd(false);
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Surat Jalan &amp; Pengiriman Material Proyek</h2>
            <p className="text-xs text-stone-600">
              Buat surat jalan pengiriman pasir, semen, atau besi dan pantau status barang sampai di lokasi proyek.
            </p>
          </div>
          <button
            type="button"
            data-testid="ops-add-delivery-btn"
            onClick={() => {
              resetQuickForm('2500000');
              setShowQuickAdd(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            <span>Buat Surat Jalan</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Semua Surat Jalan', count: deliveries.length },
              { id: 'ACTIVE', label: 'Dalam Pengiriman', count: deliveries.filter((d) => d.status !== 'DITERIMA_PROYEK').length },
              { id: 'DONE', label: 'Diterima Proyek', count: deliveries.filter((d) => d.status === 'DITERIMA_PROYEK').length },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setListFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                listFilter === f.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{f.label}</span>
              <span className="font-mono text-[10px] opacity-80">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
          {deliveries
            .filter((d) =>
              listFilter === 'ALL'
                ? true
                : listFilter === 'DONE'
                ? d.status === 'DITERIMA_PROYEK'
                : d.status !== 'DITERIMA_PROYEK'
            )
            .map((d) => (
            <div key={d.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Truck className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
                  <span className="font-mono text-xs font-bold text-stone-900">{d.doNumber}</span>
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                    {d.paymentTerm === 'TEMPO_PROYEK' ? 'Tempo Proyek' : 'Tunai'}
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {formatVerticalStatusLabel(d.status)}
                  </span>
                </div>
                <div className="mt-1 text-sm font-bold text-stone-900">{d.customerOrContractor}</div>
                <div className="text-xs text-stone-600">
                  Lokasi: {d.projectAddress} · Sopir: {d.driverName} ({d.truckPlate})
                </div>
                <div className="mt-0.5 text-xs text-stone-500">Material: {d.itemsSummary}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold tabular-nums">{formatRupiah(d.totalValue)}</span>
                {d.status !== 'DITERIMA_PROYEK' && (
                  <button
                    type="button"
                    onClick={() => advanceDelivery(d)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Update Pengiriman
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <ModalShell
          open={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          headerId="ops-modal-building-title"
          title="Buat Surat Jalan Material"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleAddDelivery} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pemborong / Proyek</label>
              <input type="text" required value={fName} onChange={(e) => setFName(e.target.value)} placeholder="CV Karya Mandiri" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Alamat Pengiriman</label>
              <input type="text" value={fSecondary} onChange={(e) => setFSecondary(e.target.value)} placeholder="Jl. Merdeka No. 12" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Ringkasan Material</label>
              <input type="text" required value={fPrimary} onChange={(e) => setFPrimary(e.target.value)} placeholder="50 sak semen + 1 truk pasir" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Sopir</label>
                <input type="text" value={fStaff} onChange={(e) => setFStaff(e.target.value)} placeholder="Pak Budi" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Plat Truk</label>
                <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)} placeholder="B 9012 TB" className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nilai (Rp)</label>
                <input type="number" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm tabular-nums" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700">Batal</button>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Simpan Surat Jalan</button>
            </div>
          </form>
        </ModalShell>
      </div>
    );
  }

  // BARBERSHOP / SALON_KECANTIKAN / SPA_WELLNESS / BARBERSHOP_SALON
  const appointments = ops.beautyAppointments ?? [];
  const staffSummary = aggregateStaffCommissions(
    appointments.map((a) => ({ staffName: a.staffName, commissionAmount: a.staffCommissionAmount }))
  );

  const staffRoleLabel =
    vertical === 'SPA_WELLNESS'
      ? 'Terapis'
      : vertical === 'SALON_KECANTIKAN'
      ? 'Stylist'
      : 'Kapster';

  const advanceAppointment = (a: BeautySpaAppointment) => {
    const flow: BeautySpaAppointment['status'][] = ['TERJADWAL', 'BERLANGSUNG', 'SELESAI'];
    const next = flow[Math.min(flow.length - 1, flow.indexOf(a.status) + 1)];
    updateVerticalOps(
      (prev) => ({
        ...prev,
        beautyAppointments: (prev.beautyAppointments ?? []).map((x) =>
          x.id === a.id
            ? { ...x, status: next, paymentStatus: next === 'SELESAI' ? 'PAID' : x.paymentStatus }
            : x
        ),
      }),
      next === 'SELESAI'
        ? { grossAmount: a.price, description: `Layanan ${a.treatmentName} (${a.customerName})` }
        : undefined
    );
  };

  const handleAddAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fName.trim() || !fPrimary.trim()) return;
    const priceDec = new Decimal(fAmount || '75000');
    const newAppt: BeautySpaAppointment = {
      id: `apt-${Date.now()}`,
      bookingCode: `BK-${String(appointments.length + 1).padStart(3, '0')}`,
      customerName: fName.trim(),
      customerPhone: fPhone.trim() || '0812-0000-0000',
      treatmentName: fPrimary.trim(),
      staffName: fStaff.trim() || `${staffRoleLabel} Utama`,
      roomOrChair: 'Kursi 1',
      staffCommissionRate: '0.25',
      staffCommissionAmount: priceDec.times('0.25').toFixed(4),
      scheduleTime: fTime,
      durationMinutes: Math.max(15, Number(fSecondary) || 45),
      price: priceDec.toFixed(4),
      status: 'TERJADWAL',
      paymentStatus: 'UNPAID',
    };
    updateVerticalOps((prev) => ({
      ...prev,
      beautyAppointments: [newAppt, ...(prev.beautyAppointments ?? [])],
    }));
    setShowQuickAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Jadwal Antrean &amp; Komisi {staffRoleLabel}
          </h2>
          <p className="text-xs text-stone-600">
            Catat antrean pelanggan, pantau komisi {staffRoleLabel.toLowerCase()}, dan kirim pengingat jadwal lewat WA.
          </p>
        </div>
        <button
          type="button"
          data-testid="ops-add-appointment-btn"
          onClick={() => {
            resetQuickForm('85000');
            setFSecondary('45');
            setShowQuickAdd(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          <span>Buat Jadwal / Antrean</span>
        </button>
      </div>

      {staffSummary.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staffSummary.map((s) => (
            <div key={s.staffName} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">Komisi {staffRoleLabel}</div>
              <div className="mt-0.5 text-sm font-bold text-stone-900">{s.staffName}</div>
              <div className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-700">
                {formatRupiah(s.totalCommission)} ({s.jobCount} layanan)
              </div>
            </div>
          ))}
        </div>
      )}

      {vertical === 'SPA_WELLNESS' && regionalTaxInfo.applies && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-950">
          <strong>Pajak Daerah Aktif ({regionalTaxInfo.regionName}):</strong>{' '}
          {regionalTaxInfo.taxLabel} ({regionalTaxInfo.ratePercentLabel}) sesuai {regionalTaxInfo.perdaReference}. Tarif otomatis masuk perhitungan kasir &amp; laporan pajak daerah.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'ALL', label: 'Semua Jadwal', count: appointments.length },
            { id: 'ACTIVE', label: 'Terjadwal / Berlangsung', count: appointments.filter((a) => a.status !== 'SELESAI').length },
            { id: 'DONE', label: 'Selesai', count: appointments.filter((a) => a.status === 'SELESAI').length },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setListFilter(f.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              listFilter === f.id
                ? 'bg-stone-900 text-white'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <span>{f.label}</span>
            <span className="font-mono text-[10px] opacity-80">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {appointments.length === 0 ? (
          <div className="p-6 text-center text-sm text-stone-500">
            <ClipboardCheck className="mx-auto mb-2 h-6 w-6 text-stone-400" strokeWidth={1.75} />
            Belum ada jadwal antrean treatment aktif.
          </div>
        ) : (
          appointments
            .filter((a) =>
              listFilter === 'ALL' ? true : listFilter === 'DONE' ? a.status === 'SELESAI' : a.status !== 'SELESAI'
            )
            .map((a) => {
            const waMessage = buildGenericBookingWaMessage({
              businessName: tenant.name,
              customerName: a.customerName,
              bookingRef: a.treatmentName,
              summaryLine: `Jadwal perawatan pukul ${a.scheduleTime} (${a.durationMinutes} menit) bersama ${a.staffName}.`,
              totalAmount: a.price,
            });
            return (
              <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">{a.scheduleTime}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {a.durationMinutes} menit
                    </span>
                    {a.roomOrChair && (
                      <span className="text-xs text-stone-500">{a.roomOrChair}</span>
                    )}
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {formatVerticalStatusLabel(a.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-bold text-stone-900">
                    {a.customerName} · {a.treatmentName}
                  </div>
                  <div className="text-xs text-stone-600">
                    {staffRoleLabel}: <strong>{a.staffName}</strong> · Komisi:{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(a.staffCommissionAmount)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold tabular-nums">{formatRupiah(a.price)}</span>
                  {a.status !== 'SELESAI' && (
                    <button
                      type="button"
                      onClick={() => advanceAppointment(a)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      {a.status === 'TERJADWAL' ? 'Mulai Layanan' : 'Selesai & Catat Kas'}
                    </button>
                  )}
                  <UnifiedWaActionButton
                    customerPhone={a.customerPhone}
                    customerName={a.customerName}
                    message={waMessage}
                    modalTitle={`Kirim Info Jadwal - ${a.customerName}`}
                    documentType="ORDER"
                    referenceNo={a.id}
                    label="WA"
                    variant="outline"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <ModalShell
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        headerId="ops-modal-beauty-title"
        title={`Buat Jadwal / Antrean ${staffRoleLabel}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddAppointment} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pelanggan</label>
              <input type="text" required value={fName} onChange={(e) => setFName(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
              <input type="text" value={fPhone} onChange={(e) => setFPhone(e.target.value)} className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Jenis Layanan / Treatment</label>
            <input type="text" required value={fPrimary} onChange={(e) => setFPrimary(e.target.value)} placeholder="Potong Rambut + Cuci / Body Massage" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Jam</label>
              <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2.5 py-2 font-mono text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Durasi (mnt)</label>
              <input type="number" min="15" value={fSecondary} onChange={(e) => setFSecondary(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2.5 py-2 font-mono text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-700">Tarif (Rp)</label>
              <input type="number" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2.5 py-2 font-mono text-sm tabular-nums" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-700">Nama {staffRoleLabel}</label>
            <input type="text" value={fStaff} onChange={(e) => setFStaff(e.target.value)} placeholder={`Nama ${staffRoleLabel.toLowerCase()}`} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700">Batal</button>
            <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">Simpan Jadwal</button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
