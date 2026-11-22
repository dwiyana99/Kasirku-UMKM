import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  ArrowRight,
  Edit3,
  FlaskConical,
  Link2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  calculateRecipeFormulationMetrics,
  deriveRecipeTemplatesFromWorkspace,
} from '../../lib/catalog/recipe-bom-utils';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type { RecipeTemplate } from '../../types/domain';

interface RecipeBomManagerProps {
  onNotify: (msg: string) => void;
  onError: (msg: string) => void;
  onCreateMenuFromTemplate: (template: RecipeTemplate) => void;
  onGoToRawMaterials: () => void;
}

export function RecipeBomManager({
  onNotify,
  onError,
  onCreateMenuFromTemplate,
  onGoToRawMaterials,
}: RecipeBomManagerProps) {
  const {
    activeWorkspace,
    saveRecipeTemplate,
    deleteRecipeTemplate,
    saveProductRecipes,
    updateProduct,
  } = useApp();

  const rawMaterials = useMemo(
    () => activeWorkspace.products.filter((p) => p.itemType === 'RAW_MATERIAL'),
    [activeWorkspace.products]
  );

  const menuItems = useMemo(
    () => activeWorkspace.products.filter((p) => p.itemType === 'MENU_ITEM'),
    [activeWorkspace.products]
  );

  const recipeTemplates = useMemo(
    () => deriveRecipeTemplatesFromWorkspace(activeWorkspace),
    [activeWorkspace]
  );

  // Builder state
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [linkedMenuId, setLinkedMenuId] = useState<string>('');
  const [rows, setRows] = useState<Array<{ ingredientProductId: string; quantityRequired: string }>>(
    () =>
      rawMaterials[0]
        ? [{ ingredientProductId: rawMaterials[0].id, quantityRequired: '0.1' }]
        : []
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resetBuilder = () => {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateDesc('');
    setLinkedMenuId('');
    setRows(
      rawMaterials[0]
        ? [{ ingredientProductId: rawMaterials[0].id, quantityRequired: '0.1' }]
        : []
    );
  };

  const handleLoadTemplateForEdit = (tpl: RecipeTemplate) => {
    setEditingTemplateId(tpl.id);
    setTemplateName(tpl.name);
    setTemplateDesc(tpl.description);
    const linked = menuItems.find((m) => m.recipeTemplateId === tpl.id);
    setLinkedMenuId(linked?.id ?? '');
    setRows(
      tpl.ingredients.length > 0
        ? tpl.ingredients.map((i) => ({
            ingredientProductId: i.ingredientProductId,
            quantityRequired: new Decimal(i.quantityRequired).toString(),
          }))
        : rawMaterials[0]
        ? [{ ingredientProductId: rawMaterials[0].id, quantityRequired: '0.1' }]
        : []
    );
  };

  const handleAddRow = () => {
    if (rawMaterials.length === 0) return;
    const usedIds = new Set(rows.map((r) => r.ingredientProductId));
    const nextIng = rawMaterials.find((r) => !usedIds.has(r.id)) ?? rawMaterials[0];
    setRows((prev) => [...prev, { ingredientProductId: nextIng.id, quantityRequired: '0.05' }]);
  };

  const liveMetrics = useMemo(
    () => calculateRecipeFormulationMetrics(rows, activeWorkspace.products, 1),
    [rows, activeWorkspace.products]
  );

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) {
      onError('Nama formulasi resep BOM wajib diisi (mis. Resep Es Kopi Susu Gula Aren).');
      return;
    }
    const validRows = rows.filter(
      (r) => r.ingredientProductId && new Decimal(r.quantityRequired || '0').gt(0)
    );
    if (validRows.length === 0) {
      onError('Tambahkan minimal 1 bahan mentah dengan takaran lebih dari 0.');
      return;
    }

    const { template, unitCost } = saveRecipeTemplate({
      id: editingTemplateId ?? undefined,
      name: templateName.trim(),
      description: templateDesc.trim() || `Takaran bahan baku per 1 porsi (${validRows.length} bahan)`,
      yieldPortions: 1,
      ingredients: validRows,
    });

    // If user also chose to link directly to an existing MENU_ITEM, sync its recipes & HPP immediately
    if (linkedMenuId) {
      updateProduct(linkedMenuId, {
        recipeTemplateId: template.id,
        costPriceAvg: unitCost,
      });
      saveProductRecipes(linkedMenuId, validRows);
      const targetMenu = menuItems.find((m) => m.id === linkedMenuId);
      onNotify(
        `Formulasi "${template.name}" disimpan & langsung terhubung ke menu "${targetMenu?.name ?? ''}" (HPP: ${formatRupiah(unitCost)}/porsi).`
      );
    } else {
      onNotify(
        `Formulasi Resep BOM "${template.name}" tersimpan (HPP: ${formatRupiah(unitCost)}/porsi). Klik "Buat Menu Jual" untuk menjualnya di Kasir POS.`
      );
    }

    resetBuilder();
  };

  if (rawMaterials.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <FlaskConical className="w-8 h-8 text-slate-300 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">
          Langkah 1 Diperlukan: Tambahkan Bahan Mentah Dulu
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Resep BOM mengambil bahan baku dari gudang dapur Anda agar HPP dan sisa stok otomatis
          tersinkron saat ada transaksi penjualan.
        </p>
        <button
          type="button"
          onClick={onGoToRawMaterials}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
        >
          <span>Ke Langkah 1: Tambah Bahan Mentah</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Recipe BOM Formulation Builder */}
        <form
          onSubmit={handleSaveTemplate}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {editingTemplateId
                  ? 'Edit Formulasi Resep BOM'
                  : 'Buat Formulasi Resep BOM Baru'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Racik takaran bahan mentah per 1 porsi. Saat Anda membuat Produk/Menu Jual, cukup
                pilih resep ini agar HPP &amp; stok bahan otomatis tersinkron.
              </p>
            </div>
            {editingTemplateId && (
              <button
                type="button"
                onClick={resetBuilder}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
              >
                <X className="w-3.5 h-3.5" />
                <span>Batal</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bom-tpl-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Resep BOM *
              </label>
              <input
                id="bom-tpl-name"
                type="text"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Mis. Resep Es Matcha Latte 16oz"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label htmlFor="bom-link-menu" className="block text-xs font-medium text-slate-700 mb-1">
                Hubungkan ke Menu Existing (Opsional)
              </label>
              <select
                id="bom-link-menu"
                value={linkedMenuId}
                onChange={(e) => setLinkedMenuId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="">-- Simpan sebagai template resep siap pakai --</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (Jual {formatRupiah(m.sellingPrice)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="bom-tpl-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Catatan Takaran / Cara Racik (Opsional)
            </label>
            <input
              id="bom-tpl-desc"
              type="text"
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
              placeholder="Mis. 18gr espresso + 150ml susu segar dingin"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">
                Komposisi Bahan Mentah per 1 Porsi
              </p>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Bahan Baku</span>
              </button>
            </div>

            {rows.map((row, idx) => {
              const ing = rawMaterials.find((r) => r.id === row.ingredientProductId);
              return (
                <div
                  key={`${idx}-${row.ingredientProductId}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <select
                    aria-label={`Bahan mentah baris ${idx + 1}`}
                    value={row.ingredientProductId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, ingredientProductId: val } : r))
                      );
                    }}
                    className="flex-1 px-2.5 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  >
                    {rawMaterials.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        {rm.name} — Sisa {new Decimal(rm.stockQty).toFixed(2)} {rm.unit} (
                        {formatRupiah(rm.costPriceAvg)}/{rm.unit})
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      aria-label={`Takaran bahan baris ${idx + 1}`}
                      value={row.quantityRequired}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, quantityRequired: val } : r))
                        );
                      }}
                      className="w-24 px-2.5 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg"
                    />
                    <span className="text-xs text-slate-500 w-10 shrink-0">
                      {ing?.unit ?? 'unit'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Hapus bahan baris ${idx + 1}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            {editingTemplateId ? 'Simpan Perubahan Resep BOM' : 'Simpan Formulasi Resep BOM'}
          </button>
        </form>

        {/* Right: Live HPP & Remaining Stock Sync Preview */}
        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Kalkulasi Otomatis HPP &amp; Sisa Stok Bahan
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Terhubung langsung ke sisa bahan mentah di gudang dapur.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">HPP / Modal Bahan per 1 Porsi</span>
              <span
                data-testid="bom-calculated-hpp"
                className="text-base font-mono font-bold tabular-nums text-emerald-700"
              >
                {formatRupiah(liveMetrics.unitCost)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-600">Estimasi Porsi dari Sisa Bahan</span>
              <span className="font-mono font-bold tabular-nums text-slate-900">
                {liveMetrics.maxCraftablePortions !== null
                  ? `${liveMetrics.maxCraftablePortions} porsi`
                  : '—'}
              </span>
            </div>
            {liveMetrics.limitingIngredientName && (
              <p className="text-[11px] text-slate-500">
                Bahan pembatas saat ini: <strong>{liveMetrics.limitingIngredientName}</strong>
              </p>
            )}
          </div>

          {liveMetrics.breakdown.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">Rincian Bahan &amp; Sisa Gudang</p>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {liveMetrics.breakdown.map((b) => (
                  <div key={b.ingredientProductId} className="px-3.5 py-2.5 bg-white space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 truncate">
                        {b.ingredientName} ({new Decimal(b.quantityRequired).toString()} {b.unit})
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900 shrink-0">
                        {formatRupiah(b.lineCost)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Sisa gudang: {new Decimal(b.availableStock).toFixed(2)} {b.unit} · Cukup untuk{' '}
                      {b.portionsPossible} porsi
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Saved Formulated BOM Recipes Directory */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Daftar Resep BOM Terformulasi ({recipeTemplates.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik <strong>Jadikan Menu Jual</strong> untuk langsung membuat produk siap jual dari
              resep ini di tab Menu &amp; Produk Jual.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {recipeTemplates.map((tpl) => {
            const m = calculateRecipeFormulationMetrics(
              tpl.ingredients,
              activeWorkspace.products,
              tpl.yieldPortions
            );
            const linkedMenus = menuItems.filter(
              (prod) =>
                prod.recipeTemplateId === tpl.id ||
                tpl.id === `tpl-${prod.id}`
            );

            return (
              <div
                key={tpl.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{tpl.name}</p>
                    <span className="text-xs text-slate-500">
                      · {tpl.ingredients.length} bahan baku
                    </span>
                    {linkedMenus.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Dipakai oleh: {linkedMenus.map((lm) => lm.name).join(', ')}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono tabular-nums text-slate-600">
                    HPP Otomatis: <strong className="text-emerald-700">{formatRupiah(m.unitCost)}/porsi</strong> ·
                    Sisa Bahan Cukup:{' '}
                    <strong>
                      {m.maxCraftablePortions !== null ? `${m.maxCraftablePortions} porsi` : '0 porsi'}
                    </strong>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {m.breakdown
                      .map(
                        (b) =>
                          `${b.ingredientName} ${new Decimal(b.quantityRequired).toString()} ${b.unit}`
                      )
                      .join(' + ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCreateMenuFromTemplate(tpl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <span>Jadikan Menu Jual</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadTemplateForEdit(tpl)}
                    aria-label={`Edit resep ${tpl.name}`}
                    className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {confirmDeleteId === tpl.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        deleteRecipeTemplate(tpl.id);
                        setConfirmDeleteId(null);
                        onNotify(`Formulasi resep "${tpl.name}" dihapus.`);
                      }}
                      className="px-2 py-1 text-[11px] font-semibold text-white bg-rose-600 rounded-md"
                    >
                      Ya, Hapus
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(tpl.id)}
                      aria-label={`Hapus resep ${tpl.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {recipeTemplates.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Belum ada formulasi resep BOM. Buat resep pertama Anda di formulir di atas.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
