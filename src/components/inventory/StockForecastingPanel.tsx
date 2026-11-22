import React, { useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  PackageCheck,
  Send,
  ShoppingCart,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  buildPurchaseOrder,
  computeStockForecastReport,
  type ForecastUrgency,
  type StockForecastRecommendation,
} from '../../lib/inventory/stock-forecasting';
import { processUploadedImageFile } from '../../lib/catalog/image-upload';
import { downloadPurchaseOrderPdf } from '../../lib/pdf/po-pdf-generator';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { tenantHasAddOn } from '../../lib/saas/hybrid-pricing';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ModalShell } from '../ui/ModalShell';
import { ShoppingNotePanel } from './ShoppingNotePanel';
import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/domain';

interface StockForecastingPanelProps {
  compact?: boolean;
  hidePoHistory?: boolean;
  onNotify?: (msg: string) => void;
}

const URGENCY_LABELS: Record<ForecastUrgency, { label: string; className: string }> = {
  URGENT: { label: 'Kritis / Segera', className: 'text-rose-700 font-semibold' },
  SOON: { label: 'Perlu Restok', className: 'text-amber-700 font-semibold' },
  HEALTHY: { label: 'Stok Aman', className: 'text-emerald-700 font-medium' },
};

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draf', className: 'text-slate-600 font-medium' },
  SENT: { label: 'Dikirim ke Supplier', className: 'text-amber-700 font-semibold' },
  ORDERED: { label: 'Dipesan', className: 'text-amber-700 font-semibold' },
  PARTIAL: { label: 'Diterima Sebagian', className: 'text-sky-700 font-semibold' },
  RECEIVED: { label: 'Diterima & Masuk Stok', className: 'text-emerald-700 font-semibold' },
  CANCELLED: { label: 'Dibatalkan', className: 'text-rose-600 font-medium' },
};

