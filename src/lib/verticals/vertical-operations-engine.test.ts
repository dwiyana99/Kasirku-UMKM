import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRentalContractPrintHtml,
  calculateCourtBookingAmounts,
  calculateHomestaySettlement,
  calculateManufacturingHpp,
  calculateRentalSettlement,
  calculateTutorHonorSummary,
  hasCourtSlotConflict,
} from './vertical-operations-engine';
import {
  buildDirectWaMeUrl,
  buildLaundryStatusWaMessage,
  checkDirectWaReadiness,
} from '../messaging/whatsapp-direct';
import type { CourtBooking, RentalContract } from '../../types/domain';

test('Manufaktur Kecil calculates exact HPP per unit from raw materials + labor + overhead', () => {
  const res = calculateManufacturingHpp({
    targetQty: 20,
    rawMaterials: [
      { name: 'Kain Katun Combed', qty: 30, unit: 'meter', unitCost: '45000' }, // 1,350,000
      { name: 'Kancing & Benang', qty: 20, unit: 'set', unitCost: '5000' }, // 100,000
    ],
    laborCost: '400000',
    overheadCost: '150000',
  });
  // Total = 1,350,000 + 100,000 + 400,000 + 150,000 = 2,000,000 -> 100,000 / pcs
  assert.equal(res.totalRawMaterialCost, '1450000.0000');
  assert.equal(res.totalHpp, '2000000.0000');
  assert.equal(res.hppPerUnit, '100000.0000');
  assert.equal(res.recommendedSellingPrice35Pct, '135000.0000');
});

test('Rental Mobil & Motor calculates overtime (>30min grace), fuel shortage penalty, and deposit refund accurately', () => {
  const settlement = calculateRentalSettlement({
    baseRentalAmount: '350000',
    overtimeHourlyRate: '35000',
    plannedReturnDateTime: '2026-11-22T10:00:00',
    actualReturnDateTime: '2026-11-22T12:15:00', // 2.25 hrs -> 3 hrs overtime
    fuelStartPct: 80,
    fuelEndPct: 60, // 20% drop -> 2 x 25,000 = 50,000
    fuelPenaltyPer10Pct: '25000',
    depositAmount: '200000',
  });
  assert.equal(settlement.overtimeHours, 3);
  assert.equal(settlement.overtimeChargeAmount, '105000.0000');
  assert.equal(settlement.fuelShortagePct, 20);
  assert.equal(settlement.fuelPenaltyAmount, '50000.0000');
  assert.equal(settlement.totalFinalAmount, '505000.0000');
  // Extra charges = 155,000 deducted from 200,000 deposit -> refund 45,000
  assert.equal(settlement.depositRefundable, '45000.0000');
  assert.equal(settlement.remainingAfterDeposit, '0.0000');

  const sampleContract: RentalContract = {
    id: 'rc-1',
    contractNumber: 'RNT-2026-001',
    vehicleId: 'v-1',
    vehicleName: 'Toyota Avanza Veloz',
    plateNumber: 'DK 1234 AB',
    renterName: 'Andi Saputra',
    renterNik: '5171021234560001',
    renterPhone: '081234567890',
    renterAddress: 'Jl. Gatot Subroto, Denpasar',
    startDateTime: '2026-11-21 10:00',
    plannedReturnDateTime: '2026-11-22 10:00',
    kmStart: 24500,
    fuelStartPct: 80,
    fuelPenaltyAmount: '0.0000',
    overtimeHours: 0,
    overtimeChargeAmount: '0.0000',
    baseRentalAmount: '350000.0000',
    depositAmount: '200000.0000',
    totalFinalAmount: '350000.0000',
    kycIdPhotoUrl: 'data:image/png;base64,abc',
    status: 'ACTIVE',
    createdAt: '2026-11-21T03:00:00Z',
  };
  const html = buildRentalContractPrintHtml({
    businessName: 'Nusantara Trans Rental',
    businessAddress: 'Denpasar',
    businessPhone: '081200011122',
    contract: sampleContract,
  });
  assert.ok(html.includes('RNT-2026-001'));
  assert.ok(html.includes('DK 1234 AB'));
  assert.ok(html.includes('Terlampir'));
});

