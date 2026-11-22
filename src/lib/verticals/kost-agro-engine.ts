/**
 * KasirAkun UMKM — Kost/Kontrakan & Peternakan/Pertanian Accounting & Operations Engine
 * Strictly uses Decimal.js (NUMERIC(19,4)) and immutable double-entry balanced journals.
 */

import Decimal from 'decimal.js';
import { buildJournalEntry } from '../accounting/journal-engine';
import type {
  Account,
  AgroBatch,
  AgroBatchUsage,
  AgroHarvest,
  BoardingInvoice,
  BoardingRoom,
  BoardingTenant,
  JournalEntry,
  Product,
} from '../../types/domain';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const PPH_4_2_RENT_RATE = new Decimal('0.10'); // 10% PPh Final Sewa Tanah/Bangunan Pasal 4(2)

// =========================================================================
// 1. KOST & KONTRAKAN (BOARDING HOUSE)
// =========================================================================

/**
 * Records receipt of Boarding Tenant Security Deposit.
 * CRITICAL ACCOUNTING RULE: Security deposit is a LIABILITY (2106 Utang Deposit Penghuni Kost),
 * NEVER Revenue!
 *   Dr Kas (1101) / Bank (1102)
 *   Cr Utang Deposit Penghuni Kost (2106)
 */
