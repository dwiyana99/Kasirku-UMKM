import Decimal from 'decimal.js';
import type { BusinessVertical, Product, ProductRecipe } from '../../types/domain';

export interface LiveStockInfo {
  tracksStock: boolean;
  unitLabel: string;
  baseStock: Decimal;
  inCartQty: Decimal;
  availableAfterCart: Decimal;
  projectedAfterDraft: Decimal;
  exceedsStock: boolean;
  isLow: boolean;
}

export interface CartQtyEntry {
  productId: string;
  qty: number;
}

/**
 * Warung Sembako and Kedai Makan use scan/search-first POS mode:
 * The product & barcode list starts empty and only reveals items once the cashier
 * scans a barcode or types a product name / SKU.
 */
export function isSearchFirstPosVertical(vertical: BusinessVertical): boolean {
  return vertical === 'WARUNG_SEMBAKO' || vertical === 'KEDAI_MAKAN';
}

/**
 * Filters sellable products for POS.
 * In search-first verticals (WARUNG_SEMBAKO / KEDAI_MAKAN), returns empty array
 * until a non-empty search query / barcode scan is entered.
 */
export function filterPosProducts(params: {
  vertical: BusinessVertical;
  sellableProducts: Product[];
  searchQuery: string;
  selectedCategoryId: string;
}): Product[] {
  const { vertical, sellableProducts, searchQuery, selectedCategoryId } = params;
  const q = searchQuery.trim().toLowerCase();

  if (isSearchFirstPosVertical(vertical) && !q) {
    return [];
  }

  return sellableProducts.filter((p) => {
    if (!isSearchFirstPosVertical(vertical) && selectedCategoryId !== 'ALL') {
      if (p.categoryId !== selectedCategoryId) return false;
    }
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcodeQr.toLowerCase().includes(q)
    );
  });
}

/**
 * Computes real-time remaining stock for a product taking into account:
 *  1) Items already placed in the active POS cart
 *  2) The cashier's pending draft quantity BEFORE clicking "Tambah"
 *
 * Supports both RETAIL_GOODS (direct stockQty) and MENU_ITEM (BOM ingredient stock).
 */
export function computeLivePosStock(params: {
  product: Product;
  allProducts: Product[];
  productRecipes: ProductRecipe[];
  cart: CartQtyEntry[];
  draftQty: number;
}): LiveStockInfo {
  const { product, allProducts, productRecipes, cart, draftQty } = params;
  const safeDraft = new Decimal(Number.isFinite(draftQty) && draftQty > 0 ? draftQty : 0);
  const inCartNum = cart
    .filter((c) => c.productId === product.id)
    .reduce((sum, c) => sum + c.qty, 0);
  const inCartQty = new Decimal(inCartNum);

  if (product.itemType === 'RETAIL_GOODS') {
    const baseStock = new Decimal(product.stockQty || '0');
    const availableAfterCart = Decimal.max(0, baseStock.minus(inCartQty));
    const projectedAfterDraft = Decimal.max(0, availableAfterCart.minus(safeDraft));
    const exceedsStock = safeDraft.gt(availableAfterCart);
    const minAlert = new Decimal(product.minStockAlert || '0');
    const isLow = projectedAfterDraft.lte(minAlert);

    return {
      tracksStock: true,
      unitLabel: product.unit || 'pcs',
      baseStock,
      inCartQty,
      availableAfterCart,
      projectedAfterDraft,
      exceedsStock,
      isLow,
    };
  }

  if (product.itemType === 'MENU_ITEM') {
    const myRecipes = productRecipes.filter((r) => r.menuProductId === product.id);
    if (myRecipes.length > 0) {
      // Calculate how much of each raw material is already consumed by ALL items currently in cart
      const rawUsedByCart = new Map<string, Decimal>();
      for (const entry of cart) {
        const entryRecipes = productRecipes.filter((r) => r.menuProductId === entry.productId);
        for (const r of entryRecipes) {
          const prev = rawUsedByCart.get(r.ingredientProductId) ?? new Decimal(0);
          rawUsedByCart.set(
            r.ingredientProductId,
            prev.plus(new Decimal(r.quantityRequired || '0').times(entry.qty))
          );
        }
      }

      let baseCraftable: Decimal | null = null;
      let afterCartCraftable: Decimal | null = null;

      for (const r of myRecipes) {
        const raw = allProducts.find((p) => p.id === r.ingredientProductId);
        const req = new Decimal(r.quantityRequired || '0');
        if (!raw || req.lte(0)) continue;

        const totalRawStock = new Decimal(raw.stockQty || '0');
        const usedRaw = rawUsedByCart.get(r.ingredientProductId) ?? new Decimal(0);
        const remainingRaw = Decimal.max(0, totalRawStock.minus(usedRaw));

        const maxBase = totalRawStock.div(req).floor();
        const maxAfterCart = remainingRaw.div(req).floor();

        baseCraftable = baseCraftable === null ? maxBase : Decimal.min(baseCraftable, maxBase);
        afterCartCraftable =
          afterCartCraftable === null
            ? maxAfterCart
            : Decimal.min(afterCartCraftable, maxAfterCart);
      }

      const base = baseCraftable ?? new Decimal(0);
      const avail = afterCartCraftable ?? new Decimal(0);
      const projected = Decimal.max(0, avail.minus(safeDraft));
      const exceedsStock = safeDraft.gt(avail);
      const isLow = projected.lte(5);

      return {
        tracksStock: true,
        unitLabel: product.unit || 'porsi',
        baseStock: base,
        inCartQty,
        availableAfterCart: avail,
        projectedAfterDraft: projected,
        exceedsStock,
        isLow,
      };
    }
  }

  return {
    tracksStock: false,
    unitLabel: product.unit || 'unit',
    baseStock: new Decimal(0),
    inCartQty,
    availableAfterCart: new Decimal(999999),
    projectedAfterDraft: new Decimal(999999),
    exceedsStock: false,
    isLow: false,
  };
}
