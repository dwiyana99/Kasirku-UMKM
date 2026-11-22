/**
 * Smart Selling Price & Anti-Minus Margin Simulator (100% Zero AI Token, Decimal.js)
 * Helps UMKM owners (Plans > LITE: BASIC, PRO, EXPERT) calculate safe selling prices
 * from HPP/purchase cost + markup/margin %, accounting for operational overhead,
 * packaging/extra costs, payment gateway MDR fees, and Indonesian taxes (PPN/PB1/PPh).
 */

import Decimal from 'decimal.js';
import type { AddOnModuleCode, SubscriptionPlanCode } from '../../types/domain';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type PricingStrategyMode = 'MARKUP_PCT' | 'TARGET_NET_MARGIN_PCT' | 'MANUAL';

export type PricingHealthStatus = 'LOSS' | 'THIN' | 'HEALTHY';

export interface PricingSimulationInput {
  /** Modal beli / HPP per 1 unit barang atau 1 porsi menu */
  costPrice: string | number;
  /** Cara menentukan harga jual */
  mode: PricingStrategyMode;
  /** Persentase kenaikan dari HPP (jika MARKUP_PCT) atau target untung bersih % (jika TARGET_NET_MARGIN_PCT) */
  percentageValue?: string | number;
  /** Harga jual manual jika mode === 'MANUAL' */
  manualSellingPrice?: string | number;
  /** Estimasi biaya operasional toko per unit dalam % dari harga jual (listrik, sewa, gaji) */
  operationalCostPct?: string | number;
  /** Tambahan biaya tetap per unit (plastik, kemasan, label, ongkir per pcs) dalam Rp */
  extraFixedCost?: string | number;
  /** Biaya potongan non-tunai / QRIS / e-wallet yang ditanggung toko (%) */
  paymentFeePct?: string | number;
  /** Estimasi pajak yang ditanggung dari harga jual (mis. PPh UMKM 0.5%, atau PPN/PB1 inklusif) (%) */
  taxRatePct?: string | number;
  /** Pembulatan harga jual agar ramah pembeli (0 = tidak dibulatkan, 100, 500, 1000) */
  roundingStep?: 0 | 100 | 500 | 1000;
}

export interface PricingProjectionRow {
  unitsPerMonth: number;
  estimatedRevenue: string;
  estimatedNetProfit: string;
}

export interface PricingSimulationResult {
  canCalculate: boolean;
  errorMessage: string | null;
  hppAmount: string;
  extraFixedCostAmount: string;
  operationalAmount: string;
  paymentFeeAmount: string;
  taxAmount: string;
  totalCostPerUnit: string;
  /** Harga paling minimal agar tidak rugi sama sekali (BEP per unit) */
  breakEvenPrice: string;
  /** Harga jual hasil simulasi (sudah dibulatkan jika dipilih) */
  recommendedSellingPrice: string;
  /** Laba kotor = Harga Jual - HPP */
  grossProfitPerUnit: string;
  /** Untung bersih riil = Harga Jual - (HPP + Kemasan + Operasional + Biaya Bayar + Pajak) */
  netProfitPerUnit: string;
  /** Persentase untung bersih terhadap harga jual */
  netMarginPct: string;
  /** Persentase kenaikan harga jual terhadap HPP */
  effectiveMarkupPct: string;
  /** Total persentase beban variabel (operasional + MDR + pajak) */
  totalVariableRatePct: string;
  healthStatus: PricingHealthStatus;
  healthLabel: string;
  healthAdvice: string;
  monthlyProjections: PricingProjectionRow[];
}