export function StockForecastingPanel({
  compact = false,
  hidePoHistory = false,
  onNotify,
}: StockForecastingPanelProps) {
  const {
    activeWorkspace,
    session,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrderToStock,
  } = useApp();

  const hasPoModule = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_PURCHASE_ORDER');

  const [lookbackDays, setLookbackDays] = useState<number>(30);
  const [leadTimeDays] = useState<number>(3);
  const [targetCoverDays, setTargetCoverDays] = useState<number>(14);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  // PO Creation Modal state
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierName, setPoSupplierName] = useState('Agen Grosir Sembako Utama');
  const [poSupplierPhone, setPoSupplierPhone] = useState('0812-9900-4411');
  const [poExpectedDate, setPoExpectedDate] = useState(() => {
    const d = new Date(Date.now() + 3 * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const [poNotes, setPoNotes] = useState(
    'Order restok otomatis berdasarkan analisis kecepatan penjualan.'
  );
  const [poDraftLines, setPoDraftLines] = useState<
    Array<{
      forecast: StockForecastRecommendation;
      qty: string;
      unitCost: string;
    }>
  >([]);

  // PO Preview & Print Modal
  const [previewPo, setPreviewPo] = useState<PurchaseOrder | null>(null);

  // Receive PO to Stock Modal
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [receivePayAcc, setReceivePayAcc] = useState<'1101' | '1102' | '2101'>('1102');
  const [receiveReceiptNo, setReceiveReceiptNo] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveReceiptImg, setReceiveReceiptImg] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  const report = useMemo(
    () =>
      computeStockForecastReport({
        products: activeWorkspace.products,
        orders: activeWorkspace.orders,
        inventoryMovements: activeWorkspace.inventoryMovements,
        config: {
          lookbackDays,
          leadTimeDays,
          targetCoverDays,
        },
      }),
    [
      activeWorkspace.inventoryMovements,
      activeWorkspace.orders,
      activeWorkspace.products,
      leadTimeDays,
      lookbackDays,
      targetCoverDays,
    ]
  );

  const purchaseOrders = activeWorkspace.purchaseOrders ?? [];

  const notify = (msg: string) => {
    setLocalNotice(msg);
    onNotify?.(msg);
    window.setTimeout(() => setLocalNotice(null), 5000);
  };

  const handleDownloadPoPdf = (po: PurchaseOrder) => {
    const branchName = activeWorkspace.branches?.find((b) => b.id === po.branchId)?.name;
    const filename = downloadPurchaseOrderPdf({
      po,
      tenant: activeWorkspace.tenant,
      branchName,
    });
    notify(`Dokumen PDF "${filename}" berhasil diunduh.`);
  };

  const openPoBuilder = (selectedItems: StockForecastRecommendation[]) => {
    const valid = selectedItems.filter((item) => new Decimal(item.recommendedOrderQty).gt(0));
    const list =
      valid.length > 0
        ? valid
        : selectedItems.map((item) => ({
            ...item,
            recommendedOrderQty: Decimal.max(
              new Decimal(5),
              new Decimal(item.minStockAlert || '5')
            ).toFixed(0),
          }));
    if (list.length === 0) return;

    setPoDraftLines(
      list.map((item) => ({
        forecast: item,
        qty: String(Math.max(1, Math.ceil(Number(item.recommendedOrderQty) || 5))),
        unitCost: new Decimal(item.product.costPriceAvg || '0').toFixed(0),
      }))
    );
    setPoModalOpen(true);
  };

  const handleSavePurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const activeLines = poDraftLines.filter((l) => Number(l.qty) > 0);
    if (activeLines.length === 0) return;

    const po = buildPurchaseOrder({
      tenantId: activeWorkspace.tenant.id,
      poSeq: purchaseOrders.length + 1,
      supplierName: poSupplierName,
      supplierPhone: poSupplierPhone,
      expectedDeliveryDate: poExpectedDate,
      notes: poNotes,
      createdByName: session.fullName || 'Pemilik Usaha',
      items: activeLines.map((l) => ({
        productId: l.forecast.product.id,
        productName: l.forecast.product.name,
        sku: l.forecast.product.sku,
        unit: l.forecast.product.unit,
        orderedQty: l.qty,
        unitCostEstimate: l.unitCost,
        dailyVelocitySnapshot: l.forecast.dailyVelocity,
        daysOfCoverSnapshot:
          l.forecast.daysOfCover !== null ? String(l.forecast.daysOfCover) : undefined,
      })),
    });

    createPurchaseOrder(po);
    setPoModalOpen(false);
    setPreviewPo(po);
    notify(
      `Purchase Order ${po.poNumber} (${po.items.length} item · ${formatRupiah(po.totalEstimatedCost)}) berhasil dibuat dan disimpan ke database.`
    );
  };

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    try {
      const dataUrl = await processUploadedImageFile(file);
      setReceiveReceiptImg(dataUrl);
    } catch {
      // ignore invalid image
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  const handleConfirmReceivePo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivePo) return;
    const res = receivePurchaseOrderToStock({
      poId: receivePo.id,
      paymentAccountCode: receivePayAcc,
      receiptNumber: receiveReceiptNo.trim() || receivePo.poNumber,
      receiptImageUrl: receiveReceiptImg || undefined,
      notes: receiveNotes.trim() || `Barang diterima sesuai ${receivePo.poNumber}`,
    });
    const poNo = receivePo.poNumber;
    setReceivePo(null);
    setReceiveReceiptNo('');
    setReceiveNotes('');
    setReceiveReceiptImg('');
    notify(
      `PO ${poNo} diterima: ${res.itemCount} item masuk stok, HPP Moving Average & jurnal pembelian (${formatRupiah(res.totalPurchaseValue)}) tercatat otomatis.`
    );
  };

  const poDraftTotal = useMemo(() => {
    return poDraftLines.reduce((sum, l) => {
      const q = new Decimal(l.qty || '0');
      const c = new Decimal(l.unitCost || '0');
      return sum.plus(q.times(c));
    }, new Decimal(0));
  }, [poDraftLines]);

  const forecastColumns: DataTableColumn<StockForecastRecommendation>[] = [
    {
      key: 'product',
      header: 'Produk & SKU',
      render: (item) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{item.product.name}</p>
          <p className="text-xs text-slate-500 font-mono">
            {item.product.sku} · Min. {Number(item.minStockAlert)} {item.product.unit}
          </p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stok Saat Ini',
      align: 'right',
      render: (item) => (
        <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
          {Number(item.currentStock)} {item.product.unit}
        </span>
      ),
    },
    {
      key: 'velocity',
      header: 'Kecepatan Jual',
      align: 'right',
      render: (item) => (
        <div className="text-right">
          <p className="font-mono tabular-nums text-xs font-semibold text-slate-900">
            {new Decimal(item.dailyVelocity).toFixed(2)} {item.product.unit}/hari
          </p>
          <p className="text-[11px] text-slate-500">
            Terjual {Number(item.soldInWindow)} ({lookbackDays}h)
          </p>
        </div>
      ),
    },
    {
      key: 'cover',
      header: 'Estimasi Habis',
      align: 'right',
      render: (item) => (
        <span className="font-mono tabular-nums text-xs text-slate-800">
          {item.daysOfCover !== null ? `${item.daysOfCover} hari` : 'Stabil'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className={`text-xs whitespace-nowrap ${URGENCY_LABELS[item.urgency].className}`}>
          {URGENCY_LABELS[item.urgency].label}
        </span>
      ),
    },
    {
      key: 'recommend',
      header: 'Saran Restok',
      align: 'right',
      render: (item) => (
        <div className="text-right">
          <p className="font-mono tabular-nums text-xs font-bold text-emerald-700">
            {Number(item.recommendedOrderQty) > 0
              ? `+${Number(item.recommendedOrderQty)} ${item.product.unit}`
              : '0'}
          </p>
          {Number(item.recommendedOrderQty) > 0 && (
            <p className="font-mono tabular-nums text-[11px] text-slate-500">
              {formatRupiah(item.estimatedOrderCost)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <button
          type="button"
          data-testid={`forecast-create-po-${item.product.id}`}
          onClick={() => openPoBuilder([item])}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Buat PO</span>
        </button>
      ),
    },
  ];

  const poColumns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: 'poNumber',
      header: 'No. PO & Tanggal',
      render: (po) => (
        <div>
          <p className="font-mono text-xs font-semibold text-slate-900">{po.poNumber}</p>
          <p className="text-[11px] text-slate-500">
            Order {po.orderDate}
            {po.expectedDeliveryDate ? ` · Est. Tiba ${po.expectedDeliveryDate}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (po) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{po.supplierName}</p>
          <p className="text-xs text-slate-500">{po.items.length} item produk</p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Estimasi Nilai PO',
      align: 'right',
      render: (po) => (
        <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
          {formatRupiah(po.totalEstimatedCost)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (po) => (
        <span className={`text-xs whitespace-nowrap ${PO_STATUS_LABELS[po.status].className}`}>
          {PO_STATUS_LABELS[po.status].label}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (po) => (
        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
          <button
            type="button"
            data-testid={`forecast-download-po-pdf-${po.id}`}
            onClick={() => handleDownloadPoPdf(po)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh PDF</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewPo(po)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Lihat PO</span>
          </button>
          {po.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => {
                updatePurchaseOrderStatus(po.id, 'SENT');
                notify(`PO ${po.poNumber} ditandai sudah dikirim ke supplier.`);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim</span>
            </button>
          )}
          {(po.status === 'DRAFT' || po.status === 'SENT') && (
            <button
              type="button"
              data-testid={`receive-po-btn-${po.id}`}
              onClick={() => {
                setReceivePo(po);
                setReceiveReceiptNo(po.poNumber);
                setReceiveNotes('');
                setReceiveReceiptImg('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Terima Barang</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  const restockableCount = report.actionableRecommendations.length;

  // Tenants without Purchase Order add-on (e.g. Paket LITE, Paket BASIC without PO)
  // get a clean, practical Printable Shopping Note instead of PO Generator & PO buttons.
  if (!hasPoModule) {
    return <ShoppingNotePanel compact={compact} onNotify={onNotify} />;
  }

  return (
    <section
      data-testid="stock-forecasting-panel"
      aria-label="Forecasting Stok & Purchase Order"
      className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">
              Forecasting Restok &amp; Generator Purchase Order (PO)
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Perhitungan statistik kecepatan penjualan historis (100% mesin lokal tanpa token AI) ·
            Lead Time {leadTimeDays} hari · Target Stok {targetCoverDays} hari.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Periode Analisis Penjualan"
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value={14}>Histori 14 Hari</option>
            <option value={30}>Histori 30 Hari</option>
            <option value={60}>Histori 60 Hari</option>
          </select>
          <select
            aria-label="Target Stok Hari"
            value={targetCoverDays}
            onChange={(e) => setTargetCoverDays(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value={7}>Target Stok 7 Hari</option>
            <option value={14}>Target Stok 14 Hari</option>
            <option value={21}>Target Stok 21 Hari</option>
            <option value={30}>Target Stok 30 Hari</option>
          </select>
          <button
            type="button"
            data-testid="forecast-generate-po-btn"
            disabled={restockableCount === 0}
            onClick={() => openPoBuilder(report.actionableRecommendations)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Buat PO Rekomendasi ({restockableCount} Item)</span>
          </button>
        </div>
      </div>

      {localNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{localNotice}</span>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Perlu Restok (Kritis / Segera)</p>
          <p className="text-lg font-bold font-mono tabular-nums text-rose-700 mt-1">
            {report.counts.urgent + report.counts.soon} item
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Total Item Disarankan PO</p>
          <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {restockableCount} / {report.counts.totalTracked} SKU
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Estimasi Anggaran Restok</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatRupiah(report.totalEstimatedPoValue)}
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3.5">
          <p className="text-[11px] text-slate-500">Purchase Order Tercatat</p>
          <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {purchaseOrders.length} PO
          </p>
        </div>
      </div>

      {/* Statistical Forecasting Recommendations DataTable */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Analisis Kecepatan Penjualan &amp; Rekomendasi Restok
          </h3>
          <span className="text-[11px] text-slate-500">
            Rumus: Weighted Velocity (60% 7-hari + 40% {lookbackDays}-hari) + Safety Stock 25%
          </span>
        </div>
        <DataTable
          data={report.recommendations}
          columns={forecastColumns}
          getRowKey={(item) => item.product.id}
          defaultPageSize={compact ? 5 : 10}
          searchable
          searchPlaceholder="Cari produk atau SKU untuk analisis restok..."
          searchFn={(item, q) =>
            item.product.name.toLowerCase().includes(q) ||
            item.product.sku.toLowerCase().includes(q)
          }
          exportFilename="rekomendasi-restok-po"
          testId="datatable-stock-forecast"
          emptyState="Belum ada produk yang dapat dianalisis."
        />
      </div>

      {/* Purchase Orders History DataTable */}
      {!hidePoHistory && purchaseOrders.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Daftar Purchase Order (PO)</h3>
            <span className="text-[11px] text-slate-500">
              Klik &quot;Terima Barang&quot; untuk memasukkan stok &amp; mencatat jurnal kulakan otomatis
            </span>
          </div>
          <DataTable
            data={purchaseOrders}
            columns={poColumns}
            getRowKey={(po) => po.id}
            defaultPageSize={5}
            testId="datatable-purchase-orders"
            emptyState="Belum ada Purchase Order."
          />
        </div>
      )}

      {/* Modal 1: Build Purchase Order (PO) */}
      <ModalShell
        open={poModalOpen}
        onClose={() => setPoModalOpen(false)}
        headerId="po-builder-modal-header"
        testId="po-builder-modal"
        title="Buat Purchase Order (PO) Baru"
        subtitle="Sesuaikan supplier dan kuantitas order dari hasil rekomendasi forecasting statistik."
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSavePurchaseOrder} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Supplier / Agen Grosir
              </label>
              <input
                type="text"
                required
                value={poSupplierName}
                onChange={(e) => setPoSupplierName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                No. WhatsApp / Telepon Supplier
              </label>
              <input
                type="text"
                value={poSupplierPhone}
                onChange={(e) => setPoSupplierPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Estimasi Tanggal Tiba
              </label>
              <input
                type="date"
                value={poExpectedDate}
                onChange={(e) => setPoExpectedDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Produk</th>
                  <th className="py-2.5 px-3 text-right">Stok</th>
                  <th className="py-2.5 px-3 text-right w-28">Qty Order</th>
                  <th className="py-2.5 px-3 text-right w-36">Est. Harga Beli</th>
                  <th className="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {poDraftLines.map((line, idx) => {
                  const sub = new Decimal(line.qty || '0').times(new Decimal(line.unitCost || '0'));
                  return (
                    <tr key={line.forecast.product.id}>
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-slate-900">{line.forecast.product.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Vel: {new Decimal(line.forecast.dailyVelocity).toFixed(2)}/hari · Saran:{' '}
                          {Number(line.forecast.recommendedOrderQty)} {line.forecast.product.unit}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {Number(line.forecast.currentStock)} {line.forecast.product.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.qty}
                          onChange={(e) =>
                            setPoDraftLines((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, qty: e.target.value } : item
                              )
                            )
                          }
                          className="w-20 px-2 py-1 text-right font-mono border border-slate-200 rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={line.unitCost}
                          onChange={(e) =>
                            setPoDraftLines((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, unitCost: e.target.value } : item
                              )
                            )
                          }
                          className="w-28 px-2 py-1 text-right font-mono border border-slate-200 rounded"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatRupiah(sub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td colSpan={4} className="py-2.5 px-3 text-right font-semibold text-slate-700">
                    Total Estimasi Purchase Order
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                    {formatRupiah(poDraftTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Catatan untuk Supplier
            </label>
            <input
              type="text"
              value={poNotes}
              onChange={(e) => setPoNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPoModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="po-save-submit-btn"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Simpan Purchase Order (PO)</span>
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Modal 2: Printable Purchase Order Preview */}
      <ModalShell
        open={Boolean(previewPo)}
        onClose={() => setPreviewPo(null)}
        headerId="po-preview-modal-header"
        testId="po-preview-modal"
        title={previewPo ? `Dokumen Purchase Order — ${previewPo.poNumber}` : 'Dokumen PO'}
        subtitle={previewPo ? `Supplier: ${previewPo.supplierName}` : undefined}
        maxWidthClass="max-w-2xl"
        footer={
          previewPo ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                data-testid="po-preview-download-pdf-btn"
                onClick={() => handleDownloadPoPdf(previewPo)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Dokumen PO (.pdf)</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewPo(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Tutup
              </button>
            </div>
          ) : null
        }
      >
        {previewPo && (
          <div className="px-6 py-5">
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    Purchase Order (PO)
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {activeWorkspace.tenant.name}
                  </h3>
                  <p className="text-xs text-slate-600">{activeWorkspace.tenant.address}</p>
                </div>
                <div className="text-right font-mono text-xs">
                  <p className="font-bold text-slate-900">{previewPo.poNumber}</p>
                  <p className="text-slate-500">Tanggal: {previewPo.orderDate}</p>
                  <p className={PO_STATUS_LABELS[previewPo.status].className}>
                    {PO_STATUS_LABELS[previewPo.status].label}
                  </p>
                </div>
              </div>

              <div className="text-xs grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-500">Kepada Supplier:</p>
                  <p className="font-semibold text-slate-900">{previewPo.supplierName}</p>
                  {previewPo.supplierPhone && (
                    <p className="text-slate-600">{previewPo.supplierPhone}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-slate-500">Estimasi Pengiriman:</p>
                  <p className="font-semibold text-slate-900">
                    {previewPo.expectedDeliveryDate || '-'}
                  </p>
                  <p className="text-slate-600">Dibuat oleh: {previewPo.createdByName || '-'}</p>
                </div>
              </div>

              <table className="w-full text-left text-xs border-t border-b border-slate-200">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Produk</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Est. Harga</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewPo.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-slate-900">{item.productNameSnapshot}</p>
                        <p className="text-[11px] font-mono text-slate-500">{item.skuSnapshot}</p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {Number(item.orderedQty)} {item.unitSnapshot}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {formatRupiah(item.unitCostEstimate ?? item.unitCost ?? '0')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                        {formatRupiah(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between text-sm font-bold">
                <span>Total Estimasi PO</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatRupiah(previewPo.totalEstimatedCost)}
                </span>
              </div>

              {previewPo.notes && (
                <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
                  Catatan: {previewPo.notes}
                </p>
              )}
            </div>
          </div>
        )}
      </ModalShell>

      {/* Modal 3: Receive PO Into Stock (Atomic Moving Average + Purchase Journal + Receipt Upload) */}
      <ModalShell
        open={Boolean(receivePo)}
        onClose={() => setReceivePo(null)}
        headerId="po-receive-modal-header"
        testId="po-receive-modal"
        title={receivePo ? `Terima Barang & Masuk Stok — ${receivePo.poNumber}` : 'Terima Barang PO'}
        subtitle="Stok bertambah otomatis, HPP Moving Average dihitung ulang, dan jurnal pembelian dibukukan."
        maxWidthClass="max-w-lg"
      >
        {receivePo && (
          <form onSubmit={handleConfirmReceivePo} className="px-6 py-5 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Supplier</span>
                <span className="font-semibold text-slate-900">{receivePo.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Jumlah Item</span>
                <span className="font-mono font-semibold text-slate-900">
                  {receivePo.items.length} produk
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pembelian</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatRupiah(receivePo.totalEstimatedCost)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sumber Pembayaran (Jurnal Kredit)
              </label>
              <select
                value={receivePayAcc}
                onChange={(e) => setReceivePayAcc(e.target.value as '1101' | '1102' | '2101')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="1101">1101 — Kas Tunai</option>
                <option value="1102">1102 — Bank / Transfer</option>
                <option value="2101">2101 — Utang Usaha / Tempo Supplier</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                No. Nota / Faktur Pembelian Supplier
              </label>
              <input
                type="text"
                value={receiveReceiptNo}
                onChange={(e) => setReceiveReceiptNo(e.target.value)}
                placeholder="Contoh: FKT-GROSIR-092"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  Foto Nota Bukti Pembelian (Opsional · Cross-Check &amp; Pajak)
                </span>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProofUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingProof}
                  onClick={() => proofInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingProof ? 'Memproses...' : 'Unggah Nota'}</span>
                </button>
              </div>
              {receiveReceiptImg && (
                <div className="relative inline-block">
                  <img
                    src={receiveReceiptImg}
                    alt="Nota PO"
                    className="h-24 rounded border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiveReceiptImg('')}
                    className="absolute -top-2 -right-2 p-1 bg-rose-600 text-white rounded-full"
                    aria-label="Hapus foto nota"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Catatan Penerimaan
              </label>
              <input
                type="text"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Barang lengkap & kondisi baik"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReceivePo(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="po-confirm-receive-btn"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Konfirmasi Terima &amp; Posting Jurnal</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </section>
  );
}
