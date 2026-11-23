/**
 * KasirAkun UMKM — Reusable Landing Page Configuration Form Fields (Product Mode)
 * Shared by User Self-Service Editor (`/settings/landing-page`) and Master Admin Editor (`/master-admin`).
 * Supports local image file upload (resized via canvas to compact JPEG/WebP DataURL) OR external https:// URL.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { LANDING_THEME_PRESETS } from '../../lib/landing/landing-presets';
import {
  buildSubdomainPreviewAddress,
  LANDING_THEME_PRESET_CODES,
  normalizeSlugCandidate,
  validateLandingSlug,
} from '../../lib/landing/url-helper';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type {
  LandingThemePreset,
  TenantLandingPageConfig,
} from '../../types/domain';

export interface CatalogVisibilityItem {
  id: string;
  name: string;
  sellingPrice: string;
  unit: string;
  stockQty: string;
  showOnLanding: boolean;
}

export interface RoomVisibilityItem {
  id: string;
  roomNumber: string;
  roomType: string;
  monthlyPrice: string;
  status: string;
  showOnLanding: boolean;
}

interface LandingConfigFormFieldsProps {
  tenantId: string;
  authToken?: string;
  draft: TenantLandingPageConfig;
  onChange: (next: TenantLandingPageConfig) => void;
  catalogItems: CatalogVisibilityItem[];
  productVisibilityMap: Record<string, boolean>;
  onToggleProductVisibility: (id: string, visible: boolean) => void;
  rooms: RoomVisibilityItem[];
  roomVisibilityMap: Record<string, boolean>;
  onToggleRoomVisibility: (id: string, visible: boolean) => void;
  rootDomain?: string;
}

export async function compressImageFileToDataUrl(
  file: File,
  maxWidth = 1200,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung. Gunakan JPG/PNG/WebP.'));
      img.onload = () => {
        const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Browser tidak mendukung pemrosesan gambar.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function LandingConfigFormFields({
  tenantId,
  authToken,
  draft,
  onChange,
  catalogItems,
  productVisibilityMap,
  onToggleProductVisibility,
  rooms,
  roomVisibilityMap,
  onToggleRoomVisibility,
  rootDomain = 'kasirakun.id',
}: LandingConfigFormFieldsProps) {
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [slugMessage, setSlugMessage] = useState('');
  const [uploadingField, setUploadingField] = useState<'logo' | 'hero' | null>(null);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const localCheck = validateLandingSlug(draft.slug);
    if (!localCheck.valid) {
      setSlugStatus('invalid');
      setSlugMessage(localCheck.reason || 'Format slug tidak valid.');
      return;
    }

    let cancelled = false;
    setSlugStatus('checking');
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/landing-page/check-slug?slug=${encodeURIComponent(localCheck.normalized)}&tenantId=${encodeURIComponent(tenantId)}`,
          {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }
        );
        const data = (await res.json()) as { available?: boolean; reason?: string };
        if (cancelled) return;
        if (data.available) {
          setSlugStatus('available');
          setSlugMessage('Nama tautan tersedia dan siap digunakan untuk alamat toko Anda.');
        } else {
          setSlugStatus('taken');
          setSlugMessage(data.reason || 'Slug tidak tersedia.');
        }
      } catch {
        if (!cancelled) {
          setSlugStatus('idle');
          setSlugMessage('');
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.slug, tenantId, authToken]);

  const handleImageUpload = async (field: 'logo' | 'hero', file: File | undefined) => {
    if (!file) return;
    setUploadError('');
    setUploadingField(field);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, field === 'logo' ? 400 : 1280, 0.82);
      if (field === 'logo') {
        onChange({ ...draft, logoUrl: dataUrl });
      } else {
        onChange({ ...draft, heroImageUrl: dataUrl });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    } finally {
      setUploadingField(null);
    }
  };

  const updateOpeningHour = (idx: number, patch: Partial<{ day: string; hours: string; isClosed: boolean }>) => {
    const next = draft.openingHoursJson.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange({ ...draft, openingHoursJson: next });
  };

  const addOpeningHour = () => {
    if (draft.openingHoursJson.length >= 10) return;
    onChange({
      ...draft,
      openingHoursJson: [...draft.openingHoursJson, { day: 'Hari Libur', hours: '10:00 - 17:00 WIB' }],
    });
  };

  const removeOpeningHour = (idx: number) => {
    onChange({
      ...draft,
      openingHoursJson: draft.openingHoursJson.filter((_, i) => i !== idx),
    });
  };

  const updateHighlight = (idx: number, val: string) => {
    const next = draft.highlightsJson.map((item, i) => (i === idx ? val : item));
    onChange({ ...draft, highlightsJson: next });
  };

  const addHighlight = () => {
    if (draft.highlightsJson.length >= 5) return;
    onChange({ ...draft, highlightsJson: [...draft.highlightsJson, ''] });
  };

  const removeHighlight = (idx: number) => {
    onChange({ ...draft, highlightsJson: draft.highlightsJson.filter((_, i) => i !== idx) });
  };

  const vis = draft.sectionsVisibilityJson;

  return (
    <div className="space-y-6">
      {uploadError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span>{uploadError}</span>
        </div>
      )}

      {/* 1. Identitas & Tema */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-stone-200 pb-3">
          <h3 className="text-sm font-bold text-stone-900">1. Alamat Link Toko &amp; Warna Tampilan</h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Nama tautan ini menjadi alamat katalog online usaha Anda di `/toko/[nama-usaha]` dan siap dipakai jika nanti memakai domain sendiri.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`lp-slug-${tenantId}`} className="block text-xs font-semibold text-stone-800">
            Slug Alamat Usaha
          </label>
          <div className="flex items-center rounded-lg border border-stone-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-emerald-600/30 focus-within:border-emerald-600">
            <span className="px-3 py-2 text-xs font-mono text-stone-500 bg-stone-50 border-r border-stone-200 shrink-0">
              /toko/
            </span>
            <input
              id={`lp-slug-${tenantId}`}
              type="text"
              value={draft.slug}
              onChange={(e) => onChange({ ...draft, slug: normalizeSlugCandidate(e.target.value) })}
              placeholder="warung-berkah-jaya"
              className="flex-1 px-3 py-2 text-xs font-mono text-stone-900 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="text-[11px]">
              {slugStatus === 'checking' && (
                <span className="inline-flex items-center gap-1 text-stone-500">
                  <Loader2 className="w-3 h-3 animate-spin" /> Memeriksa ketersediaan slug...
                </span>
              )}
              {slugStatus === 'available' && (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} /> {slugMessage}
                </span>
              )}
              {(slugStatus === 'taken' || slugStatus === 'invalid') && (
                <span className="inline-flex items-center gap-1 text-rose-700 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.75} /> {slugMessage}
                </span>
              )}
            </div>
            <span className="text-[11px] font-mono text-stone-500">
              Siap subdomain: {buildSubdomainPreviewAddress(draft.slug, rootDomain)}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-800">Pilih Warna &amp; Gaya Tampilan</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {LANDING_THEME_PRESET_CODES.map((code: LandingThemePreset) => {
              const t = LANDING_THEME_PRESETS[code];
              const active = draft.themePreset === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChange({ ...draft, themePreset: code })}
                  className={`p-3 rounded-lg border text-left transition-colors flex items-start gap-3 ${
                    active
                      ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <span
                    className="w-8 h-8 rounded-md border border-stone-200 shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: t.swatchBg }}
                  >
                    <span
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: t.swatchPrimary }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-stone-900 truncate">{t.name}</p>
                      {active && <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={2} />}
                    </div>
                    <p className="text-[11px] text-stone-500 leading-snug mt-0.5">{t.tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Hero & Profil Usaha */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-stone-200 pb-3">
          <h3 className="text-sm font-bold text-stone-900">2. Bagian Hero, Logo &amp; Profil Usaha</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={`lp-hero-title-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Judul Utama (Nama Usaha)
            </label>
            <input
              id={`lp-hero-title-${tenantId}`}
              type="text"
              value={draft.heroTitle}
              onChange={(e) => onChange({ ...draft, heroTitle: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`lp-wa-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Nomor WhatsApp Pemesanan
            </label>
            <input
              id={`lp-wa-${tenantId}`}
              type="text"
              value={draft.whatsappNumber || ''}
              onChange={(e) => onChange({ ...draft, whatsappNumber: e.target.value })}
              placeholder="081234567890"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`lp-hero-sub-${tenantId}`} className="block text-xs font-semibold text-stone-800">
            Subjudul Singkat (Tagline Usaha)
          </label>
          <textarea
            id={`lp-hero-sub-${tenantId}`}
            rows={2}
            value={draft.heroSubtitle || ''}
            onChange={(e) => onChange({ ...draft, heroSubtitle: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Logo URL / Upload */}
          <div className="space-y-1.5">
            <label htmlFor={`lp-logo-url-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Logo Usaha (Link URL atau Unggah)
            </label>
            <div className="flex gap-2">
              <input
                id={`lp-logo-url-${tenantId}`}
                type="text"
                value={draft.logoUrl || ''}
                onChange={(e) => onChange({ ...draft, logoUrl: e.target.value })}
                placeholder="https://... atau unggah"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
              <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer shrink-0">
                {uploadingField === 'logo' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
                <span>Unggah</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => void handleImageUpload('logo', e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          {/* Hero Banner URL / Upload */}
          <div className="space-y-1.5">
            <label htmlFor={`lp-hero-img-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Foto Utama / Banner Hero
            </label>
            <div className="flex gap-2">
              <input
                id={`lp-hero-img-${tenantId}`}
                type="text"
                value={draft.heroImageUrl || ''}
                onChange={(e) => onChange({ ...draft, heroImageUrl: e.target.value })}
                placeholder="https://... atau unggah"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
              <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer shrink-0">
                {uploadingField === 'hero' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
                <span>Unggah</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => void handleImageUpload('hero', e.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`lp-about-${tenantId}`} className="block text-xs font-semibold text-stone-800">
            Cerita &amp; Profil Singkat Usaha
          </label>
          <textarea
            id={`lp-about-${tenantId}`}
            rows={3}
            value={draft.aboutText || ''}
            onChange={(e) => onChange({ ...draft, aboutText: e.target.value })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
          />
        </div>
      </section>

      {/* 3. Lokasi, Jam Buka & Media Sosial */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-stone-200 pb-3">
          <h3 className="text-sm font-bold text-stone-900">3. Lokasi, Jam Operasional &amp; Media Sosial</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={`lp-address-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Alamat Lengkap
            </label>
            <input
              id={`lp-address-${tenantId}`}
              type="text"
              value={draft.address || ''}
              onChange={(e) => onChange({ ...draft, address: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`lp-maps-${tenantId}`} className="block text-xs font-semibold text-stone-800">
              Tautan Google Maps (https://...)
            </label>
            <input
              id={`lp-maps-${tenantId}`}
              type="url"
              value={draft.googleMapsUrl || ''}
              onChange={(e) => onChange({ ...draft, googleMapsUrl: e.target.value })}
              placeholder="https://maps.google.com/?q=..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>
        </div>

        {/* Jam Buka */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-800">Jam Operasional</p>
            <button
              type="button"
              onClick={addOpeningHour}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} /> Tambah Baris
            </button>
          </div>
          <div className="space-y-2">
            {draft.openingHoursJson.map((row, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={row.day}
                  aria-label={`Hari operasional ${idx + 1}`}
                  onChange={(e) => updateOpeningHour(idx, { day: e.target.value })}
                  className="col-span-5 px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
                />
                <input
                  type="text"
                  value={row.hours}
                  aria-label={`Jam buka ${idx + 1}`}
                  onChange={(e) => updateOpeningHour(idx, { hours: e.target.value })}
                  className="col-span-6 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-stone-300 text-stone-900"
                />
                <button
                  type="button"
                  onClick={() => removeOpeningHour(idx)}
                  aria-label={`Hapus jam operasional ${idx + 1}`}
                  className="col-span-1 p-1.5 text-stone-400 hover:text-rose-600 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Social Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
          <div className="space-y-1">
            <label htmlFor={`lp-ig-${tenantId}`} className="block text-[11px] font-semibold text-stone-700">
              Link Instagram
            </label>
            <input
              id={`lp-ig-${tenantId}`}
              type="url"
              value={draft.socialLinksJson?.instagram || ''}
              onChange={(e) =>
                onChange({
                  ...draft,
                  socialLinksJson: { ...draft.socialLinksJson, instagram: e.target.value },
                })
              }
              placeholder="https://instagram.com/namausaha"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`lp-tt-${tenantId}`} className="block text-[11px] font-semibold text-stone-700">
              Link TikTok
            </label>
            <input
              id={`lp-tt-${tenantId}`}
              type="url"
              value={draft.socialLinksJson?.tiktok || ''}
              onChange={(e) =>
                onChange({
                  ...draft,
                  socialLinksJson: { ...draft.socialLinksJson, tiktok: e.target.value },
                })
              }
              placeholder="https://tiktok.com/@namausaha"
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
            />
          </div>
        </div>
      </section>

      {/* 4. Visibilitas Seksi, Poin Keunggulan & Pilih Item Katalog */}
      <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
        <div className="border-b border-stone-200 pb-3">
          <h3 className="text-sm font-bold text-stone-900">4. Visibilitas Seksi, Keunggulan &amp; Katalog Publik</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(
            [
              ['hero', 'Bagian Hero'],
              ['catalog', 'Daftar Katalog'],
              ['highlights', 'Poin Keunggulan'],
              ['about', 'Tentang Usaha'],
              ['location', 'Lokasi & Jam Buka'],
              ['contact', 'Kontak & WA'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/70 text-xs font-medium text-stone-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(vis[key])}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    sectionsVisibilityJson: { ...vis, [key]: e.target.checked },
                  })
                }
                className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {/* Highlights */}
        <div className="space-y-2 pt-2 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-800">Poin Keunggulan Usaha (3–5 Poin)</p>
            <button
              type="button"
              onClick={addHighlight}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} /> Tambah Poin
            </button>
          </div>
          <div className="space-y-2">
            {draft.highlightsJson.map((point, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={point}
                  aria-label={`Poin keunggulan ${idx + 1}`}
                  onChange={(e) => updateHighlight(idx, e.target.value)}
                  placeholder="Contoh: Bahan segar dipilih langsung setiap pagi"
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
                />
                <button
                  type="button"
                  onClick={() => removeHighlight(idx)}
                  aria-label={`Hapus poin keunggulan ${idx + 1}`}
                  className="p-1.5 text-stone-400 hover:text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Catalog / Room Selection */}
        {rooms.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <p className="text-xs font-semibold text-stone-800">
              Pilih Kamar Kost yang Tampil di Landing Page ({rooms.length} Unit)
            </p>
            <div className="max-h-48 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
              {rooms.map((room) => {
                const checked = roomVisibilityMap[room.id] ?? room.showOnLanding;
                return (
                  <label
                    key={room.id}
                    className="px-3 py-2 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-stone-50"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggleRoomVisibility(room.id, e.target.checked)}
                        className="rounded border-stone-300 text-emerald-600"
                      />
                      <span className="font-medium text-stone-900 truncate">
                        Kamar {room.roomNumber} ({room.roomType})
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-stone-600 shrink-0">
                      {formatRupiah(room.monthlyPrice)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {catalogItems.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <p className="text-xs font-semibold text-stone-800">
              Pilih Produk / Layanan Tampil di Landing Page ({catalogItems.length} Item)
            </p>
            <div className="max-h-52 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-lg">
              {catalogItems.map((item) => {
                const checked = productVisibilityMap[item.id] ?? item.showOnLanding;
                return (
                  <label
                    key={item.id}
                    className="px-3 py-2 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-stone-50"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => onToggleProductVisibility(item.id, e.target.checked)}
                        className="rounded border-stone-300 text-emerald-600"
                      />
                      <span className="font-medium text-stone-900 truncate">{item.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-stone-600 shrink-0">
                      {formatRupiah(item.sellingPrice)}/{item.unit}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* SEO Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
          <div className="space-y-1">
            <label htmlFor={`lp-seo-title-${tenantId}`} className="block text-[11px] font-semibold text-stone-700">
              Judul SEO Google (Opsional)
            </label>
            <input
              id={`lp-seo-title-${tenantId}`}
              type="text"
              value={draft.seoTitle || ''}
              onChange={(e) => onChange({ ...draft, seoTitle: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`lp-seo-desc-${tenantId}`} className="block text-[11px] font-semibold text-stone-700">
              Deskripsi SEO (Opsional)
            </label>
            <input
              id={`lp-seo-desc-${tenantId}`}
              type="text"
              value={draft.seoDescription || ''}
              onChange={(e) => onChange({ ...draft, seoDescription: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
