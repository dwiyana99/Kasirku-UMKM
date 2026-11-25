/**
 * Centralized WhatsApp Sending Policy & Cashier Kiosk Focus Helper.
 *
 * Business rules:
 * 1. If the owner has NOT filled in their business/owner WhatsApp number in Settings
 *    (`tenant.settings.businessWhatsappNumber`), ALL WhatsApp sending buttons (owner recap,
 *    customer receipt/order details, billing reminders) MUST be hidden so the UI stays clean
 *    and never confuses non-tech-savvy owners.
 * 2. When the owner WA number IS missing, the Dashboard Ringkasan displays a clear reminder
 *    with a 1-click link to Settings.
 * 3. When the owner WA number IS configured:
 *    - Without Fonnte Add-On (`hasFonnte === false`): sends directly via `https://wa.me/...`
 *      (for owner recap -> directly to owner's saved WA digits; for customer receipt -> to
 *      customer's WA digits via DirectWaCustomerModal).
 *    - With Fonnte Add-On (`hasFonnte === true`): unlocks automated Fonnte WhatsApp Gateway.
 */

import Decimal from 'decimal.js';
import type { AppSession, Order, Tenant } from '../../types/domain';
import { formatRupiah } from '../pos/checkout-service';
import { normalizeIndonesianWaDigits } from './whatsapp-direct';

export type WhatsappSendChannel = 'HIDDEN' | 'WA_ME_DIRECT' | 'FONNTE';

export interface WhatsappPolicyState {
  hasOwnerWa: boolean;
  ownerWaDigits: string | null;
  hasFonnte: boolean;
  channel: WhatsappSendChannel;
  canShowSendButtons: boolean;
  canSendOwnerRecap: boolean;
  canSendCustomerMessage: boolean;
  needsOwnerWaReminder: boolean;
}

export function evaluateWhatsappSendingPolicy(input: {
  businessWhatsappNumber?: string | null;
  hasFonnte: boolean;
}): WhatsappPolicyState {
  const ownerWaDigits = normalizeIndonesianWaDigits(input.businessWhatsappNumber);
  const hasOwnerWa = Boolean(ownerWaDigits);

  if (!hasOwnerWa) {
    return {
      hasOwnerWa: false,
      ownerWaDigits: null,
      hasFonnte: input.hasFonnte,
      channel: 'HIDDEN',
      canShowSendButtons: false,
      canSendOwnerRecap: false,
      canSendCustomerMessage: false,
      needsOwnerWaReminder: true,
    };
  }

  return {
    hasOwnerWa: true,
    ownerWaDigits,
    hasFonnte: input.hasFonnte,
    channel: input.hasFonnte ? 'FONNTE' : 'WA_ME_DIRECT',
    canShowSendButtons: true,
    canSendOwnerRecap: true,
    canSendCustomerMessage: true,
    needsOwnerWaReminder: false,
  };
}

export function buildOwnerRecapWaUrl(input: {
  businessWhatsappNumber?: string | null;
  message: string;
}): { ok: boolean; url: string | null; ownerDigits: string | null } {
  const ownerDigits = normalizeIndonesianWaDigits(input.businessWhatsappNumber);
  if (!ownerDigits) {
    return { ok: false, url: null, ownerDigits: null };
  }
  const encoded = encodeURIComponent(input.message.trim());
  return {
    ok: true,
    ownerDigits,
    url: `https://wa.me/${ownerDigits}?text=${encoded}`,
  };
}

export function formatPaymentMethodIndonesian(method: string): string {
  switch (method) {
    case 'CASH':
      return 'Tunai';
    case 'QRIS_DYNAMIC':
      return 'QRIS';
    case 'EWALLET_GOPAY':
      return 'GoPay';
    case 'EWALLET_DANA':
      return 'DANA';
    case 'EWALLET_OVO':
      return 'OVO';
    case 'EWALLET_SHOPEEPAY':
      return 'ShopeePay';
    case 'VIRTUAL_ACCOUNT':
      return 'Virtual Account';
    case 'BANK_TRANSFER':
      return 'Transfer Bank';
    case 'CARD':
      return 'Kartu Debit/Kredit';
    default:
      return method;
  }
}

export function buildCustomerReceiptWaMessage(params: {
  tenant: Pick<Tenant, 'name' | 'address' | 'receiptFooter'>;
  order: Order;
}): string {
  const { tenant, order } = params;
  return [
    `*${tenant.name.toUpperCase()}*`,
    tenant.address ? tenant.address : null,
    `No. Nota: ${order.orderNumber}`,
    `Pelanggan: ${order.customerName}`,
    '---',
    ...order.items.map((it) => {
      const sub = new Decimal(it.qty).times(new Decimal(it.unitPrice));
      return `${Number(it.qty)}x ${it.itemNameSnapshot} = ${formatRupiah(sub)}`;
    }),
    '---',
    `*TOTAL: ${formatRupiah(order.grandTotal)}*`,
    order.payment
      ? `Metode: ${formatPaymentMethodIndonesian(order.payment.paymentMethod)} (Lunas)`
      : null,
    tenant.receiptFooter || 'Terima kasih atas kunjungan Anda.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Determines whether the current session should use Cashier Kiosk Focus Mode on `/pos`:
 * staff users whose role is focused solely on cashier sales (no accounting/catalog/inventory/expense admin permissions).
 */
export function isCashierKioskFocusSession(
  session: Pick<AppSession, 'role' | 'staffPermissions'>,
  route: string
): boolean {
  if (session.role !== 'STAFF') return false;
  if (route !== '/pos') return false;
  const perms = session.staffPermissions ?? [];
  if (!perms.includes('POS_CASHIER')) return false;
  const hasBackofficePerm = perms.some(
    (p) =>
      p === 'ACCOUNTING_TAX' ||
      p === 'CATALOG_MANAGE' ||
      p === 'INVENTORY_RESTOCK' ||
      p === 'INVENTORY_OPNAME' ||
      p === 'EXPENSE_INPUT'
  );
  return !hasBackofficePerm;
}
