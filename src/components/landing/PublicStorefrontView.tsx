/**
 * KasirAkun UMKM — Reusable Public UMKM Storefront Renderer (Brand Mode)
 * Shared by `/toko/:slug` and the Live Preview inside User & Master Admin Editors.
 *
 * Design Constitution:
 * - 4 curated Anti-AI-Slop WCAG AA themes (no purple-blue gradients, no pure #000000, no emoji bullets)
 * - Asymmetric 2-column split hero, generous whitespace, crisp 1px borders
 * - `tabular-nums` on every Rupiah price, stock count, and room counter
 * - Automatically adapts layout, catalog cards, and WhatsApp CTAs across ALL 22 UMKM verticals
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BedDouble,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Package,
  Search,
  Share2,
  Store,
  Tag,
} from 'lucide-react';
import {
  getVerticalLandingProfile,
  LANDING_THEME_PRESETS,
} from '../../lib/landing/landing-presets';
import {
  buildWhatsappDirectUrl,
  sanitizeExternalUrl,
} from '../../lib/landing/url-helper';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type { PublicTenantLandingPayload } from '../../types/domain';

interface PublicStorefrontViewProps {
  payload: PublicTenantLandingPayload;
  compactMobilePreview?: boolean;
  embeddedPreview?: boolean;
}

export function PublicStorefrontView({
  payload,
  compactMobilePreview = false,
  embeddedPreview = false,
}: PublicStorefrontViewProps) {
  const { tenant, landingPage, categories, products, boardingRooms, availableRoomsCount, specializedAssets } =
    payload;
  const isCompactFrame = compactMobilePreview || embeddedPreview;

  const theme = LANDING_THEME_PRESETS[landingPage.themePreset] ?? LANDING_THEME_PRESETS.WARM_EMERALD;
  const profile = getVerticalLandingProfile(tenant.vertical);
  const vis = landingPage.sectionsVisibilityJson ?? {
    hero: true,
    catalog: true,
    highlights: true,
    about: true,
    location: true,
    contact: true,
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [heroImgError, setHeroImgError] = useState(false);
  const [logoImgError, setLogoImgError] = useState(false);

  const safeLogoUrl = !logoImgError
    ? sanitizeExternalUrl(landingPage.logoUrl || tenant.logoUrl, { allowDataImage: true })
    : null;
  const safeHeroUrl = !heroImgError
    ? sanitizeExternalUrl(landingPage.heroImageUrl, { allowDataImage: true })
    : null;
  const safeMapsUrl = sanitizeExternalUrl(landingPage.googleMapsUrl, { allowDataImage: false });

  const waPrimaryUrl = buildWhatsappDirectUrl(
    landingPage.whatsappNumber,
    profile.waPrimaryGreeting(landingPage.heroTitle || tenant.name)
  );

  const sortedBoardingRooms = useMemo(() => {
    const rank = (status: string) =>
      status === 'AVAILABLE' ? 0 : status === 'OCCUPIED' ? 1 : 2;
    return [...boardingRooms].sort((a, b) => rank(a.status) - rank(b.status));
  }, [boardingRooms]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((item) => {
      if (selectedCategory !== 'ALL' && item.categoryName !== selectedCategory) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  const tenantInitials = (landingPage.heroTitle || tenant.name || 'UM')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const socialEntries = useMemo(() => {
    const links = landingPage.socialLinksJson ?? {};
    const out: Array<{ label: string; url: string }> = [];
    const ig = sanitizeExternalUrl(links.instagram, { allowDataImage: false });
    const tt = sanitizeExternalUrl(links.tiktok, { allowDataImage: false });
    const fb = sanitizeExternalUrl(links.facebook, { allowDataImage: false });
    const web = sanitizeExternalUrl(links.website, { allowDataImage: false });
    if (ig) out.push({ label: 'Instagram', url: ig });
    if (tt) out.push({ label: 'TikTok', url: tt });
    if (fb) out.push({ label: 'Facebook', url: fb });
    if (web) out.push({ label: 'Website', url: web });
    return out;
  }, [landingPage.socialLinksJson]);

  const containerPad = isCompactFrame ? 'px-4' : 'px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto';
  const showKostRooms = profile.catalogMode === 'KOST_ROOMS';
  const showSpecializedAssets =
    profile.catalogMode === 'ASSET_BOOKING' && specializedAssets.length > 0;

  return (
    <div
      className={`min-h-full ${theme.pageBgClass} ${theme.bodyTextClass} font-sans antialiased selection:bg-emerald-100 selection:text-emerald-950`}
    >
      {/* Preview Draft Notice Bar */}
      {payload.isPreview && !landingPage.isPublished && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs font-semibold text-amber-900">
          Mode Pratinjau (Draft) · Halaman ini belum dipublikasikan ke pengunjung umum.
        </div>
      )}

      {/* Top Brand Header */}
      <header className={`${theme.surfaceBgClass} border-b ${theme.borderClass} sticky top-0 z-20`}>
        <div className={`${containerPad} h-16 flex items-center justify-between gap-4`}>
          <div className="flex items-center gap-3 min-w-0">
            {safeLogoUrl ? (
              <img
                src={safeLogoUrl}
                alt={`Logo ${landingPage.heroTitle}`}
                onError={() => setLogoImgError(true)}
                className={`w-9 h-9 rounded-lg object-cover border ${theme.borderClass} shrink-0`}
              />
            ) : (
              <div
                className={`w-9 h-9 rounded-lg ${theme.accentBgClass} ${theme.ctaTextClass} flex items-center justify-center text-xs font-bold tracking-tight shrink-0`}
              >
                {tenantInitials || <Store className="w-4 h-4" strokeWidth={1.75} />}
              </div>
            )}
            <div className="min-w-0">
              <p className={`text-sm font-bold ${theme.headingTextClass} truncate leading-tight`}>
                {landingPage.heroTitle || tenant.name}
              </p>
              <p className={`text-[11px] ${theme.mutedTextClass} truncate`}>
                {profile.verticalLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isCompactFrame && (
              <nav className="hidden md:flex items-center gap-5 mr-3 text-xs font-semibold">
                {vis.catalog && (
                  <a href="#katalog" className={`${theme.mutedTextClass} hover:underline`}>
                    Katalog
                  </a>
                )}
                {vis.about && (
                  <a href="#tentang" className={`${theme.mutedTextClass} hover:underline`}>
                    Tentang
                  </a>
                )}
                {vis.location && (
                  <a href="#lokasi" className={`${theme.mutedTextClass} hover:underline`}>
                    Lokasi
                  </a>
                )}
              </nav>
            )}
            {waPrimaryUrl && (
              <a
                href={waPrimaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`}
              >
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Hubungi WA</span>
              </a>
            )}
          </div>
        </div>
      </header>

      {/* 1. Asymmetric Split Hero (Brand Mode) */}
      {vis.hero && (
        <section className={`border-b ${theme.borderClass} ${theme.surfaceBgClass}`}>
          <div
            className={`${containerPad} ${
              isCompactFrame ? 'py-7' : 'py-12 lg:py-16'
            } grid grid-cols-1 ${isCompactFrame ? '' : 'lg:grid-cols-12'} gap-6 ${isCompactFrame ? '' : 'lg:gap-12'} items-center`}
          >
            <div className={`${isCompactFrame ? '' : 'lg:col-span-7'} space-y-4`}>
              <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${theme.accentTextClass}`}>
                {profile.verticalLabel}
              </p>
              <h1
                className={`${
                  compactMobilePreview ? 'text-2xl' : embeddedPreview ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl lg:text-[42px]'
                } font-bold tracking-[-0.03em] leading-[1.1] text-balance ${theme.headingTextClass}`}
              >
                {landingPage.heroTitle || tenant.name}
              </h1>
              {landingPage.heroSubtitle && (
                <p className={`text-sm sm:text-base leading-relaxed max-w-[60ch] text-pretty ${theme.bodyTextClass}`}>
                  {landingPage.heroSubtitle}
                </p>
              )}

              {/* Contextual Live Stat for Kost / Asset / Retail */}
              {showKostRooms && boardingRooms.length > 0 && (
                <div
                  className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg border ${theme.accentBorderClass} ${theme.accentSoftBgClass} text-xs font-semibold ${theme.accentTextClass}`}
                >
                  <BedDouble className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span className="font-mono tabular-nums">
                    {availableRoomsCount} kamar tersedia
                  </span>
                  <span className="opacity-75">dari {boardingRooms.length} unit tercatat</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {waPrimaryUrl ? (
                  <a
                    href={waPrimaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`}
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
                    <span>{profile.primaryCtaLabel}</span>
                  </a>
                ) : (
                  <a
                    href="#katalog"
                    className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`}
                  >
                    <span>
                      {profile.catalogMode === 'KOST_ROOMS'
                        ? 'Lihat Daftar Kamar'
                        : profile.catalogMode === 'CULINARY_MENU'
                        ? 'Lihat Daftar Menu'
                        : profile.catalogMode === 'RETAIL_WHOLESALE' ||
                          profile.catalogMode === 'AGRO_HARVEST' ||
                          profile.catalogMode === 'PREORDER_PRODUCTION'
                        ? 'Lihat Daftar Barang'
                        : profile.catalogMode === 'ASSET_BOOKING'
                        ? 'Lihat Daftar Unit & Jadwal'
                        : 'Lihat Daftar Layanan'}
                    </span>
                    <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                  </a>
                )}

                {vis.catalog && (
                  <a
                    href="#katalog"
                    className={`inline-flex items-center gap-1.5 px-4 py-3 rounded-lg border ${theme.borderClass} ${theme.surfaceBgClass} text-sm font-semibold ${theme.headingTextClass} hover:opacity-90 transition-opacity`}
                  >
                    <span>Telusuri Katalog</span>
                  </a>
                )}
              </div>

              {landingPage.address && (
                <p className={`flex items-start gap-2 text-xs ${theme.mutedTextClass} pt-1`}>
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>{landingPage.address}</span>
                </p>
              )}
            </div>

            <div className={isCompactFrame ? '' : 'lg:col-span-5'}>
              <div
                className={`rounded-xl border ${theme.heroFrameClass} overflow-hidden aspect-[4/3] flex items-center justify-center relative`}
              >
                {safeHeroUrl ? (
                  <img
                    src={safeHeroUrl}
                    alt={landingPage.heroTitle}
                    onError={() => setHeroImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-8 text-center space-y-3 max-w-xs">
                    <div
                      className={`w-14 h-14 mx-auto rounded-xl ${theme.accentSoftBgClass} border ${theme.accentBorderClass} ${theme.accentTextClass} flex items-center justify-center`}
                    >
                      <Store className="w-7 h-7" strokeWidth={1.75} />
                    </div>
                    <p className={`text-sm font-bold ${theme.headingTextClass}`}>
                      {landingPage.heroTitle || tenant.name}
                    </p>
                    <p className={`text-xs ${theme.mutedTextClass} leading-relaxed`}>
                      {profile.verticalLabel} · Pemesanan & informasi resmi langsung dari pengelola.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. Catalog / Menu / Rooms / Fleet Section (Adapted Across All 22 Verticals) */}
      {vis.catalog && (
        <section id="katalog" className={`${compactMobilePreview ? 'py-8' : 'py-14'} border-b ${theme.borderClass}`}>
          <div className={`${containerPad} space-y-6`}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <h2
                  className={`${
                    compactMobilePreview ? 'text-xl' : 'text-2xl sm:text-3xl'
                  } font-bold tracking-[-0.02em] ${theme.headingTextClass}`}
                >
                  {profile.catalogSectionTitle}
                </h2>
                <p className={`text-sm ${theme.mutedTextClass} max-w-[60ch]`}>
                  {profile.catalogSectionSubtitle}
                </p>
              </div>

              {!showKostRooms && !showSpecializedAssets && products.length > 4 && (
                <div className="relative w-full sm:w-64">
                  <Search
                    className={`w-4 h-4 ${theme.mutedTextClass} absolute left-3 top-1/2 -translate-y-1/2`}
                    strokeWidth={1.75}
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari produk atau layanan..."
                    aria-label="Cari produk atau layanan"
                    className={`w-full pl-9 pr-3 py-2 rounded-lg border ${theme.borderClass} ${theme.surfaceBgClass} text-xs ${theme.headingTextClass} focus:outline-none focus:ring-2 focus:ring-emerald-600/30`}
                  />
                </div>
              )}
            </div>

            {/* KOST & KONTRAKAN: Real-Time Room Cards */}
            {showKostRooms ? (
              boardingRooms.length === 0 ? (
                <div className={`rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-8 text-center space-y-2`}>
                  <BedDouble className={`w-7 h-7 mx-auto ${theme.mutedTextClass}`} strokeWidth={1.75} />
                  <p className={`text-sm font-semibold ${theme.headingTextClass}`}>
                    Daftar kamar sedang diperbarui
                  </p>
                  <p className={`text-xs ${theme.mutedTextClass}`}>
                    Silakan hubungi pengelola via WhatsApp untuk info ketersediaan kamar terbaru.
                  </p>
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 ${
                    compactMobilePreview ? '' : embeddedPreview ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
                  } gap-4`}
                >
                  {sortedBoardingRooms.map((room) => {
                    const isAvail = room.status === 'AVAILABLE';
                    const roomLabel = `Kamar ${room.roomNumber} (${room.roomType})`;
                    const roomWa = buildWhatsappDirectUrl(
                      landingPage.whatsappNumber,
                      profile.waItemMessage(
                        landingPage.heroTitle || tenant.name,
                        roomLabel,
                        `${formatRupiah(room.monthlyPrice)}/bln`
                      )
                    );
                    return (
                      <article
                        key={room.id}
                        className={`rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-5 flex flex-col justify-between gap-4`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-xs font-mono font-semibold ${theme.mutedTextClass}`}>
                                Unit {room.roomNumber}
                              </p>
                              <h3 className={`text-base font-bold ${theme.headingTextClass}`}>
                                {room.roomType}
                              </h3>
                            </div>
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border ${
                                isAvail
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-stone-100 text-stone-600 border-stone-200'
                              }`}
                            >
                              {isAvail ? 'Kosong' : room.status === 'OCCUPIED' ? 'Terisi' : 'Perbaikan'}
                            </span>
                          </div>

                          {room.facilities && (
                            <p className={`text-xs ${theme.mutedTextClass} leading-relaxed`}>
                              {room.facilities}
                            </p>
                          )}

                          <div className={`pt-3 border-t ${theme.borderClass}`}>
                            <p className={`text-lg font-bold font-mono tabular-nums ${theme.headingTextClass}`}>
                              {formatRupiah(room.monthlyPrice)}
                              <span className={`text-xs font-sans font-normal ${theme.mutedTextClass}`}>
                                {' '}
                                / bulan
                              </span>
                            </p>
                            {room.annualPrice && Number(room.annualPrice) > 0 && (
                              <p className={`text-xs font-mono tabular-nums ${theme.mutedTextClass} mt-0.5`}>
                                Tahunan: {formatRupiah(room.annualPrice)}
                              </p>
                            )}
                          </div>
                        </div>

                        {roomWa && (
                          <a
                            href={roomWa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
                              isAvail
                                ? `${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`
                                : `border ${theme.borderClass} ${theme.mutedTextClass}`
                            }`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>
                              {isAvail ? `Booking Kamar ${room.roomNumber}` : 'Tanya Daftar Tunggu'}
                            </span>
                          </a>
                        )}
                      </article>
                    );
                  })}
                </div>
              )
            ) : showSpecializedAssets ? (
              /* RENTAL / LAPANGAN / HOMESTAY / GARASI: Real-Time Asset Booking Cards */
              <div
                className={`grid grid-cols-1 ${
                  compactMobilePreview ? '' : 'sm:grid-cols-2 lg:grid-cols-3'
                } gap-4`}
              >
                {specializedAssets.map((asset) => {
                  const assetWa = buildWhatsappDirectUrl(
                    landingPage.whatsappNumber,
                    profile.waItemMessage(
                      landingPage.heroTitle || tenant.name,
                      asset.title,
                      `${formatRupiah(asset.rateAmount)} ${asset.rateLabel}`
                    )
                  );
                  return (
                    <article
                      key={asset.id}
                      className={`rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-5 flex flex-col justify-between gap-4`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className={`text-base font-bold ${theme.headingTextClass}`}>
                              {asset.title}
                            </h3>
                            <p className={`text-xs ${theme.mutedTextClass}`}>{asset.subtitle}</p>
                          </div>
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 ${
                              asset.isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-stone-100 text-stone-600 border-stone-200'
                            }`}
                          >
                            {asset.statusLabel}
                          </span>
                        </div>
                        <p className={`text-lg font-bold font-mono tabular-nums ${theme.headingTextClass} pt-2 border-t ${theme.borderClass}`}>
                          {formatRupiah(asset.rateAmount)}
                          <span className={`text-xs font-sans font-normal ${theme.mutedTextClass}`}>
                            {' '}
                            {asset.rateLabel}
                          </span>
                        </p>
                      </div>
                      {assetWa && (
                        <a
                          href={assetWa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`}
                        >
                          <CalendarClock className="w-3.5 h-3.5" strokeWidth={1.75} />
                          <span>{profile.itemActionLabel}</span>
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              /* RETAIL, CULINARY, AGRO, SERVICES, PRE-ORDER: Filterable Product/Service Grid */
              <div className="space-y-5">
                {categories.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                        selectedCategory === 'ALL'
                          ? `${theme.accentBgClass} border-transparent ${theme.ctaTextClass}`
                          : `${theme.surfaceBgClass} ${theme.borderClass} ${theme.mutedTextClass}`
                      }`}
                    >
                      Semua ({products.length})
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                          selectedCategory === cat
                            ? `${theme.accentBgClass} border-transparent ${theme.ctaTextClass}`
                            : `${theme.surfaceBgClass} ${theme.borderClass} ${theme.mutedTextClass}`
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {filteredProducts.length === 0 ? (
                  <div className={`rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-8 text-center space-y-2`}>
                    <Package className={`w-7 h-7 mx-auto ${theme.mutedTextClass}`} strokeWidth={1.75} />
                    <p className={`text-sm font-semibold ${theme.headingTextClass}`}>
                      Belum ada produk atau layanan yang cocok
                    </p>
                    <p className={`text-xs ${theme.mutedTextClass}`}>
                      Hubungi kami langsung lewat WhatsApp untuk menanyakan ketersediaan terbaru.
                    </p>
                  </div>
                ) : (
                  <div
                    className={`grid grid-cols-1 ${
                      compactMobilePreview ? '' : embeddedPreview ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
                    } gap-4`}
                  >
                    {filteredProducts.map((item) => {
                      const itemWa = buildWhatsappDirectUrl(
                        landingPage.whatsappNumber,
                        profile.waItemMessage(
                          landingPage.heroTitle || tenant.name,
                          item.name,
                          `${formatRupiah(item.sellingPrice)}/${item.unit}`
                        )
                      );
                      const stockNum = Number(item.stockQty || 0);
                      const showStockMeta =
                        profile.catalogMode === 'RETAIL_WHOLESALE' ||
                        profile.catalogMode === 'AGRO_HARVEST';

                      return (
                        <article
                          key={item.id}
                          className={`rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} overflow-hidden flex flex-col justify-between`}
                        >
                          <div>
                            {item.imageUrl && (
                              <div className={`aspect-[16/10] ${theme.surfaceSubtleClass} border-b ${theme.borderClass} overflow-hidden`}>
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            )}
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[11px] font-semibold ${theme.mutedTextClass} truncate`}>
                                  {item.categoryName}
                                </span>
                                {item.wholesaleBadge && (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${theme.accentBorderClass} ${theme.accentSoftBgClass} ${theme.accentTextClass} shrink-0`}
                                  >
                                    <Tag className="w-2.5 h-2.5" strokeWidth={1.75} />
                                    {item.wholesaleBadge}
                                  </span>
                                )}
                              </div>
                              <h3 className={`text-sm font-bold ${theme.headingTextClass} leading-snug`}>
                                {item.name}
                                {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                              </h3>
                              {item.description && (
                                <p className={`text-xs ${theme.mutedTextClass} line-clamp-2 leading-relaxed`}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className={`px-4 pb-4 pt-3 border-t ${theme.borderClass} flex items-center justify-between gap-3`}>
                            <div>
                              <p className={`text-base font-bold font-mono tabular-nums ${theme.headingTextClass}`}>
                                {formatRupiah(item.sellingPrice)}
                              </p>
                              <p className={`text-[11px] ${theme.mutedTextClass} font-mono tabular-nums`}>
                                per {item.unit}
                                {showStockMeta && stockNum > 0 ? ` · Stok ${stockNum}` : ''}
                              </p>
                            </div>
                            {itemWa && (
                              <a
                                href={itemWa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass} shrink-0`}
                              >
                                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                                <span>{profile.itemActionLabel}</span>
                              </a>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. Highlights & About Section (Varied 2-Column Editorial Rhythm) */}
      {(vis.highlights || vis.about) && (
        <section
          id="tentang"
          className={`${isCompactFrame ? 'py-8' : 'py-14'} ${theme.surfaceBgClass} border-b ${theme.borderClass}`}
        >
          <div
            className={`${containerPad} grid grid-cols-1 ${
              isCompactFrame ? '' : 'lg:grid-cols-12'
            } gap-8 ${isCompactFrame ? '' : 'lg:gap-12'} items-start`}
          >
            {vis.about && (
              <div className={`${isCompactFrame ? '' : vis.highlights ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`}>
                <p className={`text-xs font-semibold uppercase tracking-[0.12em] ${theme.accentTextClass}`}>
                  Tentang Usaha
                </p>
                <h2 className={`text-2xl font-bold tracking-[-0.02em] ${theme.headingTextClass}`}>
                  Mengenal {landingPage.heroTitle || tenant.name}
                </h2>
                <p className={`text-sm leading-relaxed max-w-[65ch] whitespace-pre-line ${theme.bodyTextClass}`}>
                  {landingPage.aboutText || profile.defaultSubtitle}
                </p>
              </div>
            )}

            {vis.highlights && (landingPage.highlightsJson?.length ?? 0) > 0 && (
              <div className={`${isCompactFrame ? '' : vis.about ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4`}>
                <h3 className={`text-lg font-bold ${theme.headingTextClass}`}>
                  {profile.highlightsTitle}
                </h3>
                <ul className={`divide-y ${theme.borderClass} border-t border-b ${theme.borderClass}`}>
                  {landingPage.highlightsJson.map((point, idx) => (
                    <li key={`${idx}-${point.slice(0, 12)}`} className="py-3.5 flex items-start gap-3">
                      <span
                        className={`w-5 h-5 rounded-md ${theme.accentSoftBgClass} ${theme.accentTextClass} flex items-center justify-center shrink-0 mt-0.5`}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className={`text-sm leading-relaxed ${theme.bodyTextClass}`}>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. Location, Opening Hours & Contact Section */}
      {(vis.location || vis.contact) && (
        <section id="lokasi" className={`${isCompactFrame ? 'py-8' : 'py-14'}`}>
          <div
            className={`${containerPad} grid grid-cols-1 ${
              isCompactFrame ? '' : 'md:grid-cols-12'
            } gap-6`}
          >
            {vis.location && (
              <div
                className={`${isCompactFrame ? '' : 'md:col-span-7'} rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-6 space-y-4`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className={`w-4 h-4 ${theme.accentTextClass}`} strokeWidth={1.75} />
                  <h2 className={`text-base font-bold ${theme.headingTextClass}`}>
                    Lokasi & Jam Operasional
                  </h2>
                </div>

                {landingPage.address && (
                  <p className={`text-sm leading-relaxed ${theme.bodyTextClass}`}>
                    {landingPage.address}
                  </p>
                )}

                {safeMapsUrl && (
                  <div>
                    <a
                      href={safeMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border ${theme.borderClass} text-xs font-semibold ${theme.headingTextClass} hover:opacity-85 transition-opacity`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Buka Petunjuk Arah di Google Maps</span>
                    </a>
                  </div>
                )}

                {(landingPage.openingHoursJson?.length ?? 0) > 0 && (
                  <div className={`pt-4 border-t ${theme.borderClass} space-y-2`}>
                    <p className={`flex items-center gap-1.5 text-xs font-semibold ${theme.mutedTextClass}`}>
                      <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Jam Buka</span>
                    </p>
                    <dl className="space-y-1.5">
                      {landingPage.openingHoursJson.map((row, idx) => (
                        <div
                          key={`${row.day}-${idx}`}
                          className="flex items-center justify-between gap-4 text-xs"
                        >
                          <dt className={`font-medium ${theme.bodyTextClass}`}>{row.day}</dt>
                          <dd className={`font-mono tabular-nums ${row.isClosed ? 'text-rose-700' : theme.headingTextClass}`}>
                            {row.isClosed ? 'Tutup' : row.hours}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}

            {vis.contact && (
              <div
                className={`${isCompactFrame ? '' : 'md:col-span-5'} rounded-xl border ${theme.borderClass} ${theme.surfaceBgClass} p-6 flex flex-col justify-between gap-5`}
              >
                <div className="space-y-3">
                  <h2 className={`text-base font-bold ${theme.headingTextClass}`}>
                    Kontak & Pemesanan Langsung
                  </h2>
                  <p className={`text-xs leading-relaxed ${theme.mutedTextClass}`}>
                    Ada pertanyaan mengenai harga, ketersediaan, atau pesanan khusus? Kirim pesan WhatsApp langsung ke pengelola.
                  </p>
                  {waPrimaryUrl && (
                    <a
                      href={waPrimaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-colors ${theme.accentBgClass} ${theme.accentHoverClass} ${theme.ctaTextClass}`}
                    >
                      <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
                      <span>{profile.primaryCtaLabel}</span>
                    </a>
                  )}
                </div>

                {socialEntries.length > 0 && (
                  <div className={`pt-4 border-t ${theme.borderClass} space-y-2`}>
                    <p className={`text-xs font-semibold ${theme.mutedTextClass}`}>Kanal Resmi</p>
                    <div className="flex flex-wrap gap-2">
                      {socialEntries.map((soc) => (
                        <a
                          key={soc.label}
                          href={soc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${theme.borderClass} text-xs font-medium ${theme.headingTextClass} hover:opacity-80`}
                        >
                          {soc.label === 'Instagram' ? (
                            <Instagram className="w-3.5 h-3.5" strokeWidth={1.75} />
                          ) : soc.label === 'Website' ? (
                            <Globe className="w-3.5 h-3.5" strokeWidth={1.75} />
                          ) : (
                            <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          )}
                          <span>{soc.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quiet, Dignified Footer */}
      <footer className={`border-t ${theme.borderClass} ${theme.surfaceBgClass} py-6`}>
        <div className={`${containerPad} flex flex-col sm:flex-row items-center justify-between gap-2 text-xs ${theme.mutedTextClass}`}>
          <p className="font-medium">
            {landingPage.heroTitle || tenant.name}
          </p>
          <p>Dikelola dengan KasirAkun UMKM</p>
        </div>
      </footer>
    </div>
  );
}
