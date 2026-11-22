import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FolderPlus,
  Layers,
  Plus,
  Ruler,
  Scale,
  Search,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  getEffectiveTaxonomy,
  getProductTypesForCategory,
  VERTICAL_TAXONOMY_PRESETS,
  WEIGHT_VOLUME_MEASUREMENT_UNITS,
} from '../../lib/catalog/taxonomy-presets';
import { DataTable, type DataTableColumn } from '../ui/DataTable';
import { ModalShell } from '../ui/ModalShell';
import type {
  Category,
  TaxonomyBrand,
  TaxonomyProductType,
  TaxonomySize,
  TaxonomyUnit,
} from '../../types/domain';

interface TaxonomyManagerProps {
  categoryTabLabel: string;
  onNotify: (msg: string) => void;
}

type TaxonomySectionTab = 'CATEGORIES' | 'TYPES' | 'BRANDS' | 'SIZES' | 'UNITS';

type EditModalState =
  | { kind: 'CATEGORY'; item: Category }
  | { kind: 'TYPE'; item: TaxonomyProductType }
  | { kind: 'BRAND'; item: TaxonomyBrand }
  | { kind: 'SIZE'; item: TaxonomySize }
  | { kind: 'UNIT'; item: TaxonomyUnit }
  | null;

export function TaxonomyManager({ categoryTabLabel, onNotify }: TaxonomyManagerProps) {
  const {
    activeWorkspace,
    addCategory,
    updateCategory,
    deleteCategory,
    addProductTypeItem,
    updateProductTypeItem,
    deleteProductTypeItem,
    addBrandItem,
    updateBrandItem,
    deleteBrandItem,
    addSizeItem,
    updateSizeItem,
    deleteSizeItem,
    addUnitItem,
    updateUnitItem,
    deleteUnitItem,
    applyCommonCategoryPresets,
  } = useApp();

  const [activeSection, setActiveSection] = useState<TaxonomySectionTab>('CATEGORIES');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states for each hierarchical entity
  const [newCategoryName, setNewCategoryName] = useState('');

  // Step 2: Jenis (requires Category first)
  const [typeCategoryId, setTypeCategoryId] = useState<string>(
    activeWorkspace.categories[0]?.id ?? ''
  );
  const [newTypeName, setNewTypeName] = useState('');

  // Step 3: Merek (requires Category -> optional/selected Jenis)
  const [brandCategoryId, setBrandCategoryId] = useState<string>(
    activeWorkspace.categories[0]?.id ?? ''
  );
  const [brandTypeId, setBrandTypeId] = useState<string>('');
  const [newBrandName, setNewBrandName] = useState('');

  // Step 4: Ukuran / Berat (kg, gram, ml, liter, 70 gsm, etc.)
  const [sizeCategoryId, setSizeCategoryId] = useState<string>('');
  const [sizeTypeId, setSizeTypeId] = useState<string>('');
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newSizeUnit, setNewSizeUnit] = useState<string>('gram');

  // Step 5: Satuan (pcs, rim, dus, karung, etc.)
  const [unitCategoryId, setUnitCategoryId] = useState<string>('');
  const [unitTypeId, setUnitTypeId] = useState<string>('');
  const [newUnitName, setNewUnitName] = useState('');

  // Edit Modal State
  const [editModal, setEditModal] = useState<EditModalState>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [editTypeId, setEditTypeId] = useState<string>('');
  const [editMeasurementUnit, setEditMeasurementUnit] = useState<string>('gram');

  const presets = VERTICAL_TAXONOMY_PRESETS[activeWorkspace.tenant.vertical];
  const taxonomy = useMemo(() => getEffectiveTaxonomy(activeWorkspace), [activeWorkspace]);

  const categoryMap = useMemo(
    () => new Map(activeWorkspace.categories.map((c) => [c.id, c])),
    [activeWorkspace.categories]
  );

  const typeItems = useMemo(
    () => taxonomy.productTypeItems ?? [],
    [taxonomy.productTypeItems]
  );
  const brandItems = useMemo(() => taxonomy.brandItems ?? [], [taxonomy.brandItems]);
  const sizeItems = useMemo(() => taxonomy.sizeItems ?? [], [taxonomy.sizeItems]);
  const unitItems = useMemo(() => taxonomy.unitItems ?? [], [taxonomy.unitItems]);

  const typeMap = useMemo(
    () => new Map(typeItems.map((t) => [t.id, t])),
    [typeItems]
  );

  const existingCategoryNamesLower = useMemo(
    () => new Set(activeWorkspace.categories.map((c) => c.name.trim().toLowerCase())),
    [activeWorkspace.categories]
  );

  // Ensure default category selectors stay valid when categories change
  const effectiveTypeCatId =
    typeCategoryId && categoryMap.has(typeCategoryId)
      ? typeCategoryId
      : activeWorkspace.categories[0]?.id ?? '';

  const effectiveBrandCatId =
    brandCategoryId && categoryMap.has(brandCategoryId)
      ? brandCategoryId
      : activeWorkspace.categories[0]?.id ?? '';

  const brandTypesForSelectedCat = useMemo(
    () => getProductTypesForCategory(taxonomy, effectiveBrandCatId),
    [taxonomy, effectiveBrandCatId]
  );

  const sizeTypesForSelectedCat = useMemo(
    () => (sizeCategoryId ? getProductTypesForCategory(taxonomy, sizeCategoryId) : []),
    [taxonomy, sizeCategoryId]
  );

  const unitTypesForSelectedCat = useMemo(
    () => (unitCategoryId ? getProductTypesForCategory(taxonomy, unitCategoryId) : []),
    [taxonomy, unitCategoryId]
  );

  const editTypesForSelectedCat = useMemo(
    () => (editCategoryId ? getProductTypesForCategory(taxonomy, editCategoryId) : []),
    [taxonomy, editCategoryId]
  );

  const q = searchQuery.trim().toLowerCase();

  // Filtered datasets for each DataTable
  const filteredCategories = useMemo(() => {
    if (!q) return activeWorkspace.categories;
    return activeWorkspace.categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [activeWorkspace.categories, q]);

  const filteredTypes = useMemo(() => {
    if (!q) return typeItems;
    return typeItems.filter((t) => {
      const catName = categoryMap.get(t.categoryId)?.name ?? '';
      return t.name.toLowerCase().includes(q) || catName.toLowerCase().includes(q);
    });
  }, [typeItems, categoryMap, q]);

  const filteredBrands = useMemo(() => {
    if (!q) return brandItems;
    return brandItems.filter((b) => {
      const catName = categoryMap.get(b.categoryId)?.name ?? '';
      const typeName = b.productTypeId ? typeMap.get(b.productTypeId)?.name ?? '' : '';
      return (
        b.name.toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q) ||
        typeName.toLowerCase().includes(q)
      );
    });
  }, [brandItems, categoryMap, typeMap, q]);

  const filteredSizes = useMemo(() => {
    if (!q) return sizeItems;
    return sizeItems.filter((s) => {
      const catName = s.categoryId ? categoryMap.get(s.categoryId)?.name ?? '' : 'Umum / Global';
      const typeName = s.productTypeId ? typeMap.get(s.productTypeId)?.name ?? '' : '';
      return (
        s.label.toLowerCase().includes(q) ||
        (s.measurementUnit ?? '').toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q) ||
        typeName.toLowerCase().includes(q)
      );
    });
  }, [sizeItems, categoryMap, typeMap, q]);

  const filteredUnits = useMemo(() => {
    if (!q) return unitItems;
    return unitItems.filter((u) => {
      const catName = u.categoryId ? categoryMap.get(u.categoryId)?.name ?? '' : 'Umum / Global';
      const typeName = u.productTypeId ? typeMap.get(u.productTypeId)?.name ?? '' : '';
      return (
        u.name.toLowerCase().includes(q) ||
        catName.toLowerCase().includes(q) ||
        typeName.toLowerCase().includes(q)
      );
    });
  }, [unitItems, categoryMap, typeMap, q]);

  // Create handlers
  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) return;
    if (existingCategoryNamesLower.has(clean.toLowerCase())) {
      onNotify(`Kategori "${clean}" sudah ada di daftar.`);
      setNewCategoryName('');
      return;
    }
    const created = addCategory(clean);
    setTypeCategoryId(created.id);
    setBrandCategoryId(created.id);
    onNotify(`Kategori "${clean}" berhasil disimpan. Lanjut ke tab 2. Jenis untuk mengisi turunannya.`);
    setNewCategoryName('');
  };

  const handleTogglePresetCategory = (presetName: string) => {
    if (existingCategoryNamesLower.has(presetName.toLowerCase())) return;
    addCategory(presetName);
    onNotify(`Kategori umum "${presetName}" ditambahkan beserta preset Jenis & Merek-nya.`);
  };

  const handleLoadAllCommonPresets = () => {
    const addedCount = applyCommonCategoryPresets(presets.commonCategories);
    onNotify(
      addedCount > 0
        ? `${addedCount} kategori umum beserta struktur Jenis, Merek, Ukuran & Satuan berhasil dimuat.`
        : 'Seluruh kategori umum sudah tersedia.'
    );
  };

  const handleCreateType = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTypeName.trim();
    if (!effectiveTypeCatId) {
      onNotify('Buat atau pilih Kategori terlebih dahulu sebelum menambah Jenis.');
      return;
    }
    if (!clean) return;
    const created = addProductTypeItem({ categoryId: effectiveTypeCatId, name: clean });
    if (!created) {
      onNotify(`Jenis "${clean}" sudah ada pada kategori tersebut.`);
    } else {
      const catName = categoryMap.get(effectiveTypeCatId)?.name ?? '';
      onNotify(`Jenis "${clean}" disimpan di bawah kategori "${catName}".`);
    }
    setNewTypeName('');
  };

  const handleCreateBrand = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBrandName.trim();
    if (!effectiveBrandCatId) {
      onNotify('Pilih Kategori terlebih dahulu sebelum menambah Merek.');
      return;
    }
    if (!clean) return;
    const created = addBrandItem({
      categoryId: effectiveBrandCatId,
      productTypeId: brandTypeId || null,
      name: clean,
    });
    if (!created) {
      onNotify(`Merek "${clean}" sudah terdaftar untuk kombinasi Kategori/Jenis tersebut.`);
    } else {
      const catName = categoryMap.get(effectiveBrandCatId)?.name ?? '';
      const typeName = brandTypeId ? typeMap.get(brandTypeId)?.name : 'Semua Jenis';
      onNotify(`Merek "${clean}" disimpan (${catName} → ${typeName}).`);
    }
    setNewBrandName('');
  };

  const handleCreateSize = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSizeLabel.trim();
    if (!clean) return;
    const created = addSizeItem({
      categoryId: sizeCategoryId || null,
      productTypeId: sizeCategoryId ? sizeTypeId || null : null,
      label: clean,
      measurementUnit: newSizeUnit,
    });
    if (!created) {
      onNotify(`Ukuran "${clean}" sudah tersedia pada cakupan tersebut.`);
    } else {
      onNotify(`Ukuran "${clean}" (${newSizeUnit}) berhasil ditambahkan.`);
    }
    setNewSizeLabel('');
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUnitName.trim();
    if (!clean) return;
    const created = addUnitItem({
      categoryId: unitCategoryId || null,
      productTypeId: unitCategoryId ? unitTypeId || null : null,
      name: clean,
    });
    if (!created) {
      onNotify(`Satuan "${clean}" sudah tersedia pada cakupan tersebut.`);
    } else {
      onNotify(`Satuan "${clean}" berhasil ditambahkan.`);
    }
    setNewUnitName('');
  };

  // Open Edit Modal helpers
  const openEditModal = (state: EditModalState) => {
    if (!state) return;
    setEditModal(state);
    if (state.kind === 'CATEGORY') {
      setEditName(state.item.name);
      setEditCategoryId('');
      setEditTypeId('');
    } else if (state.kind === 'TYPE') {
      setEditName(state.item.name);
      setEditCategoryId(state.item.categoryId);
      setEditTypeId('');
    } else if (state.kind === 'BRAND') {
      setEditName(state.item.name);
      setEditCategoryId(state.item.categoryId);
      setEditTypeId(state.item.productTypeId ?? '');
    } else if (state.kind === 'SIZE') {
      setEditName(state.item.label);
      setEditCategoryId(state.item.categoryId ?? '');
      setEditTypeId(state.item.productTypeId ?? '');
      setEditMeasurementUnit(state.item.measurementUnit ?? 'gram');
    } else if (state.kind === 'UNIT') {
      setEditName(state.item.name);
      setEditCategoryId(state.item.categoryId ?? '');
      setEditTypeId(state.item.productTypeId ?? '');
    }
  };

  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    const clean = editName.trim();
    if (!clean) return;

    if (editModal.kind === 'CATEGORY') {
      updateCategory(editModal.item.id, clean);
      onNotify(`Kategori diperbarui menjadi "${clean}".`);
    } else if (editModal.kind === 'TYPE') {
      if (!editCategoryId) return;
      updateProductTypeItem(editModal.item.id, { categoryId: editCategoryId, name: clean });
      onNotify(`Jenis diperbarui menjadi "${clean}".`);
    } else if (editModal.kind === 'BRAND') {
      if (!editCategoryId) return;
      updateBrandItem(editModal.item.id, {
        categoryId: editCategoryId,
        productTypeId: editTypeId || null,
        name: clean,
      });
      onNotify(`Merek diperbarui menjadi "${clean}".`);
    } else if (editModal.kind === 'SIZE') {
      updateSizeItem(editModal.item.id, {
        categoryId: editCategoryId || null,
        productTypeId: editCategoryId ? editTypeId || null : null,
        label: clean,
        measurementUnit: editMeasurementUnit,
      });
      onNotify(`Ukuran diperbarui menjadi "${clean}".`);
    } else if (editModal.kind === 'UNIT') {
      updateUnitItem(editModal.item.id, {
        categoryId: editCategoryId || null,
        productTypeId: editCategoryId ? editTypeId || null : null,
        name: clean,
      });
      onNotify(`Satuan diperbarui menjadi "${clean}".`);
    }

    setEditModal(null);
  };

  // DataTable column definitions
  const categoryColumns: DataTableColumn<Category>[] = [
    {
      key: 'name',
      header: 'Nama Kategori',
      render: (cat) => <span className="font-semibold text-slate-900">{cat.name}</span>,
    },
    {
      key: 'types',
      header: 'Jumlah Jenis',
      align: 'right',
      render: (cat) => {
        const cnt = typeItems.filter((t) => t.categoryId === cat.id).length;
        return <span className="font-mono tabular-nums text-slate-700">{cnt} jenis</span>;
      },
    },
    {
      key: 'products',
      header: 'Produk Terkait',
      align: 'right',
      render: (cat) => {
        const cnt = activeWorkspace.products.filter((p) => p.categoryId === cat.id).length;
        return <span className="font-mono tabular-nums text-slate-700">{cnt} item</span>;
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (cat) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal({ kind: 'CATEGORY', item: cat })}
            data-testid={`edit-category-${cat.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              deleteCategory(cat.id);
              onNotify(`Kategori "${cat.name}" dihapus.`);
            }}
            data-testid={`delete-category-${cat.id}`}
            aria-label={`Hapus kategori ${cat.name}`}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const typeColumns: DataTableColumn<TaxonomyProductType>[] = [
    {
      key: 'name',
      header: 'Nama Jenis',
      render: (t) => <span className="font-semibold text-slate-900">{t.name}</span>,
    },
    {
      key: 'category',
      header: 'Kategori Induk',
      render: (t) => (
        <span className="text-slate-700">{categoryMap.get(t.categoryId)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'brands',
      header: 'Jumlah Merek',
      align: 'right',
      render: (t) => {
        const cnt = brandItems.filter((b) => b.productTypeId === t.id).length;
        return <span className="font-mono tabular-nums text-slate-600">{cnt} merek</span>;
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (t) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal({ kind: 'TYPE', item: t })}
            data-testid={`edit-type-${t.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              deleteProductTypeItem(t.id);
              onNotify(`Jenis "${t.name}" dihapus.`);
            }}
            data-testid={`delete-type-${t.id}`}
            aria-label={`Hapus jenis ${t.name}`}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const brandColumns: DataTableColumn<TaxonomyBrand>[] = [
    {
      key: 'name',
      header: 'Nama Merek / Brand',
      render: (b) => <span className="font-semibold text-slate-900">{b.name}</span>,
    },
    {
      key: 'category',
      header: 'Kategori Induk',
      render: (b) => (
        <span className="text-slate-700">{categoryMap.get(b.categoryId)?.name ?? '—'}</span>
      ),
    },
    {
      key: 'type',
      header: 'Jenis Terkait',
      render: (b) => (
        <span className="text-slate-600">
          {b.productTypeId ? typeMap.get(b.productTypeId)?.name ?? '—' : 'Semua Jenis di Kategori'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (b) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal({ kind: 'BRAND', item: b })}
            data-testid={`edit-brand-${b.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              deleteBrandItem(b.id);
              onNotify(`Merek "${b.name}" dihapus.`);
            }}
            data-testid={`delete-brand-${b.id}`}
            aria-label={`Hapus merek ${b.name}`}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const sizeColumns: DataTableColumn<TaxonomySize>[] = [
    {
      key: 'label',
      header: 'Ukuran / Berat / Spek',
      render: (s) => <span className="font-semibold font-mono text-slate-900">{s.label}</span>,
    },
    {
      key: 'unit',
      header: 'Satuan Ukur',
      render: (s) => (
        <span className="font-mono text-xs text-slate-600">{s.measurementUnit || '—'}</span>
      ),
    },
    {
      key: 'scope',
      header: 'Cakupan Kategori / Jenis',
      render: (s) => {
        if (!s.categoryId) {
          return <span className="text-xs text-slate-500">Global (Semua Kategori)</span>;
        }
        const cat = categoryMap.get(s.categoryId)?.name ?? '—';
        const typ = s.productTypeId ? typeMap.get(s.productTypeId)?.name : null;
        return (
          <span className="text-xs text-slate-700">
            {cat}
            {typ ? ` → ${typ}` : ' (Semua Jenis)'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (s) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal({ kind: 'SIZE', item: s })}
            data-testid={`edit-size-${s.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              deleteSizeItem(s.id);
              onNotify(`Ukuran "${s.label}" dihapus.`);
            }}
            data-testid={`delete-size-${s.id}`}
            aria-label={`Hapus ukuran ${s.label}`}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const unitColumns: DataTableColumn<TaxonomyUnit>[] = [
    {
      key: 'name',
      header: 'Nama Satuan Jual / Stok',
      render: (u) => <span className="font-semibold font-mono text-slate-900">{u.name}</span>,
    },
    {
      key: 'scope',
      header: 'Cakupan Kategori / Jenis',
      render: (u) => {
        if (!u.categoryId) {
          return <span className="text-xs text-slate-500">Global (Semua Kategori)</span>;
        }
        const cat = categoryMap.get(u.categoryId)?.name ?? '—';
        const typ = u.productTypeId ? typeMap.get(u.productTypeId)?.name : null;
        return (
          <span className="text-xs text-slate-700">
            {cat}
            {typ ? ` → ${typ}` : ' (Semua Jenis)'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (u) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal({ kind: 'UNIT', item: u })}
            data-testid={`edit-unit-${u.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              deleteUnitItem(u.id);
              onNotify(`Satuan "${u.name}" dihapus.`);
            }}
            data-testid={`delete-unit-${u.id}`}
            aria-label={`Hapus satuan ${u.name}`}
            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const sectionTabs: Array<{
    key: TaxonomySectionTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: 'CATEGORIES', label: `1. ${categoryTabLabel}`, count: activeWorkspace.categories.length, icon: FolderPlus },
    { key: 'TYPES', label: '2. Jenis', count: typeItems.length, icon: Layers },
    { key: 'BRANDS', label: '3. Merek', count: brandItems.length, icon: Tag },
    { key: 'SIZES', label: '4. Ukuran / Berat', count: sizeItems.length, icon: Ruler },
    { key: 'UNITS', label: '5. Satuan', count: unitItems.length, icon: Scale },
  ];

  return (
    <div data-testid="taxonomy-manager" className="space-y-5">
      {/* Header & Step Guide */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Master Bertingkat: Kategori → Jenis → Merek → Ukuran &amp; Satuan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tambahkan Kategori terlebih dahulu, lalu pilih Kategori saat menambah Jenis &amp; Merek.
              Saat menambah produk baru, pilihan otomatis tersaring (contoh: Kertas &amp; ATK → A4 →
              Sinar Dunia → 70 gsm → rim/dus).
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadAllCommonPresets}
            data-testid="load-all-category-presets-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Muat Semua Preset Umum</span>
          </button>
        </div>

        {/* 5-Tab Bar + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {sectionTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  data-testid={`taxonomy-tab-${tab.key.toLowerCase()}`}
                  onClick={() => {
                    setActiveSection(tab.key);
                    setSearchQuery('');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      isActive ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                  >
                    ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari di tabel aktif..."
              data-testid="taxonomy-table-search"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* SECTION 1: KATEGORI */}
      {activeSection === 'CATEGORIES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 1: Tambah {categoryTabLabel}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simpan kategori dulu agar bisa dipilih sebagai induk saat mengisi Jenis &amp; Merek.
              </p>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-3">
              <div>
                <label htmlFor="new-cat-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Kategori Baru *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="new-cat-name"
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Mis. Kertas & ATK, Bahan Pokok, Gas LPG..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="submit"
                    data-testid="save-category-btn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Simpan</span>
                  </button>
                </div>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                Preset Kategori Umum (Klik untuk Menambahkan)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {presets.commonCategories.map((presetName) => {
                  const exists = existingCategoryNamesLower.has(presetName.toLowerCase());
                  return (
                    <button
                      key={presetName}
                      type="button"
                      disabled={exists}
                      onClick={() => handleTogglePresetCategory(presetName)}
                      data-testid={`preset-cat-${presetName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        exists
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {exists ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>{presetName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DataTable Kategori ({filteredCategories.length})
              </h3>
              <span className="text-[11px] text-slate-500">CRUD penuh + paginasi</span>
            </div>
            <DataTable
              data={filteredCategories}
              columns={categoryColumns}
              getRowKey={(c) => c.id}
              defaultPageSize={8}
              testId="datatable-categories"
              emptyState="Belum ada kategori terdaftar. Tambahkan kategori di sebelah kiri."
            />
          </div>
        </div>
      )}

      {/* SECTION 2: JENIS (Parent = Kategori) */}
      {activeSection === 'TYPES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleCreateType}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 2: Tambah Jenis Barang
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih Kategori induk terlebih dahulu, lalu masukkan nama Jenis (mis. Kategori: Kertas
                &amp; ATK → Jenis: A4, Folio (F4)).
              </p>
            </div>

            <div>
              <label htmlFor="type-parent-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                1. Pilih Kategori Induk *
              </label>
              <select
                id="type-parent-cat"
                data-testid="type-parent-category-select"
                value={effectiveTypeCatId}
                onChange={(e) => setTypeCategoryId(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                {activeWorkspace.categories.length === 0 ? (
                  <option value="">-- Buat Kategori dulu di tab 1 --</option>
                ) : (
                  activeWorkspace.categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="new-type-name" className="block text-xs font-semibold text-slate-700 mb-1">
                2. Nama Jenis Baru *
              </label>
              <input
                id="new-type-name"
                data-testid="taxonomy-input-productTypes"
                type="text"
                required
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Mis. Minyak Goreng, Beras, A4, Folio (F4)..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <button
              type="submit"
              data-testid="taxonomy-add-btn-productTypes"
              disabled={!effectiveTypeCatId}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Jenis</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DataTable Jenis Barang ({filteredTypes.length})
              </h3>
              <span className="text-[11px] text-slate-500">Terhubung ke Kategori Induk</span>
            </div>
            <DataTable
              data={filteredTypes}
              columns={typeColumns}
              getRowKey={(t) => t.id}
              defaultPageSize={8}
              testId="datatable-product-types"
              emptyState="Belum ada Jenis terdaftar. Pilih Kategori dan tambah Jenis di kiri."
            />
          </div>
        </div>
      )}

      {/* SECTION 3: MEREK (Parent = Kategori -> Jenis) */}
      {activeSection === 'BRANDS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleCreateBrand}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 3: Tambah Merek / Brand
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih Kategori dan Jenis agar saat input produk, pilihan Merek langsung tersaring
                sesuai Jenis barang.
              </p>
            </div>

            <div>
              <label htmlFor="brand-parent-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                1. Pilih Kategori Induk *
              </label>
              <select
                id="brand-parent-cat"
                data-testid="brand-parent-category-select"
                value={effectiveBrandCatId}
                onChange={(e) => {
                  setBrandCategoryId(e.target.value);
                  setBrandTypeId('');
                }}
                required
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                {activeWorkspace.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="brand-parent-type" className="block text-xs font-semibold text-slate-700 mb-1">
                2. Pilih Jenis (Cascading dari Kategori)
              </label>
              <select
                id="brand-parent-type"
                data-testid="brand-parent-type-select"
                value={brandTypeId}
                onChange={(e) => setBrandTypeId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">Semua Jenis dalam Kategori ini</option>
                {brandTypesForSelectedCat.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-brand-name" className="block text-xs font-semibold text-slate-700 mb-1">
                3. Nama Merek *
              </label>
              <input
                id="new-brand-name"
                data-testid="taxonomy-input-brands"
                type="text"
                required
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Mis. Bimoli, Gulaku, Sinar Dunia (SiDU), PaperOne..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <button
              type="submit"
              data-testid="taxonomy-add-btn-brands"
              disabled={!effectiveBrandCatId}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Merek</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DataTable Merek / Brand ({filteredBrands.length})
              </h3>
              <span className="text-[11px] text-slate-500">Terhubung ke Kategori → Jenis</span>
            </div>
            <DataTable
              data={filteredBrands}
              columns={brandColumns}
              getRowKey={(b) => b.id}
              defaultPageSize={8}
              testId="datatable-brands"
              emptyState="Belum ada Merek terdaftar."
            />
          </div>
        </div>
      )}

      {/* SECTION 4: UKURAN / BERAT / SPEK (kg, gram, ml, liter, 70 gsm, etc.) */}
      {activeSection === 'SIZES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleCreateSize}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 4: Ukuran / Berat / Spek
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Isi ukuran berat, volume, atau ketebalan (kg, gram, ml, liter, 70 gsm, 80 gsm).
                Jumlah/stok barang diisi nanti saat penambahan produk.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="new-size-label" className="block text-xs font-semibold text-slate-700 mb-1">
                  Label Ukuran / Berat *
                </label>
                <input
                  id="new-size-label"
                  data-testid="taxonomy-input-sizes"
                  type="text"
                  required
                  value={newSizeLabel}
                  onChange={(e) => setNewSizeLabel(e.target.value)}
                  placeholder="Mis. 70 gsm, 500 gram, 2 liter, kg"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label htmlFor="new-size-unit" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Ukur
                </label>
                <select
                  id="new-size-unit"
                  data-testid="size-measurement-unit-select"
                  value={newSizeUnit}
                  onChange={(e) => setNewSizeUnit(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  {WEIGHT_VOLUME_MEASUREMENT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="size-parent-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                Cakupan Kategori (Opsional)
              </label>
              <select
                id="size-parent-cat"
                value={sizeCategoryId}
                onChange={(e) => {
                  setSizeCategoryId(e.target.value);
                  setSizeTypeId('');
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">Global (Berlaku untuk Semua Kategori)</option>
                {activeWorkspace.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    Khusus Kategori: {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {sizeCategoryId && (
              <div>
                <label htmlFor="size-parent-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Khusus Jenis (Opsional)
                </label>
                <select
                  id="size-parent-type"
                  value={sizeTypeId}
                  onChange={(e) => setSizeTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  <option value="">Semua Jenis dalam Kategori ini</option>
                  {sizeTypesForSelectedCat.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              data-testid="taxonomy-add-btn-sizes"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Ukuran / Berat</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DataTable Ukuran / Berat ({filteredSizes.length})
              </h3>
              <span className="text-[11px] text-slate-500">kg, gram, ml, liter, gsm — bisa ditambah &amp; dikurang</span>
            </div>
            <DataTable
              data={filteredSizes}
              columns={sizeColumns}
              getRowKey={(s) => s.id}
              defaultPageSize={8}
              testId="datatable-sizes"
              emptyState="Belum ada ukuran terdaftar."
            />
          </div>
        </div>
      )}

      {/* SECTION 5: SATUAN (pcs, rim, dus, karung, etc.) */}
      {activeSection === 'UNITS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleCreateUnit}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Langkah 5: Satuan Siap Pilih
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tambah atau hapus satuan stok &amp; penjualan (mis. pcs, rim, dus, karung, pouch,
                botol, ikat).
              </p>
            </div>

            <div>
              <label htmlFor="new-unit-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Satuan *
              </label>
              <input
                id="new-unit-name"
                data-testid="taxonomy-input-units"
                type="text"
                required
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder="Mis. rim, dus, karung, pcs, renceng, pack..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="unit-parent-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                Cakupan Kategori (Opsional)
              </label>
              <select
                id="unit-parent-cat"
                value={unitCategoryId}
                onChange={(e) => {
                  setUnitCategoryId(e.target.value);
                  setUnitTypeId('');
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                <option value="">Global (Berlaku untuk Semua Kategori)</option>
                {activeWorkspace.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    Prioritas untuk Kategori: {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {unitCategoryId && (
              <div>
                <label htmlFor="unit-parent-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Prioritas untuk Jenis (Opsional)
                </label>
                <select
                  id="unit-parent-type"
                  value={unitTypeId}
                  onChange={(e) => setUnitTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  <option value="">Semua Jenis dalam Kategori ini</option>
                  {unitTypesForSelectedCat.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              data-testid="taxonomy-add-btn-units"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Simpan Satuan</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                DataTable Satuan ({filteredUnits.length})
              </h3>
              <span className="text-[11px] text-slate-500">Bisa ditambah, diubah &amp; dihapus kapan saja</span>
            </div>
            <DataTable
              data={filteredUnits}
              columns={unitColumns}
              getRowKey={(u) => u.id}
              defaultPageSize={8}
              testId="datatable-units"
              emptyState="Belum ada satuan terdaftar."
            />
          </div>
        </div>
      )}

      {/* EDIT MODAL (ModalShell: locked background scroll, button-only close) */}
      <ModalShell
        open={Boolean(editModal)}
        onClose={() => setEditModal(null)}
        headerId="taxonomy-edit-modal-header"
        title={
          editModal?.kind === 'CATEGORY'
            ? 'Edit Nama Kategori'
            : editModal?.kind === 'TYPE'
            ? 'Edit Jenis Barang'
            : editModal?.kind === 'BRAND'
            ? 'Edit Merek / Brand'
            : editModal?.kind === 'SIZE'
            ? 'Edit Ukuran / Berat'
            : 'Edit Satuan'
        }
        subtitle="Perubahan langsung tersimpan ke database dan otomatis diperbarui di form tambah produk."
        testId="taxonomy-edit-modal"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveEditModal} className="px-6 py-5 space-y-4">
          {editModal && editModal.kind !== 'CATEGORY' && (
            <div>
              <label htmlFor="edit-parent-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                {editModal.kind === 'TYPE' || editModal.kind === 'BRAND'
                  ? 'Kategori Induk *'
                  : 'Cakupan Kategori (Opsional)'}
              </label>
              <select
                id="edit-parent-cat"
                value={editCategoryId}
                required={editModal.kind === 'TYPE' || editModal.kind === 'BRAND'}
                onChange={(e) => {
                  setEditCategoryId(e.target.value);
                  setEditTypeId('');
                }}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                {(editModal.kind === 'SIZE' || editModal.kind === 'UNIT') && (
                  <option value="">Global (Semua Kategori)</option>
                )}
                {activeWorkspace.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {editModal &&
            (editModal.kind === 'BRAND' ||
              ((editModal.kind === 'SIZE' || editModal.kind === 'UNIT') && Boolean(editCategoryId))) && (
              <div>
                <label htmlFor="edit-parent-type" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Terkait
                </label>
                <select
                  id="edit-parent-type"
                  value={editTypeId}
                  onChange={(e) => setEditTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                >
                  <option value="">Semua Jenis dalam Kategori ini</option>
                  {editTypesForSelectedCat.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

          <div>
            <label htmlFor="edit-entity-name" className="block text-xs font-semibold text-slate-700 mb-1">
              {editModal?.kind === 'SIZE' ? 'Label Ukuran / Berat *' : 'Nama *'}
            </label>
            <input
              id="edit-entity-name"
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
          </div>

          {editModal?.kind === 'SIZE' && (
            <div>
              <label htmlFor="edit-size-unit" className="block text-xs font-semibold text-slate-700 mb-1">
                Satuan Ukur
              </label>
              <select
                id="edit-size-unit"
                value={editMeasurementUnit}
                onChange={(e) => setEditMeasurementUnit(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              >
                {WEIGHT_VOLUME_MEASUREMENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditModal(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              data-testid="taxonomy-edit-save-btn"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              Simpan Perubahan
            </button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
