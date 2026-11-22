/**
 * KasirAkun UMKM — Statistical Stock Velocity Forecasting & Purchase Order Engine
 * 100% deterministic, zero-AI-token, Decimal.js-exact forecasting for Warung Sembako & Retail/Stock items.
 *
 * Methodology (No external LLM / API token required):
 * 1. Computes historical sales velocity (units/day) from PAID Orders + OUT_SALE/OUT_RECIPE InventoryMovements
 *    over a configurable lookback window (default 14 days), blending recent 7-day momentum (60%) with
 *    full-window average (40%) to capture accelerating demand.
 * 2. Computes Days of Cover (DoC = Current Stock / Daily Velocity).
 * 3. Computes Reorder Point = (Daily Velocity * Lead Time) + Safety Stock.
 * 4. Computes Optimal Order Quantity = ceil(Target Cover Stock - Current Stock), ensuring stock covers
 *    Lead Time + Target Cover Horizon + Safety Buffer without overstocking.
 */

import Decimal from 'decimal.js';
import type {
  InventoryMovement,
  Order,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
} from '../../types/domain';
import { isStockTrackedProduct } from './stock-monitoring';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type ForecastUrgency = 'URGENT' | 'SOON' | 'HEALTHY';

export interface StockForecastConfig {
  lookbackDays: number; // e.g., 7, 14, 30
  leadTimeDays: number; // supplier delivery lead time in days (default 3)
  targetCoverDays: number; // desired days of inventory cover after restock (default 14)
  referenceDateIso?: string; // deterministic reference date for testing
}

export const DEFAULT_FORECAST_CONFIG: StockForecastConfig = {
  lookbackDays: 14,
  leadTimeDays: 3,
  targetCoverDays: 14,
};

export interface StockForecastRecommendation {
  product: Product;
  currentStock: string; // NUMERIC(19,4)
  minStockAlert: string; // NUMERIC(19,4)
  soldInWindow: string; // NUMERIC(19,4)
  soldLast7Days: string; // NUMERIC(19,4)
  dailyVelocity: string; // NUMERIC(19,4) units/day
  velocitySource: 'SALES_HISTORY' | 'MIN_STOCK_BASELINE';
  daysOfCover: number | null; // null if velocity is 0
  reorderPoint: string; // NUMERIC(19,4)
  recommendedOrderQty: string; // NUMERIC(19,4) integer ceiling
  estimatedOrderCost: string; // NUMERIC(19,4)
  urgency: ForecastUrgency;
  rationale: string;
}

export interface StockForecastReport {
  config: StockForecastConfig;
  recommendations: StockForecastRecommendation[];
  actionableRecommendations: StockForecastRecommendation[];
  counts: {
    urgent: number;
    soon: number;
    healthy: number;
    totalTracked: number;
  };
  totalEstimatedPoValue: string; // NUMERIC(19,4)
}

