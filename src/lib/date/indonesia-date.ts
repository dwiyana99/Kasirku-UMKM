/**
 * KasirAkun UMKM — Pure Indonesian Date Formatting, Due-Date Countdown & Status Label Helpers.
 * Converts raw ISO/slash dates (e.g. 2026-09-01, 2026/09/01, 2026-11, 2026-11-23 09:00)
 * into consistent, layperson-friendly Indonesian formats across all 22 UMKM verticals.
 */

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

const MONTHS_LONG_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export type BoardingBillingCycle = 'BULANAN' | 'TAHUNAN';

interface ParsedYmd {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour?: number;
  minute?: number;
}

function parseYmdDate(input?: string | Date | null): ParsedYmd | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
      hour: input.getHours(),
      minute: input.getMinutes(),
    };
  }

  const trimmed = String(input).trim();
  if (!trimmed) return null;

  // Match YYYY-MM-DD or YYYY/MM/DD with optional time (HH:mm or T...Z)
  const ymdMatch = trimmed.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/
  );
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const hour = ymdMatch[4] !== undefined ? Number(ymdMatch[4]) : undefined;
    const minute = ymdMatch[5] !== undefined ? Number(ymdMatch[5]) : undefined;
    return { year, month, day, hour, minute };
  }

  // Fallback native parse
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
    hour: dt.getHours(),
    minute: dt.getMinutes(),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats '2026-09-01' or '2026/09/01' -> '01 Sep 2026'
 */
export function formatDateIndo(
  input?: string | Date | null,
  fallback = '-'
): string {
  const parsed = parseYmdDate(input);
  if (!parsed) return fallback;
  const monthLabel = MONTHS_SHORT_ID[parsed.month - 1];
  if (!monthLabel) return fallback;
  return `${pad2(parsed.day)} ${monthLabel} ${parsed.year}`;
}

/**
 * Formats '2026-09-01' -> '01 September 2026'
 */
export function formatDateLongIndo(
  input?: string | Date | null,
  fallback = '-'
): string {
  const parsed = parseYmdDate(input);
  if (!parsed) return fallback;
  const monthLabel = MONTHS_LONG_ID[parsed.month - 1];
  if (!monthLabel) return fallback;
  return `${pad2(parsed.day)} ${monthLabel} ${parsed.year}`;
}

/**
 * Formats '2026-11-23 09:00' or ISO datetime -> '23 Nov 2026, 09:00'
 */
export function formatDateTimeIndo(
  input?: string | Date | null,
  fallback = '-'
): string {
  const parsed = parseYmdDate(input);
  if (!parsed) return fallback;
  const monthLabel = MONTHS_SHORT_ID[parsed.month - 1];
  if (!monthLabel) return fallback;
  const datePart = `${pad2(parsed.day)} ${monthLabel} ${parsed.year}`;
  if (parsed.hour !== undefined && parsed.minute !== undefined) {
    return `${datePart}, ${pad2(parsed.hour)}:${pad2(parsed.minute)}`;
  }
  return datePart;
}

/**
 * Formats '2026-11' or '2026/11' -> 'November 2026'
 * Also handles annual codes like 'TAHUNAN-2026' -> 'Tahunan 2026'.
 */
export function formatMonthIndo(
  period?: string | null,
  fallback = '-'
): string {
  if (!period) return fallback;
  const trimmed = String(period).trim();
  if (!trimmed) return fallback;

  const annualMatch = trimmed.match(/^TAHUNAN[-/\s](\d{4}(?:[-/]\d{4})?)$/i);
  if (annualMatch) {
    return `Tahunan ${annualMatch[1].replace('-', '/')}`;
  }

  const ymMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Number(ymMatch[2]);
    if (month >= 1 && month <= 12) {
      return `${MONTHS_LONG_ID[month - 1]} ${year}`;
    }
  }

  // If full date passed, format month & year
  const parsed = parseYmdDate(trimmed);
  if (parsed) {
    return `${MONTHS_LONG_ID[parsed.month - 1]} ${parsed.year}`;
  }

  return trimmed;
}

/**
 * Returns local calendar YYYY-MM-DD string.
 */
export function getTodayIsoDate(refDate: Date = new Date()): string {
  return `${refDate.getFullYear()}-${pad2(refDate.getMonth() + 1)}-${pad2(refDate.getDate())}`;
}

/**
 * Adds N days to an ISO YYYY-MM-DD date string safely in local calendar math.
 */
