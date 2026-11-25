import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyKostInvoiceBucket,
  classifyKostTenantBucket,
  computeFacilityAddOnsTotal,
  computePerDayLateFee,
  computePrepaidDueDate,
  computePrepaidRentAmount,
  inferDefaultIncludedFacilitiesFromRoom,
  matchesKostTenantFilter,
} from './kost-facilities';
import { calculateBoardingInvoice, createBoardingRentPaymentJournal } from './kost-agro-engine';
import { validateBalancedJournal } from '../accounting/journal-engine';

test('computeFacilityAddOnsTotal computes exact Decimal totals for BULANAN, TAHUNAN, and flexible per-item durations', () => {
  const addOns = [
    { id: 'ao-1', name: 'Parkir Mobil', monthlyFee: '150000' },
    { id: 'ao-2', name: 'Laundry Bulanan', monthlyFee: '120000' },
  ];
  assert.equal(computeFacilityAddOnsTotal(addOns, 'BULANAN'), '270000.0000');
  assert.equal(computeFacilityAddOnsTotal(addOns, 'TAHUNAN'), '3240000.0000');
  assert.equal(computeFacilityAddOnsTotal([], 'BULANAN'), '0.0000');

  // Flexible add-ons on a 3-month rent extension:
  // Parkir Mobil follows rent (3 bln = 450k), Laundry only 1 month (120k), Galon custom 2 months (120k) -> 690k
  const flexibleAddOns = [
    { id: 'ao-1', name: 'Parkir Mobil', monthlyFee: '150000', durationMode: 'FOLLOW_RENT' as const },
    { id: 'ao-2', name: 'Laundry Bulanan', monthlyFee: '120000', durationMode: 'ONE_MONTH' as const },
    { id: 'ao-3', name: 'Air Galon', monthlyFee: '60000', durationMode: 'CUSTOM' as const, durationMonths: 2 },
  ];
  assert.equal(computeFacilityAddOnsTotal(flexibleAddOns, 3), '690000.0000');
});

test('computePrepaidDueDate handles multi-month check-in, early renewal from existing due date, and month-end clamping', () => {
  // Check-in 01 Jan 2026 bayar 1 bulan -> jatuh tempo 01 Feb 2026
  assert.equal(computePrepaidDueDate('2026-01-01', 1), '2026-02-01');
  // Perpanjang 3 bulan sebelum jatuh tempo (basis 01 Feb 2026) -> 01 Mei 2026
  assert.equal(computePrepaidDueDate('2026-02-01', 3), '2026-05-01');
  // Check-in 01 Jan 2026 bayar 6 bulan sekaligus -> 01 Jul 2026
  assert.equal(computePrepaidDueDate('2026-01-01', 6), '2026-07-01');
  // Sewa tahunan + perpanjang 1 bulan -> 13 bulan dari awal
  assert.equal(computePrepaidDueDate('2027-01-01', 1), '2027-02-01');
  // Month-end clamping (31 Jan + 1 bln -> 28 Feb)
  assert.equal(computePrepaidDueDate('2026-01-31', 1), '2026-02-28');
});

test('computePrepaidRentAmount uses yearlyRate for exact 12-month multiples and monthlyRate for other durations', () => {
  assert.equal(
    computePrepaidRentAmount({ monthlyRate: '1500000', yearlyRate: '16500000', monthsCount: 3 }),
    '4500000.0000'
  );
  assert.equal(
    computePrepaidRentAmount({ monthlyRate: '1500000', yearlyRate: '16500000', monthsCount: 12 }),
    '16500000.0000'
  );
  assert.equal(
    computePrepaidRentAmount({ monthlyRate: '1500000', yearlyRate: '16500000', monthsCount: 1 }),
    '1500000.0000'
  );
});

test('computePerDayLateFee is optional (0 when disabled) and multiplies dailyFee x daysOverdue when enabled', () => {
  assert.equal(computePerDayLateFee({ daysOverdue: 5, dailyFee: '25000', enabled: false }), '0.0000');
  assert.equal(computePerDayLateFee({ daysOverdue: 5, dailyFee: '25000', enabled: true }), '125000.0000');
  assert.equal(computePerDayLateFee({ daysOverdue: 0, dailyFee: '25000', enabled: true }), '0.0000');
});

