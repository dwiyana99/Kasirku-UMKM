/**
 * KasirAkun UMKM — User Self-Service Landing Page Editor & Free Master Admin Assistance (`/settings/landing-page`)
 * Product Mode Design: Warm Stone (#FAFAF9 / #FFFFFF / #E7E5E4 / #1C1917) + Deep Emerald (#059669),
 * tabular-nums on prices, lucide-react strokeWidth={1.75}, complete Loading/Empty/Error/Success states.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Headphones,
  Loader2,
  Monitor,
  QrCode,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { uploadImageWithS3Fallback } from '../lib/catalog/image-upload';
import {
  LandingConfigFormFields,
  type CatalogVisibilityItem,
  type RoomVisibilityItem,
} from '../components/landing/LandingConfigFormFields';
import { PublicStorefrontView } from '../components/landing/PublicStorefrontView';
import { useApp } from '../context/AppContext';
import {
  getVerticalLandingProfile,
  LANDING_THEME_PRESETS,
} from '../lib/landing/landing-presets';
import {
  buildSubdomainPreviewAddress,
  buildTenantLandingUrl,
  isValidIndonesianWhatsapp,
  LANDING_THEME_PRESET_CODES,
} from '../lib/landing/url-helper';
import type {
  LandingAssistanceStatus,
  LandingPageAssistanceRequest,
  LandingThemePreset,
  PublicTenantLandingPayload,
  TenantLandingPageConfig,
} from '../types/domain';

interface LandingMeResponse {
  hasAddon: boolean;
  landingPage: TenantLandingPageConfig;
  publicUrl: string;
  urlMode: 'SUBPATH' | 'SUBDOMAIN';
  rootDomain: string;
  tenantSummary: {
    id: string;
    name: string;
    vertical: string;
    verticalLabel: string;
  };
  catalogItems: CatalogVisibilityItem[];
  rooms: RoomVisibilityItem[];
  specializedAssetsCount: number;
  previewPayload: PublicTenantLandingPayload;
}

const ASSIST_STATUS_META: Record<LandingAssistanceStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Menunggu Antrean Admin', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  IN_PROGRESS: { label: 'Sedang Dikerjakan Admin', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  NEEDS_INFO: { label: 'Butuh Info Tambahan', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  COMPLETED: { label: 'Selesai Dikustomisasi', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

export function TenantLandingEditorPage() {
  const { activeWorkspace, session, hasAddOn, activateAddOn } = useApp();
  const tenantId = activeWorkspace.tenant.id;
  const profile = getVerticalLandingProfile(activeWorkspace.tenant.vertical);

  const [activeTab, setActiveTab] = useState<'SELF_SERVICE' | 'ASSISTANCE'>('SELF_SERVICE');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activating, setActivating] = useState(false);

  const [serverHasAddon, setServerHasAddon] = useState(false);
  const [draft, setDraft] = useState<TenantLandingPageConfig | null>(null);
  const [previewPayload, setPreviewPayload] = useState<PublicTenantLandingPayload | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogVisibilityItem[]>([]);
  const [rooms, setRooms] = useState<RoomVisibilityItem[]>([]);
  const [specializedAssetsCount, setSpecializedAssetsCount] = useState(0);
  const [productVisibilityMap, setProductVisibilityMap] = useState<Record<string, boolean>>({});
  const [roomVisibilityMap, setRoomVisibilityMap] = useState<Record<string, boolean>>({});
  const [rootDomain, setRootDomain] = useState('kasirakun.id');
  const [urlMode, setUrlMode] = useState<'SUBPATH' | 'SUBDOMAIN'>('SUBPATH');

  const [previewDevice, setPreviewDevice] = useState<'DESKTOP' | 'MOBILE'>('DESKTOP');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const qrCanvasRef = useRef<HTMLDivElement | null>(null);

  // Tab 2: Free Master Admin Assistance State
  const [tickets, setTickets] = useState<LandingPageAssistanceRequest[]>([]);
  const [assistContactWa, setAssistContactWa] = useState(
    activeWorkspace.tenant.settings?.businessWhatsappNumber || ''
  );
  const [assistLogoUrl, setAssistLogoUrl] = useState(activeWorkspace.tenant.logoUrl || '');
  const [assistHeroUrl, setAssistHeroUrl] = useState('');
  const [assistGalleryUrls, setAssistGalleryUrls] = useState<string[]>(['', '']);
  const [assistPreferredTheme, setAssistPreferredTheme] = useState<LandingThemePreset>(
    profile.recommendedTheme
  );
  const [assistFeaturedNotes, setAssistFeaturedNotes] = useState('');
  const [assistBrief, setAssistBrief] = useState('');
  const [assistAgreed, setAssistAgreed] = useState(false);
  const [assistSubmitting, setAssistSubmitting] = useState(false);
  const [assistError, setAssistError] = useState('');
  const [assistSuccess, setAssistSuccess] = useState('');
  const [assistUploading, setAssistUploading] = useState<string | null>(null);

  const isAddonActive = hasAddOn('ADDON_LANDING_PAGE') || serverHasAddon;

  const fetchEditorData = useCallback(async () => {
    if (session.role === 'GUEST') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const headers: HeadersInit = session.token
        ? { Authorization: `Bearer ${session.token}` }
        : {};
      const [meRes, assistRes] = await Promise.all([
        fetch(`/api/landing-page/me?tenantId=${encodeURIComponent(tenantId)}`, { headers }),
        fetch(`/api/landing-page/assistance?tenantId=${encodeURIComponent(tenantId)}`, { headers }),
      ]);

      if (!meRes.ok) {
        const err = (await meRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Gagal memuat konfigurasi Landing Page.');
      }

      const data = (await meRes.json()) as LandingMeResponse;
      setServerHasAddon(data.hasAddon);
      setDraft(data.landingPage);
      setPreviewPayload(data.previewPayload);
      setCatalogItems(data.catalogItems);
      setRooms(data.rooms);
      setSpecializedAssetsCount(data.specializedAssetsCount);
      setRootDomain(data.rootDomain || 'kasirakun.id');
      setUrlMode(data.urlMode);

      const pMap: Record<string, boolean> = {};
      for (const item of data.catalogItems) pMap[item.id] = item.showOnLanding;
      setProductVisibilityMap(pMap);

      const rMap: Record<string, boolean> = {};
      for (const rm of data.rooms) rMap[rm.id] = rm.showOnLanding;
      setRoomVisibilityMap(rMap);

      if (!assistContactWa && data.landingPage.whatsappNumber) {
        setAssistContactWa(data.landingPage.whatsappNumber);
      }
      if (!assistLogoUrl && data.landingPage.logoUrl) {
        setAssistLogoUrl(data.landingPage.logoUrl);
      }
      if (!assistHeroUrl && data.landingPage.heroImageUrl) {
        setAssistHeroUrl(data.landingPage.heroImageUrl);
      }
      setAssistPreferredTheme(data.landingPage.themePreset);

      if (assistRes.ok) {
        const assistJson = (await assistRes.json()) as { requests?: LandingPageAssistanceRequest[] };
        setTickets(assistJson.requests ?? []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data Landing Page.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, session.role, session.token]);

  useEffect(() => {
    void fetchEditorData();
  }, [fetchEditorData]);

  const handleActivateAddon = async () => {
    setActivating(true);
    setLoadError('');
    try {
      const res = await fetch('/api/landing-page/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({ tenantId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengaktifkan Add-On Landing Page.');
      }
      activateAddOn('ADDON_LANDING_PAGE');
      setServerHasAddon(true);
      await fetchEditorData();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal mengaktifkan Add-On.');
    } finally {
      setActivating(false);
    }
  };

  const handleSaveLandingPage = async (overridePublished?: boolean) => {
    if (!draft) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');

    const nextPublishState =
      overridePublished !== undefined ? overridePublished : draft.isPublished;

    try {
      const res = await fetch('/api/landing-page/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          tenantId,
          slug: draft.slug,
          customDomain: draft.customDomain ?? null,
          isPublished: nextPublishState,
          themePreset: draft.themePreset,
          logoUrl: draft.logoUrl ?? null,
          heroTitle: draft.heroTitle,
          heroSubtitle: draft.heroSubtitle ?? null,
          heroImageUrl: draft.heroImageUrl ?? null,
          aboutText: draft.aboutText ?? null,
          whatsappNumber: draft.whatsappNumber ?? null,
          address: draft.address ?? null,
          googleMapsUrl: draft.googleMapsUrl ?? null,
          openingHoursJson: draft.openingHoursJson,
          socialLinksJson: draft.socialLinksJson,
          highlightsJson: draft.highlightsJson.filter((h) => h.trim().length > 0),
          sectionsVisibilityJson: draft.sectionsVisibilityJson,
          seoTitle: draft.seoTitle ?? null,
          seoDescription: draft.seoDescription ?? null,
          productVisibilityMap,
          roomVisibilityMap,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        landingPage?: TenantLandingPageConfig;
        previewPayload?: PublicTenantLandingPayload;
      };
      if (!res.ok || !data.landingPage) {
        throw new Error(data.error || 'Gagal menyimpan perubahan Landing Page.');
      }
      setDraft(data.landingPage);
      if (data.previewPayload) setPreviewPayload(data.previewPayload);
      setSaveSuccess(
        data.landingPage.isPublished
          ? `Landing Page berhasil disimpan & terbit publik di /toko/${data.landingPage.slug}.`
          : 'Draft Landing Page berhasil disimpan.'
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan Landing Page.');
    } finally {
      setSaving(false);
    }
  };

  const activePublicUrl = useMemo(() => {
    if (!draft) return '';
    return buildTenantLandingUrl(draft.slug, {
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      mode: urlMode,
      rootDomain,
    });
  }, [draft, urlMode, rootDomain]);

  const livePreviewPayload = useMemo<PublicTenantLandingPayload | null>(() => {
    if (!previewPayload || !draft) return null;
    const filteredProducts = previewPayload.products.filter(
      (p) => productVisibilityMap[p.id] !== false
    );
    const filteredRooms = previewPayload.boardingRooms.filter(
      (r) => roomVisibilityMap[r.id] !== false
    );
    return {
      ...previewPayload,
      isPreview: !draft.isPublished,
      landingPage: draft,
      products: filteredProducts,
      categories: Array.from(new Set(filteredProducts.map((p) => p.categoryName))),
      boardingRooms: filteredRooms,
      availableRoomsCount: filteredRooms.filter((r) => r.status === 'AVAILABLE').length,
    };
  }, [previewPayload, draft, productVisibilityMap, roomVisibilityMap]);

  const handleCopyUrl = async () => {
    if (!activePublicUrl) return;
    try {
      await navigator.clipboard.writeText(activePublicUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore clipboard fallback error
    }
  };

  const handleDownloadQrPng = () => {
    const canvas = qrCanvasRef.current?.querySelector('canvas');
    if (!canvas || !draft) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-toko-${draft.slug}.png`;
    a.click();
  };

  // 5-Point Mandatory Requirements Checklist for Free Master Admin Assistance
  const totalCatalogCount = catalogItems.length + rooms.length + specializedAssetsCount;
  const checklist = useMemo(() => {
    const req1 = isAddonActive;
    const req2 = isValidIndonesianWhatsapp(assistContactWa);
    const req3 = assistHeroUrl.trim().length > 0;
    const req4 = totalCatalogCount >= 3 || assistFeaturedNotes.trim().length >= 10;
    const req5 = assistAgreed;
    return {
      req1,
      req2,
      req3,
      req4,
      req5,
      allPassed: req1 && req2 && req3 && req4 && req5,
    };
  }, [isAddonActive, assistContactWa, assistHeroUrl, totalCatalogCount, assistFeaturedNotes, assistAgreed]);

  const handleAssistUpload = async (target: 'logo' | 'hero' | number, file: File | undefined) => {
    if (!file) return;
    setAssistError('');
    setAssistUploading(String(target));
    try {
      const uploaded = await uploadImageWithS3Fallback(file, {
        tenantId,
        folder: target === 'logo' ? 'logos' : 'landing',
        authToken: session.token,
        maxDim: target === 'logo' ? 400 : 1200,
        quality: 0.82,
      });
      if (target === 'logo') setAssistLogoUrl(uploaded.url);
      else if (target === 'hero') setAssistHeroUrl(uploaded.url);
      else {
        setAssistGalleryUrls((prev) => prev.map((v, i) => (i === target ? uploaded.url : v)));
      }
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : 'Gagal membaca file gambar.');
    } finally {
      setAssistUploading(null);
    }
  };

  const handleSubmitAssistance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checklist.allPassed) return;
    setAssistSubmitting(true);
    setAssistError('');
    setAssistSuccess('');
    try {
      const res = await fetch('/api/landing-page/assistance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          tenantId,
          contactWhatsapp: assistContactWa,
          logoAssetUrl: assistLogoUrl || null,
          heroBannerUrl: assistHeroUrl,
          galleryAssetUrls: assistGalleryUrls.filter((u) => u.trim().length > 0),
          preferredTheme: assistPreferredTheme,
          featuredItemsNotes: assistFeaturedNotes || null,
          customBrief: assistBrief,
          agreedToTerms: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        request?: LandingPageAssistanceRequest;
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error || 'Gagal mengirim permintaan bantuan kustomisasi.');
      }
      setTickets((prev) => [data.request!, ...prev]);
      setAssistBrief('');
      setAssistSuccess(
        'Permintaan bantuan kustomisasi gratis berhasil dikirim! Master Admin akan menghubungi Anda via WhatsApp dan menyiapkan halaman usaha Anda.'
      );
    } catch (err) {
      setAssistError(err instanceof Error ? err.message : 'Gagal mengirim permintaan bantuan.');
    } finally {
      setAssistSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Landing Page Usaha & Katalog Online"
      subtitle={`Website profil & katalog otomatis untuk ${profile.verticalLabel} · Atur mandiri atau gunakan bantuan kustomisasi gratis Master Admin`}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-24 rounded-xl bg-white border border-stone-200 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 h-96 rounded-xl bg-white border border-stone-200 animate-pulse" />
            <div className="lg:col-span-5 h-96 rounded-xl bg-white border border-stone-200 animate-pulse" />
          </div>
        </div>
      ) : loadError ? (
        <div className="bg-white border border-rose-200 rounded-xl p-8 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" strokeWidth={1.75} />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-stone-900">Gagal Memuat Halaman Editor</h2>
            <p className="text-xs text-stone-600">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchEditorData()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} /> Coba Lagi
          </button>
        </div>
      ) : !isAddonActive ? (
        /* FEATURE GUARD GATE WHEN ADDON_LANDING_PAGE IS NOT ACTIVE */
        <div className="max-w-4xl mx-auto bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="p-6 sm:p-8 border-b border-stone-200 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-8 space-y-3">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Globe className="w-4 h-4" strokeWidth={1.75} />
                <span>Add-On Opsional · Tersedia untuk Paket LITE, BASIC, PRO &amp; EXPERT</span>
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-stone-900">
                Miliki Website Profil &amp; Katalog Online untuk {activeWorkspace.tenant.name}
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed max-w-[60ch]">
                Tampilkan {profile.catalogSectionTitle.toLowerCase()} secara otomatis dengan tautan publik{' '}
                <span className="font-mono text-stone-900 font-semibold">/toko/{draft?.slug || 'nama-usaha'}</span>{' '}
                yang siap migrasi ke subdomain, tombol pesan WhatsApp langsung, dan QR Code cetak untuk toko Anda.
              </p>
            </div>
            <div className="md:col-span-4 rounded-xl bg-stone-50 border border-stone-200 p-5 space-y-3">
              <p className="text-xs font-semibold text-stone-600">Biaya Langganan Add-On</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-stone-900">
                +Rp25.000
                <span className="text-xs font-sans font-normal text-stone-500"> / bulan</span>
              </p>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                <span>Termasuk Bantuan Kustomisasi Gratis oleh Master Admin (1x setup + 2x revisi)</span>
              </div>
              <button
                type="button"
                data-testid="activate-landing-addon-btn"
                disabled={activating}
                onClick={() => void handleActivateAddon()}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {activating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengaktifkan Add-On...</span>
                  </>
                ) : (
                  <span>Aktifkan Add-On Landing Page (+Rp25.000/bln)</span>
                )}
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-8 bg-[#FAFAF9] grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-stone-900">Adaptif Otomatis ({profile.verticalLabel})</p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Katalog produk, menu, kamar kost, maupun armada langsung tersinkronisasi dari data KasirAkun Anda tanpa input ulang.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-stone-900">4 Tema Rapi &amp; Siap Cetak QR</p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Pilih tema warna yang nyaman dibaca, edit mandiri kapan saja dengan Live Preview, serta unduh QR Code untuk dipasang di kasir.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-stone-900">Dibantu Admin Tanpa Biaya Tambahan</p>
              <p className="text-xs text-stone-600 leading-relaxed">
                Sibuk jaga toko? Kirim foto dan deskripsi singkat, lalu Master Admin kami akan membantu menata dan menerbitkan halaman Anda secara gratis.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ACTIVE ADD-ON WORKSPACE: 2 TABS */
        <div className="space-y-5">
          {/* Top Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
            <div className="inline-flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200">
              <button
                type="button"
                data-testid="landing-tab-self-service"
                onClick={() => setActiveTab('SELF_SERVICE')}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'SELF_SERVICE'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                <span>Atur Mandiri &amp; Live Preview</span>
              </button>
              <button
                type="button"
                data-testid="landing-tab-assistance"
                onClick={() => setActiveTab('ASSISTANCE')}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'ASSISTANCE'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Headphones className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
                <span>Bantuan Kustomisasi Gratis (Master Admin)</span>
                {tickets.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] tabular-nums">
                    {tickets.length}
                  </span>
                )}
              </button>
            </div>

            {draft && (
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`px-2.5 py-1 rounded-md border font-semibold ${
                    draft.isPublished
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {draft.isPublished ? 'Terbit Publik' : 'Draft (Belum Terbit)'}
                </span>
              </div>
            )}
          </div>

          {activeTab === 'SELF_SERVICE' && draft ? (
            <div className="space-y-5">
              {/* Active URL & Quick Publish Header Bar */}
              <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      Tautan Aktif Landing Page Usaha
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code
                        data-testid="landing-active-url"
                        className="text-xs sm:text-sm font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md break-all"
                      >
                        {activePublicUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopyUrl()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
                      >
                        {copiedUrl ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Salin Link</span>
                          </>
                        )}
                      </button>
                      <a
                        href={`/toko/${draft.slug}${draft.isPublished ? '' : '?preview=1'}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="landing-open-public-link"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
                      >
                        <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>{draft.isPublished ? 'Buka Halaman Publik' : 'Buka Pratinjau'}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setQrModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700"
                      >
                        <QrCode className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>QR Code</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="landing-toggle-publish-btn"
                      disabled={saving}
                      onClick={() => void handleSaveLandingPage(!draft.isPublished)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        draft.isPublished
                          ? 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                          : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {draft.isPublished ? 'Jadikan Draft' : 'Terbitkan Sekarang'}
                    </button>
                    <button
                      type="button"
                      data-testid="landing-save-btn"
                      disabled={saving}
                      onClick={() => void handleSaveLandingPage()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors"
                    >
                      {saving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
                      )}
                      <span>Simpan Perubahan</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-stone-500 pt-2 border-t border-stone-100">
                  Alamat sementara menggunakan jalur <span className="font-mono text-stone-700">/toko/{draft.slug}</span> dan dirancang siap migrasi otomatis ke subdomain{' '}
                  <span className="font-mono text-stone-700">{buildSubdomainPreviewAddress(draft.slug, rootDomain)}</span> saat domain kustom diaktifkan.
                </p>
              </div>

              {saveError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>{saveError}</span>
                </div>
              )}
              {saveSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
                    {saveSuccess}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSaveSuccess('')}
                    className="font-semibold underline"
                  >
                    Tutup
                  </button>
                </div>
              )}

              {/* 2-Column Split: Form Left (7) + Sticky Live Preview Right (5) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-7">
                  <LandingConfigFormFields
                    tenantId={tenantId}
                    authToken={session.token}
                    draft={draft}
                    onChange={setDraft}
                    catalogItems={catalogItems}
                    productVisibilityMap={productVisibilityMap}
                    onToggleProductVisibility={(id, visible) =>
                      setProductVisibilityMap((prev) => ({ ...prev, [id]: visible }))
                    }
                    rooms={rooms}
                    roomVisibilityMap={roomVisibilityMap}
                    onToggleRoomVisibility={(id, visible) =>
                      setRoomVisibilityMap((prev) => ({ ...prev, [id]: visible }))
                    }
                    rootDomain={rootDomain}
                  />
                </div>

                {/* Live Preview Frame */}
                <div className="xl:col-span-5 xl:sticky xl:top-20 space-y-3">
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-stone-900">Live Preview Halaman Publik</p>
                        <p className="text-[11px] text-stone-500 font-mono">/toko/{draft.slug}</p>
                      </div>
                      <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-stone-200/70">
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('DESKTOP')}
                          aria-label="Pratinjau Desktop"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            previewDevice === 'DESKTOP'
                              ? 'bg-white text-stone-900 shadow-xs'
                              : 'text-stone-600'
                          }`}
                        >
                          <Monitor className="w-3 h-3" strokeWidth={1.75} />
                          <span>Desktop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewDevice('MOBILE')}
                          aria-label="Pratinjau HP"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            previewDevice === 'MOBILE'
                              ? 'bg-white text-stone-900 shadow-xs'
                              : 'text-stone-600'
                          }`}
                        >
                          <Smartphone className="w-3 h-3" strokeWidth={1.75} />
                          <span>HP</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-stone-100/80 flex justify-center">
                      <div
                        className={`bg-white border border-stone-200 rounded-lg overflow-y-auto overflow-x-hidden max-h-[680px] transition-all ${
                          previewDevice === 'MOBILE' ? 'w-[340px]' : 'w-full'
                        }`}
                      >
                        {livePreviewPayload && (
                          <PublicStorefrontView
                            payload={livePreviewPayload}
                            embeddedPreview
                            compactMobilePreview={previewDevice === 'MOBILE'}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* TAB 2: BANTUAN KUSTOMISASI GRATIS (MASTER ADMIN) */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-5">
                {/* Free Service Info Banner */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                    <Headphones className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                    <span>Layanan Bantuan Kustomisasi Gratis oleh Master Admin</span>
                  </div>
                  <p className="text-xs text-emerald-900/90 leading-relaxed">
                    Sudah termasuk dalam biaya Add-On +Rp25.000/bulan. Anda mendapatkan{' '}
                    <strong>1x setup awal lengkap</strong> (penataan hero, profil, jam buka, tema, dan katalog) ditambah{' '}
                    <strong>2x revisi ringan gratis</strong>. Cukup penuhi 5 syarat wajib di bawah agar pengerjaan cepat dan tepat sasaran.
                  </p>
                </div>

                {/* 5-Point Mandatory Requirements Checklist */}
                <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-stone-900">
                    Checklist 5 Syarat Wajib Bantuan Gratis
                  </h3>
                  <ul className="space-y-2 text-xs">
                    {[
                      { ok: checklist.req1, text: '1. Add-On Landing Page Usaha (+Rp25.000/bln) berstatus aktif.' },
                      { ok: checklist.req2, text: '2. Nomor WhatsApp aktif diisi dengan format benar (08xx / 628xx).' },
                      { ok: checklist.req3, text: '3. Foto utama usaha / banner hero (URL atau unggah gambar) tersedia.' },
                      {
                        ok: checklist.req4,
                        text: `4. Minimal 3 produk/layanan/kamar di katalog (${totalCatalogCount} terdeteksi) atau isi catatan produk unggulan.`,
                      },
                      { ok: checklist.req5, text: '5. Menyetujui ketentuan kuota bantuan (1x setup + 2x revisi ringan).' },
                    ].map((row) => (
                      <li key={row.text} className="flex items-start gap-2.5">
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                            row.ok
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-stone-100 text-stone-400 border border-stone-200'
                          }`}
                        >
                          <Check className="w-3 h-3" strokeWidth={2.2} />
                        </span>
                        <span className={row.ok ? 'text-stone-900 font-medium' : 'text-stone-500'}>
                          {row.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Submission Form */}
                <form
                  onSubmit={(e) => void handleSubmitAssistance(e)}
                  className="bg-white border border-stone-200 rounded-xl p-5 space-y-4"
                >
                  <h3 className="text-sm font-bold text-stone-900 border-b border-stone-200 pb-3">
                    Formulir Pengajuan Kustomisasi Gratis
                  </h3>

                  {assistError && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                      <span>{assistError}</span>
                    </div>
                  )}
                  {assistSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
                      <span>{assistSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="assist-wa" className="block text-xs font-semibold text-stone-800">
                        Nomor WhatsApp Aktif (Wajib)
                      </label>
                      <input
                        id="assist-wa"
                        type="text"
                        required
                        value={assistContactWa}
                        onChange={(e) => setAssistContactWa(e.target.value)}
                        placeholder="081234567890"
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-stone-300 text-stone-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="assist-theme" className="block text-xs font-semibold text-stone-800">
                        Preferensi Tema Warna
                      </label>
                      <select
                        id="assist-theme"
                        value={assistPreferredTheme}
                        onChange={(e) => setAssistPreferredTheme(e.target.value as LandingThemePreset)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900 bg-white"
                      >
                        {LANDING_THEME_PRESET_CODES.map((code) => (
                          <option key={code} value={code}>
                            {LANDING_THEME_PRESETS[code].name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Hero Banner Asset (Mandatory) */}
                  <div className="space-y-1.5">
                    <label htmlFor="assist-hero-url" className="block text-xs font-semibold text-stone-800">
                      Foto Utama Usaha / Banner Hero (Wajib)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="assist-hero-url"
                        type="text"
                        value={assistHeroUrl}
                        onChange={(e) => setAssistHeroUrl(e.target.value)}
                        placeholder="https://... atau unggah foto depan toko / produk"
                        className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
                      />
                      <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer shrink-0">
                        {assistUploading === 'hero' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )}
                        <span>Unggah</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => void handleAssistUpload('hero', e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Optional Logo Asset */}
                  <div className="space-y-1.5">
                    <label htmlFor="assist-logo-url" className="block text-xs font-semibold text-stone-800">
                      Logo Usaha (Opsional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="assist-logo-url"
                        type="text"
                        value={assistLogoUrl}
                        onChange={(e) => setAssistLogoUrl(e.target.value)}
                        placeholder="https://... atau unggah logo"
                        className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
                      />
                      <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-700 cursor-pointer shrink-0">
                        {assistUploading === 'logo' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )}
                        <span>Unggah</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => void handleAssistUpload('logo', e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Optional Gallery Photos */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-stone-800">Foto Pendukung / Galeri (Opsional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {assistGalleryUrls.map((urlVal, idx) => (
                        <div key={idx} className="flex gap-1.5">
                          <input
                            type="text"
                            aria-label={`URL foto galeri ${idx + 1}`}
                            value={urlVal}
                            onChange={(e) =>
                              setAssistGalleryUrls((prev) =>
                                prev.map((item, i) => (i === idx ? e.target.value : item))
                              )
                            }
                            placeholder={`Link foto ${idx + 1} (opsional)`}
                            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 text-stone-900"
                          />
                          <label className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs text-stone-700 cursor-pointer shrink-0">
                            <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="sr-only"
                              onChange={(e) => void handleAssistUpload(idx, e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="assist-featured" className="block text-xs font-semibold text-stone-800">
                      Produk / Layanan Unggulan yang Ingin Ditonjolkan
                    </label>
                    <textarea
                      id="assist-featured"
                      rows={2}
                      value={assistFeaturedNotes}
                      onChange={(e) => setAssistFeaturedNotes(e.target.value)}
                      placeholder="Contoh: Beras Rojolele 5kg grosir, Minyak Goreng 2L, Gula Pasir 1kg"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="assist-brief" className="block text-xs font-semibold text-stone-800">
                      Catatan Brief Kustomisasi untuk Master Admin (Wajib, min. 15 karakter)
                    </label>
                    <textarea
                      id="assist-brief"
                      rows={3}
                      required
                      value={assistBrief}
                      onChange={(e) => setAssistBrief(e.target.value)}
                      placeholder="Ceritakan gaya bahasa, jam buka khusus, promo utama, atau pesan yang ingin ditonjolkan..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 text-stone-900"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-800 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="assist-agree-terms"
                      checked={assistAgreed}
                      onChange={(e) => setAssistAgreed(e.target.checked)}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600"
                    />
                    <span>
                      Saya menyetujui ketentuan bantuan kustomisasi gratis: mencakup 1x penataan awal lengkap + maksimal 2x revisi ringan dan saya dapat tetap mengubah halaman secara mandiri kapan saja.
                    </span>
                  </label>

                  <button
                    type="submit"
                    data-testid="assist-submit-btn"
                    disabled={!checklist.allPassed || assistSubmitting || assistBrief.trim().length < 15}
                    className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {assistSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengirim Permintaan...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>Kirim Permintaan Bantuan Gratis</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Ticket History */}
              <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-4">
                <div className="border-b border-stone-200 pb-3">
                  <h3 className="text-sm font-bold text-stone-900">Riwayat Tiket Bantuan Anda</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Pantau status pengerjaan dan catatan langsung dari Master Admin.
                  </p>
                </div>

                {tickets.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <Headphones className="w-7 h-7 text-stone-300 mx-auto" strokeWidth={1.75} />
                    <p className="text-xs font-semibold text-stone-700">Belum ada tiket bantuan</p>
                    <p className="text-[11px] text-stone-500 max-w-xs mx-auto">
                      Isi formulir di sebelah kiri jika Anda ingin Master Admin membantu menata Landing Page usaha Anda secara gratis.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tickets.map((t) => {
                      const st = ASSIST_STATUS_META[t.status] ?? ASSIST_STATUS_META.PENDING;
                      return (
                        <div
                          key={t.id}
                          className="p-4 rounded-lg border border-stone-200 bg-stone-50/50 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${st.cls}`}>
                              {st.label}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-stone-500">
                              Revisi: {t.freeRevisionQuotaUsed}/2
                            </span>
                          </div>
                          <p className="text-xs text-stone-800 leading-relaxed">{t.customBrief}</p>
                          {t.adminNotes && (
                            <div className="p-2.5 rounded-md bg-white border border-emerald-200 text-xs text-stone-800">
                              <p className="text-[11px] font-semibold text-emerald-800 mb-0.5">
                                Catatan Master Admin:
                              </p>
                              <p>{t.adminNotes}</p>
                            </div>
                          )}
                          <p className="text-[11px] text-stone-400 font-mono">
                            Dikirim: {new Date(t.createdAt).toLocaleString('id-ID')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Printable QR Code Modal */}
      {qrModalOpen && draft && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">QR Code Landing Page Usaha</h3>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                aria-label="Tutup modal QR Code"
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
            <div
              ref={qrCanvasRef}
              className="p-5 bg-[#FAFAF9] border border-stone-200 rounded-lg flex flex-col items-center gap-3"
            >
              <QRCodeCanvas value={activePublicUrl} size={200} includeMargin />
              <p className="text-xs font-bold text-stone-900 text-center">{draft.heroTitle}</p>
              <p className="text-[11px] font-mono text-stone-500 break-all text-center">
                {activePublicUrl}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDownloadQrPng}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Unduh PNG</span>
              </button>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
