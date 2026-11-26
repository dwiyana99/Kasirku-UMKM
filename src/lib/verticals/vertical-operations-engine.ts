/**
 * KasirAkun UMKM — Pure Specialized Vertical Operations Engine (Decimal.js)
 *
 * Powers exact financial & operational calculations for:
 * 1. Small Manufacturing (Konveksi / Butik Jahit / Mebel): Raw Materials + Labor + Overhead -> HPP/unit
 * 2. Rental Mobil & Motor: Overtime hours, Fuel penalty, Deposit settlement & Printable Rental Contract HTML
 * 3. Homestay & Villa: Nightly/Hourly booking, OTA Commission (Traveloka/Airbnb/Tiket/Booking) & Separated PBJT 10%
 * 4. Sports Courts (Badminton/Futsal/Padel): Time-slot conflict detection & DP/remaining balance
 * 5. Bimbel, Kursus, Daycare & Gym: Tutor/Instructor session honorarium calculation
 * 6. Vehicle Wash / Barbershop / Salon / SPA: Staff commission calculation
 */

import Decimal from 'decimal.js';
import type {
  CourtBooking,
  OtaChannel,
  RentalContract,
  TutorHonorSession,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// =========================================================================
// 1. MANUFAKTUR KECIL (KONVEKSI / BUTIK JAHIT / MEBEL)
// =========================================================================

export interface ManufacturingCostInput {
  targetQty: number;
  rawMaterials: Array<{ name: string; qty: number; unit: string; unitCost: string }>;
  laborCost: string;
  overheadCost: string;
}

export interface ManufacturingCostResult {
  totalRawMaterialCost: string;
  totalHpp: string;
  hppPerUnit: string;
  recommendedSellingPrice35Pct: string;
}

export function calculateManufacturingHpp(input: ManufacturingCostInput): ManufacturingCostResult {
  const qty = Math.max(1, Math.floor(input.targetQty || 1));
  const rawTotal = input.rawMaterials.reduce((sum, m) => {
    return sum.plus(new Decimal(m.unitCost || '0').times(new Decimal(m.qty || 0)));
  }, new Decimal(0));
  const labor = new Decimal(input.laborCost || '0');
  const overhead = new Decimal(input.overheadCost || '0');
  const totalHpp = rawTotal.plus(labor).plus(overhead);
  const hppPerUnit = totalHpp.div(qty).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const recommendedSelling = hppPerUnit.times('1.35').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  return {
    totalRawMaterialCost: rawTotal.toFixed(4),
    totalHpp: totalHpp.toFixed(4),
    hppPerUnit: hppPerUnit.toFixed(4),
    recommendedSellingPrice35Pct: recommendedSelling.toFixed(4),
  };
}

// =========================================================================
// 2. RENTAL MOBIL & MOTOR (OVERTIME, BBM/FUEL PENALTY & PRINTABLE CONTRACT)
// =========================================================================

export interface RentalSettlementInput {
  baseRentalAmount: string;
  overtimeHourlyRate: string;
  plannedReturnDateTime: string;
  actualReturnDateTime: string;
  fuelStartPct: number; // 0-100
  fuelEndPct: number; // 0-100
  fuelPenaltyPer10Pct?: string; // default Rp25.000 per 10% drop (or Rp10.000 for motor)
  depositAmount: string;
}

export interface RentalSettlementResult {
  overtimeHours: number;
  overtimeChargeAmount: string;
  fuelShortagePct: number;
  fuelPenaltyAmount: string;
  totalFinalAmount: string;
  remainingAfterDeposit: string;
  depositRefundable: string;
}

export function calculateRentalSettlement(input: RentalSettlementInput): RentalSettlementResult {
  const plannedMs = new Date(input.plannedReturnDateTime).getTime();
  const actualMs = new Date(input.actualReturnDateTime).getTime();
  const diffHoursRaw =
    Number.isFinite(plannedMs) && Number.isFinite(actualMs) && actualMs > plannedMs
      ? (actualMs - plannedMs) / (1000 * 60 * 60)
      : 0;
  // Grace period 30 minutes; above that round up to full hour
  const overtimeHours = diffHoursRaw > 0.5 ? Math.ceil(diffHoursRaw) : 0;

  const base = new Decimal(input.baseRentalAmount || '0');
  const otCharge = new Decimal(input.overtimeHourlyRate || '0')
    .times(overtimeHours)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const startFuel = Math.max(0, Math.min(100, input.fuelStartPct));
  const endFuel = Math.max(0, Math.min(100, input.fuelEndPct));
  const fuelShortagePct = Math.max(0, startFuel - endFuel);
  const per10PctFee = new Decimal(input.fuelPenaltyPer10Pct ?? '25000');
  const fuelPenalty =
    fuelShortagePct > 0
      ? new Decimal(fuelShortagePct)
          .div(10)
          .times(per10PctFee)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

  const totalFinal = base.plus(otCharge).plus(fuelPenalty);
  const deposit = new Decimal(input.depositAmount || '0');
  const extraCharges = otCharge.plus(fuelPenalty);
  const remainingAfterDeposit = Decimal.max(new Decimal(0), extraCharges.minus(deposit));
  const depositRefundable = Decimal.max(new Decimal(0), deposit.minus(extraCharges));

  return {
    overtimeHours,
    overtimeChargeAmount: otCharge.toFixed(4),
    fuelShortagePct,
    fuelPenaltyAmount: fuelPenalty.toFixed(4),
    totalFinalAmount: totalFinal.toFixed(4),
    remainingAfterDeposit: remainingAfterDeposit.toFixed(4),
    depositRefundable: depositRefundable.toFixed(4),
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRpPrint(val: string): string {
  const n = Math.round(Number(val || 0));
  return `Rp${n.toLocaleString('id-ID')}`;
}

export function buildRentalContractPrintHtml(params: {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  contract: RentalContract;
}): string {
  const { contract } = params;
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Kontrak Sewa Kendaraan ${escapeHtml(contract.contractNumber)}</title>
  <style>
    body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #1c1917; margin: 28px; font-size: 12px; line-height: 1.55; }
    .header { border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 18px; font-weight: 700; margin: 0; }
    .sub { color: #57534e; font-size: 11px; margin: 2px 0 0; }
    .doc-badge { text-align: right; font-family: monospace; font-size: 12px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    td, th { border: 1px solid #e7e5e4; padding: 6px 8px; text-align: left; }
    th { background: #fafaf9; font-weight: 600; width: 32%; }
    .mono { font-family: monospace; }
    ol { margin: 6px 0 14px 18px; padding: 0; }
    li { margin-bottom: 4px; }
    .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 32px; text-align: center; }
    .sign-box { height: 70px; border-bottom: 1px solid #1c1917; margin: 10px 24px 6px; }
    @media print { body { margin: 14mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p class="title">${escapeHtml(params.businessName)}</p>
      <p class="sub">${escapeHtml(params.businessAddress)} · WA/Telp: ${escapeHtml(params.businessPhone || '-')}</p>
    </div>
    <div class="doc-badge">
      <strong>SURAT PERJANJIAN SEWA KENDARAAN</strong><br/>
      No: ${escapeHtml(contract.contractNumber)}
    </div>
  </div>

  <h2>1. Identitas Penyewa (Pihak Kedua)</h2>
  <table>
    <tr><th>Nama Lengkap</th><td>${escapeHtml(contract.renterName)}</td></tr>
    <tr><th>NIK / No. KTP</th><td class="mono">${escapeHtml(contract.renterNik || '-')}</td></tr>
    <tr><th>No. WhatsApp / Telepon</th><td class="mono">${escapeHtml(contract.renterPhone)}</td></tr>
    <tr><th>Alamat Domisili</th><td>${escapeHtml(contract.renterAddress || '-')}</td></tr>
    <tr><th>Kelengkapan Dokumen Syarat</th><td>KTP: ${contract.kycIdPhotoUrl ? 'Terlampir' : 'Belum diunggah'} · SIM: ${contract.kycSimPhotoUrl ? 'Terlampir' : 'Belum diunggah'} · Foto Serah Terima: ${contract.handoverPhotoUrl ? 'Terlampir' : 'Belum diunggah'}</td></tr>
  </table>

  <h2>2. Detail Kendaraan & Kondisi Serah Terima</h2>
  <table>
    <tr><th>Unit Kendaraan & Plat Nomor</th><td><strong>${escapeHtml(contract.vehicleName)}</strong> (<span class="mono">${escapeHtml(contract.plateNumber)}</span>)</td></tr>
    <tr><th>Waktu Mulai Pinjam</th><td class="mono">${escapeHtml(contract.startDateTime)}</td></tr>
    <tr><th>Batas Waktu Kembali</th><td class="mono">${escapeHtml(contract.plannedReturnDateTime)}</td></tr>
    <tr><th>Odometer (KM) & BBM Awal</th><td class="mono">KM Awal: ${contract.kmStart.toLocaleString('id-ID')} km · Level Bensin: ${contract.fuelStartPct}%</td></tr>
    <tr><th>Biaya Sewa Dasar</th><td class="mono"><strong>${formatRpPrint(contract.baseRentalAmount)}</strong></td></tr>
    <tr><th>Uang Jaminan (Deposit)</th><td class="mono">${formatRpPrint(contract.depositAmount)}</td></tr>
  </table>

  <h2>3. Ketentuan & Tanggung Jawab Peminjaman</h2>
  <ol>
    <li>Penyewa wajib mengembalikan kendaraan tepat waktu sesuai jadwal. Keterlambatan lebih dari 30 menit dikenakan biaya overtime per jam sesuai tarif yang disepakati.</li>
    <li>Level bahan bakar (BBM) saat pengembalian wajib minimal sama dengan saat serah terima (${contract.fuelStartPct}%). Kekurangan BBM dikenakan biaya penggantian.</li>
    <li>Kendaraan dilarang dipindahtangankan, digadaikan, atau digunakan untuk tindakan melanggar hukum di wilayah Republik Indonesia.</li>
    <li>Kerusakan akibat kelalaian penyewa, tilang elektronik (ETLE), atau kehilangan kunci/STNK menjadi tanggung jawab penuh penyewa.</li>
  </ol>

  <div class="sign-grid">
    <div>
      <p><strong>Pihak Pertama (Pemilik / Pengelola)</strong></p>
      <div class="sign-box"></div>
      <p>${escapeHtml(params.businessName)}</p>
    </div>
    <div>
      <p><strong>Pihak Kedua (Penyewa)</strong></p>
      <div class="sign-box"></div>
      <p>${escapeHtml(contract.renterName)}</p>
    </div>
  </div>
</body>
</html>`;
}

// =========================================================================
// 3. HOMESTAY & VILLA (OTA COMMISSION + SEPARATED PBJT PERHOTELAN 10%)
// =========================================================================

export const DEFAULT_OTA_COMMISSION_PCT: Record<OtaChannel, string> = {
  DIRECT: '0.00',
  TRAVELOKA: '0.15',
  AIRBNB: '0.15',
  TIKET_COM: '0.16',
  BOOKING_COM: '0.18',
};

export interface HomestaySettlementInput {
  ratePerUnit: string; // nightly or hourly slot rate
  durationCount: number; // nights or hours
  otaChannel: OtaChannel;
  otaCommissionPctOverride?: string;
  pbjtRate: string; // e.g. '0.10' from Regional Tax or '0.00' if exempt
}

export interface HomestaySettlementResult {
  grossRoomRevenue: string;
  otaCommissionPct: string;
  otaCommissionAmount: string;
  pbjtTaxAmount: string; // Strictly separated from owner net revenue!
  ownerNetRevenue: string; // Gross - OTA Commission (PBJT is guest-paid / held in tax liability!)
  guestTotalPaid: string; // Gross + PBJT
}

export function calculateHomestaySettlement(
  input: HomestaySettlementInput
): HomestaySettlementResult {
  const duration = Math.max(1, Math.floor(input.durationCount || 1));
  const gross = new Decimal(input.ratePerUnit || '0')
    .times(duration)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const otaPct = new Decimal(
    input.otaCommissionPctOverride ?? DEFAULT_OTA_COMMISSION_PCT[input.otaChannel] ?? '0'
  );
  const otaCommission = gross.times(otaPct).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const pbjtRateDec = new Decimal(input.pbjtRate || '0');
  const pbjtTax = gross.times(pbjtRateDec).toDecimalPlaces(0, Decimal.ROUND_FLOOR);

  // PBJT is collected from guest and held as local tax payable — NOT counted as owner revenue!
  const ownerNetRevenue = Decimal.max(new Decimal(0), gross.minus(otaCommission));
  const guestTotalPaid = gross.plus(pbjtTax);

  return {
    grossRoomRevenue: gross.toFixed(4),
    otaCommissionPct: otaPct.toFixed(4),
    otaCommissionAmount: otaCommission.toFixed(4),
    pbjtTaxAmount: pbjtTax.toFixed(4),
    ownerNetRevenue: ownerNetRevenue.toFixed(4),
    guestTotalPaid: guestTotalPaid.toFixed(4),
  };
}

// =========================================================================
// 4. SEWA LAPANGAN OLAHRAGA (BADMINTON / FUTSAL / PADEL)
// =========================================================================

export function hasCourtSlotConflict(
  existingBookings: CourtBooking[],
  candidate: {
    courtId: string;
    bookingDate: string;
    startHour: number;
    durationHours: number;
    excludeBookingId?: string;
  }
): boolean {
  const candStart = candidate.startHour;
  const candEnd = candidate.startHour + Math.max(1, candidate.durationHours);

  return existingBookings.some((b) => {
    if (b.status === 'BATAL') return false;
    if (candidate.excludeBookingId && b.id === candidate.excludeBookingId) return false;
    if (b.courtId !== candidate.courtId || b.bookingDate !== candidate.bookingDate) return false;
    const bStart = b.startHour;
    const bEnd = b.startHour + Math.max(1, b.durationHours);
    return candStart < bEnd && candEnd > bStart;
  });
}

export function calculateCourtBookingAmounts(params: {
  hourlyRate: string;
  durationHours: number;
  equipmentFee: string;
  dpAmount: string;
}): { totalAmount: string; dpAmount: string; remainingAmount: string } {
  const total = new Decimal(params.hourlyRate || '0')
    .times(Math.max(1, params.durationHours || 1))
    .plus(new Decimal(params.equipmentFee || '0'))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const dp = Decimal.min(total, Decimal.max(new Decimal(0), new Decimal(params.dpAmount || '0')));
  const remaining = Decimal.max(new Decimal(0), total.minus(dp));

  return {
    totalAmount: total.toFixed(4),
    dpAmount: dp.toFixed(4),
    remainingAmount: remaining.toFixed(4),
  };
}

// =========================================================================
// 5. BIMBEL / KURSUS / DAYCARE / GYM — TUTOR HONORARIUM & COMMISSION
// =========================================================================

export function calculateTutorHonorSummary(sessions: TutorHonorSession[]): {
  totalSessions: number;
  totalUnpaidHonor: string;
  totalPaidHonor: string;
  byTutor: Array<{
    tutorName: string;
    sessionCount: number;
    unpaidHonor: string;
    paidHonor: string;
  }>;
} {
  let totalSessions = 0;
  let unpaid = new Decimal(0);
  let paid = new Decimal(0);
  const map = new Map<
    string,
    { tutorName: string; sessionCount: number; unpaid: Decimal; paid: Decimal }
  >();

  for (const s of sessions) {
    totalSessions += s.sessionCount;
    const amt = new Decimal(s.totalHonor || '0');
    const cur = map.get(s.tutorName) ?? {
      tutorName: s.tutorName,
      sessionCount: 0,
      unpaid: new Decimal(0),
      paid: new Decimal(0),
    };
    cur.sessionCount += s.sessionCount;
    if (s.status === 'PAID') {
      paid = paid.plus(amt);
      cur.paid = cur.paid.plus(amt);
    } else {
      unpaid = unpaid.plus(amt);
      cur.unpaid = cur.unpaid.plus(amt);
    }
    map.set(s.tutorName, cur);
  }

  return {
    totalSessions,
    totalUnpaidHonor: unpaid.toFixed(4),
    totalPaidHonor: paid.toFixed(4),
    byTutor: Array.from(map.values()).map((t) => ({
      tutorName: t.tutorName,
      sessionCount: t.sessionCount,
      unpaidHonor: t.unpaid.toFixed(4),
      paidHonor: t.paid.toFixed(4),
    })),
  };
}

export function calculateStaffCommission(price: string, rateDecimal: string): string {
  return new Decimal(price || '0')
    .times(new Decimal(rateDecimal || '0'))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toFixed(4);
}
