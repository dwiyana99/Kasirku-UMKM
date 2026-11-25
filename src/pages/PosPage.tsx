import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus,
  Minus,
  Trash2,
  Printer,
  Search,
  AlertTriangle,
  ScanBarcode,
  CheckCircle2,
  UtensilsCrossed,
  Clock,
  Split,
  ArrowRightLeft,
  Ban,
  PauseCircle,
  ShieldCheck,
  Loader2,
  Scissors,
  MessageCircle,
  Monitor,
  ExternalLink,
  RotateCcw,
  WifiOff,
  X,
  ClipboardCheck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { ThermalReceiptModal } from '../components/ThermalReceiptModal';
import { DailyClosingModal } from '../components/pos/DailyClosingModal';
import { DirectWaCustomerModal } from '../components/whatsapp/DirectWaCustomerModal';
import { FonnteSendModal } from '../components/whatsapp/FonnteSendModal';
import { OwnerWaReminderModal } from '../components/whatsapp/OwnerWaReminderModal';
import { ModalShell } from '../components/ui/ModalShell';
import {
  buildCustomerReceiptWaMessage,
  evaluateWhatsappSendingPolicy,
} from '../lib/messaging/whatsapp-policy';
import { canAccessRouteWithStaffPermissions } from '../lib/rbac/staff-rbac';
import { useApp } from '../context/AppContext';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import { calculateOrderTax } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  calculatePromotionDiscount,
  resolveEffectiveUnitPrice,
} from '../lib/pos/advanced-pos-engine';
import {
  computeLivePosStock,
  filterPosProducts,
  isSearchFirstPosVertical,
} from '../lib/pos/pos-stock-utils';
import {
  PAYMENT_CHANNELS,
  getPaymentChannelMeta,
  type AutoPaymentSession,
} from '../lib/pos/payment-verifier';
import type {
  Order,
  OrderMode,
  PaymentCategory,
  PaymentMethod,
  PaymentTransaction,
  Product,
} from '../types/domain';

const BARBERSHOP_STYLISTS = [
  { id: 'stylist-raka', name: 'Raka (Senior Barber)', commissionRate: '0.3000', label: 'Raka · Senior Barber (Komisi 30%)' },
  { id: 'stylist-dina', name: 'Dina (Hair Stylist)', commissionRate: '0.2500', label: 'Dina · Hair Stylist (Komisi 25%)' },
  { id: 'stylist-bima', name: 'Bima (Junior Barber)', commissionRate: '0.2000', label: 'Bima · Junior Barber (Komisi 20%)' },
  { id: 'stylist-none', name: '', commissionRate: '0', label: 'Tanpa Kapster (Penjualan Produk Retail)' },
];

interface LocalCartItem {
  product: Product;
  qty: number;
  notes: string;
}