const URGENCY_RANK: Record<ForecastUrgency, number> = {
  URGENT: 0,
  SOON: 1,
  HEALTHY: 2,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Generates deterministic statistical restock recommendations for all stock-tracked products.
 */
export function computeStockForecastReport(params: {
  products: Product[];
  orders: Order[];
  inventoryMovements: InventoryMovement[];
  config?: Partial<StockForecastConfig>;
}): StockForecastReport {
  const cfg: StockForecastConfig = {
    lookbackDays: Math.max(1, params.config?.lookbackDays ?? DEFAULT_FORECAST_CONFIG.lookbackDays),
    leadTimeDays: Math.max(1, params.config?.leadTimeDays ?? DEFAULT_FORECAST_CONFIG.leadTimeDays),
    targetCoverDays: Math.max(3, params.config?.targetCoverDays ?? DEFAULT_FORECAST_CONFIG.targetCoverDays),
    referenceDateIso: params.config?.referenceDateIso,
  };

  const trackedProducts = params.products.filter(isStockTrackedProduct);
  const refMs = cfg.referenceDateIso
    ? new Date(cfg.referenceDateIso).getTime()
    : Date.now();
  const windowStartMs = refMs - cfg.lookbackDays * MS_PER_DAY;
  const recent7StartMs = refMs - Math.min(7, cfg.lookbackDays) * MS_PER_DAY;

  // Aggregate sales volume per product from PAID orders (authoritative POS/QR demand)
  const soldWindowMap = new Map<string, Decimal>();
  const soldRecent7Map = new Map<string, Decimal>();
  const paidOrderIds = new Set<string>();

  for (const order of params.orders) {
    if (order.paymentStatus !== 'PAID') continue;
    paidOrderIds.add(order.id);
    const ts = new Date(order.createdAt).getTime();
    if (Number.isNaN(ts) || ts < windowStartMs || ts > refMs + MS_PER_DAY) continue;

    for (const item of order.items) {
      const qty = new Decimal(item.qty || '0');
      if (qty.lte(0)) continue;
      soldWindowMap.set(
        item.productId,
        (soldWindowMap.get(item.productId) ?? new Decimal(0)).plus(qty)
      );
      if (ts >= recent7StartMs) {
        soldRecent7Map.set(
          item.productId,
          (soldRecent7Map.get(item.productId) ?? new Decimal(0)).plus(qty)
        );
      }
    }
  }

  // Also capture OUT_SALE / OUT_RECIPE movements whose referenceId is not already counted in PAID orders
  for (const mov of params.inventoryMovements) {
    if (mov.movementType !== 'OUT_SALE' && mov.movementType !== 'OUT_RECIPE') continue;
    if (mov.referenceId && paidOrderIds.has(mov.referenceId)) continue;
    const ts = new Date(mov.createdAt).getTime();
    if (Number.isNaN(ts) || ts < windowStartMs || ts > refMs + MS_PER_DAY) continue;
    const absQty = new Decimal(mov.qtyChange || '0').abs();
    if (absQty.lte(0)) continue;

    soldWindowMap.set(
      mov.productId,
      (soldWindowMap.get(mov.productId) ?? new Decimal(0)).plus(absQty)
    );
    if (ts >= recent7StartMs) {
      soldRecent7Map.set(
        mov.productId,
        (soldRecent7Map.get(mov.productId) ?? new Decimal(0)).plus(absQty)
      );
    }
  }

  const recommendations: StockForecastRecommendation[] = [];
  let urgentCount = 0;
  let soonCount = 0;
  let healthyCount = 0;
  let totalEstimatedPoValue = new Decimal(0);

  const recentDaysDenominator = Math.min(7, cfg.lookbackDays);

  for (const product of trackedProducts) {
    const stock = Decimal.max(new Decimal(0), new Decimal(product.stockQty || '0'));
    const minAlert = Decimal.max(new Decimal(0), new Decimal(product.minStockAlert || '0'));
    const unitCost = Decimal.max(new Decimal(0), new Decimal(product.costPriceAvg || '0'));

    const soldWindow = soldWindowMap.get(product.id) ?? new Decimal(0);
    const sold7 = soldRecent7Map.get(product.id) ?? new Decimal(0);

    let dailyVelocity: Decimal;
    let velocitySource: 'SALES_HISTORY' | 'MIN_STOCK_BASELINE';

    if (soldWindow.gt(0)) {
      const avgFull = soldWindow.div(cfg.lookbackDays);
      const avgRecent = sold7.div(recentDaysDenominator);
      // Weighted velocity: 60% recent momentum + 40% full lookback average
      dailyVelocity = avgRecent.times('0.6').plus(avgFull.times('0.4')).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      velocitySource = 'SALES_HISTORY';
    } else if (minAlert.gt(0)) {
      // Fallback baseline when no sales logged in lookback window yet
      dailyVelocity = minAlert.div(7).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      velocitySource = 'MIN_STOCK_BASELINE';
    } else {
      dailyVelocity = new Decimal(0);
      velocitySource = 'MIN_STOCK_BASELINE';
    }

    const daysOfCover = dailyVelocity.gt(0)
      ? stock.div(dailyVelocity).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber()
      : null;

    // Safety stock: max(minAlert, leadTime * velocity * 0.5)
    const velocitySafety = dailyVelocity.times(cfg.leadTimeDays).times('0.5');
    const safetyStock = Decimal.max(minAlert, velocitySafety);

    const reorderPoint = dailyVelocity
      .times(cfg.leadTimeDays)
      .plus(safetyStock)
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    // Target stock covers targetCoverDays + leadTimeDays + safety buffer, at least 2x minAlert
    const velocityTarget = dailyVelocity.times(cfg.targetCoverDays + cfg.leadTimeDays).plus(safetyStock);
    const minBaselineTarget = minAlert.gt(0) ? minAlert.times(2) : new Decimal(0);
    const targetStock = Decimal.max(velocityTarget, minBaselineTarget);

    let urgency: ForecastUrgency;
    if (
      stock.lte(0) ||
      (minAlert.gt(0) && stock.lte(minAlert)) ||
      (daysOfCover !== null && daysOfCover <= cfg.leadTimeDays + 1)
    ) {
      urgency = 'URGENT';
      urgentCount += 1;
    } else if (
      stock.lte(reorderPoint) ||
      (daysOfCover !== null && daysOfCover <= Math.max(cfg.leadTimeDays + 3, Math.floor(cfg.targetCoverDays * 0.55)))
    ) {
      urgency = 'SOON';
      soonCount += 1;
    } else {
      urgency = 'HEALTHY';
      healthyCount += 1;
    }

    const rawGap = targetStock.minus(stock);
    const recommendedQty =
      urgency === 'HEALTHY' && rawGap.lte(0)
        ? new Decimal(0)
        : rawGap.gt(0)
        ? rawGap.toDecimalPlaces(0, Decimal.ROUND_CEIL)
        : urgency === 'URGENT'
        ? Decimal.max(new Decimal(1), minAlert.toDecimalPlaces(0, Decimal.ROUND_CEIL))
        : new Decimal(0);

    const estimatedCost = recommendedQty.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    if (urgency !== 'HEALTHY' && recommendedQty.gt(0)) {
      totalEstimatedPoValue = totalEstimatedPoValue.plus(estimatedCost);
    }

    const rationale =
      velocitySource === 'SALES_HISTORY'
        ? `Kecepatan jual ${dailyVelocity.toFixed(2)} ${product.unit}/hari (${soldWindow.toFixed(0)} terjual dalam ${cfg.lookbackDays} hari)${
            daysOfCover !== null ? ` · Cukup ±${daysOfCover} hari` : ''
          }`
        : `Belum ada penjualan ${cfg.lookbackDays} hari terakhir · Menggunakan batas stok min (${minAlert.toFixed(0)} ${product.unit})`;

    recommendations.push({
      product,
      currentStock: stock.toFixed(4),
      minStockAlert: minAlert.toFixed(4),
      soldInWindow: soldWindow.toFixed(4),
      soldLast7Days: sold7.toFixed(4),
      dailyVelocity: dailyVelocity.toFixed(4),
      velocitySource,
      daysOfCover,
      reorderPoint: reorderPoint.toFixed(4),
      recommendedOrderQty: recommendedQty.toFixed(4),
      estimatedOrderCost: estimatedCost.toFixed(4),
      urgency,
      rationale,
    });
  }

  recommendations.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    const docA = a.daysOfCover ?? 9999;
    const docB = b.daysOfCover ?? 9999;
    if (docA !== docB) return docA - docB;
    return a.product.name.localeCompare(b.product.name);
  });

  const actionableRecommendations = recommendations.filter(
    (r) => (r.urgency === 'URGENT' || r.urgency === 'SOON') && new Decimal(r.recommendedOrderQty).gt(0)
  );

  return {
    config: cfg,
    recommendations,
    actionableRecommendations,
    counts: {
      urgent: urgentCount,
      soon: soonCount,
      healthy: healthyCount,
      totalTracked: trackedProducts.length,
    },
    totalEstimatedPoValue: totalEstimatedPoValue.toFixed(4),
  };
}