export function createBoardingDepositJournal(params: {
  tenantId: string;
  branchId?: string | null;
  boardingTenant: BoardingTenant;
  roomNumber: string;
  paymentAccountCode: '1101' | '1102';
  accounts: Account[];
  entrySeq: number;
  entryDate?: string;
}): JournalEntry | null {
  const deposit = new Decimal(params.boardingTenant.depositAmount || '0');
  if (deposit.lte(0)) return null;

  const entryDate = params.entryDate ?? new Date().toISOString().slice(0, 10);
  const id = `je-kost-dep-${Date.now()}-${params.entrySeq}`;

  return buildJournalEntry({
    id,
    tenantId: params.tenantId,
    branchId: params.branchId,
    entryNumber: `KST-DEP-${entryDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'KOST',
    sourceId: params.boardingTenant.id,
    description: `Penerimaan Uang Deposit Penghuni ${params.boardingTenant.fullName} (Kamar ${params.roomNumber})`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: params.paymentAccountCode,
        debit: deposit.toFixed(4),
        credit: '0.0000',
        memo: `Kas/Bank masuk uang jaminan Kamar ${params.roomNumber}`,
      },
      {
        accountCode: '2106',
        debit: '0.0000',
        credit: deposit.toFixed(4),
        memo: `Kewajiban Utang Deposit a.n. ${params.boardingTenant.fullName} (Bukan Pendapatan)`,
      },
    ],
  });
}

/**
 * Computes Boarding Invoice totals & 10% PPh Final Pasal 4(2) Sewa Bangunan.
 */
export function calculateBoardingInvoice(params: {
  rentAmount: string;
  utilityFee: string;
  lateFee: string;
}): {
  totalAmount: string;
  pph42Amount: string;
} {
  const rent = Decimal.max(new Decimal(0), new Decimal(params.rentAmount || '0'));
  const utility = Decimal.max(new Decimal(0), new Decimal(params.utilityFee || '0'));
  const late = Decimal.max(new Decimal(0), new Decimal(params.lateFee || '0'));
  const totalAmount = rent.plus(utility).plus(late);
  // PPh Final Pasal 4(2) 10% applies to gross building/room rental component (including service/utility bundled in rent)
  const pph42Amount = totalAmount.times(PPH_4_2_RENT_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);

  return {
    totalAmount: totalAmount.toFixed(4),
    pph42Amount: pph42Amount.toFixed(4),
  };
}

/**
 * Records Boarding Rent Invoice Payment + PPh Final Pasal 4(2) 10% Tax Liability accrual.
 *   Dr Kas/Bank (1101/1102) -> Total Tagihan Diterima
 *   Cr Pendapatan Sewa Kamar Kost (4104) -> Total Tagihan
 *   Dr Beban Pajak Penghasilan (6201) -> PPh 4(2) 10%
 *   Cr Utang PPh Pasal 21/23/4(2) (2105) -> PPh 4(2) 10%
 */
export function createBoardingRentPaymentJournal(params: {
  tenantId: string;
  branchId?: string | null;
  invoice: BoardingInvoice;
  tenantName: string;
  roomNumber: string;
  paymentAccountCode: '1101' | '1102';
  accounts: Account[];
  entrySeq: number;
  entryDate?: string;
}): JournalEntry {
  const total = new Decimal(params.invoice.totalAmount || '0');
  const pph42 = new Decimal(params.invoice.pph42Amount || '0');
  const entryDate = params.entryDate ?? new Date().toISOString().slice(0, 10);
  const id = `je-kost-rent-${Date.now()}-${params.entrySeq}`;

  const draftLines = [
    {
      accountCode: params.paymentAccountCode,
      debit: total.toFixed(4),
      credit: '0.0000',
      memo: `Pembayaran sewa Kamar ${params.roomNumber} periode ${params.invoice.periodMonth} (${params.tenantName})`,
    },
    {
      accountCode: '4104',
      debit: '0.0000',
      credit: total.toFixed(4),
      memo: `Pendapatan Sewa Kamar ${params.roomNumber} (${params.invoice.periodMonth})`,
    },
  ];

  if (pph42.gt(0)) {
    draftLines.push(
      {
        accountCode: '6201',
        debit: pph42.toFixed(4),
        credit: '0.0000',
        memo: `Akrual PPh Final Sewa Bangunan Pasal 4(2) 10% — Kamar ${params.roomNumber}`,
      },
      {
        accountCode: '2105',
        debit: '0.0000',
        credit: pph42.toFixed(4),
        memo: `Utang PPh Final Pasal 4(2) 10% — periode ${params.invoice.periodMonth}`,
      }
    );
  }

  return buildJournalEntry({
    id,
    tenantId: params.tenantId,
    branchId: params.branchId,
    entryNumber: `KST-INV-${entryDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'KOST',
    sourceId: params.invoice.id,
    description: `Pembayaran Sewa Kost ${params.tenantName} (Kamar ${params.roomNumber} · ${params.invoice.periodMonth})`,
    accounts: params.accounts,
    draftLines,
  });
}

export function buildBoardingWhatsAppLink(params: {
  businessName: string;
  boardingTenant: BoardingTenant;
  room: BoardingRoom;
  invoice: BoardingInvoice;
}): string {
  const digits = params.boardingTenant.phoneWa.replace(/\D/g, '');
  const waPhone = digits.startsWith('0') ? `62${digits.slice(1)}` : digits || '6281200000000';
  const fmt = (val: string) =>
    `Rp${new Decimal(val || '0').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber().toLocaleString('id-ID')}`;

  const text = [
    `Halo Kak *${params.boardingTenant.fullName}*,`,
    `Berikut rincian tagihan kost *${params.businessName}* untuk periode *${params.invoice.periodMonth}*:`,
    ``,
    `• Kamar: ${params.room.roomNumber} (${params.room.roomType})`,
    `• Sewa Kamar: ${fmt(params.invoice.rentAmount)}`,
    `• Listrik/Air/WiFi: ${fmt(params.invoice.utilityFee)}`,
    ...(new Decimal(params.invoice.lateFee || '0').gt(0)
      ? [`• Denda Keterlambatan: ${fmt(params.invoice.lateFee)}`]
      : []),
    `• *Total Tagihan: ${fmt(params.invoice.totalAmount)}*`,
    `• Status: ${params.invoice.paymentStatus === 'PAID' ? 'LUNAS' : 'BELUM LUNAS'}`,
    ``,
    `Mohon konfirmasi bukti transfer setelah melakukan pembayaran. Terima kasih!`,
  ].join('\n');

  return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
}

// =========================================================================
// 2. PETERNAKAN & PERTANIAN (AGRO BATCH WIP & HARVEST HPP)
// =========================================================================

/**
 * Records consumption of Feed / Seed / Fertilizer / Medicine / Labor into an AgroBatch.
 *   Dr Aset Biologis / WIP Agro (1109)
 *   Cr Persediaan Bahan Baku (1105) [for inventory items] OR Kas (1101) [for direct labor]
 */
export function recordAgroBatchUsage(params: {
  tenantId: string;
  branchId?: string | null;
  batch: AgroBatch;
  usageCategory: AgroBatchUsage['usageCategory'];
  productId?: string | null;
  description: string;
  qtyUsed: string;
  unit: string;
  unitCost: string;
  usageDate?: string;
  accounts: Account[];
  entrySeq: number;
}): {
  updatedBatch: AgroBatch;
  usage: AgroBatchUsage;
  journalEntry: JournalEntry;
} {
  const qty = new Decimal(params.qtyUsed || '0');
  const unitCost = new Decimal(params.unitCost || '0');
  if (qty.lte(0)) {
    throw new Error('Jumlah pemakaian bahan/pakan harus lebih besar dari 0.');
  }
  if (unitCost.lt(0)) {
    throw new Error('Biaya satuan tidak boleh negatif.');
  }

  const totalCost = qty.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const usageDate = params.usageDate ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const usage: AgroBatchUsage = {
    id: `agro-use-${Date.now()}-${params.entrySeq}`,
    agroBatchId: params.batch.id,
    productId: params.productId ?? null,
    usageCategory: params.usageCategory,
    description: params.description.trim(),
    qtyUsed: qty.toFixed(4),
    unit: params.unit,
    unitCost: unitCost.toFixed(4),
    totalCost: totalCost.toFixed(4),
    usageDate,
    createdAt: now,
  };

  const nextAccumulated = new Decimal(params.batch.accumulatedCost || '0').plus(totalCost);
  const updatedBatch: AgroBatch = {
    ...params.batch,
    accumulatedCost: nextAccumulated.toFixed(4),
    usages: [usage, ...params.batch.usages],
  };

  const creditAccountCode = params.usageCategory === 'TENAGA_KERJA' ? '1101' : '1105';
  const journalEntry = buildJournalEntry({
    id: `je-agro-use-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.branchId,
    entryNumber: `AGR-WIP-${usageDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: usageDate,
    sourceModule: 'AGRO',
    sourceId: usage.id,
    description: `Pemakaian ${params.usageCategory} untuk ${params.batch.name}: ${params.description}`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '1109',
        debit: totalCost.toFixed(4),
        credit: '0.0000',
        memo: `Akumulasi biaya WIP ${params.batch.name} (${qty.toFixed(2)} ${params.unit})`,
      },
      {
        accountCode: creditAccountCode,
        debit: '0.0000',
        credit: totalCost.toFixed(4),
        memo:
          creditAccountCode === '1101'
            ? `Pembayaran upah tenaga kerja ${params.batch.name}`
            : `Pemakaian persediaan gudang ${params.description}`,
      },
    ],
  });

  return { updatedBatch, usage, journalEntry };
}