test('Homestay/Villa separates PBJT 10% from owner revenue and deducts OTA commission cleanly', () => {
  const res = calculateHomestaySettlement({
    ratePerUnit: '1000000',
    durationCount: 2, // 2 nights = 2,000,000 gross
    otaChannel: 'TRAVELOKA', // 15% = 300,000
    pbjtRate: '0.10', // 10% = 200,000
  });
  assert.equal(res.grossRoomRevenue, '2000000.0000');
  assert.equal(res.otaCommissionAmount, '300000.0000');
  assert.equal(res.pbjtTaxAmount, '200000.0000');
  // Owner net = 2,000,000 - 300,000 = 1,700,000 (PBJT 200,000 strictly separate!)
  assert.equal(res.ownerNetRevenue, '1700000.0000');
  assert.equal(res.guestTotalPaid, '2200000.0000');
});

test('Sports court detects slot overlap and computes DP remaining balance', () => {
  const existing: CourtBooking[] = [
    {
      id: 'cb-1',
      bookingCode: 'LAP-001',
      courtId: 'court-1',
      courtName: 'Lapangan Padel 1',
      sportType: 'PADEL',
      customerName: 'Fajar',
      customerPhone: '08123456',
      bookingDate: '2026-11-22',
      startHour: 18,
      durationHours: 2, // 18:00 - 20:00
      equipmentFee: '0.0000',
      totalAmount: '400000.0000',
      dpAmount: '150000.0000',
      remainingAmount: '250000.0000',
      status: 'BOOKED_DP',
      createdAt: '2026-11-21T08:00:00Z',
    },
  ];
  assert.equal(
    hasCourtSlotConflict(existing, {
      courtId: 'court-1',
      bookingDate: '2026-11-22',
      startHour: 19,
      durationHours: 1,
    }),
    true
  );
  assert.equal(
    hasCourtSlotConflict(existing, {
      courtId: 'court-1',
      bookingDate: '2026-11-22',
      startHour: 20,
      durationHours: 1,
    }),
    false
  );

  const amounts = calculateCourtBookingAmounts({
    hourlyRate: '180000',
    durationHours: 2,
    equipmentFee: '40000',
    dpAmount: '150000',
  });
  assert.equal(amounts.totalAmount, '400000.0000');
  assert.equal(amounts.remainingAmount, '250000.0000');
});

test('Bimbel/Gym tutor honorarium summary aggregates per tutor accurately', () => {
  const summary = calculateTutorHonorSummary([
    {
      id: 'ts-1',
      tutorName: 'Kak Bima',
      subjectOrClass: 'Matematika SMA',
      sessionDate: '2026-11-20',
      sessionCount: 3,
      ratePerSession: '75000.0000',
      totalHonor: '225000.0000',
      status: 'UNPAID',
    },
    {
      id: 'ts-2',
      tutorName: 'Kak Bima',
      subjectOrClass: 'Fisika SMA',
      sessionDate: '2026-11-21',
      sessionCount: 2,
      ratePerSession: '75000.0000',
      totalHonor: '150000.0000',
      status: 'PAID',
    },
  ]);
  assert.equal(summary.totalSessions, 5);
  assert.equal(summary.totalUnpaidHonor, '225000.0000');
  assert.equal(summary.totalPaidHonor, '150000.0000');
  assert.equal(summary.byTutor.length, 1);
});

test('Direct wa.me requires owner WhatsApp number on Paket LITE and builds valid wa.me URL', () => {
  assert.equal(checkDirectWaReadiness('').ready, false);
  const blocked = buildDirectWaMeUrl({
    businessWhatsappNumber: '',
    customerPhone: '081234567890',
    message: 'Halo',
  });
  assert.equal(blocked.ok, false);

  const msg = buildLaundryStatusWaMessage({
    businessName: 'Laundry Bersih',
    ticketNumber: 'LND-01',
    customerName: 'Siti',
    statusLabel: 'Siap Diambil',
    itemSummary: 'Cuci Setrika 4 kg',
    rackLocation: 'Rak B-2',
    totalAmount: '32000',
    remainingAmount: '12000',
  });
  const ok = buildDirectWaMeUrl({
    businessWhatsappNumber: '081122334455',
    customerPhone: '0812-3456-7890',
    message: msg,
  });
  assert.equal(ok.ok, true);
  assert.ok(ok.url?.startsWith('https://wa.me/6281234567890?text='));
});
