import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Percent,
  Plus,
  Upload,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { AddEditItemModal } from '../components/catalog/AddEditItemModal';
import { ProductManager } from '../components/catalog/ProductManager';
import { RecipeBomManager } from '../components/catalog/RecipeBomManager';
import { RawMaterialStockManager } from '../components/catalog/RawMaterialStockManager';
import { SellingPriceSimulator } from '../components/catalog/SellingPriceSimulator';
import { TaxonomyManager } from '../components/catalog/TaxonomyManager';
import { ShoppingNotePanel } from '../components/inventory/ShoppingNotePanel';
import { ModalShell } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import { canUsePricingSimulator } from '../lib/catalog/pricing-simulator';
import { getVerticalCapabilities } from '../lib/catalog/recipe-bom-utils';
import {
  computeBulkRepricingPreview,
  type BulkRepriceMode,
} from '../lib/analytics/owner-insights-engine';
import { downloadShelfLabelsPdf } from '../lib/pdf/shelf-label-pdf';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  buildCatalogCsvTemplate,
  exportCatalogToCsv,
  parseCatalogCsv,
} from '../lib/catalog/csv-catalog';
import { hasStaffPermission } from '../lib/rbac/staff-rbac';
import type { Product, RecipeTemplate } from '../types/domain';

export type CatalogSectionId =
  | 'PRODUCTS'
  | 'CATEGORIES'
  | 'STOCK_RAW'
  | 'BOM_RECIPES'
  | 'RESTOCK_FAST';

