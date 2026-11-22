/**
 * KasirAkun UMKM — Multi-Branch Stock Matrix, 3-Step Stock Transfer (Goods-in-Transit),
 * Supplier PO with Landed Cost & Tempo Hutang, and Blind-Count Stock Opname Engine.
 * Strictly Decimal.js (NUMERIC(19,4)) with immutable double-entry balanced journals.
 */

import Decimal from 'decimal.js';
import { buildJournalEntry } from '../accounting/journal-engine';
import type {
  Account,
  Branch,
  BranchStock,
  JournalEntry,
  Product,
  PurchaseOrder,
  StockOpnameItem,
  StockOpnameSession,
  StockTransfer,
} from '../../types/domain';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// =========================================================================
// 1. MULTI-BRANCH STOCK HELPERS
// =========================================================================

export function ensureBranchStocksForTenant(params: {
  tenantId: string;
  branches: Branch[];
  products: Product[];
  existingStocks: BranchStock[];
}): BranchStock[] {
  const map = new Map<string, BranchStock>();
  for (const bs of params.existingStocks) {
    map.set(`${bs.branchId}:${bs.productId}`, bs);
  }
  const now = new Date().toISOString();
  const defaultBranch = params.branches.find((b) => b.isDefault) ?? params.branches[0];

  for (const branch of params.branches) {
    for (const prod of params.products) {
      if (prod.itemType === 'SERVICE_FREELANCE' || prod.itemType === 'MENU_ITEM') continue;
      const key = `${branch.id}:${prod.id}`;
      if (!map.has(key)) {
        const isDefault = defaultBranch && branch.id === defaultBranch.id;
        map.set(key, {
          id: `bs-${branch.id}-${prod.id}`,
          tenantId: params.tenantId,
          branchId: branch.id,
          productId: prod.id,
          stockQty: isDefault ? prod.stockQty : '0.0000',
          minStockAlert: prod.minStockAlert,
          sellingPriceOverride: null,
          movingAvgCost: prod.costPriceAvg,
          updatedAt: now,
        });
      }
    }
  }
  return Array.from(map.values());
}

// =========================================================================
// 2. 3-STEP INTER-BRANCH STOCK TRANSFER (REQUESTED -> IN_TRANSIT -> RECEIVED)
// =========================================================================

/**
 * Step 2: Source Branch clicks "Kirim Barang" -> IN_TRANSIT
 * - Deducts source branch stock atomically.
 * - Posts balanced journal:
 *     Dr Persediaan Dalam Perjalanan / Goods in Transit (1108)
 *     Cr Persediaan Cabang Sumber (1105)
 */
