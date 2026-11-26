/**
 * KasirAkun UMKM — Advanced POS, Cashier Shift Reconciliation, 0-Token SQL Anti-Fraud Detector,
 * 0-Token Smart Upselling ("Sering Dipesan Bersama"), Wholesale PriceTier, Promo & WhatsApp Receipt.
 * Strictly Decimal.js (NUMERIC(19,4)) — Zero AI Tokens!
 */

import Decimal from 'decimal.js';
import { buildJournalEntry } from '../accounting/journal-engine.ts';
import type {
  Account,
  AuditLog,
  CashierShift,
  JournalEntry,
  Order,
  PriceTier,
  Product,
  Promotion,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// =========================================================================
// 1. CASHIER SHIFT CLOSE & CASH VARIANCE JOURNAL
// =========================================================================

export function closeCashierShift(params: {
  tenantId: string;
  shift: CashierShift;
  actualClosingCash: string;
  accounts: Account[];
  entrySeq: number;
  closeDate?: string;
}): {
  closedShift: CashierShift;
  journalEntry: JournalEntry | null;
  auditLog: AuditLog | null;
} {
  const expected = new Decimal(params.shift.expectedCash || '0');
  const actual = Decimal.max(new Decimal(0), new Decimal(params.actualClosingCash || '0'));
  const variance = actual.minus(expected).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const now = new Date().toISOString();
  const closeDate = params.closeDate ?? now.slice(0, 10);

  const closedShift: CashierShift = {
    ...params.shift,
    actualClosingCash: actual.toFixed(4),
    cashVariance: variance.toFixed(4),
    status: 'CLOSED',
    closedAt: now,
  };

  if (variance.eq(0)) {
    return { closedShift, journalEntry: null, auditLog: null };
  }

  const isShortage = variance.lt(0);
  const absVar = variance.abs();

  const journalEntry = buildJournalEntry({
    id: `je-shift-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.shift.branchId,
    entryNumber: `SHF-${closeDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: closeDate,
    sourceModule: 'SHIFT',
    sourceId: params.shift.id,
    description: `Selisih Kas Tutup Shift ${params.shift.cashierName} (${isShortage ? 'Kurang' : 'Lebih'} Rp${absVar.toDecimalPlaces(0).toString()})`,
    accounts: params.accounts,
    draftLines: isShortage
      ? [
          {
            accountCode: '6109',
            debit: absVar.toFixed(4),
            credit: '0.0000',
            memo: `Beban selisih kurang laci kasir ${params.shift.cashierName}`,
          },
          {
            accountCode: '1101',
            debit: '0.0000',
            credit: absVar.toFixed(4),
            memo: `Penyesuaian saldo kas tunai fisik akhir shift`,
          },
        ]
      : [
          {
            accountCode: '1101',
            debit: absVar.toFixed(4),
            credit: '0.0000',
            memo: `Kelebihan kas tunai fisik akhir shift ${params.shift.cashierName}`,
          },
          {
            accountCode: '6109',
            debit: '0.0000',
            credit: absVar.toFixed(4),
            memo: `Pendapatan/koreksi selisih lebih kas shift`,
          },
        ],
  });

  const auditLog: AuditLog = {
    id: `aud-shift-${Date.now()}`,
    tenantId: params.tenantId,
    branchId: params.shift.branchId,
    actorName: params.shift.cashierName,
    actorEmail: params.shift.cashierEmail,
    actionType: 'SHIFT_VARIANCE',
    referenceId: params.shift.id,
    amount: variance.toFixed(4),
    reason: isShortage
      ? `Selisih kas minus Rp${absVar.toDecimalPlaces(0).toString()} saat tutup shift`
      : `Selisih kas surplus Rp${absVar.toDecimalPlaces(0).toString()} saat tutup shift`,
    createdAt: now,
  };

  return { closedShift, journalEntry, auditLog };
}

// =========================================================================
// 2. 0-TOKEN ANTI-FRAUD DETECTOR (PURE SQL/TS AGGREGATION)
// =========================================================================

export interface AntiFraudAlert {
  severity: 'HIGH' | 'MEDIUM';
  code: 'VOID_RATIO_HIGH' | 'REPEATED_CASH_SHORTAGE' | 'EXCESSIVE_MANUAL_DISCOUNT';
  actorName: string;
  actorEmail: string;
  title: string;
  detail: string;
  metricValue: string;
}

export function detectAntiFraudAnomalies(params: {
  orders: Order[];
  shifts: CashierShift[];
  auditLogs: AuditLog[];
}): AntiFraudAlert[] {
  const alerts: AntiFraudAlert[] = [];

  // 1. Check void ratio > 5% per cashier (or globally if cashierEmail omitted)
  const totalByCashier = new Map<string, { name: string; total: number; voids: number }>();
  for (const ord of params.orders) {
    const email = ord.cashierEmail || 'kasir@toko.id';
    const cur = totalByCashier.get(email) ?? { name: email.split('@')[0], total: 0, voids: 0 };
    cur.total += 1;
    if (ord.paymentStatus === 'VOID') cur.voids += 1;
    totalByCashier.set(email, cur);
  }
  for (const log of params.auditLogs) {
    if (log.actionType === 'VOID_ORDER') {
      const cur = totalByCashier.get(log.actorEmail) ?? { name: log.actorName, total: 1, voids: 0 };
      cur.name = log.actorName;
      cur.voids = Math.max(cur.voids, params.auditLogs.filter((l) => l.actorEmail === log.actorEmail && l.actionType === 'VOID_ORDER').length);
      totalByCashier.set(log.actorEmail, cur);
    }
  }

  for (const [email, stat] of totalByCashier.entries()) {
    if (stat.total >= 5 && stat.voids > 0) {
      const ratioPct = new Decimal(stat.voids).div(stat.total).times(100);
      if (ratioPct.gt(5)) {
        alerts.push({
          severity: ratioPct.gt(12) ? 'HIGH' : 'MEDIUM',
          code: 'VOID_RATIO_HIGH',
          actorName: stat.name,
          actorEmail: email,
          title: `Rasio Void Kasir Melebihi 5% (${ratioPct.toFixed(1)}%)`,
          detail: `${stat.name} mencatat ${stat.voids} pembatalan/void dari ${stat.total} transaksi. Periksa Audit Log segera.`,
          metricValue: `${ratioPct.toFixed(1)}%`,
        });
      }
    }
  }

  // 2. Repeated negative cash shift variance (>= 2 closed shifts with minus variance)
  const shortagesByCashier = new Map<string, { name: string; count: number; totalMinus: Decimal }>();
  for (const sh of params.shifts) {
    if (sh.status !== 'CLOSED') continue;
    const v = new Decimal(sh.cashVariance || '0');
    if (v.lt(0)) {
      const cur = shortagesByCashier.get(sh.cashierEmail) ?? {
        name: sh.cashierName,
        count: 0,
        totalMinus: new Decimal(0),
      };
      cur.count += 1;
      cur.totalMinus = cur.totalMinus.plus(v.abs());
      shortagesByCashier.set(sh.cashierEmail, cur);
    }
  }

  for (const [email, stat] of shortagesByCashier.entries()) {
    if (stat.count >= 2) {
      alerts.push({
        severity: 'HIGH',
        code: 'REPEATED_CASH_SHORTAGE',
        actorName: stat.name,
        actorEmail: email,
        title: `Selisih Kas Minus Berulang (${stat.count} Shift)`,
        detail: `Laci kasir ${stat.name} tercatat kurang ${stat.count} kali berturut-turut dengan akumulasi kekurangan Rp${stat.totalMinus.toDecimalPlaces(0).toNumber().toLocaleString('id-ID')}.`,
        metricValue: `-Rp${stat.totalMinus.toDecimalPlaces(0).toNumber().toLocaleString('id-ID')}`,
      });
    }
  }

  return alerts;
}

// =========================================================================
// 3. 0-TOKEN SMART UPSELLING ("SERING DIPESAN BERSAMA")
// =========================================================================

export interface UpsellSuggestion {
  product: Product;
  coOrderCount: number;
  reason: string;
}

export function getFrequentlyBoughtTogether(params: {
  cartProductIds: string[];
  orders: Order[];
  products: Product[];
  limit?: number;
}): UpsellSuggestion[] {
  const cartSet = new Set(params.cartProductIds);
  const coCounts = new Map<string, number>();

  for (const ord of params.orders) {
    if (ord.paymentStatus === 'VOID') continue;
    const itemIds = Array.from(new Set(ord.items.map((i) => i.productId)));
    const hasMatch = cartSet.size === 0 || itemIds.some((id) => cartSet.has(id));
    if (!hasMatch) continue;
    for (const id of itemIds) {
      if (cartSet.has(id)) continue;
      coCounts.set(id, (coCounts.get(id) ?? 0) + 1);
    }
  }

  const ranked = Array.from(coCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, params.limit ?? 3)
    .map(([prodId, count]) => {
      const product = params.products.find((p) => p.id === prodId && p.isAvailable);
      if (!product) return null;
      return {
        product,
        coOrderCount: count,
        reason:
          cartSet.size > 0
            ? `Sering dipesan bersama (${count}× riwayat order)`
            : `Menu terlaris pelanggan (${count}× dipesan)`,
      };
    })
    .filter((x): x is UpsellSuggestion => x !== null);

  return ranked;
}

// =========================================================================
// 4. WHOLESALE PRICE TIERS & PROMOTIONS
// =========================================================================

export function resolveEffectiveUnitPrice(params: {
  product: Product;
  qty: string;
  priceTiers: PriceTier[];
  branchOverridePrice?: string | null;
}): {
  unitPrice: string;
  appliedTierLabel: string | null;
} {
  const basePrice = new Decimal(params.branchOverridePrice || params.product.sellingPrice || '0');
  const qtyDec = new Decimal(params.qty || '1');

  const matchingTiers = params.priceTiers
    .filter((t) => t.productId === params.product.id && qtyDec.gte(new Decimal(t.minQty || '0')))
    .sort((a, b) => new Decimal(b.minQty).comparedTo(new Decimal(a.minQty)));

  if (matchingTiers.length > 0) {
    return {
      unitPrice: new Decimal(matchingTiers[0].tierPrice).toFixed(4),
      appliedTierLabel: matchingTiers[0].label,
    };
  }

  return {
    unitPrice: basePrice.toFixed(4),
    appliedTierLabel: null,
  };
}

export function calculatePromotionDiscount(params: {
  promo: Promotion | null;
  subtotal: string;
  items: Array<{ qty: string; unitPrice: string }>;
}): string {
  if (!params.promo || !params.promo.isActive) return '0.0000';
  const sub = new Decimal(params.subtotal || '0');
  const minBuy = new Decimal(params.promo.minPurchase || '0');
  if (sub.lt(minBuy)) return '0.0000';

  if (params.promo.promoType === 'PERCENT') {
    const pct = Decimal.min(new Decimal(100), Decimal.max(new Decimal(0), new Decimal(params.promo.discountValue || '0')));
    return sub.times(pct).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(4);
  }
  if (params.promo.promoType === 'FIXED' || params.promo.promoType === 'COMBO') {
    return Decimal.min(sub, Decimal.max(new Decimal(0), new Decimal(params.promo.discountValue || '0'))).toFixed(4);
  }
  if (params.promo.promoType === 'BUY_X_GET_Y') {
    const buyQty = Math.max(1, params.promo.buyQty ?? 2);
    const getQty = Math.max(1, params.promo.getQty ?? 1);
    const totalQty = params.items.reduce((s, i) => s.plus(new Decimal(i.qty || '0')), new Decimal(0));
    const groupSize = buyQty + getQty;
    const freeUnits = totalQty.div(groupSize).floor().times(getQty);
    if (freeUnits.lte(0) || params.items.length === 0) return '0.0000';
    const cheapestUnit = params.items.reduce(
      (min, i) => Decimal.min(min, new Decimal(i.unitPrice || '0')),
      new Decimal(params.items[0].unitPrice || '0')
    );
    return Decimal.min(sub, freeUnits.times(cheapestUnit)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(4);
  }
  return '0.0000';
}

// =========================================================================
// 5. WHATSAPP RECEIPT FORMATTER
// =========================================================================

export function buildWhatsAppReceiptUrl(params: {
  businessName: string;
  address: string;
  order: Order;
  receiptFooter: string;
  phoneWa?: string;
}): string {
  const digits = (params.phoneWa || params.order.customerPhoneWa || '').replace(/\D/g, '');
  const waPhone = digits
    ? digits.startsWith('0')
      ? `62${digits.slice(1)}`
      : digits
    : '';
  const fmt = (val: string) =>
    `Rp${new Decimal(val || '0').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber().toLocaleString('id-ID')}`;

  const itemLines = params.order.items.map(
    (it) =>
      `• ${it.itemNameSnapshot} (${new Decimal(it.qty).toDecimalPlaces(2).toString()}×) = ${fmt(
        new Decimal(it.qty).times(new Decimal(it.unitPrice)).toFixed(4)
      )}`
  );

  const lines = [
    `*${params.businessName}*`,
    params.address,
    `--------------------------------`,
    `No. Struk: ${params.order.orderNumber}`,
    `Tanggal: ${params.order.createdAt.slice(0, 16).replace('T', ' ')}`,
    `Pelanggan: ${params.order.customerName}`,
    `--------------------------------`,
    ...itemLines,
    `--------------------------------`,
    `Subtotal: ${fmt(params.order.subtotal)}`,
    ...(new Decimal(params.order.discountAmount || '0').gt(0)
      ? [`Diskon/Promo: -${fmt(params.order.discountAmount)}`]
      : []),
    ...(new Decimal(params.order.serviceCharge || '0').gt(0)
      ? [`Service Charge: ${fmt(params.order.serviceCharge)}`]
      : []),
    ...(new Decimal(params.order.taxAmount || '0').gt(0)
      ? [`Pajak (${params.order.taxType}): ${fmt(params.order.taxAmount)}`]
      : []),
    `*TOTAL BAYAR: ${fmt(params.order.grandTotal)}*`,
    `Status: ${params.order.paymentStatus === 'PAID' ? 'LUNAS' : params.order.paymentStatus}`,
    ``,
    params.receiptFooter,
  ];

  const base = waPhone ? `https://wa.me/${waPhone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(lines.join('\n'))}`;
}
