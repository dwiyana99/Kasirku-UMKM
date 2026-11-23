/**
 * KasirAkun UMKM — POS Checkout, Perpetual COGS (Moving Average + BOM Recipe) & ESC/POS Thermal Receipt Service
 */

import Decimal from 'decimal.js';
import type {
  Account,
  InventoryMovement,
  JournalEntry,
  Order,
  OrderItem,
  OrderSource,
  Payment,
  PaymentMethod,
  Product,
  ProductRecipe,
  RegionalTaxRule,
  Tenant,
} from '../../types/domain.ts';
import { calculateOrderTax } from '../tax/indonesia-tax-engine.ts';
import { createSaleJournalEntries } from '../accounting/journal-engine.ts';
import { getEffectiveReceiptDesign, getEscPosDividerChar } from './receipt-design.ts';
import { calculateChannelMdr } from './payment-verifier.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface CartLineInput {
  productId: string;
  qty: number;
  notes?: string;
}

export interface CheckoutInput {
  tenant: Tenant;
  products: Product[];
  recipes: ProductRecipe[];
  accounts: Account[];
  cart: CartLineInput[];
  orderSource: OrderSource;
  paymentMethod: PaymentMethod;
  customerName: string;
  tableId?: string | null;
  tableNumber?: string;
  discountAmount?: string;
  gatewayRefId?: string | null;
  stylistName?: string;
  stylistCommissionRate?: string;
  customAttributes?: Record<string, string | number | boolean>;
  markPaidImmediately?: boolean;
  journalSeqStart: number;
  regionalTaxRegistry?: RegionalTaxRule[];
}

export interface CheckoutResult {
  order: Order;
  payment: Payment | null;
  updatedProducts: Product[];
  newInventoryMovements: InventoryMovement[];
  newJournalEntries: JournalEntry[];
}

export function formatRupiah(value: string | number | Decimal): string {
  const dec = value instanceof Decimal ? value : new Decimal(value || '0');
  const isNeg = dec.lt(0);
  const absInt = dec.abs().toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const formatted = new Intl.NumberFormat('id-ID').format(absInt);
  return isNeg ? `-Rp${formatted}` : `Rp${formatted}`;
}

export function computeMenuItemRecipeCogs(
  menuProductId: string,
  recipes: ProductRecipe[],
  products: Product[]
): Decimal {
  const menuRecipes = recipes.filter((r) => r.menuProductId === menuProductId);
  if (!menuRecipes.length) {
    const product = products.find((p) => p.id === menuProductId);
    return new Decimal(product?.costPriceAvg || '0');
  }
  return menuRecipes.reduce((sum, r) => {
    const ing = products.find((p) => p.id === r.ingredientProductId);
    const ingCost = new Decimal(ing?.costPriceAvg || '0');
    return sum.plus(ingCost.times(new Decimal(r.quantityRequired)));
  }, new Decimal(0));
}