export interface PurchaseOrderLineDraft {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQty: string;
  unitCostEstimate: string;
  dailyVelocitySnapshot?: string;
  daysOfCoverSnapshot?: string;
}

/**
 * Builds a validated PurchaseOrder object with Decimal.js exact totals.
 */
export function buildPurchaseOrder(params: {
  tenantId: string;
  poSeq: number;
  supplierName: string;
  supplierPhone?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  createdByName?: string;
  items: PurchaseOrderLineDraft[];
}): PurchaseOrder {
  const validLines = params.items.filter((i) => {
    try {
      return new Decimal(i.orderedQty || '0').gt(0);
    } catch {
      return false;
    }
  });

  if (validLines.length === 0) {
    throw new Error('Purchase Order harus memiliki minimal 1 barang dengan jumlah > 0.');
  }

  const now = new Date().toISOString();
  const orderDate = params.orderDate || now.slice(0, 10);
  const poId = `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const poNumber = `PO-${orderDate.replace(/-/g, '')}-${String(params.poSeq).padStart(4, '0')}`;

  let totalEst = new Decimal(0);
  const poItems: PurchaseOrderItem[] = validLines.map((line, idx) => {
    const qty = new Decimal(line.orderedQty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const unitCost = Decimal.max(new Decimal(0), new Decimal(line.unitCostEstimate || '0')).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const lineTotal = qty.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    totalEst = totalEst.plus(lineTotal);
    return {
      id: `poi-${poId}-${idx + 1}`,
      productId: line.productId,
      productNameSnapshot: line.productName,
      skuSnapshot: line.sku,
      unitSnapshot: line.unit,
      orderedQty: qty.toFixed(4),
      unitCostEstimate: unitCost.toFixed(4),
      lineTotal: lineTotal.toFixed(4),
      dailyVelocitySnapshot: line.dailyVelocitySnapshot,
      daysOfCoverSnapshot: line.daysOfCoverSnapshot,
    };
  });

  return {
    id: poId,
    tenantId: params.tenantId,
    poNumber,
    supplierName: params.supplierName.trim() || 'Supplier Grosir Utama',
    supplierPhone: params.supplierPhone?.trim() || undefined,
    orderDate,
    expectedDeliveryDate: params.expectedDeliveryDate?.trim() || undefined,
    status: 'DRAFT',
    totalEstimatedCost: totalEst.toFixed(4),
    notes: params.notes?.trim() || undefined,
    items: poItems,
    receivedAt: null,
    createdByName: params.createdByName || 'Pemilik Usaha',
    createdAt: now,
  };
}