export function shipStockTransfer(params: {
  tenantId: string;
  transfer: StockTransfer;
  sourceBranchName: string;
  destinationBranchName: string;
  branchStocks: BranchStock[];
  accounts: Account[];
  entrySeq: number;
  shipDate?: string;
}): {
  updatedTransfer: StockTransfer;
  updatedBranchStocks: BranchStock[];
  journalEntry: JournalEntry;
} {
  if (params.transfer.status !== 'REQUESTED') {
    throw new Error('Hanya permintaan stok berstatus REQUESTED yang dapat dikirim.');
  }

  const now = new Date().toISOString();
  const shipDate = params.shipDate ?? now.slice(0, 10);
  const nextStocks = params.branchStocks.map((bs) => ({ ...bs }));
  let totalTransitValue = new Decimal(0);

  const updatedItems = params.transfer.items.map((item) => {
    const reqQty = new Decimal(item.requestedQty || '0');
    if (reqQty.lte(0)) {
      throw new Error(`Jumlah transfer untuk ${item.productNameSnapshot} harus lebih besar dari 0.`);
    }
    const srcIdx = nextStocks.findIndex(
      (bs) => bs.branchId === params.transfer.sourceBranchId && bs.productId === item.productId
    );
    if (srcIdx === -1) {
      throw new Error(`Stok ${item.productNameSnapshot} di ${params.sourceBranchName} tidak ditemukan.`);
    }
    const srcStock = new Decimal(nextStocks[srcIdx].stockQty || '0');
    if (srcStock.lt(reqQty)) {
      throw new Error(
        `Stok ${item.productNameSnapshot} di ${params.sourceBranchName} tidak cukup (tersedia ${srcStock.toFixed(2)}, diminta ${reqQty.toFixed(2)}).`
      );
    }

    const unitCost = new Decimal(nextStocks[srcIdx].movingAvgCost || item.unitCostAtShip || '0');
    nextStocks[srcIdx] = {
      ...nextStocks[srcIdx],
      stockQty: srcStock.minus(reqQty).toFixed(4),
      updatedAt: now,
    };
    totalTransitValue = totalTransitValue.plus(reqQty.times(unitCost));

    return {
      ...item,
      shippedQty: reqQty.toFixed(4),
      unitCostAtShip: unitCost.toFixed(4),
    };
  });

  const roundedTransit = totalTransitValue.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const journalEntry = buildJournalEntry({
    id: `je-trf-ship-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.transfer.sourceBranchId,
    entryNumber: `TRF-OUT-${shipDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: shipDate,
    sourceModule: 'STOCK_TRANSFER',
    sourceId: params.transfer.id,
    description: `Kirim Mutasi Stok ${params.transfer.transferNumber}: ${params.sourceBranchName} → ${params.destinationBranchName}`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '1108',
        debit: roundedTransit.toFixed(4),
        credit: '0.0000',
        memo: `Barang dalam perjalanan ke ${params.destinationBranchName}`,
      },
      {
        accountCode: '1105',
        debit: '0.0000',
        credit: roundedTransit.toFixed(4),
        memo: `Pengurangan persediaan ${params.sourceBranchName}`,
      },
    ],
  });

  const updatedTransfer: StockTransfer = {
    ...params.transfer,
    status: 'IN_TRANSIT',
    shippedAt: now,
    items: updatedItems,
  };

  return { updatedTransfer, updatedBranchStocks: nextStocks, journalEntry };
}

/**
 * Step 3: Destination Branch verifies physical items & clicks "Terima Barang" -> RECEIVED
 * - Supports damaged/shortage qty during transit.
 * - Updates destination branch stock & recalculates Moving Average cost.
 * - Posts balanced journal:
 *     Dr Persediaan Cabang Tujuan (1105) -> Good Received Value
 *     Dr Beban Selisih / Kerusakan Persediaan (6108) -> Damaged Value (if > 0)
 *     Cr Persediaan Dalam Perjalanan (1108) -> Full Shipped Transit Value
 */
