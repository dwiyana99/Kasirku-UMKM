/**
 * KasirAkun UMKM — Direct WhatsApp (`wa.me`) Utility (Gratis mulai Paket LITE, Tanpa Add-On Fonnte)
 *
 * Requirement:
 * - Allows Paket LITE (and all plans) to send structured WhatsApp notifications directly via `wa.me`
 *   using the business owner's own WhatsApp app, PROVIDED the owner has filled in their own
 *   business WhatsApp number (`tenant.settings.businessWhatsappNumber`).
 * - If the business WA number is empty, returns `{ ready: false }` so the UI guides the owner to save
 *   their WhatsApp number in 1 click.
 */

export function normalizeIndonesianWaDigits(rawPhone?: string | null): string | null {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return `62${digits}`;
}

export interface DirectWaCheckResult {
  ready: boolean;
  ownerDigits: string | null;
  reason?: string;
}

export function checkDirectWaReadiness(businessWhatsappNumber?: string | null): DirectWaCheckResult {
  const digits = normalizeIndonesianWaDigits(businessWhatsappNumber);
  if (!digits) {
    return {
      ready: false,
      ownerDigits: null,
      reason:
        'Isi Nomor WhatsApp Usaha Anda terlebih dahulu agar bisa langsung kirim pesan ke pelanggan lewat wa.me tanpa Add-On Fonnte.',
    };
  }
  return { ready: true, ownerDigits: digits };
}

export interface BuildDirectWaLinkInput {
  businessWhatsappNumber?: string | null;
  customerPhone?: string | null;
  message: string;
}

export function buildDirectWaMeUrl(input: BuildDirectWaLinkInput): {
  ok: boolean;
  url: string | null;
  error?: string;
} {
  const ownerCheck = checkDirectWaReadiness(input.businessWhatsappNumber);
  if (!ownerCheck.ready) {
    return { ok: false, url: null, error: ownerCheck.reason };
  }
  const targetDigits = normalizeIndonesianWaDigits(input.customerPhone);
  if (!targetDigits) {
    return {
      ok: false,
      url: null,
      error: 'Nomor WhatsApp pelanggan belum diisi atau tidak valid.',
    };
  }
  return {
    ok: true,
    url: `https://wa.me/${targetDigits}?text=${encodeURIComponent(input.message)}`,
  };
}

export function formatRpWa(amountStr: string): string {
  const num = Math.round(Number(amountStr || 0));
  return `Rp${num.toLocaleString('id-ID')}`;
}

export function buildLaundryStatusWaMessage(params: {
  businessName: string;
  ticketNumber: string;
  customerName: string;
  statusLabel: string;
  itemSummary: string;
  rackLocation?: string;
  totalAmount: string;
  remainingAmount: string;
}): string {
  const rackLine = params.rackLocation ? `\nLokasi Rak: ${params.rackLocation}` : '';
  const billLine =
    Number(params.remainingAmount) > 0
      ? `\nSisa Tagihan: ${formatRpWa(params.remainingAmount)} (dari total ${formatRpWa(params.totalAmount)})`
      : `\nStatus Pembayaran: LUNAS (${formatRpWa(params.totalAmount)})`;

  return [
    `Halo Kak ${params.customerName},`,
    `Update cucian Anda di *${params.businessName}*:`,
    `No. Nota: ${params.ticketNumber}`,
    `Cucian: ${params.itemSummary}`,
    `Status Terbaru: *${params.statusLabel}*${rackLine}${billLine}`,
    `Terima kasih telah menggunakan layanan kami!`,
  ].join('\n');
}

export function buildDirectWaLink(
  customerPhone?: string | null,
  message?: string
): string | null {
  const targetDigits = normalizeIndonesianWaDigits(customerPhone);
  if (!targetDigits) return null;
  const text = (message || '').trim();
  return text
    ? `https://wa.me/${targetDigits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${targetDigits}`;
}

export function buildLaundryReadyWaMessage(params: {
  businessName: string;
  customerName: string;
  ticketNumber: string;
  rackCode?: string;
  totalAmount: string;
  isPaid: boolean;
}): string {
  const rackLine = params.rackCode ? `\nLokasi Rak: ${params.rackCode}` : '';
  const payLine = params.isPaid
    ? `\nStatus Pembayaran: LUNAS (${formatRpWa(params.totalAmount)})`
    : `\nTotal Tagihan: *${formatRpWa(params.totalAmount)}* (bayar saat ambil)`;
  return [
    `Halo Kak ${params.customerName},`,
    `Cucian Anda di *${params.businessName}* sudah *SIAP DIAMBIL*!`,
    `No. Nota: ${params.ticketNumber}${rackLine}${payLine}`,
    `Terima kasih telah menggunakan layanan kami.`,
  ].join('\n');
}

export function buildGenericBookingWaMessage(params: {
  businessName: string;
  customerName: string;
  bookingRef: string;
  summaryLine: string;
  totalAmount: string;
}): string {
  return [
    `Halo Kak ${params.customerName},`,
    `Info pesanan/layanan dari *${params.businessName}*:`,
    `Ref: ${params.bookingRef}`,
    params.summaryLine,
    `Total: *${formatRpWa(params.totalAmount)}*`,
    `Terima kasih!`,
  ].join('\n');
}

export function buildDueReminderWaMessage(params: {
  businessName: string;
  recipientName?: string;
  customerName?: string;
  itemLabel: string;
  dueDate: string;
  amount?: string;
  amountDue?: string;
}): string {
  const targetName = params.customerName || params.recipientName || 'Pelanggan';
  const nominal = params.amountDue ?? params.amount ?? '0';
  return [
    `Halo Kak ${targetName},`,
    `Pengingat ramah dari *${params.businessName}* untuk tagihan:`,
    `Layanan: ${params.itemLabel}`,
    `Jatuh Tempo: ${params.dueDate}`,
    `Nominal: *${formatRpWa(nominal)}*`,
    `Mohon konfirmasi jika sudah melakukan pembayaran. Terima kasih!`,
  ].join('\n');
}

export function buildBookingConfirmationWaMessage(params: {
  businessName: string;
  customerName: string;
  bookingCode: string;
  unitOrCourtName: string;
  scheduleLabel: string;
  totalAmount: string;
  dpOrPaidAmount: string;
  remainingAmount: string;
}): string {
  return [
    `Halo Kak ${params.customerName},`,
    `Konfirmasi booking di *${params.businessName}*:`,
    `Kode Booking: ${params.bookingCode}`,
    `Unit / Jadwal: ${params.unitOrCourtName} (${params.scheduleLabel})`,
    `Total: ${formatRpWa(params.totalAmount)}`,
    `DP / Terbayar: ${formatRpWa(params.dpOrPaidAmount)}`,
    `Sisa Pelunasan: *${formatRpWa(params.remainingAmount)}*`,
    `Sampai jumpa sesuai jadwal!`,
  ].join('\n');
}
