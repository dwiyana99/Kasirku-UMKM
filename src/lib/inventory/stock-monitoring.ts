/**
 * KasirAkun UMKM — Stock Monitoring, Low-Stock Early Warning & Bulk Stock Adjustments Engine
 * Pure domain logic using Decimal.js (zero floating-point arithmetic).
 */

import Decimal from 'decimal.js';
import { buildJournalEntry } from '../accounting/journal-engine.ts';
import type {
  Account,
  JournalEntry,
  Product,
  StockAdjustmentReasonCode,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type StockAlertSeverity = 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW_WARNING';

export interface StockAdjustmentReasonMeta {
  code: StockAdjustmentReasonCode;
  label: string;
  shortLabel: string;
  description: string;
  typicalDirection: 'DECREASE' | 'INCREASE' | 'EITHER';
}

export const STOCK_ADJUSTMENT_REASONS: StockAdjustmentReasonMeta[] = [
  {
    code: 'BREAKAGE',
    label: 'Barang Rusak / Pecah (Breakage)',
    shortLabel: 'Rusak / Pecah',
    description: 'Produk kemasan sobek, botol pecah, atau rusak di rak/gudang.',
    typicalDirection: 'DECREASE',
  },
  {
    code: 'LOSS',
    label: 'Kehilangan / Selisih Kurang (Loss)',
    shortLabel: 'Hilang / Kurang',
    description: 'Selisih fisik lebih rendah dari catatan sistem tanpa bukti jual.',
    typicalDirection: 'DECREASE',
  },
  {
    code: 'EXPIRED',
    label: 'Kedaluwarsa / Basi (Expired)',
    shortLabel: 'Kedaluwarsa',
    description: 'Barang melewati tanggal kedaluwarsa atau bahan baku tidak layak pakai.',
    typicalDirection: 'DECREASE',
  },
  {
    code: 'SHRINKAGE',
    label: 'Susut Gudang / Penyusutan (Shrinkage)',
    shortLabel: 'Susut Gudang',
    description: 'Penyusutan bobot/volume alami selama penyimpanan atau pemrosesan.',
    typicalDirection: 'DECREASE',
  },
  {
    code: 'INTERNAL_USE',
    label: 'Pemakaian Internal / Sampel',
    shortLabel: 'Pakai Internal',
    description: 'Digunakan operasional toko, tester, atau promosi tanpa transaksi kasir.',
    typicalDirection: 'DECREASE',
  },
  {
    code: 'OPNAME_SURPLUS',
    label: 'Selisih Lebih Opname (Surplus)',
    shortLabel: 'Surplus Opname',
    description: 'Stok fisik di gudang lebih banyak dibanding catatan sistem.',
    typicalDirection: 'INCREASE',
  },
  {
    code: 'CORRECTION',
    label: 'Koreksi Pencatatan Opname',
    shortLabel: 'Koreksi Catatan',
    description: 'Penyesuaian kesalahan input stok awal atau salah hitung sebelumnya.',
    typicalDirection: 'EITHER',
  },
];

export const STOCK_ADJUSTMENT_REASON_MAP: Record<
  StockAdjustmentReasonCode,
  StockAdjustmentReasonMeta
> = STOCK_ADJUSTMENT_REASONS.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<StockAdjustmentReasonCode, StockAdjustmentReasonMeta>
);

export function getReasonMeta(code?: StockAdjustmentReasonCode): StockAdjustmentReasonMeta {
  if (!code || !STOCK_ADJUSTMENT_REASON_MAP[code]) {
    return STOCK_ADJUSTMENT_REASON_MAP.CORRECTION;
  }
  return STOCK_ADJUSTMENT_REASON_MAP[code];
}

export function isStockTrackedProduct(product: Pick<Product, 'itemType'>): boolean {
  return product.itemType === 'RETAIL_GOODS' || product.itemType === 'RAW_MATERIAL';
}

export interface StockAlertItem {
  product: Product;
  severity: StockAlertSeverity;
  currentStock: string; // NUMERIC(19,4)
  minStockAlert: string; // NUMERIC(19,4)
  deficitToMin: string; // max(0, min - current)
  coveragePct: number; // 0..150 integer percentage vs minStockAlert
  suggestedRestockQty: string; // NUMERIC(19,4)
  estimatedRestockCost: string; // NUMERIC(19,4)
}

export interface StockAlertEvaluation {
  alerts: StockAlertItem[];
  counts: {
    outOfStock: number;
    critical: number;
    lowWarning: number;
    total: number;
  };
  totalTrackedCount: number;
  healthyCount: number;
  totalEstimatedRestockCost: string;
}

const SEVERITY_RANK: Record<StockAlertSeverity, number> = {
  OUT_OF_STOCK: 0,
  CRITICAL: 1,
  LOW_WARNING: 2,
};

/**
 * Evaluates all stock-tracked products against their `minStockAlert` thresholds.
 * - OUT_OF_STOCK: stockQty <= 0
 * - CRITICAL: 0 < stockQty <= minStockAlert
 * - LOW_WARNING: minStockAlert < stockQty <= minStockAlert * warningMultiplier (proactive alert BEFORE running out)
 */
