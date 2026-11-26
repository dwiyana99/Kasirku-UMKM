/**
 * KasirAkun UMKM — Subscription Lifecycle, Module Access Gating & Perpetual Inventory/BOM Math
 * Strictly uses Decimal.js for all monetary and stock quantity calculations.
 */

import Decimal from 'decimal.js';
import { DEFAULT_FEATURE_MODULES } from '../../../prisma/seed.ts';
import { buildJournalEntry } from '../accounting/journal-engine.ts';
import type {
  Account,
  CustomerAccountStatus,
  FeatureModule,
  JournalEntry,
  Product,
  ProductRecipe,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type ModuleCode = FeatureModule['code'];

export const ROUTE_MODULE_REQUIREMENTS: Record<string, ModuleCode> = {
  '/kitchen': 'QR_TABLE_KITCHEN',
  '/tables': 'QR_TABLE_KITCHEN',
  '/accounting': 'ACCOUNTING_FULL',
  '/expenses': 'ACCOUNTING_FULL',
  '/tax': 'TAX_CORETAX',
};

export function getRequiredModuleForRoute(route: string): ModuleCode | null {
  return ROUTE_MODULE_REQUIREMENTS[route] ?? null;
}

export function getModuleMetadata(code: ModuleCode) {
  return DEFAULT_FEATURE_MODULES.find((m) => m.code === code) ?? DEFAULT_FEATURE_MODULES[0];
}

/**
 * Evaluates whether a tenant/user can access a feature gated by a subscription module.
 * Blocks access if the account is SUSPENDED or DEACTIVATED, or if the module is not active.
 */
export function canAccessModule(
  activeModules: ModuleCode[],
  requiredModule: ModuleCode,
  accountStatus?: CustomerAccountStatus | null
): boolean {
  if (accountStatus === 'SUSPENDED' || accountStatus === 'DEACTIVATED') {
    return false;
  }
  if (requiredModule === 'POS_BASIC') {
    return true;
  }
  return activeModules.includes(requiredModule);
}

export type SubscriptionLifecycleStage =
  | 'SELECTING_PLAN'
  | 'PENDING_PAYMENT'
  | 'VERIFIED_PAID'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export function resolveOnboardingLifecycleStage(params: {
  step: 1 | 2 | 3 | 4;
  invoiceStatus: 'PENDING_PAYMENT' | 'VERIFIED_PAID' | null;
}): SubscriptionLifecycleStage {
  if (params.step === 1) return 'SELECTING_PLAN';
  if (params.invoiceStatus === 'VERIFIED_PAID') return 'VERIFIED_PAID';
  return 'PENDING_PAYMENT';
}

export interface BomCalculationResult {
  unitCost: string; // NUMERIC(19,4)
  maxCraftablePortions: number | null; // null if no recipe ingredients
  ingredientBreakdown: Array<{
    ingredientId: string;
    ingredientName: string;
    unit: string;
    quantityRequired: string;
    ingredientCostAvg: string;
    lineCost: string;
    availableStock: string;
  }>;
}

/**
 * Computes exact BOM unit COGS (HPP per portion) for a finished menu item from raw materials.
 */
export function calculateBomUnitCost(
  menuProductId: string,
  recipes: ProductRecipe[],
  products: Product[]
): BomCalculationResult {
  const menuRecipes = recipes.filter((r) => r.menuProductId === menuProductId);
  if (menuRecipes.length === 0) {
    return {
      unitCost: '0.0000',
      maxCraftablePortions: null,
      ingredientBreakdown: [],
    };
  }

  let totalCost = new Decimal(0);
  let minPortions: number | null = null;
  const ingredientBreakdown: BomCalculationResult['ingredientBreakdown'] = [];

  for (const rec of menuRecipes) {
    const ing = products.find((p) => p.id === rec.ingredientProductId);
    if (!ing) continue;
    const qtyReq = new Decimal(rec.quantityRequired || '0');
    const costAvg = new Decimal(ing.costPriceAvg || '0');
    const stockQty = new Decimal(ing.stockQty || '0');
    const lineCost = qtyReq.times(costAvg);

    totalCost = totalCost.plus(lineCost);

    if (qtyReq.gt(0)) {
      const possible = Math.floor(stockQty.div(qtyReq).toNumber());
      minPortions = minPortions === null ? Math.max(0, possible) : Math.min(minPortions, Math.max(0, possible));
    }

    ingredientBreakdown.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      quantityRequired: qtyReq.toFixed(4),
      ingredientCostAvg: costAvg.toFixed(4),
      lineCost: lineCost.toFixed(4),
      availableStock: stockQty.toFixed(4),
    });
  }

  return {
    unitCost: totalCost.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    maxCraftablePortions: minPortions,
    ingredientBreakdown,
  };
}

/**
 * Computes perpetual Moving Average inventory valuation on stock purchase/restock.
 */
