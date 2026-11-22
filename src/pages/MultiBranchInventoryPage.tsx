import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  Plus,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { FeatureGuard } from '../components/FeatureGuard';
import { StockForecastingPanel } from '../components/inventory/StockForecastingPanel';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ModalShell } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import { ensureBranchStocksForTenant } from '../lib/inventory/multi-branch-engine';
import {
  downloadPurchaseOrderPdf,
  downloadStockTransferPdf,
} from '../lib/pdf/po-pdf-generator';
import { formatRupiah } from '../lib/pos/checkout-service';
import type {
  Product,
  PurchaseOrder,
  StockOpnameSession,
  StockTransfer,
} from '../types/domain';

export type MultiBranchTab = 'MATRIX' | 'TRANSFERS' | 'PURCHASING' | 'OPNAME';

export function MultiBranchInventoryPage({
  activeSection,
  initialTab = 'MATRIX',
}: {
  activeSection?: MultiBranchTab;
  initialTab?: MultiBranchTab;
}) {
  const {
    activeWorkspace,
    navigate,
    hasAddOn,
    addBranch,
    createStockTransfer,
    shipStockTransferById,
    receiveStockTransferById,
    addSupplier,
    createPurchaseOrder,
    receivePoWithLandedCost,
    paySupplierDebt,
    createBlindOpnameSession,
    updateOpnamePhysicalQty,
    approveOpnameSessionById,
  } = useApp();

  const activeTab: MultiBranchTab = activeSection ?? initialTab;

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Branch Modal
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [brCode, setBrCode] = useState('');
  const [brName, setBrName] = useState('');
  const [brType, setBrType] = useState<'OUTLET' | 'CENTRAL_WAREHOUSE'>('OUTLET');
  const [brAddress, setBrAddress] = useState('');
  const [brPhone, setBrPhone] = useState('');
  const [brNitku, setBrNitku] = useState('');

  // Stock Transfer Create Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [destBranchId, setDestBranchId] = useState('');
  const [transferProdId, setTransferProdId] = useState('');
  const [transferQty, setTransferQty] = useState('10');
  const [transferNotes, setTransferNotes] = useState('');

  // Receive Transfer Modal
  const [receiveTransfer, setReceiveTransfer] = useState<StockTransfer | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<
    Record<string, { receivedQty: string; damagedQty: string }>
  >({});

  // Printable Surat Jalan Modal
  const [suratJalanTransfer, setSuratJalanTransfer] = useState<StockTransfer | null>(null);

  // Supplier Modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supTermDays, setSupTermDays] = useState('14');

  // Create PO Modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poBranchId, setPoBranchId] = useState('');
  const [poProductId, setPoProductId] = useState('');
  const [poQty, setPoQty] = useState('20');
  const [poUnitCost, setPoUnitCost] = useState('15000');

  // Receive PO Modal
  const [receivePo, setReceivePo] = useState<PurchaseOrder | null>(null);
  const [poReceiveBranchId, setPoReceiveBranchId] = useState('');
  const [poLandedShipping, setPoLandedShipping] = useState('50000');
  const [poPaymentType, setPoPaymentType] = useState<'TUNAI' | 'TEMPO_HUTANG'>('TEMPO_HUTANG');
  const [poPayAccount, setPoPayAccount] = useState<'1101' | '1102'>('1102');

  // Pay Supplier Debt Modal
  const [payDebtPo, setPayDebtPo] = useState<PurchaseOrder | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtPayAccount, setDebtPayAccount] = useState<'1101' | '1102'>('1102');

  // Blind Stock Opname State
  const [opnameBranchId, setOpnameBranchId] = useState('');
  const [blindModeToggle, setBlindModeToggle] = useState(true);
  const [activeOpnameId, setActiveOpnameId] = useState<string | null>(null);
  const [barcodeScanInput, setBarcodeScanInput] = useState('');

  const branches = activeWorkspace.branches ?? [];
  const products = activeWorkspace.products;
  const transfers = activeWorkspace.stockTransfers ?? [];
  const suppliers = activeWorkspace.suppliers ?? [];
  const purchaseOrders = activeWorkspace.purchaseOrders ?? [];
  const opnameSessions: StockOpnameSession[] =
    activeWorkspace.opnameSessions ?? activeWorkspace.stockOpnameSessions ?? [];

  const branchStocks = useMemo(
    () =>
      ensureBranchStocksForTenant({
        tenantId: activeWorkspace.tenant.id,
        branches,
        products,
        existingStocks: activeWorkspace.branchStocks ?? [],
      }),
    [activeWorkspace.tenant.id, branches, products, activeWorkspace.branchStocks]
  );

  const stockLookup = useMemo(() => {
    const map = new Map<string, { qty: Decimal; min: Decimal; avg: Decimal }>();
    for (const bs of branchStocks) {
      map.set(`${bs.branchId}::${bs.productId}`, {
        qty: new Decimal(bs.stockQty || '0'),
        min: new Decimal(bs.minStockAlert || '0'),
        avg: new Decimal(bs.movingAvgCost || '0'),
      });
    }
    return map;
  }, [branchStocks]);

  const activeOpname: StockOpnameSession | null = useMemo(() => {
    if (activeOpnameId) {
      return opnameSessions.find((s) => s.id === activeOpnameId) ?? opnameSessions[0] ?? null;
    }
    return (
      opnameSessions.find((s) => s.status === 'DRAFT' || s.status === 'IN_PROGRESS') ??
      opnameSessions[0] ??
      null
    );
  }, [activeOpnameId, opnameSessions]);

  const canAddExtraBranch = branches.length < 1 || hasAddOn('ADDON_EXTRA_BRANCH');

  const handleAddBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brCode.trim() || !brName.trim()) return;
    addBranch({
      code: brCode.trim().toUpperCase(),
      name: brName.trim(),
      branchType: brType,
      address: brAddress.trim() || '-',
      phone: brPhone.trim() || '-',
      nitku22: brNitku.trim() || undefined,
    });
    setBranchModalOpen(false);
    setBrCode('');
    setBrName('');
    setBrAddress('');
    setBrPhone('');
    setBrNitku('');
    setFeedback({ type: 'success', text: `Cabang / Gudang ${brName.trim()} berhasil ditambahkan.` });
  };

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceBranchId || !destBranchId || sourceBranchId === destBranchId || !transferProdId) {
      setFeedback({ type: 'error', text: 'Pilih cabang asal & tujuan yang berbeda serta produk.' });
      return;
    }
    try {
      createStockTransfer({
        sourceBranchId,
        destinationBranchId: destBranchId,
        items: [{ productId: transferProdId, requestedQty: new Decimal(transferQty || '1').toFixed(4) }],
        notes: transferNotes.trim() || undefined,
      });
      setTransferModalOpen(false);
      setTransferNotes('');
      setFeedback({
        type: 'success',
        text: 'Permintaan transfer stok (REQUESTED) berhasil dibuat. Lanjutkan klik Kirim Barang untuk mencetak Surat Jalan.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membuat permintaan transfer.',
      });
    }
  };

  const handleShipTransfer = (tr: StockTransfer) => {
    try {
      shipStockTransferById(tr.id);
      setFeedback({
        type: 'success',
        text: `Transfer ${tr.transferNumber} dikirim (IN_TRANSIT). Jurnal otomatis: Dr Persediaan Dalam Perjalanan (1108) / Cr Persediaan (1105).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengirim transfer.',
      });
    }
  };

  const openReceiveModal = (tr: StockTransfer) => {
    const initial: Record<string, { receivedQty: string; damagedQty: string }> = {};
    for (const it of tr.items) {
      initial[it.productId] = {
        receivedQty: new Decimal(it.shippedQty || it.requestedQty).toDecimalPlaces(0).toString(),
        damagedQty: '0',
      };
    }
    setReceiveInputs(initial);
    setReceiveTransfer(tr);
  };

  const handleConfirmReceiveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTransfer) return;
    try {
      receiveStockTransferById(receiveTransfer.id, receiveInputs);
      setReceiveTransfer(null);
      setFeedback({
        type: 'success',
        text: `Transfer ${receiveTransfer.transferNumber} diterima (RECEIVED). Stok cabang tujuan & Moving Avg diperbarui; barang rusak otomatis dijurnal ke 6108.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menerima transfer.',
      });
    }
  };

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    addSupplier({
      name: supName.trim(),
      phone: supPhone.trim() || '-',
      address: supAddress.trim() || '-',
      defaultTermDays: Number(supTermDays || 14),
    });
    setSupplierModalOpen(false);
    setSupName('');
    setSupPhone('');
    setSupAddress('');
    setFeedback({ type: 'success', text: 'Supplier baru berhasil disimpan.' });
  };

  const handleCreatePo = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === poProductId);
    const sup = suppliers.find((s) => s.id === poSupplierId);
    if (!prod) {
      setFeedback({ type: 'error', text: 'Pilih produk untuk dipesan.' });
      return;
    }
    const qtyDec = new Decimal(poQty || '1');
    const costDec = new Decimal(poUnitCost || '0');
    const lineTotal = qtyDec.times(costDec);
    const now = new Date().toISOString();
    createPurchaseOrder({
      id: `po-${Date.now()}`,
      tenantId: activeWorkspace.tenant.id,
      branchId: poBranchId || branches[0]?.id || null,
      poNumber: `PO-${now.slice(0, 10).replace(/-/g, '')}-${String(purchaseOrders.length + 1).padStart(3, '0')}`,
      supplierId: sup?.id ?? null,
      supplierName: sup?.name ?? 'Supplier Umum',
      status: 'ORDERED',
      paymentType: 'TEMPO_HUTANG',
      landedCostShipping: '0.0000',
      paidAmount: '0.0000',
      createdAt: now,
      createdByName: 'Owner',
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          unit: prod.unit,
          orderedQty: qtyDec.toFixed(4),
          unitCost: costDec.toFixed(4),
          lineTotal: lineTotal.toFixed(4),
        },
      ],
      totalEstimatedCost: lineTotal.toFixed(4),
    });
    setPoModalOpen(false);
    setFeedback({ type: 'success', text: 'Purchase Order baru berhasil dibuat.' });
  };

  const handleReceivePoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivePo) return;
    try {
      receivePoWithLandedCost({
        poId: receivePo.id,
        branchId: poReceiveBranchId || receivePo.branchId || branches[0]?.id || '',
        landedCostShipping: new Decimal(poLandedShipping || '0').toFixed(4),
        paymentType: poPaymentType,
        paymentAccountCode: poPayAccount,
      });
      setReceivePo(null);
      setFeedback({
        type: 'success',
        text: `PO ${receivePo.poNumber} diterima! Ongkir Landed Cost otomatis masuk HPP Moving Avg & dijurnal ${
          poPaymentType === 'TEMPO_HUTANG' ? 'Utang Usaha (2101)' : 'Kas/Bank'
        }.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menerima barang PO.',
      });
    }
  };

  const handlePayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payDebtPo) return;
    try {
      paySupplierDebt(
        payDebtPo.id,
        new Decimal(debtPayAmount || '0').toFixed(4),
        debtPayAccount,
        `Pembayaran hutang ${payDebtPo.poNumber}`
      );
      setPayDebtPo(null);
      setDebtPayAmount('');
      setFeedback({
        type: 'success',
        text: `Cicilan hutang ${payDebtPo.poNumber} dicatat & dijurnal (Dr Utang Usaha 2101 / Cr Kas/Bank).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membayar hutang supplier.',
      });
    }
  };

  const handleStartOpname = () => {
    const targetBranch = opnameBranchId || branches[0]?.id;
    if (!targetBranch) {
      setFeedback({ type: 'error', text: 'Pilih cabang terlebih dahulu.' });
      return;
    }
    const created = createBlindOpnameSession(targetBranch, blindModeToggle);
    setActiveOpnameId(created.id);
    setFeedback({
      type: 'success',
      text: `Sesi Opname ${created.sessionNumber} dimulai (${
        blindModeToggle ? 'Blind Count Mode — stok sistem disembunyikan' : 'Mode Terbuka'
      }).`,
    });
  };

  const handleBarcodeOpnameScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOpname || !barcodeScanInput.trim()) return;
    const q = barcodeScanInput.trim().toLowerCase();
    const matchedItem = activeOpname.items.find((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const skuStr = (it.sku ?? it.skuSnapshot ?? '').toLowerCase();
      const nameStr = (it.productName ?? it.productNameSnapshot ?? '').toLowerCase();
      return (
        skuStr === q ||
        (prod?.barcodeQr && prod.barcodeQr.toLowerCase() === q) ||
        nameStr.includes(q)
      );
    });
    if (!matchedItem) {
      setFeedback({ type: 'error', text: `Barcode / SKU "${barcodeScanInput}" tidak ditemukan pada sesi opname.` });
      return;
    }
    const nextQty = new Decimal(matchedItem.physicalQty || '0').plus(1).toFixed(4);
    updateOpnamePhysicalQty(activeOpname.id, matchedItem.productId, nextQty);
    setBarcodeScanInput('');
    setFeedback({
      type: 'success',
      text: `+1 hitungan fisik untuk ${matchedItem.productName ?? matchedItem.productNameSnapshot} (Total: ${new Decimal(nextQty).toDecimalPlaces(0).toString()}).`,
    });
  };

  const transferColumns: DataTableColumn<StockTransfer>[] = [
    {
      key: 'num',
      header: 'No. Transfer & Tanggal',
      render: (tr) => (
        <div>
          <p className="font-mono font-semibold text-slate-900">{tr.transferNumber}</p>
          <p className="text-[11px] text-slate-500">{tr.createdAt.slice(0, 10)}</p>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Rute Pengiriman',
      render: (tr) => (
        <span className="text-slate-800">
          {tr.sourceBranchName} → <strong>{tr.destinationBranchName}</strong>
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Barang & Qty',
      render: (tr) => (
        <div className="space-y-0.5">
          {tr.items.map((it) => (
            <p key={it.id} className="text-xs text-slate-700">
              {it.productName} (
              <span className="font-mono">
                {new Decimal(it.requestedQty).toDecimalPlaces(0).toString()} {it.unit}
              </span>
              )
            </p>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Tahap Status',
      render: (tr) => (
        <span
          className={`text-xs font-semibold ${
            tr.status === 'RECEIVED'
              ? 'text-emerald-700'
              : tr.status === 'IN_TRANSIT'
              ? 'text-amber-700'
              : 'text-slate-700'
          }`}
        >
          {tr.status === 'REQUESTED'
            ? '1. Diminta (REQUESTED)'
            : tr.status === 'IN_TRANSIT'
            ? '2. Dalam Perjalanan (IN_TRANSIT)'
            : '3. Diterima (RECEIVED)'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (tr) => (
        <div className="inline-flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={() => setSuratJalanTransfer(tr)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Surat Jalan</span>
          </button>
          {tr.status === 'REQUESTED' && (
            <button
              type="button"
              onClick={() => handleShipTransfer(tr)}
              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
            >
              Kirim Barang
            </button>
          )}
          {tr.status === 'IN_TRANSIT' && (
            <button
              type="button"
              onClick={() => openReceiveModal(tr)}
              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
            >
              Terima Fisik
            </button>
          )}
        </div>
      ),
    },
  ];

  const handleDownloadPoPdf = (po: PurchaseOrder) => {
    const branchName = branches.find((b) => b.id === po.branchId)?.name;
    const filename = downloadPurchaseOrderPdf({
      po,
      tenant: activeWorkspace.tenant,
      branchName,
    });
    setFeedback({
      type: 'success',
      text: `Dokumen Purchase Order "${filename}" berhasil diunduh (.pdf).`,
    });
  };

  const handleDownloadSuratJalanPdf = (tr: StockTransfer) => {
    const filename = downloadStockTransferPdf({
      transfer: tr,
      tenant: activeWorkspace.tenant,
      sourceBranchName: tr.sourceBranchName || 'Gudang Asal',
      destBranchName: tr.destinationBranchName || 'Cabang Tujuan',
    });
    setFeedback({
      type: 'success',
      text: `Surat Jalan "${filename}" berhasil diunduh (.pdf).`,
    });
  };

  const matrixColumns: DataTableColumn<Product>[] = useMemo(() => {
    const cols: DataTableColumn<Product>[] = [
      {
        key: 'product',
        header: 'Produk / Bahan',
        sortValue: (prod) => prod.name,
        csvHeader: 'Produk',
        csvValue: (prod) => `${prod.name} (${prod.sku})`,
        render: (prod) => (
          <div>
            <p className="font-semibold text-slate-900">{prod.name}</p>
            <p className="text-[11px] font-mono text-slate-500">
              {prod.sku} · {prod.unit}
            </p>
          </div>
        ),
      },
    ];

    for (const br of branches) {
      cols.push({
        key: `branch-${br.id}`,
        header: br.name,
        align: 'right',
        sortValue: (prod) => stockLookup.get(`${br.id}::${prod.id}`)?.qty.toNumber() ?? 0,
        csvHeader: `Stok ${br.name}`,
        csvValue: (prod) =>
          (stockLookup.get(`${br.id}::${prod.id}`)?.qty ?? new Decimal(0)).toFixed(2),
        render: (prod) => {
          const cell = stockLookup.get(`${br.id}::${prod.id}`);
          const qty = cell?.qty ?? new Decimal(0);
          const min = cell?.min ?? new Decimal(prod.minStockAlert || '0');
          const isLow = qty.lte(min);
          return (
            <div
              className={`font-mono tabular-nums px-2 py-1 rounded ${
                isLow ? 'bg-rose-50 text-rose-800 font-bold' : 'text-slate-800'
              }`}
            >
              <span className="inline-flex items-center justify-end gap-1">
                {isLow && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                <span>{qty.toDecimalPlaces(1).toString()}</span>
              </span>
              <div className="text-[10px] font-normal text-slate-400">
                Min {min.toDecimalPlaces(0).toString()}
              </div>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        key: 'total',
        header: 'Total Konsolidasi',
        align: 'right',
        sortValue: (prod) =>
          branches
            .reduce(
              (acc, br) => acc.plus(stockLookup.get(`${br.id}::${prod.id}`)?.qty ?? new Decimal(0)),
              new Decimal(0)
            )
            .toNumber(),
        csvHeader: 'Total Konsolidasi',
        csvValue: (prod) =>
          branches
            .reduce(
              (acc, br) => acc.plus(stockLookup.get(`${br.id}::${prod.id}`)?.qty ?? new Decimal(0)),
              new Decimal(0)
            )
            .toFixed(2),
        render: (prod) => {
          const totalQty = branches.reduce(
            (acc, br) => acc.plus(stockLookup.get(`${br.id}::${prod.id}`)?.qty ?? new Decimal(0)),
            new Decimal(0)
          );
          return (
            <span className="font-mono font-bold tabular-nums text-slate-900">
              {totalQty.toDecimalPlaces(1).toString()} {prod.unit}
            </span>
          );
        },
      },
      {
        key: 'quick_act',
        header: 'Aksi Cepat',
        align: 'right',
        render: (prod) =>
          branches.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                const wh =
                  branches.find((b) => b.branchType === 'CENTRAL_WAREHOUSE') ?? branches[0];
                const outlet = branches.find((b) => b.id !== wh.id) ?? branches[0];
                setSourceBranchId(wh.id);
                setDestBranchId(outlet.id);
                setTransferProdId(prod.id);
                setTransferModalOpen(true);
              }}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
            >
              Minta Transfer →
            </button>
          ) : (
            <span className="text-slate-400 text-[11px]">1 Cabang</span>
          ),
      }
    );

    return cols;
  }, [branches, stockLookup]);

  const poColumns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: 'num',
      header: 'No. PO & Supplier',
      sortValue: (po) => po.poNumber,
      csvHeader: 'No PO & Supplier',
      csvValue: (po) => `${po.poNumber} - ${po.supplierName ?? 'Supplier Umum'}`,
      render: (po) => (
        <div>
          <p className="font-mono font-semibold text-slate-900">{po.poNumber}</p>
          <p className="text-[11px] text-slate-500">
            {po.supplierName ?? 'Supplier Umum'} · {po.orderDate ?? po.createdAt.slice(0, 10)}
          </p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Ringkasan Barang',
      render: (po) => (
        <div className="space-y-0.5">
          {po.items.slice(0, 2).map((it) => (
            <p key={it.productId} className="text-xs text-slate-700">
              {it.productNameSnapshot ?? it.productName ?? it.productId} ×{' '}
              {new Decimal(it.orderedQty).toDecimalPlaces(0).toString()}{' '}
              {it.unitSnapshot ?? it.unit ?? 'pcs'}
            </p>
          ))}
          {po.items.length > 2 && (
            <p className="text-[11px] text-slate-400">+{po.items.length - 2} item lainnya</p>
          )}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total + Ongkir',
      align: 'right',
      sortValue: (po) =>
        new Decimal(po.totalEstimatedCost || '0')
          .plus(new Decimal(po.landedCostShipping || '0'))
          .toNumber(),
      csvHeader: 'Total PO (Rp)',
      csvValue: (po) =>
        new Decimal(po.totalEstimatedCost || '0')
          .plus(new Decimal(po.landedCostShipping || '0'))
          .toFixed(2),
      render: (po) => {
        const total = new Decimal(po.totalEstimatedCost || '0').plus(
          new Decimal(po.landedCostShipping || '0')
        );
        return (
          <div className="font-mono tabular-nums">
            <p className="font-semibold text-slate-900">{formatRupiah(total.toFixed(4))}</p>
            {new Decimal(po.landedCostShipping || '0').gt(0) && (
              <p className="text-[10px] text-slate-500">
                Ongkir: {formatRupiah(po.landedCostShipping || '0')}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'debt',
      header: 'Status / Sisa Hutang',
      align: 'right',
      sortValue: (po) => po.status,
      csvHeader: 'Status PO',
      csvValue: (po) => po.status,
      render: (po) => {
        const total = new Decimal(po.totalEstimatedCost || '0').plus(
          new Decimal(po.landedCostShipping || '0')
        );
        const paid = new Decimal(po.paidAmount || po.amountPaid || '0');
        const rem = Decimal.max(new Decimal(0), total.minus(paid));
        return (
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800">{po.status}</p>
            {po.status === 'RECEIVED' && po.paymentType === 'TEMPO_HUTANG' && (
              <p
                className={`text-[11px] font-mono tabular-nums ${
                  rem.gt(0) ? 'text-rose-700 font-semibold' : 'text-emerald-700'
                }`}
              >
                {rem.gt(0) ? `Sisa: ${formatRupiah(rem.toFixed(4))}` : 'Lunas Tempo'}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'act',
      header: 'Aksi',
      align: 'right',
      render: (po) => {
        const total = new Decimal(po.totalEstimatedCost || '0').plus(
          new Decimal(po.landedCostShipping || '0')
        );
        const paid = new Decimal(po.paidAmount || po.amountPaid || '0');
        const rem = Decimal.max(new Decimal(0), total.minus(paid));
        return (
          <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
            <button
              type="button"
              data-testid={`download-po-pdf-btn-${po.id}`}
              onClick={() => handleDownloadPoPdf(po)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh PDF</span>
            </button>
            {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
              <button
                type="button"
                onClick={() => {
                  setReceivePo(po);
                  setPoReceiveBranchId(po.branchId || branches[0]?.id || '');
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
              >
                Terima Barang PO
              </button>
            )}
            {po.status === 'RECEIVED' && po.paymentType === 'TEMPO_HUTANG' && rem.gt(0) && (
              <button
                type="button"
                onClick={() => {
                  setPayDebtPo(po);
                  setDebtPayAmount(rem.toDecimalPlaces(0).toString());
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
              >
                Bayar Hutang
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const sectionMeta = useMemo(() => {
    switch (activeTab) {
      case 'TRANSFERS':
        return {
          title: 'Transfer Stok Antar Cabang',
          subtitle:
            'Alur mutasi 3 tahap anti-selisih (Diminta → Dalam Perjalanan Akun 1108 → Diterima Fisik) dilengkapi cetak PDF Surat Jalan.',
        };
      case 'PURCHASING':
        return {
          title: 'Purchase Order (PO Supplier) & Restok',
          subtitle:
            'Terbitkan dokumen PO PDF resmi ke distributor, kelola ongkir Landed Cost, hutang tempo (2101), dan saran restok otomatis tanpa token AI.',
        };
      case 'OPNAME':
        return {
          title: 'Stock Opname (Blind Count)',
          subtitle:
            'Hitung stok fisik gudang tanpa melihat stok sistem terlebih dahulu (anti-manipulasi) dan posting jurnal selisih otomatis (6108 vs 1105).',
        };
      case 'MATRIX':
      default:
        return {
          title: 'Monitoring Stok per Cabang',
          subtitle:
            'Pantau ketersediaan stok seluruh cabang dan gudang pusat secara bersamaan, lengkap dengan peringatan batas minimum.',
        };
    }
  }, [activeTab]);

  const headerPrimaryAction = useMemo(() => {
    if (activeTab === 'MATRIX') {
      return (
        <button
          type="button"
          onClick={() => {
            if (!canAddExtraBranch) {
              setFeedback({
                type: 'error',
                text: 'Tambah cabang ke-2 memerlukan Add-On Ekstra Cabang (+Rp60.000/bln). Aktifkan di menu Paket & Add-On.',
              });
              return;
            }
            setBranchModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah Cabang / Gudang</span>
        </button>
      );
    }
    if (activeTab === 'TRANSFERS') {
      return (
        <button
          type="button"
          onClick={() => {
            setSourceBranchId(branches[0]?.id ?? '');
            setDestBranchId(branches[1]?.id ?? branches[0]?.id ?? '');
            setTransferProdId(products[0]?.id ?? '');
            setTransferModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Buat Permintaan Transfer</span>
        </button>
      );
    }
    if (activeTab === 'PURCHASING') {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSupplierModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Supplier Baru</span>
          </button>
          <button
            type="button"
            data-testid="open-create-po-modal-btn"
            onClick={() => {
              setPoSupplierId(suppliers[0]?.id ?? '');
              setPoBranchId(branches[0]?.id ?? '');
              setPoProductId(products[0]?.id ?? '');
              setPoModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Buat Purchase Order</span>
          </button>
        </div>
      );
    }
    return undefined;
  }, [activeTab, branches, canAddExtraBranch, products, suppliers]);

  const hasPurchaseOrderAccess = hasAddOn('ADDON_PURCHASE_ORDER');
  const isMultiBranchLocked =
    (activeTab === 'MATRIX' || activeTab === 'TRANSFERS') && !canAddExtraBranch;
  const isPurchasingLocked = activeTab === 'PURCHASING' && !hasPurchaseOrderAccess;

  return (
    <AppShell
      title={sectionMeta.title}
      subtitle={sectionMeta.subtitle}
    >
      <div className="space-y-6" data-testid={`multibranch-section-${activeTab.toLowerCase()}`}>
        {isMultiBranchLocked ? (
          <div
            data-testid="multibranch-addon-locked-card"
            className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 my-6"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900">
                Fitur Multi-Cabang Belum Aktif di Paket Saat Ini
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Paket Anda saat ini berlaku untuk <strong>1 lokasi usaha</strong>. Untuk mengelola
                lebih dari satu cabang/gudang, melihat matriks stok antar lokasi, atau mengirim
                transfer stok, aktifkan Add-On <strong>Ekstra Cabang (+Rp60.000/bulan)</strong>.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Lihat Add-On Ekstra Cabang di Paket &amp; Tagihan
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Kembali ke Ringkasan
              </button>
            </div>
          </div>
        ) : isPurchasingLocked ? (
          <div
            data-testid="po-addon-locked-card"
            className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 my-6"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-slate-900">
                Modul Purchase Order (PO Supplier) Belum Aktif
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Paket Anda saat ini dibuat tetap ringkas tanpa menu PO resmi. Untuk membuat dokumen
                PO PDF, ongkir Landed Cost, dan pelacakan hutang tempo distributor, aktifkan{' '}
                <strong>Add-On Purchase Order (PO Supplier) (+Rp20.000/bulan)</strong> atau
                upgrade ke Paket PRO.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => navigate('/purchasing/restock')}
                className="px-4 py-2.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
              >
                Pakai Kulakan Cepat (Tunai) Saja
              </button>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Aktifkan Add-On PO di Paket &amp; Tagihan
              </button>
            </div>
          </div>
        ) : (
        <>
        {headerPrimaryAction && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{sectionMeta.subtitle}</p>
            <div className="shrink-0">{headerPrimaryAction}</div>
          </div>
        )}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              {feedback.text}
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* DEDICATED VIEW 1: MONITORING STOK MULTI-CABANG MATRIX */}
        {activeTab === 'MATRIX' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {branches.map((br) => (
                <div
                  key={br.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-1"
                >
                  <p className="text-[11px] font-mono text-slate-500">
                    {br.code} · {br.branchType === 'CENTRAL_WAREHOUSE' ? 'Gudang Pusat' : 'Outlet'}
                  </p>
                  <p className="text-sm font-bold text-slate-900">{br.name}</p>
                  <p className="text-xs text-slate-500 truncate">{br.address}</p>
                  {br.nitku22 && (
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      NITKU: {br.nitku22}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Matriks Stok per Cabang &amp; Gudang Pusat
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sel disorot merah jika saldo stok berada di bawah batas minimum cabang.
                </p>
              </div>
              <DataTable
                data={products}
                columns={matrixColumns}
                getRowKey={(prod) => prod.id}
                defaultPageSize={10}
                searchable
                searchPlaceholder="Cari produk atau SKU di seluruh cabang..."
                searchFn={(prod, q) =>
                  prod.name.toLowerCase().includes(q) || prod.sku.toLowerCase().includes(q)
                }
                exportFilename="matriks-stok-multi-cabang"
                testId="multibranch-stock-matrix"
                emptyState="Belum ada produk terdaftar untuk ditampilkan di matriks cabang."
              />
            </div>
          </div>
        )}

        {/* DEDICATED VIEW 2: 3-STEP STOCK TRANSFERS */}
        {activeTab === 'TRANSFERS' && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <DataTable
              data={transfers}
              columns={transferColumns}
              getRowKey={(tr) => tr.id}
              defaultPageSize={10}
              searchable
              searchPlaceholder="Cari nomor transfer, cabang asal/tujuan, atau barang..."
              searchFn={(tr, q) =>
                tr.transferNumber.toLowerCase().includes(q) ||
                (tr.sourceBranchName ?? '').toLowerCase().includes(q) ||
                (tr.destinationBranchName ?? '').toLowerCase().includes(q)
              }
              exportFilename="riwayat-transfer-stok"
              testId="stock-transfers-table"
              emptyState={
                <p className="text-sm text-slate-500">
                  Belum ada mutasi stok antar cabang. Buat Permintaan Transfer untuk memindahkan stok dari Gudang Pusat ke Outlet.
                </p>
              }
            />
          </div>
        )}

        {/* DEDICATED VIEW 3: SUPPLIERS, PURCHASE ORDERS (PO PDF) & STATISTICAL FORECASTING */}
        {activeTab === 'PURCHASING' && (
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900">Purchase Order (PO Supplier):</strong> gunakan
                halaman ini untuk membuat dokumen PO resmi (.pdf), melacak ongkir Landed Cost, dan
                pembayaran tempo hutang supplier. Ingin catat belanja tunai langsung ke pasar?
              </p>
              <button
                type="button"
                onClick={() => navigate('/purchasing/restock')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Buka Kulakan Cepat (Tunai)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {suppliers.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {suppliers.map((s) => (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                    <p className="text-sm font-bold text-slate-900">{s.name}</p>
                    <p className="text-xs font-mono text-slate-600">{s.phone}</p>
                    <p className="text-xs text-slate-500">{s.address}</p>
                    <p className="text-[11px] font-medium text-emerald-700 pt-1">
                      Termin standar: {s.defaultTermDays ?? s.paymentTermDays ?? 14} hari
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">
                  Daftar Purchase Order (PO) &amp; Unduh PDF Resmi
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Klik <strong>Unduh PDF</strong> pada baris mana saja untuk mengunduh surat PO
                  resmi siap kirim ke supplier, lalu klik <strong>Terima Barang PO</strong> saat
                  kiriman tiba.
                </p>
              </div>
              <DataTable
                data={purchaseOrders}
                columns={poColumns}
                getRowKey={(po) => po.id}
                defaultPageSize={10}
                searchable
                searchPlaceholder="Cari nomor PO, nama supplier, atau status..."
                searchFn={(po, q) =>
                  po.poNumber.toLowerCase().includes(q) ||
                  (po.supplierName ?? '').toLowerCase().includes(q) ||
                  po.status.toLowerCase().includes(q)
                }
                exportFilename="daftar-purchase-order"
                testId="purchase-orders-table"
                emptyState={
                  <p className="text-sm text-slate-500">
                    Belum ada Purchase Order ke supplier. Klik tombol <strong>Buat Purchase Order</strong> di atas atau gunakan rekomendasi restok di bawah.
                  </p>
                }
              />
            </div>

            {/* Statistical Restock Velocity Forecasting (Zero AI Tokens) */}
            <StockForecastingPanel
              hidePoHistory
              onNotify={(msg) => setFeedback({ type: 'success', text: msg })}
            />
          </div>
        )}

        {/* TAB 4: BLIND STOCK OPNAME */}
        {activeTab === 'OPNAME' && (
          <FeatureGuard moduleCode="ADDON_INVENTORY_PRO">
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cabang / Gudang Opname
                    </label>
                    <select
                      value={opnameBranchId || branches[0]?.id || ''}
                      onChange={(e) => setOpnameBranchId(e.target.value)}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={blindModeToggle}
                      onChange={(e) => setBlindModeToggle(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Aktifkan Blind Count Mode (Sembunyikan Stok Sistem)</span>
                  </label>
                </div>

                <button
                  type="button"
                  data-testid="start-blind-opname-btn"
                  onClick={handleStartOpname}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>Mulai Sesi Opname Baru</span>
                </button>
              </div>

              {activeOpname ? (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {activeOpname.sessionNumber} — {activeOpname.branchName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Status: <strong>{activeOpname.status}</strong> · Mode:{' '}
                        {activeOpname.isBlindCount ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <EyeOff className="w-3 h-3" /> Blind Count (Stok Sistem Disembunyikan saat DRAFT)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <Eye className="w-3 h-3" /> Mode Terbuka
                          </span>
                        )}
                      </p>
                    </div>

                    {activeOpname.status === 'DRAFT' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <form onSubmit={handleBarcodeOpnameScan} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Scan Barcode / SKU + Enter (+1)"
                            value={barcodeScanInput}
                            onChange={(e) => setBarcodeScanInput(e.target.value)}
                            className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg w-56"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            +1 Scan
                          </button>
                        </form>

                        <button
                          type="button"
                          data-testid="approve-opname-btn"
                          onClick={() => {
                            approveOpnameSessionById(activeOpname.id);
                            setFeedback({
                              type: 'success',
                              text: `Sesi ${activeOpname.sessionNumber} disetujui! Jurnal selisih opname (6108 vs 1105) otomatis diposting.`,
                            });
                          }}
                          className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
                        >
                          Approve &amp; Posting Jurnal Selisih
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                          <th className="px-4 py-3">Produk &amp; SKU</th>
                          <th className="px-4 py-3 text-right">Stok Sistem</th>
                          <th className="px-4 py-3 text-right">Hitungan Fisik</th>
                          <th className="px-4 py-3 text-right">Selisih Qty</th>
                          <th className="px-4 py-3 text-right">Nilai Selisih (HPP)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeOpname.items.map((item) => {
                          const hideSystem =
                            activeOpname.isBlindCount && activeOpname.status === 'DRAFT';
                          const varQty = new Decimal(item.varianceQty || '0');
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{item.productName}</p>
                                <p className="text-[11px] font-mono text-slate-500">
                                  {item.sku} · {item.unit}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                                {hideSystem ? (
                                  <span className="text-slate-400 italic">Tersembunyi (Blind)</span>
                                ) : (
                                  new Decimal(item.systemQtySnapshot).toDecimalPlaces(1).toString()
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {activeOpname.status === 'DRAFT' ? (
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    aria-label={`Hitungan fisik ${item.productName}`}
                                    value={new Decimal(item.physicalQty).toDecimalPlaces(1).toString()}
                                    onChange={(e) =>
                                      updateOpnamePhysicalQty(
                                        activeOpname.id,
                                        item.productId,
                                        e.target.value || '0'
                                      )
                                    }
                                    className="w-24 px-2 py-1 text-right font-mono text-xs border border-slate-300 rounded-md"
                                  />
                                ) : (
                                  <span className="font-mono font-semibold tabular-nums text-slate-900">
                                    {new Decimal(item.physicalQty).toDecimalPlaces(1).toString()}
                                  </span>
                                )}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                                  hideSystem
                                    ? 'text-slate-400'
                                    : varQty.lt(0)
                                    ? 'text-rose-700'
                                    : varQty.gt(0)
                                    ? 'text-emerald-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {hideSystem
                                  ? '—'
                                  : `${varQty.gt(0) ? '+' : ''}${varQty.toDecimalPlaces(1).toString()}`}
                              </td>
                              <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                                {hideSystem ? '—' : formatRupiah(item.varianceValue)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                  Belum ada sesi Stock Opname. Klik Mulai Sesi Opname Baru di atas untuk menghitung stok fisik.
                </div>
              )}
            </div>
          </FeatureGuard>
        )}
        </>
        )}
      </div>

      {/* Add Branch Modal */}
      <ModalShell
        open={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        headerId="add-branch-modal-title"
        title="Tambah Cabang Outlet / Gudang Pusat"
        subtitle="Setiap cabang memiliki stok terpisah, HPP Moving Average sendiri, dan kode NITKU 22-digit Coretax."
      >
        <form onSubmit={handleAddBranch} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Cabang</label>
              <input type="text" required placeholder="CBG-03" value={brCode} onChange={(e) => setBrCode(e.target.value)} className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Lokasi</label>
              <select value={brType} onChange={(e) => setBrType(e.target.value as 'OUTLET' | 'CENTRAL_WAREHOUSE')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="OUTLET">Outlet / Toko Cabang</option>
                <option value="CENTRAL_WAREHOUSE">Gudang Pusat</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Cabang / Gudang</label>
              <input type="text" required placeholder="Cabang Depok" value={brName} onChange={(e) => setBrName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
              <input type="text" value={brAddress} onChange={(e) => setBrAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Telepon</label>
              <input type="tel" value={brPhone} onChange={(e) => setBrPhone(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">NITKU 22-Digit (Coretax)</label>
              <input type="text" value={brNitku} onChange={(e) => setBrNitku(e.target.value)} placeholder="Opsional" className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setBranchModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan Cabang</button>
          </div>
        </form>
      </ModalShell>

      {/* Create Transfer Modal */}
      <ModalShell
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        headerId="create-transfer-modal-title"
        title="Buat Permintaan Transfer Stok Antar Cabang"
        subtitle="Tahap 1 (REQUESTED): stok belum berkurang hingga cabang asal klik Kirim Barang."
      >
        <form onSubmit={handleCreateTransfer} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cabang / Gudang Asal</label>
              <select required value={sourceBranchId} onChange={(e) => setSourceBranchId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cabang Tujuan</label>
              <select required value={destBranchId} onChange={(e) => setDestBranchId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Produk</label>
              <select required value={transferProdId} onChange={(e) => setTransferProdId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qty Diminta</label>
              <input type="number" min="1" required value={transferQty} onChange={(e) => setTransferQty(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Pengiriman</label>
              <input type="text" value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} placeholder="Restok mingguan outlet" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setTransferModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Buat Permintaan</button>
          </div>
        </form>
      </ModalShell>

      {/* Receive Physical Transfer Modal */}
      <ModalShell
        open={Boolean(receiveTransfer)}
        onClose={() => setReceiveTransfer(null)}
        headerId="receive-transfer-modal-title"
        title={`Terima Barang Fisik — ${receiveTransfer?.transferNumber ?? ''}`}
        subtitle="Barang baik masuk ke stok cabang tujuan (1105); barang rusak/hilang di jalan dijurnal ke Beban Selisih (6108)."
      >
        <form onSubmit={handleConfirmReceiveTransfer} className="p-6 space-y-4">
          {receiveTransfer?.items.map((it) => {
            const cur = receiveInputs[it.productId] ?? { receivedQty: '0', damagedQty: '0' };
            return (
              <div key={it.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <p className="text-xs font-bold text-slate-900">
                  {it.productName} · Dikirim:{' '}
                  <span className="font-mono">
                    {new Decimal(it.shippedQty || it.requestedQty).toDecimalPlaces(0).toString()} {it.unit}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Diterima Baik</label>
                    <input
                      type="number"
                      min="0"
                      value={cur.receivedQty}
                      onChange={(e) =>
                        setReceiveInputs((prev) => ({
                          ...prev,
                          [it.productId]: { ...cur, receivedQty: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-rose-700 mb-1">Rusak / Hilang di Jalan</label>
                    <input
                      type="number"
                      min="0"
                      value={cur.damagedQty}
                      onChange={(e) =>
                        setReceiveInputs((prev) => ({
                          ...prev,
                          [it.productId]: { ...cur, damagedQty: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono border border-rose-200 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setReceiveTransfer(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Konfirmasi Penerimaan &amp; Jurnal</button>
          </div>
        </form>
      </ModalShell>

      {/* Surat Jalan Printable Modal */}
      <ModalShell
        open={Boolean(suratJalanTransfer)}
        onClose={() => setSuratJalanTransfer(null)}
        headerId="surat-jalan-modal-title"
        title={`Surat Jalan Mutasi Stok — ${suratJalanTransfer?.transferNumber ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            {suratJalanTransfer && (
              <button
                type="button"
                data-testid="download-surat-jalan-pdf-btn"
                onClick={() => handleDownloadSuratJalanPdf(suratJalanTransfer)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Surat Jalan (.pdf)</span>
              </button>
            )}
            <button type="button" onClick={() => setSuratJalanTransfer(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-200 rounded-lg">
              Tutup
            </button>
          </div>
        }
      >
        {suratJalanTransfer && (
          <div className="p-6 space-y-4 text-xs text-slate-800">
            <div className="flex justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{activeWorkspace.tenant.name}</p>
                <p className="text-slate-500">Dokumen Resmi Mutasi Stok Antar Cabang</p>
              </div>
              <div className="text-right font-mono">
                <p className="font-bold">{suratJalanTransfer.transferNumber}</p>
                <p>{suratJalanTransfer.createdAt.slice(0, 10)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-500">Pengirim (Asal):</p>
                <p className="font-bold">{suratJalanTransfer.sourceBranchName}</p>
              </div>
              <div>
                <p className="text-slate-500">Penerima (Tujuan):</p>
                <p className="font-bold">{suratJalanTransfer.destinationBranchName}</p>
              </div>
            </div>
            <table className="w-full border border-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left border-b">Produk</th>
                  <th className="p-2 text-right border-b">Qty Kirim</th>
                  <th className="p-2 text-right border-b">HPP Satuan</th>
                </tr>
              </thead>
              <tbody>
                {suratJalanTransfer.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="p-2 font-medium">{it.productName}</td>
                    <td className="p-2 text-right font-mono">
                      {new Decimal(it.shippedQty || it.requestedQty).toDecimalPlaces(0).toString()} {it.unit}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {formatRupiah(it.unitCostSnapshot ?? it.unitCostAtShip ?? '0')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModalShell>

      {/* Supplier Modal */}
      <ModalShell open={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} headerId="add-supplier-title" title="Tambah Supplier Baru">
        <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Supplier / Distributor</label>
              <input type="text" required value={supName} onChange={(e) => setSupName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">No. Telepon / WA</label>
              <input type="tel" value={supPhone} onChange={(e) => setSupPhone(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Termin Hutang Default (Hari)</label>
              <input type="number" min="0" value={supTermDays} onChange={(e) => setSupTermDays(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat</label>
              <input type="text" value={supAddress} onChange={(e) => setSupAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setSupplierModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Simpan Supplier</button>
          </div>
        </form>
      </ModalShell>

      {/* Create PO Modal */}
      <ModalShell open={poModalOpen} onClose={() => setPoModalOpen(false)} headerId="create-po-title" title="Buat Purchase Order (PO) ke Supplier">
        <form onSubmit={handleCreatePo} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier</label>
              <select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="">Supplier Umum</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gudang / Cabang Penerima</label>
              <select value={poBranchId} onChange={(e) => setPoBranchId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Produk</label>
              <select required value={poProductId} onChange={(e) => setPoProductId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Qty Pesan</label>
              <input type="number" min="1" required value={poQty} onChange={(e) => setPoQty(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Beli Satuan (Rp)</label>
              <input type="number" min="1" required value={poUnitCost} onChange={(e) => setPoUnitCost(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setPoModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Terbitkan PO</button>
          </div>
        </form>
      </ModalShell>

      {/* Receive PO + Landed Cost Modal */}
      <ModalShell open={Boolean(receivePo)} onClose={() => setReceivePo(null)} headerId="receive-po-title" title={`Terima Barang PO — ${receivePo?.poNumber ?? ''}`} subtitle="Ongkos kirim (Landed Cost) akan dibagi proporsional ke HPP Moving Average barang.">
        <form onSubmit={handleReceivePoSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cabang / Gudang Tujuan</label>
              <select value={poReceiveBranchId} onChange={(e) => setPoReceiveBranchId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ongkir / Landed Cost (Rp)</label>
              <input type="number" min="0" value={poLandedShipping} onChange={(e) => setPoLandedShipping(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Metode Pembayaran</label>
              <select value={poPaymentType} onChange={(e) => setPoPaymentType(e.target.value as 'TUNAI' | 'TEMPO_HUTANG')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="TEMPO_HUTANG">Tempo / Hutang Usaha (2101)</option>
                <option value="TUNAI">Tunai / Transfer Lunas</option>
              </select>
            </div>
            {poPaymentType === 'TUNAI' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Akun Pembayaran</label>
                <select value={poPayAccount} onChange={(e) => setPoPayAccount(e.target.value as '1101' | '1102')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                  <option value="1102">Bank / Transfer (1102)</option>
                  <option value="1101">Kas Tunai (1101)</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setReceivePo(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Terima Barang &amp; Posting Jurnal</button>
          </div>
        </form>
      </ModalShell>

      {/* Pay Supplier Debt Modal */}
      <ModalShell open={Boolean(payDebtPo)} onClose={() => setPayDebtPo(null)} headerId="pay-debt-title" title={`Bayar Hutang Supplier — ${payDebtPo?.poNumber ?? ''}`} subtitle="Jurnal otomatis: Debit Utang Usaha (2101), Kredit Kas/Bank.">
        <form onSubmit={handlePayDebtSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nominal Bayar (Rp)</label>
              <input type="number" min="1" required value={debtPayAmount} onChange={(e) => setDebtPayAmount(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dari Akun</label>
              <select value={debtPayAccount} onChange={(e) => setDebtPayAccount(e.target.value as '1101' | '1102')} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="1102">Bank / Transfer (1102)</option>
                <option value="1101">Kas Tunai (1101)</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setPayDebtPo(null)} className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg">Catat Pembayaran Hutang</button>
          </div>
        </form>
      </ModalShell>
    </AppShell>
  );
}