export function receiveStockTransfer(params: {
  tenantId: string;
  transfer: StockTransfer;
  destinationBranchName: string;
  receivedQuantities: Record<string, { receivedQty: string; damagedQty?: string }>;
  branchStocks: BranchStock[];
  accounts: Account[];
  entrySeq: number;
  receiveDate?: string;
}): {
  updatedTransfer: StockTransfer;
  updatedBranchStocks: BranchStock[];
  journalEntry: JournalEntry;
} {
  if (params.transfer.status !== 'IN_TRANSIT') {
    throw new Error('Hanya transfer berstatus IN_TRANSIT yang dapat diterima.');
  }

  const now = new Date().toISOString();
  const receiveDate = params.receiveDate ?? now.slice(0, 10);
  const nextStocks = params.branchStocks.map((bs) => ({ ...bs }));

  let totalReceivedValue = new Decimal(0);
  let totalDamagedValue = new Decimal(0);

  const updatedItems = params.transfer.items.map((item) => {
    const shipped = new Decimal(item.shippedQty || item.requestedQty || '0');
    const override = params.receivedQuantities[item.productId];
    const received = override ? new Decimal(override.receivedQty || '0') : shipped;
    const damaged = override?.damagedQty
      ? new Decimal(override.damagedQty || '0')
      : Decimal.max(new Decimal(0), shipped.minus(received));

    if (received.lt(0) || damaged.lt(0)) {
      throw new Error('Qty diterima atau rusak tidak boleh negatif.');
    }
    if (!received.plus(damaged).equals(shipped)) {
      throw new Error(
        `Qty diterima (${received.toFixed(2)}) + Qty rusak (${damaged.toFixed(2)}) harus sama dengan Qty dikirim (${shipped.toFixed(2)}) untuk ${item.productNameSnapshot}.`
      );
    }

    const unitCost = new Decimal(item.unitCostAtShip || '0');
    const goodVal = received.times(unitCost);
    const dmgVal = damaged.times(unitCost);
    totalReceivedValue = totalReceivedValue.plus(goodVal);
    totalDamagedValue = totalDamagedValue.plus(dmgVal);

    const destIdx = nextStocks.findIndex(
      (bs) => bs.branchId === params.transfer.destinationBranchId && bs.productId === item.productId
    );
    if (destIdx === -1) {
      nextStocks.push({
        id: `bs-${params.transfer.destinationBranchId}-${item.productId}`,
        tenantId: params.tenantId,
        branchId: params.transfer.destinationBranchId,
        productId: item.productId,
        stockQty: received.toFixed(4),
        minStockAlert: '5.0000',
        sellingPriceOverride: null,
        movingAvgCost: unitCost.toFixed(4),
        updatedAt: now,
      });
    } else if (received.gt(0)) {
      const curQty = Decimal.max(new Decimal(0), new Decimal(nextStocks[destIdx].stockQty || '0'));
      const curAvg = Decimal.max(new Decimal(0), new Decimal(nextStocks[destIdx].movingAvgCost || '0'));
      const nextQty = curQty.plus(received);
      const nextAvg = curQty
        .times(curAvg)
        .plus(goodVal)
        .div(nextQty)
        .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      nextStocks[destIdx] = {
        ...nextStocks[destIdx],
        stockQty: nextQty.toFixed(4),
        movingAvgCost: nextAvg.toFixed(4),
        updatedAt: now,
      };
    }

    return {
      ...item,
      receivedQty: received.toFixed(4),
      damagedQty: damaged.toFixed(4),
    };
  });

  const roundedGood = totalReceivedValue.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const roundedDamaged = totalDamagedValue.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const totalCleared = roundedGood.plus(roundedDamaged);

  const draftLines = [
    ...(roundedGood.gt(0)
      ? [
          {
            accountCode: '1105',
            debit: roundedGood.toFixed(4),
            credit: '0.0000',
            memo: `Penerimaan persediaan fisik di ${params.destinationBranchName}`,
          },
        ]
      : []),
    ...(roundedDamaged.gt(0)
      ? [
          {
            accountCode: '6108',
            debit: roundedDamaged.toFixed(4),
            credit: '0.0000',
            memo: `Selisih/kerusakan barang selama pengiriman ${params.transfer.transferNumber}`,
          },
        ]
      : []),
    {
      accountCode: '1108',
      debit: '0.0000',
      credit: totalCleared.toFixed(4),
      memo: `Penyelesaian Persediaan Dalam Perjalanan ${params.transfer.transferNumber}`,
    },
  ];

  const journalEntry = buildJournalEntry({
    id: `je-trf-rcv-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.transfer.destinationBranchId,
    entryNumber: `TRF-IN-${receiveDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: receiveDate,
    sourceModule: 'STOCK_TRANSFER',
    sourceId: params.transfer.id,
    description: `Terima Mutasi Stok ${params.transfer.transferNumber} di ${params.destinationBranchName}`,
    accounts: params.accounts,
    draftLines,
  });

  const updatedTransfer: StockTransfer = {
    ...params.transfer,
    status: 'RECEIVED',
    receivedAt: now,
    items: updatedItems,
  };

  return { updatedTransfer, updatedBranchStocks: nextStocks, journalEntry };
}

// =========================================================================
// 3. SUPPLIER PO RECEIVING WITH LANDED COST & TEMPO HUTANG
// =========================================================================

/**
 * Receives a Supplier Purchase Order atomically:
 * - Allocates landedCostShipping proportionally across received items (increases Moving Average HPP!).
 * - Updates BranchStock & Product stock/costPriceAvg.
 * - Posts balanced journal:
 *     Dr Persediaan (1105) -> Subtotal + Landed Cost Shipping
 *     Cr Kas/Bank (1101/1102) [if TUNAI] OR Cr Utang Usaha Supplier (2101) [if TEMPO_HUTANG]
 */
export function receivePurchaseOrderWithLandedCost(params: {
  tenantId: string;
  po: PurchaseOrder;
  branchId: string;
  landedCostShipping: string;
  paymentType: 'TUNAI' | 'TEMPO_HUTANG';
  paymentAccountCode: '1101' | '1102';
  branchStocks: BranchStock[];
  accounts: Account[];
  entrySeq: number;
  receiveDate?: string;
}): {
  updatedPo: PurchaseOrder;
  updatedBranchStocks: BranchStock[];
  journalEntry: JournalEntry;
} {
  const shipping = Decimal.max(new Decimal(0), new Decimal(params.landedCostShipping || '0'));
  const itemsSubtotal = params.po.items.reduce(
    (sum, item) =>
      sum.plus(new Decimal(item.orderedQty).times(new Decimal(item.unitCostEstimate ?? item.unitCost ?? '0'))),
    new Decimal(0)
  );
  if (itemsSubtotal.lte(0)) {
    throw new Error('Total PO harus lebih besar dari 0.');
  }

  const grandTotal = itemsSubtotal.plus(shipping).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const now = new Date().toISOString();
  const receiveDate = params.receiveDate ?? now.slice(0, 10);
  const nextStocks = params.branchStocks.map((bs) => ({ ...bs }));

  const updatedItems = params.po.items.map((item) => {
    const qty = new Decimal(item.orderedQty || '0');
    const baseLine = qty.times(new Decimal(item.unitCostEstimate || '0'));
    // Proportional landed cost allocation
    const allocatedShipping = shipping.gt(0)
      ? shipping.times(baseLine.div(itemsSubtotal))
      : new Decimal(0);
    const totalLineWithLanded = baseLine.plus(allocatedShipping);
    const landedUnitCost = qty.gt(0)
      ? totalLineWithLanded.div(qty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      : new Decimal(item.unitCostEstimate || '0');

    const idx = nextStocks.findIndex(
      (bs) => bs.branchId === params.branchId && bs.productId === item.productId
    );
    if (idx === -1) {
      nextStocks.push({
        id: `bs-${params.branchId}-${item.productId}`,
        tenantId: params.tenantId,
        branchId: params.branchId,
        productId: item.productId,
        stockQty: qty.toFixed(4),
        minStockAlert: '5.0000',
        sellingPriceOverride: null,
        movingAvgCost: landedUnitCost.toFixed(4),
        updatedAt: now,
      });
    } else {
      const curQty = Decimal.max(new Decimal(0), new Decimal(nextStocks[idx].stockQty || '0'));
      const curAvg = Decimal.max(new Decimal(0), new Decimal(nextStocks[idx].movingAvgCost || '0'));
      const nextQty = curQty.plus(qty);
      const nextAvg = curQty
        .times(curAvg)
        .plus(totalLineWithLanded)
        .div(nextQty)
        .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      nextStocks[idx] = {
        ...nextStocks[idx],
        stockQty: nextQty.toFixed(4),
        movingAvgCost: nextAvg.toFixed(4),
        updatedAt: now,
      };
    }

    return {
      ...item,
      receivedQty: qty.toFixed(4),
      lineTotal: totalLineWithLanded.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    };
  });

  const creditCode = params.paymentType === 'TEMPO_HUTANG' ? '2101' : params.paymentAccountCode;
  const journalEntry = buildJournalEntry({
    id: `je-po-rcv-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.branchId,
    entryNumber: `PUR-${receiveDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: receiveDate,
    sourceModule: 'PURCHASE',
    sourceId: params.po.id,
    description: `Penerimaan PO ${params.po.poNumber} (${params.po.supplierName})${shipping.gt(0) ? ' + Ongkir Landed Cost' : ''}`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '1105',
        debit: grandTotal.toFixed(4),
        credit: '0.0000',
        memo: `Penambahan persediaan PO ${params.po.poNumber} (termasuk ongkir Rp${shipping.toDecimalPlaces(0).toString()})`,
      },
      {
        accountCode: creditCode,
        debit: '0.0000',
        credit: grandTotal.toFixed(4),
        memo:
          creditCode === '2101'
            ? `Utang usaha tempo ke ${params.po.supplierName}`
            : `Pembayaran tunai/bank PO ${params.po.poNumber}`,
      },
    ],
  });

  const updatedPo: PurchaseOrder = {
    ...params.po,
    branchId: params.branchId,
    status: 'RECEIVED',
    paymentType: params.paymentType,
    landedCostShipping: shipping.toFixed(4),
    totalEstimatedCost: grandTotal.toFixed(4),
    amountPaid: params.paymentType === 'TUNAI' ? grandTotal.toFixed(4) : '0.0000',
    receivedAt: now,
    items: updatedItems,
  };

  return { updatedPo, updatedBranchStocks: nextStocks, journalEntry };
}

/**
 * Pays off Supplier Debt (Tempo Hutang):
 *   Dr Utang Usaha Supplier (2101)
 *   Cr Kas (1101) / Bank (1102)
 */
export function recordSupplierDebtPayment(params: {
  tenantId: string;
  po: PurchaseOrder;
  payAmount: string;
  paymentAccountCode: '1101' | '1102';
  notes?: string;
  accounts: Account[];
  entrySeq: number;
  payDate?: string;
}): {
  updatedPo: PurchaseOrder;
  journalEntry: JournalEntry;
} {
  const payDec = new Decimal(params.payAmount || '0');
  const prevPaid = new Decimal(params.po.amountPaid || '0');
  const total = new Decimal(params.po.totalEstimatedCost || '0');
  const remaining = total.minus(prevPaid);

  if (payDec.lte(0)) {
    throw new Error('Nominal pembayaran hutang harus lebih besar dari 0.');
  }
  if (payDec.gt(remaining.plus('0.01'))) {
    throw new Error('Nominal pembayaran melebihi sisa hutang supplier.');
  }

  const now = new Date().toISOString();
  const payDate = params.payDate ?? now.slice(0, 10);

  const journalEntry = buildJournalEntry({
    id: `je-po-pay-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.po.branchId,
    entryNumber: `PAY-SUP-${payDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: payDate,
    sourceModule: 'PURCHASE',
    sourceId: params.po.id,
    description: `Pembayaran Hutang Supplier ${params.po.supplierName} (${params.po.poNumber})`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '2101',
        debit: payDec.toFixed(4),
        credit: '0.0000',
        memo: `Pelunasan utang PO ${params.po.poNumber}`,
      },
      {
        accountCode: params.paymentAccountCode,
        debit: '0.0000',
        credit: payDec.toFixed(4),
        memo: `Kas/Bank keluar ke ${params.po.supplierName}`,
      },
    ],
  });

  const updatedPo: PurchaseOrder = {
    ...params.po,
    amountPaid: prevPaid.plus(payDec).toFixed(4),
    debtPayments: [
      ...(params.po.debtPayments ?? []),
      {
        id: `sup-pay-${Date.now()}`,
        paidAt: now,
        amount: payDec.toFixed(4),
        paymentAccountCode: params.paymentAccountCode,
        notes: params.notes,
      },
    ],
  };

  return { updatedPo, journalEntry };
}

