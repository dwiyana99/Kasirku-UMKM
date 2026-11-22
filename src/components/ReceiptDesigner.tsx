import React, { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  ImagePlus,
  Printer,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  getDefaultReceiptDesign,
  getDividerBorderClass,
  getEffectiveReceiptDesign,
} from '../lib/pos/receipt-design';
import type { Order, ReceiptDesignConfig } from '../types/domain';

interface ReceiptDesignerProps {
  onSaved?: (message: string) => void;
}

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (PNG, JPG, WebP).'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error('Ukuran gambar maksimal 1,5 MB agar cepat dicetak di printer thermal.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

export function ReceiptDesigner({ onSaved }: ReceiptDesignerProps) {
  const { activeWorkspace, updateTenantProfile, updateReceiptDesign } = useApp();
  const tenant = activeWorkspace.tenant;

  const [design, setDesign] = useState<ReceiptDesignConfig>(() =>
    getEffectiveReceiptDesign(tenant)
  );
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(
    tenant.settings.thermalPaperWidth || '80mm'
  );
  const [logoUrl, setLogoUrl] = useState<string>(tenant.logoUrl || '');
  const [receiptFooter, setReceiptFooter] = useState<string>(tenant.receiptFooter || '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDesign(getEffectiveReceiptDesign(tenant));
    setPaperWidth(tenant.settings.thermalPaperWidth || '80mm');
    setLogoUrl(tenant.logoUrl || '');
    setReceiptFooter(tenant.receiptFooter || '');
    setUploadError(null);
  }, [tenant.id, tenant.logoUrl, tenant.receiptFooter, tenant.settings.thermalPaperWidth]);

  const previewOrder: Order = useMemo(() => {
    const latestPaid = activeWorkspace.orders.find((o) => o.paymentStatus === 'PAID');
    if (latestPaid) return latestPaid;

    const samplePrice = tenant.vertical === 'WARUNG_SEMBAKO' ? '38500.0000' : '45000.0000';
    const sampleSubtotal = tenant.vertical === 'WARUNG_SEMBAKO' ? '77000.0000' : '90000.0000';
    const sampleDiscount = '5000.0000';
    const sampleService = tenant.vertical === 'RESTORAN' ? '4250.0000' : '0.0000';
    const sampleDpp = '66000.0000';
    const sampleTax = tenant.vertical === 'RESTORAN' ? '8925.0000' : '7920.0000';
    const grand = new Decimal(sampleSubtotal)
      .minus(sampleDiscount)
      .plus(sampleService)
      .plus(sampleTax)
      .toFixed(4);

    return {
      id: 'preview-ord',
      tenantId: tenant.id,
      orderNumber: 'INV-PREVIEW-001',
      orderSource: 'POS_CASHIER',
      tableId: null,
      tableNumber: tenant.vertical === 'RESTORAN' || tenant.vertical === 'KEDAI_MAKAN' ? '04' : undefined,
      customerName: 'Ibu Ratna (Pratinjau)',
      subtotal: sampleSubtotal,
      discountAmount: sampleDiscount,
      serviceCharge: sampleService,
      taxType:
        tenant.vertical === 'RESTORAN' || tenant.vertical === 'KEDAI_MAKAN'
          ? 'PB1_RESTO_10'
          : 'PPN_11_12',
      dppNilaiLain: sampleDpp,
      taxAmount: sampleTax,
      grandTotal: grand,
      totalCogs: '52000.0000',
      paymentStatus: 'PAID',
      kitchenStatus: 'SERVED',
      isReceiptPrinted: false,
      items: [
        {
          id: 'prev-item-1',
          orderId: 'preview-ord',
          productId: 'prev-p1',
          itemNameSnapshot:
            tenant.vertical === 'WARUNG_SEMBAKO'
              ? 'Minyak Goreng Bimoli Pouch 2L'
              : 'Menu Unggulan Spesial',
          qty: '2.0000',
          unitPrice: samplePrice,
          unitCogs: '26000.0000',
          notes: 'Kemasan rapi / catatan contoh',
        },
      ],
      payment: {
        id: 'prev-pay',
        tenantId: tenant.id,
        orderId: 'preview-ord',
        paymentMethod: 'QRIS_DYNAMIC',
        amountPaid: grand,
        mdrFee: '500.0000',
        gatewayRefId: 'QRIS-PREVIEW',
        paidAt: new Date().toISOString(),
      },
      customAttributes: {},
      createdAt: new Date().toISOString(),
    };
  }, [activeWorkspace.orders, tenant.id, tenant.vertical]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const dataUrl = await readFileAsBase64(file);
      setLogoUrl(dataUrl);
      setDesign((prev) => ({ ...prev, showLogo: true }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal unggah logo.');
    }
    e.target.value = '';
  };

  const handleUploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const dataUrl = await readFileAsBase64(file);
      setDesign((prev) => ({ ...prev, brandingBannerUrl: dataUrl }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal unggah banner struk.');
    }
    e.target.value = '';
  };

  const handleResetDefault = () => {
    setDesign(getDefaultReceiptDesign(tenant));
    setPaperWidth(tenant.vertical === 'WARUNG_SEMBAKO' ? '58mm' : '80mm');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantProfile({
      logoUrl: logoUrl.trim() || undefined,
      receiptFooter: receiptFooter.trim(),
      settings: {
        thermalPaperWidth: paperWidth,
        receiptDesign: design,
      },
    });
    updateReceiptDesign(design);
    const msg = `Desain struk thermal (${paperWidth}) untuk ${tenant.name} berhasil disimpan ke database.`;
    setSavedNotice(msg);
    onSaved?.(msg);
    window.setTimeout(() => setSavedNotice(null), 4000);
  };

  const toggleField = (key: keyof ReceiptDesignConfig) => {
    setDesign((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const dividerClass = getDividerBorderClass(design.dividerStyle);
  const logoSizeClass =
    design.logoSize === 'sm'
      ? 'w-10 h-10'
      : design.logoSize === 'lg'
      ? 'w-16 h-16'
      : 'w-12 h-12';

  const hasDiscount = new Decimal(previewOrder.discountAmount).gt(0);
  const hasService = new Decimal(previewOrder.serviceCharge).gt(0);
  const hasTax = new Decimal(previewOrder.taxAmount).gt(0);

  return (
    <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Controls */}
      <div className="xl:col-span-7 space-y-5">
        {savedNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}

        {uploadError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs font-medium text-rose-800">
            {uploadError}
          </div>
        )}

        {/* Section 1: Format Kertas, Branding & Gambar Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Desainer Tata Letak Struk Thermal
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur logo, banner promo, QR feedback digital, dan visibilitas rincian pajak/biaya secara visual.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Lebar Kertas Thermal
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                {(['58mm', '80mm'] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setPaperWidth(w)}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                      paperWidth === w
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Perataan Header
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'center', label: 'Tengah' },
                    { id: 'left', label: 'Kiri' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDesign((prev) => ({ ...prev, headerAlignment: opt.id }))}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                      design.headerAlignment === opt.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Gaya Garis Pemisah
              </label>
              <select
                value={design.dividerStyle}
                onChange={(e) =>
                  setDesign((prev) => ({
                    ...prev,
                    dividerStyle: e.target.value as ReceiptDesignConfig['dividerStyle'],
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
              >
                <option value="dashed">Garis Putus-putus (---)</option>
                <option value="dotted">Titik-titik (...)</option>
                <option value="solid">Garis Lurus (___)</option>
                <option value="double">Garis Ganda (===)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Logo Upload */}
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Logo Usaha di Struk</span>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={design.showLogo}
                    onChange={() => toggleField('showLogo')}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tampilkan</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadLogo}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{logoUrl ? 'Ganti Logo' : 'Unggah Logo'}</span>
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Ukuran:</span>
                {(['sm', 'md', 'lg'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setDesign((prev) => ({ ...prev, logoSize: sz }))}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded border ${
                      design.logoSize === sz
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {sz === 'sm' ? 'Kecil' : sz === 'md' ? 'Sedang' : 'Besar'}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Branding Banner Image */}
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  Gambar Branding / Promo Header
                </span>
                <span className="text-[11px] text-slate-400">Opsional</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Banner monokrom/logo lebar untuk promo musiman atau identitas toko di atas struk.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadBanner}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>{design.brandingBannerUrl ? 'Ganti Banner' : 'Unggah Gambar'}</span>
                </button>
                {design.brandingBannerUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setDesign((prev) => ({ ...prev, brandingBannerUrl: undefined }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tagline Header Struk (Opsional)
              </label>
              <input
                type="text"
                value={design.headerTagline}
                onChange={(e) =>
                  setDesign((prev) => ({ ...prev, headerTagline: e.target.value }))
                }
                placeholder="Contoh: Murah, Lengkap & Terpercaya Sejak 2018"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pesan Footer Struk
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Terima kasih telah berbelanja!"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Selective Line Item Toggles (Tax, Service Charge, Info) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Visibilitas Baris Struk, Pajak &amp; Service Charge
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Aktifkan atau sembunyikan elemen tertentu sesuai kebijakan cetak nota usaha Anda.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(
              [
                { key: 'showAddress', label: 'Tampilkan Alamat Usaha' },
                { key: 'showNpwp', label: 'Tampilkan NPWP 16-Digit' },
                { key: 'showCustomerInfo', label: 'Tampilkan Nama Pelanggan & Meja' },
                { key: 'showItemNotes', label: 'Tampilkan Catatan per Item' },
                { key: 'showDiscountLine', label: 'Tampilkan Baris Diskon' },
                { key: 'showServiceChargeLine', label: 'Tampilkan Baris Service Charge' },
                { key: 'showTaxLine', label: 'Tampilkan Baris Pajak (PPN / PB1)' },
                { key: 'showDppDetailLine', label: 'Tampilkan Rincian DPP Nilai Lain (11/12)' },
                { key: 'showFooter', label: 'Tampilkan Pesan Footer Struk' },
                { key: 'showPoweredBy', label: 'Tampilkan Label KasirAkun UMKM' },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                <span className="text-xs font-medium text-slate-800">{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(design[item.key])}
                  onChange={() => toggleField(item.key)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Section 3: Digital Feedback QR Code */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  QR Code Umpan Balik Digital (Feedback / Review)
                </h3>
                <p className="text-xs text-slate-500">
                  Cetak QR di bagian bawah struk untuk ulasan Google Maps, form kepuasan, atau WhatsApp CS.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={design.showFeedbackQr}
                onChange={() => toggleField('showFeedbackQr')}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Aktifkan QR</span>
            </label>
          </div>

          {design.showFeedbackQr && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Label Ajakan di Atas QR
                </label>
                <input
                  type="text"
                  value={design.feedbackQrLabel}
                  onChange={(e) =>
                    setDesign((prev) => ({ ...prev, feedbackQrLabel: e.target.value }))
                  }
                  placeholder="Scan untuk beri ulasan & saran"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  URL Tujuan QR Feedback
                </label>
                <input
                  type="url"
                  value={design.feedbackQrUrl}
                  onChange={(e) =>
                    setDesign((prev) => ({ ...prev, feedbackQrUrl: e.target.value }))
                  }
                  placeholder="https://g.page/r/ulasan-toko-anda"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Desain Struk</span>
          </button>
        </div>
      </div>

      {/* Right Column: Live Thermal Receipt Preview */}
      <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 xl:sticky xl:top-20">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-slate-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Pratinjau Langsung ({paperWidth})
              </h3>
              <p className="text-[11px] text-slate-500">
                Otomatis diterapkan saat cetak struk POS &amp; Bluetooth ESC/POS
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-100 rounded-xl p-5 flex justify-center overflow-x-auto">
          <div
            data-testid="receipt-designer-preview"
            className={`bg-white border border-slate-200 p-5 font-mono text-xs text-slate-900 tabular-nums shadow-sm transition-all ${
              paperWidth === '58mm' ? 'w-[252px]' : 'w-[332px]'
            }`}
          >
            {/* Header */}
            <div
              className={`space-y-1 pb-3 ${dividerClass} ${
                design.headerAlignment === 'left' ? 'text-left' : 'text-center'
              }`}
            >
              {design.brandingBannerUrl && (
                <img
                  src={design.brandingBannerUrl}
                  alt="Banner Struk"
                  className="w-full max-h-16 object-contain mb-2 rounded"
                />
              )}
              {design.showLogo && logoUrl && (
                <img
                  src={logoUrl}
                  alt={`Logo ${tenant.name}`}
                  className={`${logoSizeClass} ${
                    design.headerAlignment === 'left' ? '' : 'mx-auto'
                  } mb-1.5 rounded-lg object-cover border border-slate-200`}
                />
              )}
              <p className="font-bold text-sm tracking-tight">{tenant.name.toUpperCase()}</p>
              {design.headerTagline.trim() && (
                <p className="text-[11px] text-slate-700 italic">{design.headerTagline.trim()}</p>
              )}
              {design.showAddress && (
                <p className="text-[11px] text-slate-600 leading-snug">{tenant.address}</p>
              )}
              {design.showNpwp && tenant.npwp16 && (
                <p className="text-[10px] text-slate-500">NPWP: {tenant.npwp16}</p>
              )}
            </div>

            {/* Meta */}
            <div className={`py-2.5 space-y-1 ${dividerClass} text-[11px]`}>
              <div className="flex justify-between">
                <span>No</span>
                <span>{previewOrder.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu</span>
                <span>{new Date(previewOrder.createdAt).toLocaleString('id-ID')}</span>
              </div>
              {design.showCustomerInfo && (
                <>
                  <div className="flex justify-between">
                    <span>Pelanggan</span>
                    <span>{previewOrder.customerName}</span>
                  </div>
                  {previewOrder.tableNumber && (
                    <div className="flex justify-between">
                      <span>Meja</span>
                      <span>Meja {previewOrder.tableNumber}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Items */}
            <div className={`py-2.5 space-y-2 ${dividerClass}`}>
              {previewOrder.items.map((item) => {
                const lineTotal = new Decimal(item.qty).times(new Decimal(item.unitPrice));
                return (
                  <div key={item.id} className="space-y-0.5">
                    <p className="font-medium text-slate-900">{item.itemNameSnapshot}</p>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>
                        {Number(item.qty)} x {formatRupiah(item.unitPrice)}
                      </span>
                      <span className="text-slate-900">{formatRupiah(lineTotal)}</span>
                    </div>
                    {design.showItemNotes && item.notes && (
                      <p className="text-[10px] text-slate-500 italic">Catatan: {item.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Totals & Selective Tax / Service Charge */}
            <div className={`py-2.5 space-y-1 ${dividerClass} text-[11px]`}>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(previewOrder.subtotal)}</span>
              </div>
              {design.showDiscountLine && hasDiscount && (
                <div className="flex justify-between">
                  <span>Diskon</span>
                  <span>-{formatRupiah(previewOrder.discountAmount)}</span>
                </div>
              )}
              {design.showServiceChargeLine && hasService && (
                <div className="flex justify-between">
                  <span>Service Charge</span>
                  <span>{formatRupiah(previewOrder.serviceCharge)}</span>
                </div>
              )}
              {design.showTaxLine && hasTax && previewOrder.taxType === 'PPN_11_12' && (
                <>
                  {design.showDppDetailLine && (
                    <div className="flex justify-between text-slate-500">
                      <span>DPP Nilai Lain (11/12)</span>
                      <span>{formatRupiah(previewOrder.dppNilaiLain)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>PPN 12% × DPP</span>
                    <span>{formatRupiah(previewOrder.taxAmount)}</span>
                  </div>
                </>
              )}
              {design.showTaxLine && hasTax && previewOrder.taxType === 'PB1_RESTO_10' && (
                <div className="flex justify-between">
                  <span>PB1 Restoran (10%)</span>
                  <span>{formatRupiah(previewOrder.taxAmount)}</span>
                </div>
              )}
              {design.showTaxLine && hasTax && previewOrder.taxType === 'PPN_12' && (
                <div className="flex justify-between">
                  <span>PPN 12%</span>
                  <span>{formatRupiah(previewOrder.taxAmount)}</span>
                </div>
              )}
            </div>

            {/* Grand Total */}
            <div className={`py-2.5 space-y-1 ${dividerClass}`}>
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{formatRupiah(previewOrder.grandTotal)}</span>
              </div>
              {previewOrder.payment && (
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Metode: {previewOrder.payment.paymentMethod}</span>
                  <span>LUNAS</span>
                </div>
              )}
            </div>

            {/* Digital Feedback QR */}
            {design.showFeedbackQr && design.feedbackQrUrl.trim() && (
              <div className={`py-3 flex flex-col items-center gap-1.5 ${dividerClass}`}>
                <p className="text-[10px] font-medium text-slate-700 text-center">
                  {design.feedbackQrLabel || 'Scan untuk beri ulasan'}
                </p>
                <div className="p-1.5 bg-white border border-slate-200 rounded">
                  <QRCodeSVG value={design.feedbackQrUrl.trim()} size={88} level="M" />
                </div>
              </div>
            )}

            {/* Footer */}
            {design.showFooter && receiptFooter.trim() && (
              <p className="pt-3 text-center text-[11px] text-slate-600 leading-relaxed">
                {receiptFooter}
              </p>
            )}
            {design.showPoweredBy && (
              <p className="pt-2 text-center text-[10px] text-slate-400">
                KasirAkun UMKM
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