export function calculateRestockMovingAverage(params: {
  currentQty: string;
  currentAvgCost: string;
  addedQty: string;
  purchaseUnitCost: string;
}): {
  newQty: string;
  newAvgCost: string;
  totalPurchaseValue: string;
} {
  const curQty = Decimal.max(new Decimal(0), new Decimal(params.currentQty || '0'));
  const curAvg = Decimal.max(new Decimal(0), new Decimal(params.currentAvgCost || '0'));
  const addQty = new Decimal(params.addedQty || '0');
  const unitCost = new Decimal(params.purchaseUnitCost || '0');

  if (addQty.lte(0)) {
    throw new Error('Jumlah stok masuk harus lebih besar dari 0.');
  }
  if (unitCost.lt(0)) {
    throw new Error('Harga beli satuan tidak boleh negatif.');
  }

  const totalPurchaseValue = addQty.times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const newQty = curQty.plus(addQty);
  const totalInventoryValue = curQty.times(curAvg).plus(totalPurchaseValue);
  const newAvgCost = newQty.gt(0)
    ? totalInventoryValue.div(newQty).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
    : unitCost.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

  return {
    newQty: newQty.toFixed(4),
    newAvgCost: newAvgCost.toFixed(4),
    totalPurchaseValue: totalPurchaseValue.toFixed(4),
  };
}

/**
 * Automated Double-Entry Journal for Inventory Restock / Raw Material Purchase:
 *   Dr Persediaan Barang Dagang / Bahan Baku (1105)
 *   Cr Kas Tunai (1101) / Bank (1102) / Utang Usaha (2101)
 */
export function createInventoryPurchaseJournalEntry(params: {
  tenantId: string;
  productName: string;
  addedQty: string;
  unit: string;
  totalPurchaseValue: string;
  paymentAccountCode: '1101' | '1102' | '2101';
  accounts: Account[];
  entrySeq: number;
  entryDate?: string;
}): JournalEntry {
  const amount = new Decimal(params.totalPurchaseValue);
  const entryDate = params.entryDate ?? new Date().toISOString().slice(0, 10);
  const id = `je-inv-${Date.now()}-${params.entrySeq}`;

  return buildJournalEntry({
    id,
    tenantId: params.tenantId,
    entryNumber: `INV-${entryDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'INVENTORY',
    sourceId: id,
    description: `Pembelian Stok ${params.productName} (${new Decimal(params.addedQty).toFixed(2)} ${params.unit})`,
    accounts: params.accounts,
    draftLines: [
      {
        accountCode: '1105',
        debit: amount.toFixed(4),
        credit: '0.0000',
        memo: `Penambahan persediaan ${params.productName}`,
      },
      {
        accountCode: params.paymentAccountCode,
        debit: '0.0000',
        credit: amount.toFixed(4),
        memo:
          params.paymentAccountCode === '2101'
            ? `Utang supplier pembelian ${params.productName}`
            : `Pembayaran pembelian stok ${params.productName}`,
      },
    ],
  });
}

/**
 * Automated Double-Entry Journal for Stock Opname Variance (Surplus or Shrinkage).
 */
export function createStockOpnameJournalEntry(params: {
  tenantId: string;
  productName: string;
  qtyDelta: string; // positive = surplus, negative = shrinkage
  unitCostAvg: string;
  accounts: Account[];
  entrySeq: number;
  entryDate?: string;
}): JournalEntry | null {
  const delta = new Decimal(params.qtyDelta || '0');
  const unitCost = new Decimal(params.unitCostAvg || '0');
  const varianceValue = delta.abs().times(unitCost).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  if (varianceValue.lte(0)) return null;

  const entryDate = params.entryDate ?? new Date().toISOString().slice(0, 10);
  const id = `je-opn-${Date.now()}-${params.entrySeq}`;
  const isSurplus = delta.gt(0);

  return buildJournalEntry({
    id,
    tenantId: params.tenantId,
    entryNumber: `OPM-${entryDate.replace(/-/g, '')}-${String(params.entrySeq).padStart(4, '0')}`,
    entryDate,
    sourceModule: 'INVENTORY',
    sourceId: id,
    description: `Penyesuaian Stock Opname ${params.productName} (${isSurplus ? '+' : ''}${delta.toFixed(2)})`,
    accounts: params.accounts,
    draftLines: isSurplus
      ? [
          {
            accountCode: '1105',
            debit: varianceValue.toFixed(4),
            credit: '0.0000',
            memo: `Surplus stok opname ${params.productName}`,
          },
          {
            accountCode: '5101',
            debit: '0.0000',
            credit: varianceValue.toFixed(4),
            memo: `Koreksi HPP surplus opname ${params.productName}`,
          },
        ]
      : [
          {
            accountCode: '5101',
            debit: varianceValue.toFixed(4),
            credit: '0.0000',
            memo: `Selisih kurang stok opname ${params.productName}`,
          },
          {
            accountCode: '1105',
            debit: '0.0000',
            credit: varianceValue.toFixed(4),
            memo: `Pengurangan persediaan opname ${params.productName}`,
          },
        ],
  });
}
