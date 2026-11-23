/**
 * KasirAkun UMKM — Pure Sales Return Engine (Retur Penjualan)
 * Zero AI tokens. Uses Decimal.js for exact Rupiah & stock calculations.
 *
 * Capabilities:
 * - Determines which UMKM verticals sell physical goods eligible for Sales Returns.
 * - Validates returned quantities against original order quantities minus previous returns.
 * - Computes exact proportional tax reversal (PPN / PB1 / PBJT), net refund, and COGS restoration.
 * - Generates InventoryMovement ('RETURN_IN') records ONLY for items marked `restockToWarehouse = true`.
 * - Generates a balanced immutable Double-Entry Reversal Journal:
 *   Dr 4101 Pendapatan Penjualan (subtotalRefund)
 *   Dr 2102 Utang PPN Keluaran / 2103 Utang PB1/PBJT Daerah (taxReversed, if > 0)
 *     Cr 1101 Kas Tunai / 1102 Bank (totalRefundAmount)
 *   If any item is returned to sellable warehouse stock (totalCogsRestored > 0):
 *   Dr 1105 Persediaan Barang Dagang (totalCogsRestored)
 *     Cr 5101 Harga Pokok Penjualan / HPP (totalCogsRestored)
 */

import Decimal from 'decimal.js';
import type {
  Account,
  BusinessVertical,
  InventoryMovement,
  JournalEntry,
  Order,
  SalesReturnItem,
  SalesReturnReason,
  SalesReturnRecord,
} from '../../types/domain';
import { buildJournalEntry, type DraftJournalLine } from '../accounting/journal-engine';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const SALES_RETURN_REASON_LABELS: Record<SalesReturnReason, string> = {
  BARANG_RUSAK: 'Barang rusak / cacat saat diterima',
  SALAH_BARANG_UKURAN: 'Salah kirim barang / ukuran / varian',
  KADALUARSA: 'Mendekati / melewati masa kedaluwarsa',
  PELANGGAN_BATAL: 'Pelanggan membatalkan / tukar pembelian',
  LAINNYA: 'Alasan lainnya',
};

const GOODS_VERTICALS_SUPPORTING_RETURNS: BusinessVertical[] = [
  'WARUNG_SEMBAKO',
  'TOKO_RETAIL',
  'TOKO_FASHION',
  'TOKO_BANGUNAN',
  'BAKERY_CATERING',
  'PET_SHOP',
  'MANUFAKTUR_KECIL',
  'KEDAI_MAKAN',
  'RESTORAN',
  'PETERNAKAN_PERTANIAN',
];

export function verticalSupportsSalesReturns(vertical: BusinessVertical): boolean {
  return GOODS_VERTICALS_SUPPORTING_RETURNS.includes(vertical);
}

export interface ReturnLineRequest {
  productId: string;
  qtyToReturn: string;
  restockToWarehouse: boolean;
}

export interface BuildSalesReturnInput {
  tenantId: string;
  branchId?: string | null;
  order: Order;
  existingReturnsForOrder: SalesReturnRecord[];
  lines: ReturnLineRequest[];
  reason: SalesReturnReason;
  notes?: string;
  refundAccountCode: '1101' | '1102';
  accounts: Account[];
  processedByName: string;
  returnId?: string;
  returnNumber?: string;
  entryNumber?: string;
  nowIso?: string;
}

export interface BuildSalesReturnResult {
  ok: boolean;
  error?: string;
  returnRecord?: SalesReturnRecord;
  journalEntry?: JournalEntry;
  inventoryMovements?: InventoryMovement[];
  stockDeltas?: Array<{ productId: string; qtyAdded: string; unitCost: string }>;
}

/**
 * Computes remaining returnable quantity for each product in an order,
 * accounting for any prior SalesReturnRecord entries referencing the same order.
 */
export function getRemainingReturnableQtyMap(
  order: Order,
  existingReturnsForOrder: SalesReturnRecord[]
): Record<string, string> {
  const soldMap: Record<string, Decimal> = {};
  for (const item of order.items) {
    const prev = soldMap[item.productId] ?? new Decimal(0);
    soldMap[item.productId] = prev.plus(new Decimal(item.qty || '0'));
  }

  for (const ret of existingReturnsForOrder) {
    if (ret.orderId !== order.id) continue;
    for (const ri of ret.items) {
      if (soldMap[ri.productId]) {
        soldMap[ri.productId] = Decimal.max(
          new Decimal(0),
          soldMap[ri.productId].minus(new Decimal(ri.qtyReturned || '0'))
        );
      }
    }
  }

  const out: Record<string, string> = {};
  for (const [productId, qty] of Object.entries(soldMap)) {
    out[productId] = qty.toFixed(4);
  }
  return out;
}

