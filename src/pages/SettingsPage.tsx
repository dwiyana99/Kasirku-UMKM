import React, { useEffect, useMemo, useState } from 'react';
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
  CreditCard,
  ChevronDown,
  Save,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { TenantSettings } from '../components/TenantSettings';
import { ReceiptDesigner } from '../components/ReceiptDesigner';
import { useApp } from '../context/AppContext';
import { FEATURE_MODULES } from '../data/seedData';
import { formatRupiah } from '../lib/pos/checkout-service';
import { evaluateWhatsappSendingPolicy } from '../lib/messaging/whatsapp-policy';
import { getHybridPlan } from '../lib/saas/hybrid-pricing';
import type {
  CustomFieldTarget,
  CustomFieldType,
  ItemType,
} from '../types/domain';

type CoreSettingsTab = 'PROFILE_RECEIPT' | 'PAYMENTS_WA' | 'PLAN_ADVANCED';
type ProfileSubTab = 'PROFILE' | 'RECEIPT';
type AdvancedSubTab = 'CUSTOM_FIELDS' | 'DYNAMIC_PRODUCTS' | 'QR_TABLES';

function resolveTabFromUrl(): CoreSettingsTab {
  if (typeof window === 'undefined') return 'PROFILE_RECEIPT';
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  if (tabParam === 'payments_wa' || tabParam === 'wa' || tabParam === 'whatsapp') {
    return 'PAYMENTS_WA';
  }
  if (tabParam === 'plan' || tabParam === 'advanced') {
    return 'PLAN_ADVANCED';
  }
  return 'PROFILE_RECEIPT';
}

