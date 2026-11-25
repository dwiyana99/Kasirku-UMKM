import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  FileText,
  FlaskConical,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  calculateRecipeFormulationMetrics,
  deriveRecipeTemplatesFromWorkspace,
  getVerticalCapabilities,
  isValidProductImageSource,
} from '../../lib/catalog/recipe-bom-utils';
import { uploadImageWithS3Fallback } from '../../lib/catalog/image-upload';
import {
  buildSuggestedProductName,
  getBrandsForSelection,
  getEffectiveTaxonomy,
  getProductTypesForCategory,
  getSizesForSelection,
  getUnitsForSelection,
  WEIGHT_VOLUME_MEASUREMENT_UNITS,
} from '../../lib/catalog/taxonomy-presets';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { canUsePricingSimulator } from '../../lib/catalog/pricing-simulator';
import { ModalShell } from '../ui/ModalShell';
import { LiteSimpleMarginHelper } from './LiteSimpleMarginHelper';
import { SellingPriceSimulator } from './SellingPriceSimulator';
import type {
  ItemType,
  Product,
  RecipeTemplate,
  RecipeTemplateIngredient,
} from '../../types/domain';

interface AddEditItemModalProps {
  open: boolean;
  editingProduct: Product | null;
  preselectedTemplate?: RecipeTemplate | null;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onGoToBomTab?: () => void;
  onGoToCategoriesTab?: () => void;
}