export function evaluateStockAlerts(
  products: Product[],
  warningMultiplier = '1.5'
): StockAlertEvaluation {
  const tracked = products.filter(isStockTrackedProduct);
  const multiplier = new Decimal(warningMultiplier);
  const alerts: StockAlertItem[] = [];

  let outOfStock = 0;
  let critical = 0;
  let lowWarning = 0;
  let totalRestockCost = new Decimal(0);

  for (const product of tracked) {
    const stock = Decimal.max(new Decimal(0), new Decimal(product.stockQty || '0'));
    const minAlert = Decimal.max(new Decimal(0), new Decimal(product.minStockAlert || '0'));
    const unitCost = Decimal.max(new Decimal(0), new Decimal(product.costPriceAvg || '0'));
    const earlyThreshold = minAlert.times(multiplier);

    let severity: StockAlertSeverity | null = null;
    if (stock.lte(0)) {
      severity = 'OUT_OF_STOCK';
      outOfStock += 1;
    } else if (minAlert.gt(0) && stock.lte(minAlert)) {
      severity = 'CRITICAL';
      critical += 1;
    } else if (minAlert.gt(0) && stock.lte(earlyThreshold)) {
      severity = 'LOW_WARNING';
      lowWarning += 1;
    }

    if (!severity) continue;

    // Recommended target stock is 2x minStockAlert (or at least 5 units if minAlert is 0)
    const targetStock = minAlert.gt(0) ? minAlert.times(2) : new Decimal(5);
    const rawSuggested = Decimal.max(
      minAlert.gt(0) ? minAlert : new Decimal(1),
      targetStock.minus(stock)
    );
    const suggestedQty = rawSuggested.toDecimalPlaces(0, Decimal.ROUND_CEIL);
    const estCost = suggestedQty.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    totalRestockCost = totalRestockCost.plus(estCost);

    const deficit = Decimal.max(new Decimal(0), minAlert.minus(stock));
    const coveragePct = minAlert.gt(0)
      ? Math.min(150, Math.max(0, stock.div(minAlert).times(100).toDecimalPlaces(0).toNumber()))
      : stock.gt(0)
      ? 100
      : 0;

    alerts.push({
      product,
      severity,
      currentStock: stock.toFixed(4),
      minStockAlert: minAlert.toFixed(4),
      deficitToMin: deficit.toFixed(4),
      coveragePct,
      suggestedRestockQty: suggestedQty.toFixed(4),
      estimatedRestockCost: estCost.toFixed(4),
    });
  }

  alerts.sort((a, b) => {
    const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (rankDiff !== 0) return rankDiff;
    if (a.coveragePct !== b.coveragePct) return a.coveragePct - b.coveragePct;
    return a.product.name.localeCompare(b.product.name);
  });

  return {
    alerts,
    counts: {
      outOfStock,
      critical,
      lowWarning,
      total: alerts.length,
    },
    totalTrackedCount: tracked.length,
    healthyCount: Math.max(0, tracked.length - alerts.length),
    totalEstimatedRestockCost: totalRestockCost.toFixed(4),
  };
}

export interface BulkAdjustmentLineInput {
  productId: string;
  actualStockQty: string;
  reasonCode: StockAdjustmentReasonCode;
  notes?: string;
}

export interface BulkAdjustmentPreviewLine {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  systemQty: string; // NUMERIC(19,4)
  actualQty: string; // NUMERIC(19,4)
  qtyDelta: string; // actual - system
  unitCost: string; // NUMERIC(19,4)
  valueImpact: string; // signed: qtyDelta * unitCost
  reasonCode: StockAdjustmentReasonCode;
  notes: string;
  hasChange: boolean;
}

export interface BulkAdjustmentPreview {
  lines: BulkAdjustmentPreviewLine[];
  changedLines: BulkAdjustmentPreviewLine[];
  changedCount: number;
  totalShortageUnits: string;
  totalSurplusUnits: string;
  totalShortageValue: string; // positive magnitude of losses/breakage
  totalSurplusValue: string; // positive magnitude of surplus
  netValuationDelta: string; // signed: surplus - shortage
}

/**
 * Computes exact Decimal.js variances and valuation impacts for a bulk stock adjustment batch.
 */