function toSafeDecimal(val: string | number | undefined | null): Decimal {
  if (val === undefined || val === null || val === '') return new Decimal(0);
  try {
    const cleaned = typeof val === 'string' ? val.replace(/[^\d.-]/g, '') : String(val);
    if (!cleaned || cleaned === '-' || cleaned === '.') return new Decimal(0);
    const d = new Decimal(cleaned);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function roundUpToStep(amount: Decimal, step: 0 | 100 | 500 | 1000): Decimal {
  if (!step || step <= 0) return amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return amount.div(step).ceil().times(step);
}

/**
 * Plans above LITE (BASIC, PRO, EXPERT) OR Paket LITE with ADDON_PRICING_SIMULATOR
 * unlock the full Anti-Rugi Selling Price Simulator & Bulk Repricing tools.
 */
export function canUsePricingSimulator(
  planCode?: SubscriptionPlanCode | null,
  activeAddOns?: AddOnModuleCode[] | null
): boolean {
  if (planCode !== 'LITE') return true;
  return Boolean(activeAddOns?.includes('ADDON_PRICING_SIMULATOR'));
}

export interface SimpleMarginPriceResult {
  costPrice: string;
  marginPct: string;
  recommendedPrice: string;
  estimatedProfitPerUnit: string;
}

/**
 * Simple HPP + Margin % price recommendation specifically for Paket LITE.
 * Formula: recommendedPrice = HPP * (1 + marginPct / 100), optionally rounded up.
 */
export function computeSimpleMarginPrice(
  costPrice: string | number,
  marginPct: string | number,
  roundingStep: 0 | 100 | 500 | 1000 = 0
): SimpleMarginPriceResult {
  const hpp = Decimal.max(0, toSafeDecimal(costPrice));
  const pct = Decimal.max(0, Decimal.min(500, toSafeDecimal(marginPct)));
  const rawPrice = hpp.gt(0) ? hpp.times(new Decimal(1).plus(pct.div(100))) : new Decimal(0);
  const recommended = roundUpToStep(rawPrice, roundingStep);
  const profit = recommended.minus(hpp);

  return {
    costPrice: hpp.toFixed(4),
    marginPct: pct.toFixed(2),
    recommendedPrice: recommended.toFixed(4),
    estimatedProfitPerUnit: profit.toFixed(4),
  };
}

/**
 * Computes full selling price, break-even floor, and anti-minus profit breakdown with Decimal.js.
 */
export function simulateSellingPrice(input: PricingSimulationInput): PricingSimulationResult {
  const hpp = Decimal.max(0, toSafeDecimal(input.costPrice));
  const extraFixed = Decimal.max(0, toSafeDecimal(input.extraFixedCost));
  const opPct = Decimal.max(0, Decimal.min(80, toSafeDecimal(input.operationalCostPct)));
  const payPct = Decimal.max(0, Decimal.min(25, toSafeDecimal(input.paymentFeePct)));
  const taxPct = Decimal.max(0, Decimal.min(30, toSafeDecimal(input.taxRatePct)));
  const pctValue = Decimal.max(0, toSafeDecimal(input.percentageValue));
  const roundingStep = input.roundingStep ?? 0;

  const totalVarPct = opPct.plus(payPct).plus(taxPct);
  const totalVarRate = totalVarPct.div(100);
  const fixedBaseCost = hpp.plus(extraFixed);

  const emptyResult = (errorMessage: string): PricingSimulationResult => ({
    canCalculate: false,
    errorMessage,
    hppAmount: hpp.toFixed(4),
    extraFixedCostAmount: extraFixed.toFixed(4),
    operationalAmount: '0.0000',
    paymentFeeAmount: '0.0000',
    taxAmount: '0.0000',
    totalCostPerUnit: fixedBaseCost.toFixed(4),
    breakEvenPrice: '0.0000',
    recommendedSellingPrice: '0.0000',
    grossProfitPerUnit: '0.0000',
    netProfitPerUnit: '0.0000',
    netMarginPct: '0.00',
    effectiveMarkupPct: '0.00',
    totalVariableRatePct: totalVarPct.toFixed(2),
    healthStatus: 'LOSS',
    healthLabel: 'Perlu Diperiksa',
    healthAdvice: errorMessage,
    monthlyProjections: [],
  });

  if (totalVarRate.gte(new Decimal('0.95'))) {
    return emptyResult(
      'Total persentase biaya operasional, potongan pembayaran, dan pajak terlalu tinggi (95% atau lebih). Kurangi persentase biaya terlebih dahulu.'
    );
  }

  // Exact Break-Even Price: P_bep * (1 - totalVarRate) = HPP + extraFixed
  const breakEvenRaw = fixedBaseCost.gt(0)
    ? fixedBaseCost.div(new Decimal(1).minus(totalVarRate))
    : new Decimal(0);
  const breakEvenPrice = breakEvenRaw.gt(0) ? breakEvenRaw.ceil() : new Decimal(0);

  let rawSellingPrice = new Decimal(0);

  if (input.mode === 'MANUAL') {
    rawSellingPrice = Decimal.max(0, toSafeDecimal(input.manualSellingPrice));
  } else if (input.mode === 'MARKUP_PCT') {
    // Markup from HPP: Price = HPP * (1 + markup/100) + extraFixed
    // Note: if HPP is 0 but extraFixed > 0, use extraFixed as base
    const base = hpp.gt(0) ? hpp : extraFixed;
    rawSellingPrice = base.times(new Decimal(1).plus(pctValue.div(100)));
    if (hpp.gt(0) && extraFixed.gt(0)) {
      rawSellingPrice = rawSellingPrice.plus(extraFixed);
    }
    rawSellingPrice = roundUpToStep(rawSellingPrice, roundingStep);
  } else {
    // TARGET_NET_MARGIN_PCT:
    // Price * (1 - totalVarRate - targetMarginRate) = HPP + extraFixed
    const targetMarginRate = pctValue.div(100);
    const denominator = new Decimal(1).minus(totalVarRate).minus(targetMarginRate);
    if (denominator.lte(new Decimal('0.02'))) {
      return emptyResult(
        `Target untung bersih ${pctValue.toFixed(1)}% ditambah total biaya ${totalVarPct.toFixed(1)}% melebihi batas wajar (100%). Turunkan target persentase untung bersih.`
      );
    }
    rawSellingPrice = fixedBaseCost.div(denominator);
    rawSellingPrice = roundUpToStep(rawSellingPrice, roundingStep);
  }

  const sellingPrice = rawSellingPrice.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const operationalAmount = sellingPrice.times(opPct.div(100));
  const paymentFeeAmount = sellingPrice.times(payPct.div(100));
  const taxAmount = sellingPrice.times(taxPct.div(100));
  const totalCostPerUnit = fixedBaseCost
    .plus(operationalAmount)
    .plus(paymentFeeAmount)
    .plus(taxAmount);

  const grossProfitPerUnit = sellingPrice.minus(hpp);
  const netProfitPerUnit = sellingPrice.minus(totalCostPerUnit);

  const netMarginPct = sellingPrice.gt(0)
    ? netProfitPerUnit.div(sellingPrice).times(100)
    : new Decimal(0);
  const effectiveMarkupPct = hpp.gt(0)
    ? sellingPrice.minus(hpp).div(hpp).times(100)
    : new Decimal(0);

  let healthStatus: PricingHealthStatus = 'HEALTHY';
  let healthLabel = 'Aman & Untung Sehat';
  let healthAdvice = `Harga jual ini sudah menutup modal barang, biaya operasional, potongan bayar, dan pajak dengan untung bersih ${netMarginPct.toFixed(1)}% per unit.`;

  if (sellingPrice.lte(0)) {
    healthStatus = 'LOSS';
    healthLabel = 'Belum Ada Harga Jual';
    healthAdvice = 'Isi modal barang (HPP) dan persentase keuntungan atau harga jual untuk melihat simulasi.';
  } else if (netProfitPerUnit.lt(0)) {
    healthStatus = 'LOSS';
    healthLabel = 'Bahaya: Harga Minus (Rugi)';
    const safeMin = roundUpToStep(breakEvenPrice.times('1.10'), roundingStep || 500);
    healthAdvice = `Harga jual masih di bawah titik impas (Rp${breakEvenPrice.toFixed(0)}). Naikkan minimal ke Rp${safeMin.toFixed(0)} agar operasional dan pajak tertutup tanpa rugi.`;
  } else if (netMarginPct.lt(5)) {
    healthStatus = 'THIN';
    healthLabel = 'Untung Sangat Tipis';
    healthAdvice = `Untung bersih di bawah 5% (${netMarginPct.toFixed(1)}%). Jika sewaktu-waktu ada diskon atau kenaikan harga kulakan, untung bisa tergerus menjadi rugi.`;
  }

  const monthlyProjections: PricingProjectionRow[] = [15, 50, 100].map((units) => ({
    unitsPerMonth: units,
    estimatedRevenue: sellingPrice.times(units).toFixed(4),
    estimatedNetProfit: netProfitPerUnit.times(units).toFixed(4),
  }));

  return {
    canCalculate: sellingPrice.gt(0),
    errorMessage: null,
    hppAmount: hpp.toFixed(4),
    extraFixedCostAmount: extraFixed.toFixed(4),
    operationalAmount: operationalAmount.toFixed(4),
    paymentFeeAmount: paymentFeeAmount.toFixed(4),
    taxAmount: taxAmount.toFixed(4),
    totalCostPerUnit: totalCostPerUnit.toFixed(4),
    breakEvenPrice: breakEvenPrice.toFixed(4),
    recommendedSellingPrice: sellingPrice.toFixed(4),
    grossProfitPerUnit: grossProfitPerUnit.toFixed(4),
    netProfitPerUnit: netProfitPerUnit.toFixed(4),
    netMarginPct: netMarginPct.toFixed(2),
    effectiveMarkupPct: effectiveMarkupPct.toFixed(2),
    totalVariableRatePct: totalVarPct.toFixed(2),
    healthStatus,
    healthLabel,
    healthAdvice,
    monthlyProjections,
  };
}