export function processOrderCheckout(input: CheckoutInput): CheckoutResult {
  if (!input.cart.length) {
    throw new Error('Keranjang belanja tidak boleh kosong.');
  }

  const nowIso = new Date().toISOString();
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const orderNumber = `INV-${nowIso.slice(0, 10).replace(/-/g, '')}-${String(
    Math.floor(1000 + Math.random() * 9000)
  )}`;

  const productMap = new Map<string, Product>(input.products.map((p) => [p.id, { ...p }]));
  const orderItems: OrderItem[] = [];
  const newMovements: InventoryMovement[] = [];
  const taxItemsInput: Array<{
    lineSubtotal: string;
    isLuxuryGoods: boolean;
    isTaxExempt: boolean;
  }> = [];

  let subtotal = new Decimal(0);
  let totalCogs = new Decimal(0);

  for (const cartLine of input.cart) {
    const prod = productMap.get(cartLine.productId);
    if (!prod) {
      throw new Error(`Produk dengan ID ${cartLine.productId} tidak ditemukan.`);
    }
    const qtyDec = new Decimal(cartLine.qty);
    if (qtyDec.lte(0)) {
      throw new Error(`Kuantitas untuk ${prod.name} harus lebih dari 0.`);
    }

    const unitPrice = new Decimal(prod.sellingPrice);
    const lineSub = unitPrice.times(qtyDec);
    subtotal = subtotal.plus(lineSub);

    let unitCogs = new Decimal(prod.costPriceAvg || '0');

    // Perpetual COGS & Stock Deduction
    if (prod.itemType === 'MENU_ITEM') {
      const menuRecipes = input.recipes.filter((r) => r.menuProductId === prod.id);
      if (menuRecipes.length > 0) {
        unitCogs = computeMenuItemRecipeCogs(prod.id, input.recipes, input.products);
        for (const rec of menuRecipes) {
          const ing = productMap.get(rec.ingredientProductId);
          if (ing) {
            const qtyUsed = new Decimal(rec.quantityRequired).times(qtyDec);
            const nextStock = Decimal.max(new Decimal(0), new Decimal(ing.stockQty).minus(qtyUsed));
            ing.stockQty = nextStock.toFixed(4);
            newMovements.push({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tenantId: input.tenant.id,
              productId: ing.id,
              movementType: 'OUT_RECIPE',
              qtyChange: qtyUsed.negated().toFixed(4),
              unitCost: ing.costPriceAvg,
              referenceId: orderId,
              createdAt: nowIso,
            });
          }
        }
      }
    } else if (prod.itemType === 'RETAIL_GOODS') {
      const nextStock = Decimal.max(new Decimal(0), new Decimal(prod.stockQty).minus(qtyDec));
      prod.stockQty = nextStock.toFixed(4);
      newMovements.push({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: input.tenant.id,
        productId: prod.id,
        movementType: 'OUT_SALE',
        qtyChange: qtyDec.negated().toFixed(4),
        unitCost: prod.costPriceAvg,
        referenceId: orderId,
        createdAt: nowIso,
      });
    } else {
      // SERVICE_FREELANCE: no inventory deduction, zero inventory COGS
      unitCogs = new Decimal(0);
    }

    totalCogs = totalCogs.plus(unitCogs.times(qtyDec));

    orderItems.push({
      id: `oi-${orderId}-${orderItems.length + 1}`,
      orderId,
      productId: prod.id,
      itemNameSnapshot: prod.name,
      qty: qtyDec.toFixed(4),
      unitPrice: unitPrice.toFixed(4),
      unitCogs: unitCogs.toFixed(4),
      notes: cartLine.notes,
    });

    taxItemsInput.push({
      lineSubtotal: lineSub.toFixed(4),
      isLuxuryGoods: prod.isLuxuryGoods,
      isTaxExempt: prod.isTaxExempt,
    });
  }

  const discountDec = Decimal.min(subtotal, new Decimal(input.discountAmount || '0'));
  const serviceRate = new Decimal(input.tenant.serviceChargeRate || '0');
  const serviceCharge = subtotal
    .minus(discountDec)
    .times(serviceRate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  const taxResult = calculateOrderTax({
    vertical: input.tenant.vertical,
    isPkp: input.tenant.isPkp,
    items: taxItemsInput,
    discountAmount: discountDec.toFixed(4),
    serviceCharge: serviceCharge.toFixed(4),
    regionalTax: input.tenant.settings.regionalTax,
    regionalTaxRegistry: input.regionalTaxRegistry,
  });

  const taxAmount = new Decimal(taxResult.taxAmount);
  const grandTotal = subtotal.minus(discountDec).plus(serviceCharge).plus(taxAmount);

  const markPaid = input.markPaidImmediately ?? true;
  const mdrCalc = calculateChannelMdr({
    paymentMethod: input.paymentMethod,
    grossAmount: grandTotal.toFixed(4),
    tenantQrisMdrRate: input.tenant.settings.qrisMdrRate,
  });
  const mdrFee = new Decimal(mdrCalc.mdrFee);

  const stylistCommissionRate = input.stylistCommissionRate
    ? new Decimal(input.stylistCommissionRate)
    : new Decimal(0);
  const stylistCommissionAmount =
    input.stylistName && stylistCommissionRate.gt(0)
      ? subtotal.minus(discountDec).times(stylistCommissionRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

  const payment: Payment | null = markPaid
    ? {
        id: `pay-${orderId}`,
        tenantId: input.tenant.id,
        orderId,
        paymentMethod: input.paymentMethod,
        amountPaid: grandTotal.toFixed(4),
        mdrFee: mdrFee.toFixed(4),
        gatewayRefId:
          input.gatewayRefId ??
          (input.paymentMethod !== 'CASH' ? `${input.paymentMethod}-${Date.now()}` : null),
        paidAt: nowIso,
      }
    : null;

  const order: Order = {
    id: orderId,
    tenantId: input.tenant.id,
    orderNumber,
    orderSource: input.orderSource,
    tableId: input.tableId ?? null,
    tableNumber: input.tableNumber,
    customerName: input.customerName.trim() || 'Pelanggan Umum',
    subtotal: subtotal.toFixed(4),
    discountAmount: discountDec.toFixed(4),
    serviceCharge: serviceCharge.toFixed(4),
    taxType: taxResult.taxType,
    dppNilaiLain: taxResult.dppNilaiLain,
    taxAmount: taxAmount.toFixed(4),
    grandTotal: grandTotal.toFixed(4),
    totalCogs: totalCogs.toFixed(4),
    paymentStatus: markPaid ? 'PAID' : 'PENDING_QRIS',
    kitchenStatus:
      input.tenant.vertical === 'RESTORAN' || input.tenant.vertical === 'KEDAI_MAKAN'
        ? 'PENDING'
        : 'SERVED',
    isReceiptPrinted: false,
    stylistName: input.stylistName,
    stylistCommissionRate: input.stylistName ? stylistCommissionRate.toFixed(4) : undefined,
    stylistCommissionAmount: input.stylistName ? stylistCommissionAmount.toFixed(4) : undefined,
    items: orderItems,
    payment: payment ?? undefined,
    customAttributes: input.customAttributes ?? {},
    createdAt: nowIso,
  };

  const newJournalEntries =
    markPaid && payment
      ? createSaleJournalEntries({
          tenantId: input.tenant.id,
          order,
          payment,
          accounts: input.accounts,
          entrySeq: input.journalSeqStart,
        })
      : [];

  return {
    order,
    payment,
    updatedProducts: Array.from(productMap.values()),
    newInventoryMovements: newMovements,
    newJournalEntries,
  };
}

/**
 * Generates plain ESC/POS byte sequence (UTF-8 commands) for 58mm / 80mm Bluetooth thermal printers
 * Honors the tenant's customized ReceiptDesignConfig settings.
 */
export function buildEscPosReceiptCommands(order: Order, tenant: Tenant): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const design = getEffectiveReceiptDesign(tenant);
  const lineWidth = tenant.settings.thermalPaperWidth === '58mm' ? 32 : 48;
  const sep = getEscPosDividerChar(design.dividerStyle).repeat(lineWidth) + '\n';

  const padRow = (left: string, right: string) => {
    const maxLeft = Math.max(4, lineWidth - right.length - 1);
    const trimmedLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    const spaces = Math.max(1, lineWidth - trimmedLeft.length - right.length);
    return `${trimmedLeft}${' '.repeat(spaces)}${right}\n`;
  };

  const lines: string[] = [`${tenant.name.toUpperCase()}\n`];
  if (design.headerTagline.trim()) {
    lines.push(`${design.headerTagline.trim()}\n`);
  }
  if (design.showAddress && tenant.address) {
    lines.push(`${tenant.address}\n`);
  }
  if (design.showNpwp && tenant.npwp16) {
    lines.push(`NPWP: ${tenant.npwp16}\n`);
  }
  lines.push(sep);
  lines.push(padRow(`No: ${order.orderNumber}`, order.createdAt.slice(11, 16)));
  if (design.showCustomerInfo) {
    lines.push(
      padRow(
        `Pelanggan: ${order.customerName}`,
        order.tableNumber ? `Meja ${order.tableNumber}` : 'Takeaway'
      )
    );
  }
  lines.push(sep);

  for (const item of order.items) {
    const qtyNum = Number(item.qty);
    const lineTot = new Decimal(item.qty).times(new Decimal(item.unitPrice));
    lines.push(`${item.itemNameSnapshot}\n`);
    lines.push(padRow(`  ${qtyNum} x ${formatRupiah(item.unitPrice)}`, formatRupiah(lineTot)));
    if (design.showItemNotes && item.notes) {
      lines.push(`  Catatan: ${item.notes}\n`);
    }
  }

  lines.push(sep);
  lines.push(padRow('Subtotal', formatRupiah(order.subtotal)));
  if (design.showDiscountLine && new Decimal(order.discountAmount).gt(0)) {
    lines.push(padRow('Diskon', `-${formatRupiah(order.discountAmount)}`));
  }
  if (design.showServiceChargeLine && new Decimal(order.serviceCharge).gt(0)) {
    lines.push(padRow('Service Charge', formatRupiah(order.serviceCharge)));
  }
  if (design.showTaxLine && new Decimal(order.taxAmount).gt(0)) {
    if (order.taxType === 'PPN_11_12') {
      if (design.showDppDetailLine) {
        lines.push(padRow('DPP Nilai Lain (11/12)', formatRupiah(order.dppNilaiLain)));
      }
      lines.push(padRow('PPN 12% x DPP', formatRupiah(order.taxAmount)));
    } else if (order.taxType === 'PB1_RESTO_10') {
      lines.push(padRow('PB1 Restoran (10%)', formatRupiah(order.taxAmount)));
    } else {
      lines.push(padRow('PPN 12%', formatRupiah(order.taxAmount)));
    }
  }
  lines.push(sep);
  lines.push(padRow('TOTAL BAYAR', formatRupiah(order.grandTotal)));
  if (order.payment) {
    lines.push(padRow(`Bayar (${order.payment.paymentMethod})`, formatRupiah(order.payment.amountPaid)));
  }
  lines.push(sep);
  if (design.showFeedbackQr && design.feedbackQrUrl.trim()) {
    lines.push(`${design.feedbackQrLabel || 'Nilai layanan kami:'}\n`);
    lines.push(`${design.feedbackQrUrl.trim()}\n`);
    lines.push(sep);
  }
  if (design.showFooter && tenant.receiptFooter) {
    lines.push(`${tenant.receiptFooter}\n`);
  }
  if (design.showPoweredBy) {
    lines.push(`KasirAkun UMKM\n`);
  }
  lines.push('\n\n');

  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(lines.join(''));
  const initCmd = new Uint8Array([ESC, 0x40]); // Initialize printer
  const cutCmd = new Uint8Array([GS, 0x56, 0x41, 0x03]); // Partial cut

  const output = new Uint8Array(initCmd.length + bodyBytes.length + cutCmd.length);
  output.set(initCmd, 0);
  output.set(bodyBytes, initCmd.length);
  output.set(cutCmd, initCmd.length + bodyBytes.length);
  return output;
}