export function computeBulkAdjustmentPreview(
  entries: BulkAdjustmentLineInput[],
  products: Product[]
): BulkAdjustmentPreview {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const lines: BulkAdjustmentPreviewLine[] = [];
  const changedLines: BulkAdjustmentPreviewLine[] = [];

  let totalShortageUnits = new Decimal(0);
  let totalSurplusUnits = new Decimal(0);
  let totalShortageValue = new Decimal(0);
  let totalSurplusValue = new Decimal(0);

  for (const entry of entries) {
    const product = productMap.get(entry.productId);
    if (!product || !isStockTrackedProduct(product)) continue;

    const systemQty = Decimal.max(new Decimal(0), new Decimal(product.stockQty || '0'));
    let parsedActual: Decimal;
    try {
      const cleaned = (entry.actualStockQty ?? '').trim();
      parsedActual = cleaned === '' ? systemQty : Decimal.max(new Decimal(0), new Decimal(cleaned));
    } catch {
      parsedActual = systemQty;
    }

    const qtyDelta = parsedActual.minus(systemQty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const unitCost = Decimal.max(new Decimal(0), new Decimal(product.costPriceAvg || '0'));
    const valueImpact = qtyDelta.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const hasChange = !qtyDelta.isZero();

    const line: BulkAdjustmentPreviewLine = {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unit: product.unit,
      systemQty: systemQty.toFixed(4),
      actualQty: parsedActual.toFixed(4),
      qtyDelta: qtyDelta.toFixed(4),
      unitCost: unitCost.toFixed(4),
      valueImpact: valueImpact.toFixed(4),
      reasonCode: entry.reasonCode,
      notes: (entry.notes ?? '').trim(),
      hasChange,
    };

    lines.push(line);

    if (hasChange) {
      changedLines.push(line);
      if (qtyDelta.lt(0)) {
        totalShortageUnits = totalShortageUnits.plus(qtyDelta.abs());
        totalShortageValue = totalShortageValue.plus(valueImpact.abs());
      } else {
        totalSurplusUnits = totalSurplusUnits.plus(qtyDelta);
        totalSurplusValue = totalSurplusValue.plus(valueImpact);
      }
    }
  }

  const netValuationDelta = totalSurplusValue.minus(totalShortageValue);

  return {
    lines,
    changedLines,
    changedCount: changedLines.length,
    totalShortageUnits: totalShortageUnits.toFixed(4),
    totalSurplusUnits: totalSurplusUnits.toFixed(4),
    totalShortageValue: totalShortageValue.toFixed(4),
    totalSurplusValue: totalSurplusValue.toFixed(4),
    netValuationDelta: netValuationDelta.toFixed(4),
  };
}

/**
 * Generates an immutable balanced Double-Entry Journal for a bulk stock opname / adjustment batch.
 * - For each shortage line (qtyDelta < 0): Dr 5101 (Beban HPP / Selisih Persediaan), Cr 1105 (Persediaan)
 * - For each surplus line (qtyDelta > 0): Dr 1105 (Persediaan), Cr 5101 (Koreksi HPP Surplus Opname)
 * Returns null if no line produces a non-zero monetary valuation variance.
 */
export function createBulkStockOpnameJournalEntry(params: {
  tenantId: string;
  batchRefId: string;
  changedLines: BulkAdjustmentPreviewLine[];
  batchNotes?: string;
  accounts: Account[];
  entrySeq: number;
  entryDate?: string;
}): JournalEntry | null {
  const { tenantId, batchRefId, changedLines, batchNotes, accounts, entrySeq } = params;
  const entryDate = params.entryDate ?? new Date().toISOString().slice(0, 10);

  const draftLines: Array<{
    accountCode: string;
    debit: string;
    credit: string;
    memo: string;
  }> = [];

  for (const line of changedLines) {
    const impact = new Decimal(line.valueImpact);
    const absImpact = impact.abs().toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    if (absImpact.lte(0)) continue;

    const reasonLabel = getReasonMeta(line.reasonCode).shortLabel;
    const noteSuffix = line.notes ? ` — ${line.notes}` : '';
    const deltaFormatted = `${new Decimal(line.qtyDelta).gt(0) ? '+' : ''}${new Decimal(line.qtyDelta).toFixed(2)} ${line.unit}`;

    if (impact.lt(0)) {
      // Shortage / Breakage / Loss / Expired: Dr 5101 / Cr 1105
      draftLines.push(
        {
          accountCode: '5101',
          debit: absImpact.toFixed(4),
          credit: '0.0000',
          memo: `[${reasonLabel}] ${line.productName} (${deltaFormatted})${noteSuffix}`,
        },
        {
          accountCode: '1105',
          debit: '0.0000',
          credit: absImpact.toFixed(4),
          memo: `Pengurangan persediaan ${line.productName} [${reasonLabel}]`,
        }
      );
    } else {
      // Surplus: Dr 1105 / Cr 5101
      draftLines.push(
        {
          accountCode: '1105',
          debit: absImpact.toFixed(4),
          credit: '0.0000',
          memo: `[${reasonLabel}] ${line.productName} (${deltaFormatted})${noteSuffix}`,
        },
        {
          accountCode: '5101',
          debit: '0.0000',
          credit: absImpact.toFixed(4),
          memo: `Koreksi surplus opname ${line.productName} [${reasonLabel}]`,
        }
      );
    }
  }

  if (draftLines.length === 0) return null;

  const cleanBatchNotes = (batchNotes ?? '').trim();
  return buildJournalEntry({
    id: `je-bulk-opn-${Date.now()}-${entrySeq}`,
    tenantId,
    entryNumber: `OPM-${entryDate.replace(/-/g, '')}-${String(entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'INVENTORY',
    sourceId: batchRefId,
    description: `Bulk Stock Opname (${changedLines.length} item)${cleanBatchNotes ? ` — ${cleanBatchNotes}` : ''}`,
    accounts,
    draftLines,
  });
}
