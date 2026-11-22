import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Edit3,
  Eye,
  Package,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  calculateRecipeFormulationMetrics,
  getVerticalCapabilities,
  isValidProductImageSource,
} from '../../lib/catalog/recipe-bom-utils';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ReceiptPreviewModal } from '../ui/ModalShell';
import type { Product } from '../../types/domain';

interface ProductManagerProps {
  onOpenAddModal: () => void;
  onEditProduct: (product: Product) => void;
  onNotify: (msg: string) => void;
  canManageCatalog?: boolean;
}

export function ProductManager({
  onOpenAddModal,
  onEditProduct,
  onNotify,
  canManageCatalog = true,
}: ProductManagerProps) {
  const { activeWorkspace, deleteProduct } = useApp();

  const isWarungSembako = activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO';

  const verticalCaps = useMemo(
    () => getVerticalCapabilities(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const sellableProducts = useMemo(
    () => activeWorkspace.products.filter((p) => p.itemType !== 'RAW_MATERIAL'),
    [activeWorkspace.products]
  );

  const categoryMap = useMemo(
    () => new Map(activeWorkspace.categories.map((c) => [c.id, c.name])),
    [activeWorkspace.categories]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewReceiptProd, setPreviewReceiptProd] = useState<Product | null>(null);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sellableProducts;
    return sellableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcodeQr.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.productType ?? '').toLowerCase().includes(q)
    );
  }, [sellableProducts, searchQuery]);

  const columns: DataTableColumn<Product>[] = [
    {
      key: 'product',
      header: isWarungSembako ? 'Barang & Spesifikasi' : 'Produk / Menu',
      sortValue: (prod) => prod.name,
      csvHeader: 'Nama Produk',
      csvValue: (prod) => prod.name,
      render: (prod) => {
        const specLine = [prod.productType, prod.brand, prod.sizeLabel]
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="flex items-center gap-3 min-w-0">
            {!isWarungSembako && (
              <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                {isValidProductImageSource(prod.imageUrl) ? (
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-4 h-4 text-slate-300" />
                )}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-semibold text-slate-900 truncate">{prod.name}</p>
                {!prod.isAvailable && (
                  <span className="text-[11px] font-semibold text-rose-600">Nonaktif</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {specLine || prod.description || '—'}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'category',
      header: 'Kategori & SKU',
      sortValue: (prod) => (prod.categoryId && categoryMap.get(prod.categoryId)) || 'Umum',
      csvHeader: 'Kategori & SKU',
      csvValue: (prod) =>
        `${(prod.categoryId && categoryMap.get(prod.categoryId)) || 'Umum'} | ${prod.sku}`,
      render: (prod) => (
        <div>
          <p className="font-medium text-slate-800">
            {(prod.categoryId && categoryMap.get(prod.categoryId)) || 'Umum'}
          </p>
          <p className="text-[11px] font-mono text-slate-500">
            {prod.sku} · {prod.unit}
          </p>
        </div>
      ),
    },
    {
      key: 'stock_bom',
      header: isWarungSembako ? 'Stok & Bukti Nota' : 'Stok / Resep BOM',
      sortValue: (prod) => Number(prod.stockQty || 0),
      csvHeader: 'Stok',
      csvValue: (prod) => `${new Decimal(prod.stockQty || '0').toFixed(2)} ${prod.unit}`,
      render: (prod) => {
        const linkedRecipes = activeWorkspace.recipes.filter(
          (r) => r.menuProductId === prod.id
        );
        const recipeMetrics =
          prod.itemType === 'MENU_ITEM' && linkedRecipes.length > 0
            ? calculateRecipeFormulationMetrics(
                linkedRecipes.map((r) => ({
                  ingredientProductId: r.ingredientProductId,
                  quantityRequired: r.quantityRequired,
                })),
                activeWorkspace.products,
                1
              )
            : null;

        return (
          <div className="space-y-1">
            {prod.itemType === 'RETAIL_GOODS' ? (
              <p className="font-mono font-semibold text-slate-800 whitespace-nowrap">
                {new Decimal(prod.stockQty || '0').toFixed(0)} {prod.unit}
              </p>
            ) : recipeMetrics ? (
              <p className="text-emerald-700 font-medium whitespace-nowrap">
                BOM ({linkedRecipes.length} bahan · {recipeMetrics.maxCraftablePortions} porsi)
              </p>
            ) : (
              <span className="text-slate-400">—</span>
            )}
            {prod.purchaseReceiptImageUrl && (
              <button
                type="button"
                onClick={() => setPreviewReceiptProd(prod)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline"
              >
                <Eye className="w-3 h-3" />
                <span>Lihat Bukti Nota</span>
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'pricing',
      header: 'Harga Jual / HPP / Laba',
      align: 'right',
      sortValue: (prod) => Number(prod.sellingPrice || 0),
      csvHeader: 'Harga Jual (Rp)',
      csvValue: (prod) => new Decimal(prod.sellingPrice || '0').toFixed(2),
      render: (prod) => {
        const sell = new Decimal(prod.sellingPrice || '0');
        const cost = new Decimal(prod.costPriceAvg || '0');
        const profit = sell.minus(cost);
        return (
          <div className="font-mono tabular-nums whitespace-nowrap">
            <p className="font-bold text-slate-900">{formatRupiah(sell)}</p>
            <p className="text-[11px] text-slate-500">
              HPP {formatRupiah(cost)} ·{' '}
              <span className={profit.gte(0) ? 'text-emerald-700 font-semibold' : 'text-rose-600'}>
                +{formatRupiah(profit)}
              </span>
            </p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (prod) =>
        canManageCatalog ? (
          <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={() => onEditProduct(prod)}
              aria-label={`Edit ${prod.name}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            {confirmDeleteId === prod.id ? (
              <button
                type="button"
                onClick={() => {
                  deleteProduct(prod.id);
                  setConfirmDeleteId(null);
                  onNotify(`Item "${prod.name}" telah dihapus.`);
                }}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Ya, Hapus
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(prod.id)}
                aria-label={`Hapus ${prod.name}`}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Hanya Lihat</span>
        ),
    },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Toolbar: Search + Single Clean Add Item Trigger */}
      <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <label htmlFor="catalog-product-search" className="sr-only">
            Cari nama produk, jenis, merek, SKU, atau barcode
          </label>
          <input
            id="catalog-product-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama produk, jenis, merek, SKU, atau barcode..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {filteredProducts.length} item
          </span>
          {canManageCatalog && (
            <button
              type="button"
              onClick={onOpenAddModal}
              data-testid="open-add-item-modal-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>
                {verticalCaps.vertical === 'WARUNG_SEMBAKO'
                  ? 'Tambah Barang'
                  : verticalCaps.vertical === 'FREELANCE'
                  ? 'Tambah Jasa'
                  : 'Tambah Item / Menu'}
              </span>
            </button>
          )}
        </div>
      </div>

      <DataTable
        data={filteredProducts}
        columns={columns}
        getRowKey={(prod) => prod.id}
        defaultPageSize={10}
        exportFilename="katalog-produk"
        testId="products-datatable"
        emptyState={
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {searchQuery.trim()
                ? `Tidak ada item yang cocok dengan "${searchQuery}".`
                : 'Belum ada item katalog terdaftar.'}
            </p>
            {!searchQuery.trim() && canManageCatalog && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Item Pertama</span>
              </button>
            )}
          </div>
        }
      />

      <ReceiptPreviewModal
        receipt={
          previewReceiptProd?.purchaseReceiptImageUrl
            ? {
                imageUrl: previewReceiptProd.purchaseReceiptImageUrl,
                title: previewReceiptProd.name,
                receiptNumber: previewReceiptProd.purchaseReceiptNumber,
                supplierName: previewReceiptProd.supplierName,
              }
            : null
        }
        onClose={() => setPreviewReceiptProd(null)}
      />
    </section>
  );
}