/**
 * Records Harvest for an AgroBatch:
 *   HPP per Kg/Ekor = Total Biaya Batch Terakumulasi / Qty Panen Bersih
 *   Dr Persediaan Hasil Panen (1110)
 *   Cr Aset Biologis / WIP Agro (1109)
 * Updates target harvest product stock & Moving Average cost atomically.
 */
export function recordAgroHarvest(params: {
  tenantId: string;
  branchId?: string | null;
  batch: AgroBatch;
  targetProduct: Product;
  netHarvestQty: string;
  unit: string;
  harvestDate?: string;
  accounts: Account[];
  entrySeq: number;
}): {
  updatedBatch: AgroBatch;
  harvest: AgroHarvest;
  updatedProduct: Product;
  journalEntry: JournalEntry;
} {
  const netQty = new Decimal(params.netHarvestQty || '0');
  if (netQty.lte(0)) {
    throw new Error('Jumlah hasil panen bersih harus lebih besar dari 0.');
  }

  const totalBatchCost = new Decimal(params.batch.accumulatedCost || '0');
  if (totalBatchCost.lte(0)) {
    throw new Error('Total biaya produksi batch harus lebih besar dari 0 sebelum mencatat panen.');
  }

  const unitHpp = totalBatchCost.div(netQty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const harvestDate = params.harvestDate ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const harvest: AgroHarvest = {
    id: `agro-hrv-${Date.now()}-${params.entrySeq}`,
    agroBatchId: params.batch.id,
    targetProductId: params.targetProduct.id,
    targetProductName: params.targetProduct.name,
    harvestDate,
    netHarvestQty: netQty.toFixed(4),
    unit: params.unit,
    totalBatchCost: totalBatchCost.toFixed(4),
    unitHppComputed: unitHpp.toFixed(4),
    createdAt: now,
  };

  // Recompute Moving Average cost for target harvest product in warehouse
  const prevStock = Decimal.max(new Decimal(0), new Decimal(params.targetProduct.stockQty || '0'));
  const prevAvg = Decimal.max(new Decimal(0), new Decimal(params.targetProduct.costPriceAvg || '0'));
  const nextStock = prevStock.plus(netQty);
  const nextAvg = prevStock
    .times(prevAvg)
    .plus(totalBatchCost)
    .div(nextStock)
    .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  const updatedProduct: Product = {
    ...params.targetProduct,
    stockQty: nextStock.toFixed(4),
    costPriceAvg: nextAvg.toFixed(4),
  };

  const updatedBatch: AgroBatch = {
    ...params.batch,
    status: 'HARVESTED',
    harvests: [harvest, ...params.batch.harvests],
  };

  const journalEntry = buildJournalEntry({
    id: `je-agro-hrv-${Date.now()}-${params.entrySeq}`,
    tenantId: params.tenantId,
    branchId: params.branchId,
    entryNumber: `AGR-HRV-${harvestDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate: harvestDate,
    sourceModule: 'AGRO',
    sourceId: harvest.id,
    description: `Panen ${params.batch.name} -> ${netQty.toFixed(2)} ${params.unit} (HPP Rp${unitHpp.toDecimalPlaces(0).toString()}/${params.unit})`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '1110',
        debit: totalBatchCost.toFixed(4),
        credit: '0.0000',
        memo: `Persediaan hasil panen ${params.targetProduct.name} (${netQty.toFixed(2)} ${params.unit})`,
      },
      {
        accountCode: '1109',
        debit: '0.0000',
        credit: totalBatchCost.toFixed(4),
        memo: `Penyelesaian Aset Biologis / WIP ${params.batch.name}`,
      },
    ],
  });

  return { updatedBatch, harvest, updatedProduct, journalEntry };
}
