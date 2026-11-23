import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  Download,
  FileText,
  Fuel,
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

function formatHourRange(startHour: number, durationHours: number): string {
  const s = `${String(startHour).padStart(2, '0')}:00`;
  const e = `${String((startHour + durationHours) % 24).padStart(2, '0')}:00`;
  return `${s} - ${e}`;
}

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
  const availableVehicles = vehicles.filter((v) => v.status === 'TERSEDIA');
  const [vehicleId, setVehicleId] = useState(availableVehicles[0]?.id ?? vehicles[0]?.id ?? '');
  const [renterName, setRenterName] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [renterNik, setRenterNik] = useState('');
  const [renterAddress, setRenterAddress] = useState('');
  const [startDateTime, setStartDateTime] = useState('2026-11-22T09:00');
  const [plannedReturnDateTime, setPlannedReturnDateTime] = useState('2026-11-23T09:00');
  const [daysCount, setDaysCount] = useState('1');
  const [depositAmount, setDepositAmount] = useState('300000');
  const [fuelStartPct, setFuelStartPct] = useState('100');
  const [kmStart, setKmStart] = useState('25000');
  const [ktpFileName, setKtpFileName] = useState('');
  const [simFileName, setSimFileName] = useState('');
  const [handoverFileName, setHandoverFileName] = useState('');

  // Return calculator state
  const [actualReturnTime, setActualReturnTime] = useState('2026-11-23T12:00');
  const [fuelEndPct, setFuelEndPct] = useState('70');
  const [kmEnd, setKmEnd] = useState('25320');

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
    if (!renterName.trim() || !renterPhone.trim() || !renterNik.trim()) {
      setFormError('Nama penyewa, nomor WhatsApp, dan NIK KTP wajib diisi.');
      return;
    }
    const baseAmount = new Decimal(chosenVehicle.dailyRate)
      .times(Math.max(1, Number(daysCount) || 1))
      .toFixed(4);
    const contractNum = `RNT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(
      contracts.length + 1
    ).padStart(3, '0')}`;

    const newContract: RentalContract = {
      id: `rnt-${Date.now()}`,
      contractNumber: contractNum,
      vehicleId: chosenVehicle.id,
      vehicleName: chosenVehicle.name,
      plateNumber: chosenVehicle.plateNumber,
      renterName: renterName.trim(),
      renterNik: renterNik.trim(),
      renterPhone: renterPhone.trim(),
      renterAddress: renterAddress.trim() || 'Sesuai KTP penyewa',
      startDateTime: startDateTime.replace('T', ' '),
      plannedReturnDateTime: plannedReturnDateTime.replace('T', ' '),
      actualReturnDateTime: null,
      kmStart: Number(kmStart) || chosenVehicle.lastOdometerKm,
      kmEnd: null,
      fuelStartPct: Math.max(0, Math.min(100, Number(fuelStartPct) || 100)),
      fuelEndPct: null,
      fuelPenaltyAmount: '0.0000',
      overtimeHours: 0,
      overtimeChargeAmount: '0.0000',
      baseRentalAmount: baseAmount,
      depositAmount: new Decimal(depositAmount || '0').toFixed(4),
      totalFinalAmount: baseAmount,
      kycIdPhotoUrl: ktpFileName || undefined,
      kycSimPhotoUrl: simFileName || undefined,
      handoverPhotoUrl: handoverFileName || undefined,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    updateVerticalOps((prev) => ({
      ...prev,
      rentalVehicles: (prev.rentalVehicles ?? []).map((v) =>
        v.id === chosenVehicle.id ? { ...v, status: 'DISEWA' } : v
      ),
      rentalContracts: [newContract, ...(prev.rentalContracts ?? [])],
    }));

    setShowNewForm(false);
    setRenterName('');
    setRenterPhone('');
    setRenterNik('');
    setRenterAddress('');
    setKtpFileName('');
    setSimFileName('');
    setHandoverFileName('');
    setPrintContract(newContract);
  };

  const returnCalc = useMemo(() => {
    if (!returnTarget) return null;
    const veh = vehicles.find((v) => v.id === returnTarget.vehicleId);
    const fuelPer10Pct = veh?.vehicleCategory === 'MOTOR' ? '10000' : '25000';
    return calculateRentalSettlement({
      baseRentalAmount: returnTarget.baseRentalAmount,
      overtimeHourlyRate: veh?.overtimeHourlyRate ?? '50000',
      plannedReturnDateTime: returnTarget.plannedReturnDateTime.replace(' ', 'T'),
      actualReturnDateTime: actualReturnTime,
      fuelStartPct: returnTarget.fuelStartPct,
      fuelEndPct: Math.max(0, Math.min(100, Number(fuelEndPct) || 0)),
      fuelPenaltyPer10Pct: fuelPer10Pct,
      depositAmount: returnTarget.depositAmount,
    });
  }, [actualReturnTime, fuelEndPct, returnTarget, vehicles]);

  const handleCompleteReturn = () => {
    if (!returnTarget || !returnCalc) return;
    updateVerticalOps(
      (prev) => ({
        ...prev,
        rentalVehicles: (prev.rentalVehicles ?? []).map((v) =>
          v.id === returnTarget.vehicleId
            ? { ...v, status: 'TERSEDIA', lastOdometerKm: Number(kmEnd) || v.lastOdometerKm }
            : v
        ),
        rentalContracts: (prev.rentalContracts ?? []).map((c) =>
          c.id === returnTarget.id
            ? {
                ...c,
                actualReturnDateTime: actualReturnTime.replace('T', ' '),
                fuelEndPct: Math.max(0, Math.min(100, Number(fuelEndPct) || 0)),
                kmEnd: Number(kmEnd) || c.kmStart,
                overtimeHours: returnCalc.overtimeHours,
                overtimeChargeAmount: returnCalc.overtimeChargeAmount,
                fuelPenaltyAmount: returnCalc.fuelPenaltyAmount,
                totalFinalAmount: returnCalc.totalFinalAmount,
                status: 'RETURNED',
              }
            : c
        ),
      }),
      {
        grossAmount: returnCalc.totalFinalAmount,
        description: `Penyelesaian Sewa Armada ${returnTarget.contractNumber} (${returnTarget.renterName})`,
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
          <h2 className="text-base font-bold text-stone-900">Status Armada Mobil &amp; Motor</h2>
          <p className="text-xs text-stone-600">
            Pantau unit tersedia, sedang disewa, kilometer terakhir, dan buat kontrak sewa baru lengkap dengan upload syarat KTP/SIM.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const defaultVeh = availableVehicles[0] ?? vehicles[0];
            setVehicleId(defaultVeh?.id ?? '');
            if (defaultVeh) setKmStart(String(defaultVeh.lastOdometerKm));
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
                  {v.plateNumber} · {v.vehicleCategory === 'MOBIL' ? 'Mobil' : 'Motor'} ({v.year})
                </div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  v.status === 'TERSEDIA'
                    ? 'bg-emerald-50 text-emerald-700'
                    : v.status === 'DISEWA'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {v.status === 'TERSEDIA'
                  ? 'Tersedia'
                  : v.status === 'DISEWA'
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
            Daftar Kontrak Peminjaman &amp; Pengembalian ({contracts.length})
          </h3>
        </div>
        <div className="divide-y divide-stone-100">
          {contracts.map((c) => {
            const kycBadges = [
              c.kycIdPhotoUrl ? { label: 'e-KTP', value: c.kycIdPhotoUrl } : null,
              c.kycSimPhotoUrl ? { label: 'SIM', value: c.kycSimPhotoUrl } : null,
              c.handoverPhotoUrl ? { label: 'Serah Terima', value: c.handoverPhotoUrl } : null,
            ].filter(Boolean) as Array<{ label: string; value: string }>;

            const waUrl = buildDirectWaLink(
              c.renterPhone,
              buildGenericBookingWaMessage({
                businessName: tenant.name,
                customerName: c.renterName,
                bookingRef: c.contractNumber,
                summaryLine: `Unit ${c.vehicleName} (${c.plateNumber}), jadwal kembali ${c.plannedReturnDateTime}.`,
                totalAmount: c.totalFinalAmount,
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
                      Syarat KYC: {kycBadges.length} berkas
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-stone-900">
                    {c.renterName} · {c.vehicleName} ({c.plateNumber})
                  </div>
                  <div className="text-xs text-stone-600">
                    Mulai: <span className="font-mono">{c.startDateTime}</span> · Rencana Kembali:{' '}
                    <span className="font-mono">{c.plannedReturnDateTime}</span> · BBM Awal:{' '}
                    <span className="font-mono font-semibold tabular-nums">{c.fuelStartPct}%</span> · KM Awal:{' '}
                    <span className="font-mono tabular-nums">{c.kmStart.toLocaleString('id-ID')}</span>
                  </div>
                  {kycBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {kycBadges.map((doc) => (
                        <span
                          key={`${c.id}-${doc.label}`}
                          className="inline-flex items-center gap-1 rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-700"
                        >
                          <ShieldCheck className="h-3 w-3 text-emerald-600" strokeWidth={1.75} />
                          {doc.label}: Terlampir
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-2 text-right">
                    <div className="text-[11px] text-stone-500">Total Tagihan</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-stone-900">
                      {formatRupiah(c.totalFinalAmount)}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid={`print-rental-contract-${c.id}`}
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
                        setKmEnd(String(c.kmStart + 180));
                        setFuelEndPct(String(Math.max(20, c.fuelStartPct - 20)));
                        setActualReturnTime(
                          c.plannedReturnDateTime.includes('T')
                            ? c.plannedReturnDateTime.slice(0, 16)
                            : c.plannedReturnDateTime.replace(' ', 'T').slice(0, 16)
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Fuel className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Cek Kembali &amp; Overtime
                    </button>
                  )}
                  {waStatus.ready && waUrl && (
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
                Buat Kontrak Peminjaman &amp; Upload Syarat KYC
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
                  onChange={(e) => {
                    setVehicleId(e.target.value);
                    const found = vehicles.find((v) => v.id === e.target.value);
                    if (found) setKmStart(String(found.lastOdometerKm));
                  }}
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
                  value={renterName}
                  onChange={(e) => setRenterName(e.target.value)}
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
                  value={renterPhone}
                  onChange={(e) => setRenterPhone(e.target.value)}
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
                  value={renterNik}
                  onChange={(e) => setRenterNik(e.target.value)}
                  placeholder="16 digit NIK"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Alamat Domisili Penyewa
                </label>
                <input
                  type="text"
                  value={renterAddress}
                  onChange={(e) => setRenterAddress(e.target.value)}
                  placeholder="Alamat sesuai KTP"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
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
                  Level Bensin (BBM) Awal (%)
                </label>
                <select
                  value={fuelStartPct}
                  onChange={(e) => setFuelStartPct(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="100">100% (Penuh)</option>
                  <option value="75">75% (3/4 Tangki)</option>
                  <option value="50">50% (1/2 Tangki)</option>
                  <option value="25">25% (1/4 Tangki)</option>
                  <option value="10">10% (Hampir Kosong)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Kilometer (KM) Awal
                </label>
                <input
                  type="number"
                  min="0"
                  value={kmStart}
                  onChange={(e) => setKmStart(e.target.value)}
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
                Simpan &amp; Terbitkan Kontrak
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
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Waktu Kembali Aktual (Batas: {returnTarget.plannedReturnDateTime})
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
                  BBM Saat Kembali % (Awal: {returnTarget.fuelStartPct}%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={fuelEndPct}
                  onChange={(e) => setFuelEndPct(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  KM Akhir (Awal: {returnTarget.kmStart.toLocaleString('id-ID')})
                </label>
                <input
                  type="number"
                  value={kmEnd}
                  onChange={(e) => setKmEnd(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5 rounded-lg border border-stone-200 bg-stone-50 p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-600">Biaya Sewa Dasar</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatRupiah(returnTarget.baseRentalAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Denda Overtime ({returnCalc.overtimeHours} jam)</span>
                <span className="font-mono font-semibold tabular-nums text-amber-700">
                  {formatRupiah(returnCalc.overtimeChargeAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">
                  Denda Selisih Bensin (-{returnCalc.fuelShortagePct}%)
                </span>
                <span className="font-mono font-semibold tabular-nums text-amber-700">
                  {formatRupiah(returnCalc.fuelPenaltyAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-bold text-stone-900">
                <span>Total Akhir Tagihan</span>
                <span className="font-mono tabular-nums">{formatRupiah(returnCalc.totalFinalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Deposit Dikembalikan (Dari {formatRupiah(returnTarget.depositAmount)})</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatRupiah(returnCalc.depositRefundable)}
                </span>
              </div>
              {Number(returnCalc.remainingAfterDeposit) > 0 && (
                <div className="flex justify-between text-red-700">
                  <span>Tambahan Bayar Denda di Luar Deposit</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatRupiah(returnCalc.remainingAfterDeposit)}
                  </span>
                </div>
              )}
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
                Selesaikan Pengembalian &amp; Catat Kas
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
                    const frame = document.getElementById(
                      'rental-contract-iframe'
                    ) as HTMLIFrameElement | null;
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

  const regionalTaxInfo = resolveEffectiveRegionalTax(
    'HOMESTAY_VILLA',
    tenant.settings.regionalTax,
    regionalTaxRegistry
  );

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bookingMode, setBookingMode] = useState<'PER_MALAM' | 'PER_SLOT_JAM'>('PER_MALAM');
  const [checkInDate, setCheckInDate] = useState('2026-11-23');
  const [checkOutDate, setCheckOutDate] = useState('2026-11-25');
  const [durationCount, setDurationCount] = useState('2');
  const [otaChannel, setOtaChannel] = useState<HomestayBooking['otaChannel']>('TRAVELOKA');
  const [otaRatePct, setOtaRatePct] = useState('15');

  const selectedUnit = units.find((u) => u.id === unitId) ?? units[0];
  const liveCalc = useMemo(() => {
    const rate =
      bookingMode === 'PER_MALAM'
        ? selectedUnit?.nightlyRate ?? '1000000'
        : selectedUnit?.hourlySlotRate ?? '350000';
    return calculateHomestaySettlement({
      ratePerUnit: rate,
      durationCount: Math.max(1, Number(durationCount) || 1),
      otaChannel,
      otaCommissionPctOverride:
        otaChannel === 'DIRECT' ? '0' : String((Number(otaRatePct) || 0) / 100),
      pbjtRate: regionalTaxInfo.applies ? regionalTaxInfo.rateDecimal : '0',
    });
  }, [
    bookingMode,
    durationCount,
    otaChannel,
    otaRatePct,
    regionalTaxInfo.applies,
    regionalTaxInfo.rateDecimal,
    selectedUnit,
  ]);

  const totals = useMemo(() => {
    return bookings.reduce(
      (acc, b) => ({
        gross: acc.gross.plus(new Decimal(b.grossRoomRevenue || '0')),
        ota: acc.ota.plus(new Decimal(b.otaCommissionAmount || '0')),
        pbjt: acc.pbjt.plus(new Decimal(b.pbjtTaxAmount || '0')),
        net: acc.net.plus(new Decimal(b.ownerNetRevenue || '0')),
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
      unitName: selectedUnit.name,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim() || '0812-0000-0000',
      bookingMode,
      checkInDate,
      checkOutDate,
      durationCount: Math.max(1, Number(durationCount) || 1),
      otaChannel,
      otaCommissionPct: liveCalc.otaCommissionPct,
      grossRoomRevenue: liveCalc.grossRoomRevenue,
      otaCommissionAmount: liveCalc.otaCommissionAmount,
      pbjtRate: regionalTaxInfo.applies ? regionalTaxInfo.rateDecimal : '0.0000',
      pbjtTaxAmount: liveCalc.pbjtTaxAmount,
      ownerNetRevenue: liveCalc.ownerNetRevenue,
      guestTotalPaid: liveCalc.guestTotalPaid,
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
        pbjtAmount: liveCalc.pbjtTaxAmount,
        otaCommissionAmount: liveCalc.otaCommissionAmount,
        description: `Booking ${newBooking.bookingCode} ${selectedUnit.name} (${otaChannel})`,
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
        if (nextStatus === 'CHECK_IN') return { ...u, status: 'TERISI' };
        if (nextStatus === 'CLEANING') return { ...u, status: 'CLEANING' };
        if (nextStatus === 'CHECK_OUT') return { ...u, status: 'TERSEDIA' };
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
            Titipan PBJT Perhotelan ({regionalTaxInfo.applies ? regionalTaxInfo.ratePercentLabel : 'Bebas'})
          </div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-900">
            {formatRupiah(totals.pbjt)}
          </div>
          <div className="mt-0.5 text-[11px] text-emerald-700">
            Dipisah otomatis dari omzet pemilik ({regionalTaxInfo.regionName})
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Pendapatan Bersih Pemilik</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-700">
            {formatRupiah(totals.net)}
          </div>
          <div className="mt-0.5 text-[11px] text-stone-500">Di luar PBJT Daerah &amp; Komisi OTA</div>
        </div>
      </div>

      {/* Unit Status Board */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-stone-900">Daftar Kamar &amp; Villa</h2>
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
                <div className="text-sm font-bold text-stone-900">{u.name}</div>
                <div className="text-xs text-stone-500">{u.unitType.replace(/_/g, ' ')}</div>
              </div>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  u.status === 'TERSEDIA'
                    ? 'bg-emerald-50 text-emerald-700'
                    : u.status === 'TERISI'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-sky-50 text-sky-700'
                }`}
              >
                {u.status === 'TERSEDIA'
                  ? 'Siap Huni'
                  : u.status === 'TERISI'
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
            Jadwal Reservasi Tamu, OTA &amp; Pemisahan PBJT Perhotelan ({bookings.length})
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
                summaryLine: `${b.unitName} (${b.checkInDate} s/d ${b.checkOutDate}, ${b.durationCount} ${
                  b.bookingMode === 'PER_MALAM' ? 'malam' : 'slot jam'
                }).`,
                totalAmount: b.guestTotalPaid,
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
                    {b.checkInDate} s/d {b.checkOutDate} ({b.durationCount}{' '}
                    {b.bookingMode === 'PER_MALAM' ? 'malam' : 'slot jam'})
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
                        {formatRupiah(b.pbjtTaxAmount)}
                      </strong>
                    </span>
                    <span className="text-stone-900">
                      Net Pemilik:{' '}
                      <strong className="font-mono tabular-nums text-emerald-700">
                        {formatRupiah(b.ownerNetRevenue)}
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
                      Check-Out &amp; Cleaning
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
                  {waStatus.ready && waUrl && (
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
                      {u.name} ({formatRupiah(u.nightlyRate)}/malam)
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
                  onChange={(e) => setBookingMode(e.target.value as 'PER_MALAM' | 'PER_SLOT_JAM')}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="PER_MALAM">Per Malam</option>
                  <option value="PER_SLOT_JAM">Per Slot Jam (Transit)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Jumlah {bookingMode === 'PER_MALAM' ? 'Malam' : 'Slot Jam'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={durationCount}
                  onChange={(e) => setDurationCount(e.target.value)}
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
                <span>PBJT Perhotelan ({regionalTaxInfo.regionName}) - Terpisah</span>
                <span className="font-mono font-semibold tabular-nums">
                  +{formatRupiah(liveCalc.pbjtTaxAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-stone-200 pt-1.5 text-sm font-bold text-stone-900">
                <span>Pendapatan Bersih Pemilik</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatRupiah(liveCalc.ownerNetRevenue)}
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
                Simpan Booking &amp; Catat Jurnal
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
  const [startHourNum, setStartHourNum] = useState('19');
  const [durationHours, setDurationHours] = useState('2');
  const [equipmentFee, setEquipmentFee] = useState('45000');
  const [dpAmount, setDpAmount] = useState('100000');

  const filteredBookings = bookings.filter((b) => {
    if (sportFilter === 'ALL') return true;
    return b.sportType === sportFilter;
  });

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setConflictMsg(null);
    const chosenCourt = courts.find((c) => c.id === courtId) ?? courts[0];
    if (!chosenCourt || !customerName.trim()) return;

    const startH = Math.max(6, Math.min(23, Number(startHourNum) || 19));
    const durH = Math.max(1, Math.min(6, Number(durationHours) || 1));

    if (
      hasCourtSlotConflict(bookings, {
        courtId: chosenCourt.id,
        bookingDate,
        startHour: startH,
        durationHours: durH,
      })
    ) {
      setConflictMsg(
        `Jadwal bentrok! ${chosenCourt.name} pada ${bookingDate} jam ${formatHourRange(
          startH,
          durH
        )} sudah dipesan.`
      );
      return;
    }

    const calc = calculateCourtBookingAmounts({
      hourlyRate: chosenCourt.hourlyRate,
      durationHours: durH,
      equipmentFee: equipmentFee || '0',
      dpAmount: dpAmount || '0',
    });

    const newBooking: CourtBooking = {
      id: `cb-${Date.now()}`,
      bookingCode: `CRT-${String(bookings.length + 1).padStart(3, '0')}`,
      courtId: chosenCourt.id,
      courtName: chosenCourt.name,
      sportType: chosenCourt.sportType,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || '0812-0000-0000',
      bookingDate,
      startHour: startH,
      durationHours: durH,
      equipmentFee: new Decimal(equipmentFee || '0').toFixed(4),
      totalAmount: calc.totalAmount,
      dpAmount: calc.dpAmount,
      remainingAmount: calc.remainingAmount,
      status: Number(calc.remainingAmount) <= 0 ? 'LUNAS' : 'BOOKED_DP',
      createdAt: new Date().toISOString(),
    };

    updateVerticalOps(
      (prev) => ({
        ...prev,
        courtBookings: [newBooking, ...(prev.courtBookings ?? [])],
      }),
      Number(calc.dpAmount) > 0
        ? {
            grossAmount: calc.dpAmount,
            description: `DP Booking ${chosenCourt.name} (${customerName.trim()} · ${bookingDate} ${formatHourRange(
              startH,
              durH
            )})`,
          }
        : undefined
    );
    setShowForm(false);
    setCustomerName('');
    setCustomerPhone('');
  };

  const handleSettleBooking = (booking: CourtBooking) => {
    const remaining = booking.remainingAmount;
    updateVerticalOps(
      (prev) => ({
        ...prev,
        courtBookings: (prev.courtBookings ?? []).map((b) =>
          b.id === booking.id
            ? {
                ...b,
                dpAmount: b.totalAmount,
                remainingAmount: '0.0000',
                status: 'LUNAS',
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
            Jadwal Main &amp; Pembayaran DP / Pelunasan ({filteredBookings.length})
          </h3>
        </div>
        <div className="divide-y divide-stone-100">
          {filteredBookings.map((b) => {
            const slotRange = formatHourRange(b.startHour, b.durationHours);
            const waUrl = buildDirectWaLink(
              b.customerPhone,
              buildGenericBookingWaMessage({
                businessName: tenant.name,
                customerName: b.customerName,
                bookingRef: `${b.courtName} (${b.bookingDate})`,
                summaryLine: `Jam main ${slotRange}. Sisa bayar: ${formatRupiah(b.remainingAmount)}.`,
                totalAmount: b.totalAmount,
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
                      {b.bookingDate} · {slotRange}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        b.status === 'LUNAS' || b.status === 'SELESAI'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {b.status === 'LUNAS' || b.status === 'SELESAI' ? 'Lunas' : 'DP Masuk'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-stone-600">
                    Pemesan: <strong>{b.customerName}</strong> ({b.customerPhone}) · Total{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(b.totalAmount)}</span> · Alat/Kantin{' '}
                    <span className="font-mono tabular-nums">{formatRupiah(b.equipmentFee)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-right">
                    <div className="text-[11px] text-stone-500">Sisa Bayar</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-stone-900">
                      {formatRupiah(b.remainingAmount)}
                    </div>
                  </div>
                  {b.status === 'BOOKED_DP' && (
                    <button
                      type="button"
                      onClick={() => handleSettleBooking(b)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Tandai Lunas
                    </button>
                  )}
                  {waStatus.ready && waUrl && (
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
                  <select
                    value={startHourNum}
                    onChange={(e) => setStartHourNum(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 px-2.5 py-2 font-mono text-sm"
                  >
                    {Array.from({ length: 17 }, (_, i) => i + 7).map((h) => (
                      <option key={h} value={String(h)}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-700">Durasi (Jam)</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={durationHours}
                    onChange={(e) => setDurationHours(e.target.value)}
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
  const [carModel, setCarModel] = useState('');
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
                status: 'TERISI',
                tenantName: tenantName.trim(),
                tenantPhone: tenantPhone.trim(),
                plateNumber: plateNumber.trim().toUpperCase(),
                carModel: carModel.trim(),
                nextDueDate: dueDate,
                paymentStatus: 'LUNAS',
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
    setCarModel('');
  };

  const handleMarkPaid = (slot: GarageSlot) => {
    updateVerticalOps(
      (prev) => ({
        ...prev,
        garageSlots: (prev.garageSlots ?? []).map((s) =>
          s.id === slot.id ? { ...s, paymentStatus: 'LUNAS' } : s
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
              status: 'KOSONG',
              tenantName: undefined,
              tenantPhone: undefined,
              plateNumber: undefined,
              carModel: undefined,
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
        <h2 className="text-base font-bold text-stone-900">Peta Slot Garasi &amp; Penagihan Bulanan</h2>
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
                    <div className="text-xs text-stone-500">{s.slotType.replace(/_/g, ' ')}</div>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      s.status === 'KOSONG'
                        ? 'bg-emerald-50 text-emerald-700'
                        : s.paymentStatus === 'JATUH_TEMPO'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-stone-100 text-stone-800'
                    }`}
                  >
                    {s.status === 'KOSONG'
                      ? 'Kosong'
                      : s.paymentStatus === 'JATUH_TEMPO'
                      ? 'Jatuh Tempo'
                      : 'Terisi · Lunas'}
                  </span>
                </div>

                {s.status === 'TERISI' ? (
                  <div className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs">
                    <div className="font-semibold text-stone-900">{s.tenantName}</div>
                    <div className="font-mono text-stone-700">
                      {s.plateNumber} · {s.carModel}
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
                  {s.status === 'KOSONG' ? (
                    <button
                      type="button"
                      onClick={() => setAssignSlot(s)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Isi Penyewa
                    </button>
                  ) : (
                    <>
                      {s.paymentStatus !== 'LUNAS' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(s)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Lunas
                        </button>
                      )}
                      {waStatus.ready && waUrl && (
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
                    value={carModel}
                    onChange={(e) => setCarModel(e.target.value)}
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
                Simpan &amp; Terima Sewa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