export function addDaysIsoDate(isoDate: string, days: number): string {
  const parsed = parseYmdDate(isoDate);
  const base = parsed
    ? new Date(parsed.year, parsed.month - 1, parsed.day)
    : new Date();
  base.setDate(base.getDate() + days);
  return getTodayIsoDate(base);
}

/**
 * Adds N months to an ISO YYYY-MM-DD date string, clamping day to the target month's last day.
 */
export function addMonthsIsoDate(isoDate: string, months: number): string {
  const parsed = parseYmdDate(isoDate);
  if (!parsed) return getTodayIsoDate();
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1; // 1..12
  const maxDayInTarget = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(parsed.day, maxDayInTarget);
  return `${targetYear}-${pad2(targetMonth)}-${pad2(targetDay)}`;
}

/**
 * Computes the first/next due date from a check-in date and billing cycle ('BULANAN' or 'TAHUNAN').
 */
export function computeFirstBoardingDueDate(
  checkInDate: string,
  billingCycle: BoardingBillingCycle
): string {
  return addMonthsIsoDate(checkInDate, billingCycle === 'TAHUNAN' ? 12 : 1);
}

/**
 * Resolves a tenant/invoice due date reliably even for legacy records that predate
 * explicit `nextDueDate` / `dueDate` fields, by advancing from `checkInDate` per cycle.
 */
export function resolveBoardingDueDate(params: {
  explicitDueDate?: string | null;
  checkInDate?: string | null;
  billingCycle?: BoardingBillingCycle | null;
  periodMonth?: string | null;
  referenceDate?: Date;
}): string | undefined {
  if (params.explicitDueDate && parseYmdDate(params.explicitDueDate)) {
    return params.explicitDueDate;
  }

  const cycle: BoardingBillingCycle = params.billingCycle === 'TAHUNAN' ? 'TAHUNAN' : 'BULANAN';
  const checkInParsed = parseYmdDate(params.checkInDate);
  const dueDay = checkInParsed?.day ?? 1;

  // If an explicit invoice periodMonth like '2026-11' exists, align due date to that month + check-in day
  if (params.periodMonth) {
    const ym = params.periodMonth.trim().match(/^(\d{4})[-/](\d{1,2})$/);
    if (ym) {
      const y = Number(ym[1]);
      const m = Number(ym[2]);
      if (m >= 1 && m <= 12) {
        const maxD = new Date(y, m, 0).getDate();
        return `${y}-${pad2(m)}-${pad2(Math.min(dueDay, maxD))}`;
      }
    }
  }

  if (!checkInParsed) return undefined;

  const ref = params.referenceDate ?? new Date();
  const refUtc = Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const stepMonths = cycle === 'TAHUNAN' ? 12 : 1;
  let candidate = addMonthsIsoDate(
    `${checkInParsed.year}-${pad2(checkInParsed.month)}-${pad2(checkInParsed.day)}`,
    stepMonths
  );

  for (let i = 0; i < 120; i += 1) {
    const p = parseYmdDate(candidate);
    if (!p) break;
    const candUtc = Date.UTC(p.year, p.month - 1, p.day);
    if (candUtc >= refUtc - 10 * 86_400_000) {
      return candidate;
    }
    candidate = addMonthsIsoDate(candidate, stepMonths);
  }

  return candidate;
}

export type DueCountdownStatus =
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'UPCOMING'
  | 'UNKNOWN';

export interface DueCountdownResult {
  daysRemaining: number | null;
  status: DueCountdownStatus;
  label: string;
  shortLabel: string;
  tone: 'rose' | 'amber' | 'emerald' | 'stone';
  dueDateFormatted: string;
}

/**
 * Computes layperson-friendly due-date countdown (e.g. 'Terlambat 3 hari',
 * 'Jatuh tempo hari ini', 'Jatuh tempo 4 hari lagi').
 */