test('Kost PBJT regional tax (>10 rooms) posts cleanly to 2103 Liability with balanced double-entry journal', () => {
  const calc = calculateBoardingInvoice({
    rentAmount: '1500000',
    utilityFee: '150000',
    lateFee: '50000',
    regionalTaxRate: '0.10',
  });
  assert.equal(calc.subtotalRentAndAddOns, '1700000.0000');
  assert.equal(calc.regionalTaxAmount, '170000.0000');
  assert.equal(calc.totalAmount, '1870000.0000');
  assert.equal(calc.pph42Amount, '170000.0000'); // PPh 4(2) calculated strictly on rent+addOns+lateFee, NOT on PBJT!

  const accounts = [
    { id: 'a1', tenantId: 't1', code: '1101', name: 'Kas', category: 'ASSET' as const, normalBalance: 'DEBIT' as const, isSystem: true, isSystemLocked: true, isActive: true },
    { id: 'a2', tenantId: 't1', code: '4104', name: 'Pendapatan Sewa Kamar Kost', category: 'REVENUE' as const, normalBalance: 'CREDIT' as const, isSystem: true, isSystemLocked: true, isActive: true },
    { id: 'a3', tenantId: 't1', code: '2103', name: 'Utang PB1 / PBJT Daerah', category: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, isSystem: true, isSystemLocked: true, isActive: true },
    { id: 'a4', tenantId: 't1', code: '6201', name: 'Beban Pajak Penghasilan', category: 'EXPENSE' as const, normalBalance: 'DEBIT' as const, isSystem: true, isSystemLocked: true, isActive: true },
    { id: 'a5', tenantId: 't1', code: '2105', name: 'Utang PPh Final Pasal 4(2)', category: 'LIABILITY' as const, normalBalance: 'CREDIT' as const, isSystem: true, isSystemLocked: true, isActive: true },
  ];
  const entry = createBoardingRentPaymentJournal({
    tenantId: 't1',
    accounts,
    invoice: {
      id: 'inv-1',
      tenantId: 't1',
      roomId: 'rm-1',
      boardingTenantId: 'bt-1',
      periodMonth: '2026-11',
      dueDate: '2026-11-01',
      rentAmount: '1500000.0000',
      utilityFee: '150000.0000',
      lateFee: '50000.0000',
      regionalTaxAmount: calc.regionalTaxAmount,
      regionalTaxLabel: 'PBJT Kos >10 Kamar (10%)',
      totalAmount: calc.totalAmount,
      pph42Amount: calc.pph42Amount,
      paymentStatus: 'PAID',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    tenantName: 'Budi Santoso',
    roomNumber: '201',
    paymentAccountCode: '1101',
    entrySeq: 1,
  });
  const check = validateBalancedJournal(
    entry.lines.map((l) => ({
      accountCode: l.accountCodeSnapshot,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo,
    }))
  );
  assert.equal(check.valid, true);
  assert.ok(entry.lines.some((l) => l.accountCodeSnapshot === '2103' && l.credit === '170000.0000'));
  assert.ok(entry.lines.some((l) => l.accountCodeSnapshot === '4104' && l.credit === '1700000.0000'));
});

test('inferDefaultIncludedFacilitiesFromRoom excludes AC for Non-AC room types', () => {
  const acRoom = inferDefaultIncludedFacilitiesFromRoom({ roomType: 'Standar AC + KM Dalam' });
  assert.ok(acRoom.includes('AC'));
  assert.ok(acRoom.includes('Air PDAM'));
  assert.ok(acRoom.includes('Listrik'));

  const nonAcRoom = inferDefaultIncludedFacilitiesFromRoom({ roomType: 'Standar Non-AC' });
  assert.ok(!nonAcRoom.includes('AC'));
  assert.ok(nonAcRoom.includes('Air PDAM'));
  assert.ok(nonAcRoom.includes('Listrik'));
});

test('classifyKostTenantBucket and classifyKostInvoiceBucket are mutually exclusive (zero Telat Bayar vs Belum Bayar overlap)', () => {
  assert.equal(classifyKostTenantBucket({ countdownStatus: 'OVERDUE' }), 'OVERDUE');
  assert.equal(classifyKostTenantBucket({ countdownStatus: 'DUE_TODAY' }), 'DUE_TODAY');
  assert.equal(classifyKostTenantBucket({ countdownStatus: 'DUE_SOON' }), 'DUE_SOON');
  assert.equal(classifyKostTenantBucket({ countdownStatus: 'UPCOMING' }), 'SAFE');

  assert.equal(
    matchesKostTenantFilter({ filter: 'OVERDUE', bucket: 'OVERDUE', billingCycle: 'BULANAN' }),
    true
  );
  assert.equal(
    matchesKostTenantFilter({ filter: 'TAHUNAN', bucket: 'SAFE', billingCycle: 'TAHUNAN' }),
    true
  );
  assert.equal(
    matchesKostTenantFilter({ filter: 'TAHUNAN', bucket: 'SAFE', billingCycle: 'BULANAN' }),
    false
  );

  // Invoice buckets: PAID vs OVERDUE vs UNPAID (not yet overdue)
  assert.equal(classifyKostInvoiceBucket({ paymentStatus: 'PAID', countdownStatus: 'OVERDUE' }), 'PAID');
  assert.equal(classifyKostInvoiceBucket({ paymentStatus: 'UNPAID', countdownStatus: 'OVERDUE' }), 'OVERDUE');
  assert.equal(classifyKostInvoiceBucket({ paymentStatus: 'UNPAID', countdownStatus: 'UPCOMING' }), 'UNPAID');
});
