import React, { useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Edit3,
  Eye,
  FileText,
  Plus,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { processUploadedImageFile } from '../../lib/catalog/image-upload';
import { isValidProductImageSource } from '../../lib/catalog/recipe-bom-utils';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ModalShell, ReceiptPreviewModal } from '../ui/ModalShell';
import type { InventoryMovement, Product } from '../../types/domain';

interface RawMaterialStockManagerProps {
  mode: 'FB_RAW_MATERIALS' | 'RETAIL_PROCUREMENT';
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
}

export function RawMaterialStockManager({
  mode,
  onNotify,
  onError,
}: RawMaterialStockManagerProps) {
  const {
    activeWorkspace,
    navigate,
    addProduct,
    updateProduct,
    deleteProduct,
    restockInventoryItem,
    adjustInventoryStock,
  } = useApp();

  const isRetailMode = mode === 'RETAIL_PROCUREMENT';

  const managedItems = useMemo(() => {
    if (isRetailMode) {
      return activeWorkspace.products.filter((p) => p.itemType === 'RETAIL_GOODS');
    }
    return activeWorkspace.products.filter((p) => p.itemType === 'RAW_MATERIAL');
  }, [activeWorkspace.products, isRetailMode]);

  const productMap = useMemo(
    () => new Map(activeWorkspace.products.map((p) => [p.id, p])),
    [activeWorkspace.products]
  );

  const purchaseHistory = useMemo(
    () =>
      activeWorkspace.inventoryMovements.filter((m) => m.movementType === 'IN_PURCHASE'),
    [activeWorkspace.inventoryMovements]
  );

  const totalInventoryValue = useMemo(() => {
    return managedItems.reduce((sum, item) => {
      const val = new Decimal(item.stockQty || '0').times(new Decimal(item.costPriceAvg || '0'));
      return sum.plus(val);
    }, new Decimal(0));
  }, [managedItems]);

  const lowStockCount = useMemo(() => {
    return managedItems.filter((item) =>
      new Decimal(item.stockQty || '0').lte(new Decimal(item.minStockAlert || '0'))
    ).length;
  }, [managedItems]);

  const receiptsAttachedCount = useMemo(
    () => purchaseHistory.filter((m) => Boolean(m.receiptImageUrl)).length,
    [purchaseHistory]
  );

  // Create / Edit Raw Material form (F&B mode)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rawName, setRawName] = useState('');
  const [rawUnit, setRawUnit] = useState('kg');
  const [rawCost, setRawCost] = useState('');
  const [rawStock, setRawStock] = useState('10');
  const [rawMinStock, setRawMinStock] = useState('2');

  // Modal Restock state + Receipt upload
  const receiptFileRef = useRef<HTMLInputElement | null>(null);
  const [restockTargetId, setRestockTargetId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockUnitCost, setRestockUnitCost] = useState('');
  const [restockPayAcc, setRestockPayAcc] = useState<'1101' | '1102' | '2101'>('1101');
  const [restockSupplier, setRestockSupplier] = useState('');
  const [restockReceiptNo, setRestockReceiptNo] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [restockReceiptImage, setRestockReceiptImage] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Modal Opname state
  const [opnameTargetId, setOpnameTargetId] = useState<string | null>(null);
  const [opnameActualQty, setOpnameActualQty] = useState('');
  const [opnameNotes, setOpnameNotes] = useState('');

  // Receipt Preview Modal state
  const [previewReceipt, setPreviewReceipt] = useState<{
    imageUrl: string;
    title: string;
    amountLabel?: string;
    receiptNumber?: string;
    supplierName?: string;
  } | null>(null);

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resetRawForm = () => {
    setEditingId(null);
    setRawName('');
    setRawUnit('kg');
    setRawCost('');
    setRawStock('10');
    setRawMinStock('2');
  };

  const handleSaveRawMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawName.trim()) {
      onError('Nama bahan mentah wajib diisi.');
      return;
    }
    const costDec = new Decimal(rawCost || '0');
    if (costDec.lt(0)) {
      onError('Harga beli per satuan tidak boleh negatif.');
      return;
    }

    const payload = {
      categoryId: null,
      sku: `RAW-${Date.now().toString().slice(-4)}`,
      barcodeQr: '',
      name: rawName.trim(),
      description: 'Bahan baku dapur untuk formulasi resep BOM.',
      itemType: 'RAW_MATERIAL' as const,
      unit: rawUnit.trim() || 'kg',
      sellingPrice: '0.0000',
      costPriceAvg: costDec.toFixed(4),
      stockQty: new Decimal(rawStock || '0').toFixed(4),
      minStockAlert: new Decimal(rawMinStock || '2').toFixed(4),
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
    };

    if (editingId) {
      updateProduct(editingId, payload);
      onNotify(
        `Bahan mentah "${payload.name}" diperbarui. HPP resep BOM yang menggunakan bahan ini otomatis tersinkron.`
      );
    } else {
      addProduct(payload);
      onNotify(
        `Bahan mentah "${payload.name}" ditambahkan ke gudang dapur. Lanjut ke menu Resep BOM untuk meracik menu.`
      );
    }
    resetRawForm();
  };

  const handleEditRaw = (item: Product) => {
    setEditingId(item.id);
    setRawName(item.name);
    setRawUnit(item.unit);
    setRawCost(new Decimal(item.costPriceAvg || '0').toFixed(0));
    setRawStock(new Decimal(item.stockQty || '0').toFixed(2));
    setRawMinStock(new Decimal(item.minStockAlert || '2').toFixed(2));
  };

  const handleUploadRestockReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const dataUrl = await processUploadedImageFile(file);
      setRestockReceiptImage(dataUrl);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal memproses foto nota pembelian.');
    } finally {
      setUploadingReceipt(false);
      if (receiptFileRef.current) receiptFileRef.current.value = '';
    }
  };

  const handleSubmitRestock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTargetId) return;
    const qtyDec = new Decimal(restockQty || '0');
    if (qtyDec.lte(0)) {
      onError('Jumlah pembelian / restock harus lebih dari 0.');
      return;
    }
    try {
      const res = restockInventoryItem({
        productId: restockTargetId,
        addedQty: qtyDec.toFixed(4),
        unitPurchaseCost: new Decimal(restockUnitCost || '0').toFixed(4),
        paymentAccountCode: restockPayAcc,
        notes: restockNotes,
        supplierName: restockSupplier,
        receiptNumber: restockReceiptNo,
        receiptImageUrl: restockReceiptImage || undefined,
      });
      const target = activeWorkspace.products.find((p) => p.id === restockTargetId);
      onNotify(
        `Restock ${target?.name ?? ''} berhasil (+${qtyDec.toFixed(2)} ${target?.unit ?? ''}). HPP Rata-Rata baru: ${formatRupiah(res.newAvgCost)} & Jurnal Pembelian (${formatRupiah(res.totalPurchaseValue)}) otomatis diposting${
          restockReceiptImage ? ' beserta bukti nota' : ''
        }.`
      );
      setRestockTargetId(null);
      setRestockQty('');
      setRestockUnitCost('');
      setRestockSupplier('');
      setRestockReceiptNo('');
      setRestockNotes('');
      setRestockReceiptImage('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal memproses restock.');
    }
  };

  const handleSubmitOpname = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opnameTargetId) return;
    adjustInventoryStock({
      productId: opnameTargetId,
      actualStockQty: new Decimal(opnameActualQty || '0').toFixed(4),
      notes: opnameNotes,
    });
    const target = activeWorkspace.products.find((p) => p.id === opnameTargetId);
    onNotify(
      `Stock opname "${target?.name ?? ''}" tersimpan. Jurnal penyesuaian persediaan otomatis diposting.`
    );
    setOpnameTargetId(null);
    setOpnameActualQty('');
    setOpnameNotes('');
  };

  const restockTarget = restockTargetId
    ? activeWorkspace.products.find((p) => p.id === restockTargetId) ?? null
    : null;
  const opnameTarget = opnameTargetId
    ? activeWorkspace.products.find((p) => p.id === opnameTargetId) ?? null
    : null;

  const stockColumns: DataTableColumn<Product>[] = [
    {
      key: 'name',
      header: isRetailMode ? 'Barang Dagangan' : 'Bahan Mentah',
      sortValue: (item) => item.name,
      csvHeader: 'Nama Barang',
      csvValue: (item) => `${item.name} (${item.sku})`,
      render: (item) => {
        const qtyDec = new Decimal(item.stockQty || '0');
        const isLow = qtyDec.lte(new Decimal(item.minStockAlert || '0'));
        const metaLine = [item.productType, item.brand, item.sizeLabel].filter(Boolean).join(' · ');
        return (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{item.name}</span>
              {isLow && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Stok Menipis</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              <span className="font-mono">{item.sku}</span>
              {metaLine && ` · ${metaLine}`}
            </p>
          </div>
        );
      },
    },
    {
      key: 'stock',
      header: 'Sisa Stok',
      align: 'right',
      sortValue: (item) => Number(item.stockQty || 0),
      csvHeader: 'Sisa Stok',
      csvValue: (item) => `${new Decimal(item.stockQty || '0').toFixed(2)} ${item.unit}`,
      render: (item) => {
        const qtyDec = new Decimal(item.stockQty || '0');
        const isLow = qtyDec.lte(new Decimal(item.minStockAlert || '0'));
        return (
          <span
            className={`font-mono font-bold tabular-nums whitespace-nowrap ${
              isLow ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {qtyDec.toFixed(2)} {item.unit}
          </span>
        );
      },
    },
    {
      key: 'cost',
      header: 'HPP Moving Avg',
      align: 'right',
      sortValue: (item) => Number(item.costPriceAvg || 0),
      csvHeader: 'HPP Moving Avg (Rp)',
      csvValue: (item) => new Decimal(item.costPriceAvg || '0').toFixed(2),
      render: (item) => (
        <span className="font-mono tabular-nums text-slate-700 whitespace-nowrap">
          {formatRupiah(item.costPriceAvg)}/{item.unit}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Nilai Persediaan',
      align: 'right',
      sortValue: (item) =>
        new Decimal(item.stockQty || '0').times(new Decimal(item.costPriceAvg || '0')).toNumber(),
      csvHeader: 'Nilai Persediaan (Rp)',
      csvValue: (item) =>
        new Decimal(item.stockQty || '0').times(new Decimal(item.costPriceAvg || '0')).toFixed(2),
      render: (item) => {
        const val = new Decimal(item.stockQty || '0').times(new Decimal(item.costPriceAvg || '0'));
        return (
          <span className="font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
            {formatRupiah(val)}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
          <button
            type="button"
            data-testid={`open-restock-btn-${item.id}`}
            onClick={() => {
              setRestockTargetId(item.id);
              setRestockUnitCost(new Decimal(item.costPriceAvg || '0').toFixed(0));
              setRestockQty('5');
              setRestockSupplier(item.supplierName ?? '');
              setRestockReceiptNo('');
              setRestockNotes('');
              setRestockReceiptImage('');
              setOpnameTargetId(null);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>{isRetailMode ? 'Kulakan Tunai' : 'Belanja Bahan'}</span>
          </button>
          {!isRetailMode && (
            <>
              <button
                type="button"
                onClick={() => handleEditRaw(item)}
                aria-label={`Edit bahan ${item.name}`}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              {confirmDeleteId === item.id ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteProduct(item.id);
                    setConfirmDeleteId(null);
                    onNotify(`Bahan "${item.name}" dihapus.`);
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md"
                >
                  Ya, Hapus
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(item.id)}
                  aria-label={`Hapus bahan ${item.name}`}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const purchaseHistoryColumns: DataTableColumn<InventoryMovement>[] = [
    {
      key: 'date',
      header: 'Tanggal',
      sortValue: (mov) => mov.createdAt,
      csvHeader: 'Tanggal',
      csvValue: (mov) => mov.createdAt.slice(0, 19),
      render: (mov) => {
        const dt = new Date(mov.createdAt);
        return (
          <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
            {Number.isNaN(dt.getTime())
              ? mov.createdAt
              : dt.toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
          </span>
        );
      },
    },
    {
      key: 'item',
      header: 'Barang / Bahan',
      sortValue: (mov) => productMap.get(mov.productId)?.name ?? mov.productId,
      csvHeader: 'Barang / Supplier',
      csvValue: (mov) =>
        `${productMap.get(mov.productId)?.name ?? mov.productId} (${mov.supplierName || 'Supplier Umum'})`,
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        return (
          <div>
            <p className="font-semibold text-slate-900">{prod?.name ?? mov.productId}</p>
            <p className="text-[11px] text-slate-500">
              {mov.supplierName || 'Supplier Umum'}
              {mov.receiptNumber ? ` · Nota ${mov.receiptNumber}` : ''}
              {mov.actorName ? ` · Oleh ${mov.actorName}` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'qty',
      header: 'Qty Masuk',
      align: 'right',
      sortValue: (mov) => Number(mov.qtyChange || 0),
      csvHeader: 'Qty Masuk',
      csvValue: (mov) => Number(mov.qtyChange || 0),
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        return (
          <span className="font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
            +{Number(mov.qtyChange)} {prod?.unit ?? ''}
          </span>
        );
      },
    },
    {
      key: 'total',
      header: 'Total Pembelian',
      align: 'right',
      sortValue: (mov) =>
        new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0')).toNumber(),
      csvHeader: 'Total Pembelian (Rp)',
      csvValue: (mov) =>
        new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0')).toFixed(2),
      render: (mov) => {
        const total = new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0'));
        return (
          <div className="font-mono tabular-nums whitespace-nowrap">
            <p className="font-bold text-slate-900">{formatRupiah(total)}</p>
            <p className="text-[11px] text-slate-500">@{formatRupiah(mov.unitCost)}</p>
          </div>
        );
      },
    },
    {
      key: 'receipt',
      header: 'Bukti Nota (Pajak)',
      align: 'right',
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        if (mov.receiptImageUrl) {
          return (
            <button
              type="button"
              data-testid={`view-purchase-receipt-btn-${mov.id}`}
              onClick={() =>
                setPreviewReceipt({
                  imageUrl: mov.receiptImageUrl!,
                  title: prod?.name ?? mov.productId,
                  amountLabel: `Masuk +${Number(mov.qtyChange)} ${prod?.unit ?? ''} · Total ${formatRupiah(
                    new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0'))
                  )}`,
                  receiptNumber: mov.receiptNumber,
                  supplierName: mov.supplierName,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Lihat Nota</span>
            </button>
          );
        }
        return <span className="text-[11px] text-slate-400">Tanpa foto nota</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Compact Inventory KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">
            {isRetailMode ? 'Total SKU Barang Dagangan' : 'Total Jenis Bahan Mentah'}
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {managedItems.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Nilai Persediaan (HPP Moving Avg)</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {formatRupiah(totalInventoryValue)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Stok Menipis (Perlu Restock)</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}
          >
            {lowStockCount} item
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Bukti Nota Pembelian Terarsip</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {receiptsAttachedCount} / {purchaseHistory.length}
          </p>
        </div>
      </div>

      {/* Clear 1-Line Distinction Guide: Kulakan Cepat vs Purchase Order (PO Supplier) */}
      <div
        data-testid="kulakan-vs-po-guide"
        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-900">Kulakan Cepat (Tunai):</strong> gunakan halaman ini
          ketika Anda belanja langsung ke pasar/grosir dan barang langsung masuk rak. Butuh{' '}
          <strong>Surat PO PDF resmi</strong>, perhitungan restok otomatis, ongkir Landed Cost, atau
          pembayaran tempo hutang supplier?
        </p>
        <button
          type="button"
          onClick={() => navigate('/purchasing/po')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <span>Buka Purchase Order (PO)</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className={`grid grid-cols-1 ${isRetailMode ? '' : 'lg:grid-cols-12'} gap-6 items-start`}>
        {/* Left: Add Raw Material Form (Only in F&B mode) */}
        {!isRetailMode && (
          <form
            onSubmit={handleSaveRawMaterial}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingId ? 'Edit Bahan Mentah' : 'Tambah Bahan Mentah Dapur'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Input bahan baku (biji kopi, susu, ayam, bumbu) yang akan dipakai di Resep BOM.
                </p>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={resetRawForm}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Batal
                </button>
              )}
            </div>

            <div>
              <label htmlFor="raw-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Bahan Mentah *
              </label>
              <input
                id="raw-name"
                type="text"
                required
                value={rawName}
                onChange={(e) => setRawName(e.target.value)}
                placeholder="Mis. Bubuk Matcha Jepang, Susu Oat, Daging Ayam"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="raw-unit" className="block text-xs font-medium text-slate-700 mb-1">
                  Satuan Beli *
                </label>
                <input
                  id="raw-unit"
                  type="text"
                  required
                  value={rawUnit}
                  onChange={(e) => setRawUnit(e.target.value)}
                  placeholder="kg / liter / gram / pcs"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="raw-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  Harga Beli / Satuan (Rp) *
                </label>
                <input
                  id="raw-cost"
                  type="number"
                  required
                  value={rawCost}
                  onChange={(e) => setRawCost(e.target.value)}
                  placeholder="185000"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="raw-stock" className="block text-xs font-medium text-slate-700 mb-1">
                  Stok Awal ({rawUnit || 'unit'})
                </label>
                <input
                  id="raw-stock"
                  type="number"
                  step="any"
                  value={rawStock}
                  onChange={(e) => setRawStock(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="raw-min" className="block text-xs font-medium text-slate-700 mb-1">
                  Batas Alert Stok Min
                </label>
                <input
                  id="raw-min"
                  type="number"
                  step="any"
                  value={rawMinStock}
                  onChange={(e) => setRawMinStock(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{editingId ? 'Simpan Perubahan Bahan' : 'Tambah Bahan Mentah'}</span>
            </button>
          </form>
        )}

        {/* Right / Full: Paginated Inventory Stock DataTable */}
        <section
          className={`${
            isRetailMode ? '' : 'lg:col-span-8'
          } bg-white border border-slate-200 rounded-2xl overflow-hidden`}
        >
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              {isRetailMode
                ? 'Daftar Stok Barang & Kulakan Cepat'
                : 'Stok Bahan Mentah Gudang Dapur'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik <strong>{isRetailMode ? 'Kulakan Tunai' : 'Belanja Bahan'}</strong> setiap
              belanja baru untuk upload bukti nota, update HPP Moving Average &amp; posting Jurnal
              Pembelian otomatis.
            </p>
          </div>

          <DataTable
            data={managedItems}
            columns={stockColumns}
            getRowKey={(item) => item.id}
            defaultPageSize={10}
            searchable
            searchPlaceholder="Cari barang, SKU, merek, atau jenis..."
            searchFn={(item, q) =>
              item.name.toLowerCase().includes(q) ||
              item.sku.toLowerCase().includes(q) ||
              (item.brand ?? '').toLowerCase().includes(q) ||
              (item.productType ?? '').toLowerCase().includes(q)
            }
            exportFilename={isRetailMode ? 'stok-kulakan-cepat' : 'stok-bahan-mentah'}
            testId="stock-datatable"
            emptyState={
              <p className="text-sm text-slate-500">
                {isRetailMode
                  ? 'Belum ada barang dagangan. Tambahkan barang terlebih dahulu di menu Daftar Barang & Harga.'
                  : 'Belum ada bahan mentah di gudang. Tambahkan melalui formulir di samping.'}
              </p>
            }
          />
        </section>
      </div>

      {/* Purchase Receipt History Table (Cross-check & Tax Evidence) */}
      <section
        data-testid="purchase-receipt-history-section"
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Riwayat Kulakan &amp; Bukti Nota (Cross-Check Pajak)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Seluruh transaksi kulakan / restok beserta lampiran foto nota supplier untuk audit &amp;
              bukti pelaporan pajak.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {purchaseHistory.length} transaksi pembelian
          </span>
        </div>

        <DataTable
          data={purchaseHistory}
          columns={purchaseHistoryColumns}
          getRowKey={(m) => m.id}
          defaultPageSize={10}
          searchable
          searchPlaceholder="Cari barang, supplier, atau nomor nota..."
          searchFn={(mov, q) => {
            const prod = productMap.get(mov.productId);
            return (
              (prod?.name ?? mov.productId).toLowerCase().includes(q) ||
              (mov.supplierName ?? '').toLowerCase().includes(q) ||
              (mov.receiptNumber ?? '').toLowerCase().includes(q)
            );
          }}
          exportFilename="riwayat-kulakan-pembelian"
          testId="purchase-history-datatable"
          emptyState={
            <p className="text-sm text-slate-500">
              Belum ada riwayat pembelian / kulakan. Klik tombol <strong>Kulakan Tunai</strong>{' '}
              pada barang di atas untuk mencatat pembelian beserta foto bukti nota.
            </p>
          }
        />
      </section>

      {/* MODAL 1: Kulakan / Restock Supplier with Receipt Photo Upload (Strict ModalShell) */}
      <ModalShell
        open={Boolean(restockTarget)}
        onClose={() => setRestockTargetId(null)}
        headerId="restock-modal-header"
        title={
          restockTarget
            ? `${isRetailMode ? 'Kulakan / Restock Supplier' : 'Belanja / Restock Bahan'}: ${
                restockTarget.name
              }`
            : ''
        }
        subtitle={
          restockTarget
            ? `Stok saat ini: ${new Decimal(restockTarget.stockQty).toFixed(2)} ${
                restockTarget.unit
              } · HPP Avg: ${formatRupiah(restockTarget.costPriceAvg)}/${restockTarget.unit}`
            : undefined
        }
        headerBgClass="bg-emerald-50/70 border-emerald-200"
        testId="restock-modal"
        maxWidthClass="max-w-lg"
      >
        {restockTarget && (
          <form onSubmit={handleSubmitRestock} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="restock-qty"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Jumlah Beli ({restockTarget.unit}) *
                </label>
                <input
                  id="restock-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="restock-cost"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Harga Beli / {restockTarget.unit} (Rp) *
                </label>
                <input
                  id="restock-cost"
                  type="number"
                  min="0"
                  required
                  value={restockUnitCost}
                  onChange={(e) => setRestockUnitCost(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="restock-pay"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Sumber Pembayaran
                </label>
                <select
                  id="restock-pay"
                  value={restockPayAcc}
                  onChange={(e) => setRestockPayAcc(e.target.value as '1101' | '1102' | '2101')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  <option value="1101">Kas Tunai (1101)</option>
                  <option value="1102">Rekening Bank (1102)</option>
                  <option value="2101">Utang Supplier (2101)</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="restock-supplier"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nama Agen / Supplier
                </label>
                <input
                  id="restock-supplier"
                  type="text"
                  value={restockSupplier}
                  onChange={(e) => setRestockSupplier(e.target.value)}
                  placeholder="Mis. Agen Grosir Jaya"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="restock-receipt-no"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  No. Nota / Faktur Pembelian
                </label>
                <input
                  id="restock-receipt-no"
                  data-testid="restock-receipt-number-input"
                  type="text"
                  value={restockReceiptNo}
                  onChange={(e) => setRestockReceiptNo(e.target.value)}
                  placeholder="Mis. INV-SUP-2026-01"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="restock-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Catatan Tambahan
                </label>
                <input
                  id="restock-notes"
                  type="text"
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  placeholder="Keterangan belanja..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Purchase Receipt Photo Upload (Cross-Check & Tax Compliance) */}
            <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-700" />
                <span className="text-xs font-bold text-amber-950">
                  Upload Bukti Pembelian / Foto Nota (Opsional — Cross-Check &amp; Pajak)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-amber-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {isValidProductImageSource(restockReceiptImage) ? (
                    <img
                      src={restockReceiptImage}
                      alt="Pratinjau nota pembelian"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-5 h-5 text-amber-300" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <input
                    ref={receiptFileRef}
                    id="restock-receipt-file"
                    data-testid="restock-receipt-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleUploadRestockReceipt(e)}
                    className="sr-only"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingReceipt}
                      onClick={() => receiptFileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingReceipt ? 'Memproses...' : 'Unggah Foto Nota'}</span>
                    </button>
                    {restockReceiptImage && (
                      <button
                        type="button"
                        onClick={() => setRestockReceiptImage('')}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-900/75">
                    {restockReceiptImage
                      ? 'Nota terlampir dan siap disimpan untuk cross-check & pelaporan pajak ✓'
                      : 'Foto nota akan tersimpan di Riwayat Pembelian & menu Pajak DJP.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live total preview */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-600">Total Nilai Pembelian (Jurnal Dr 1105)</span>
              <strong className="font-mono tabular-nums text-emerald-700 text-sm">
                {formatRupiah(
                  new Decimal(restockQty || '0').times(new Decimal(restockUnitCost || '0'))
                )}
              </strong>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRestockTargetId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="restock-modal-submit-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Simpan Restock &amp; Posting Jurnal</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* MODAL 2: Stock Opname Fisik (Strict ModalShell) */}
      <ModalShell
        open={Boolean(opnameTarget)}
        onClose={() => setOpnameTargetId(null)}
        headerId="opname-modal-header"
        title={opnameTarget ? `Stock Opname Fisik: ${opnameTarget.name}` : ''}
        subtitle={
          opnameTarget
            ? `Stok tercatat sistem: ${new Decimal(opnameTarget.stockQty).toFixed(2)} ${
                opnameTarget.unit
              }`
            : undefined
        }
        headerBgClass="bg-amber-50/80 border-amber-200"
        testId="opname-modal"
        maxWidthClass="max-w-lg"
      >
        {opnameTarget && (
          <form onSubmit={handleSubmitOpname} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="opname-qty"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Jumlah Fisik Aktual di Gudang/Rak ({opnameTarget.unit}) *
              </label>
              <input
                id="opname-qty"
                type="number"
                step="any"
                min="0"
                required
                value={opnameActualQty}
                onChange={(e) => setOpnameActualQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
              />
            </div>

            <div>
              <label
                htmlFor="opname-note"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Alasan Penyesuaian
              </label>
              <input
                id="opname-note"
                type="text"
                value={opnameNotes}
                onChange={(e) => setOpnameNotes(e.target.value)}
                placeholder="Mis. Barang pecah / susut gudang / hasil hitung akhir bulan"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
              />
            </div>

            {(() => {
              const sys = new Decimal(opnameTarget.stockQty || '0');
              const act = new Decimal(opnameActualQty || '0');
              const diff = act.minus(sys);
              return (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-600">Selisih Fisik vs Sistem</span>
                  <strong
                    className={`font-mono tabular-nums text-sm ${
                      diff.gt(0)
                        ? 'text-emerald-700'
                        : diff.lt(0)
                        ? 'text-rose-600'
                        : 'text-slate-700'
                    }`}
                  >
                    {diff.gt(0) ? '+' : ''}
                    {diff.toFixed(2)} {opnameTarget.unit}
                  </strong>
                </div>
              );
            })()}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpnameTargetId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                data-testid="opname-modal-submit-btn"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Simpan Penyesuaian Opname</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* Receipt Image Preview Modal */}
      <ReceiptPreviewModal
        receipt={previewReceipt}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}