export function computeDueCountdown(
  dueDateStr?: string | null,
  referenceDate: Date = new Date(),
  soonThresholdDays = 7
): DueCountdownResult {
  const parsed = parseYmdDate(dueDateStr);
  if (!parsed) {
    return {
      daysRemaining: null,
      status: 'UNKNOWN',
      label: 'Tanggal belum diatur',
      shortLabel: '-',
      tone: 'stone',
      dueDateFormatted: '-',
    };
  }

  const dueUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const refUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const daysRemaining = Math.round((dueUtc - refUtc) / 86_400_000);
  const dueDateFormatted = formatDateIndo(dueDateStr);

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      daysRemaining,
      status: 'OVERDUE',
      label: `Terlambat ${overdueDays} hari`,
      shortLabel: `Telat ${overdueDays} hr`,
      tone: 'rose',
      dueDateFormatted,
    };
  }

  if (daysRemaining === 0) {
    return {
      daysRemaining: 0,
      status: 'DUE_TODAY',
      label: 'Jatuh tempo hari ini',
      shortLabel: 'Hari ini',
      tone: 'rose',
      dueDateFormatted,
    };
  }

  if (daysRemaining <= soonThresholdDays) {
    return {
      daysRemaining,
      status: 'DUE_SOON',
      label: `Jatuh tempo ${daysRemaining} hari lagi`,
      shortLabel: `${daysRemaining} hr lagi`,
      tone: 'amber',
      dueDateFormatted,
    };
  }

  return {
    daysRemaining,
    status: 'UPCOMING',
    label: `${daysRemaining} hari lagi`,
    shortLabel: `${daysRemaining} hr lagi`,
    tone: 'emerald',
    dueDateFormatted,
  };
}

const VERTICAL_STATUS_LABELS: Record<string, string> = {
  // Homestay & Villa
  BOOKED: 'Dipesan (Booking)',
  CHECK_IN: 'Sedang Menginap',
  CHECK_OUT: 'Sudah Check-Out',
  CLEANING: 'Sedang Dibersihkan',
  TERSEDIA: 'Tersedia',
  DIBERSIHKAN: 'Sedang Dibersihkan',
  VILLA_PRIVATE: 'Villa Private',
  KAMAR_DELUXE: 'Kamar Deluxe',
  KAMAR_STANDAR: 'Kamar Standar',
  COTTAGE: 'Cottage / Bungalow',

  // Sewa Garasi
  TERTUTUP_INDOOR: 'Garasi Tertutup (Indoor)',
  KANOPI_SEMI_OUTDOOR: 'Kanopi Semi-Outdoor',
  TERBUKA_OUTDOOR: 'Area Terbuka',
  KOSONG: 'Kosong',
  TERISI: 'Terisi',

  // Rental Kendaraan
  DISEWA: 'Sedang Disewa',
  BENGKEL: 'Servis / Bengkel',
  AKTIF: 'Sedang Berjalan',
  TELAT: 'Terlambat Kembali',

  // Laundry & Cuci Kendaraan
  DITERIMA: 'Diterima',
  ANTRI: 'Dalam Antrean',
  DICUCI: 'Sedang Dicuci',
  DISETRIKA: 'Sedang Disetrika',
  SIAP_AMBIL: 'Siap Diambil',
  SELESAI: 'Selesai',

  // Bakery & Catering
  PO_MASUK: 'Pesanan Masuk',
  DIPROSES: 'Sedang Diproduksi',
  DIANTAR: 'Sedang Diantar',

  // Manufaktur / Konveksi
  ANTREAN: 'Menunggu Produksi',
  CUTTING_PROCESS: 'Potong & Jahit',
  FINISHING_QC: 'Finishing & Cek Mutu',
  SIAP_KIRIM: 'Siap Dikirim',

  // Toko Bangunan (Surat Jalan)
  MENUNGGU_ARMADA: 'Menunggu Armada',
  DALAM_PERJALANAN: 'Dalam Pengiriman',
  DITERIMA_PROYEK: 'Diterima di Proyek',

  // Salon / Barbershop / SPA / Pet Shop
  TERJADWAL: 'Terjadwal',
  BERLANGSUNG: 'Sedang Dilayani',
  CHECKED_IN: 'Sedang Menginap / Dititipkan',

  // Pembayaran & Lapangan
  BOOKED_DP: 'DP Masuk',
  LUNAS: 'Lunas',
  BELUM_LUNAS: 'Belum Lunas',
  JATUH_TEMPO: 'Jatuh Tempo',
  PAID: 'Lunas',
  UNPAID: 'Belum Bayar',
  OVERDUE: 'Terlambat',
};

/**
 * Translates raw internal enum statuses (e.g. 'SIAP_AMBIL', 'VILLA_PRIVATE', 'BOOKED')
 * into clean, layperson-friendly Indonesian labels.
 */
export function formatVerticalStatusLabel(rawStatus?: string | null): string {
  if (!rawStatus) return '-';
  const key = String(rawStatus).trim().toUpperCase();
  if (VERTICAL_STATUS_LABELS[key]) {
    return VERTICAL_STATUS_LABELS[key];
  }
  return key
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}
