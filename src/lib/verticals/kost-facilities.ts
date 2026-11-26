/**
 * Pure domain helpers for Kost & Kontrakan:
 * - Facility initiation at Check-In & flexible modular Add-Ons (Ikuti Masa Sewa / 1 Bulan / Kustom)
 * - Prepaid multi-month rent calculation & exact calendar due-date advancement (1..24 bulan)
 * - Optional per-day overdue late fee calculation (Decimal.js)
 * - Mutually exclusive status classification (zero ambiguity between Telat Bayar & Belum Jatuh Tempo)
 */
import Decimal from 'decimal.js';
import type {
  BoardingAddOnDurationMode,
  BoardingBillingCycle,
  BoardingFacilityAddOn,
  BoardingInvoice,
  BoardingRoom,
} from '../../types/domain.ts';
import type { DueCountdownResult } from '../date/indonesia-date.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const DEFAULT_KOST_INCLUDED_FACILITIES: string[] = [
  'Air PDAM',
  'Listrik',
  'Wi-Fi',
  'Kasur & Lemari',
  'AC',
  'Kamar Mandi Dalam',
  'Parkir Motor',
];

export interface KostAddOnCatalogItem {
  code: string;
  name: string;
  defaultMonthlyFee: string;
  description: string;
}

export const DEFAULT_KOST_ADDON_CATALOG: KostAddOnCatalogItem[] = [
  {
    code: 'PARKIR_MOBIL',
    name: 'Parkir Mobil',
    defaultMonthlyFee: '150000',
    description: 'Slot parkir mobil penghuni',
  },
  {
    code: 'SEKAMAR_BERDUA',
    name: 'Tambahan Penghuni (Berdua)',
    defaultMonthlyFee: '250000',
    description: 'Biaya tambahan jika kamar dihuni 2 orang',
  },
  {
    code: 'LAUNDRY_BULANAN',
    name: 'Laundry Bulanan',
    defaultMonthlyFee: '120000',
    description: 'Cuci & setrika rutin bulanan',
  },
  {
    code: 'KULKAS_MINI',
    name: 'Kulkas Mini / Dispenser',
    defaultMonthlyFee: '75000',
    description: 'Pemakaian elektronik tambahan di kamar',
  },
  {
    code: 'LISTRIK_ELEKTRONIK',
    name: 'Tambahan Listrik Elektronik',
    defaultMonthlyFee: '100000',
    description: 'Tambahan daya untuk PC/TV/alat masak pribadi',
  },
  {
    code: 'AIR_GALON',
    name: 'Langganan Air Galon',
    defaultMonthlyFee: '60000',
    description: 'Refill air minum galon bulanan',
  },
];

// Mutually exclusive filter sets (zero overlap between OVERDUE and UNPAID/UPCOMING!)
export type KostDueAlertFilter = 'ALL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON';
export type KostTenantStatusFilter =
  | 'ALL'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'SAFE'
  | 'BULANAN'
  | 'TAHUNAN';
export type KostInvoiceStatusFilter = 'ALL' | 'OVERDUE' | 'UNPAID' | 'PAID';

export function inferDefaultIncludedFacilitiesFromRoom(
  room?: Pick<BoardingRoom, 'roomType' | 'includedFacilities' | 'facilities'>
): string[] {
  if (room?.includedFacilities && room.includedFacilities.length > 0) {
    return [...room.includedFacilities];
  }
  const typeLower = (room?.roomType ?? '').toLowerCase();
  const base = ['Air PDAM', 'Listrik', 'Wi-Fi', 'Kasur & Lemari', 'Parkir Motor'];
  if (!typeLower.includes('non-ac') && !typeLower.includes('non ac')) {
    base.push('AC');
  }
  if (
    typeLower.includes('km dalam') ||
    typeLower.includes('deluxe') ||
    typeLower.includes('vip') ||
    typeLower.includes('ac')
  ) {
    base.push('Kamar Mandi Dalam');
  }
  return base;
}