export function SettingsPage() {
  const {
    activeWorkspace,
    route,
    hasAddOn,
    addCustomField,
    removeCustomField,
    addProduct,
    toggleTenantModule,
    updateTenantRegionalAndWa,
    navigate,
  } = useApp();

  const [tab, setTab] = useState<CoreSettingsTab>(() => resolveTabFromUrl());
  const [profileSubTab, setProfileSubTab] = useState<ProfileSubTab>('PROFILE');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedSubTab, setAdvancedSubTab] = useState<AdvancedSubTab>('CUSTOM_FIELDS');
  const [notice, setNotice] = useState<string | null>(null);

  // Quick Owner WhatsApp Number state inside "Pembayaran & WhatsApp"
  const [ownerWaInput, setOwnerWaInput] = useState<string>(
    activeWorkspace.tenant.settings?.businessWhatsappNumber ?? ''
  );
  const [waError, setWaError] = useState<string | null>(null);

  useEffect(() => {
    setOwnerWaInput(activeWorkspace.tenant.settings?.businessWhatsappNumber ?? '');
    setWaError(null);
  }, [activeWorkspace.tenant.id, activeWorkspace.tenant.settings?.businessWhatsappNumber]);

  useEffect(() => {
    const requested = resolveTabFromUrl();
    if (requested !== 'PROFILE_RECEIPT') {
      setTab(requested);
    }
  }, [route]);

  const waPolicy = useMemo(
    () =>
      evaluateWhatsappSendingPolicy({
        businessWhatsappNumber: activeWorkspace.tenant.settings?.businessWhatsappNumber,
        hasFonnte: hasAddOn('ADDON_WA_FONNTE'),
      }),
    [activeWorkspace.tenant.settings?.businessWhatsappNumber, hasAddOn]
  );

  const currentPlan = activeWorkspace.tenant.subscriptionPlan ?? 'BASIC';
  const planDef = getHybridPlan(currentPlan);

  // Custom Field Builder State
  const [targetEntity, setTargetEntity] = useState<CustomFieldTarget>('products');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('TEXT');
  const [fieldOptions, setFieldOptions] = useState('');
  const [isRequired, setIsRequired] = useState(false);

  // Dynamic Product Creation Form State
  const [prodName, setProdName] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodStock, setProdStock] = useState('10');
  const [prodCustomValues, setProdCustomValues] = useState<Record<string, string | boolean>>({});

  const flashNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4500);
  };

  const handleSaveOwnerWa = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ownerWaInput.trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (trimmed && digitsOnly.length < 9) {
      setWaError('Masukkan nomor WhatsApp yang valid (minimal 9 digit, contoh: 081234567890).');
      return;
    }
    setWaError(null);
    updateTenantRegionalAndWa({ businessWhatsappNumber: trimmed });
    if (trimmed) {
      flashNotice(
        `Nomor WhatsApp pemilik (${trimmed}) berhasil disimpan. Tombol kirim rekap kasir & rincian transaksi pelanggan sekarang aktif.`
      );
    } else {
      flashNotice(
        'Nomor WhatsApp pemilik dikosongkan. Tombol kirim WhatsApp disembunyikan sementara hingga nomor diisi kembali.'
      );
    }
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
    flashNotice(`Kolom tambahan "${fieldLabel.trim()}" berhasil ditambahkan.`);
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
    flashNotice(`Produk "${prodName.trim()}" berhasil disimpan beserta catatan tambahannya.`);
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <AppShell
      title="Pengaturan Usaha"
      subtitle="Atur profil & struk toko, nomor WhatsApp pemilik, pembayaran non-tunai, serta paket aktif"
    >
      <div className="space-y-6">
        {notice && (
          <div
            role="status"
            data-testid="settings-notice-banner"
            className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{notice}</span>
          </div>
        )}

        {/* 3 Core Intuitive Settings Tabs */}
        <div
          role="tablist"
          aria-label="Kategori Pengaturan Usaha"
          className="inline-flex flex-wrap gap-1.5 p-1 bg-white border border-stone-200 rounded-xl"
        >
          {(
            [
              {
                id: 'PROFILE_RECEIPT',
                testId: 'settings-tab-profile',
                label: 'Profil & Struk Toko',
                icon: Building2,
              },
              {
                id: 'PAYMENTS_WA',
                testId: 'settings-tab-payments-wa',
                label: 'Pembayaran & WhatsApp',
                icon: MessageCircle,
                alertDot: waPolicy.needsOwnerWaReminder,
              },
              {
                id: 'PLAN_ADVANCED',
                testId: 'settings-tab-plan-advanced',
                label: 'Paket & Opsi Lanjutan',
                icon: SlidersHorizontal,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={item.testId}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>{item.label}</span>
                {'alertDot' in item && item.alertDot && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                    aria-label="Perlu dilengkapi"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: PROFIL & STRUK TOKO */}
        {tab === 'PROFILE_RECEIPT' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="settings-subtab-profile"
                onClick={() => setProfileSubTab('PROFILE')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  profileSubTab === 'PROFILE'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-stone-200 text-stone-600 hover:text-stone-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Profil Usaha &amp; Domisili Pajak</span>
              </button>
              <button
                type="button"
                data-testid="settings-subtab-receipt"
                onClick={() => setProfileSubTab('RECEIPT')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  profileSubTab === 'RECEIPT'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-white border-stone-200 text-stone-600 hover:text-stone-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Desain Struk Thermal</span>
              </button>
            </div>

            {profileSubTab === 'PROFILE' ? (
              <TenantSettings
                onSaved={(tenantName) =>
                  flashNotice(`Profil usaha & pengaturan dasar untuk ${tenantName} berhasil disimpan.`)
                }
              />
            ) : (
              <ReceiptDesigner onSaved={(msg) => flashNotice(msg)} />
            )}
          </div>
        )}

        {/* TAB 2: PEMBAYARAN & WHATSAPP */}
        {tab === 'PAYMENTS_WA' && (
          <div className="space-y-6">
            {/* Primary Card: Nomor WhatsApp Pemilik / Usaha */}
            <section
              data-testid="settings-owner-wa-card"
              className="bg-white border border-stone-200 rounded-xl p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                      waPolicy.hasOwnerWa
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}
                  >
                    <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-stone-900">
                      Nomor WhatsApp Pemilik / Usaha
                    </h2>
                    <p className="text-xs text-stone-600 leading-relaxed max-w-[65ch]">
                      Wajib diisi agar Anda bisa mengirim rekap Tutup Kasir ke WhatsApp pemilik
                      dan mengirim rincian pesanan atau struk ke WhatsApp pelanggan secara gratis
                      tanpa Add-On. Selama nomor ini kosong, tombol kirim WhatsApp disembunyikan.
                    </p>
                  </div>
                </div>
                <span
                  data-testid="settings-owner-wa-status"
                  className={`text-xs font-semibold whitespace-nowrap ${
                    waPolicy.hasOwnerWa ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {waPolicy.hasOwnerWa ? 'Aktif & Siap Kirim' : 'Belum Diisi'}
                </span>
              </div>

              <form onSubmit={handleSaveOwnerWa} className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row gap-2.5 max-w-xl">
                  <div className="flex-1">
                    <label htmlFor="settings-owner-wa-input" className="sr-only">
                      Nomor WhatsApp Pemilik Usaha
                    </label>
                    <input
                      id="settings-owner-wa-input"
                      data-testid="settings-owner-wa-input"
                      type="tel"
                      value={ownerWaInput}
                      onChange={(e) => {
                        setOwnerWaInput(e.target.value);
                        if (waError) setWaError(null);
                      }}
                      placeholder="Contoh: 081234567890 atau 6281234567890"
                      className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-stone-900 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="settings-owner-wa-save-btn"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <Save className="w-4 h-4" strokeWidth={1.75} />
                    <span>Simpan Nomor WA</span>
                  </button>
                </div>

                {waError && (
                  <p className="text-xs text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                    <span>{waError}</span>
                  </p>
                )}

                <p className="text-[11px] text-stone-500">
                  Format bebas (08xxx atau 628xxx). Nomor ini digunakan sebagai tujuan rekap
                  harian pemilik sekaligus mengaktifkan tombol kirim nota ke pelanggan setelah
                  transaksi selesai.
                </p>
              </form>
            </section>

            {/* Optional Add-On: WhatsApp Gateway Otomatis (Fonnte) */}
            <section className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 shrink-0">
                  <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">
                      WhatsApp Gateway Otomatis (Fonnte)
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        hasAddOn('ADDON_WA_FONNTE') ? 'text-emerald-700' : 'text-stone-500'
                      }`}
                    >
                      {hasAddOn('ADDON_WA_FONNTE') ? 'Aktif · Rp66.000/bln' : 'Opsional · Rp66.000/bln'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 max-w-[65ch] leading-relaxed">
                    Kirim struk belanja POS, notifikasi pesanan, dan tagihan kost langsung ke
                    WhatsApp pelanggan secara otomatis dari server tanpa perlu klik manual.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="px-4 py-2 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {hasAddOn('ADDON_WA_FONNTE') ? 'Kelola Add-On' : 'Lihat Add-On'}
              </button>
            </section>

            {/* Non-Cash Payment & QRIS Shortcut */}
            <section className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                  <Wallet className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">
                      Pembayaran Non-Tunai (QRIS, E-Wallet &amp; Transfer)
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        hasAddOn('ADDON_NON_CASH_PAYMENT') ? 'text-emerald-700' : 'text-stone-500'
                      }`}
                    >
                      {hasAddOn('ADDON_NON_CASH_PAYMENT') ? 'Aktif di Paket Anda' : 'Tersedia mulai BASIC'}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 max-w-[65ch] leading-relaxed">
                    Atur rekening pencairan usaha, penyedia QRIS dinamis, biaya layanan, dan
                    tampilan Layar Pelanggan di meja kasir.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings/payments')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Buka Pengaturan Pembayaran</span>
              </button>
            </section>
          </div>
        )}

        {/* TAB 3: PAKET & OPSI LANJUTAN */}
        {tab === 'PLAN_ADVANCED' && (
          <div className="space-y-6">
            {/* Active Plan Summary Card */}
            <section className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Paket Langganan Aktif
                </p>
                <h2 className="text-base font-bold text-stone-900">
                  {planDef.name} ({formatRupiah(planDef.monthlyPrice)}/bln)
                </h2>
                <p className="text-xs text-stone-600 max-w-[65ch]">{planDef.tagline}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Ubah Paket &amp; Add-On</span>
              </button>
            </section>

            {/* Modular Switches */}
            <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-stone-900">Modul Aktif Usaha</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Aktifkan atau nonaktifkan modul tambahan sesuai kebutuhan operasional harian.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FEATURE_MODULES.map((m) => {
                  const enabled = activeWorkspace.tenant.activeModules.includes(m.code);
                  return (
                    <div
                      key={m.code}
                      className="flex items-center justify-between gap-3 p-3.5 border border-stone-200 rounded-xl bg-stone-50/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{m.name}</p>
                        <p className="text-xs font-mono tabular-nums text-stone-500">
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
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        } disabled:opacity-60`}
                      >
                        {m.isCore ? 'Wajib (Gratis)' : enabled ? 'Aktif' : 'Aktifkan'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Collapsible Advanced Options (Hidden by default for beginners) */}
            <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <button
                type="button"
                data-testid="settings-advanced-toggle"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-stone-50 transition-colors"
              >
                <div>
                  <h2 className="text-sm font-bold text-stone-900">
                    Opsi Lanjutan (Kolom Catatan Tambahan, Produk Dinamis &amp; QR Meja)
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Buka bagian ini jika Anda ingin menambah kolom info khusus pada produk/transaksi
                    atau mencetak kode QR meja pelanggan.
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-stone-500 shrink-0 transition-transform duration-150 ${
                    advancedOpen ? 'rotate-180' : ''
                  }`}
                  strokeWidth={1.75}
                />
              </button>

              {advancedOpen && (
                <div className="border-t border-stone-200 p-6 space-y-5 bg-stone-50/40">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'CUSTOM_FIELDS', label: 'Kolom Tambahan', icon: SlidersHorizontal },
                        { id: 'DYNAMIC_PRODUCTS', label: 'Tambah Produk & Info', icon: Package },
                        { id: 'QR_TABLES', label: 'QR Code Meja', icon: QrCode },
                      ] as const
                    ).map((sub) => {
                      const Icon = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setAdvancedSubTab(sub.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            advancedSubTab === sub.id
                              ? 'bg-stone-900 border-stone-900 text-white'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* ADVANCED 1: DYNAMIC CUSTOM FIELDS */}
                  {advancedSubTab === 'CUSTOM_FIELDS' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <form
                        onSubmit={handleCreateCustomField}
                        className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-4"
                      >
                        <div>
                          <h3 className="text-sm font-bold text-stone-900">
                            Tambah Kolom Catatan Baru
                          </h3>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Otomatis muncul di formulir produk, pesanan, biaya, atau aset.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="cf-target"
                            className="block text-xs font-medium text-stone-700 mb-1"
                          >
                            Bagian Tujuan
                          </label>
                          <select
                            id="cf-target"
                            value={targetEntity}
                            onChange={(e) => setTargetEntity(e.target.value as CustomFieldTarget)}
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white"
                          >
                            <option value="products">Produk &amp; Menu</option>
                            <option value="orders">Pesanan Kasir</option>
                            <option value="expenses">Biaya Operasional</option>
                            <option value="assets">Aset Tetap</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="cf-label"
                            className="block text-xs font-medium text-stone-700 mb-1"
                          >
                            Nama Kolom
                          </label>
                          <input
                            id="cf-label"
                            type="text"
                            required
                            value={fieldLabel}
                            onChange={(e) => setFieldLabel(e.target.value)}
                            placeholder="Contoh: No. Batch BPOM / Kode Rak"
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="cf-type"
                            className="block text-xs font-medium text-stone-700 mb-1"
                          >
                            Jenis Isian
                          </label>
                          <select
                            id="cf-type"
                            value={fieldType}
                            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white"
                          >
                            <option value="TEXT">Teks</option>
                            <option value="NUMBER">Angka</option>
                            <option value="DATE">Tanggal</option>
                            <option value="SELECT">Pilihan Daftar</option>
                            <option value="BOOLEAN">Centang Ya/Tidak</option>
                          </select>
                        </div>

                        {fieldType === 'SELECT' && (
                          <div>
                            <label
                              htmlFor="cf-opts"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
                              Daftar Pilihan (pisahkan dengan koma)
                            </label>
                            <input
                              id="cf-opts"
                              type="text"
                              value={fieldOptions}
                              onChange={(e) => setFieldOptions(e.target.value)}
                              placeholder="S, M, L, XL"
                              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                            />
                          </div>
                        )}

                        <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isRequired}
                            onChange={(e) => setIsRequired(e.target.checked)}
                          />
                          <span>Wajib diisi</span>
                        </label>

                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          <Plus className="w-4 h-4" strokeWidth={1.75} />
                          <span>Tambahkan Kolom</span>
                        </button>
                      </form>

                      <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-stone-200">
                          <h3 className="text-sm font-semibold text-stone-900">
                            Kolom Tambahan Aktif ({activeWorkspace.customFields.length})
                          </h3>
                        </div>

                        {activeWorkspace.customFields.length === 0 ? (
                          <div className="p-8 text-center text-xs text-stone-500">
                            Belum ada kolom tambahan untuk {activeWorkspace.tenant.name}.
                          </div>
                        ) : (
                          <div className="divide-y divide-stone-100">
                            {activeWorkspace.customFields.map((cf) => (
                              <div
                                key={cf.id}
                                className="px-5 py-3.5 flex items-center justify-between gap-4"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-stone-900">
                                    {cf.fieldLabel}
                                  </p>
                                  <p className="text-xs text-stone-500">
                                    Bagian: <span className="font-mono text-stone-700">{cf.targetEntity}</span>{' '}
                                    · Tipe: {cf.fieldType}
                                    {cf.isRequired ? ' · Wajib' : ''}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCustomField(cf.id)}
                                  aria-label={`Hapus kolom ${cf.fieldLabel}`}
                                  className="p-2 text-stone-400 hover:text-rose-600 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ADVANCED 2: PRODUCTS CATALOG WITH DYNAMIC CUSTOM ATTRIBUTES */}
                  {advancedSubTab === 'DYNAMIC_PRODUCTS' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      <form
                        onSubmit={handleCreateProduct}
                        className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-3.5"
                      >
                        <div>
                          <h3 className="text-sm font-bold text-stone-900">Tambah Produk / Menu</h3>
                          <p className="text-xs text-stone-500">
                            Semua kolom tambahan produk otomatis muncul di bawah ini.
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="p-name"
                            className="block text-xs font-medium text-stone-700 mb-1"
                          >
                            Nama Produk / Menu
                          </label>
                          <input
                            id="p-name"
                            type="text"
                            required
                            value={prodName}
                            onChange={(e) => setProdName(e.target.value)}
                            placeholder="Contoh: Kecap Bango 520ml"
                            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="p-sku"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
                              Kode SKU
                            </label>
                            <input
                              id="p-sku"
                              type="text"
                              value={prodSku}
                              onChange={(e) => setProdSku(e.target.value)}
                              placeholder="SKU-010"
                              className="w-full px-3 py-2 text-sm font-mono border border-stone-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="p-bc"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
                              Barcode / QR
                            </label>
                            <input
                              id="p-bc"
                              type="text"
                              value={prodBarcode}
                              onChange={(e) => setProdBarcode(e.target.value)}
                              placeholder="8991234567890"
                              className="w-full px-3 py-2 text-sm font-mono border border-stone-200 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label
                              htmlFor="p-price"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
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
                              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="p-cost"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
                              Modal Awal
                            </label>
                            <input
                              id="p-cost"
                              type="number"
                              min={0}
                              value={prodCost}
                              onChange={(e) => setProdCost(e.target.value)}
                              placeholder="18000"
                              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="p-stock"
                              className="block text-xs font-medium text-stone-700 mb-1"
                            >
                              Stok Awal
                            </label>
                            <input
                              id="p-stock"
                              type="number"
                              min={0}
                              value={prodStock}
                              onChange={(e) => setProdStock(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-stone-200 rounded-lg"
                            />
                          </div>
                        </div>

                        {productCustomFields.length > 0 && (
                          <div className="pt-3 border-t border-stone-100 space-y-3">
                            <p className="text-xs font-semibold text-emerald-700">
                              Info Tambahan Produk
                            </p>
                            {productCustomFields.map((cf) => (
                              <div key={cf.id}>
                                <label
                                  htmlFor={`prod-cf-${cf.fieldKey}`}
                                  className="block text-xs font-medium text-stone-700 mb-1"
                                >
                                  {cf.fieldLabel} {cf.isRequired ? '*' : ''}
                                </label>
                                {cf.fieldType === 'SELECT' ? (
                                  <select
                                    id={`prod-cf-${cf.fieldKey}`}
                                    required={cf.isRequired}
                                    value={String(prodCustomValues[cf.fieldKey] ?? '')}
                                    onChange={(e) =>
                                      setProdCustomValues((p) => ({
                                        ...p,
                                        [cf.fieldKey]: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white"
                                  >
                                    <option value="">Pilih...</option>
                                    {cf.options.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : cf.fieldType === 'BOOLEAN' ? (
                                  <label className="inline-flex items-center gap-2 text-xs text-stone-700">
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
                                      setProdCustomValues((p) => ({
                                        ...p,
                                        [cf.fieldKey]: e.target.value,
                                      }))
                                    }
                                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                        >
                          Simpan Produk ke Katalog
                        </button>
                      </form>

                      <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-stone-200">
                          <h3 className="text-sm font-semibold text-stone-900">
                            Daftar Produk &amp; Bahan ({activeWorkspace.products.length})
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
                                <th className="py-3 px-5">Produk &amp; Info Tambahan</th>
                                <th className="py-3 px-4 text-right">Harga Jual</th>
                                <th className="py-3 px-5 text-right">Stok</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                              {activeWorkspace.products.map((p) => {
                                const attrPairs = Object.entries(p.customAttributes || {});
                                return (
                                  <tr key={p.id}>
                                    <td className="py-3 px-5">
                                      <p className="font-medium text-stone-900">{p.name}</p>
                                      <p className="text-xs text-stone-500">
                                        <span className="font-mono">{p.sku}</span> · {p.itemType}
                                        {attrPairs.length > 0 &&
                                          ` · ${attrPairs
                                            .map(([k, v]) => `${k}: ${String(v)}`)
                                            .join(' · ')}`}
                                      </p>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono tabular-nums text-stone-900 whitespace-nowrap">
                                      {formatRupiah(p.sellingPrice)}
                                    </td>
                                    <td className="py-3 px-5 text-right font-mono tabular-nums text-stone-600 whitespace-nowrap">
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

                  {/* ADVANCED 3: QR TABLE CODES */}
                  {advancedSubTab === 'QR_TABLES' && (
                    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                      <div>
                        <h3 className="text-sm font-bold text-stone-900">
                          QR Code Meja Pesan Mandiri ({activeWorkspace.tables.length} Meja)
                        </h3>
                        <p className="text-xs text-stone-500">
                          Cetak dan tempel di setiap meja agar pelanggan bisa memesan dan membayar
                          langsung dari ponsel.
                        </p>
                      </div>

                      {activeWorkspace.tables.length === 0 ? (
                        <p className="text-xs text-stone-500 py-4">
                          Usaha ini belum memiliki daftar meja. Fitur QR Meja tersedia untuk usaha
                          kuliner/restoran.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {activeWorkspace.tables.map((t) => {
                            const relPath = `/order/${activeWorkspace.tenant.slug}/${t.qrToken}`;
                            const fullUrl = `${originUrl}${relPath}`;
                            return (
                              <div
                                key={t.id}
                                className="border border-stone-200 rounded-xl p-4 flex flex-col items-center text-center gap-3 bg-stone-50/40"
                              >
                                <div className="bg-white p-3 border border-stone-200 rounded-lg">
                                  <QRCodeSVG value={fullUrl} size={116} level="M" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-stone-900">
                                    Meja {t.tableNumber}
                                  </p>
                                  <p className="text-[11px] font-mono text-stone-500">
                                    {t.qrToken}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => navigate(relPath)}
                                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                >
                                  <QrCode className="w-3.5 h-3.5" strokeWidth={1.75} />
                                  <span>Buka Halaman QR</span>
                                  <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
