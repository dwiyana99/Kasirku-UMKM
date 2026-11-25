import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIsoDate,
  addMonthsIsoDate,
  computeDueCountdown,
  computeFirstBoardingDueDate,
  formatDateIndo,
  formatDateLongIndo,
  formatDateTimeIndo,
  formatMonthIndo,
  formatVerticalStatusLabel,
  resolveBoardingDueDate,
} from './indonesia-date';

test('formatDateIndo converts YYYY-MM-DD and YYYY/MM/DD into clean Indonesian dates', () => {
  assert.equal(formatDateIndo('2026-09-01'), '01 Sep 2026');
  assert.equal(formatDateIndo('2026/01/05'), '05 Jan 2026');
  assert.equal(formatDateIndo('2026-08-17T08:30:00.000Z'), '17 Agu 2026');
  assert.equal(formatDateIndo(''), '-');
  assert.equal(formatDateIndo(null, 'Belum diisi'), 'Belum diisi');
});

test('formatDateLongIndo and formatMonthIndo return full Indonesian month names', () => {
  assert.equal(formatDateLongIndo('2026-12-25'), '25 Desember 2026');
  assert.equal(formatMonthIndo('2026-11'), 'November 2026');
  assert.equal(formatMonthIndo('2026/05'), 'Mei 2026');
  assert.equal(formatMonthIndo('TAHUNAN-2026-2027'), 'Tahunan 2026/2027');
});

test('formatDateTimeIndo preserves time cleanly in Indonesian format', () => {
  assert.equal(formatDateTimeIndo('2026-11-23 09:00'), '23 Nov 2026, 09:00');
  assert.equal(formatDateTimeIndo('2026-11-23'), '23 Nov 2026');
});

test('addMonthsIsoDate and computeFirstBoardingDueDate handle BULANAN, TAHUNAN, and month-end clamping', () => {
  assert.equal(computeFirstBoardingDueDate('2026-09-01', 'BULANAN'), '2026-10-01');
  assert.equal(computeFirstBoardingDueDate('2026-09-01', 'TAHUNAN'), '2027-09-01');
  assert.equal(addMonthsIsoDate('2026-01-31', 1), '2026-02-28');
  assert.equal(addDaysIsoDate('2026-11-28', 4), '2026-12-02');
});

test('computeDueCountdown accurately classifies OVERDUE, DUE_TODAY, DUE_SOON, and UPCOMING', () => {
  const ref = new Date(2026, 10, 23); // 23 Nov 2026

  const overdue = computeDueCountdown('2026-11-20', ref);
  assert.equal(overdue.status, 'OVERDUE');
  assert.equal(overdue.daysRemaining, -3);
  assert.equal(overdue.label, 'Terlambat 3 hari');
  assert.equal(overdue.tone, 'rose');

  const today = computeDueCountdown('2026-11-23', ref);
  assert.equal(today.status, 'DUE_TODAY');
  assert.equal(today.daysRemaining, 0);
  assert.equal(today.label, 'Jatuh tempo hari ini');

  const soon = computeDueCountdown('2026-11-27', ref);
  assert.equal(soon.status, 'DUE_SOON');
  assert.equal(soon.daysRemaining, 4);
  assert.equal(soon.label, 'Jatuh tempo 4 hari lagi');
  assert.equal(soon.tone, 'amber');

  const upcoming = computeDueCountdown('2026-12-15', ref);
  assert.equal(upcoming.status, 'UPCOMING');
  assert.equal(upcoming.daysRemaining, 22);
  assert.equal(upcoming.tone, 'emerald');
});

test('formatVerticalStatusLabel translates raw enum statuses to readable Indonesian', () => {
  assert.equal(formatVerticalStatusLabel('BOOKED'), 'Dipesan (Booking)');
  assert.equal(formatVerticalStatusLabel('SIAP_AMBIL'), 'Siap Diambil');
  assert.equal(formatVerticalStatusLabel('VILLA_PRIVATE'), 'Villa Private');
  assert.equal(formatVerticalStatusLabel('CUTTING_PROCESS'), 'Potong & Jahit');
  assert.equal(formatVerticalStatusLabel('DITERIMA_PROYEK'), 'Diterima di Proyek');
});

test('resolveBoardingDueDate gracefully resolves explicit, period-based, and legacy checkInDate due dates', () => {
  const ref = new Date(2026, 10, 23); // 23 Nov 2026

  assert.equal(
    resolveBoardingDueDate({ explicitDueDate: '2026-11-28', checkInDate: '2026-09-01', referenceDate: ref }),
    '2026-11-28'
  );

  assert.equal(
    resolveBoardingDueDate({ checkInDate: '2026-09-05', periodMonth: '2026-11', referenceDate: ref }),
    '2026-11-05'
  );

  assert.equal(
    resolveBoardingDueDate({ checkInDate: '2026-09-01', billingCycle: 'BULANAN', referenceDate: ref }),
    '2026-12-01'
  );

  assert.equal(
    resolveBoardingDueDate({ checkInDate: '2026-09-01', billingCycle: 'TAHUNAN', referenceDate: ref }),
    '2027-09-01'
  );
});