export function buildSalesReturnExecution(input: BuildSalesReturnInput): BuildSalesReturnResult {
  const { order, existingReturnsForOrder, lines, accounts } = input;

  if (order.paymentStatus !== 'PAID') {
    return {
      ok: false,
      error: 'Retur penjualan hanya dapat diproses untuk transaksi berstatus LUNAS (PAID).',
    };
  }

  const activeRequests = lines.filter((l) => new Decimal(l.qtyToReturn || '0').gt(0));
  if (activeRequests.length === 0) {
    return {
      ok: false,
      error: 'Masukkan minimal 1 barang dengan jumlah retur lebih besar dari 0.',
    };
  }

  const remainingMap = getRemainingReturnableQtyMap(order, existingReturnsForOrder);
  const resolvedItems: SalesReturnItem[] = [];
  let subtotalRefund = new Decimal(0);
  let totalCogsRestored = new Decimal(0);

  for (const req of activeRequests) {
    const orderItem = order.items.find((i) => i.productId === req.productId);
    if (!orderItem) {
      return {
        ok: false,
        error: `Barang dengan ID ${req.productId} tidak ditemukan pada nota ${order.orderNumber}.`,
      };
    }

    const qtyDec = new Decimal(req.qtyToReturn || '0');
    const maxRemaining = new Decimal(remainingMap[req.productId] ?? '0');

    if (qtyDec.lte(0)) {
      return { ok: false, error: `Jumlah retur untuk ${orderItem.itemNameSnapshot} harus > 0.` };
    }
    if (qtyDec.gt(maxRemaining)) {
      return {
        ok: false,
        error: `Jumlah retur ${orderItem.itemNameSnapshot} (${qtyDec.toNumber()}) melebihi sisa yang bisa diretur (${maxRemaining.toNumber()}).`,
      };
    }

    const unitPrice = new Decimal(orderItem.unitPrice || '0');
    const unitCogs = new Decimal(orderItem.unitCogs || '0');
    const lineRefund = unitPrice.times(qtyDec).toDecimalPlaces(4);
    const lineCogs = req.restockToWarehouse
      ? unitCogs.times(qtyDec).toDecimalPlaces(4)
      : new Decimal(0);

    subtotalRefund = subtotalRefund.plus(lineRefund);
    totalCogsRestored = totalCogsRestored.plus(lineCogs);

    resolvedItems.push({
      productId: orderItem.productId,
      itemNameSnapshot: orderItem.itemNameSnapshot,
      qtyReturned: qtyDec.toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      unitCogs: unitCogs.toFixed(4),
      lineRefundSubtotal: lineRefund.toFixed(4),
      lineCogsRestored: lineCogs.toFixed(4),
      restockToWarehouse: req.restockToWarehouse,
    });
  }

  // Proportional discount & tax reversal relative to original order subtotal
  const orderSubtotal = new Decimal(order.subtotal || '0');
  const orderDiscount = new Decimal(order.discountAmount || '0');
  const orderTax = new Decimal(order.taxAmount || '0');

  const ratio = orderSubtotal.gt(0)
    ? Decimal.min(new Decimal(1), subtotalRefund.div(orderSubtotal))
    : new Decimal(0);

  const proportionalDiscount = orderDiscount.times(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const netSalesRefund = Decimal.max(new Decimal(0), subtotalRefund.minus(proportionalDiscount));
  const taxReversed = orderTax.times(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const totalRefundAmount = netSalesRefund.plus(taxReversed);

  const nowIso = input.nowIso ?? new Date().toISOString();
  const returnId = input.returnId ?? `ret-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const returnNumber =
    input.returnNumber ?? `RET-${nowIso.slice(2, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const journalId = `je-ret-${returnId}`;
  const entryNumber = input.entryNumber ?? `JE-RET-${String(Date.now()).slice(-5)}`;

  // Resolve tax liability account code matching original order taxType
  const isLocalPbjt =
    order.taxType === 'PB1_RESTO_10' ||
    order.taxType === 'PBJT_HOTEL_10' ||
    order.taxType === 'PBJT_SPA_HIBURAN' ||
    order.taxType === 'PBJT_PARKIR';
  const taxAccountCode = isLocalPbjt ? '2103' : '2102';
  const fallbackTaxCode = accounts.some((a) => a.code === taxAccountCode)
    ? taxAccountCode
    : accounts.some((a) => a.code === '2102')
      ? '2102'
      : '4101';

  const draftLines: DraftJournalLine[] = [];

  if (fallbackTaxCode === '4101' || taxReversed.lte(0)) {
    draftLines.push({
      accountCode: '4101',
      debit: totalRefundAmount.toFixed(4),
      credit: '0.0000',
      memo: `Retur Penjualan ${returnNumber} (Ref ${order.orderNumber})`,
    });
  } else {
    draftLines.push({
      accountCode: '4101',
      debit: netSalesRefund.toFixed(4),
      credit: '0.0000',
      memo: `Koreksi Pendapatan Retur ${returnNumber}`,
    });
    draftLines.push({
      accountCode: fallbackTaxCode,
      debit: taxReversed.toFixed(4),
      credit: '0.0000',
      memo: `Koreksi Pajak Retur ${returnNumber}`,
    });
  }

  draftLines.push({
    accountCode: input.refundAccountCode,
    debit: '0.0000',
    credit: totalRefundAmount.toFixed(4),
    memo: `Pengembalian Dana Pelanggan ${order.customerName} (${returnNumber})`,
  });

  // Restore inventory & reverse HPP for items returned to sellable warehouse stock
  if (
    totalCogsRestored.gt(0) &&
    accounts.some((a) => a.code === '1105') &&
    accounts.some((a) => a.code === '5101')
  ) {
    draftLines.push({
      accountCode: '1105',
      debit: totalCogsRestored.toFixed(4),
      credit: '0.0000',
      memo: `Pemulihan Persediaan Gudang dari Retur ${returnNumber}`,
    });
    draftLines.push({
      accountCode: '5101',
      debit: '0.0000',
      credit: totalCogsRestored.toFixed(4),
      memo: `Pembalikan HPP atas Retur ${returnNumber}`,
    });
  }

  const journalEntry = buildJournalEntry({
    id: journalId,
    tenantId: input.tenantId,
    branchId: input.branchId ?? order.branchId ?? null,
    entryNumber,
    entryDate: nowIso.slice(0, 10),
    sourceModule: 'SALES_RETURN',
    sourceId: returnId,
    description: `Retur Penjualan ${returnNumber} atas Nota ${order.orderNumber} (${SALES_RETURN_REASON_LABELS[input.reason]})`,
    accounts,
    draftLines,
  });

  const inventoryMovements: InventoryMovement[] = [];
  const stockDeltas: Array<{ productId: string; qtyAdded: string; unitCost: string }> = [];

  for (const item of resolvedItems) {
    if (!item.restockToWarehouse) continue;
    stockDeltas.push({
      productId: item.productId,
      qtyAdded: item.qtyReturned,
      unitCost: item.unitCogs,
    });
    inventoryMovements.push({
      id: `mov-ret-${returnId}-${item.productId}`,
      tenantId: input.tenantId,
      branchId: input.branchId ?? order.branchId ?? null,
      productId: item.productId,
      movementType: 'RETURN_IN',
      qtyChange: item.qtyReturned,
      unitCost: item.unitCogs,
      referenceId: returnId,
      notes: `Retur masuk gudang (${returnNumber} · Ref ${order.orderNumber})`,
      actorName: input.processedByName,
      createdAt: nowIso,
    });
  }

  const returnRecord: SalesReturnRecord = {
    id: returnId,
    tenantId: input.tenantId,
    branchId: input.branchId ?? order.branchId ?? null,
    returnNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    reason: input.reason,
    notes: input.notes?.trim() || undefined,
    refundAccountCode: input.refundAccountCode,
    subtotalRefund: netSalesRefund.toFixed(4),
    taxReversed: taxReversed.toFixed(4),
    totalRefundAmount: totalRefundAmount.toFixed(4),
    totalCogsRestored: totalCogsRestored.toFixed(4),
    journalEntryId: journalEntry.id,
    items: resolvedItems,
    processedByName: input.processedByName,
    createdAt: nowIso,
  };

  return {
    ok: true,
    returnRecord,
    journalEntry,
    inventoryMovements,
    stockDeltas,
  };
}
