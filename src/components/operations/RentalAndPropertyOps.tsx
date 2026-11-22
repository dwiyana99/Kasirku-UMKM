import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Download,
  FileText,
  Fuel,
  KeyRound,
  MessageCircle,
  Plus,
  Printer,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatRupiah } from '../../lib/pos/checkout-service';
import {
  buildRentalContractPrintHtml,
  calculateCourtBookingAmounts,
  calculateHomestaySettlement,
  calculateRentalSettlement,
  hasCourtSlotConflict,
} from '../../lib/verticals/vertical-operations-engine';
import {
  buildDirectWaLink,
  buildDueReminderWaMessage,
  buildGenericBookingWaMessage,
  checkDirectWaReadiness,
} from '../../lib/messaging/whatsapp-direct';
import { resolveEffectiveRegionalTax } from '../../lib/tax/regional-tax-indonesia';
import type {
  CourtBooking,
  GarageSlot,
  HomestayBooking,
  RentalContract,
} from '../../types/domain';

export function RentalKendaraanModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const tenant = activeWorkspace.tenant;
  const ops = activeWorkspace.verticalOps ?? {};
  const vehicles = ops.rentalVehicles ?? [];
  const contracts = ops.rentalContracts ?? [];
  const waStatus = checkDirectWaReadiness(tenant.settings.businessWhatsappNumber);

  const [showNewForm, setShowNewForm] = useState(false);
  const [returnTarget, setReturnTarget] = useState<RentalContract | null>(null);
  const [printContract, setPrintContract] = useState<RentalContract | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // New contract form state
  const availableVehicles = vehicles.filter((v) => v.status === 'AVAILABLE');
  const [vehicleId, setVehicleId] = useState(availableVehicles[0]?.id ?? vehicles[0]?.id ?? '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNik, setCustomerNik] = useState('');
  const [customerSim, setCustomerSim] = useState('');
  const [startDateTime, setStartDateTime] = useState('2026-11-22T09:00');
  const [plannedReturnDateTime, setPlannedReturnDateTime] = useState('2026-11-23T09:00');
  const [daysCount, setDaysCount] = useState('1');
  const [depositAmount, setDepositAmount] = useState('300000');
  const [fuelLevelStart, setFuelLevelStart] = useState<RentalContract['fuelLevelStart']>('FULL');
  const [odometerStartKm, setOdometerStartKm] = useState('25000');
  const [ktpFileName, setKtpFileName] = useState('');
  const [simFileName, setSimFileName] = useState('');
  const [handoverFileName, setHandoverFileName] = useState('');

  // Return calculator state
  const [actualReturnTime, setActualReturnTime] = useState('2026-11-23T12:00');
  const [overtimeHours, setOvertimeHours] = useState('2');
  const [fuelEnd, setFuelEnd] = useState<RentalContract['fuelLevelStart']>('HALF');
  const [odometerEnd, setOdometerEnd] = useState('25320');
  const [damageFee, setDamageFee] = useState('0');

  const handleFilePick = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (name: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      setter(`${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`);
    }
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const chosenVehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];
    if (!chosenVehicle) {
      setFormError('Armada tidak ditemukan.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim() || !customerNik.trim()) {
      setFormError('Nama penyewa, nomor WhatsApp, dan NIK KTP wajib diisi.');
      return;
    }
    const baseRate = new Decimal(chosenVehicle.dailyRate)
      .times(Math.max(1, Number(daysCount) || 1))
      .toFixed(4);
    const contractNum = `RNT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
      contracts.length + 1
    ).padStart(3, '0')}`;
    const kycUploads = [
      ...(ktpFileName ? [{ docType: 'KTP' as const, fileName: ktpFileName, uploadedAt: new Date().toISOString() }] : []),
      ...(simFileName ? [{ docType: 'SIM' as const, fileName: simFileName, uploadedAt: new Date().toISOString() }] : []),
      ...(handoverFileName
        ? [{ docType: 'FOTO_SERAH_TERIMA' as const, fileName: handoverFileName, uploadedAt: new Date().toISOString() }]
        : []),
    ];

    const newContract: RentalContract = {
      id: `rnt-${Date.now()}`,
      contractNumber: contractNum,
      vehicleId: chosenVehicle.id,
      vehicleLabel: `${chosenVehicle.name} (${chosenVehicle.plateNumber})`,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerNik: customerNik.trim(),
      customerSimNumber: customerSim.trim() || undefined,
      startDateTime: startDateTime.replace('T', ' '),
      plannedReturnDateTime: plannedReturnDateTime.replace('T', ' '),
      baseRentalFee: baseRate,
      depositAmount: new Decimal(depositAmount || '0').toFixed(4),
      fuelLevelStart,
      odometerStartKm: Number(odometerStartKm) || 0,
      overtimeHours: 0,
      overtimeFee: '0.0000',
      fuelPenaltyFee: '0.0000',
      damageFee: '0.0000',
      totalAmount: baseRate,
      status: 'ACTIVE',
      kycUploads,
      createdAt: new Date().toISOString(),
    };

    updateVerticalOps((prev) => ({
      ...prev,
      rentalVehicles: (prev.rentalVehicles ?? []).map((v) =>
        v.id === chosenVehicle.id ? { ...v, status: 'RENTED' } : v
      ),
      rentalContracts: [newContract, ...(prev.rentalContracts ?? [])],
    }));

    setShowNewForm(false);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerNik('');
    setCustomerSim('');
    setKtpFileName('');
    setSimFileName('');
    setHandoverFileName('');
    setPrintContract(newContract);
  };

  const returnCalc = useMemo(() => {
    if (!returnTarget) return null;
    const veh = vehicles.find((v) => v.id === returnTarget.vehicleId);
    return calculateRentalSettlement({
      baseRentalFee: returnTarget.baseRentalFee,
      overtimeHours: Number(overtimeHours) || 0,
      overtimeHourlyRate: veh?.overtimeHourlyRate ?? '50000',
      fuelStart: returnTarget.fuelLevelStart,
      fuelEnd,
      fuelPenaltyPerStep: '75000',
      damageFee: damageFee || '0',
      depositAmount: returnTarget.depositAmount,
    });
  }, [damageFee, fuelEnd, overtimeHours, returnTarget, vehicles]);

  const handleCompleteReturn = () => {
    if (!returnTarget || !returnCalc) return;
    updateVerticalOps(
      (prev) => ({
        ...prev,
        rentalVehicles: (prev.rentalVehicles ?? []).map((v) =>
          v.id === returnTarget.vehicleId
            ? { ...v, status: 'AVAILABLE', lastOdometerKm: Number(odometerEnd) || v.lastOdometerKm }
            : v
        ),
        rentalContracts: (prev.rentalContracts ?? []).map((c) =>
          c.id === returnTarget.id
            ? {
                ...c,
                actualReturnDateTime: actualReturnTime.replace('T', ' '),
                fuelLevelEnd: fuelEnd,
                odometerEndKm: Number(odometerEnd) || c.odometerStartKm,
                overtimeHours: Number(overtimeHours) || 0,
                overtimeFee: returnCalc.overtimeFee,
                fuelPenaltyFee: returnCalc.fuelPenaltyFee,
                damageFee: new Decimal(damageFee || '0').toFixed(4),
                totalAmount: returnCalc.totalAmount,
                status: 'RETURNED',
              }
            : c
        ),
      }),
      {
        grossAmount: returnCalc.totalAmount,
        description: `Penyelesaian Sewa Armada ${returnTarget.contractNumber} (${returnTarget.customerName})`,
      }
    );
    setReturnTarget(null);
  };

  const printableHtml = useMemo(() => {
    if (!printContract) return '';
    return buildRentalContractPrintHtml({
      businessName: tenant.name,
      businessAddress: tenant.address,
      businessPhone: tenant.settings.businessWhatsappNumber || '0812-0000-0000',
      contract: printContract,
    });
  }, [printContract, tenant.address, tenant.name, tenant.settings.businessWhatsappNumber]);

  const handleDownloadContractHtml = () => {
    if (!printContract || !printableHtml) return;
    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kontrak-${printContract.contractNumber}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Fleet Status Cards */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">Status Armada Mobil & Motor</h2>
          <p className="text-xs text-stone-600">
            Pantau unit tersedia, sedang disewa, kilometer terakhir, dan buat kontrak sewa baru lengkap dengan upload syarat KTP/SIM.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setVehicleId(availableVehicles[0]?.id ?? vehicles[0]?.id ?? '');
            setShowNewForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Buat Kontrak Sewa Baru
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <div key={v.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-stone-900">{v.name}</div>
                <div className="mt-0.5 font-mono text-xs font-semibold text-stone-600">
                  {v.plateNumber} · {v.vehicleType === 'MOBIL' ? 'Mobil' : 'Motor'}
                </div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  v.status === 'AVAILABLE'
                    ? 'bg-emerald-50 text-emerald-700'
                    : v.status === 'RENTED'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {v.status === 'AVAILABLE'
                  ? 'Tersedia'
                  : v.status === 'RENTED'
                  ? 'Sedang Disewa'
                  : 'Servis'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 text-xs">
              <div>
                <div className="text-stone-500">Tarif Harian</div>
                <div className="font-mono font-bold tabular-nums text-stone-900">
                  {formatRupiah(v.dailyRate)}
                </div>
              </div>
              <div>
                <div className="text-stone-500">Overtime / Jam</div>
                <div className="font-mono font-semibold tabular-nums text-stone-700">
                  {formatRupiah(v.overtimeHourlyRate)}
                </div>
              </div>
              <div className="col-span-2 text-stone-500">
                Odometer terakhir:{' '}
                <span className="font-mono font-medium tabular-nums text-stone-800">
                  {v.lastOdometerKm.toLocaleString('id-ID')} km
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Contracts List */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <h3 className="text-sm font-bold text-stone-900">
            Daftar Kontrak Peminjaman & Pengembalian ({contracts.length})
          </h3>
        </div>
        <div className="divide-y divide-stone-100">
          {contracts.map((c) => {
            const waUrl = buildDirectWaLink(
              c.customerPhone,
              buildGenericBookingWaMessage({
                businessName: tenant.name,
                customerName: c.customerName,
                bookingRef: c.contractNumber,
                summaryLine: `Unit ${c.vehicleLabel}, jadwal kembali ${c.plannedReturnDateTime}.`,
                totalAmount: c.totalAmount,
              })
            );
            return (
              <div
                key={c.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">
                      {c.contractNumber}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        c.status === 'RETURNED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.status === 'OVERDUE'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {c.status === 'RETURNED'
                        ? 'Selesai Kembali'
                        : c.status === 'OVERDUE'
                        ? 'Overtime / Terlambat'
                        : 'Sedang Dipinjam'}
                    </span>
                    <span className="text-xs text-stone-500">
                      Berkas KYC: {c.kycUploads.length} file
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {c.customerName} · {c.vehicleLabel}
                  </div>
                  <div className="text-xs text-stone-600">
                    Mulai: <span className="font-mono">{c.startDateTime}</span> · Rencana Kembali:{' '}
                    <span className="font-mono">{c.plannedReturnDateTime}</span> · BBM Awal:{' '}
                    <span className="font-semibold">{c.fuelLevelStart}</span> · KM Awal:{' '}
                    <span className="font-mono tabular-nums">{c.odometerStartKm.toLocaleString('id-ID')}</span>
                  </div>
                  {c.kycUploads.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {c.kycUploads.map((doc, idx) => (
                        <span
                          key={`${c.id}-kyc-${idx}`}
                          className="inline-flex items-center gap-1 rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-700"
                        >
                          <ShieldCheck className="h-3 w-3 text-emerald-600" strokeWidth={1.75} />
                          {doc.docType}: {doc.fileName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-2 text-right">
                    <div className="text-[11px] text-stone-500">Total Tagihan</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-stone-900">
                      {formatRupiah(c.totalAmount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrintContract(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Cetak Kontrak
                  </button>
                  {c.status !== 'RETURNED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReturnTarget(c);
                        setOdometerEnd(String(c.odometerStartKm + 180));
                        setFuelEnd(c.fuelLevelStart);
                        setOvertimeHours('0');
                        setDamageFee('0');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Fuel className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Cek Kembali & Hitung Overtime
                    </button>
                  )}
                  {waStatus.isReady && waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                      WA Penyewa
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Rental Contract Form Modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleCreateContract}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Buat Kontrak Peminjaman & Upload Syarat KYC
              </h3>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {formError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {formError}
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Pilih Armada
                </label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.plateNumber}) - {formatRupiah(v.dailyRate)}/hari [{v.status}]
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Nama Lengkap Penyewa
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Reza Pratama"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Nomor WhatsApp Penyewa
                </label>
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
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  NIK KTP Penyewa
                </label>
                <input
                  type="text"
                  required
                  value={customerNik}
                  onChange={(e) => setCustomerNik(e.target.value)}
                  placeholder="16 digit NIK"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Nomor SIM A / SIM C
                </label>
                <input
                  type="text"
                  value={customerSim}
                  onChange={(e) => setCustomerSim(e.target.value)}
                  placeholder="SIM-A-xxxx"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Waktu Mulai Pinjam
                </label>
                <input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Rencana Waktu Kembali
                </label>
                <input
                  type="datetime-local"
                  value={plannedReturnDateTime}
                  onChange={(e) => setPlannedReturnDateTime(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Durasi Sewa (Hari)
                </label>
                <input
                  type="number"
                  min="1"
                  value={daysCount}
                  onChange={(e) => setDaysCount(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Uang Jaminan / Deposit (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Posisi Bensin (BBM) Awal
                </label>
                <select
                  value={fuelLevelStart}
                  onChange={(e) =>
                    setFuelLevelStart(e.target.value as RentalContract['fuelLevelStart'])
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="FULL">Penuh (FULL)</option>
                  <option value="THREE_QUARTER">3/4 Tangki</option>
                  <option value="HALF">1/2 Tangki</option>
                  <option value="QUARTER">1/4 Tangki</option>
                  <option value="EMPTY">Hampir Kosong</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Kilometer (KM) Awal
                </label>
                <input
                  type="number"
                  min="0"
                  value={odometerStartKm}
                  onChange={(e) => setOdometerStartKm(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>

              {/* KYC Upload Section */}
              <div className="sm:col-span-2 rounded-lg border border-stone-200 bg-stone-50 p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-stone-800">
                  <Upload className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
                  Upload Bukti Syarat Peminjaman (KTP, SIM, Foto Serah Terima)
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <label className="cursor-pointer rounded-lg border border-dashed border-stone-300 bg-white p-2.5 text-center text-xs hover:border-emerald-500">
                    <span className="block font-semibold text-stone-800">Foto e-KTP</span>
                    <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                      {ktpFileName || 'Pilih file gambar/PDF'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFilePick(e, setKtpFileName)}
                    />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-dashed border-stone-300 bg-white p-2.5 text-center text-xs hover:border-emerald-500">
                    <span className="block font-semibold text-stone-800">Foto SIM A/C</span>
                    <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                      {simFileName || 'Pilih file gambar/PDF'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => handleFilePick(e, setSimFileName)}
                    />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-dashed border-stone-300 bg-white p-2.5 text-center text-xs hover:border-emerald-500">
                    <span className="block font-semibold text-stone-800">Foto Serah Terima</span>
                    <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                      {handoverFileName || 'Pilih foto body/BBM'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFilePick(e, setHandoverFileName)}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan & Terbitkan Kontrak
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Return & Overtime / Fuel Calculator Modal */}
      {returnTarget && returnCalc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Pengembalian Unit: {returnTarget.contractNumber}
              </h3>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Waktu Kembali Aktual
                </label>
                <input
                  type="datetime-local"
                  value={actualReturnTime}
                  onChange={(e) => setActualReturnTime(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Kelebihan Jam (Overtime)
                </label>
                <input
                  type="number"
                  min="0"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Bensin (BBM) Saat Kembali (Awal: {returnTarget.fuelLevelStart})
                </label>
                <select
                  value={fuelEnd}
                  onChange={(e) =>
                    setFuelEnd(e.target.value as RentalContract['fuelLevelStart'])
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="FULL">Penuh (FULL)</option>
                  <option value="THREE_QUARTER">3/4 Tangki</option>
                  <option value="HALF">1/2 Tangki</option>
                  <option value="QUARTER">1/4 Tangki</option>
                  <option value="EMPTY">Hampir Kosong</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  KM Akhir (Awal: {returnTarget.odometerStartKm.toLocaleString('id-ID')})
                </label>
                <input
                  type="number"
                  value={odometerEnd}
                  onChange={(e) => setOdometerEnd(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Biaya Kerusakan / Cuci Tambahan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={damageFee}
                  onChange={(e) => setDamageFee(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-600">Biaya Sewa Dasar</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatRupiah(returnTarget.baseRentalFee)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Denda Overtime ({overtimeHours} jam)</span>
                <span className="font-mono font-semibold tabular-nums text-amber-700">
                  {formatRupiah(returnCalc.overtimeFee)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Denda Selisih Bensin ({returnCalc.fuelDeficitSteps} bar)</span>
                <span className="font-mono font-semibold tabular-nums text-amber-700">
                  {formatRupiah(returnCalc.fuelPenaltyFee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-bold text-stone-900">
                <span>Total Akhir Tagihan</span>
                <span className="font-mono tabular-nums">{formatRupiah(returnCalc.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Sisa Bayar (Setelah Potong Deposit {formatRupiah(returnTarget.depositAmount)})</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatRupiah(returnCalc.balanceDueAfterDeposit)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCompleteReturn}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Selesaikan Pengembalian & Catat Kas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instant Printable Rental Contract Modal */}
      {printContract && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/55 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Surat Perjanjian Sewa Kendaraan ({printContract.contractNumber})
                </h3>
                <p className="text-xs text-stone-500">
                  Siap cetak ke PDF atau unduh dokumen resmi untuk ditandatangani penyewa.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const frame = document.getElementById('rental-contract-iframe') as HTMLIFrameElement | null;
                    if (frame?.contentWindow) {
                      frame.contentWindow.print();
                    } else {
                      window.print();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Cetak / Simpan PDF
                </button>
                <button
                  type="button"
                  onClick={handleDownloadContractHtml}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Unduh Dokumen
                </button>
                <button
                  type="button"
                  onClick={() => setPrintContract(null)}
                  className="rounded-lg border border-stone-200 bg-white p-1.5 text-stone-600 hover:bg-stone-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-stone-100 p-4">
              <iframe
                id="rental-contract-iframe"
                title="Pratinjau Kontrak Rental"
                srcDoc={printableHtml}
                className="h-[68vh] w-full rounded-lg border border-stone-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HomestayVillaModule() {
  const { activeWorkspace, updateVerticalOps, regionalTaxRegistry } = useApp();
  const tenant = activeWorkspace.tenant;
  const ops = activeWorkspace.verticalOps ?? {};
  const units = ops.homestayUnits ?? [];
  const bookings = ops.homestayBookings ?? [];
  const waStatus = checkDirectWaReadiness(tenant.settings.businessWhatsappNumber);

  const regionalTaxInfo = resolveEffectiveRegionalTax({
    vertical: 'HOMESTAY_VILLA',
    regionalSettings: tenant.settings.regionalTax,
    registry: regionalTaxRegistry,
  });

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingMode, setBookingMode] = useState<'NIGHTLY' | 'HOURLY_SLOT'>('NIGHTLY');
  const [checkInDate, setCheckInDate] = useState('2026-11-23');
  const [checkOutDate, setCheckOutDate] = useState('2026-11-25');
  const [unitsCount, setUnitsCount] = useState('2');
  const [otaChannel, setOtaChannel] = useState<HomestayBooking['otaChannel']>('TRAVELOKA');
  const [otaRatePct, setOtaRatePct] = useState('15');

  const selectedUnit = units.find((u) => u.id === unitId) ?? units[0];
  const liveCalc = useMemo(() => {
    const rate =
      bookingMode === 'NIGHTLY'
        ? selectedUnit?.nightlyRate ?? '1000000'
        : selectedUnit?.hourlySlotRate ?? '350000';
    return calculateHomestaySettlement({
      ratePerUnit: rate,
      unitsCount: Math.max(1, Number(unitsCount) || 1),
      otaChannel,
      otaCommissionRate: otaChannel === 'DIRECT' ? '0' : String((Number(otaRatePct) || 0) / 100),
      pbjtHotelRate: regionalTaxInfo.applies ? regionalTaxInfo.rate : '0',
    });
  }, [bookingMode, otaChannel, otaRatePct, regionalTaxInfo.applies, regionalTaxInfo.rate, selectedUnit, unitsCount]);

  const totals = useMemo(() => {
    return bookings.reduce(
      (acc, b) => ({
        gross: acc.gross.plus(new Decimal(b.grossRoomRevenue || '0')),
        ota: acc.ota.plus(new Decimal(b.otaCommissionAmount || '0')),
        pbjt: acc.pbjt.plus(new Decimal(b.pbjtHotelTaxAmount || '0')),
        net: acc.net.plus(new Decimal(b.netOwnerRevenue || '0')),
      }),
      {
        gross: new Decimal(0),
        ota: new Decimal(0),
        pbjt: new Decimal(0),
        net: new Decimal(0),
      }
    );
  }, [bookings]);

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnit || !guestName.trim()) return;
    const newBooking: HomestayBooking = {
      id: `hsb-${Date.now()}`,
      bookingCode: `HS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
        bookings.length + 1
      ).padStart(3, '0')}`,
      unitId: selectedUnit.id,
      unitName: selectedUnit.unitName,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || '0812-0000-0000',
      bookingMode,
      checkInDate,
      checkOutDate,
      nightsOrSlots: Math.max(1, Number(unitsCount) || 1),
      otaChannel,
      grossRoomRevenue: liveCalc.grossRoomRevenue,
      otaCommissionRate: liveCalc.otaCommissionRate,
      otaCommissionAmount: liveCalc.otaCommissionAmount,
      pbjtHotelTaxRate: liveCalc.pbjtHotelTaxRate,
      pbjtHotelTaxAmount: liveCalc.pbjtHotelTaxAmount,
      netOwnerRevenue: liveCalc.netOwnerRevenue,
      status: 'BOOKED',
      createdAt: new Date().toISOString(),
    };

    updateVerticalOps(
      (prev) => ({
        ...prev,
        homestayBookings: [newBooking, ...(prev.homestayBookings ?? [])],
      }),
      {
        grossAmount: liveCalc.grossRoomRevenue,
        pbjtAmount: liveCalc.pbjtHotelTaxAmount,
        otaCommissionAmount: liveCalc.otaCommissionAmount,
        description: `Booking ${newBooking.bookingCode} ${selectedUnit.unitName} (${otaChannel})`,
      }
    );
    setShowBookingForm(false);
    setGuestName('');
    setGuestPhone('');
  };

  const advanceBookingStatus = (booking: HomestayBooking, nextStatus: HomestayBooking['status']) => {
    updateVerticalOps((prev) => ({
      ...prev,
      homestayBookings: (prev.homestayBookings ?? []).map((b) =>
        b.id === booking.id ? { ...b, status: nextStatus } : b
      ),
      homestayUnits: (prev.homestayUnits ?? []).map((u) => {
        if (u.id !== booking.unitId) return u;
        if (nextStatus === 'CHECK_IN') return { ...u, status: 'OCCUPIED' };
        if (nextStatus === 'CLEANING') return { ...u, status: 'CLEANING' };
        if (nextStatus === 'CHECK_OUT') return { ...u, status: 'AVAILABLE' };
        return u;
      }),
    }));
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip: Strict separation of PBJT Hotel Tax vs Net Owner Revenue */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Omzet Kotor Kamar/Villa</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-stone-900">
            {formatRupiah(totals.gross)}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Potongan Komisi OTA</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-amber-700">
            -{formatRupiah(totals.ota)}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500">Traveloka / Airbnb / Tiket.com</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-xs font-semibold text-emerald-800">
            Titipan PBJT Perhotelan ({regionalTaxInfo.applies ? `${Number(regionalTaxInfo.rate) * 100}%` : 'Bebas'})
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-900">
            {formatRupiah(totals.pbjt)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-700">
            Dipisah otomatis dari omzet pemilik ({regionalTaxInfo.cityName})
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Pendapatan Bersih Pemilik</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-700">
            {formatRupiah(totals.net)}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500">Di luar PBJT Daerah & Komisi OTA</div>
        </div>
      </div>

      {/* Unit Status Board */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-stone-900">Daftar Kamar & Villa</h2>
        <button
          type="button"
          onClick={() => setShowBookingForm(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Tambah Booking Tamu
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {units.map((u) => (
          <div key={u.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-stone-900">{u.unitName}</div>
                <div className="text-xs text-stone-500">{u.unitType}</div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  u.status === 'AVAILABLE'
                    ? 'bg-emerald-50 text-emerald-700'
                    : u.status === 'OCCUPIED'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-sky-50 text-sky-700'
                }`}
              >
                {u.status === 'AVAILABLE'
                  ? 'Siap Huni'
                  : u.status === 'OCCUPIED'
                  ? 'Check-In'
                  : 'Cleaning'}
              </span>
            </div>
            <div className="mt-3 flex justify-between border-t border-stone-100 pt-2.5 text-xs">
              <span className="text-stone-500">Tarif / Malam</span>
              <span className="font-mono font-bold tabular-nums text-stone-900">
                {formatRupiah(u.nightlyRate)}
              </span>
            </div>
            {u.hourlySlotRate && (
              <div className="mt-1 flex justify-between text-xs">
                <span className="text-stone-500">Slot Transit / Jam</span>
                <span className="font-mono font-semibold tabular-nums text-stone-700">
                  {formatRupiah(u.hourlySlotRate)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bookings Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <h3 className="text-sm font-bold text-stone-900">
            Jadwal Reservasi Tamu, OTA & Pemisahan PBJT Perhotelan ({bookings.length})
          </h3>
        </div>
        <div className="divide-y divide-stone-100">
          {bookings.map((b) => {
            const waUrl = buildDirectWaLink(
              b.guestPhone,
              buildGenericBookingWaMessage({
                businessName: tenant.name,
                customerName: b.guestName,
                bookingRef: b.bookingCode,
                summaryLine: `${b.unitName} (${b.checkInDate} s/d ${b.checkOutDate}, ${b.nightsOrSlots} ${
                  b.bookingMode === 'NIGHTLY' ? 'malam' : 'slot jam'
                }).`,
                totalAmount: new Decimal(b.grossRoomRevenue).plus(b.pbjtHotelTaxAmount).toFixed(0),
              })
            );
            return (
              <div
                key={b.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">{b.bookingCode}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                      {b.otaChannel}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {b.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {b.guestName} · {b.unitName}
                  </div>
                  <div className="text-xs text-stone-600">
                    {b.checkInDate} s/d {b.checkOutDate} ({b.nightsOrSlots}{' '}
                    {b.bookingMode === 'NIGHTLY' ? 'malam' : 'slot jam'})
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs">
                    <span>
                      Kamar:{' '}
                      <strong className="font-mono tabular-nums">
                        {formatRupiah(b.grossRoomRevenue)}
                      </strong>
                    </span>
                    <span className="text-amber-700">
                      Komisi OTA:{' '}
                      <strong className="font-mono tabular-nums">
                        -{formatRupiah(b.otaCommissionAmount)}
                      </strong>
                    </span>
                    <span className="text-emerald-800">
                      PBJT Daerah:{' '}
                      <strong className="font-mono tabular-nums">
                        {formatRupiah(b.pbjtHotelTaxAmount)}
                      </strong>
                    </span>
                    <span className="text-stone-900">
                      Net Pemilik:{' '}
                      <strong className="font-mono tabular-nums text-emerald-700">
                        {formatRupiah(b.netOwnerRevenue)}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.status === 'BOOKED' && (
                    <button
                      type="button"
                      onClick={() => advanceBookingStatus(b, 'CHECK_IN')}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Check-In
                    </button>
                  )}
                  {b.status === 'CHECK_IN' && (
                    <button
                      type="button"
                      onClick={() => advanceBookingStatus(b, 'CLEANING')}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Check-Out & Cleaning
                    </button>
                  )}
                  {b.status === 'CLEANING' && (
                    <button
                      type="button"
                      onClick={() => advanceBookingStatus(b, 'CHECK_OUT')}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Selesai Bersih (Siap Huni)
                    </button>
                  )}
                  {waStatus.isReady && waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                      WA Tamu
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Homestay Booking Modal */}
      {showBookingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleAddBooking}
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">Catat Booking Homestay / Villa</h3>
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Unit Kamar / Villa</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitName} ({formatRupiah(u.nightlyRate)}/malam)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Tamu</label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp Tamu</label>
                <input
                  type="text"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="0812-xxxx-xxxx"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Mode Sewa</label>
                <select
                  value={bookingMode}
                  onChange={(e) => setBookingMode(e.target.value as 'NIGHTLY' | 'HOURLY_SLOT')}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="NIGHTLY">Per Malam</option>
                  <option value="HOURLY_SLOT">Per Slot Jam (Transit)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Jumlah {bookingMode === 'NIGHTLY' ? 'Malam' : 'Slot Jam'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={unitsCount}
                  onChange={(e) => setUnitsCount(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Check-In</label>
                <input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Check-Out</label>
                <input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Channel Pemesanan</label>
                <select
                  value={otaChannel}
                  onChange={(e) => setOtaChannel(e.target.value as HomestayBooking['otaChannel'])}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="DIRECT">Langsung / Walk-in (0% Komisi)</option>
                  <option value="TRAVELOKA">Traveloka</option>
                  <option value="AIRBNB">Airbnb</option>
                  <option value="TIKET_COM">Tiket.com</option>
                  <option value="BOOKING_COM">Booking.com</option>
                </select>
              </div>
              {otaChannel !== 'DIRECT' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">
                    Komisi OTA (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={otaRatePct}
                    onChange={(e) => setOtaRatePct(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                  />
                </div>
              )}
            </div>

            {/* Live Financial Breakdown */}
            <div className="mt-4 space-y-1 rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-600">Harga Sewa Kamar</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatRupiah(liveCalc.grossRoomRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Potongan Komisi OTA ({otaChannel})</span>
                <span className="font-mono font-semibold tabular-nums">
                  -{formatRupiah(liveCalc.otaCommissionAmount)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-800">
                <span>PBJT Perhotelan ({regionalTaxInfo.cityName}) - Terpisah</span>
                <span className="font-mono font-semibold tabular-nums">
                  +{formatRupiah(liveCalc.pbjtHotelTaxAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-bold text-stone-900">
                <span>Pendapatan Bersih Pemilik</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatRupiah(liveCalc.netOwnerRevenue)}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan Booking & Catat Jurnal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function SewaLapanganModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const tenant = activeWorkspace.tenant;
  const ops = activeWorkspace.verticalOps ?? {};
  const courts = ops.sportsCourts ?? [];
  const bookings = ops.courtBookings ?? [];
  const waStatus = checkDirectWaReadiness(tenant.settings.businessWhatsappNumber);

  const [sportFilter, setSportFilter] = useState<'ALL' | 'BADMINTON' | 'FUTSAL' | 'PADEL'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const [courtId, setCourtId] = useState(courts[0]?.id ?? '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [bookingDate, setBookingDate] = useState('2026-11-22');
  const [startHour, setStartHour] = useState('19:00');
  const [endHour, setEndHour] = useState('21:00');
  const [equipmentFee, setEquipmentFee] = useState('45000');
  const [dpAmount, setDpAmount] = useState('100000');

  const filteredBookings = bookings.filter((b) => {
    if (sportFilter === 'ALL') return true;
    const court = courts.find((c) => c.id === b.courtId);
    return court?.sportType === sportFilter;
  });

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setConflictMsg(null);
    const chosenCourt = courts.find((c) => c.id === courtId) ?? courts[0];
    if (!chosenCourt || !customerName.trim()) return;

    if (
      hasCourtSlotConflict({
        existingBookings: bookings,
        courtId: chosenCourt.id,
        bookingDate,
        startHour,
        endHour,
      })
    ) {
      setConflictMsg(
        `Jadwal bentrok! ${chosenCourt.name} pada ${bookingDate} jam ${startHour}-${endHour} sudah dipesan.`
      );
      return;
    }

    const calc = calculateCourtBookingAmounts({
      hourlyRate: chosenCourt.hourlyRate,
      startHour,
      endHour,
      equipmentFee: equipmentFee || '0',
      dpAmount: dpAmount || '0',
    });

    const newBooking: CourtBooking = {
      id: `cb-${Date.now()}`,
      courtId: chosenCourt.id,
      courtName: chosenCourt.name,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || '0812-0000-0000',
      bookingDate,
      startHour,
      endHour,
      courtFee: calc.courtFee,
      equipmentFee: new Decimal(equipmentFee || '0').toFixed(4),
      dpAmount: new Decimal(dpAmount || '0').toFixed(4),
      remainingBalance: calc.remainingBalance,
      status: Number(calc.remainingBalance) <= 0 ? 'PAID' : 'DP_PAID',
      createdAt: new Date().toISOString(),
    };

    updateVerticalOps(
      (prev) => ({
        ...prev,
        courtBookings: [newBooking, ...(prev.courtBookings ?? [])],
      }),
      Number(dpAmount) > 0
        ? {
            grossAmount: dpAmount,
            description: `DP Booking ${chosenCourt.name} (${customerName.trim()} · ${bookingDate} ${startHour}-${endHour})`,
          }
        : undefined
    );
    setShowForm(false);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleSettleBooking = (booking: CourtBooking) => {
    const remaining = booking.remainingBalance;
    updateVerticalOps(
      (prev) => ({
        ...prev,
        courtBookings: (prev.courtBookings ?? []).map((b) =>
          b.id === booking.id
            ? {
                ...b,
                dpAmount: new Decimal(b.courtFee).plus(b.equipmentFee).toFixed(4),
                remainingBalance: '0.0000',
                status: 'PAID',
              }
            : b
        ),
      }),
      Number(remaining) > 0
        ? {
            grossAmount: remaining,
            description: `Pelunasan Sewa ${booking.courtName} (${booking.customerName})`,
          }
        : undefined
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', 'BADMINTON', 'FUTSAL', 'PADEL'] as const).map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSportFilter(sp)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                sportFilter === sp
                  ? 'bg-emerald-600 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {sp === 'ALL' ? 'Semua Lapangan' : sp}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setConflictMsg(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Booking Slot Lapangan
        </button>
      </div>

      {/* Courts Overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        {courts.map((c) => (
          <div key={c.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {c.sportType}
            </div>
            <div className="mt-0.5 text-sm font-bold text-stone-900">{c.name}</div>
            <div className="mt-2 font-mono text-sm font-bold tabular-nums text-stone-800">
              {formatRupiah(c.hourlyRate)}
              <span className="font-sans text-xs font-normal text-stone-500"> / jam</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bookings List */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <h3 className="text-sm font-bold text-stone-900">
            Jadwal Main & Pembayaran DP / Pelunasan ({filteredBookings.length})
          </h3>
        </div>
        <div className="divide-y divide-stone-100">
          {filteredBookings.map((b) => {
            const total = new Decimal(b.courtFee).plus(b.equipmentFee).toFixed(0);
            const waUrl = buildDirectWaLink(
              b.customerPhone,
              buildGenericBookingWaMessage({
                businessName: tenant.name,
                customerName: b.customerName,
                bookingRef: `${b.courtName} (${b.bookingDate})`,
                summaryLine: `Jam main ${b.startHour}-${b.endHour}. Sisa bayar: ${formatRupiah(b.remainingBalance)}.`,
                totalAmount: total,
              })
            );
            return (
              <div
                key={b.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-stone-900">{b.courtName}</span>
                    <span className="font-mono text-xs font-semibold text-stone-700">
                      {b.bookingDate} · {b.startHour}-{b.endHour}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        b.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {b.status === 'PAID' ? 'Lunas' : 'DP Masuk'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600">
                    Pemesan: <strong>{b.customerName}</strong> ({b.customerPhone}) · Sewa Lapangan{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(b.courtFee)}</span> · Alat/Kantin{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(b.equipmentFee)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-right">
                    <div className="text-[11px] text-stone-500">Sisa Bayar</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-stone-900">
                      {formatRupiah(b.remainingBalance)}
                    </div>
                  </div>
                  {b.status !== 'PAID' && (
                    <button
                      type="button"
                      onClick={() => handleSettleBooking(b)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Tandai Lunas
                    </button>
                  )}
                  {waStatus.isReady && waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} />
                      WA
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Court Booking Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleAddBooking}
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Booking Lapangan (Cek Bentrok Otomatis)
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {conflictMsg && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {conflictMsg}
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">Lapangan</label>
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.sportType}) - {formatRupiah(c.hourlyRate)}/jam
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Pemesan / Tim</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Tanggal Main</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Jam Mulai</label>
                  <input
                    type="time"
                    value={startHour}
                    onChange={(e) => setStartHour(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Jam Selesai</label>
                  <input
                    type="time"
                    value={endHour}
                    onChange={(e) => setEndHour(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-2 font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Sewa Raket / Kok / Kantin (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={equipmentFee}
                  onChange={(e) => setEquipmentFee(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">DP Dibayar (Rp)</label>
                <input
                  type="number"
                  min="0"
                  value={dpAmount}
                  onChange={(e) => setDpAmount(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan Jadwal Booking
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function SewaGarasiModule() {
  const { activeWorkspace, updateVerticalOps } = useApp();
  const tenant = activeWorkspace.tenant;
  const ops = activeWorkspace.verticalOps ?? {};
  const slots = ops.garageSlots ?? [];
  const waStatus = checkDirectWaReadiness(tenant.settings.businessWhatsappNumber);

  const [assignSlot, setAssignSlot] = useState<GarageSlot | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [dueDate, setDueDate] = useState('2026-12-01');

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignSlot || !tenantName.trim() || !plateNumber.trim()) return;
    updateVerticalOps(
      (prev) => ({
        ...prev,
        garageSlots: (prev.garageSlots ?? []).map((s) =>
          s.id === assignSlot.id
            ? {
                ...s,
                status: 'OCCUPIED',
                tenantName: tenantName.trim(),
                tenantPhone: tenantPhone.trim(),
                plateNumber: plateNumber.trim().toUpperCase(),
                vehicleModel: vehicleModel.trim(),
                nextDueDate: dueDate,
                paymentStatus: 'PAID',
              }
            : s
        ),
      }),
      {
        grossAmount: assignSlot.monthlyRate,
        description: `Sewa Garasi ${assignSlot.slotCode} (${tenantName.trim()} - ${plateNumber.trim().toUpperCase()})`,
      }
    );
    setAssignSlot(null);
    setTenantName('');
    setTenantPhone('');
    setPlateNumber('');
    setVehicleModel('');
  };

  const handleMarkPaid = (slot: GarageSlot) => {
    updateVerticalOps(
      (prev) => ({
        ...prev,
        garageSlots: (prev.garageSlots ?? []).map((s) =>
          s.id === slot.id ? { ...s, paymentStatus: 'PAID' } : s
        ),
      }),
      {
        grossAmount: slot.monthlyRate,
        description: `Pembayaran Sewa Garasi ${slot.slotCode} (${slot.tenantName})`,
      }
    );
  };

  const handleReleaseSlot = (slot: GarageSlot) => {
    updateVerticalOps((prev) => ({
      ...prev,
      garageSlots: (prev.garageSlots ?? []).map((s) =>
        s.id === slot.id
          ? {
              ...s,
              status: 'AVAILABLE',
              tenantName: undefined,
              tenantPhone: undefined,
              plateNumber: undefined,
              vehicleModel: undefined,
              nextDueDate: undefined,
              paymentStatus: undefined,
            }
          : s
      ),
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-stone-900">Peta Slot Garasi & Penagihan Bulanan</h2>
        <p className="text-xs text-stone-600">
          Pantau slot terisi/kosong, nomor plat mobil penyewa, jatuh tempo, dan kirim pengingat WA langsung.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((s) => {
          const waUrl =
            s.tenantPhone && s.tenantName
              ? buildDirectWaLink(
                  s.tenantPhone,
                  buildDueReminderWaMessage({
                    businessName: tenant.name,
                    customerName: s.tenantName,
                    itemLabel: `Sewa Garasi Slot ${s.slotCode} (${s.plateNumber ?? ''})`,
                    dueDate: s.nextDueDate ?? 'Bulan ini',
                    amountDue: s.monthlyRate,
                  })
                )
              : null;

          return (
            <div key={s.id} className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-bold text-stone-900">
                      Slot {s.slotCode}
                    </div>
                    <div className="text-xs text-stone-500">{s.slotType}</div>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      s.status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : s.paymentStatus === 'OVERDUE'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {s.status === 'AVAILABLE'
                      ? 'Kosong'
                      : s.paymentStatus === 'OVERDUE'
                      ? 'Jatuh Tempo'
                      : 'Terisi · Lunas'}
                  </span>
                </div>

                {s.status === 'OCCUPIED' ? (
                  <div className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs">
                    <div className="font-semibold text-stone-900">{s.tenantName}</div>
                    <div className="font-mono text-stone-700">
                      {s.plateNumber} · {s.vehicleModel}
                    </div>
                    <div className="text-stone-500">Jatuh tempo: {s.nextDueDate}</div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
                    Siap disewakan bulanan atau harian.
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                <div className="font-mono text-xs font-bold tabular-nums text-stone-900">
                  {formatRupiah(s.monthlyRate)}/bln
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.status === 'AVAILABLE' ? (
                    <button
                      type="button"
                      onClick={() => setAssignSlot(s)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Isi Penyewa
                    </button>
                  ) : (
                    <>
                      {s.paymentStatus !== 'PAID' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(s)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Lunas
                        </button>
                      )}
                      {waStatus.isReady && waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                        >
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                          WA
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReleaseSlot(s)}
                        className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
                      >
                        Kosongkan
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {assignSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleAssignSubmit}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-bold text-stone-900">
              Isi Penyewa Slot {assignSlot.slotCode}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Nama Penyewa</label>
                <input
                  type="text"
                  required
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">No. WhatsApp</label>
                <input
                  type="text"
                  value={tenantPhone}
                  onChange={(e) => setTenantPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Plat Nomor</label>
                  <input
                    type="text"
                    required
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    placeholder="B 1234 XYZ"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Jenis Mobil</label>
                  <input
                    type="text"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="Honda Brio"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">Jatuh Tempo Berikutnya</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignSlot(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan & Terima Sewa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