export function AddEditItemModal({
  open,
  editingProduct,
  preselectedTemplate,
  onClose,
  onNotify,
  onError,
  onGoToBomTab,
  onGoToCategoriesTab,
}: AddEditItemModalProps) {
  const {
    activeWorkspace,
    session,
    addProduct,
    updateProduct,
    saveProductRecipes,
    navigate,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement | null>(null);

  const isWarungSembako = activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO';

  const verticalCaps = useMemo(
    () => getVerticalCapabilities(activeWorkspace.tenant.vertical),
    [activeWorkspace.tenant.vertical]
  );

  const taxonomy = useMemo(
    () => getEffectiveTaxonomy(activeWorkspace),
    [activeWorkspace]
  );

  const recipeTemplates = useMemo(
    () => deriveRecipeTemplatesFromWorkspace(activeWorkspace),
    [activeWorkspace]
  );

  const rawMaterials = useMemo(
    () => activeWorkspace.products.filter((p) => p.itemType === 'RAW_MATERIAL'),
    [activeWorkspace.products]
  );

  const productCustomFields = useMemo(
    () => activeWorkspace.customFields.filter((f) => f.targetEntity === 'products'),
    [activeWorkspace.customFields]
  );

  // Form state
  const [itemType, setItemType] = useState<ItemType>(verticalCaps.defaultSellableItemType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>(activeWorkspace.categories[0]?.id ?? '');
  const [productType, setProductType] = useState('');
  const [brand, setBrand] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [customSizeAmount, setCustomSizeAmount] = useState('');
  const [customSizeUnit, setCustomSizeUnit] = useState('gram');
  const [sku, setSku] = useState('');
  const [barcodeQr, setBarcodeQr] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPriceAvg, setCostPriceAvg] = useState('');
  const [stockQty, setStockQty] = useState('25');
  const [minStockAlert, setMinStockAlert] = useState('5');
  // Product photo (non-Warung Sembako only)
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  // Purchase receipt proof (Warung Sembako replaces product photo; optional for retail goods)
  const [purchaseReceiptImageUrl, setPurchaseReceiptImageUrl] = useState('');
  const [purchaseReceiptNumber, setPurchaseReceiptNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [isTaxExempt, setIsTaxExempt] = useState(isWarungSembako);
  const [isLuxuryGoods, setIsLuxuryGoods] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [bomRows, setBomRows] = useState<RecipeTemplateIngredient[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  // Initialize form whenever modal opens
  useEffect(() => {
    if (!open) return;
    setLocalError(null);

    if (editingProduct) {
      setItemType(editingProduct.itemType);
      setName(editingProduct.name);
      setDescription(editingProduct.description);
      setCategoryId(editingProduct.categoryId ?? '');
      setProductType(editingProduct.productType ?? '');
      setBrand(editingProduct.brand ?? '');
      setSizeLabel(editingProduct.sizeLabel ?? '');
      setSku(editingProduct.sku);
      setBarcodeQr(editingProduct.barcodeQr);
      setUnit(editingProduct.unit);
      setSellingPrice(new Decimal(editingProduct.sellingPrice || '0').toFixed(0));
      setCostPriceAvg(new Decimal(editingProduct.costPriceAvg || '0').toFixed(0));
      setStockQty(new Decimal(editingProduct.stockQty || '0').toFixed(2));
      setMinStockAlert(new Decimal(editingProduct.minStockAlert || '5').toFixed(2));
      setImageUrl(editingProduct.imageUrl ?? '');
      setPurchaseReceiptImageUrl(editingProduct.purchaseReceiptImageUrl ?? '');
      setPurchaseReceiptNumber(editingProduct.purchaseReceiptNumber ?? '');
      setSupplierName(editingProduct.supplierName ?? '');
      setIsTaxExempt(editingProduct.isTaxExempt);
      setIsLuxuryGoods(editingProduct.isLuxuryGoods);
      setIsAvailable(editingProduct.isAvailable);
      setSelectedTemplateId(editingProduct.recipeTemplateId ?? '');

      const existingRecipes = activeWorkspace.recipes
        .filter((r) => r.menuProductId === editingProduct.id)
        .map((r) => ({
          ingredientProductId: r.ingredientProductId,
          quantityRequired: new Decimal(r.quantityRequired).toString(),
        }));
      setBomRows(existingRecipes);

      const attrs: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(editingProduct.customAttributes || {})) {
        attrs[k] = typeof v === 'boolean' ? v : String(v);
      }
      setCustomValues(attrs);
    } else if (preselectedTemplate) {
      const m = calculateRecipeFormulationMetrics(
        preselectedTemplate.ingredients,
        activeWorkspace.products,
        preselectedTemplate.yieldPortions
      );
      setItemType('MENU_ITEM');
      setName(preselectedTemplate.name.replace(/^Resep\s+/i, ''));
      setDescription(preselectedTemplate.description);
      setCategoryId(activeWorkspace.categories[0]?.id ?? '');
      setProductType('');
      setBrand('');
      setSizeLabel('');
      setSku('');
      setBarcodeQr('');
      setUnit('porsi');
      const suggested = new Decimal(m.unitCost).times(2.2).div(1000).ceil().times(1000);
      setSellingPrice(suggested.gt(0) ? suggested.toFixed(0) : '');
      setCostPriceAvg(new Decimal(m.unitCost).toFixed(0));
      setStockQty('0');
      setMinStockAlert('0');
      setImageUrl('');
      setPurchaseReceiptImageUrl('');
      setPurchaseReceiptNumber('');
      setSupplierName('');
      setIsTaxExempt(false);
      setIsLuxuryGoods(false);
      setIsAvailable(true);
      setSelectedTemplateId(preselectedTemplate.id);
      setBomRows(
        preselectedTemplate.ingredients.map((i) => ({
          ingredientProductId: i.ingredientProductId,
          quantityRequired: i.quantityRequired,
        }))
      );
      setCustomValues({});
    } else {
      const defType = verticalCaps.defaultSellableItemType;
      setItemType(defType);
      setName('');
      setDescription('');
      setCategoryId(activeWorkspace.categories[0]?.id ?? '');
      setProductType('');
      setBrand('');
      setSizeLabel('');
      setSku('');
      setBarcodeQr('');
      setUnit(
        defType === 'MENU_ITEM'
          ? 'porsi'
          : defType === 'SERVICE_FREELANCE'
          ? 'proyek'
          : taxonomy.units[0] ?? 'pcs'
      );
      setSellingPrice('');
      setCostPriceAvg('');
      setStockQty('25');
      setMinStockAlert('5');
      setImageUrl('');
      setPurchaseReceiptImageUrl('');
      setPurchaseReceiptNumber('');
      setSupplierName('');
      setIsTaxExempt(isWarungSembako);
      setIsLuxuryGoods(false);
      setIsAvailable(true);
      setSelectedTemplateId('');
      setBomRows([]);
      setCustomValues({});
    }
  }, [
    open,
    editingProduct,
    preselectedTemplate,
    activeWorkspace.categories,
    activeWorkspace.recipes,
    activeWorkspace.products,
    isWarungSembako,
    taxonomy.units,
    verticalCaps.defaultSellableItemType,
  ]);

  const bomMetrics = useMemo(() => {
    if (itemType !== 'MENU_ITEM' || bomRows.length === 0) return null;
    const validRows = bomRows.filter(
      (r) => r.ingredientProductId && new Decimal(r.quantityRequired || '0').gt(0)
    );
    if (validRows.length === 0) return null;
    return calculateRecipeFormulationMetrics(validRows, activeWorkspace.products, 1);
  }, [itemType, bomRows, activeWorkspace.products]);

  const suggestedName = useMemo(
    () => buildSuggestedProductName({ productType, brand, sizeLabel }),
    [productType, brand, sizeLabel]
  );

  // Cascading / Nesting taxonomy derivation: Kategori -> Jenis -> Merek -> Ukuran -> Satuan
  const cascadingTypeItems = useMemo(
    () => getProductTypesForCategory(taxonomy, categoryId || null),
    [taxonomy, categoryId]
  );

  const selectedTypeObj = useMemo(
    () =>
      cascadingTypeItems.find(
        (t) => t.name.trim().toLowerCase() === productType.trim().toLowerCase()
      ) ?? null,
    [cascadingTypeItems, productType]
  );

  const cascadingBrandItems = useMemo(
    () => getBrandsForSelection(taxonomy, categoryId || null, selectedTypeObj?.id ?? null),
    [taxonomy, categoryId, selectedTypeObj]
  );

  const cascadingSizeItems = useMemo(
    () => getSizesForSelection(taxonomy, categoryId || null, selectedTypeObj?.id ?? null),
    [taxonomy, categoryId, selectedTypeObj]
  );

  const cascadingUnitItems = useMemo(
    () => getUnitsForSelection(taxonomy, categoryId || null, selectedTypeObj?.id ?? null),
    [taxonomy, categoryId, selectedTypeObj]
  );

  const typeOptions = useMemo(() => {
    const base = cascadingTypeItems.map((t) => t.name);
    if (productType && !base.includes(productType)) base.unshift(productType);
    return base;
  }, [cascadingTypeItems, productType]);

  const brandOptions = useMemo(() => {
    const base = cascadingBrandItems.map((b) => b.name);
    if (brand && !base.includes(brand)) base.unshift(brand);
    return base;
  }, [cascadingBrandItems, brand]);

  const sizeOptions = useMemo(() => {
    const base = cascadingSizeItems.map((s) => s.label);
    if (sizeLabel && !base.includes(sizeLabel)) base.unshift(sizeLabel);
    return base;
  }, [cascadingSizeItems, sizeLabel]);

  const unitOptions = useMemo(() => {
    const base = cascadingUnitItems.map((u) => u.name);
    if (unit && !base.includes(unit)) base.unshift(unit);
    return base;
  }, [cascadingUnitItems, unit]);

  const handleCategoryChange = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    const nextTypes = getProductTypesForCategory(taxonomy, nextCategoryId || null);
    const typeStillValid = nextTypes.some(
      (t) => t.name.trim().toLowerCase() === productType.trim().toLowerCase()
    );
    if (!typeStillValid) {
      setProductType('');
      setBrand('');
    } else {
      const matched = nextTypes.find(
        (t) => t.name.trim().toLowerCase() === productType.trim().toLowerCase()
      );
      const nextBrands = getBrandsForSelection(taxonomy, nextCategoryId || null, matched?.id ?? null);
      if (!nextBrands.some((b) => b.name.trim().toLowerCase() === brand.trim().toLowerCase())) {
        setBrand('');
      }
    }
    const nextUnits = getUnitsForSelection(taxonomy, nextCategoryId || null, null);
    if (nextUnits.length > 0 && itemType === 'RETAIL_GOODS') {
      setUnit(nextUnits[0].name);
    }
  };

  const handleProductTypeChange = (nextTypeName: string) => {
    setProductType(nextTypeName);
    const matched = cascadingTypeItems.find(
      (t) => t.name.trim().toLowerCase() === nextTypeName.trim().toLowerCase()
    );
    const nextBrands = getBrandsForSelection(taxonomy, categoryId || null, matched?.id ?? null);
    if (!nextBrands.some((b) => b.name.trim().toLowerCase() === brand.trim().toLowerCase())) {
      setBrand('');
    }
    const nextSizes = getSizesForSelection(taxonomy, categoryId || null, matched?.id ?? null);
    if (
      matched &&
      nextSizes.length > 0 &&
      nextSizes[0].productTypeId === matched.id &&
      !sizeLabel
    ) {
      setSizeLabel(nextSizes[0].label);
    }
    const nextUnits = getUnitsForSelection(taxonomy, categoryId || null, matched?.id ?? null);
    if (matched && nextUnits.length > 0 && nextUnits[0].productTypeId === matched.id) {
      setUnit(nextUnits[0].name);
    }
  };

  const applyCustomWeightSize = () => {
    const cleanAmt = customSizeAmount.trim();
    if (!cleanAmt) return;
    setSizeLabel(`${cleanAmt} ${customSizeUnit}`);
    setCustomSizeAmount('');
  };

  const handleItemTypeChange = (nextType: ItemType) => {
    setItemType(nextType);
    if (nextType === 'MENU_ITEM') {
      setUnit('porsi');
      setIsTaxExempt(false);
    } else if (nextType === 'RETAIL_GOODS') {
      setUnit(taxonomy.units[0] ?? 'pcs');
      setSelectedTemplateId('');
      setBomRows([]);
    } else if (nextType === 'SERVICE_FREELANCE') {
      setUnit('proyek');
      setSelectedTemplateId('');
      setBomRows([]);
    }
  };

  const handleSelectBomTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = recipeTemplates.find((t) => t.id === tplId);
    if (!tpl) {
      setBomRows([]);
      return;
    }
    setBomRows(
      tpl.ingredients.map((i) => ({
        ingredientProductId: i.ingredientProductId,
        quantityRequired: i.quantityRequired,
      }))
    );
    const m = calculateRecipeFormulationMetrics(
      tpl.ingredients,
      activeWorkspace.products,
      tpl.yieldPortions
    );
    setCostPriceAvg(new Decimal(m.unitCost).toFixed(0));
  };

  const addBomRow = () => {
    if (rawMaterials.length === 0) return;
    setSelectedTemplateId('');
    setBomRows((prev) => [
      ...prev,
      { ingredientProductId: rawMaterials[0].id, quantityRequired: '0.05' },
    ]);
  };

  const updateBomRow = (index: number, patch: Partial<RecipeTemplateIngredient>) => {
    setSelectedTemplateId('');
    setBomRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeBomRow = (index: number) => {
    setSelectedTemplateId('');
    setBomRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadProductImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setLocalError(null);
    try {
      const uploaded = await uploadImageWithS3Fallback(file, {
        tenantId: activeWorkspace.tenant.id,
        folder: 'products',
        authToken: session.token,
        maxDim: 640,
      });
      setImageUrl(uploaded.url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal memproses file gambar.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadReceiptImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setLocalError(null);
    try {
      const uploaded = await uploadImageWithS3Fallback(file, {
        tenantId: activeWorkspace.tenant.id,
        folder: 'receipts',
        authToken: session.token,
        maxDim: 800,
      });
      setPurchaseReceiptImageUrl(uploaded.url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal memproses foto bukti pembelian.');
    } finally {
      setUploadingReceipt(false);
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const effectiveName = name.trim() || suggestedName;
    if (!effectiveName) {
      setLocalError('Nama produk / item wajib diisi (atau pilih Jenis + Merek + Ukuran).');
      return;
    }
    const sellDec = new Decimal(sellingPrice || '0');
    if (sellDec.lte(0)) {
      setLocalError('Harga jual harus lebih besar dari Rp0.');
      return;
    }

    const validBomRows =
      itemType === 'MENU_ITEM'
        ? bomRows.filter(
            (r) => r.ingredientProductId && new Decimal(r.quantityRequired || '0').gt(0)
          )
        : [];

    const effectiveCost =
      itemType === 'MENU_ITEM' && bomMetrics
        ? bomMetrics.unitCost
        : new Decimal(costPriceAvg || '0').toFixed(4);

    const cleanAttrs: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(customValues)) {
      cleanAttrs[k] = v;
    }

    const payload: Omit<Product, 'id' | 'tenantId' | 'createdAt'> = {
      categoryId: categoryId || null,
      productType: productType.trim() || undefined,
      brand: brand.trim() || undefined,
      sizeLabel: sizeLabel.trim() || undefined,
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      barcodeQr: barcodeQr.trim() || `899${Date.now().toString().slice(-9)}`,
      name: effectiveName,
      description:
        description.trim() ||
        (itemType === 'MENU_ITEM'
          ? 'Menu siap saji.'
          : itemType === 'SERVICE_FREELANCE'
          ? 'Layanan profesional.'
          : [productType, brand, sizeLabel].filter(Boolean).join(' · ') || 'Barang dagangan ritel.'),
      // Warung Sembako omits product photo and stores purchase receipt proof instead
      imageUrl: isWarungSembako ? undefined : imageUrl.trim() || undefined,
      purchaseReceiptImageUrl: purchaseReceiptImageUrl.trim() || undefined,
      purchaseReceiptNumber: purchaseReceiptNumber.trim() || undefined,
      supplierName: supplierName.trim() || undefined,
      itemType,
      unit: unit.trim() || (itemType === 'MENU_ITEM' ? 'porsi' : 'pcs'),
      sellingPrice: sellDec.toFixed(4),
      costPriceAvg: effectiveCost,
      stockQty:
        itemType === 'RETAIL_GOODS'
          ? new Decimal(stockQty || '0').toFixed(4)
          : '0.0000',
      minStockAlert:
        itemType === 'RETAIL_GOODS'
          ? new Decimal(minStockAlert || '5').toFixed(4)
          : '0.0000',
      isLuxuryGoods,
      isTaxExempt,
      isAvailable,
      recipeTemplateId: itemType === 'MENU_ITEM' ? selectedTemplateId || null : null,
      customAttributes: cleanAttrs,
    };

    try {
      let targetId: string;
      if (editingProduct) {
        updateProduct(editingProduct.id, payload);
        targetId = editingProduct.id;
      } else {
        const created = addProduct(payload);
        targetId = created.id;
      }

      if (itemType === 'MENU_ITEM' && validBomRows.length > 0) {
        const res = saveProductRecipes(
          targetId,
          validBomRows.map((row) => ({
            ingredientProductId: row.ingredientProductId,
            quantityRequired: new Decimal(row.quantityRequired).toFixed(4),
          }))
        );
        onNotify(
          `"${payload.name}" tersimpan dengan Resep BOM (${validBomRows.length} bahan, HPP ${formatRupiah(res.unitCost)}).`
        );
      } else {
        onNotify(
          editingProduct
            ? `Item "${payload.name}" berhasil diperbarui.`
            : `Item "${payload.name}" berhasil ditambahkan ke katalog.`
        );
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan item.';
      setLocalError(msg);
      onError(msg);
    }
  };

  const isMenuType = itemType === 'MENU_ITEM';
  const isRetailType = itemType === 'RETAIL_GOODS';

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      headerId="add-item-modal-header"
      title={
        editingProduct
          ? `Edit Item: ${editingProduct.name}`
          : isWarungSembako
          ? 'Tambah Barang Sembako Baru'
          : 'Tambah Item Katalog Baru'
      }
      subtitle={
        isWarungSembako
          ? 'Pilih kategori, jenis, merek, ukuran & satuan dari master — unggah bukti nota pembelian bila ada.'
          : 'Kolom formulir otomatis menyesuaikan jenis item (Menu BOM vs Barang Ritel/Stok).'
      }
      testId="add-item-modal"
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
        {localError && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg"
          >
            {localError}
          </div>
        )}

        {/* Row 1: Item Type & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cat-item-type" className="block text-xs font-semibold text-slate-700 mb-1">
              Jenis Item (item_type) *
            </label>
            <select
              id="cat-item-type"
              value={itemType}
              onChange={(e) => handleItemTypeChange(e.target.value as ItemType)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            >
              {verticalCaps.supportsRawMaterialsAndBom && (
                <option value="MENU_ITEM">MENU_ITEM — Menu Dapur (Resep BOM)</option>
              )}
              <option value="RETAIL_GOODS">RETAIL_GOODS — Barang Ritel / Sembako (Stok)</option>
              {verticalCaps.vertical === 'FREELANCE' && (
                <option value="SERVICE_FREELANCE">SERVICE_FREELANCE — Paket Jasa / Layanan</option>
              )}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="cat-category" className="block text-xs font-semibold text-slate-700">
                Kategori *
              </label>
              {onGoToCategoriesTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToCategoriesTab();
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline"
                >
                  Atur Master →
                </button>
              )}
            </div>
            <select
              id="cat-category"
              data-testid="select-category"
              value={categoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            >
              <option value="">-- Pilih Kategori --</option>
              {activeWorkspace.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Structured Cascading Classification (Kategori -> Jenis -> Merek -> Ukuran/Berat -> Satuan) */}
        <div
          data-testid="modal-taxonomy-selectors"
          className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800">
                Spesifikasi Bertingkat (Kategori → Jenis → Merek → Ukuran/Berat → Satuan)
              </p>
              <p className="text-[11px] text-slate-500">
                Pilihan Jenis, Merek, Ukuran &amp; Satuan otomatis tersaring sesuai Kategori di atas.
                Jumlah stok diisi terpisah di bagian stok.
              </p>
            </div>
            {suggestedName && (
              <button
                type="button"
                onClick={() => setName(suggestedName)}
                data-testid="compose-suggested-name-btn"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md"
              >
                <Sparkles className="w-3 h-3" />
                <span>Susun Nama: &ldquo;{suggestedName}&rdquo;</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cat-product-type" className="block text-[11px] font-semibold text-slate-700 mb-1">
                1. Jenis ({typeOptions.length})
              </label>
              <select
                id="cat-product-type"
                data-testid="select-product-type"
                value={productType}
                onChange={(e) => handleProductTypeChange(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">
                  {typeOptions.length > 0 ? '-- Pilih Jenis --' : '-- Belum ada jenis di kategori ini --'}
                </option>
                {typeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cat-brand" className="block text-[11px] font-semibold text-slate-700 mb-1">
                2. Merek ({brandOptions.length})
              </label>
              <select
                id="cat-brand"
                data-testid="select-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">
                  {brandOptions.length > 0 ? '-- Pilih Merek --' : '-- Belum ada merek --'}
                </option>
                {brandOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cat-size" className="block text-[11px] font-semibold text-slate-700 mb-1">
                3. Ukuran / Berat
              </label>
              <select
                id="cat-size"
                data-testid="select-size"
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">-- Pilih Ukuran --</option>
                {sizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cat-unit" className="block text-[11px] font-semibold text-slate-700 mb-1">
                4. Satuan Jual/Stok *
              </label>
              <select
                id="cat-unit"
                data-testid="select-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                {unitOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Inline quick custom weight/volume composer (e.g. 500 + gram, 2 + liter, 75 + gsm) */}
          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-600">
              Atau isi ukuran berat/volume cepat:
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={customSizeAmount}
              onChange={(e) => setCustomSizeAmount(e.target.value)}
              placeholder="Angka (mis. 500)"
              aria-label="Angka ukuran berat atau volume"
              className="w-28 px-2.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-600"
            />
            <select
              value={customSizeUnit}
              onChange={(e) => setCustomSizeUnit(e.target.value)}
              aria-label="Satuan berat atau volume"
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-emerald-600"
            >
              {WEIGHT_VOLUME_MEASUREMENT_UNITS.map((mu) => (
                <option key={mu} value={mu}>
                  {mu}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyCustomWeightSize}
              disabled={!customSizeAmount.trim()}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-800 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 rounded-md"
            >
              Pakai Ukuran
            </button>
            {sizeLabel && (
              <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                Terpilih: {sizeLabel}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Name & Description */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cat-prod-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Produk / Barang *
            </label>
            <input
              id="cat-prod-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                suggestedName ||
                (isRetailType
                  ? 'Mis. Minyak Goreng Bimoli 2 L'
                  : isMenuType
                  ? 'Mis. Es Matcha Susu Spesial'
                  : 'Mis. Paket Desain Logo UMKM')
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="cat-prod-desc" className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Singkat
            </label>
            <input
              id="cat-prod-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan singkat yang tampil di kasir..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* DYNAMIC SECTION A: MENU_ITEM -> Recipe / BOM Inputs */}
        {isMenuType && (
          <div
            data-testid="modal-bom-section"
            className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-emerald-700" />
                <h3 className="text-xs font-bold text-emerald-950">
                  Resep / Komposisi Bahan Baku (BOM)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {onGoToBomTab && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToBomTab();
                    }}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    Kelola Pustaka Resep →
                  </button>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="prod-bom-template" className="block text-[11px] font-medium text-emerald-900 mb-1">
                Pilih dari Formulasi Resep Tersimpan (Opsional)
              </label>
              <select
                id="prod-bom-template"
                value={selectedTemplateId}
                onChange={(e) => handleSelectBomTemplate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">-- Racik bahan langsung di bawah atau HPP manual --</option>
                {recipeTemplates.map((tpl) => {
                  const m = calculateRecipeFormulationMetrics(
                    tpl.ingredients,
                    activeWorkspace.products,
                    tpl.yieldPortions
                  );
                  return (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} · HPP {formatRupiah(m.unitCost)} · Sisa {m.maxCraftablePortions} porsi
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-900">
                  Komposisi Bahan Mentah per 1 Porsi
                </span>
                <button
                  type="button"
                  disabled={rawMaterials.length === 0}
                  onClick={addBomRow}
                  data-testid="modal-add-bom-ingredient-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-md disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tambah Bahan</span>
                </button>
              </div>

              {bomRows.length > 0 ? (
                <div className="space-y-2">
                  {bomRows.map((row, idx) => {
                    const raw = rawMaterials.find((r) => r.id === row.ingredientProductId);
                    return (
                      <div key={`${row.ingredientProductId}-${idx}`} className="flex items-center gap-2">
                        <select
                          aria-label={`Bahan baku baris ${idx + 1}`}
                          value={row.ingredientProductId}
                          onChange={(e) =>
                            updateBomRow(idx, { ingredientProductId: e.target.value })
                          }
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg"
                        >
                          {rawMaterials.map((rm) => (
                            <option key={rm.id} value={rm.id}>
                              {rm.name} (Stok: {new Decimal(rm.stockQty).toFixed(2)} {rm.unit})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          aria-label={`Takaran bahan baris ${idx + 1}`}
                          value={row.quantityRequired}
                          onChange={(e) =>
                            updateBomRow(idx, { quantityRequired: e.target.value })
                          }
                          className="w-24 px-2.5 py-1.5 text-xs font-mono bg-white border border-emerald-200 rounded-lg"
                        />
                        <span className="text-[11px] text-slate-600 w-10 truncate">
                          {raw?.unit || 'unit'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBomRow(idx)}
                          aria-label={`Hapus bahan baris ${idx + 1}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-800">
                  {rawMaterials.length === 0
                    ? 'Belum ada bahan mentah terdaftar. Tambahkan bahan di tab 1. Bahan Mentah terlebih dahulu.'
                    : 'Belum ada bahan dipilih. Klik "Tambah Bahan" atau pilih Formulasi Resep di atas.'}
                </p>
              )}

              {bomMetrics && (
                <div className="pt-2 border-t border-emerald-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-emerald-900">
                    HPP Otomatis dari BOM:{' '}
                    <strong className="font-mono">{formatRupiah(bomMetrics.unitCost)}</strong>
                  </span>
                  <span className="text-emerald-800 font-mono">
                    Sisa kapasitas produksi: <strong>{bomMetrics.maxCraftablePortions} porsi</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DYNAMIC SECTION B: Pricing + Retail Stock & Purchase Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cat-price" className="block text-xs font-semibold text-slate-700 mb-1">
              Harga Jual (Rp) *
            </label>
            <input
              id="cat-price"
              type="number"
              required
              min="1"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="35000"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>

          {isRetailType ? (
            <div data-testid="modal-retail-purchase-price">
              <label htmlFor="cat-cost" className="block text-xs font-semibold text-slate-700 mb-1">
                Harga Beli / Kulakan (Rp) *
              </label>
              <input
                id="cat-cost"
                type="number"
                required
                min="0"
                value={costPriceAvg}
                onChange={(e) => setCostPriceAvg(e.target.value)}
                placeholder="28000"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="cat-cost" className="block text-xs font-semibold text-slate-700 mb-1">
                {bomMetrics ? 'HPP / Modal (Tersinkron BOM)' : 'HPP / Modal Estimasi (Rp)'}
              </label>
              <input
                id="cat-cost"
                type="number"
                min="0"
                disabled={Boolean(bomMetrics)}
                value={bomMetrics ? new Decimal(bomMetrics.unitCost).toFixed(0) : costPriceAvg}
                onChange={(e) => setCostPriceAvg(e.target.value)}
                placeholder="12000"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>
          )}
        </div>

        {/* Penentuan Harga Jual: LITE -> Margin % Sederhana; BASIC+ / Add-On -> Simulasi Lengkap Anti-Rugi */}
        {canUsePricingSimulator(
          activeWorkspace.tenant.subscriptionPlan,
          activeWorkspace.tenant.activeAddOns
        ) ? (
          <SellingPriceSimulator
            planCode={activeWorkspace.tenant.subscriptionPlan}
            activeAddOns={activeWorkspace.tenant.activeAddOns}
            vertical={activeWorkspace.tenant.vertical}
            isPkp={activeWorkspace.tenant.isPkp}
            costPrice={bomMetrics ? new Decimal(bomMetrics.unitCost).toFixed(0) : costPriceAvg}
            currentSellingPrice={sellingPrice}
            onApplySellingPrice={(recommended) => setSellingPrice(recommended)}
            onUpgradePlan={() => {
              onClose();
              navigate('/subscription');
            }}
          />
        ) : (
          <LiteSimpleMarginHelper
            costPrice={bomMetrics ? new Decimal(bomMetrics.unitCost).toFixed(0) : costPriceAvg}
            onApplySellingPrice={(recommended) => setSellingPrice(recommended)}
            onUpgradeAddOn={() => {
              onClose();
              navigate('/subscription');
            }}
          />
        )}

        {/* RETAIL_GOODS ONLY: Stock Level, Min Alert, SKU & Barcode */}
        {isRetailType ? (
          <div
            data-testid="modal-retail-stock-section"
            className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div>
              <label htmlFor="cat-stock" className="block text-xs font-semibold text-slate-700 mb-1">
                Stok Awal ({unit || 'pcs'}) *
              </label>
              <input
                id="cat-stock"
                type="number"
                step="any"
                min="0"
                required
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="cat-min-stock" className="block text-xs font-semibold text-slate-700 mb-1">
                Batas Alert Min
              </label>
              <input
                id="cat-min-stock"
                type="number"
                step="any"
                min="0"
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="cat-sku" className="block text-xs font-semibold text-slate-700 mb-1">
                Kode SKU
              </label>
              <input
                id="cat-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Otomatis"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="cat-barcode" className="block text-xs font-semibold text-slate-700 mb-1">
                Barcode / EAN-13
              </label>
              <input
                id="cat-barcode"
                type="text"
                value={barcodeQr}
                onChange={(e) => setBarcodeQr(e.target.value)}
                placeholder="899..."
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cat-sku" className="block text-xs font-semibold text-slate-700 mb-1">
                Kode SKU
              </label>
              <input
                id="cat-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Otomatis"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="cat-barcode-alt" className="block text-xs font-semibold text-slate-700 mb-1">
                Barcode (Opsional)
              </label>
              <input
                id="cat-barcode-alt"
                type="text"
                value={barcodeQr}
                onChange={(e) => setBarcodeQr(e.target.value)}
                placeholder="899..."
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* WARUNG SEMBAKO: Replace Product Photo with Purchase Receipt Proof Upload */}
        {isWarungSembako ? (
          <div
            data-testid="modal-sembako-purchase-receipt-section"
            className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3"
          >
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-950">
                  Foto Bukti Pembelian / Nota Supplier (Opsional — Cross-Check &amp; Pajak)
                </p>
                <p className="text-[11px] text-amber-900/80">
                  Khusus Warung Sembako, unggahan foto produk ditiadakan agar input cepat. Lampirkan
                  foto nota pembelian supplier bila tersedia untuk arsip cross-check &amp; pelaporan pajak.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="item-receipt-number"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  No. Nota / Faktur Pembelian (Opsional)
                </label>
                <input
                  id="item-receipt-number"
                  type="text"
                  value={purchaseReceiptNumber}
                  onChange={(e) => setPurchaseReceiptNumber(e.target.value)}
                  placeholder="Mis. INV-GROSIR-2026-01"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="item-supplier-name"
                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                >
                  Nama Agen / Supplier (Opsional)
                </label>
                <input
                  id="item-supplier-name"
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Mis. Agen Sembako Jaya Makmur"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-20 h-20 rounded-xl border border-amber-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
                {isValidProductImageSource(purchaseReceiptImageUrl) ? (
                  <img
                    src={purchaseReceiptImageUrl}
                    alt="Pratinjau bukti nota pembelian"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-6 h-6 text-amber-300" />
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <input
                  ref={receiptFileInputRef}
                  id="sembako-receipt-file"
                  data-testid="sembako-receipt-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadReceiptImage(e)}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingReceipt}
                    onClick={() => receiptFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadingReceipt
                        ? 'Memproses Nota...'
                        : 'Unggah Foto Bukti Pembelian / Nota'}
                    </span>
                  </button>
                  {purchaseReceiptImageUrl && (
                    <button
                      type="button"
                      onClick={() => setPurchaseReceiptImageUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Hapus Nota</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-amber-900/75">
                  {purchaseReceiptImageUrl
                    ? 'Bukti nota berhasil dilampirkan & siap dicross-check di menu Kulakan & Pajak ✓'
                    : 'Format JPG/PNG/WebP. Otomatis terkompresi dan tercatat di arsip bukti pembelian.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* NON-WARUNG SEMBAKO (Kedai/Restoran/Jasa): Retain Product/Menu Photo Upload */
          <div data-testid="modal-product-photo-section" className="space-y-2">
            <span className="block text-xs font-semibold text-stone-700">
              Foto Produk / Menu (Opsional)
            </span>
            <div className="flex items-start gap-3">
              <div className="w-20 h-20 rounded-xl border border-stone-200 bg-stone-50 overflow-hidden flex items-center justify-center shrink-0">
                {isValidProductImageSource(imageUrl) ? (
                  <img
                    src={imageUrl}
                    alt={name || 'Pratinjau foto produk'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus className="w-6 h-6 text-stone-300" />
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <input
                  ref={fileInputRef}
                  id="prod-image-file"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadProductImage(e)}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingImage ? 'Memproses foto...' : 'Unggah Foto dari Perangkat'}</span>
                  </button>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Hapus Foto</span>
                    </button>
                  )}
                </div>
                <input
                  id="cat-img-url"
                  type="text"
                  aria-label="Atau tempel tautan foto produk (opsional)"
                  value={imageUrl.startsWith('data:image/') ? '' : imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder={
                    imageUrl.startsWith('data:image/')
                      ? 'Foto produk berhasil dipasang'
                      : 'Atau tempel tautan foto (opsional)...'
                  }
                  className="w-full px-2.5 py-1.5 text-xs border border-stone-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Flags */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700 pt-1">
          {isRetailType && (
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isTaxExempt}
                onChange={(e) => setIsTaxExempt(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Bebas PPN Sembako (PP 49/2022)</span>
            </label>
          )}
          {activeWorkspace.tenant.isPkp && (
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isLuxuryGoods}
                onChange={(e) => setIsLuxuryGoods(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Barang Mewah (PPN 12% Penuh)</span>
            </label>
          )}
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Tampil &amp; Aktif di Kasir POS</span>
          </label>
        </div>

        {/* Custom Attributes (JSONB) */}
        {productCustomFields.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <p className="text-xs font-semibold text-slate-700">
              Atribut Kustom Produk (JSONB Dinamis)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {productCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label
                    htmlFor={`modal-cf-${cf.fieldKey}`}
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    {cf.fieldLabel}
                  </label>
                  {cf.fieldType === 'BOOLEAN' ? (
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        id={`modal-cf-${cf.fieldKey}`}
                        type="checkbox"
                        checked={Boolean(customValues[cf.fieldKey])}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [cf.fieldKey]: e.target.checked,
                          }))
                        }
                      />
                      <span>Ya</span>
                    </label>
                  ) : (
                    <input
                      id={`modal-cf-${cf.fieldKey}`}
                      type={cf.fieldType === 'NUMBER' ? 'number' : cf.fieldType === 'DATE' ? 'date' : 'text'}
                      value={String(customValues[cf.fieldKey] ?? '')}
                      onChange={(e) =>
                        setCustomValues((prev) => ({
                          ...prev,
                          [cf.fieldKey]: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            data-testid="modal-cancel-item-btn"
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            data-testid="modal-save-item-btn"
            className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{editingProduct ? 'Simpan Perubahan' : 'Simpan ke Katalog'}</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