/**
 * Advances an ISO date (YYYY-MM-DD) by an exact number of months with end-of-month clamping.
 * Example:
 * - 2026-01-01 + 1 month -> 2026-02-01
 * - 2026-02-01 + 3 months -> 2026-05-01
 * - 2026-01-31 + 1 month -> 2026-02-28
 *
 * Prepaid Kost rule: when a tenant renews BEFORE or ON their due date, always pass their
 * current nextDueDate (NOT today's earlier payment date) so paid time is never lost!
 */
export function computePrepaidDueDate(baseIsoDate: string, monthsPaid: number): string {
  const safeMonths = Math.max(1, Math.min(36, Math.round(monthsPaid || 1)));
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((baseIsoDate || '').trim());
  const now = new Date();
  const baseYear = match ? Number(match[1]) : now.getFullYear();
  const baseMonthIdx = match ? Number(match[2]) - 1 : now.getMonth();
  const baseDay = match ? Number(match[3]) : now.getDate();

  const totalMonths = baseYear * 12 + baseMonthIdx + safeMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIdx = totalMonths % 12;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  const targetDay = Math.min(baseDay, maxDayInTargetMonth);

  const yyyy = String(targetYear).padStart(4, '0');
  const mm = String(targetMonthIdx + 1).padStart(2, '0');
  const dd = String(targetDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calculates prepaid multi-month rent using Decimal.js.
 * - Uses discounted yearlyRate when monthsCount is an exact multiple of 12 and yearlyRate > 0.
 * - Otherwise uses monthlyRate x monthsCount (so annual tenants extending by 1, 2, or 3 months
 *   seamlessly pay the monthly pro-rata rate).
 */
export function computePrepaidRentAmount(params: {
  monthlyRate: string;
  yearlyRate?: string;
  monthsCount: number;
}): string {
  const safeMonths = Math.max(1, Math.min(36, Math.round(params.monthsCount || 1)));
  const monthly = new Decimal(params.monthlyRate || '0');
  const yearly = params.yearlyRate ? new Decimal(params.yearlyRate) : new Decimal(0);

  if (safeMonths % 12 === 0 && yearly.gt(0)) {
    const years = safeMonths / 12;
    return yearly.times(years).toFixed(4);
  }
  return monthly.times(safeMonths).toFixed(4);
}

/**
 * Resolves how many months a single modular Add-On should be billed for a given rent duration.
 */
export function resolveAddOnEffectiveMonths(
  addOn: Pick<BoardingFacilityAddOn, 'durationMode' | 'durationMonths'>,
  rentMonthsCount: number
): number {
  const safeRentMonths = Math.max(1, Math.min(36, Math.round(rentMonthsCount || 1)));
  const mode: BoardingAddOnDurationMode = addOn.durationMode ?? 'FOLLOW_RENT';
  if (mode === 'ONE_MONTH') return 1;
  if (mode === 'CUSTOM') {
    return Math.max(1, Math.min(36, Math.round(addOn.durationMonths ?? 1)));
  }
  return safeRentMonths;
}

/**
 * Computes total add-on fees using Decimal.js respecting each item's flexible durationMode
 * ('FOLLOW_RENT' | 'ONE_MONTH' | 'CUSTOM').
 * Backward-compatible with billingCycle ('BULANAN' = 1 month, 'TAHUNAN' = 12 months) when
 * explicit monthsCount is not provided.
 */
export function computeFacilityAddOnsTotal(
  addOns: BoardingFacilityAddOn[] | undefined,
  cycleOrMonths: BoardingBillingCycle | number = 'BULANAN'
): string {
  if (!addOns || addOns.length === 0) return '0.0000';
  const rentMonths =
    typeof cycleOrMonths === 'number'
      ? Math.max(1, Math.round(cycleOrMonths))
      : cycleOrMonths === 'TAHUNAN'
      ? 12
      : 1;

  let total = new Decimal(0);
  for (const item of addOns) {
    const fee = new Decimal(item.monthlyFee || '0');
    if (fee.gt(0)) {
      const effectiveMonths = resolveAddOnEffectiveMonths(item, rentMonths);
      total = total.plus(fee.times(effectiveMonths));
    }
  }
  return total.toFixed(4);
}

/**
 * Computes optional per-day late fee using Decimal.js.
 * Owner explicitly chooses whether to charge a late fee when overdue (enabled === true).
 */
export function computePerDayLateFee(params: {
  daysOverdue: number;
  dailyFee: string;
  enabled: boolean;
}): string {
  if (!params.enabled) return '0.0000';
  const safeDays = Math.max(0, Math.floor(params.daysOverdue || 0));
  if (safeDays === 0) return '0.0000';
  const fee = new Decimal(params.dailyFee || '0');
  if (fee.lte(0)) return '0.0000';
  return fee.times(safeDays).toFixed(4);
}

/**
 * Mutually exclusive tenant urgency bucket:
 * - OVERDUE: melewati jatuh tempo (otomatis belum bayar/telat, tidak dobel dengan Belum Bayar)
 * - DUE_TODAY: jatuh tempo hari ini
 * - DUE_SOON: jatuh tempo <= 7 hari lagi
 * - SAFE: aktif & belum mendekati jatuh tempo
 */
export function classifyKostTenantBucket(params: {
  countdownStatus: DueCountdownResult['status'];
  unpaidInvoice?: Pick<BoardingInvoice, 'paymentStatus'>;
}): 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'SAFE' {
  if (
    params.countdownStatus === 'OVERDUE' ||
    params.unpaidInvoice?.paymentStatus === 'OVERDUE'
  ) {
    return 'OVERDUE';
  }
  if (params.countdownStatus === 'DUE_TODAY') {
    return 'DUE_TODAY';
  }
  if (params.countdownStatus === 'DUE_SOON') {
    return 'DUE_SOON';
  }
  return 'SAFE';
}

export function matchesKostTenantFilter(params: {
  filter: KostTenantStatusFilter;
  bucket: ReturnType<typeof classifyKostTenantBucket>;
  billingCycle: BoardingBillingCycle;
  hasUnpaidInvoice?: boolean;
}): boolean {
  switch (params.filter) {
    case 'ALL':
      return true;
    case 'OVERDUE':
      return params.bucket === 'OVERDUE';
    case 'DUE_TODAY':
      return params.bucket === 'DUE_TODAY';
    case 'DUE_SOON':
      return params.bucket === 'DUE_SOON';
    case 'SAFE':
      return params.bucket === 'SAFE';
    case 'BULANAN':
      return params.billingCycle === 'BULANAN';
    case 'TAHUNAN':
      return params.billingCycle === 'TAHUNAN';
    default:
      return true;
  }
}

/**
 * Mutually exclusive invoice bucket:
 * - PAID: sudah lunas
 * - OVERDUE: lewat jatuh tempo & belum lunas (Telat Bayar)
 * - UNPAID: tagihan terbit namun BELUM melewati jatuh tempo (Menunggu Pelunasan)
 */
export function classifyKostInvoiceBucket(params: {
  paymentStatus: BoardingInvoice['paymentStatus'];
  countdownStatus: DueCountdownResult['status'];
}): 'OVERDUE' | 'UNPAID' | 'PAID' {
  if (params.paymentStatus === 'PAID') return 'PAID';
  if (params.paymentStatus === 'OVERDUE' || params.countdownStatus === 'OVERDUE') {
    return 'OVERDUE';
  }
  return 'UNPAID';
}

export function formatAddOnsSummary(
  addOns?: BoardingFacilityAddOn[],
  rentMonthsCount: number = 1
): string {
  if (!addOns || addOns.length === 0) return '';
  return addOns
    .map((a) => {
      const m = resolveAddOnEffectiveMonths(a, rentMonthsCount);
      return m > 1 ? `${a.name} (${m} bln)` : a.name;
    })
    .join(', ');
}