export function PosPage() {
  const {
    activeWorkspace,
    activeBranchId,
    session,
    navigate,
    completePosCheckout,
    autoPrintQueue,
    dismissAutoPrint,
    markReceiptPrinted,
    hasAddOn,
    openCashierShift,
    closeActiveCashierShift,
    holdOpenBill,
    settleOpenBill,
    splitOpenBill,
    moveOrMergeTable,
    voidOrderWithAudit,
    addCrmCustomer,
    regionalTaxRegistry,
  } = useApp();

  const { tenant, products, categories, tables, customFields, recipes: productRecipes } =
    activeWorkspace;
  const priceTiers = activeWorkspace.priceTiers ?? [];
  const activePromos = (activeWorkspace.promotions ?? []).filter((p) => p.isActive);
  const crmCustomers = activeWorkspace.crmCustomers ?? [];
  const shifts = activeWorkspace.cashierShifts ?? [];
  const openShift = shifts.find((s) => s.status === 'OPEN') ?? null;
  const openBills = activeWorkspace.orders.filter(
    (o) => o.isOpenBill && o.paymentStatus === 'UNPAID'
  );
  const isOnline = useOnlineStatus();
  const canUseRestoAdvanced = hasAddOn('ADDON_RESTO_QR_KDS');
  const canUseNonCash = hasAddOn('ADDON_NON_CASH_PAYMENT');
  const canUseThermalPrint = hasAddOn('ADDON_THERMAL_RECEIPT');
  const hasPromoCrmPro = hasAddOn('ADDON_PROMO_CRM');
  const isSingleOwnerLite = tenant.subscriptionPlan === 'LITE';
  const displayBranchId =
    activeBranchId && activeBranchId !== 'ALL'
      ? activeBranchId
      : activeWorkspace.branches?.[0]?.id || tenant.id;
  const isWarung = tenant.vertical === 'WARUNG_SEMBAKO';
  const isRetail =
    tenant.vertical === 'TOKO_RETAIL' ||
    tenant.vertical === 'TOKO_FASHION' ||
    tenant.vertical === 'TOKO_BANGUNAN' ||
    tenant.vertical === 'PET_SHOP';
  const isBarbershop =
    tenant.vertical === 'BARBERSHOP_SALON' ||
    tenant.vertical === 'BARBERSHOP' ||
    tenant.vertical === 'SALON_KECANTIKAN' ||
    tenant.vertical === 'SPA_WELLNESS';
  const isFnb =
    tenant.vertical === 'RESTORAN' ||
    tenant.vertical === 'KEDAI_MAKAN' ||
    tenant.vertical === 'BAKERY_CATERING';
  const isSearchFirst = isSearchFirstPosVertical(tenant.vertical);
  const showShiftToolbar = !isSingleOwnerLite || Boolean(openShift) || (isFnb && canUseRestoAdvanced);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<LocalCartItem[]>([]);
  const [draftQtys, setDraftQtys] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [selectedCrmId, setSelectedCrmId] = useState('');
  const [quickMemberOpen, setQuickMemberOpen] = useState(false);
  const [quickMemberName, setQuickMemberName] = useState('');
  const [quickMemberPhone, setQuickMemberPhone] = useState('');
  const [quickMemberNotes, setQuickMemberNotes] = useState('');
  const [quickMemberSavedMsg, setQuickMemberSavedMsg] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState<OrderMode>('DINE_IN');
  const [selectedPromoId, setSelectedPromoId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id ?? '');
  const [selectedStylistId, setSelectedStylistId] = useState<string>(BARBERSHOP_STYLISTS[0].id);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  // Warung Sembako and Paket LITE default to NO-PRINT receipt
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(
    tenant.vertical !== 'WARUNG_SEMBAKO' && canUseThermalPrint
  );
  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [tenant.settings?.businessWhatsappNumber, hasAddOn]
  );
  const canOpenSettings = canAccessRouteWithStaffPermissions('/settings/custom-fields', session);
  const [lastCompletedOrder, setLastCompletedOrder] = useState<Order | null>(null);
  const [fonnteOrder, setFonnteOrder] = useState<Order | null>(null);
  const [directWaOrder, setDirectWaOrder] = useState<Order | null>(null);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [waReminderModalOpen, setWaReminderModalOpen] = useState(false);
  const [orderCustomAttrs, setOrderCustomAttrs] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanToast, setScanToast] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  // Zero-token Non-Cash Automatic Verification & Multi-Provider Gateway Session State
  const [paymentSession, setPaymentSession] = useState<AutoPaymentSession | null>(null);
  const [gatewayTxn, setGatewayTxn] = useState<PaymentTransaction | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSessionLoading, setPaymentSessionLoading] = useState(false);
  const [paymentVerifying, setPaymentVerifying] = useState(false);
  const [paymentVerifyError, setPaymentVerifyError] = useState<string | null>(null);
  // Shift & Open Bill Modals
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('500000');
  const [closingCashInput, setClosingCashInput] = useState('');
  const [openBillsModalOpen, setOpenBillsModalOpen] = useState(false);
  const [moveBillOrder, setMoveBillOrder] = useState<Order | null>(null);
  const [moveTargetTableId, setMoveTargetTableId] = useState('');
  const [voidTargetOrder, setVoidTargetOrder] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Enforce LITE / offline cash-only capability dynamically
  useEffect(() => {
    if ((!canUseNonCash || !isOnline) && paymentMethod !== 'CASH') {
      setPaymentMethod('CASH');
    }
  }, [canUseNonCash, isOnline, paymentMethod]);

  useEffect(() => {
    if (!canUseThermalPrint && autoPrintReceipt) {
      setAutoPrintReceipt(false);
    }
  }, [canUseThermalPrint, autoPrintReceipt]);

  // Reset local POS state cleanly when switching tenant
  useEffect(() => {
    setCart([]);
    setDraftQtys({});
    setSelectedCategoryId('ALL');
    setSearchQuery('');
    setSelectedTableId(tables[0]?.id ?? '');
    setDiscountAmount('0');
    setOrderCustomAttrs({});
    setAutoPrintReceipt(tenant.vertical !== 'WARUNG_SEMBAKO');
    setLastCompletedOrder(null);
    setPaymentSession(null);
    setPaymentModalOpen(false);
  }, [tenant.id, tenant.vertical, tables]);

  const sellableProducts = useMemo(
    () => products.filter((p) => p.itemType !== 'RAW_MATERIAL' && p.isAvailable),
    [products]
  );

  const filteredProducts = useMemo(
    () =>
      filterPosProducts({
        vertical: tenant.vertical,
        sellableProducts,
        searchQuery,
        selectedCategoryId,
      }),
    [tenant.vertical, sellableProducts, searchQuery, selectedCategoryId]
  );

  // Quick-Tap Top 8 bestsellers for Search-First POS (Warung/Retail without USB scanner)
  const quickTapProducts = useMemo(() => {
    const freq = new Map<string, number>();
    for (const ord of activeWorkspace.orders) {
      if (ord.paymentStatus === 'VOID') continue;
      for (const line of ord.items) {
        freq.set(line.productId, (freq.get(line.productId) ?? 0) + Number(line.qty || 1));
      }
    }
    return [...sellableProducts]
      .sort((a, b) => {
        const diff = (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [activeWorkspace.orders, sellableProducts]);

  const cartEntries = useMemo(
    () => cart.map((c) => ({ productId: c.product.id, qty: c.qty })),
    [cart]
  );

  const getDraftQty = (productId: string) => draftQtys[productId] ?? 1;

  const setDraftQty = (productId: string, nextVal: number) => {
    const clean = Number.isFinite(nextVal) ? Math.max(1, Math.floor(nextVal)) : 1;
    setDraftQtys((prev) => ({ ...prev, [productId]: clean }));
  };

  const addToCart = (product: Product, qtyToAdd = 1) => {
    const safeQty = Math.max(1, Math.floor(qtyToAdd));
    const live = computeLivePosStock({
      product,
      allProducts: products,
      productRecipes,
      cart: cartEntries,
      draftQty: safeQty,
    });

    if (live.tracksStock && live.exceedsStock) {
      setScanToast(
        `Stok "${product.name}" tidak mencukupi (tersisa ${live.availableAfterCart.toFixed(0)} ${live.unitLabel}).`
      );
      window.setTimeout(() => setScanToast(null), 3500);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + safeQty } : item
        );
      }
      return [...prev, { product, qty: safeQty, notes: '' }];
    });

    // Reset draft qty back to 1 after adding to cart
    setDraftQtys((prev) => ({ ...prev, [product.id]: 1 }));
  };

  const handleBarcodeMatch = (code: string) => {
    const clean = code.trim();
    const matched = sellableProducts.find(
      (p) =>
        p.barcodeQr.toLowerCase() === clean.toLowerCase() ||
        p.sku.toLowerCase() === clean.toLowerCase()
    );
    if (matched) {
      // Reveal the scanned product in the search-first table so cashier sees live remaining stock & can adjust qty
      setSearchQuery(matched.barcodeQr || matched.sku);
      addToCart(matched, 1);
      setScanToast(`Scan berhasil: +1 ${matched.name} (${clean})`);
      setScannerOpen(false);
    } else {
      setScanToast(`Barcode "${clean}" tidak ditemukan pada katalog ${tenant.name}.`);
    }
    window.setTimeout(() => setScanToast(null), 3500);
  };

  // USB / Bluetooth HID Keyboard Barcode Scanner Listener for Warung Sembako
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  useEffect(() => {
    if (!isSearchFirst) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastKeyTimeRef.current > 120) {
        barcodeBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;
      if (e.key === 'Enter' && barcodeBufferRef.current.length >= 4) {
        handleBarcodeMatch(barcodeBufferRef.current);
        barcodeBufferRef.current = '';
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const updateQty = (productId: string, delta: number) => {
    if (delta > 0) {
      const target = products.find((p) => p.id === productId);
      if (target) {
        const live = computeLivePosStock({
          product: target,
          allProducts: products,
          productRecipes,
          cart: cartEntries,
          draftQty: delta,
        });
        if (live.tracksStock && live.exceedsStock) {
          setScanToast(
            `Stok "${target.name}" tidak mencukupi untuk ditambah lagi (sisa ${live.availableAfterCart.toFixed(0)} ${live.unitLabel}).`
          );
          window.setTimeout(() => setScanToast(null), 3500);
          return;
        }
      }
    }
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId ? { ...item, qty: item.qty + delta } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const updateNotes = (productId: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, notes } : item))
    );
  };

  // Real-time Decimal.js cart calculation with Wholesale PriceTier & Promotion resolution
  const pricedCart = useMemo(
    () =>
      cart.map((item) => {
        const resolved = resolveEffectiveUnitPrice({
          product: item.product,
          qty: String(item.qty),
          priceTiers,
        });
        return {
          ...item,
          effectiveUnitPrice: resolved.unitPrice,
          appliedTierLabel: resolved.appliedTierLabel,
        };
      }),
    [cart, priceTiers]
  );

  const selectedPromo = useMemo(
    () => activePromos.find((p) => p.id === selectedPromoId) ?? null,
    [activePromos, selectedPromoId]
  );

  const totals = useMemo(() => {
    const subtotal = pricedCart.reduce(
      (sum, item) => sum.plus(new Decimal(item.effectiveUnitPrice).times(item.qty)),
      new Decimal(0)
    );
    const promoDisc = new Decimal(
      calculatePromotionDiscount({
        promo: selectedPromo,
        subtotal: subtotal.toFixed(4),
        items: pricedCart.map((c) => ({
          qty: String(c.qty),
          unitPrice: c.effectiveUnitPrice,
        })),
      })
    );
    const manualDisc = /^\d+(\.\d+)?$/.test(discountAmount.trim())
      ? new Decimal(discountAmount.trim())
      : new Decimal(0);
    const discount = Decimal.min(subtotal, promoDisc.plus(manualDisc));
    const serviceCharge = subtotal
      .minus(discount)
      .times(new Decimal(tenant.serviceChargeRate || '0'))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    const tax = calculateOrderTax({
      vertical: tenant.vertical,
      isPkp: tenant.isPkp,
      items: pricedCart.map((c) => ({
        lineSubtotal: new Decimal(c.effectiveUnitPrice).times(c.qty).toFixed(4),
        isLuxuryGoods: c.product.isLuxuryGoods,
        isTaxExempt: c.product.isTaxExempt,
      })),
      discountAmount: discount.toFixed(4),
      serviceCharge: serviceCharge.toFixed(4),
      regionalTax: tenant.settings.regionalTax,
      regionalTaxRegistry,
    });

    const grandTotal = subtotal.minus(discount).plus(serviceCharge).plus(new Decimal(tax.taxAmount));
    return {
      subtotal,
      promoDisc,
      discount,
      serviceCharge,
      tax,
      grandTotal,
    };
  }, [pricedCart, selectedPromo, discountAmount, tenant, regionalTaxRegistry]);

  const orderCustomFields = customFields.filter((f) => f.targetEntity === 'orders');

  const resetPosForNewTransaction = (opts?: { keepCompletedBanner?: Order | null }) => {
    setCart([]);
    setDraftQtys({});
    setSearchQuery('');
    setSelectedCategoryId('ALL');
    setCustomerName('');
    setSelectedCrmId('');
    setSelectedPromoId('');
    setDiscountAmount('0');
    setOrderCustomAttrs({});
    setOrderMode('DINE_IN');
    setPaymentMethod('CASH');
    setPaymentModalOpen(false);
    setPaymentSession(null);
    setGatewayTxn(null);
    setPaymentVerifyError(null);
    if (opts && 'keepCompletedBanner' in opts) {
      setLastCompletedOrder(opts.keepCompletedBanner ?? null);
    } else {
      setLastCompletedOrder(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const playCashierChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      [587.33, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        g.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.28);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch {
      // Ignore audio autoplay block
    }
  };

  const finalizeOrderCheckout = (gatewayRefId?: string) => {
    if (!cart.length) return;
    const chosenTable = tables.find((t) => t.id === selectedTableId);
    const chosenStylist = isBarbershop
      ? BARBERSHOP_STYLISTS.find((s) => s.id === selectedStylistId)
      : undefined;
    const created = completePosCheckout({
      cart: pricedCart.map((c) => ({
        productId: c.product.id,
        qty: c.qty,
        notes: c.notes.trim() || undefined,
      })),
      paymentMethod,
      gatewayRefId,
      stylistName: chosenStylist?.name || undefined,
      stylistCommissionRate:
        chosenStylist && chosenStylist.name ? chosenStylist.commissionRate : undefined,
      customerName:
        customerName.trim() || (chosenTable ? `Meja ${chosenTable.tableNumber}` : 'Pelanggan Umum'),
      tableId: isFnb && orderMode === 'DINE_IN' ? chosenTable?.id ?? null : null,
      tableNumber: isFnb && orderMode === 'DINE_IN' ? chosenTable?.tableNumber : undefined,
      discountAmount: totals.discount.toFixed(4),
      customAttributes: {
        ...orderCustomAttrs,
        orderMode,
        ...(selectedPromo ? { promoCode: selectedPromo.code } : {}),
        ...(chosenStylist?.name ? { stylistName: chosenStylist.name } : {}),
      },
    });

    playCashierChime();

    // Reset ALL POS fields so cashier immediately returns to a fresh initial transaction screen
    const shouldPrint = canUseThermalPrint && autoPrintReceipt;
    resetPosForNewTransaction({ keepCompletedBanner: shouldPrint ? null : created });
    if (shouldPrint) {
      setReceiptOrder(created);
    } else {
      setReceiptOrder(null);
      setScanToast(null);
    }

    // Return Customer Facing Display to IDLE after 6 seconds so customer sees PAID animation first
    if (gatewayRefId) {
      window.setTimeout(() => {
        void fetch(`/api/payments/customer-display/${encodeURIComponent(displayBranchId)}/reset`, {
          method: 'POST',
        }).catch(() => {});
      }, 6000);
    }
  };

  const mapMethodToGatewayCategory = (
    method: PaymentMethod
  ): { paymentCategory: PaymentCategory; channelCode: string } => {
    switch (method) {
      case 'QRIS_DYNAMIC':
        return { paymentCategory: 'QRIS_DYNAMIC', channelCode: 'QRIS' };
      case 'EWALLET_GOPAY':
        return { paymentCategory: 'EWALLET_DIRECT', channelCode: 'GOPAY' };
      case 'EWALLET_DANA':
        return { paymentCategory: 'EWALLET_DIRECT', channelCode: 'DANA' };
      case 'EWALLET_OVO':
        return { paymentCategory: 'EWALLET_DIRECT', channelCode: 'OVO' };
      case 'EWALLET_SHOPEEPAY':
        return { paymentCategory: 'EWALLET_DIRECT', channelCode: 'SHOPEEPAY' };
      case 'VIRTUAL_ACCOUNT':
        return { paymentCategory: 'VIRTUAL_ACCOUNT', channelCode: 'VA_BCA' };
      case 'BANK_TRANSFER':
        return { paymentCategory: 'MANUAL_TRANSFER', channelCode: 'MANUAL_BANK' };
      default:
        return { paymentCategory: 'QRIS_DYNAMIC', channelCode: 'QRIS' };
    }
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    if (paymentMethod === 'CASH' || !canUseNonCash) {
      finalizeOrderCheckout();
      return;
    }
    // Mode 1: Counter Screen + Live Customer Facing Display sync via /api/payments/create
    setPaymentVerifyError(null);
    setPaymentSessionLoading(true);
    setPaymentModalOpen(true);
    setGatewayTxn(null);
    try {
      const mapped = mapMethodToGatewayCategory(paymentMethod);
      const orderNumDraft = `POS-${Date.now().toString(36).toUpperCase()}`;

      // Parallel: create real gateway transaction (syncs /customer-display/:branchId) + legacy auto-session fallback
      const [gwRes, legacyRes] = await Promise.all([
        fetch('/api/payments/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: JSON.stringify({
            tenantId: tenant.id,
            branchId: displayBranchId,
            branchName:
              activeWorkspace.branches?.find((b) => b.id === displayBranchId)?.name || 'Kasir Utama',
            orderNumber: orderNumDraft,
            customerName: customerName.trim() || 'Pelanggan Umum',
            checkoutMode: 'COUNTER_SCREEN',
            paymentCategory: mapped.paymentCategory,
            channelCode: mapped.channelCode,
            baseAmount: totals.grandTotal.toFixed(4),
            itemsSummary: pricedCart.map((c) => ({
              name: c.product.name,
              qty: c.qty,
              subtotal: new Decimal(c.effectiveUnitPrice).times(c.qty).toFixed(4),
            })),
          }),
        }),
        fetch('/api/payments/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod,
            amount: totals.grandTotal.toFixed(4),
            referenceLabel: tenant.name,
          }),
        }),
      ]);

      if (gwRes.ok) {
        const gwJson = (await gwRes.json()) as { transaction?: PaymentTransaction };
        if (gwJson.transaction) {
          setGatewayTxn(gwJson.transaction);
        }
      }
      const data = await legacyRes.json();
      if (!legacyRes.ok || !data.session) {
        if (!gwRes.ok) {
          setPaymentVerifyError(data.error || 'Gagal membuat sesi pembayaran non-tunai.');
          return;
        }
      } else {
        setPaymentSession(data.session as AutoPaymentSession);
      }
    } catch {
      setPaymentVerifyError('Tidak dapat terhubung ke layanan verifikasi pembayaran.');
    } finally {
      setPaymentSessionLoading(false);
    }
  };

  const handleAutoVerifyNonCash = async () => {
    setPaymentVerifyError(null);
    setPaymentVerifying(true);
    try {
      // Trigger real Universal Webhook simulator if gatewayTxn exists (flips Customer Display -> PAID & posts ledger)
      if (gatewayTxn) {
        const simRes = await fetch(
          `/api/payments/${encodeURIComponent(gatewayTxn.id)}/${
            gatewayTxn.paymentCategory === 'MANUAL_TRANSFER' ? 'check-status' : 'simulate-pay'
          }`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
            },
            body: JSON.stringify(
              gatewayTxn.paymentCategory === 'MANUAL_TRANSFER'
                ? { action: 'APPROVE_MANUAL' }
                : {}
            ),
          }
        );
        const simJson = (await simRes.json()) as { verified?: boolean; error?: string };
        if (!simRes.ok || !simJson.verified) {
          setPaymentVerifyError(simJson.error || 'Verifikasi webhook pembayaran gagal.');
          return;
        }
        finalizeOrderCheckout(gatewayTxn.gatewayRefId || gatewayTxn.id);
        return;
      }

      if (!paymentSession) return;
      const res = await fetch('/api/payments/verify-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: paymentSession.sessionId,
          paymentMethod: paymentSession.paymentMethod,
          amount: paymentSession.payableAmount,
          gatewayRefId: paymentSession.gatewayRefId,
          signature: paymentSession.signature,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setPaymentVerifyError(data.error || 'Verifikasi pembayaran otomatis gagal.');
        return;
      }
      finalizeOrderCheckout(data.gatewayRefId || paymentSession.gatewayRefId);
    } catch {
      setPaymentVerifyError('Gagal memverifikasi status pembayaran dari gateway.');
    } finally {
      setPaymentVerifying(false);
    }
  };

  const buildWhatsappReceiptText = (ord: Order) => {
    const channelMeta = getPaymentChannelMeta(ord.payment?.paymentMethod ?? 'CASH');
    const lines = [
      `*${tenant.name}*`,
      `No. Transaksi: ${ord.orderNumber}`,
      `Pelanggan: ${ord.customerName}`,
      `Metode: ${channelMeta.label}`,
      ...(ord.stylistName ? [`Kapster/Stylist: ${ord.stylistName}`] : []),
      '---',
      ...ord.items.map((it) => {
        const lineTotal = new Decimal(it.unitPrice).times(it.qty).toFixed(4);
        return `${it.qty}x ${it.itemNameSnapshot} = ${formatRupiah(lineTotal)}`;
      }),
      '---',
      `*Total Bayar: ${formatRupiah(ord.grandTotal)}*`,
      tenant.receiptFooter || 'Terima kasih!',
    ];
    return lines.join('\n');
  };

  const handleHoldOpenBill = () => {
    if (!cart.length) return;
    const chosenTable = tables.find((t) => t.id === selectedTableId);
    const crm = crmCustomers.find((c) => c.id === selectedCrmId);
    const held = holdOpenBill({
      cart: pricedCart.map((c) => ({
        productId: c.product.id,
        qty: c.qty,
        notes: c.notes.trim() || undefined,
      })),
      customerName:
        customerName.trim() || (chosenTable ? `Meja ${chosenTable.tableNumber}` : 'Open Bill'),
      customerPhoneWa: crm?.phoneWa,
      tableId: isFnb && orderMode === 'DINE_IN' ? chosenTable?.id ?? null : null,
      tableNumber: isFnb && orderMode === 'DINE_IN' ? chosenTable?.tableNumber : undefined,
      orderMode,
      discountAmount: totals.discount.toFixed(4),
    });
    setCart([]);
    setCustomerName('');
    setSelectedPromoId('');
    setDiscountAmount('0');
    setScanToast(`Open Bill ${held.orderNumber} berhasil ditahan. Buka daftar Open Bill untuk bayar / split.`);
    window.setTimeout(() => setScanToast(null), 4000);
  };

  const tenantAutoPrints = autoPrintQueue.filter((ap) => ap.order.tenantId === tenant.id);

  return (
    <AppShell
      title="Kasir POS"
      subtitle={
        isWarung
          ? 'Mode Warung Sembako · Ketuk cepat barang terlaris, scan barcode, atau cari nama barang'
          : isRetail
          ? 'Mode Toko Retail · Barcode SKU, harga grosir reseller & pilih cepat barang'
          : isBarbershop
          ? 'Mode Barbershop & Salon · Pilih layanan, kapster/komisi & produk'
          : isFnb
          ? 'Mode F&B Visual · Resep otomatis & cetak struk dapur'
          : 'Mode Invoice Jasa Profesional'
      }
      primaryAction={
        <button
          type="button"
          data-testid="pos-daily-closing-btn"
          onClick={() => setClosingModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <ClipboardCheck className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          <span>Tutup Kasir</span>
        </button>
      }
    >
      <div className="space-y-4">
        {/* Offline Mode Notice in POS */}
        {!isOnline && (
          <div
            data-testid="pos-offline-cash-notice"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs text-amber-950"
          >
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" strokeWidth={1.75} />
            <span>
              <strong>Internet sedang terputus.</strong> Transaksi Tunai tetap berjalan normal dan otomatis tersinkron saat sinyal kembali.
            </span>
          </div>
        )}

        {/* Cashier Shift Status Bar + Open Bills Trigger (Hidden on single-owner LITE unless shift is active) */}
        {showShiftToolbar && (
          <div
            data-testid="pos-shift-toolbar"
            className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                <Clock className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                {openShift ? (
                  <span>
                    Shift Aktif ({openShift.cashierName}) · Kas Ekspektasi:{' '}
                    <span className="font-mono tabular-nums text-emerald-700">
                      {formatRupiah(openShift.expectedCash)}
                    </span>
                  </span>
                ) : (
                  <span className="text-stone-600">Shift kasir belum dibuka (opsional untuk rekap per shift)</span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isFnb && canUseRestoAdvanced && (
                <button
                  type="button"
                  data-testid="pos-open-bills-btn"
                  onClick={() => setOpenBillsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg whitespace-nowrap"
                >
                  <PauseCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Open Bill &amp; Split ({openBills.length})</span>
                </button>
              )}
              <button
                type="button"
                data-testid="pos-shift-action-btn"
                onClick={() => {
                  if (openShift) {
                    setClosingCashInput(
                      new Decimal(openShift.expectedCash).toDecimalPlaces(0).toString()
                    );
                  }
                  setShiftModalOpen(true);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
                  openShift
                    ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                    : 'text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200'
                }`}
              >
                {openShift ? 'Tutup Shift & Rekonsiliasi Kas' : 'Buka Shift Kasir'}
              </button>
            </div>
          </div>
        )}

        {/* Auto-Print Trigger Banner for Paid QR Self-Orders */}
        {tenantAutoPrints.map((ap) => (
          <div
            key={ap.id}
            className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Pesanan QR Meja {ap.order.tableNumber} Lunas via QRIS ({ap.order.orderNumber})
                </p>
                <p className="text-xs text-emerald-800">
                  Catatan penjualan &amp; tiket dapur sudah tercatat otomatis. Siap cetak struk kasir.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setReceiptOrder(ap.order);
                  dismissAutoPrint(ap.id);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Struk Auto-Print</span>
              </button>
              <button
                type="button"
                onClick={() => dismissAutoPrint(ap.id)}
                className="px-2.5 py-2 text-xs text-emerald-800 hover:bg-emerald-100 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        ))}

        {lastCompletedOrder && (
          <div
            data-testid="pos-completed-no-print-banner"
            className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Transaksi {lastCompletedOrder.orderNumber} Selesai Tanpa Cetak Struk (
                  {formatRupiah(lastCompletedOrder.grandTotal)})
                </p>
                <p className="text-xs text-emerald-800">
                  Catatan penjualan &amp; stok telah diperbarui via{' '}
                  <strong>
                    {getPaymentChannelMeta(lastCompletedOrder.payment?.paymentMethod ?? 'CASH').label}
                  </strong>
                  {lastCompletedOrder.payment?.gatewayRefId
                    ? ` · Ref: ${lastCompletedOrder.payment.gatewayRefId}`
                    : ''}
                  .
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {waPolicy.canSendCustomerMessage && (
                <button
                  type="button"
                  data-testid="pos-banner-send-wa-btn"
                  onClick={() => {
                    if (waPolicy.channel === 'FONNTE') {
                      setFonnteOrder(lastCompletedOrder);
                    } else {
                      setDirectWaOrder(lastCompletedOrder);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>
                    {waPolicy.channel === 'FONNTE' ? 'Kirim WA (Fonnte)' : 'Kirim WA ke Pelanggan'}
                  </span>
                </button>
              )}
              {!waPolicy.canSendCustomerMessage && canOpenSettings && (
                <button
                  type="button"
                  data-testid="pos-banner-setup-wa-btn"
                  onClick={() => setWaReminderModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Atur WA untuk Kirim Nota</span>
                </button>
              )}
              {canUseThermalPrint && (
                <button
                  type="button"
                  onClick={() => setReceiptOrder(lastCompletedOrder)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Struk</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setLastCompletedOrder(null)}
                aria-label="Tutup notifikasi selesai"
                className="p-1.5 text-emerald-800 hover:bg-emerald-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {scanToast && (
          <div className="bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-emerald-400" />
            <span>{scanToast}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: Product / Menu Catalog */}
          <div className="lg:col-span-8 space-y-4">
            {/* Search & Barcode Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <label htmlFor="pos-search" className="sr-only">
                    Cari produk atau scan barcode
                  </label>
                  <input
                    id="pos-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        const exact = sellableProducts.find(
                          (p) =>
                            p.barcodeQr.toLowerCase() === searchQuery.trim().toLowerCase() ||
                            p.sku.toLowerCase() === searchQuery.trim().toLowerCase()
                        );
                        if (exact) {
                          addToCart(exact, getDraftQty(exact.id));
                        }
                      }
                    }}
                    placeholder={
                      isSearchFirst
                        ? 'Scan barcode (USB/Kamera) atau ketik nama barang / SKU untuk menampilkan...'
                        : 'Cari menu atau layanan...'
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  />
                </div>
                {isSearchFirst && (
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    <span>Kamera Barcode</span>
                  </button>
                )}
              </div>

              {/* Category filter only for non-search-first verticals (Restoran / Freelance) */}
              {!isSearchFirst && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId('ALL')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      selectedCategoryId === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({sellableProducts.length})
                  </button>
                  {categories
                    .filter((c) => !c.name.toLowerCase().includes('bahan baku'))
                    .map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          selectedCategoryId === cat.id
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Catalog View: Search-First Table for Warung & Kedai vs Visual Grid for Restoran/Freelance */}
            {isSearchFirst ? (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {!searchQuery.trim() ? (
                  <div
                    data-testid="pos-quick-tap-catalog"
                    className="p-4 sm:p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
                      <div>
                        <p className="text-sm font-semibold text-stone-900">
                          Barang Cepat / Paling Sering Dibeli
                        </p>
                        <p className="text-xs text-stone-500">
                          Ketuk langsung untuk masuk keranjang, atau ketik nama / pindai barcode di atas untuk cari seluruh katalog ({sellableProducts.length} barang).
                        </p>
                      </div>
                    </div>

                    {quickTapProducts.length === 0 ? (
                      <div className="py-10 text-center space-y-2">
                        <p className="text-sm font-semibold text-stone-800">
                          Belum ada barang siap jual di katalog
                        </p>
                        <p className="text-xs text-stone-500">
                          Tambahkan barang pertama Anda di menu Katalog Barang agar bisa langsung dijual di kasir.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate('/catalog/products')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                        >
                          Tambah Barang Pertama
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        {quickTapProducts.map((prod) => {
                          const live = computeLivePosStock({
                            product: prod,
                            allProducts: products,
                            productRecipes,
                            cart: cartEntries,
                            draftQty: 1,
                          });
                          const outOfStock = live.tracksStock && live.exceedsStock;
                          const inCartQty = cart.find((c) => c.product.id === prod.id)?.qty ?? 0;
                          return (
                            <button
                              key={prod.id}
                              type="button"
                              disabled={outOfStock}
                              data-testid={`pos-quick-tap-${prod.id}`}
                              onClick={() => addToCart(prod, 1)}
                              className={`relative p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 min-h-[104px] ${
                                outOfStock
                                  ? 'border-stone-200 bg-stone-50 opacity-60 cursor-not-allowed'
                                  : inCartQty > 0
                                  ? 'border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50'
                                  : 'border-stone-200 bg-white hover:border-emerald-400 hover:bg-stone-50/60'
                              }`}
                            >
                              {inCartQty > 0 && (
                                <span className="absolute top-2 right-2 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[10px] font-mono font-bold tabular-nums inline-flex items-center justify-center">
                                  {inCartQty}
                                </span>
                              )}
                              <div className="pr-5">
                                <p className="text-xs font-semibold text-stone-900 line-clamp-2 leading-snug">
                                  {prod.name}
                                </p>
                                <p className="text-[11px] text-stone-500 font-mono tabular-nums mt-1">
                                  {live.tracksStock
                                    ? outOfStock
                                      ? 'Stok habis'
                                      : `Stok ${live.availableAfterCart.toFixed(0)} ${live.unitLabel}`
                                    : prod.unit}
                                </p>
                              </div>
                              <p className="text-xs font-bold font-mono tabular-nums text-emerald-700">
                                {formatRupiah(prod.sellingPrice)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-12 px-6 text-center space-y-1.5">
                    <p className="text-sm font-semibold text-slate-800">
                      Barang &ldquo;{searchQuery}&rdquo; tidak ditemukan
                    </p>
                    <p className="text-xs text-slate-500">
                      Periksa ejaan nama barang, SKU, atau kode barcode yang dipindai.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Produk &amp; Barcode</th>
                          <th className="py-3 px-4 text-right">Sisa Stok (Real-Time)</th>
                          <th className="py-3 px-4 text-right">Harga Jual</th>
                          <th className="py-3 px-4 text-center">Jumlah Beli</th>
                          <th className="py-3 px-4 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredProducts.map((prod) => {
                          const draftQty = getDraftQty(prod.id);
                          const live = computeLivePosStock({
                            product: prod,
                            allProducts: products,
                            productRecipes,
                            cart: cartEntries,
                            draftQty,
                          });
                          return (
                            <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4">
                                <p className="font-medium text-slate-900">{prod.name}</p>
                                <p className="text-xs font-mono text-slate-500">
                                  {prod.barcodeQr || prod.sku}
                                  {prod.isTaxExempt ? ' · Bebas PPN' : ''}
                                  {live.inCartQty.gt(0) && (
                                    <span className="text-emerald-700 font-sans font-medium">
                                      {' '}
                                      · Di keranjang: {live.inCartQty.toFixed(0)} {live.unitLabel}
                                    </span>
                                  )}
                                </p>
                              </td>
                              <td
                                data-testid={`pos-live-stock-${prod.id}`}
                                className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap"
                              >
                                {live.tracksStock ? (
                                  <div className="space-y-0.5">
                                    <span
                                      className={
                                        live.exceedsStock || live.isLow
                                          ? 'text-rose-600 font-semibold inline-flex items-center gap-1'
                                          : 'text-slate-900 font-semibold'
                                      }
                                    >
                                      {(live.exceedsStock || live.isLow) && (
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                      )}
                                      {live.projectedAfterDraft.toFixed(0)} {live.unitLabel}
                                    </span>
                                    <p className="text-[11px] font-sans text-slate-500">
                                      {live.exceedsStock
                                        ? `Maks tersedia: ${live.availableAfterCart.toFixed(0)}`
                                        : `Tersedia sblm tambah: ${live.availableAfterCart.toFixed(0)}`}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-xs font-sans text-slate-500">
                                    Tersedia
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                                {formatRupiah(prod.sellingPrice)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setDraftQty(prod.id, draftQty - 1)}
                                    aria-label={`Kurangi jumlah pilih ${prod.name}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    aria-label={`Jumlah pilih ${prod.name}`}
                                    data-testid={`pos-draft-qty-${prod.id}`}
                                    value={draftQty}
                                    onChange={(e) =>
                                      setDraftQty(prod.id, parseInt(e.target.value, 10))
                                    }
                                    className="w-14 h-7 text-center text-xs font-mono font-semibold tabular-nums border border-slate-200 rounded-md bg-white focus:outline-none focus:border-emerald-600"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setDraftQty(prod.id, draftQty + 1)}
                                    aria-label={`Tambah jumlah pilih ${prod.name}`}
                                    className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  disabled={live.tracksStock && live.exceedsStock}
                                  onClick={() => addToCart(prod, draftQty)}
                                  data-testid={`pos-add-btn-${prod.id}`}
                                  aria-label={`Tambah ${draftQty} ${prod.name}`}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Tambah ({draftQty})</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => addToCart(prod, 1)}
                    className="group text-left bg-white border border-slate-200 hover:border-emerald-600 rounded-xl overflow-hidden transition-colors flex flex-col"
                  >
                    {isFnb && (
                      <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                        {prod.imageUrl && !imgErrors[prod.id] ? (
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            referrerPolicy="no-referrer"
                            onError={() => setImgErrors((prev) => ({ ...prev, [prod.id]: true }))}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                            <UtensilsCrossed className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-snug">
                          {prod.name}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {prod.description}
                        </p>
                      </div>
                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                        <span className="text-sm font-mono font-bold tabular-nums text-emerald-700">
                          {formatRupiah(prod.sellingPrice)}
                        </span>
                        <span className="text-xs font-medium text-slate-500 group-hover:text-emerald-700">
                          + Keranjang
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right 4 Columns: Active Cart & Payment */}
          <div
            id="pos-cart-panel"
            className="lg:col-span-4 bg-white border border-stone-200 rounded-xl p-5 space-y-4 lg:sticky lg:top-24"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-base font-semibold text-stone-900">Keranjang Transaksi</h2>
              <span className="text-xs font-mono text-stone-500 tabular-nums">
                {cart.reduce((s, i) => s + i.qty, 0)} item
              </span>
            </div>

            {/* Customer / Member Quick Registration & Selection (All Plans incl. LITE) */}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pos-crm-select" className="block text-xs font-medium text-stone-600">
                    Pelanggan / Member
                  </label>
                  <button
                    type="button"
                    data-testid="pos-new-member-btn"
                    onClick={() => {
                      setQuickMemberOpen((prev) => !prev);
                      setQuickMemberName(customerName.trim());
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    {quickMemberOpen ? 'Tutup Form' : '+ Member Baru'}
                  </button>
                </div>

                {quickMemberSavedMsg && (
                  <div
                    role="status"
                    data-testid="pos-member-saved-toast"
                    className="px-2.5 py-1.5 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg"
                  >
                    {quickMemberSavedMsg}
                  </div>
                )}

                {quickMemberOpen && (
                  <div
                    data-testid="pos-quick-member-form"
                    className="p-3 bg-stone-50 border border-stone-200 rounded-lg space-y-2.5"
                  >
                    <p className="text-[11px] font-semibold text-stone-800">
                      Daftar Member / Kontak Baru Langsung di Kasir
                    </p>
                    <input
                      type="text"
                      data-testid="pos-new-member-name"
                      value={quickMemberName}
                      onChange={(e) => setQuickMemberName(e.target.value)}
                      placeholder="Nama lengkap pelanggan *"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md focus:outline-none focus:border-emerald-600"
                    />
                    <input
                      type="tel"
                      data-testid="pos-new-member-phone"
                      value={quickMemberPhone}
                      onChange={(e) => setQuickMemberPhone(e.target.value)}
                      placeholder="Nomor WhatsApp / HP (opsional)"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-md focus:outline-none focus:border-emerald-600"
                    />
                    <input
                      type="text"
                      value={quickMemberNotes}
                      onChange={(e) => setQuickMemberNotes(e.target.value)}
                      placeholder="Catatan singkat (opsional)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md focus:outline-none focus:border-emerald-600"
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setQuickMemberOpen(false)}
                        className="px-2.5 py-1 text-[11px] font-medium text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-100"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        data-testid="pos-save-member-btn"
                        disabled={!quickMemberName.trim()}
                        onClick={() => {
                          const trimmed = quickMemberName.trim();
                          if (!trimmed) return;
                          const created = addCrmCustomer({
                            name: trimmed,
                            phoneWa: quickMemberPhone.trim(),
                            totalSpend: '0.0000',
                            totalSpent: '0.0000',
                            loyaltyPoints: 0,
                            receivableBalance: '0.0000',
                            notes: quickMemberNotes.trim() || undefined,
                          });
                          setSelectedCrmId(created.id);
                          setCustomerName(created.name);
                          setQuickMemberName('');
                          setQuickMemberPhone('');
                          setQuickMemberNotes('');
                          setQuickMemberOpen(false);
                          setQuickMemberSavedMsg(
                            `Member "${created.name}" tersimpan dan dipilih untuk transaksi ini.`
                          );
                          window.setTimeout(() => setQuickMemberSavedMsg(null), 4000);
                        }}
                        className="px-3 py-1 text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-md"
                      >
                        Simpan &amp; Pilih
                      </button>
                    </div>
                  </div>
                )}

                {crmCustomers.length > 0 && (
                  <select
                    id="pos-crm-select"
                    data-testid="pos-crm-select"
                    value={selectedCrmId}
                    onChange={(e) => {
                      setSelectedCrmId(e.target.value);
                      const found = crmCustomers.find((c) => c.id === e.target.value);
                      if (found) setCustomerName(found.name);
                    }}
                    className="w-full px-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-white"
                  >
                    <option value="">-- Pelanggan Umum --</option>
                    {crmCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {hasPromoCrmPro
                          ? `${c.name} (${c.loyaltyPoints} pts)`
                          : c.phoneWa
                          ? `${c.name} · ${c.phoneWa}`
                          : c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label
                  htmlFor="pos-customer-name"
                  className="block text-xs font-medium text-stone-600 mb-1"
                >
                  Nama Pelanggan / Klien
                </label>
                <input
                  id="pos-customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (selectedCrmId) setSelectedCrmId('');
                  }}
                  placeholder="Pelanggan Umum"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              {isFnb && (
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'DINE_IN', label: 'Dine-In' },
                      { id: 'TAKEAWAY', label: 'Takeaway' },
                      { id: 'DELIVERY', label: 'Delivery' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setOrderMode(mode.id)}
                      className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
                        orderMode === mode.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              )}

              {isFnb && orderMode === 'DINE_IN' && tables.length > 0 && (
                <div>
                  <label
                    htmlFor="pos-table-select"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Nomor Meja
                  </label>
                  <select
                    id="pos-table-select"
                    value={selectedTableId}
                    onChange={(e) => setSelectedTableId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  >
                    <option value="">Tanpa Meja</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Meja {t.tableNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isBarbershop && (
                <div>
                  <label
                    htmlFor="pos-stylist-select"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1"
                  >
                    <Scissors className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Kapster / Hair Stylist (Komisi Otomatis)</span>
                  </label>
                  <select
                    id="pos-stylist-select"
                    data-testid="pos-stylist-select"
                    value={selectedStylistId}
                    onChange={(e) => setSelectedStylistId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  >
                    {BARBERSHOP_STYLISTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Dynamic Custom Fields for Orders */}
              {orderCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label
                    htmlFor={`order-cf-${cf.fieldKey}`}
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    {cf.fieldLabel}
                  </label>
                  <input
                    id={`order-cf-${cf.fieldKey}`}
                    type={cf.fieldType === 'NUMBER' ? 'number' : cf.fieldType === 'DATE' ? 'date' : 'text'}
                    value={orderCustomAttrs[cf.fieldKey] ?? ''}
                    onChange={(e) =>
                      setOrderCustomAttrs((prev) => ({ ...prev, [cf.fieldKey]: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              ))}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500">
                  Klik produk atau pindai barcode untuk memulai transaksi.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto pr-1">
                {pricedCart.map((item) => (
                  <div key={item.product.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.product.name}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatRupiah(item.effectiveUnitPrice)}
                          {item.appliedTierLabel && (
                            <span className="ml-1.5 font-sans text-[10px] font-semibold text-emerald-700">
                              · {item.appliedTierLabel}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(item.product.id, -1)}
                          aria-label={`Kurangi ${item.product.name}`}
                          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          {item.qty === 1 ? (
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <Minus className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <span className="w-6 text-center text-xs font-mono font-semibold tabular-nums">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.product.id, 1)}
                          aria-label={`Tambah lagi ${item.product.name}`}
                          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {isFnb && (
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateNotes(item.product.id, e.target.value)}
                        placeholder="Catatan dapur (misal: pedas, tanpa bawang)..."
                        aria-label={`Catatan untuk ${item.product.name}`}
                        className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-emerald-600"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Promo, Discount & Payment Method */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              {hasPromoCrmPro && activePromos.length > 0 && (
                <div>
                  <label htmlFor="pos-promo-select" className="block text-xs text-stone-600 mb-1">
                    Pilih Promo Aktif
                  </label>
                  <select
                    id="pos-promo-select"
                    value={selectedPromoId}
                    onChange={(e) => setSelectedPromoId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-md bg-white"
                  >
                    <option value="">Tanpa Promo</option>
                    {activePromos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <label htmlFor="pos-discount" className="text-xs text-slate-600">
                  Diskon Manual (Rp)
                </label>
                <input
                  id="pos-discount"
                  type="number"
                  min={0}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="w-32 px-2.5 py-1 text-right text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                />
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatRupiah(totals.subtotal)}</span>
                </div>
                {totals.discount.gt(0) && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Total Diskon / Promo</span>
                    <span className="font-mono tabular-nums">-{formatRupiah(totals.discount)}</span>
                  </div>
                )}
                {totals.serviceCharge.gt(0) && (
                  <div className="flex justify-between text-slate-600">
                    <span>Service Charge</span>
                    <span className="font-mono tabular-nums">
                      {formatRupiah(totals.serviceCharge)}
                    </span>
                  </div>
                )}
                {new Decimal(totals.tax.taxAmount).gt(0) && (
                  <>
                    {totals.tax.taxType === 'PPN_11_12' && (
                      <div className="flex justify-between text-slate-500">
                        <span>DPP Nilai Lain (11/12)</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(totals.tax.dppNilaiLain)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>{totals.tax.effectiveRateLabel}</span>
                      <span className="font-mono tabular-nums">
                        {formatRupiah(totals.tax.taxAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total Bayar</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    {formatRupiah(totals.grandTotal)}
                  </span>
                </div>
              </div>

              {/* Payment Selector (Enforces Cash-Only on Paket LITE unless ADDON_NON_CASH_PAYMENT active) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-stone-700">
                    {canUseNonCash
                      ? !isOnline
                        ? 'Metode Pembayaran (Offline · Khusus Tunai)'
                        : 'Metode Pembayaran (QRIS Dinamis · E-Wallet · VA)'
                      : 'Metode Pembayaran (Paket LITE · Khusus Tunai)'}
                  </span>
                  {canUseNonCash && isOnline && (
                    <a
                      href={`/customer-display/${encodeURIComponent(displayBranchId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:underline"
                    >
                      <Monitor className="w-3 h-3" />
                      Layar Pelanggan
                    </a>
                  )}
                </div>

                {canUseNonCash ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {PAYMENT_CHANNELS.map((ch) => {
                        const active = paymentMethod === ch.id;
                        const disabledByOffline = !isOnline && ch.id !== 'CASH';
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            disabled={disabledByOffline}
                            data-testid={`pos-pay-${ch.id}`}
                            onClick={() => setPaymentMethod(ch.id)}
                            title={
                              disabledByOffline
                                ? 'Butuh koneksi internet untuk pembayaran non-tunai'
                                : undefined
                            }
                            className={`py-1.5 px-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                              disabledByOffline
                                ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                                : active
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            {ch.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-stone-500">
                      {!isOnline
                        ? 'QRIS/Transfer sementara dinonaktifkan saat offline. Gunakan Tunai agar transaksi tetap berjalan.'
                        : getPaymentChannelMeta(paymentMethod).providerHint}
                    </p>
                  </>
                ) : (
                  <div
                    data-testid="pos-lite-cash-only-notice"
                    className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs"
                  >
                    <span className="font-bold text-stone-900 block">Pembayaran Tunai (Cash)</span>
                    <span className="text-[11px] text-stone-500">
                      Uang pembayaran dicatat langsung ke laci kasir.
                    </span>
                  </div>
                )}
              </div>

              {/* Optional Thermal Receipt Print Toggle (Hidden on Paket LITE without ADDON_THERMAL_RECEIPT) */}
              {canUseThermalPrint ? (
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-stone-50 border border-stone-200 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="pos-toggle-print-receipt"
                    checked={autoPrintReceipt}
                    onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                    className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <div className="text-xs leading-snug">
                    <span className="font-semibold text-stone-800 block">
                      {autoPrintReceipt
                        ? 'Cetak Struk Thermal Setelah Bayar'
                        : 'Selesai Tanpa Cetak Struk (Tanpa Printer)'}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      {isWarung
                        ? 'Default nonaktif untuk Warung Sembako tanpa printer.'
                        : 'Hilangkan centang jika kasir tidak menggunakan printer thermal.'}
                    </span>
                  </div>
                </label>
              ) : (
                <div
                  data-testid="pos-lite-no-receipt-notice"
                  className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-600"
                >
                  <span>Transaksi otomatis tercatat tanpa cetak struk thermal.</span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="pos-checkout-btn"
                  disabled={cart.length === 0}
                  onClick={() => void handleCheckout()}
                  className="w-full py-3 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 rounded-lg transition-colors whitespace-nowrap"
                >
                  {paymentMethod === 'CASH' || !canUseNonCash
                    ? canUseThermalPrint && autoPrintReceipt
                      ? 'Bayar Tunai & Cetak Struk'
                      : 'Selesai Bayar Tunai (Tanpa Struk)'
                    : `Lanjut Bayar ${getPaymentChannelMeta(paymentMethod).shortLabel} (Auto-Verify)`}
                </button>
                {isFnb && canUseRestoAdvanced && (
                  <button
                    type="button"
                    disabled={cart.length === 0}
                    onClick={handleHoldOpenBill}
                    className="w-full py-2 px-4 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Simpan ke Open Bill / Tahan Pesanan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Spacer on mobile when sticky checkout bar is visible so cart content stays unobstructed */}
        {cart.length > 0 && <div className="h-20 lg:hidden" aria-hidden="true" />}
      </div>

      {/* Sticky Mobile Checkout Bar (positioned cleanly above Mobile Bottom Navigation) */}
      {cart.length > 0 && (
        <div
          data-testid="pos-mobile-checkout-bar"
          className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-white border-t border-stone-200 px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-stone-500">
              {cart.reduce((s, i) => s + i.qty, 0)} item di keranjang
            </p>
            <p className="text-base font-bold font-mono tabular-nums text-emerald-700 truncate">
              {formatRupiah(totals.grandTotal)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('pos-cart-panel');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="px-3 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg whitespace-nowrap"
            >
              Keranjang
            </button>
            <button
              type="button"
              data-testid="pos-mobile-pay-btn"
              onClick={() => void handleCheckout()}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              Bayar Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Shift Open / Close Reconciliation Modal */}
      <ModalShell
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        headerId="pos-shift-modal-title"
        title={openShift ? 'Tutup Shift Kasir & Rekonsiliasi Kas' : 'Buka Shift Kasir Baru'}
        subtitle={
          openShift
            ? 'Jika uang fisik berbeda dengan kas ekspektasi sistem, selisih otomatis dijurnal ke Beban Selisih Kas (6109) & dicatat di Audit Log.'
            : 'Catat modal awal kas laci sebelum melayani transaksi tunai.'
        }
      >
        <div className="p-6 space-y-4">
          {openShift ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const res = closeActiveCashierShift(new Decimal(closingCashInput || '0').toFixed(4));
                setShiftModalOpen(false);
                setScanToast(
                  `Shift ditutup. Selisih kas: ${formatRupiah(res.variance)} (tercatat pada jurnal & audit log).`
                );
                window.setTimeout(() => setScanToast(null), 4000);
              }}
              className="space-y-4"
            >
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-600">Modal Awal Laci</span>
                  <span className="font-mono font-semibold">{formatRupiah(openShift.openingCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Kas Ekspektasi Sistem</span>
                  <span className="font-mono font-bold text-slate-900">{formatRupiah(openShift.expectedCash)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uang Tunai Fisik di Laci Sekarang (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShiftModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg">Tutup Shift &amp; Posting Selisih</button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openCashierShift(new Decimal(openingCashInput || '0').toFixed(4));
                setShiftModalOpen(false);
                setScanToast('Shift kasir baru berhasil dibuka.');
                window.setTimeout(() => setScanToast(null), 3000);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modal Awal Kas Laci (Rp)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={openingCashInput}
                  onChange={(e) => setOpeningCashInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShiftModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Buka Shift Sekarang</button>
              </div>
            </form>
          )}
        </div>
      </ModalShell>

      {/* Open Bills, Split Bill, Move Table & Void Modal */}
      <ModalShell
        open={openBillsModalOpen}
        onClose={() => setOpenBillsModalOpen(false)}
        headerId="pos-open-bills-title"
        title="Daftar Open Bill · Split Bill · Pindah Meja"
        subtitle="Kelola tagihan terbuka meja restoran tanpa mengganggu transaksi kasir lainnya."
        maxWidthClass="max-w-3xl"
      >
        <div className="p-6 space-y-4">
          {openBills.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Belum ada Open Bill aktif. Klik &ldquo;Simpan ke Open Bill&rdquo; di kasir untuk menahan pesanan meja.
            </p>
          ) : (
            <div className="space-y-3">
              {openBills.map((ord) => (
                <div
                  key={ord.id}
                  className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">
                      {ord.customerName} {ord.tableNumber ? `· Meja ${ord.tableNumber}` : ''}
                    </p>
                    <p className="text-xs font-mono text-slate-500">
                      {ord.orderNumber} · {ord.items.length} item ·{' '}
                      <strong className="text-emerald-700">{formatRupiah(ord.grandTotal)}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const settled = settleOpenBill(ord.id, paymentMethod);
                        if (settled) setReceiptOrder(settled);
                        setOpenBillsModalOpen(false);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                    >
                      Bayar Lunas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        splitOpenBill(ord.id, 'EQUAL', 2);
                        setScanToast(`Open Bill ${ord.orderNumber} berhasil di-split rata menjadi 2 tagihan.`);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      <Split className="w-3.5 h-3.5" />
                      <span>Split 2</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoveBillOrder(ord);
                        setMoveTargetTableId(tables[0]?.id ?? '');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Pindah Meja</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVoidTargetOrder(ord);
                        setVoidReason('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Void</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {moveBillOrder && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <p className="text-xs font-bold text-slate-900">
                Pindah / Gabung Meja untuk {moveBillOrder.orderNumber}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={moveTargetTableId}
                  onChange={(e) => setMoveTargetTableId(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>Meja {t.tableNumber}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const tbl = tables.find((t) => t.id === moveTargetTableId);
                    if (tbl) {
                      moveOrMergeTable(moveBillOrder.id, tbl.id, tbl.tableNumber);
                      setMoveBillOrder(null);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg"
                >
                  Konfirmasi Pindah
                </button>
              </div>
            </div>
          )}

          {voidTargetOrder && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <p className="text-xs font-bold text-rose-900">
                Void Transaksi {voidTargetOrder.orderNumber} (Tercatat di Riwayat Pengawasan Kasir)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Alasan pembatalan wajib diisi..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-rose-200 rounded-lg bg-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    voidOrderWithAudit(voidTargetOrder.id, voidReason || 'Dibatalkan tamu');
                    setVoidTargetOrder(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg"
                >
                  Konfirmasi Void
                </button>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* Zero-Token Non-Cash Automatic Verification Modal */}
      <ModalShell
        open={paymentModalOpen}
        onClose={() => {
          if (!paymentVerifying) {
            setPaymentModalOpen(false);
            setPaymentSession(null);
          }
        }}
        headerId="pos-auto-payment-title"
        title={`Verifikasi Otomatis · ${getPaymentChannelMeta(paymentMethod).label}`}
        subtitle="Sistem memverifikasi pembayaran non-tunai secara otomatis melalui penyedia pembayaran resmi."
      >
        <div data-testid="pos-auto-payment-modal" className="p-6 space-y-5">
          {paymentSessionLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>Membuat kode pembayaran &amp; challenge verifikasi...</span>
            </div>
          ) : gatewayTxn || paymentSession ? (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <p className="text-xs font-semibold text-slate-600">
                    {gatewayTxn
                      ? `${gatewayTxn.provider} · ${gatewayTxn.channelCode}`
                      : paymentSession?.bankOrProviderLabel}
                  </p>
                  <a
                    href={`/customer-display/${encodeURIComponent(displayBranchId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="pos-modal-customer-display-link"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-emerald-400 text-[10px] font-bold hover:bg-slate-800"
                  >
                    <Monitor className="w-3 h-3" />
                    Sinkron Layar Pelanggan
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {formatRupiah(gatewayTxn?.totalPayable ?? paymentSession?.payableAmount ?? '0')}
                </p>

                {gatewayTxn && Number(gatewayTxn.customerAdminFee) > 0 && (
                  <p className="text-[11px] text-amber-700 font-medium">
                    Termasuk biaya admin layanan {formatRupiah(gatewayTxn.customerAdminFee)} (Akun Titipan 2109)
                  </p>
                )}

                {paymentMethod === 'QRIS_DYNAMIC' || paymentMethod.startsWith('EWALLET_') ? (
                  <>
                    <div className="p-3 bg-white border-2 border-slate-900 rounded-2xl">
                      <QRCodeSVG
                        value={gatewayTxn?.qrString || paymentSession?.paymentCode || 'QRIS'}
                        size={190}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {['GoPay', 'OVO', 'DANA', 'ShopeePay', 'BCA Mobile', 'Livin', 'BRImo'].map(
                        (w) => (
                          <span
                            key={w}
                            className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600"
                          >
                            {w}
                          </span>
                        )
                      )}
                    </div>
                  </>
                ) : (
                  <div className="w-full bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">
                      {paymentMethod === 'VIRTUAL_ACCOUNT'
                        ? 'Nomor Virtual Account'
                        : 'Rekening & Kode Unik Transfer'}
                    </p>
                    <p className="text-base sm:text-lg font-bold font-mono text-slate-900 break-all">
                      {gatewayTxn?.vaNumber || paymentSession?.paymentCode}
                    </p>
                    {gatewayTxn?.uniqueCode ? (
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        Kode Unik: +{gatewayTxn.uniqueCode}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="w-full text-[11px] font-mono text-slate-500 flex items-center justify-between pt-2 border-t border-slate-200">
                  <span>Ref: {gatewayTxn?.gatewayRefId || paymentSession?.gatewayRefId}</span>
                  <span className="text-emerald-700 font-semibold">
                    {gatewayTxn ? 'Tersinkron Live' : `Sig: ${paymentSession?.signature.slice(0, 8)}`}
                  </span>
                </div>
              </div>

              {paymentVerifyError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {paymentVerifyError}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={paymentVerifying}
                  onClick={() => {
                    setPaymentModalOpen(false);
                    setPaymentSession(null);
                    setGatewayTxn(null);
                    void fetch(`/api/payments/customer-display/${encodeURIComponent(displayBranchId)}/reset`, {
                      method: 'POST',
                    }).catch(() => {});
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  data-testid="pos-verify-auto-btn"
                  disabled={paymentVerifying}
                  onClick={() => void handleAutoVerifyNonCash()}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {paymentVerifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>
                    {paymentVerifying
                      ? 'Memverifikasi Webhook...'
                      : 'Verifikasi Pembayaran Otomatis & Selesaikan'}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 text-center py-4">
              <p className="text-xs text-rose-700">{paymentVerifyError || 'Sesi tidak tersedia.'}</p>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 rounded-lg"
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </ModalShell>

      {scannerOpen && (
        <BarcodeScannerModal
          products={sellableProducts}
          onDetected={handleBarcodeMatch}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {receiptOrder && (
        <ThermalReceiptModal
          order={receiptOrder}
          tenant={tenant}
          onClose={() => {
            setReceiptOrder(null);
            resetPosForNewTransaction();
          }}
          onPrinted={() => markReceiptPrinted(tenant.id, receiptOrder.id)}
        />
      )}

      <FonnteSendModal
        open={Boolean(fonnteOrder)}
        onClose={() => setFonnteOrder(null)}
        title={fonnteOrder ? `Kirim Struk ${fonnteOrder.orderNumber} via Fonnte` : 'Kirim Struk WA'}
        defaultPhone={fonnteOrder?.customerPhoneWa ?? ''}
        defaultMessage={fonnteOrder ? buildWhatsappReceiptText(fonnteOrder) : ''}
        documentType="RECEIPT"
        referenceNo={fonnteOrder?.orderNumber}
      />

      <DirectWaCustomerModal
        open={Boolean(directWaOrder)}
        onClose={() => setDirectWaOrder(null)}
        title={
          directWaOrder
            ? `Kirim Rincian Transaksi ${directWaOrder.orderNumber}`
            : 'Kirim Rincian ke Pelanggan'
        }
        subtitle="Rincian transaksi akan dibuka di aplikasi WhatsApp Anda agar siap dikirim ke pelanggan."
        businessWhatsappNumber={tenant.settings?.businessWhatsappNumber}
        defaultCustomerPhone={directWaOrder?.customerPhoneWa ?? ''}
        defaultCustomerName={directWaOrder?.customerName}
        defaultMessage={
          directWaOrder
            ? buildCustomerReceiptWaMessage({ tenant, order: directWaOrder })
            : ''
        }
      />

      <DailyClosingModal
        open={closingModalOpen}
        onClose={() => setClosingModalOpen(false)}
      />

      <OwnerWaReminderModal
        open={waReminderModalOpen}
        onClose={() => setWaReminderModalOpen(false)}
        contextLabel="ringkasan pesanan kasir"
      />
    </AppShell>
  );
}
