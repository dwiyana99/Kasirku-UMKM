import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  BedDouble,
  CheckCircle2,
  MessageCircle,
  Plus,
  Receipt,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ModalShell } from '../components/ui/ModalShell';
import { FonnteSendModal } from '../components/whatsapp/FonnteSendModal';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { BoardingInvoice, BoardingRoom, BoardingTenant } from '../types/domain';

type KostTab = 'ROOMS' | 'TENANTS' | 'INVOICES';

export function KostManagementPage() {
  const {
    activeWorkspace,
    hasAddOn,
    addBoardingRoom,
    updateBoardingRoomStatus,
    checkInBoardingTenant,
    createBoardingInvoice,
    payBoardingInvoice,
  } = useApp();

  const [activeTab, setActiveTab] = useState<KostTab>('ROOMS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | BoardingRoom['status']>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fonnteInvoice, setFonnteInvoice] = useState<{
    phone: string;
    message: string;
    refNo: string;
  } | null>(null);

  // Add Room Modal State
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState('');
  const [roomType, setRoomType] = useState('AC + Kamar Mandi Dalam');
  const [monthlyRate, setMonthlyRate] = useState('1500000');
  const [yearlyRate, setYearlyRate] = useState('16500000');
  const [roomNotes, setRoomNotes] = useState('');

  // Check-In Tenant Modal State
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [nikKtp, setNikKtp] = useState('');
  const [phoneWa, setPhoneWa] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositAmount, setDepositAmount] = useState('500000');
  const [depositAccount, setDepositAccount] = useState<'1101' | '1102'>('1102');

  // Create Invoice Modal State
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceTenantId, setInvoiceTenantId] = useState('');
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rentAmount, setRentAmount] = useState('1500000');
  const [utilityFee, setUtilityFee] = useState('150000');
  const [lateFee, setLateFee] = useState('0');

  const rooms = activeWorkspace.boardingRooms ?? [];
  const tenants = activeWorkspace.boardingTenants ?? [];
  const invoices = activeWorkspace.boardingInvoices ?? [];

  const availableRooms = useMemo(
    () => rooms.filter((r) => r.status === 'AVAILABLE'),
    [rooms]
  );

  const filteredRooms = useMemo(
    () => (statusFilter === 'ALL' ? rooms : rooms.filter((r) => r.status === statusFilter)),
    [rooms, statusFilter]
  );

  const kpi = useMemo(() => {
    const totalRooms = rooms.length;
    const occupiedCount = rooms.filter((r) => r.status === 'OCCUPIED').length;
    const occupancyPct = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0;

    const totalDepositLiability = tenants
      .filter((t) => t.isActive)
      .reduce((acc, t) => acc.plus(new Decimal(t.depositAmount || '0')), new Decimal(0));

    const unpaidInvoices = invoices.filter((i) => i.paymentStatus !== 'PAID');
    const unpaidTotal = unpaidInvoices.reduce(
      (acc, i) => acc.plus(new Decimal(i.totalAmount || '0')),
      new Decimal(0)
    );

    const paidPph42Total = invoices
      .filter((i) => i.paymentStatus === 'PAID')
      .reduce((acc, i) => acc.plus(new Decimal(i.pph42Amount || '0')), new Decimal(0));

    return {
      totalRooms,
      occupiedCount,
      occupancyPct,
      totalDepositLiability: totalDepositLiability.toFixed(4),
      unpaidCount: unpaidInvoices.length,
      unpaidTotal: unpaidTotal.toFixed(4),
      paidPph42Total: paidPph42Total.toFixed(4),
    };
  }, [rooms, tenants, invoices]);

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNumber.trim() || !monthlyRate.trim()) {
      setFeedback({ type: 'error', text: 'Nomor kamar dan tarif sewa bulanan wajib diisi.' });
      return;
    }
    try {
      addBoardingRoom({
        roomNumber: roomNumber.trim(),
        roomType: roomType.trim() || 'Standar',
        monthlyRate: new Decimal(monthlyRate).toFixed(4),
        yearlyRate: yearlyRate ? new Decimal(yearlyRate).toFixed(4) : undefined,
        notes: roomNotes.trim() || undefined,
      });
      setRoomModalOpen(false);
      setRoomNumber('');
      setRoomNotes('');
      setFeedback({ type: 'success', text: `Kamar ${roomNumber.trim()} berhasil ditambahkan.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menambah kamar.',
      });
    }
  };

  const handleCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !tenantName.trim() || !phoneWa.trim()) {
      setFeedback({ type: 'error', text: 'Pilih kamar tersedia, isi nama penghuni dan nomor WhatsApp.' });
      return;
    }
    try {
      checkInBoardingTenant({
        roomId: selectedRoomId,
        fullName: tenantName.trim(),
        nikKtp: nikKtp.trim() || '3171000000000000',
        phoneWa: phoneWa.trim(),
        emergencyContact: emergencyContact.trim() || '-',
        checkInDate,
        depositAmount: new Decimal(depositAmount || '0').toFixed(4),
        paymentAccountCode: depositAccount,
      });
      setCheckInModalOpen(false);
      setTenantName('');
      setNikKtp('');
      setPhoneWa('');
      setEmergencyContact('');
      setFeedback({
        type: 'success',
        text: 'Penghuni berhasil check-in. Uang deposit dijurnal otomatis sebagai Utang Deposit Penghuni (2106), bukan pendapatan.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mencatat check-in penghuni.',
      });
    }
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const tenant = tenants.find((t) => t.id === invoiceTenantId);
    if (!tenant || !tenant.roomId) {
      setFeedback({ type: 'error', text: 'Pilih penghuni kost yang aktif.' });
      return;
    }
    try {
      createBoardingInvoice({
        roomId: tenant.roomId,
        boardingTenantId: tenant.id,
        periodMonth,
        rentAmount: new Decimal(rentAmount || '0').toFixed(4),
        utilityFee: new Decimal(utilityFee || '0').toFixed(4),
        lateFee: new Decimal(lateFee || '0').toFixed(4),
      });
      setInvoiceModalOpen(false);
      setFeedback({ type: 'success', text: `Tagihan periode ${periodMonth} berhasil dibuat.` });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat tagihan sewa.',
      });
    }
  };

  const handlePayInvoice = (inv: BoardingInvoice) => {
    try {
      payBoardingInvoice(inv.id, '1102');
      setFeedback({
        type: 'success',
        text: `Tagihan ${inv.periodMonth} lunas. Dijurnal ke Pendapatan Sewa (4104) & Akrual PPh Final Pasal 4(2) 10% (2105).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal melunasi tagihan.',
      });
    }
  };

  const tenantColumns: DataTableColumn<BoardingTenant>[] = [
    {
      key: 'name',
      header: 'Penghuni & KTP',
      render: (t) => (
        <div>
          <p className="font-semibold text-slate-900">{t.fullName}</p>
          <p className="text-[11px] font-mono text-slate-500">NIK: {t.nikKtp}</p>
        </div>
      ),
    },
    {
      key: 'room',
      header: 'Kamar Aktif',
      render: (t) => {
        const rm = rooms.find((r) => r.id === t.roomId);
        return (
          <span className="font-medium text-slate-800">
            {rm ? `Kamar ${rm.roomNumber} · ${rm.roomType}` : 'Tidak ada kamar'}
          </span>
        );
      },
    },
    {
      key: 'contact',
      header: 'WhatsApp & Darurat',
      render: (t) => (
        <div>
          <p className="font-mono text-slate-800">{t.phoneWa}</p>
          <p className="text-[11px] text-slate-500">Darurat: {t.emergencyContact}</p>
        </div>
      ),
    },
    {
      key: 'checkIn',
      header: 'Tgl Masuk',
      render: (t) => <span className="font-mono tabular-nums text-slate-700">{t.checkInDate}</span>,
    },
    {
      key: 'deposit',
      header: 'Utang Deposit (2106)',
      align: 'right',
      render: (t) => (
        <span className="font-mono font-semibold tabular-nums text-slate-900">
          {formatRupiah(t.depositAmount)}
        </span>
      ),
    },
  ];

  const invoiceColumns: DataTableColumn<BoardingInvoice>[] = [
    {
      key: 'period',
      header: 'Periode & Kamar',
      render: (inv) => {
        const rm = rooms.find((r) => r.id === inv.roomId);
        const tn = tenants.find((t) => t.id === inv.boardingTenantId);
        return (
          <div>
            <p className="font-semibold text-slate-900">
              {inv.periodMonth} · Kamar {rm?.roomNumber ?? '-'}
            </p>
            <p className="text-[11px] text-slate-500">{tn?.fullName ?? 'Penghuni'}</p>
          </div>
        );
      },
    },
    {
      key: 'breakdown',
      header: 'Rincian Sewa + Utilitas',
      render: (inv) => (
        <div className="font-mono tabular-nums text-[11px] text-slate-600">
          Sewa {formatRupiah(inv.rentAmount)} + Utilitas {formatRupiah(inv.utilityFee)}
          {new Decimal(inv.lateFee || '0').gt(0) && ` + Denda ${formatRupiah(inv.lateFee)}`}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Tagihan',
      align: 'right',
      render: (inv) => (
        <span className="font-mono font-semibold tabular-nums text-slate-900">
          {formatRupiah(inv.totalAmount)}
        </span>
      ),
    },
    {
      key: 'pph',
      header: 'PPh 4(2) 10%',
      align: 'right',
      render: (inv) => (
        <span className="font-mono tabular-nums text-slate-600">
          {formatRupiah(inv.pph42Amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => (
        <span
          className={`text-xs font-semibold ${
            inv.paymentStatus === 'PAID'
              ? 'text-emerald-700'
              : inv.paymentStatus === 'OVERDUE'
              ? 'text-rose-700'
              : 'text-amber-700'
          }`}
        >
          {inv.paymentStatus === 'PAID'
            ? 'Lunas'
            : inv.paymentStatus === 'OVERDUE'
            ? 'Jatuh Tempo'
            : 'Belum Lunas'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (inv) => {
        const rm = rooms.find((r) => r.id === inv.roomId);
        const tn = tenants.find((t) => t.id === inv.boardingTenantId);
        const hasFonnte = hasAddOn('ADDON_WA_FONNTE');
        return (
          <div className="inline-flex items-center gap-2 justify-end">
            {rm && tn && (
              <button
                type="button"
                onClick={() =>
                  setFonnteInvoice({
                    phone: tn.phoneWa,
                    refNo: `KOST-${rm.roomNumber}-${inv.periodMonth}`,
                    message: [
                      `*TAGIHAN SEWA KOST — ${activeWorkspace.tenant.name}*`,
                      `Halo ${tn.fullName},`,
                      `Kamar: ${rm.roomNumber} (${rm.roomType})`,
                      `Periode: ${inv.periodMonth}`,
                      `Sewa Kamar: ${formatRupiah(inv.rentAmount)}`,
                      `Listrik/Air/WiFi: ${formatRupiah(inv.utilityFee)}`,
                      ...(Number(inv.lateFee) > 0 ? [`Denda Telat: ${formatRupiah(inv.lateFee)}`] : []),
                      `*Total Tagihan: ${formatRupiah(inv.totalAmount)}*`,
                      `Mohon konfirmasi setelah melakukan pembayaran. Terima kasih.`,
                    ].join('\n'),
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{hasFonnte ? 'WA Fonnte' : 'WA (Add-On)'}</span>
              </button>
            )}
            {inv.paymentStatus !== 'PAID' && (
              <button
                type="button"
                onClick={() => handlePayInvoice(inv)}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
              >
                Bayar Lunas
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <AppShell
      title="Manajemen Kamar, Penghuni & Tagihan Kost"
      subtitle="Pencatatan kamar, Utang Deposit Penghuni (2106), penagihan WhatsApp & PPh Final Sewa Bangunan Pasal 4(2) 10%"
      primaryAction={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedRoomId(availableRooms[0]?.id ?? '');
              setCheckInModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Check-In Penghuni</span>
          </button>
          <button
            type="button"
            onClick={() => setRoomModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Kamar</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              {feedback.text}
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Okupansi Kamar</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {kpi.occupiedCount} / {kpi.totalRooms}{' '}
              <span className="text-sm font-semibold text-emerald-700">({kpi.occupancyPct}%)</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {availableRooms.length} kamar tersedia siap huni
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Utang Deposit Penghuni (Akun 2106)</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(kpi.totalDepositLiability)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Dicatat sebagai Liabilitas, bukan Pendapatan</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Tagihan Belum Lunas</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {formatRupiah(kpi.unpaidTotal)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{kpi.unpaidCount} invoice menunggu pembayaran</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Akrual PPh Final Pasal 4(2) 10%</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(kpi.paidPph42Total)}
            </p>
            <p className="text-xs text-slate-500 mt-1">10% final dari sewa bangunan yang lunas</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'ROOMS', label: `Daftar Kamar (${rooms.length})` },
                { id: 'TENANTS', label: `Penghuni & Deposit (${tenants.length})` },
                { id: 'INVOICES', label: `Tagihan & WA (${invoices.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'INVOICES' && (
            <button
              type="button"
              onClick={() => {
                const firstActive = tenants.find((t) => t.isActive);
                if (firstActive) {
                  setInvoiceTenantId(firstActive.id);
                  const rm = rooms.find((r) => r.id === firstActive.roomId);
                  if (rm) setRentAmount(new Decimal(rm.monthlyRate ?? rm.monthlyPrice ?? '0').toDecimalPlaces(0).toString());
                }
                setInvoiceModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Buat Tagihan Bulanan</span>
            </button>
          )}
        </div>

        {/* TAB 1: ROOMS */}
        {activeTab === 'ROOMS' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', 'AVAILABLE', 'OCCUPIED', 'MAINTENANCE'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {st === 'ALL'
                    ? 'Semua Kamar'
                    : st === 'AVAILABLE'
                    ? 'Kosong / Tersedia'
                    : st === 'OCCUPIED'
                    ? 'Terisi'
                    : 'Perbaikan'}
                </button>
              ))}
            </div>

            {filteredRooms.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                <BedDouble className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">Belum ada kamar pada filter ini</p>
                <p className="text-xs text-slate-500">
                  Tambahkan nomor kamar dan tarif sewa bulanan untuk mulai mengelola properti kost Anda.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRooms.map((room) => {
                  const occupant = tenants.find((t) => t.roomId === room.id && t.isActive);
                  return (
                    <div
                      key={room.id}
                      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">
                              Kamar {room.roomNumber}
                            </h3>
                            <p className="text-xs text-slate-500">{room.roomType}</p>
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              room.status === 'OCCUPIED'
                                ? 'text-emerald-700'
                                : room.status === 'MAINTENANCE'
                                ? 'text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {room.status === 'OCCUPIED'
                              ? 'Terisi'
                              : room.status === 'MAINTENANCE'
                              ? 'Maintenance'
                              : 'Tersedia'}
                          </span>
                        </div>

                        <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                          {formatRupiah(room.monthlyRate ?? room.monthlyPrice ?? '0')}
                          <span className="text-xs font-sans font-normal text-slate-500">/bulan</span>
                        </p>

                        {occupant ? (
                          <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-0.5">
                            <p className="font-semibold text-slate-800">{occupant.fullName}</p>
                            <p className="font-mono text-[11px] text-slate-500">
                              WA: {occupant.phoneWa} · Masuk: {occupant.checkInDate}
                            </p>
                          </div>
                        ) : (
                          <p className="pt-2 border-t border-slate-100 text-xs text-slate-400">
                            Belum ada penghuni aktif
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <select
                          aria-label={`Status kamar ${room.roomNumber}`}
                          value={room.status}
                          onChange={(e) =>
                            updateBoardingRoomStatus(
                              room.id,
                              e.target.value as BoardingRoom['status']
                            )
                          }
                          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
                        >
                          <option value="AVAILABLE">Tersedia</option>
                          <option value="OCCUPIED">Terisi</option>
                          <option value="MAINTENANCE">Maintenance</option>
                        </select>

                        {room.status === 'AVAILABLE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRoomId(room.id);
                              setCheckInModalOpen(true);
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            Check-In →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TENANTS */}
        {activeTab === 'TENANTS' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              data={tenants}
              columns={tenantColumns}
              getRowKey={(t) => t.id}
              testId="kost-tenants-table"
              emptyState={
                <p className="text-sm text-slate-500">
                  Belum ada data penghuni kost. Klik Check-In Penghuni untuk mencatat penghuni dan uang deposit.
                </p>
              }
            />
          </div>
        )}

        {/* TAB 3: INVOICES */}
        {activeTab === 'INVOICES' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <DataTable
              data={invoices}
              columns={invoiceColumns}
              getRowKey={(i) => i.id}
              testId="kost-invoices-table"
              emptyState={
                <p className="text-sm text-slate-500">
                  Belum ada tagihan bulanan tercatat. Klik Buat Tagihan Bulanan untuk membuat invoice sewa &amp; utilitas.
                </p>
              }
            />
          </div>
        )}
      </div>

      {/* Add Room Modal */}
      <ModalShell
        open={roomModalOpen}
        onClose={() => setRoomModalOpen(false)}
        headerId="add-room-modal-title"
        title="Tambah Kamar Kost Baru"
        subtitle="Atur nomor kamar, fasilitas tipe kamar, dan tarif sewa bulanan/tahunan."
      >
        <form onSubmit={handleAddRoom} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Kamar</label>
              <input
                type="text"
                required
                placeholder="Contoh: 205 / B-04"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Kamar</label>
              <input
                type="text"
                required
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tarif Bulanan (Rp)</label>
              <input
                type="number"
                min="0"
                required
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tarif Tahunan (Opsional)</label>
              <input
                type="number"
                min="0"
                value={yearlyRate}
                onChange={(e) => setYearlyRate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Fasilitas</label>
            <input
              type="text"
              placeholder="Contoh: Lantai 2, jendela hadap taman"
              value={roomNotes}
              onChange={(e) => setRoomNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setRoomModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Simpan Kamar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Check-In Tenant Modal */}
      <ModalShell
        open={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        headerId="checkin-tenant-modal-title"
        title="Check-In Penghuni & Uang Deposit"
        subtitle="Uang deposit otomatis dijurnal Debit Kas/Bank & Kredit Utang Deposit Penghuni (2106) — bukan Pendapatan."
      >
        <form onSubmit={handleCheckIn} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Kamar Tersedia</label>
              <select
                required
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">-- Pilih Kamar --</option>
                {availableRooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Kamar {r.roomNumber} ({r.roomType}) — {formatRupiah(r.monthlyRate ?? r.monthlyPrice ?? '0')}/bln
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Masuk</label>
              <input
                type="date"
                required
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap Penghuni</label>
              <input
                type="text"
                required
                placeholder="Nama sesuai KTP"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NIK KTP (16 Digit)</label>
              <input
                type="text"
                placeholder="3171..."
                value={nikKtp}
                onChange={(e) => setNikKtp(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp</label>
              <input
                type="tel"
                required
                placeholder="0812..."
                value={phoneWa}
                onChange={(e) => setPhoneWa(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kontak Darurat</label>
              <input
                type="text"
                placeholder="Orang tua / kerabat"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Uang Deposit / Jaminan (Rp)</label>
              <input
                type="number"
                min="0"
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Akun Penerimaan Deposit</label>
              <select
                value={depositAccount}
                onChange={(e) => setDepositAccount(e.target.value as '1101' | '1102')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="1102">Bank / Transfer (1102)</option>
                <option value="1101">Kas Tunai (1101)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCheckInModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Simpan Check-In &amp; Jurnal Deposit
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Create Invoice Modal */}
      <ModalShell
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        headerId="create-invoice-modal-title"
        title="Buat Tagihan Sewa Bulanan Kost"
        subtitle="Sistem menghitung otomatis PPh Final Pasal 4(2) 10% dan menyiapkan link penagihan WhatsApp."
      >
        <form onSubmit={handleCreateInvoice} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Penghuni Aktif</label>
              <select
                required
                value={invoiceTenantId}
                onChange={(e) => {
                  setInvoiceTenantId(e.target.value);
                  const tn = tenants.find((t) => t.id === e.target.value);
                  const rm = rooms.find((r) => r.id === tn?.roomId);
                  if (rm) setRentAmount(new Decimal(rm.monthlyRate ?? rm.monthlyPrice ?? '0').toDecimalPlaces(0).toString());
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="">-- Pilih Penghuni --</option>
                {tenants
                  .filter((t) => t.isActive)
                  .map((t) => {
                    const rm = rooms.find((r) => r.id === t.roomId);
                    return (
                      <option key={t.id} value={t.id}>
                        {t.fullName} — Kamar {rm?.roomNumber ?? '-'}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Periode Bulan (YYYY-MM)</label>
              <input
                type="month"
                required
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sewa Kamar (Rp)</label>
              <input
                type="number"
                min="0"
                required
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Listrik / Air / WiFi (Rp)</label>
              <input
                type="number"
                min="0"
                required
                value={utilityFee}
                onChange={(e) => setUtilityFee(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Denda Telat (Rp)</label>
              <input
                type="number"
                min="0"
                value={lateFee}
                onChange={(e) => setLateFee(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setInvoiceModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Terbitkan Tagihan
            </button>
          </div>
        </form>
      </ModalShell>

      <FonnteSendModal
        open={Boolean(fonnteInvoice)}
        onClose={() => setFonnteInvoice(null)}
        title="Kirim Tagihan Kost via WhatsApp (Fonnte)"
        defaultPhone={fonnteInvoice?.phone ?? ''}
        defaultMessage={fonnteInvoice?.message ?? ''}
        documentType="INVOICE"
        referenceNo={fonnteInvoice?.refNo}
      />
    </AppShell>
  );
}