// =========================================================================
// 4. BLIND COUNT STOCK OPNAME SESSION APPROVAL
// =========================================================================

export function approveStockOpnameSession(params: {
  tenantId: string;
  session: StockOpnameSession;
  branchName: string;
  approvedBy: string;
  branchStocks: BranchStock[];
  accounts: Account[];
  entrySeq: number;
  approveDate?: string;
}): {
  updatedSession: StockOpnameSession;
  updatedBranchStocks: BranchStock[];
  journalEntry: JournalEntry | null;
} {
  if (params.session.status !== 'IN_PROGRESS') {
    throw new Error('Sesi Stock Opname ini sudah diproses.');
  }

  const now = new Date().toISOString();
  const approveDate = params.approveDate ?? now.slice(0, 10);
  const nextStocks = params.branchStocks.map((bs) => ({ ...bs }));

  let shortageTotal = new Decimal(0);
  let surplusTotal = new Decimal(0);

  const finalizedItems: StockOpnameItem[] = params.session.items.map((item) => {
    const sysQty = new Decimal(item.systemQtySnapshot || '0');
    const physQty = Decimal.max(new Decimal(0), new Decimal(item.physicalQty || '0'));
    const diff = physQty.minus(sysQty);
    const unitCost = new Decimal(item.unitCostSnapshot || '0');
    const val = diff.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    if (val.lt(0)) {
      shortageTotal = shortageTotal.plus(val.abs());
    } else if (val.gt(0)) {
      surplusTotal = surplusTotal.plus(val);
    }

    const idx = nextStocks.findIndex(
      (bs) => bs.branchId === params.session.branchId && bs.productId === item.productId
    );
    if (idx !== -1) {
      nextStocks[idx] = {
        ...nextStocks[idx],
        stockQty: physQty.toFixed(4),
        updatedAt: now,
      };
    }

    return {
      ...item,
      physicalQty: physQty.toFixed(4),
      varianceQty: diff.toFixed(4),
      varianceValue: val.toFixed(4),
    };
  });

  const draftLines: Array<{ accountCode: string; debit: string; credit: string; memo: string }> = [];
  if (shortageTotal.gt(0)) {
    draftLines.push(
      {
        accountCode: '6108',
        debit: shortageTotal.toFixed(4),
        credit: '0.0000',
        memo: `Beban selisih/kerusakan Stock Opname ${params.session.sessionNumber} (${params.branchName})`,
      },
      {
        accountCode: '1105',
        debit: '0.0000',
        credit: shortageTotal.toFixed(4),
        memo: `Penyesuaian kurang persediaan ${params.branchName}`,
      }
    );
  }
  if (surplusTotal.gt(0)) {
    draftLines.push(
      {
        accountCode: '1105',
        debit: surplusTotal.toFixed(4),
        credit: '0.0000',
        memo: `Surplus fisik Stock Opname ${params.session.sessionNumber} (${params.branchName})`,
      },
      {
        accountCode: '6108',
        debit: '0.0000',
        credit: surplusTotal.toFixed(4),
        memo: `Koreksi surplus persediaan ${params.branchName}`,
      }
    );
  }

  const journalEntry =
    draftLines.length > 0
      ? buildJournalEntry({
          id: `je-opn-sess-${Date.now()}-${params.entrySeq}`,
          tenantId: params.tenantId,
          branchId: params.session.branchId,
          entryNumber: `SO-${approveDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
          entryDate: approveDate,
          sourceModule: 'OPNAME',
          sourceId: params.session.id,
          description: `Approve Stock Opname ${params.session.sessionNumber} — ${params.branchName}`,
          accounts: params.accounts,
          draftLines,
        })
      : null;

  const netVariance = surplusTotal.minus(shortageTotal);
  const updatedSession: StockOpnameSession = {
    ...params.session,
    status: 'APPROVED',
    approvedBy: params.approvedBy,
    approvedAt: now,
    totalVarianceValue: netVariance.toFixed(4),
    items: finalizedItems,
  };

  return { updatedSession, updatedBranchStocks: nextStocks, journalEntry };
}