export function CatalogInventoryPage({
  activeSection = 'PRODUCTS',
}: {
  activeSection?: CatalogSectionId;
}) {
  const { activeWorkspace, session, navigate, addProduct, addCategory, updateProduct } = useApp();
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const verticalCaps = useMemo(
    () => getVerticalCapabilities(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const canManageCatalog = hasStaffPermission(session, 'CATALOG_MANAGE');
  const hasPricingSim = canUsePricingSimulator(
    activeWorkspace.tenant.subscriptionPlan,
    activeWorkspace.tenant.activeAddOns
  );
  const supportsShelfLabels =
    activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO' ||
    activeWorkspace.tenant.vertical === 'TOKO_RETAIL';

  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [preselectedTemplate, setPreselectedTemplate] = useState<RecipeTemplate | null>(null);
  const [pricingSimOpen, setPricingSimOpen] = useState(false);
  const [simHpp, setSimHpp] = useState('20000');
  const [simSellingPrice, setSimSellingPrice] = useState('28000');

  // Bulk Repricing Modal State (Unlocked when hasPricingSim is true)
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('ALL');
  const [bulkMode, setBulkMode] = useState<BulkRepriceMode>('MARKUP_FROM_HPP');
  const [bulkValue, setBulkValue] = useState<string>('20');
  const [bulkRounding, setBulkRounding] = useState<0 | 100 | 500 | 1000>(500);

  const bulkPreviewRows = useMemo(
    () =>
      bulkModalOpen
        ? computeBulkRepricingPreview(activeWorkspace.products, activeWorkspace.categories, {
            categoryIdFilter: bulkCategoryId,
            mode: bulkMode,
            value: bulkValue,
            roundingStep: bulkRounding,
          })
        : [],
    [
      bulkModalOpen,
      activeWorkspace.products,
      activeWorkspace.categories,
      bulkCategoryId,
      bulkMode,
      bulkValue,
      bulkRounding,
    ]
  );

  const flashNotice = (msg: string) => {
    setErrorMsg(null);
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 5000);
  };

  const flashError = (msg: string) => {
    setNotice(null);
    setErrorMsg(msg);
  };

  const openAddNewItemModal = () => {
    setEditingProduct(null);
    setPreselectedTemplate(null);
    setItemModalOpen(true);
  };

  const openEditItemModal = (prod: Product) => {
    setPreselectedTemplate(null);
    setEditingProduct(prod);
    setItemModalOpen(true);
  };

  const handleCreateMenuFromTemplate = (tpl: RecipeTemplate) => {
    setEditingProduct(null);
    setPreselectedTemplate(tpl);
    setItemModalOpen(true);
  };

  const handlePrintShelfLabels = () => {
    const filename = downloadShelfLabelsPdf({
      tenantName: activeWorkspace.tenant.name,
      products: activeWorkspace.products,
      categories: activeWorkspace.categories,
    });
    if (filename) {
      flashNotice(`File PDF label harga rak "${filename}" berhasil diunduh dan siap cetak A4.`);
    } else {
      flashError('Belum ada produk aktif untuk dicetak label harganya.');
    }
  };

  const handleApplyBulkReprice = () => {
    if (bulkPreviewRows.length === 0) return;
    let updatedCount = 0;
    for (const row of bulkPreviewRows) {
      if (row.newPrice !== row.currentPrice) {
        updateProduct(row.productId, { sellingPrice: row.newPrice });
        updatedCount += 1;
      }
    }
    setBulkModalOpen(false);
    flashNotice(
      updatedCount > 0
        ? `Harga jual ${updatedCount} produk berhasil diperbarui secara massal.`
        : 'Tidak ada perubahan harga yang perlu disimpan.'
    );
  };

  const triggerDownloadCsvFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsvTemplate = () => {
    const csv = buildCatalogCsvTemplate();
    triggerDownloadCsvFile(csv, 'template-katalog-kasirakun.csv');
    flashNotice('Template CSV berhasil diunduh. Isi di Excel/Google Sheets lalu unggah lewat Import CSV.');
  };

  const handleExportCatalogCsv = () => {
    const csv = exportCatalogToCsv(activeWorkspace.products, activeWorkspace.categories);
    const safeSlug = activeWorkspace.tenant.slug || 'katalog';
    triggerDownloadCsvFile(csv, `katalog-${safeSlug}.csv`);
    flashNotice(`Daftar ${activeWorkspace.products.length} item berhasil diekspor ke file CSV.`);
  };

  const handleImportCatalogCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const defaultItemType: Product['itemType'] =
        activeWorkspace.tenant.vertical === 'FREELANCE'
          ? 'SERVICE_FREELANCE'
          : verticalCaps.supportsRawMaterialsAndBom
          ? 'MENU_ITEM'
          : 'RETAIL_GOODS';

      const parsed = parseCatalogCsv(text);
      if (parsed.items.length === 0) {
        flashError(
          parsed.errors[0] ||
            'Tidak ada baris produk valid di file CSV. Pastikan kolom Nama Barang dan Harga Jual terisi.'
        );
        return;
      }

      const categoryMap = new Map<string, string>();
      for (const cat of activeWorkspace.categories) {
        categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
      }

      let importedCount = 0;
      for (const row of parsed.items) {
        let categoryId: string | null = activeWorkspace.categories[0]?.id ?? null;
        if (row.categoryName) {
          const key = row.categoryName.trim().toLowerCase();
          const existingCatId = categoryMap.get(key);
          if (existingCatId) {
            categoryId = existingCatId;
          } else {
            const created = addCategory(row.categoryName.trim());
            categoryMap.set(key, created.id);
            categoryId = created.id;
          }
        }
        addProduct({
          categoryId,
          sku: row.sku,
          barcodeQr: row.barcodeQr,
          name: row.name,
          description: 'Diimpor dari file CSV katalog.',
          itemType: defaultItemType,
          unit: row.unit,
          sellingPrice: row.sellingPrice,
          costPriceAvg: row.costPriceAvg,
          stockQty: row.stockQty,
          minStockAlert: row.minStockAlert,
          isLuxuryGoods: false,
          isTaxExempt: row.isTaxExempt,
          isAvailable: true,
          customAttributes: {},
        });
        importedCount += 1;
      }

      const skippedInfo =
        parsed.errors.length > 0
          ? ` (${parsed.errors.length} baris dilewati: ${parsed.errors[0]})`
          : '';
      flashNotice(`${importedCount} item berhasil diimpor dari "${file.name}"${skippedInfo}.`);
    } catch {
      flashError('Gagal membaca file CSV. Pastikan format file adalah .csv yang valid.');
    }
  };

  const headerMeta = useMemo(() => {
    switch (activeSection) {
      case 'CATEGORIES':
        return {
          title: 'Kategori, Merek & Satuan',
          subtitle: 'Atur master kategori, jenis barang, merek, ukuran kemasan, dan satuan produk agar katalog tetap rapi.',
        };
      case 'STOCK_RAW':
        return {
          title: 'Bahan Mentah Dapur',
          subtitle: 'Kelola daftar bahan baku, stok gudang dapur, dan harga beli rata-rata untuk bahan Resep BOM.',
        };
      case 'BOM_RECIPES':
        return {
          title: 'Resep BOM & HPP Otomatis',
          subtitle: 'Susun takaran bahan mentah per porsi menu agar HPP dan pemotongan stok dapur terhitung otomatis setiap penjualan.',
        };
      case 'RESTOCK_FAST':
        return {
          title: verticalCaps.supportsRawMaterialsAndBom
            ? 'Belanja Bahan Cepat (Tunai)'
            : 'Kulakan Cepat (Tunai)',
          subtitle:
            'Catat belanja barang langsung dari pasar/agen grosir, unggah foto nota, update modal rata-rata & catat otomatis di pembukuan.',
        };
      case 'PRODUCTS':
      default: {
        const v = activeWorkspace.tenant.vertical;
        let title = 'Daftar Barang & Harga Jual';
        if (v === 'BARBERSHOP' || v === 'BARBERSHOP_SALON') {
          title = 'Daftar Layanan Cukur & Produk Barber';
        } else if (v === 'SALON_KECANTIKAN') {
          title = 'Daftar Treatment Salon & Produk Kecantikan';
        } else if (v === 'SPA_WELLNESS') {
          title = 'Daftar Paket SPA, Refleksi & Produk';
        } else if (v === 'LAUNDRY') {
          title = 'Daftar Tarif Laundry Kiloan & Satuan';
        } else if (v === 'CUCI_KENDARAAN') {
          title = 'Daftar Paket Cuci Motor, Mobil & Detailing';
        } else if (v === 'TOKO_FASHION') {
          title = 'Katalog Fashion, Ukuran & Warna';
        } else if (v === 'TOKO_BANGUNAN') {
          title = 'Katalog Material Bangunan (Eceran & Grosir)';
        } else if (v === 'MANUFAKTUR_KECIL') {
          title = 'Produk Jadi & Bahan Baku Produksi';
        } else if (v === 'PET_SHOP') {
          title = 'Produk Pet Shop & Paket Grooming';
        } else if (v === 'FREELANCE' || v === 'BIMBEL_KURSUS_GYM') {
          title = 'Daftar Paket & Layanan Jasa';
        } else if (verticalCaps.supportsRawMaterialsAndBom) {
          title = 'Menu & Produk Jual';
        }
        return {
          title,
          subtitle: verticalCaps.catalogSubtitle,
        };
      }
    }
  }, [activeSection, activeWorkspace.tenant.vertical, verticalCaps]);

  return (
    <AppShell
      title={headerMeta.title}
      subtitle={headerMeta.subtitle}
      primaryAction={
        activeSection === 'PRODUCTS' && canManageCatalog ? (
          <div className="flex flex-wrap items-center gap-2">
            {supportsShelfLabels && (
              <button
                type="button"
                onClick={handlePrintShelfLabels}
                data-testid="print-shelf-labels-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Barcode className="w-3.5 h-3.5 text-stone-600" strokeWidth={1.75} />
                <span>Label Harga Rak PDF</span>
              </button>
            )}
            {hasPricingSim && (
              <>
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(true)}
                  data-testid="bulk-reprice-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Percent className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                  <span>Ubah Harga Massal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingSimOpen(true)}
                  data-testid="navbar-pricing-sim-btn"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Calculator className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                  <span>Simulasi Harga Jual</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openAddNewItemModal}
              data-testid="navbar-add-item-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>
                {verticalCaps.vertical === 'WARUNG_SEMBAKO' || verticalCaps.vertical === 'TOKO_RETAIL'
                  ? 'Tambah Barang'
                  : verticalCaps.vertical === 'FREELANCE'
                  ? 'Tambah Jasa'
                  : 'Tambah Item'}
              </span>
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6" data-testid={`catalog-section-${activeSection.toLowerCase()}`}>
        {notice && (
          <div
            role="status"
            className="flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-medium text-rose-900 bg-rose-50 border border-rose-200 rounded-xl"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Dedicated View 1: Master Produk / Menu / Layanan */}
        {activeSection === 'PRODUCTS' && (
          <div className="space-y-4">
            {canManageCatalog && (
              <div
                data-testid="catalog-csv-toolbar"
                className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-stone-900">
                    Import &amp; Export Massal (Excel / CSV)
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Punya puluhan atau ratusan barang? Unduh template, isi di Excel, lalu unggah sekaligus.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => void handleImportCatalogCsv(e)}
                    className="sr-only"
                    aria-label="Pilih file CSV katalog"
                  />
                  <button
                    type="button"
                    data-testid="catalog-csv-template-btn"
                    onClick={handleDownloadCsvTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-stone-600" strokeWidth={1.75} />
                    <span>Template CSV</span>
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-csv-export-btn"
                    onClick={handleExportCatalogCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-stone-600" strokeWidth={1.75} />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-csv-import-btn"
                    onClick={() => csvInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                    <span>Import CSV</span>
                  </button>
                </div>
              </div>
            )}
            <ProductManager
              onOpenAddModal={openAddNewItemModal}
              onEditProduct={openEditItemModal}
              onNotify={flashNotice}
              canManageCatalog={canManageCatalog}
            />
          </div>
        )}

        {/* Dedicated View 2: Kategori, Merek & Satuan */}
        {activeSection === 'CATEGORIES' && (
          <TaxonomyManager
            categoryTabLabel={verticalCaps.categoryTabLabel}
            onNotify={flashNotice}
          />
        )}

        {/* Dedicated View 3: Bahan Mentah Dapur (F&B) */}
        {activeSection === 'STOCK_RAW' && (
          <RawMaterialStockManager
            mode="FB_RAW_MATERIALS"
            onNotify={flashNotice}
            onError={flashError}
          />
        )}

        {/* Dedicated View 4: Kulakan Cepat / Belanja Tunai + Daftar Catatan Belanja Siap Cetak */}
        {activeSection === 'RESTOCK_FAST' && (
          <div className="space-y-6">
            <ShoppingNotePanel onNotify={flashNotice} />
            <RawMaterialStockManager
              mode={verticalCaps.supportsRawMaterialsAndBom ? 'FB_RAW_MATERIALS' : 'RETAIL_PROCUREMENT'}
              onNotify={flashNotice}
              onError={flashError}
            />
          </div>
        )}

        {/* Dedicated View 5: Resep BOM & HPP */}
        {activeSection === 'BOM_RECIPES' && verticalCaps.supportsRawMaterialsAndBom && (
          <RecipeBomManager
            onNotify={flashNotice}
            onError={flashError}
            onCreateMenuFromTemplate={handleCreateMenuFromTemplate}
            onGoToRawMaterials={() => navigate('/catalog/raw-materials')}
          />
        )}
      </div>

      {/* Add / Edit Item Modal */}
      <AddEditItemModal
        open={itemModalOpen}
        editingProduct={editingProduct}
        preselectedTemplate={preselectedTemplate}
        onClose={() => {
          setItemModalOpen(false);
          setEditingProduct(null);
          setPreselectedTemplate(null);
        }}
        onNotify={flashNotice}
        onError={flashError}
        onGoToBomTab={
          verticalCaps.supportsRawMaterialsAndBom
            ? () => navigate('/catalog/recipes')
            : undefined
        }
        onGoToCategoriesTab={() => navigate('/catalog/taxonomy')}
      />

      {/* Standalone Quick Selling Price & Anti-Minus Simulator Modal (Only when unlocked) */}
      {hasPricingSim && (
        <ModalShell
          open={pricingSimOpen}
          onClose={() => setPricingSimOpen(false)}
          headerId="pricing-simulator-modal-title"
          title="Simulasi Harga Jual & Cek Anti-Rugi"
          subtitle="Hitung harga jual aman dari modal beli (HPP), biaya operasional, potongan QRIS, dan pajak."
          maxWidthClass="max-w-2xl"
        >
          <div className="p-6 space-y-4">
            <SellingPriceSimulator
              planCode={activeWorkspace.tenant.subscriptionPlan}
              activeAddOns={activeWorkspace.tenant.activeAddOns}
              vertical={activeWorkspace.tenant.vertical}
              isPkp={activeWorkspace.tenant.isPkp}
              costPrice={simHpp}
              currentSellingPrice={simSellingPrice}
              allowEditCostPrice
              onCostPriceChange={setSimHpp}
              onApplySellingPrice={(recommended) => {
                setSimSellingPrice(recommended);
                flashNotice(
                  `Hasil simulasi harga jual aman: Rp${Number(recommended).toLocaleString('id-ID')}.`
                );
              }}
              onUpgradePlan={() => {
                setPricingSimOpen(false);
                navigate('/subscription');
              }}
            />
          </div>
        </ModalShell>
      )}

      {/* Bulk Repricing Modal (Only when Pricing Simulator is unlocked) */}
      {hasPricingSim && (
        <ModalShell
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          headerId="bulk-reprice-modal-header"
          testId="bulk-reprice-modal"
          title="Sesuaikan Harga Jual Massal"
          subtitle="Ubah harga jual sekaligus per kategori berdasarkan persentase dari HPP atau selisih Rupiah."
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-stone-500">
                Menampilkan pratinjau {bulkPreviewRows.length} produk sebelum disimpan.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-stone-700 border border-stone-200 hover:bg-stone-50 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={bulkPreviewRows.length === 0}
                  onClick={handleApplyBulkReprice}
                  data-testid="bulk-reprice-apply-btn"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg"
                >
                  Terapkan ke {bulkPreviewRows.length} Produk
                </button>
              </div>
            </div>
          }
        >
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Kategori</label>
                <select
                  value={bulkCategoryId}
                  onChange={(e) => setBulkCategoryId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  <option value="ALL">Semua Kategori</option>
                  {activeWorkspace.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Cara Hitung</label>
                <select
                  value={bulkMode}
                  onChange={(e) => setBulkMode(e.target.value as BulkRepriceMode)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  <option value="MARKUP_FROM_HPP">Naikkan % dari HPP</option>
                  <option value="PCT_CURRENT_PRICE">Ubah % dari Harga Kini</option>
                  <option value="ADD_FIXED_RP">Tambah / Kurang Rp</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {bulkMode === 'ADD_FIXED_RP' ? 'Nominal (Rp)' : 'Persentase (%)'}
                </label>
                <input
                  type="number"
                  step={bulkMode === 'ADD_FIXED_RP' ? '500' : '1'}
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono tabular-nums bg-white border border-stone-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Pembulatan</label>
                <select
                  value={bulkRounding}
                  onChange={(e) =>
                    setBulkRounding(Number(e.target.value) as 0 | 100 | 500 | 1000)
                  }
                  className="w-full px-2.5 py-2 text-xs bg-white border border-stone-200 rounded-lg"
                >
                  <option value={0}>Tanpa pembulatan</option>
                  <option value={100}>Rp100</option>
                  <option value={500}>Rp500</option>
                  <option value={1000}>Rp1.000</option>
                </select>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Produk</th>
                    <th className="py-2 px-3 text-right">HPP</th>
                    <th className="py-2 px-3 text-right">Harga Lama</th>
                    <th className="py-2 px-3 text-right">Harga Baru</th>
                    <th className="py-2 px-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {bulkPreviewRows.map((row) => (
                    <tr key={row.productId}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-stone-900">{row.name}</p>
                        <p className="text-[11px] text-stone-500">{row.categoryName}</p>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-600">
                        {formatRupiah(row.costPrice)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-600">
                        {formatRupiah(row.currentPrice)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatRupiah(row.newPrice)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-stone-700">
                        {row.marginPctAfter}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </ModalShell>
      )}
    </AppShell>
  );
}
