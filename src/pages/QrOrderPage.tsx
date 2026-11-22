/**
 * Mode 2: Smart Mobile Self-Order & Checkout (/order/:tenantSlug/:qrToken & /order/:qrToken/status/:orderId)
 * Supports:
 * - Direct App-to-App E-Wallet (GoPay, ShopeePay, DANA) with "Buka Aplikasi & Bayar Sekarang" + return status page
 * - OVO Push-to-Pay (08... phone input + 55-second countdown instruction)
 * - Dynamic QRIS with "Download / Simpan Gambar QRIS" & "Cek Status Pembayaran"
 * - Virtual Account (BCA, Mandiri, BRI, BNI, BSI, Permata) with 1-Klik Salin Nomor VA
 * - Live Kitchen Progress Stepper: Menunggu -> Dimasak -> Siap Saji
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus,
  Minus,
  CheckCircle2,
  ArrowLeft,
  UtensilsCrossed,
  QrCode,
  ChefHat,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Copy,
  Check,
  Download,
  RefreshCw,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { calculateOrderTax } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import { getFrequentlyBoughtTogether } from '../lib/pos/advanced-pos-engine';
import type {
  Order,
  PaymentCategory,
  PaymentTransaction,
  Product,
} from '../types/domain';

interface QrOrderPageProps {
  tenantSlug: string;
  qrToken: string;
  initialStatusOrderId?: string;
}

type MobilePaymentOptionId =
  | 'QRIS'
  | 'GOPAY'
  | 'SHOPEEPAY'
  | 'DANA'
  | 'OVO'
  | 'VA_BCA'
  | 'VA_MANDIRI'
  | 'VA_BRI'
  | 'VA_BNI'
  | 'VA_BSI'
  | 'VA_PERMATA';

interface ActiveMobilePayment {
  order: Order;
  transaction: PaymentTransaction;
  instructions: string;
}

const DIRECT_WALLETS: Array<{
  id: 'GOPAY' | 'SHOPEEPAY' | 'DANA' | 'OVO';
  label: string;
  desc: string;
  badge: string;
}> = [
  { id: 'GOPAY', label: 'GoPay', desc: 'Langsung buka aplikasi Gojek', badge: 'App-to-App' },
  { id: 'SHOPEEPAY', label: 'ShopeePay', desc: 'Langsung buka aplikasi Shopee', badge: 'App-to-App' },
  { id: 'DANA', label: 'DANA', desc: 'Langsung buka aplikasi DANA', badge: 'App-to-App' },
  { id: 'OVO', label: 'OVO Push', desc: 'Notifikasi langsung ke HP (55 dtk)', badge: 'Push-to-Pay' },
];

const VA_BANKS: Array<{ id: MobilePaymentOptionId; label: string }> = [
  { id: 'VA_BCA', label: 'BCA VA' },
  { id: 'VA_MANDIRI', label: 'Mandiri VA' },
  { id: 'VA_BRI', label: 'BRI VA' },
  { id: 'VA_BNI', label: 'BNI VA' },
  { id: 'VA_BSI', label: 'BSI VA' },
  { id: 'VA_PERMATA', label: 'Permata VA' },
];

export function QrOrderPage({
  tenantSlug,
  qrToken,
  initialStatusOrderId,
}: QrOrderPageProps) {
  const {
    findWorkspaceBySlug,
    workspaces,
    createPendingQrOrder,
    finalizeQrOrderViaWebhook,
    switchTenant,
    navigate,
    regionalTaxRegistry,
  } = useApp();

  const workspace =
    findWorkspaceBySlug(tenantSlug) ??
    workspaces.find((w) => w.tables.some((t) => t.qrToken === qrToken)) ??
    workspaces[0];

  const table =
    workspace.tables.find((t) => t.qrToken === qrToken) ??
    workspace.tables[0] ?? {
      id: 'tbl-default',
      tenantId: workspace.tenant.id,
      tableNumber: '04',
      qrToken,
      isActive: true,
    };

  const menuItems = useMemo(
    () =>
      workspace.products.filter(
        (p) => p.itemType !== 'RAW_MATERIAL' && p.isAvailable
      ),
    [workspace.products]
  );

  const [cart, setCart] = useState<Array<{ product: Product; qty: number; notes: string }>>([]);
  const [customerName, setCustomerName] = useState('');
  const [selectedPayOption, setSelectedPayOption] = useState<MobilePaymentOptionId>('QRIS');
  const [ovoPhone, setOvoPhone] = useState('');
  const [activePayment, setActivePayment] = useState<ActiveMobilePayment | null>(null);
  const [paidOrder, setPaidOrder] = useState<Order | null>(null);
  const [paidTxn, setPaidTxn] = useState<PaymentTransaction | null>(null);
  const [kitchenStatus, setKitchenStatus] = useState<'PENDING' | 'COOKING' | 'READY' | 'SERVED'>(
    'PENDING'
  );
  const [ovoCountdown, setOvoCountdown] = useState<number>(55);
  const [copiedVa, setCopiedVa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  // If landed via App-to-App callback URL (/order/.../status/:orderId), fetch live status immediately
  useEffect(() => {
    if (!initialStatusOrderId) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/payments/transactions/${encodeURIComponent(initialStatusOrderId)}`
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          transaction?: PaymentTransaction;
          kitchenStatus?: 'PENDING' | 'COOKING' | 'READY' | 'SERVED' | null;
        };
        if (!alive || !json.transaction) return;
        if (json.transaction.status === 'PAID' || json.transaction.status === 'SETTLED') {
          setPaidTxn(json.transaction);
          const localOrd = workspace.orders.find(
            (o) => o.id === json.transaction?.orderId || o.orderNumber === json.transaction?.orderNumber
          );
          if (localOrd) setPaidOrder(localOrd);
          if (json.kitchenStatus) setKitchenStatus(json.kitchenStatus);
        }
      } catch {
        // silent poll retry
      }
    };
    void poll();
    const t = window.setInterval(poll, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [initialStatusOrderId, workspace.orders]);

  // OVO 55-second Push-to-Pay countdown
  useEffect(() => {
    if (!activePayment || activePayment.transaction.channelCode !== 'OVO') return;
    setOvoCountdown(55);
    const timer = window.setInterval(() => {
      setOvoCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activePayment?.transaction.id, activePayment?.transaction.channelCode]);

  // Live poll kitchen progress once paid
  useEffect(() => {
    if (!paidTxn?.id) return;
    let alive = true;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/transactions/${encodeURIComponent(paidTxn.id)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          kitchenStatus?: 'PENDING' | 'COOKING' | 'READY' | 'SERVED' | null;
        };
        if (alive && data.kitchenStatus) setKitchenStatus(data.kitchenStatus);
      } catch {
        // ignore
      }
    }, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [paidTxn?.id]);

  const addItem = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { product, qty: 1, notes: '' }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const updateNote = (productId: string, notes: string) => {
    setCart((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, notes } : i))
    );
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum.plus(new Decimal(item.product.sellingPrice).times(item.qty)),
      new Decimal(0)
    );
    const serviceCharge = subtotal
      .times(new Decimal(workspace.tenant.serviceChargeRate || '0'))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const tax = calculateOrderTax({
      vertical: workspace.tenant.vertical,
      isPkp: workspace.tenant.isPkp,
      items: cart.map((c) => ({
        lineSubtotal: new Decimal(c.product.sellingPrice).times(c.qty).toFixed(4),
        isLuxuryGoods: c.product.isLuxuryGoods,
        isTaxExempt: c.product.isTaxExempt,
      })),
      discountAmount: '0',
      serviceCharge: serviceCharge.toFixed(4),
      regionalTax: workspace.tenant.settings.regionalTax,
      regionalTaxRegistry,
    });
    const grandTotal = subtotal.plus(serviceCharge).plus(new Decimal(tax.taxAmount));
    return { subtotal, serviceCharge, tax, grandTotal };
  }, [cart, workspace.tenant, regionalTaxRegistry]);

  const upsellSuggestions = useMemo(
    () =>
      getFrequentlyBoughtTogether({
        cartProductIds: cart.map((c) => c.product.id),
        orders: workspace.orders,
        products: menuItems,
        limit: 3,
      }),
    [cart, workspace.orders, menuItems]
  );

  const resolveOptionCategory = (opt: MobilePaymentOptionId): PaymentCategory => {
    if (opt === 'QRIS') return 'QRIS_DYNAMIC';
    if (opt.startsWith('VA_')) return 'VIRTUAL_ACCOUNT';
    return 'EWALLET_DIRECT';
  };

  const handleCreateMobilePayment = async () => {
    if (!cart.length) return;
    if (selectedPayOption === 'OVO' && !/^08\d{8,12}$/.test(ovoPhone.replace(/\D/g, ''))) {
      setErrorMsg('Masukkan nomor HP terdaftar di OVO yang valid (diawali 08...).');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    try {
      const pendingOrder = createPendingQrOrder({
        tenantId: workspace.tenant.id,
        tableId: table.id,
        tableNumber: table.tableNumber,
        customerName: customerName.trim() || `Tamu Meja ${table.tableNumber}`,
        cart: cart.map((c) => ({
          productId: c.product.id,
          qty: c.qty,
          notes: c.notes.trim() || undefined,
        })),
      });

      const returnUrl = `${window.location.origin}/order/${encodeURIComponent(
        workspace.tenant.slug
      )}/${encodeURIComponent(table.qrToken)}/status/${encodeURIComponent(pendingOrder.id)}`;

      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: workspace.tenant.id,
          orderId: pendingOrder.id,
          orderNumber: pendingOrder.orderNumber,
          customerName: pendingOrder.customerName,
          tableNumber: table.tableNumber,
          checkoutMode: 'MOBILE_SELF_ORDER',
          paymentCategory: resolveOptionCategory(selectedPayOption),
          channelCode: selectedPayOption,
          baseAmount: pendingOrder.grandTotal,
          ovoPhoneNumber: selectedPayOption === 'OVO' ? ovoPhone.trim() : undefined,
          returnUrl,
        }),
      });

      const data = (await res.json()) as {
        transaction?: PaymentTransaction;
        instructions?: string;
        error?: string;
      };
      if (!res.ok || !data.transaction) {
        throw new Error(data.error || 'Gagal membuat tagihan pembayaran.');
      }

      setActivePayment({
        order: pendingOrder,
        transaction: data.transaction,
        instructions: data.instructions || 'Selesaikan pembayaran sesuai instruksi di bawah ini.',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghubungi layanan pembayaran.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOrSimulatePayment = async () => {
    if (!activePayment) return;
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payments/${encodeURIComponent(activePayment.transaction.id)}/simulate-pay`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const data = (await res.json()) as {
        verified?: boolean;
        transaction?: PaymentTransaction;
        error?: string;
      };
      if (!res.ok || !data.verified || !data.transaction) {
        throw new Error(data.error || 'Verifikasi webhook gagal.');
      }

      const finalized = finalizeQrOrderViaWebhook({
        tenantId: workspace.tenant.id,
        orderId: activePayment.order.id,
        gatewayRefId: data.transaction.gatewayRefId || data.transaction.id,
        mdrFee: data.transaction.gatewayMdrFee,
        paidAt: data.transaction.paidAt || new Date().toISOString(),
      });

      setPaidTxn(data.transaction);
      setPaidOrder(finalized ?? activePayment.order);
      setKitchenStatus('PENDING');
      setCart([]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckPaymentStatus = async () => {
    if (!activePayment) return;
    setCheckingStatus(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/payments/${encodeURIComponent(activePayment.transaction.id)}/check-status`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      );
      const json = (await res.json()) as { status?: string; transaction?: PaymentTransaction };
      if (json.status === 'PAID' && json.transaction) {
        setPaidTxn(json.transaction);
        setPaidOrder(activePayment.order);
      } else {
        setErrorMsg('Status masih MENUNGGU pembayaran. Silakan selesaikan pembayaran di aplikasi Anda.');
      }
    } catch {
      setErrorMsg('Gagal memeriksa status pembayaran.');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDownloadQrisImage = () => {
    const svgEl = qrContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QRIS-${activePayment?.order.orderNumber || 'pesanan'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyVa = async (va: string) => {
    try {
      await navigator.clipboard.writeText(va);
      setCopiedVa(true);
      window.setTimeout(() => setCopiedVa(false), 2000);
    } catch {
      setCopiedVa(true);
    }
  };

  const kitchenStepIdx =
    kitchenStatus === 'SERVED' || kitchenStatus === 'READY'
      ? 2
      : kitchenStatus === 'COOKING'
        ? 1
        : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28">
      {/* Compact Mobile-First Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              switchTenant(workspace.tenant.id);
              navigate('/dashboard');
            }}
            aria-label="Kembali ke Workspace"
            className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{workspace.tenant.name}</p>
            <p className="text-[11px] text-emerald-700 font-medium">
              QR Self-Order · Meja {table.tableNumber}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            switchTenant(workspace.tenant.id);
            navigate('/kitchen');
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
        >
          <ChefHat className="w-3.5 h-3.5" />
          <span>Dapur</span>
        </button>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-5 space-y-5">
        {/* Paid Status + Real-Time Kitchen Progress */}
        {paidTxn || paidOrder ? (
          <section
            data-testid="qr-order-paid-status"
            className="bg-white border border-emerald-200 rounded-2xl p-6 space-y-5"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Pembayaran Terverifikasi LUNAS!
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Pesanan{' '}
                  <span className="font-mono font-semibold">
                    {paidOrder?.orderNumber || paidTxn?.orderNumber}
                  </span>{' '}
                  untuk Meja {table.tableNumber} sudah masuk ke dapur &amp; tercatat otomatis di pembukuan.
                </p>
              </div>
            </div>

            {/* Live Kitchen Progress Stepper */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <ChefHat className="w-4 h-4 text-emerald-700" />
                Progres Pesanan Dapur (Real-Time)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {['Menunggu', 'Dimasak', 'Siap Saji'].map((label, idx) => {
                  const reached = idx <= kitchenStepIdx;
                  return (
                    <div
                      key={label}
                      className={`p-2.5 rounded-xl text-center border text-xs font-bold ${
                        reached
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-400 border-slate-200'
                      }`}
                    >
                      {idx + 1}. {label}
                    </div>
                  );
                })}
              </div>
            </div>

            {paidTxn && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Bukti Pelunasan Otomatis ({paidTxn.provider})</span>
                </p>
                <div className="flex justify-between text-slate-600">
                  <span>Metode</span>
                  <span className="font-bold text-slate-900">{paidTxn.channelCode}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Dibayar</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatRupiah(paidTxn.totalPayable)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Referensi Gateway</span>
                  <span className="font-mono text-[11px] text-slate-900">
                    {paidTxn.gatewayRefId || paidTxn.id}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  switchTenant(workspace.tenant.id);
                  navigate('/kitchen');
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Lihat Tiket di Kitchen Display
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaidOrder(null);
                  setPaidTxn(null);
                  setActivePayment(null);
                }}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Pesan Menu Tambahan
              </button>
            </div>
          </section>
        ) : activePayment ? (
          /* Mode 2 Smart Mobile Checkout Screen (App-to-App / OVO Push / Dynamic QRIS / VA) */
          <section
            data-testid="qr-mobile-payment-screen"
            className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 text-center"
          >
            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                {activePayment.transaction.channelCode} · Meja {table.tableNumber}
              </span>
              <h1 className="text-2xl font-extrabold font-mono text-slate-900">
                {formatRupiah(activePayment.transaction.totalPayable)}
              </h1>
              {Number(activePayment.transaction.customerAdminFee) > 0 && (
                <p className="text-[11px] text-amber-700">
                  Termasuk biaya layanan pembayaran {formatRupiah(activePayment.transaction.customerAdminFee)}
                </p>
              )}
              <p className="text-xs text-slate-500">{activePayment.instructions}</p>
            </div>

            {/* 2A. Direct App-to-App Deeplink (GoPay / ShopeePay / DANA) */}
            {activePayment.transaction.paymentCategory === 'EWALLET_DIRECT' &&
              activePayment.transaction.channelCode !== 'OVO' && (
                <div className="space-y-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5">
                  <Smartphone className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-700">
                    Tidak perlu screenshot! Klik tombol di bawah untuk langsung membuka aplikasi{' '}
                    <strong>{activePayment.transaction.channelCode}</strong> di HP Anda.
                  </p>
                  {activePayment.transaction.deeplinkUrl && (
                    <a
                      href={activePayment.transaction.deeplinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="mobile-deeplink-btn"
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800"
                    >
                      Buka Aplikasi &amp; Bayar Sekarang
                      <ExternalLink className="w-4 h-4 text-emerald-400" />
                    </a>
                  )}
                </div>
              )}

            {/* 2B. OVO Push-to-Pay 55s Countdown */}
            {activePayment.transaction.channelCode === 'OVO' && (
              <div className="space-y-3 bg-purple-50 border border-purple-200 rounded-2xl p-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold">
                  <Clock className="w-4 h-4" />
                  Sisa Waktu Konfirmasi OVO: {ovoCountdown} detik
                </div>
                <p className="text-xs text-purple-900">
                  Notifikasi pembayaran telah dikirim ke nomor OVO{' '}
                  <strong className="font-mono">{activePayment.transaction.ovoPhoneNumber}</strong>.
                  Buka aplikasi OVO Anda sekarang dan tekan <strong>Bayar</strong>.
                </p>
              </div>
            )}

            {/* 2C. Dynamic QRIS + Download QRIS Image */}
            {activePayment.transaction.paymentCategory === 'QRIS_DYNAMIC' && (
              <div className="space-y-3">
                <div
                  ref={qrContainerRef}
                  className="inline-flex p-4 bg-white border-2 border-slate-900 rounded-2xl"
                >
                  <QRCodeSVG
                    value={activePayment.transaction.qrString || 'QRIS'}
                    size={210}
                    level="M"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    data-testid="btn-download-qris"
                    onClick={handleDownloadQrisImage}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    Download / Simpan Gambar QRIS
                  </button>
                </div>
              </div>
            )}

            {/* 2D. Bank Virtual Account + 1-Klik Salin Nomor VA */}
            {activePayment.transaction.paymentCategory === 'VIRTUAL_ACCOUNT' && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  Nomor Virtual Account ({activePayment.transaction.channelCode.replace('VA_', '')})
                </p>
                <p
                  data-testid="mobile-va-number"
                  className="text-2xl font-extrabold font-mono tracking-wider text-slate-900 break-all"
                >
                  {activePayment.transaction.vaNumber}
                </p>
                <button
                  type="button"
                  data-testid="btn-copy-va"
                  onClick={() => void handleCopyVa(activePayment.transaction.vaNumber || '')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                >
                  {copiedVa ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" /> Nomor VA Tersalin!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> 1-Klik Salin Nomor VA
                    </>
                  )}
                </button>
              </div>
            )}

            {errorMsg && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                {errorMsg}
              </p>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                data-testid="mobile-simulate-paid-btn"
                disabled={loading}
                onClick={() => void handleConfirmOrSimulatePayment()}
                className="w-full py-3 px-4 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl transition-colors"
              >
                {loading
                  ? 'Memverifikasi Pembayaran...'
                  : 'Simulasi Bayar Lunas Sekarang (Webhook)'}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={checkingStatus}
                  onClick={() => void handleCheckPaymentStatus()}
                  className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                  Cek Status Pembayaran
                </button>
                <button
                  type="button"
                  onClick={() => setActivePayment(null)}
                  className="py-2 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl"
                >
                  Ganti Metode / Menu
                </button>
              </div>
            </div>
          </section>
        ) : (
          /* Mobile-First Menu Browsing + Smart Payment Method Selector */
          <>
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-base font-bold text-slate-900">Pesan Langsung dari Meja</h1>
                <span className="text-xs font-mono text-slate-500">Meja {table.tableNumber}</span>
              </div>
              <div>
                <label htmlFor="qr-customer-name" className="block text-xs text-slate-600 mb-1">
                  Nama Pemesan (Opsional)
                </label>
                <input
                  id="qr-customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={`Tamu Meja ${table.tableNumber}`}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </section>

            {/* Menu List */}
            <section className="space-y-3" aria-label="Daftar Menu">
              {menuItems.map((item) => {
                const inCart = cart.find((c) => c.product.id === item.id);
                return (
                  <article
                    key={item.id}
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
                  >
                    <div className="flex gap-3.5 p-3.5">
                      <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                        {item.imageUrl && !imgErrors[item.id] ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgErrors((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <UtensilsCrossed className="w-6 h-6" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900 leading-snug">
                            {item.name}
                          </h2>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        </div>

                        <div className="pt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-mono font-bold tabular-nums text-emerald-700">
                            {formatRupiah(item.sellingPrice)}
                          </span>

                          {inCart ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => changeQty(item.id, -1)}
                                aria-label={`Kurangi ${item.name}`}
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-700"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-mono font-bold tabular-nums w-5 text-center">
                                {inCart.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => changeQty(item.id, 1)}
                                aria-label={`Tambah ${item.name}`}
                                className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addItem(item)}
                              aria-label={`Pesan ${item.name}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {inCart && (
                      <div className="px-3.5 pb-3.5 pt-0">
                        <input
                          type="text"
                          value={inCart.notes}
                          onChange={(e) => updateNote(item.id, e.target.value)}
                          placeholder="Catatan khusus (misal: pedas sedang, tanpa acar)..."
                          aria-label={`Catatan untuk ${item.name}`}
                          className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            {/* Smart Payment Selector for Mobile Guests (when cart has items) */}
            {cart.length > 0 && (
              <section
                data-testid="mobile-payment-method-picker"
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4"
              >
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Pilih Metode Pembayaran Langsung dari HP
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Bisa langsung buka aplikasi GoPay/ShopeePay/DANA, Push OVO, QRIS, atau Virtual Account.
                  </p>
                </div>

                {/* Direct E-Wallet App-to-App */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-slate-600 uppercase">
                    1. Bayar Langsung via Aplikasi (Tanpa Scan QR)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {DIRECT_WALLETS.map((w) => {
                      const active = selectedPayOption === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          data-testid={`mobile-opt-${w.id}`}
                          onClick={() => setSelectedPayOption(w.id)}
                          className={`text-left p-3 rounded-xl border-2 transition-all ${
                            active
                              ? 'border-emerald-600 bg-emerald-50/70'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-900">{w.label}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {w.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">{w.desc}</p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedPayOption === 'OVO' && (
                    <div className="pt-1">
                      <label className="block text-xs font-bold text-purple-900 mb-1">
                        Nomor HP Terdaftar di OVO
                      </label>
                      <input
                        type="tel"
                        value={ovoPhone}
                        onChange={(e) => setOvoPhone(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-3 py-2 rounded-xl border border-purple-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                  )}
                </div>

                {/* Dynamic QRIS */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 uppercase">
                    2. QRIS Dinamis (Simpan Gambar / Scan m-Banking)
                  </p>
                  <button
                    type="button"
                    data-testid="mobile-opt-QRIS"
                    onClick={() => setSelectedPayOption('QRIS')}
                    className={`w-full text-left p-3 rounded-xl border-2 flex items-center justify-between ${
                      selectedPayOption === 'QRIS'
                        ? 'border-emerald-600 bg-emerald-50/70'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <QrCode className="w-5 h-5 text-emerald-700" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">QRIS Dinamis Semua Bank</p>
                        <p className="text-[10px] text-slate-500">
                          Bisa download gambar QR lalu unggah dari galeri m-Banking
                        </p>
                      </div>
                    </div>
                    {selectedPayOption === 'QRIS' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                </div>

                {/* Virtual Account Banks */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-600 uppercase">
                    3. Transfer Virtual Account Bank (1-Klik Salin)
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {VA_BANKS.map((bank) => {
                      const active = selectedPayOption === bank.id;
                      return (
                        <button
                          key={bank.id}
                          type="button"
                          data-testid={`mobile-opt-${bank.id}`}
                          onClick={() => setSelectedPayOption(bank.id)}
                          className={`py-2 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1 ${
                            active
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <CreditCard className="w-3 h-3" />
                          <span>{bank.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                    {errorMsg}
                  </p>
                )}
              </section>
            )}

            {/* 0-Token SQL Smart Upselling */}
            {upsellSuggestions.length > 0 && (
              <section
                data-testid="qr-smart-upsell-section"
                className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3"
              >
                <div>
                  <h2 className="text-xs font-bold text-emerald-950">Sering Dipesan Bersama</h2>
                  <p className="text-[11px] text-emerald-800">
                    Rekomendasi otomatis berdasarkan riwayat pesanan tamu lainnya.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {upsellSuggestions.map((s) => (
                    <div
                      key={s.product.id}
                      className="bg-white border border-emerald-200/80 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {s.product.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {s.reason} ·{' '}
                          <span className="font-mono font-semibold text-emerald-700">
                            {formatRupiah(s.product.sellingPrice)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItem(s.product)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shrink-0 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky Bottom Checkout Bar */}
      {!activePayment && !paidTxn && !paidOrder && cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 px-4 py-3">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">
                {cart.reduce((s, c) => s + c.qty, 0)} item · {selectedPayOption}
              </p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900">
                {formatRupiah(totals.grandTotal)}
              </p>
            </div>
            <button
              type="button"
              data-testid="mobile-checkout-submit-btn"
              disabled={loading}
              onClick={() => void handleCreateMobilePayment()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              <span>{loading ? 'Memproses...' : `Bayar (${selectedPayOption})`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
