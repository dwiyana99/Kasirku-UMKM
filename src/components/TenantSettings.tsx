import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Building2,
  CheckCircle2,
  Database,
  Image as ImageIcon,
  Landmark,
  MessageCircle,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { validateCoretaxIds } from '../lib/tax/indonesia-tax-engine';
import {
  buildDefaultTenantRegionalTax,
  describeNationalAndRegionalTaxSummary,
  resolveEffectiveRegionalTax,
} from '../lib/tax/regional-tax-indonesia';
import type { TaxEntityType } from '../types/domain';

const MAX_LOGO_BYTES = 200 * 1024; // 200 KB cap for fast server & Neon JSONB sync
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_FOOTER_LENGTH = 240;

const FOOTER_PRESETS = [
  'Terima kasih atas kunjungan Anda!',
  'Terima kasih telah berbelanja! Barang yang sudah dibeli tidak dapat ditukar.',
  'Terima kasih! Simpan struk ini sebagai bukti pembayaran sah.',
];

function isSafeLogoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'KU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export interface TenantSettingsProps {
  onSaved?: (tenantName: string) => void;
}

export function TenantSettings({ onSaved }: TenantSettingsProps) {
  const {
    activeWorkspace,
    updateTenantProfile,
    updateTenantRegionalAndWa,
    regionalTaxRegistry,
    syncStatus,
    session,
  } = useApp();
  const tenant = activeWorkspace.tenant;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState(tenant.name);
  const [address, setAddress] = useState(tenant.address);
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? '');
  const [logoLoadError, setLogoLoadError] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState(tenant.receiptFooter);
  const [taxEntity, setTaxEntity] = useState<TaxEntityType>(tenant.taxEntity);
  const [isPkp, setIsPkp] = useState<boolean>(tenant.isPkp);
  const [npwp16, setNpwp16] = useState(tenant.npwp16);
  const [nitku22, setNitku22] = useState(tenant.nitku22);
  const [serviceChargePercent, setServiceChargePercent] = useState(() =>
    new Decimal(tenant.serviceChargeRate || '0').mul(100).toDecimalPlaces(2).toString()
  );
  const [thermalPaperWidth, setThermalPaperWidth] = useState<'58mm' | '80mm'>(
    tenant.settings.thermalPaperWidth
  );
  const [autoPrintQrOrders, setAutoPrintQrOrders] = useState<boolean>(
    tenant.settings.autoPrintQrOrders
  );
  const [businessWa, setBusinessWa] = useState<string>(
    tenant.settings.businessWhatsappNumber ?? ''
  );
  const [regionCode, setRegionCode] = useState<string>(
    tenant.settings.regionalTax?.regionCode ?? 'ID-NONE'
  );
  const [applyRegionalTax, setApplyRegionalTax] = useState<boolean>(
    tenant.settings.regionalTax?.applyRegionalTax ?? false
  );
  const [customTaxName, setCustomTaxName] = useState<string>(
    tenant.settings.regionalTax?.customTaxName ?? ''
  );
  const [customRegionalRatePct, setCustomRegionalRatePct] = useState<string>(() => {
    const raw = tenant.settings.regionalTax?.customRateOverride;
    if (!raw) return '';
    try {
      const pct = new Decimal(raw).mul(100);
      return pct.gt(0) ? pct.toDecimalPlaces(2).toString() : '';
    } catch {
      return '';
    }
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const prevTenantIdRef = useRef<string>(tenant.id);

  // Sync local form state strictly whenever active tenant switches or its persisted fields change
  useEffect(() => {
    setName(tenant.name);
    setAddress(tenant.address);
    setLogoUrl(tenant.logoUrl ?? '');
    setLogoLoadError(false);
    setReceiptFooter(tenant.receiptFooter);
    setTaxEntity(tenant.taxEntity);
    setIsPkp(tenant.isPkp);
    setNpwp16(tenant.npwp16);
    setNitku22(tenant.nitku22);
    setServiceChargePercent(
      new Decimal(tenant.serviceChargeRate || '0').mul(100).toDecimalPlaces(2).toString()
    );
    setThermalPaperWidth(tenant.settings.thermalPaperWidth);
    setAutoPrintQrOrders(tenant.settings.autoPrintQrOrders);
    setBusinessWa(tenant.settings.businessWhatsappNumber ?? '');
    setRegionCode(tenant.settings.regionalTax?.regionCode ?? 'ID-NONE');
    setApplyRegionalTax(tenant.settings.regionalTax?.applyRegionalTax ?? false);
    setCustomTaxName(tenant.settings.regionalTax?.customTaxName ?? '');
    const savedOverride = tenant.settings.regionalTax?.customRateOverride;
    if (savedOverride) {
      try {
        const pct = new Decimal(savedOverride).mul(100);
        setCustomRegionalRatePct(pct.gt(0) ? pct.toDecimalPlaces(2).toString() : '');
      } catch {
        setCustomRegionalRatePct('');
      }
    } else {
      setCustomRegionalRatePct('');
    }
    setErrorMsg(null);
    if (prevTenantIdRef.current !== tenant.id) {
      setSavedNotice(null);
      prevTenantIdRef.current = tenant.id;
    }
  }, [
    tenant.id,
    tenant.name,
    tenant.address,
    tenant.logoUrl,
    tenant.receiptFooter,
    tenant.taxEntity,
    tenant.isPkp,
    tenant.npwp16,
    tenant.nitku22,
    tenant.serviceChargeRate,
    tenant.settings.thermalPaperWidth,
    tenant.settings.autoPrintQrOrders,
    tenant.settings.businessWhatsappNumber,
    tenant.settings.regionalTax,
  ]);

  const coretaxValidation = useMemo(
    () => validateCoretaxIds(npwp16, nitku22),
    [npwp16, nitku22]
  );

  const currentServiceChargeDecimal = useMemo(() => {
    try {
      const pct = new Decimal(serviceChargePercent || '0');
      if (pct.lt(0) || pct.gt(100)) return null;
      return pct.div(100).toDecimalPlaces(4).toString();
    } catch {
      return null;
    }
  }, [serviceChargePercent]);

  const parsedCustomRegionalRateDecimal = useMemo(() => {
    const num = Number(customRegionalRatePct.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0 || num > 100) return null;
    return (num / 100).toFixed(4);
  }, [customRegionalRatePct]);

  const hasChanges = useMemo(() => {
    const savedServicePct = new Decimal(tenant.serviceChargeRate || '0')
      .mul(100)
      .toDecimalPlaces(2)
      .toString();
    const savedCustomPct = tenant.settings.regionalTax?.customRateOverride
      ? new Decimal(tenant.settings.regionalTax.customRateOverride)
          .mul(100)
          .toDecimalPlaces(2)
          .toString()
      : '';
    return (
      name.trim() !== tenant.name ||
      address.trim() !== tenant.address ||
      logoUrl.trim() !== (tenant.logoUrl ?? '') ||
      receiptFooter.trim() !== tenant.receiptFooter ||
      taxEntity !== tenant.taxEntity ||
      isPkp !== tenant.isPkp ||
      npwp16.trim() !== tenant.npwp16 ||
      nitku22.trim() !== tenant.nitku22 ||
      serviceChargePercent !== savedServicePct ||
      thermalPaperWidth !== tenant.settings.thermalPaperWidth ||
      autoPrintQrOrders !== tenant.settings.autoPrintQrOrders ||
      businessWa.trim() !== (tenant.settings.businessWhatsappNumber ?? '') ||
      regionCode !== (tenant.settings.regionalTax?.regionCode ?? 'ID-NONE') ||
      applyRegionalTax !== (tenant.settings.regionalTax?.applyRegionalTax ?? false) ||
      customTaxName.trim() !== (tenant.settings.regionalTax?.customTaxName ?? '') ||
      customRegionalRatePct.trim() !== (savedCustomPct === '0' ? '' : savedCustomPct)
    );
  }, [
    name,
    address,
    logoUrl,
    receiptFooter,
    taxEntity,
    isPkp,
    npwp16,
    nitku22,
    serviceChargePercent,
    thermalPaperWidth,
    autoPrintQrOrders,
    businessWa,
    regionCode,
    applyRegionalTax,
    customTaxName,
    customRegionalRatePct,
    tenant,
  ]);

  const regionalPreview = useMemo(() => {
    const hasCustomLevy = regionCode !== 'ID-NONE' && parsedCustomRegionalRateDecimal !== null;
    const draftRegional = {
      ...buildDefaultTenantRegionalTax(tenant.vertical, regionCode, regionalTaxRegistry),
      applyRegionalTax: regionCode !== 'ID-NONE' && (applyRegionalTax || hasCustomLevy),
      customTaxName: customTaxName.trim() || null,
      customRateOverride: parsedCustomRegionalRateDecimal,
    };
    return resolveEffectiveRegionalTax(tenant.vertical, draftRegional, regionalTaxRegistry);
  }, [
    applyRegionalTax,
    customTaxName,
    parsedCustomRegionalRateDecimal,
    regionCode,
    regionalTaxRegistry,
    tenant.vertical,
  ]);

  const taxSummaryPreview = useMemo(() => {
    const hasCustomLevy = regionCode !== 'ID-NONE' && parsedCustomRegionalRateDecimal !== null;
    const draftRegional = {
      ...buildDefaultTenantRegionalTax(tenant.vertical, regionCode, regionalTaxRegistry),
      applyRegionalTax: regionCode !== 'ID-NONE' && (applyRegionalTax || hasCustomLevy),
      customTaxName: customTaxName.trim() || null,
      customRateOverride: parsedCustomRegionalRateDecimal,
    };
    return describeNationalAndRegionalTaxSummary({
      vertical: tenant.vertical,
      taxEntity,
      isPkp,
      regionalTax: draftRegional,
      registry: regionalTaxRegistry,
    });
  }, [
    applyRegionalTax,
    customTaxName,
    isPkp,
    parsedCustomRegionalRateDecimal,
    regionCode,
    regionalTaxRegistry,
    taxEntity,
    tenant.vertical,
  ]);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setErrorMsg('Format logo harus PNG, JPG, WEBP, atau SVG.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErrorMsg('Ukuran file logo maksimal 200 KB agar sinkronisasi cloud tetap cepat.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        setLogoLoadError(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Gagal membaca file gambar logo. Silakan coba file lain.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleReset = () => {
    setName(tenant.name);
    setAddress(tenant.address);
    setLogoUrl(tenant.logoUrl ?? '');
    setLogoLoadError(false);
    setReceiptFooter(tenant.receiptFooter);
    setTaxEntity(tenant.taxEntity);
    setIsPkp(tenant.isPkp);
    setNpwp16(tenant.npwp16);
    setNitku22(tenant.nitku22);
    setServiceChargePercent(
      new Decimal(tenant.serviceChargeRate || '0').mul(100).toDecimalPlaces(2).toString()
    );
    setThermalPaperWidth(tenant.settings.thermalPaperWidth);
    setAutoPrintQrOrders(tenant.settings.autoPrintQrOrders);
    setBusinessWa(tenant.settings.businessWhatsappNumber ?? '');
    setRegionCode(tenant.settings.regionalTax?.regionCode ?? 'ID-NONE');
    setApplyRegionalTax(tenant.settings.regionalTax?.applyRegionalTax ?? false);
    setCustomTaxName(tenant.settings.regionalTax?.customTaxName ?? '');
    const savedOverride = tenant.settings.regionalTax?.customRateOverride;
    setCustomRegionalRatePct(
      savedOverride ? new Decimal(savedOverride).mul(100).toDecimalPlaces(2).toString() : ''
    );
    setErrorMsg(null);
    setSavedNotice(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Nama usaha wajib diisi.');
      return;
    }

    const trimmedLogo = logoUrl.trim();
    if (trimmedLogo && !isSafeLogoUrl(trimmedLogo)) {
      setErrorMsg('URL logo tidak valid. Gunakan tautan https://, path lokal /, atau unggah file gambar.');
      return;
    }

    if (npwp16.trim() && !coretaxValidation.npwpValid) {
      setErrorMsg('NPWP / NIK Coretax harus terdiri dari tepat 16 digit angka (atau kosongkan).');
      return;
    }

    if (nitku22.trim() && !coretaxValidation.nitkuValid) {
      setErrorMsg('NITKU Coretax harus terdiri dari tepat 22 digit angka (atau kosongkan).');
      return;
    }

    if (currentServiceChargeDecimal === null) {
      setErrorMsg('Service charge harus berupa angka antara 0% hingga 100%.');
      return;
    }

    const cleanFooter = receiptFooter.trim() || 'Terima kasih atas kunjungan Anda!';

    const hasCustomLevy = regionCode !== 'ID-NONE' && parsedCustomRegionalRateDecimal !== null;
    updateTenantRegionalAndWa({
      businessWhatsappNumber: businessWa.trim(),
      regionalTax: {
        ...buildDefaultTenantRegionalTax(tenant.vertical, regionCode, regionalTaxRegistry),
        applyRegionalTax: regionCode !== 'ID-NONE' && (applyRegionalTax || hasCustomLevy),
        customTaxName: customTaxName.trim() || null,
        customRateOverride: parsedCustomRegionalRateDecimal,
      },
    });

    updateTenantProfile({
      name: trimmedName,
      address: address.trim(),
      logoUrl: trimmedLogo || undefined,
      receiptFooter: cleanFooter,
      taxEntity,
      isPkp,
      npwp16: npwp16.trim(),
      nitku22: nitku22.trim(),
      serviceChargeRate: currentServiceChargeDecimal,
      settings: {
        thermalPaperWidth,
        autoPrintQrOrders,
      },
    });

    const message = `Pengaturan usaha "${trimmedName}" berhasil disimpan untuk tenant aktif (${tenant.slug}).`;
    setSavedNotice(message);
    onSaved?.(trimmedName);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: FORM */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 xl:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        aria-label="Formulir Pengaturan Profil Usaha"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Profil Usaha, Logo &amp; Footer Struk
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tenant aktif: <span className="font-semibold text-slate-800">{tenant.name}</span>{' '}
                <span className="font-mono text-slate-400">({tenant.slug})</span>
              </p>
            </div>
          </div>
          {hasChanges && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
              Perubahan belum disimpan
            </span>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs font-medium text-red-800 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {savedNotice && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* Section 1: Business Logo */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Logo Usaha
          </h3>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-slate-50/70 border border-slate-200 rounded-xl">
            <div className="w-20 h-20 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl.trim() && !logoLoadError ? (
                <img
                  src={logoUrl.trim()}
                  alt={`Logo ${name || tenant.name}`}
                  onError={() => setLogoLoadError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <span className="text-lg font-bold text-slate-700 tracking-tight">
                    {getInitials(name || tenant.name)}
                  </span>
                  <ImageIcon className="w-3.5 h-3.5 mt-0.5" />
                </div>
              )}
            </div>

            <div className="flex-1 w-full space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  id="tenant-logo-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Unggah Logo (Maks 200 KB)</span>
                </button>

                {logoUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoUrl('');
                      setLogoLoadError(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Logo</span>
                  </button>
                )}
              </div>

              <div>
                <label
                  htmlFor="tenant-logo-url"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Atau masukkan URL gambar logo
                </label>
                <input
                  id="tenant-logo-url"
                  type="text"
                  value={logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    setLogoLoadError(false);
                  }}
                  placeholder="https://contoh.com/logo.png atau /src/assets/images/..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Business Identity & Address */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Informasi Usaha &amp; Identitas Coretax
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label
                htmlFor="tenant-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Nama Usaha / Outlet *
              </label>
              <input
                id="tenant-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Restoran Sate Pak Budi"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="tenant-address"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Alamat Lengkap (Tampil di Header Struk &amp; Faktur)
              </label>
              <textarea
                id="tenant-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Raya Kemang No. 12, Jakarta Selatan"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="tenant-npwp"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                NPWP / NIK 16-Digit (Coretax)
              </label>
              <input
                id="tenant-npwp"
                type="text"
                inputMode="numeric"
                maxLength={16}
                value={npwp16}
                onChange={(e) => setNpwp16(e.target.value.replace(/\D/g, ''))}
                placeholder="16 digit angka"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
              {npwp16.length > 0 && (
                <p
                  className={`text-[11px] mt-1 ${
                    coretaxValidation.npwpValid ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {coretaxValidation.npwpValid
                    ? 'Format NPWP 16-digit valid'
                    : `${npwp16.length}/16 digit`}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="tenant-nitku"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                NITKU 22-Digit (Kode Cabang/Outlet)
              </label>
              <input
                id="tenant-nitku"
                type="text"
                inputMode="numeric"
                maxLength={22}
                value={nitku22}
                onChange={(e) => setNitku22(e.target.value.replace(/\D/g, ''))}
                placeholder="22 digit angka"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
              {nitku22.length > 0 && (
                <p
                  className={`text-[11px] mt-1 ${
                    coretaxValidation.nitkuValid ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {coretaxValidation.nitkuValid
                    ? 'Format NITKU 22-digit valid'
                    : `${nitku22.length}/22 digit`}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="tenant-tax-entity"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Bentuk Wajib Pajak (PP 20/2026)
              </label>
              <select
                id="tenant-tax-entity"
                value={taxEntity}
                onChange={(e) => setTaxEntity(e.target.value as TaxEntityType)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="WP_OP">WP Orang Pribadi (Bebas Rp500 Juta, 0,5% selamanya)</option>
                <option value="PT_PERORANGAN">PT Perorangan (0,5% selamanya ≤ Rp4,8M)</option>
                <option value="CV_FIRMA">CV / Firma Baru (Tarif Umum Pasal 31E 11%)</option>
                <option value="PT_BIASA">PT Biasa (Tarif Umum Pasal 17 / 31E)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="tenant-service-charge"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Biaya Layanan / Service Charge (%)
              </label>
              <input
                id="tenant-service-charge"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={serviceChargePercent}
                onChange={(e) => setServiceChargePercent(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              id="tenant-is-pkp"
              type="checkbox"
              checked={isPkp}
              onChange={(e) => setIsPkp(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
            />
            <span>Pengusaha Kena Pajak (PKP: PPN 12% × DPP Nilai Lain 11/12 PMK 131/2024)</span>
          </label>
        </section>

        {/* Section 3: Receipt Footer & Printer Settings */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Struk Thermal &amp; Catatan Footer
          </h3>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="tenant-receipt-footer"
                className="block text-xs font-medium text-slate-700"
              >
                Footer Struk Pembayaran
              </label>
              <span className="text-[11px] font-mono text-slate-400">
                {receiptFooter.length}/{MAX_FOOTER_LENGTH}
              </span>
            </div>
            <textarea
              id="tenant-receipt-footer"
              rows={3}
              maxLength={MAX_FOOTER_LENGTH}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="Terima kasih atas kunjungan Anda!"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {FOOTER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReceiptFooter(preset)}
                  className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors text-left"
                >
                  {preset.length > 44 ? `${preset.slice(0, 44)}…` : preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label
                htmlFor="tenant-paper-width"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Lebar Kertas Printer Thermal
              </label>
              <select
                id="tenant-paper-width"
                value={thermalPaperWidth}
                onChange={(e) => setThermalPaperWidth(e.target.value as '58mm' | '80mm')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="58mm">58mm (Printer Kasir Bluetooth Mini)</option>
                <option value="80mm">80mm (Printer Kasir &amp; Dapur Standar)</option>
              </select>
            </div>

            {(tenant.vertical === 'KEDAI_MAKAN' ||
              tenant.vertical === 'RESTORAN' ||
              tenant.vertical === 'BAKERY_CATERING') && (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    id="tenant-autoprint-qr"
                    type="checkbox"
                    checked={autoPrintQrOrders}
                    onChange={(e) => setAutoPrintQrOrders(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>Auto-cetak tiket dapur saat pesanan QR masuk</span>
                </label>
              </div>
            )}
          </div>
        </section>

        {/* Neon PostgreSQL & Better Auth Sync Status */}
        <section className="space-y-3 pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Database className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Sinkronisasi Database Server &amp; Neon PostgreSQL</span>
              </div>
              <p className="text-xs text-slate-600">
                Akun aktif: <span className="font-semibold">{session.email || 'Mode Demo'}</span> ·{' '}
                {activeWorkspace.products.length} item katalog &amp; {activeWorkspace.orders.length}{' '}
                transaksi POS tersimpan di ruang kerja terisolasi.
              </p>
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 ${
                syncStatus === 'synced'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>
                {syncStatus === 'synced'
                  ? 'Tersinkron ke Server'
                  : syncStatus === 'saving'
                  ? 'Menyimpan...'
                  : 'Mode Lokal / Demo'}
              </span>
            </span>
          </div>
        </section>

        {/* Domisili Pajak Daerah (PBJT) & Nomor WhatsApp Usaha (wa.me Gratis) */}
        <section className="pt-5 border-t border-slate-100 space-y-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
            <h3 className="text-sm font-bold text-slate-900">
              Domisili Pajak Daerah (PBJT) &amp; WhatsApp Usaha (wa.me)
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kota / Kabupaten Domisili Usaha
              </label>
              <select
                data-testid="settings-region-select"
                value={regionCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setRegionCode(next);
                  setApplyRegionalTax(next !== 'ID-NONE');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {regionalTaxRegistry.map((r) => (
                  <option key={r.regionCode} value={r.regionCode}>
                    {r.cityName} {r.province !== 'Nasional' ? `(${r.province})` : ''}
                  </option>
                ))}
              </select>
              <label className="mt-2 inline-flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyRegionalTax && regionCode !== 'ID-NONE'}
                  disabled={regionCode === 'ID-NONE'}
                  onChange={(e) => setApplyRegionalTax(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>
                  Terapkan Pajak Daerah (PBJT / Perda) sesuai domisili. Hapus centang jika usaha mikro Anda bebas pajak daerah setempat.
                </span>
              </label>

              {regionCode !== 'ID-NONE' && (
                <div
                  data-testid="settings-custom-regional-tax"
                  className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2"
                >
                  <p className="text-[11px] font-semibold text-slate-800">
                    Pajak / Retribusi Daerah Tambahan Khusus Perda (Opsional)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_92px] gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                        Nama Pungutan Daerah
                      </label>
                      <input
                        type="text"
                        value={customTaxName}
                        onChange={(e) => setCustomTaxName(e.target.value)}
                        placeholder="PBJT Kost >10 Kamar / Retribusi"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                        Tarif (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={customRegionalRatePct}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomRegionalRatePct(v);
                          if (Number(v) > 0) setApplyRegionalTax(true);
                        }}
                        placeholder="10"
                        className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div
                data-testid="settings-regional-tax-preview"
                className="mt-2 text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 space-y-1"
              >
                <p>
                  <strong>Nasional:</strong> {taxSummaryPreview.nationalLabel}
                </p>
                <p>
                  <strong>Daerah ({regionalPreview.regionName}):</strong>{' '}
                  {regionalPreview.taxLabel}{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    [{regionalPreview.ratePercentLabel}]
                  </span>
                </p>
                <p className="text-emerald-800/90">
                  {regionalPreview.perdaReference} · {regionalPreview.exemptionNote}
                </p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                Nomor WhatsApp Usaha (Kirim WA Langsung / wa.me)
              </label>
              <input
                type="text"
                value={businessWa}
                onChange={(e) => setBusinessWa(e.target.value)}
                placeholder="Contoh: 0812-3456-7890"
                className="w-full px-3 py-2 font-mono text-sm border border-slate-200 rounded-lg text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
              <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                Gratis mulai Paket LITE tanpa perlu Add-On Fonnte. Dipakai untuk tombol Kirim WA langsung (info cucian siap, pengingat SPP/garasi, dan konfirmasi booking).
              </p>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Pengaturan Usaha</span>
          </button>
        </div>
      </form>

      {/* RIGHT COLUMN: LIVE THERMAL RECEIPT PREVIEW */}
      <aside className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">Pratinjau Struk Thermal</h3>
          </div>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
            {thermalPaperWidth}
          </span>
        </div>

        <div className="bg-slate-100/80 rounded-xl p-4 flex justify-center">
          <div
            data-testid="receipt-live-preview"
            className={`w-full bg-white border border-slate-200 shadow-xs rounded-md p-4 font-mono text-[11px] text-slate-800 space-y-2.5 transition-all ${
              thermalPaperWidth === '58mm' ? 'max-w-[250px]' : 'max-w-[320px]'
            }`}
          >
            {/* Header with Logo */}
            <div className="text-center space-y-1">
              {logoUrl.trim() && !logoLoadError && (
                <img
                  src={logoUrl.trim()}
                  alt={`Pratinjau logo ${name || tenant.name}`}
                  className="w-12 h-12 mx-auto rounded-lg object-cover border border-slate-200 mb-1.5"
                />
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-slate-900 break-words">
                {name.trim() || 'NAMA USAHA'}
              </p>
              <p className="text-[10px] text-slate-500 leading-snug break-words">
                {address.trim() || 'Alamat usaha belum diisi'}
              </p>
              {npwp16.trim() && (
                <p className="text-[10px] text-slate-500">NPWP: {npwp16.trim()}</p>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2 flex justify-between text-[10px] text-slate-600">
              <span>INV-2026-0088</span>
              <span>TUNAI</span>
            </div>

            {/* Sample Line Items */}
            <div className="border-t border-dashed border-slate-300 pt-2 space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="truncate">2x Menu Andalan</span>
                <span className="tabular-nums shrink-0">Rp 90.000</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="truncate">1x Minuman Dingin</span>
                <span className="tabular-nums shrink-0">Rp 18.000</span>
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">Rp 108.000</span>
              </div>
              {Number(serviceChargePercent) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Service ({serviceChargePercent}%)</span>
                  <span className="tabular-nums">
                    Rp{' '}
                    {new Decimal('108000')
                      .mul(new Decimal(serviceChargePercent || '0').div(100))
                      .toDecimalPlaces(0)
                      .toNumber()
                      .toLocaleString('id-ID')}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200 text-xs">
                <span>TOTAL</span>
                <span className="tabular-nums">
                  Rp{' '}
                  {new Decimal('108000')
                    .mul(new Decimal('1').plus(new Decimal(serviceChargePercent || '0').div(100)))
                    .toDecimalPlaces(0)
                    .toNumber()
                    .toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Receipt Footer */}
            <div className="border-t border-dashed border-slate-300 pt-2.5 text-center space-y-1">
              <p
                data-testid="receipt-preview-footer"
                className="text-[10px] text-slate-700 leading-relaxed whitespace-pre-line break-words"
              >
                {receiptFooter.trim() || 'Terima kasih atas kunjungan Anda!'}
              </p>
              <p className="text-[9px] text-slate-400">Powered by KasirAkun UMKM</p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Perubahan profil usaha, logo, dan footer struk tersimpan khusus untuk tenant{' '}
          <span className="font-semibold text-slate-700">{tenant.name}</span> tanpa memengaruhi
          unit UMKM lain milik Anda.
        </p>
      </aside>
    </div>
  );
}
