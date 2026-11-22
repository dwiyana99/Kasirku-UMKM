import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { QRCodeSVG } from 'qrcode.react';
import {
  Plus,
  Trash2,
  QrCode,
  ExternalLink,
  SlidersHorizontal,
  Package,
  Building2,
  CheckCircle2,
  MessageCircle,
  Receipt,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { TenantSettings } from '../components/TenantSettings';
import { ReceiptDesigner } from '../components/ReceiptDesigner';
import { useApp } from '../context/AppContext';
import { FEATURE_MODULES } from '../data/seedData';
import { formatRupiah } from '../lib/pos/checkout-service';
import type {
  CustomFieldTarget,
  CustomFieldType,
  ItemType,
} from '../types/domain';

type SettingsTab =
  | 'TENANT_PROFILE'
  | 'RECEIPT_DESIGNER'
  | 'CUSTOM_FIELDS'
  | 'PRODUCTS'
  | 'TABLES_PROFILE';

export function SettingsPage() {
  const {
    activeWorkspace,
    hasAddOn,
    addCustomField,
    removeCustomField,
    addProduct,
    toggleTenantModule,
    navigate,
  } = useApp();

  const [tab, setTab] = useState<SettingsTab>('TENANT_PROFILE');
  const [notice, setNotice] = useState<string | null>(null);

  // Custom Field Builder State
  const [targetEntity, setTargetEntity] = useState<CustomFieldTarget>('products');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('TEXT');
  const [fieldOptions, setFieldOptions] = useState('');
  const [isRequired, setIsRequired] = useState(false);

  // Dynamic Product Creation Form State (renders products custom fields dynamically!)
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodCustomValues, setProdCustomValues] = useState<Record<string, string | boolean>>({});

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const handleCreateCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return;
    const key = fieldLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!key) return;

    addCustomField({
      targetEntity,
      fieldKey: key,
      fieldLabel: fieldLabel.trim(),
      fieldType,
      options:
        fieldType === 'SELECT'
          ? fieldOptions
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      isRequired,
    });
    setFieldLabel('');
    setFieldOptions('');
    setIsRequired(false);
    flashNotice(`Custom field "${fieldLabel.trim()}" ditambahkan ke entitas ${targetEntity} tanpa ALTER TABLE.`);
  };

  const productCustomFields = activeWorkspace.customFields.filter(
    (f) => f.targetEntity === 'products'
  );

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodPrice) return;
    const defaultItemType: ItemType =
      activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO'
        ? 'RETAIL_GOODS'
        : activeWorkspace.tenant.vertical === 'FREELANCE'
        ? 'SERVICE_FREELANCE'
        : 'MENU_ITEM';

    const cleanAttrs: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(prodCustomValues)) {
      cleanAttrs[k] = v;
    }

    addProduct({
      categoryId: activeWorkspace.categories[0]?.id ?? null,
      sku: prodSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      barcodeQr: prodBarcode.trim() || `899${Date.now().toString().slice(-9)}`,
      name: prodName.trim(),
      description: 'Ditambahkan melalui katalog produk dinamis.',
      itemType: defaultItemType,
      unit: defaultItemType === 'SERVICE_FREELANCE' ? 'proyek' : 'pcs',
      sellingPrice: new Decimal(prodPrice || '0').toFixed(4),
      costPriceAvg: new Decimal(prodCost || '0').toFixed(4),
      stockQty: new Decimal(prodStock || '0').toFixed(4),
      minStockAlert: '5.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: cleanAttrs,
    });
    setProdName('');
    setProdSku('');
    setProdBarcode('');
    setProdPrice('');
    setProdCost('');
    setProdCustomValues({});
    flashNotice(`Produk "${prodName.trim()}" berhasil disimpan beserta atribut JSONB kustom.`);
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <AppShell
      title="Pengaturan & Custom Fields"
      subtitle="Mesin Custom Fields JSONB tanpa ubah skema, katalog produk, QR meja cetak, dan profil entitas pajak"
    >
      <div className="space-y-6">
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <div className="inline-flex flex-wrap gap-1.5 p-1 bg-white border border-slate-200 rounded-xl">
          {(
            [
              { id: 'TENANT_PROFILE', label: 'Profil Usaha', icon: Building2 },
              { id: 'RECEIPT_DESIGNER', label: 'Desainer Struk', icon: Receipt },
              { id: 'CUSTOM_FIELDS', label: 'Custom Fields Engine', icon: SlidersHorizontal },
              { id: 'PRODUCTS', label: 'Katalog & Form Dinamis', icon: Package },
              { id: 'TABLES_PROFILE', label: 'QR Meja & Modul', icon: QrCode },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 0: TENANT PROFILE + FONNTE WHATSAPP GATEWAY ADD-ON CARD */}
        {tab === 'TENANT_PROFILE' && (
          <div className="space-y-6">
            <TenantSettings
              onSaved={(tenantName) =>
                flashNotice(`Profil usaha & pengaturan dasar untuk ${tenantName} berhasil disimpan.`)
              }
            />

            <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      WhatsApp Gateway Otomatis (Fonnte)
                    </h3>
                    <span
                      className={`text-[11px] font-semibold ${
                        hasAddOn('ADDON_WA_FONNTE') ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {hasAddOn('ADDON_WA_FONNTE') ? 'Aktif · Rp66.000/bln' : 'Add-On · Rp66.000/bln'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                    Kirim struk belanja POS, notifikasi pesanan, dan tagihan kost langsung ke
                    WhatsApp pelanggan secara otomatis menggunakan gateway resmi Fonnte (token
                    dikelola aman di sisi server, 0 token AI).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {hasAddOn('ADDON_WA_FONNTE') ? 'Kelola Add-On' : 'Aktifkan (+Rp66rb/bln)'}
              </button>
            </section>
          </div>
        )}

        {/* TAB 1: DEDICATED RECEIPT DESIGNER */}
        {tab === 'RECEIPT_DESIGNER' && (
          <ReceiptDesigner onSaved={(msg) => flashNotice(msg)} />
        )}

        {/* TAB 1: DYNAMIC CUSTOM FIELDS ENGINE */}
        {tab === 'CUSTOM_FIELDS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleCreateCustomField}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Tambah Custom Field Baru</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Disimpan di <span className="font-mono">custom_field_definitions</span> &amp;
                  dirender otomatis pada formulir terkait
                </p>
              </div>

              <div>
                <label htmlFor="cf-target" className="block text-xs font-medium text-slate-700 mb-1">
                  Target Entitas
                </label>
                <select
                  id="cf-target"
                  value={targetEntity}
                  onChange={(e) => setTargetEntity(e.target.value as CustomFieldTarget)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="products">Produk &amp; Menu (products)</option>
                  <option value="orders">Pesanan POS (orders)</option>
                  <option value="expenses">Biaya Operasional (expenses)</option>
                  <option value="assets">Aset Tetap (assets)</option>
                </select>
              </div>

              <div>
                <label htmlFor="cf-label" className="block text-xs font-medium text-slate-700 mb-1">
                  Label Field
                </label>
                <input
                  id="cf-label"
                  type="text"
                  required
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="Contoh: No. Batch BPOM / Kode Rak"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="cf-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Tipe Input
                </label>
                <select
                  id="cf-type"
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="TEXT">Teks (TEXT)</option>
                  <option value="NUMBER">Angka (NUMBER)</option>
                  <option value="DATE">Tanggal (DATE)</option>
                  <option value="SELECT">Pilihan Dropdown (SELECT)</option>
                  <option value="BOOLEAN">Centang Ya/Tidak (BOOLEAN)</option>
                </select>
              </div>

              {fieldType === 'SELECT' && (
                <div>
                  <label htmlFor="cf-opts" className="block text-xs font-medium text-slate-700 mb-1">
                    Daftar Pilihan (pisahkan dengan koma)
                  </label>
                  <input
                    id="cf-opts"
                    type="text"
                    value={fieldOptions}
                    onChange={(e) => setFieldOptions(e.target.value)}
                    placeholder="S, M, L, XL"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                />
                <span>Wajib diisi (Required)</span>
              </label>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Tambahkan Custom Field</span>
              </button>
            </form>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  Custom Fields Aktif ({activeWorkspace.customFields.length})
                </h2>
              </div>

              {activeWorkspace.customFields.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada custom field untuk {activeWorkspace.tenant.name}. Tambahkan di formulir
                  sebelah kiri.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeWorkspace.customFields.map((cf) => (
                    <div
                      key={cf.id}
                      className="px-5 py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{cf.fieldLabel}</p>
                        <p className="text-xs text-slate-500">
                          Entitas: <span className="font-mono text-slate-700">{cf.targetEntity}</span>{' '}
                          · Key: <span className="font-mono text-slate-700">{cf.fieldKey}</span> ·
                          Tipe: {cf.fieldType}
                          {cf.isRequired ? ' · Wajib' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCustomField(cf.id)}
                        aria-label={`Hapus field ${cf.fieldLabel}`}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PRODUCTS CATALOG WITH DYNAMIC CUSTOM ATTRIBUTES */}
        {tab === 'PRODUCTS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleCreateProduct}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-3.5"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Tambah Produk / Menu</h2>
                <p className="text-xs text-slate-500">
                  Semua Custom Fields target <span className="font-mono">products</span> otomatis
                  muncul di bawah ini
                </p>
              </div>

              <div>
                <label htmlFor="p-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Produk / Menu
                </label>
                <input
                  id="p-name"
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Contoh: Kecap Bango 520ml"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="p-sku" className="block text-xs font-medium text-slate-700 mb-1">
                    SKU
                  </label>
                  <input
                    id="p-sku"
                    type="text"
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value)}
                    placeholder="SKU-010"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="p-bc" className="block text-xs font-medium text-slate-700 mb-1">
                    Barcode / QR
                  </label>
                  <input
                    id="p-bc"
                    type="text"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    placeholder="8991234567890"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="p-price" className="block text-xs font-medium text-slate-700 mb-1">
                    Harga Jual
                  </label>
                  <input
                    id="p-price"
                    type="number"
                    min={0}
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    placeholder="25000"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="p-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    HPP Awal
                  </label>
                  <input
                    id="p-cost"
                    type="number"
                    min={0}
                    value={prodCost}
                    onChange={(e) => setProdCost(e.target.value)}
                    placeholder="18000"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="p-stock" className="block text-xs font-medium text-slate-700 mb-1">
                    Stok Awal
                  </label>
                  <input
                    id="p-stock"
                    type="number"
                    min={0}
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Dynamic Custom Fields Rendered Automatically */}
              {productCustomFields.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-xs font-semibold text-emerald-700">
                    Atribut Dinamis (Custom Fields JSONB)
                  </p>
                  {productCustomFields.map((cf) => (
                    <div key={cf.id}>
                      <label
                        htmlFor={`prod-cf-${cf.fieldKey}`}
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {cf.fieldLabel} {cf.isRequired ? '*' : ''}
                      </label>
                      {cf.fieldType === 'SELECT' ? (
                        <select
                          id={`prod-cf-${cf.fieldKey}`}
                          required={cf.isRequired}
                          value={String(prodCustomValues[cf.fieldKey] ?? '')}
                          onChange={(e) =>
                            setProdCustomValues((p) => ({ ...p, [cf.fieldKey]: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                        >
                          <option value="">Pilih...</option>
                          {cf.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : cf.fieldType === 'BOOLEAN' ? (
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                          <input
                            id={`prod-cf-${cf.fieldKey}`}
                            type="checkbox"
                            checked={Boolean(prodCustomValues[cf.fieldKey])}
                            onChange={(e) =>
                              setProdCustomValues((p) => ({
                                ...p,
                                [cf.fieldKey]: e.target.checked,
                              }))
                            }
                          />
                          <span>Aktif / Ya</span>
                        </label>
                      ) : (
                        <input
                          id={`prod-cf-${cf.fieldKey}`}
                          type={
                            cf.fieldType === 'NUMBER'
                              ? 'number'
                              : cf.fieldType === 'DATE'
                              ? 'date'
                              : 'text'
                          }
                          required={cf.isRequired}
                          value={String(prodCustomValues[cf.fieldKey] ?? '')}
                          onChange={(e) =>
                            setProdCustomValues((p) => ({ ...p, [cf.fieldKey]: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Simpan Produk ke Katalog
              </button>
            </form>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">
                  Daftar Produk &amp; Bahan ({activeWorkspace.products.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <th className="py-3 px-5">Produk &amp; Custom JSONB</th>
                      <th className="py-3 px-4 text-right">Harga Jual</th>
                      <th className="py-3 px-5 text-right">Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeWorkspace.products.map((p) => {
                      const attrPairs = Object.entries(p.customAttributes || {});
                      return (
                        <tr key={p.id}>
                          <td className="py-3 px-5">
                            <p className="font-medium text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-500">
                              <span className="font-mono">{p.sku}</span> · {p.itemType}
                              {attrPairs.length > 0 &&
                                ` · ${attrPairs.map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}`}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                            {formatRupiah(p.sellingPrice)}
                          </td>
                          <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {Number(p.stockQty)} {p.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: QR TABLE CODES & TENANT TAX/MODULE PROFILE */}
        {tab === 'TABLES_PROFILE' && (
          <div className="space-y-6">
            {/* Printable QR Codes per Table */}
            {activeWorkspace.tables.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      QR Code Meja Self-Order ({activeWorkspace.tables.length} Meja)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Cetak dan tempel di setiap meja pelanggan untuk pemesanan mandiri &amp; QRIS
                      otomatis
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {activeWorkspace.tables.map((t) => {
                    const relPath = `/order/${activeWorkspace.tenant.slug}/${t.qrToken}`;
                    const fullUrl = `${originUrl}${relPath}`;
                    return (
                      <div
                        key={t.id}
                        className="border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center gap-3 bg-slate-50/40"
                      >
                        <div className="bg-white p-3 border border-slate-200 rounded-lg">
                          <QRCodeSVG value={fullUrl} size={116} level="M" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">Meja {t.tableNumber}</p>
                          <p className="text-[11px] font-mono text-slate-500">{t.qrToken}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(relPath)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Buka Halaman QR</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Modular Subscription Plan Config */}
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Modul Langganan Aktif</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aktifkan atau nonaktifkan fitur tambahan sesuai kebutuhan operasional tenant aktif
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURE_MODULES.map((m) => {
                  const enabled = activeWorkspace.tenant.activeModules.includes(m.code);
                  return (
                    <div
                      key={m.code}
                      className="flex items-center justify-between gap-3 p-3.5 border border-slate-200 rounded-xl bg-slate-50/40"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                        <p className="text-xs font-mono text-slate-500">
                          {formatRupiah(m.monthlyPrice)}/bln
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={m.isCore}
                        onClick={() => toggleTenantModule(m.code)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          enabled
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        } disabled:opacity-60`}
                      >
                        {m.isCore ? 'Wajib (Gratis)' : enabled ? 'Aktif' : 'Aktifkan'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
