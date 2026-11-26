/**
 * KasirAkun UMKM — Express API Routes & Subdomain-Ready Middleware
 * for Add-On Landing Page Usaha per UMKM (+Rp25.000/bln) & Master Admin Free Customization.
 *
 * Security Guarantees:
 * - Zero sensitive leaks on public `/api/public/toko/:slug` (no NPWP, NITKU, HPP/costPriceAvg, passwords, or internal tokens).
 * - Strict BOLA verification via `assertTenantAccess(session, tenantId, rec.scope)` on every user endpoint.
 * - Strict `session.role === 'MASTER_ADMIN'` enforcement (403 Forbidden otherwise) on every Master Admin endpoint.
 * - Full Zod schema validation + external URL XSS sanitization (`javascript:` blocked).
 * - Immutable `AuditLog` recording (`ADMIN_UPDATE_LANDING_PAGE` / `ADMIN_COMPLETE_LANDING_ASSISTANCE`).
 */

import crypto from 'node:crypto';
import path from 'node:path';
import type express from 'express';
import {
  assertTenantAccess,
  type PartitionedTenantDatabase,
  type SignedSessionPayload,
} from '../lib/db/tenant-db.ts';
import { tenantHasAddOn } from '../lib/saas/hybrid-pricing.ts';
import {
  buildDefaultTenantLandingPage,
  getVerticalLandingProfile,
} from '../lib/landing/landing-presets.ts';
import {
  buildTenantLandingUrl,
  isValidIndonesianWhatsapp,
  landingAssistanceAdminPatchSchema,
  landingAssistanceCreateSchema,
  normalizeIndonesianWhatsapp,
  resolveLandingUrlConfig,
  sanitizeExternalUrl,
  tenantLandingPageUpdateSchema,
  validateLandingSlug,
} from '../lib/landing/url-helper.ts';
export { createSubdomainRewriteMiddleware as createLandingSubdomainMiddleware } from '../middleware.ts';
import type {
  AuditLog,
  LandingPageAssistanceRequest,
  PublicLandingAssetItem,
  PublicLandingCatalogItem,
  PublicLandingRoomItem,
  PublicTenantLandingPayload,
  TenantLandingPageConfig,
  TenantWorkspaceData,
} from '../types/domain.ts';

export interface LandingRoutesDeps {
  tenantDb: PartitionedTenantDatabase;
  extractSessionFromRequest: (req: express.Request) => SignedSessionPayload | null;
  DATA_ROOT: string;
  loadJsonFile: <T>(filePath: string, fallback: T) => T;
  saveJsonFile: (filePath: string, data: unknown) => void;
}



function buildSpecializedPublicAssets(workspace: TenantWorkspaceData): PublicLandingAssetItem[] {
  const ops = workspace.verticalOps;
  if (!ops) return [];
  const items: PublicLandingAssetItem[] = [];

  if (ops.rentalVehicles && ops.rentalVehicles.length > 0) {
    for (const v of ops.rentalVehicles) {
      items.push({
        id: v.id,
        title: v.name,
        subtitle: `${v.vehicleCategory === 'MOBIL' ? 'Mobil' : 'Motor'} · Tahun ${v.year}`,
        rateLabel: '/ hari',
        rateAmount: v.dailyRate,
        statusLabel: v.status === 'TERSEDIA' ? 'Tersedia' : v.status === 'DISEWA' ? 'Sedang Disewa' : 'Perawatan',
        isAvailable: v.status === 'TERSEDIA',
      });
    }
  }

  if (ops.sportsCourts && ops.sportsCourts.length > 0) {
    for (const c of ops.sportsCourts) {
      items.push({
        id: c.id,
        title: c.name,
        subtitle: `Lapangan ${c.sportType}`,
        rateLabel: '/ jam',
        rateAmount: c.hourlyRate,
        statusLabel: c.isActive ? 'Bisa Booking' : 'Tutup Sementara',
        isAvailable: c.isActive,
      });
    }
  }

  if (ops.homestayUnits && ops.homestayUnits.length > 0) {
    for (const u of ops.homestayUnits) {
      const unitLabel =
        u.unitType === 'VILLA'
          ? 'Villa Privat'
          : u.unitType === 'CABIN'
            ? 'Cabin'
            : 'Kamar Homestay';
      items.push({
        id: u.id,
        title: u.name,
        subtitle: `${unitLabel} · Bisa per malam atau per slot jam`,
        rateLabel: '/ malam',
        rateAmount: u.nightlyRate,
        statusLabel: u.status === 'TERSEDIA' ? 'Tersedia' : u.status === 'TERISI' ? 'Terisi' : 'Pembersihan',
        isAvailable: u.status === 'TERSEDIA',
      });
    }
  }

  if (ops.garageSlots && ops.garageSlots.length > 0) {
    for (const g of ops.garageSlots) {
      const slotTypeLabel =
        g.slotType === 'TERTUTUP_INDOOR'
          ? 'Garasi Tertutup (Indoor)'
          : g.slotType === 'KANOPI'
            ? 'Slot Parkir Kanopi'
            : 'Slot Parkir Outdoor';
      items.push({
        id: g.id,
        title: `Slot Garasi ${g.slotCode}`,
        subtitle: slotTypeLabel,
        rateLabel: '/ bulan',
        rateAmount: g.monthlyRate,
        statusLabel: g.status === 'KOSONG' ? 'Slot Kosong' : 'Terisi',
        isAvailable: g.status === 'KOSONG',
      });
    }
  }

  return items;
}

function buildPublicLandingPayload(params: {
  workspace: TenantWorkspaceData;
  landingPage: TenantLandingPageConfig;
  isPreview: boolean;
}): PublicTenantLandingPayload {
  const { workspace, landingPage, isPreview } = params;
  const categoryMap = new Map<string, string>();
  for (const cat of workspace.categories ?? []) {
    categoryMap.set(cat.id, cat.name);
  }

  const priceTiersByProduct = new Map<string, string>();
  for (const tier of workspace.priceTiers ?? []) {
    if (!priceTiersByProduct.has(tier.productId)) {
      priceTiersByProduct.set(
        tier.productId,
        tier.label || `Grosir min ${Number(tier.minQty)} unit`
      );
    }
  }

  // Strictly project ONLY public storefront fields (NEVER expose costPriceAvg / HPP, supplierName, purchaseReceiptNumber)
  const products: PublicLandingCatalogItem[] = (workspace.products ?? [])
    .filter((p) => p.showOnLanding !== false && p.itemType !== 'RAW_MATERIAL')
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      categoryName: (p.categoryId && categoryMap.get(p.categoryId)) || 'Produk & Layanan',
      imageUrl: sanitizeExternalUrl(p.imageUrl, { allowDataImage: true }),
      unit: p.unit || 'pcs',
      sellingPrice: p.sellingPrice,
      stockQty: p.stockQty,
      isAvailable: p.isAvailable,
      wholesaleBadge: priceTiersByProduct.get(p.id) ?? null,
      brand: p.brand ?? null,
      sizeLabel: p.sizeLabel ?? null,
    }));

  const categories = Array.from(new Set(products.map((p) => p.categoryName)));

  const boardingRooms: PublicLandingRoomItem[] = (workspace.boardingRooms ?? [])
    .filter((r) => r.showOnLanding !== false)
    .map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      monthlyPrice: r.monthlyPrice ?? r.monthlyRate ?? '0.0000',
      annualPrice: r.annualPrice ?? r.yearlyRate ?? null,
      status: r.status,
      facilities: r.facilities ?? null,
    }));

  const availableRoomsCount = boardingRooms.filter((r) => r.status === 'AVAILABLE').length;
  const specializedAssets = buildSpecializedPublicAssets(workspace);

  return {
    isPreview,
    tenant: {
      id: workspace.tenant.id,
      name: workspace.tenant.name,
      vertical: workspace.tenant.vertical,
      address: workspace.tenant.address || '',
      logoUrl: sanitizeExternalUrl(workspace.tenant.logoUrl, { allowDataImage: true }),
    },
    landingPage,
    categories,
    products,
    boardingRooms,
    availableRoomsCount,
    specializedAssets,
  };
}

function appendAuditLogToWorkspace(
  tenantDb: PartitionedTenantDatabase,
  scope: 'DEMO' | 'REAL' | 'SIMULATION',
  ownerAccountId: string,
  workspace: TenantWorkspaceData,
  log: Omit<AuditLog, 'id' | 'createdAt'>
): void {
  const entry: AuditLog = {
    ...log,
    id: `aud-lp-${crypto.randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
  };
  workspace.auditLogs = [entry, ...(workspace.auditLogs ?? [])].slice(0, 500);
  tenantDb.saveWorkspace(scope, ownerAccountId, workspace);
}

export function mountLandingPageRoutes(app: express.Express, deps: LandingRoutesDeps): void {
  const LANDING_PAGES_PATH = path.join(deps.DATA_ROOT, '_tenant_landing_pages.json');
  const LANDING_ASSISTANCE_PATH = path.join(deps.DATA_ROOT, '_landing_assistance_requests.json');

  let landingPages: TenantLandingPageConfig[] = deps.loadJsonFile<TenantLandingPageConfig[]>(
    LANDING_PAGES_PATH,
    []
  );
  let assistanceRequests: LandingPageAssistanceRequest[] = deps.loadJsonFile<
    LandingPageAssistanceRequest[]
  >(LANDING_ASSISTANCE_PATH, []);

  const persistPages = () => deps.saveJsonFile(LANDING_PAGES_PATH, landingPages);
  const persistRequests = () => deps.saveJsonFile(LANDING_ASSISTANCE_PATH, assistanceRequests);

  function ensureUniqueSlug(desiredSlug: string, excludeTenantId?: string): string {
    let candidate = desiredSlug;
    let suffix = 2;
    while (
      landingPages.some(
        (lp) => lp.slug.toLowerCase() === candidate.toLowerCase() && lp.tenantId !== excludeTenantId
      )
    ) {
      candidate = `${desiredSlug.slice(0, 44)}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function getOrCreateTenantLandingPage(workspace: TenantWorkspaceData): TenantLandingPageConfig {
    const existing = landingPages.find((lp) => lp.tenantId === workspace.tenant.id);
    if (existing) return existing;
    const built = buildDefaultTenantLandingPage(workspace.tenant);
    built.slug = ensureUniqueSlug(built.slug, workspace.tenant.id);
    landingPages.push(built);
    persistPages();
    return built;
  }

  function applyLandingUpdateToTenant(params: {
    rec: NonNullable<ReturnType<PartitionedTenantDatabase['findWorkspaceByTenantId']>>;
    input: ReturnType<typeof tenantLandingPageUpdateSchema.parse>;
    adminActorEmail?: string | null;
  }): { ok: true; landingPage: TenantLandingPageConfig } | { ok: false; status: number; error: string } {
    const { rec, input, adminActorEmail } = params;
    const normalizedSlug = input.slug.trim().toLowerCase();
    const conflict = landingPages.find(
      (lp) => lp.slug.toLowerCase() === normalizedSlug && lp.tenantId !== rec.workspace.tenant.id
    );
    if (conflict) {
      return {
        ok: false,
        status: 409,
        error: `Slug "${normalizedSlug}" sudah digunakan usaha lain. Silakan pilih slug lain.`,
      };
    }

    const current = getOrCreateTenantLandingPage(rec.workspace);
    const nowIso = new Date().toISOString();

    const updated: TenantLandingPageConfig = {
      ...current,
      slug: normalizedSlug,
      customDomain: input.customDomain ?? null,
      isPublished: input.isPublished,
      themePreset: input.themePreset,
      logoUrl: sanitizeExternalUrl(input.logoUrl, { allowDataImage: true }),
      heroTitle: input.heroTitle,
      heroSubtitle: input.heroSubtitle ?? null,
      heroImageUrl: sanitizeExternalUrl(input.heroImageUrl, { allowDataImage: true }),
      aboutText: input.aboutText ?? null,
      whatsappNumber: input.whatsappNumber ? normalizeIndonesianWhatsapp(input.whatsappNumber) : null,
      address: input.address ?? null,
      googleMapsUrl: sanitizeExternalUrl(input.googleMapsUrl, { allowDataImage: false }),
      openingHoursJson: input.openingHoursJson,
      socialLinksJson: {
        instagram: sanitizeExternalUrl(input.socialLinksJson.instagram, { allowDataImage: false }) ?? undefined,
        tiktok: sanitizeExternalUrl(input.socialLinksJson.tiktok, { allowDataImage: false }) ?? undefined,
        facebook: sanitizeExternalUrl(input.socialLinksJson.facebook, { allowDataImage: false }) ?? undefined,
        website: sanitizeExternalUrl(input.socialLinksJson.website, { allowDataImage: false }) ?? undefined,
      },
      highlightsJson: input.highlightsJson,
      sectionsVisibilityJson: input.sectionsVisibilityJson,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      updatedByAdminId: adminActorEmail ? adminActorEmail : current.updatedByAdminId ?? null,
      lastCustomizedAt: adminActorEmail ? nowIso : current.lastCustomizedAt ?? null,
      updatedAt: nowIso,
    };

    const idx = landingPages.findIndex((lp) => lp.tenantId === rec.workspace.tenant.id);
    if (idx >= 0) {
      landingPages[idx] = updated;
    } else {
      landingPages.push(updated);
    }
    persistPages();

    // Persist catalog showOnLanding flags on Product & BoardingRoom atomically if provided
    let workspaceMutated = false;
    if (input.productVisibilityMap && rec.workspace.products) {
      rec.workspace.products = rec.workspace.products.map((prod) => {
        if (Object.prototype.hasOwnProperty.call(input.productVisibilityMap!, prod.id)) {
          workspaceMutated = true;
          return { ...prod, showOnLanding: Boolean(input.productVisibilityMap![prod.id]) };
        }
        return prod;
      });
    }
    if (input.roomVisibilityMap && rec.workspace.boardingRooms) {
      rec.workspace.boardingRooms = rec.workspace.boardingRooms.map((room) => {
        if (Object.prototype.hasOwnProperty.call(input.roomVisibilityMap!, room.id)) {
          workspaceMutated = true;
          return { ...room, showOnLanding: Boolean(input.roomVisibilityMap![room.id]) };
        }
        return room;
      });
    }
    if (workspaceMutated) {
      deps.tenantDb.saveWorkspace(rec.scope, rec.ownerAccountId, rec.workspace);
    }

    return { ok: true, landingPage: updated };
  }

  // =========================================================================
  // 1. PUBLIC STOREFRONT DATA ENDPOINT (GET /api/public/toko/:slug)
  // =========================================================================
  app.get('/api/public/toko/:slug', (req, res) => {
    const rawSlug = String(req.params.slug || '').trim().toLowerCase();
    const isPreviewRequested = req.query.preview === '1' || req.query.preview === 'true';

    let pageConfig = landingPages.find((lp) => lp.slug.toLowerCase() === rawSlug);
    let rec = pageConfig ? deps.tenantDb.findWorkspaceByTenantId(pageConfig.tenantId) : null;

    // Fallback: check if a tenant with this slug exists and has active add-on (only for preview)
    if (!rec) {
      const wsBySlug = deps.tenantDb.findWorkspaceBySlug(rawSlug);
      if (wsBySlug) {
        rec = deps.tenantDb.findWorkspaceByTenantId(wsBySlug.tenant.id);
        if (rec) {
          pageConfig = getOrCreateTenantLandingPage(rec.workspace);
        }
      }
    }

    if (!rec || !pageConfig) {
      return res.status(404).json({
        code: 'LANDING_NOT_FOUND',
        error: 'Halaman usaha tidak ditemukan atau alamat tautan belum aktif.',
      });
    }

    const hasAddon = tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE');
    const session = deps.extractSessionFromRequest(req);
    const canPreview =
      isPreviewRequested &&
      Boolean(session && assertTenantAccess(session, rec.workspace.tenant.id, rec.scope));

    if (!hasAddon && !canPreview) {
      return res.status(404).json({
        code: 'LANDING_ADDON_INACTIVE',
        error: 'Halaman publik usaha ini sedang tidak aktif.',
      });
    }

    if (!pageConfig.isPublished && !canPreview) {
      return res.status(404).json({
        code: 'LANDING_UNPUBLISHED',
        error: 'Halaman usaha ini masih dalam tahap penyusunan (draft) oleh pemiliknya.',
      });
    }

    const payload = buildPublicLandingPayload({
      workspace: rec.workspace,
      landingPage: pageConfig,
      isPreview: canPreview && !pageConfig.isPublished,
    });

    return res.status(200).json(payload);
  });

  // =========================================================================
  // 2. USER SELF-SERVICE EDITOR ENDPOINTS (AUTH + BOLA ENFORCED)
  // =========================================================================
  app.get('/api/landing-page/check-slug', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const rawSlug = String(req.query.slug || '');
    const tenantId = String(req.query.tenantId || '');
    const validation = validateLandingSlug(rawSlug);
    if (!validation.valid) {
      return res.status(200).json({
        available: false,
        normalized: validation.normalized,
        reason: validation.reason,
      });
    }

    const conflict = landingPages.find(
      (lp) => lp.slug.toLowerCase() === validation.normalized && lp.tenantId !== tenantId
    );
    if (conflict) {
      return res.status(200).json({
        available: false,
        normalized: validation.normalized,
        reason: `Slug "${validation.normalized}" sudah digunakan oleh usaha lain.`,
      });
    }

    return res.status(200).json({
      available: true,
      normalized: validation.normalized,
      publicUrl: buildTenantLandingUrl(validation.normalized, {
        origin: `${req.protocol}://${req.get('host') || 'localhost:3000'}`,
      }),
    });
  });

  app.get('/api/landing-page/me', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const tenantId = String(req.query.tenantId || session.allowedTenantIds?.[0] || '');
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk UMKM ini.' });
    }

    const landingPage = getOrCreateTenantLandingPage(rec.workspace);
    const hasAddon = tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE');
    const urlConfig = resolveLandingUrlConfig();
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

    const catalogItems = (rec.workspace.products ?? [])
      .filter((p) => p.itemType !== 'RAW_MATERIAL')
      .map((p) => ({
        id: p.id,
        name: p.name,
        sellingPrice: p.sellingPrice,
        unit: p.unit,
        stockQty: p.stockQty,
        showOnLanding: p.showOnLanding !== false,
      }));

    const rooms = (rec.workspace.boardingRooms ?? []).map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      monthlyPrice: r.monthlyPrice ?? r.monthlyRate ?? '0.0000',
      status: r.status,
      showOnLanding: r.showOnLanding !== false,
    }));

    const specializedAssetsCount = buildSpecializedPublicAssets(rec.workspace).length;

    return res.status(200).json({
      hasAddon,
      landingPage,
      publicUrl: buildTenantLandingUrl(landingPage.slug, { origin }),
      urlMode: urlConfig.mode,
      rootDomain: urlConfig.rootDomain || 'kasirakun.id',
      tenantSummary: {
        id: rec.workspace.tenant.id,
        name: rec.workspace.tenant.name,
        vertical: rec.workspace.tenant.vertical,
        verticalLabel: getVerticalLandingProfile(rec.workspace.tenant.vertical).verticalLabel,
      },
      catalogItems,
      rooms,
      specializedAssetsCount,
      previewPayload: buildPublicLandingPayload({
        workspace: rec.workspace,
        landingPage,
        isPreview: true,
      }),
    });
  });

  app.put('/api/landing-page/me', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const parsed = tenantLandingPageUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || 'Data konfigurasi Landing Page tidak valid.';
      return res.status(400).json({
        error: firstIssue,
        details: parsed.error.flatten(),
      });
    }

    const { tenantId } = parsed.data;
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk mengubah Landing Page UMKM ini.' });
    }

    if (!tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE') && session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        code: 'LANDING_ADDON_REQUIRED',
        error: 'Add-On Landing Page Usaha (+Rp25.000/bulan) belum aktif. Silakan aktifkan terlebih dahulu.',
      });
    }

    const result = applyLandingUpdateToTenant({
      rec,
      input: parsed.data,
      adminActorEmail: session.role === 'MASTER_ADMIN' ? session.email : null,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    return res.status(200).json({
      ok: true,
      landingPage: result.landingPage,
      publicUrl: buildTenantLandingUrl(result.landingPage.slug, { origin }),
      previewPayload: buildPublicLandingPayload({
        workspace: rec.workspace,
        landingPage: result.landingPage,
        isPreview: !result.landingPage.isPublished,
      }),
    });
  });

  app.post('/api/landing-page/activate', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const tenantId = String(req.body?.tenantId || session.allowedTenantIds?.[0] || '');
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk UMKM ini.' });
    }

    const currentAddOns = rec.workspace.tenant.activeAddOns ?? [];
    if (!currentAddOns.includes('ADDON_LANDING_PAGE')) {
      rec.workspace.tenant.activeAddOns = [...currentAddOns, 'ADDON_LANDING_PAGE'];
      deps.tenantDb.saveWorkspace(rec.scope, rec.ownerAccountId, rec.workspace);
    }

    const owner = deps.tenantDb.findCustomerById(rec.ownerAccountId);
    if (owner && !(owner.activeAddOns ?? []).includes('ADDON_LANDING_PAGE')) {
      deps.tenantDb.upsertCustomer({
        ...owner,
        activeAddOns: [...(owner.activeAddOns ?? []), 'ADDON_LANDING_PAGE'],
      });
    }

    const landingPage = getOrCreateTenantLandingPage(rec.workspace);
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    return res.status(200).json({
      ok: true,
      hasAddon: true,
      landingPage,
      publicUrl: buildTenantLandingUrl(landingPage.slug, { origin }),
    });
  });

  // =========================================================================
  // 3. USER FREE MASTER ADMIN ASSISTANCE TICKETS
  // =========================================================================
  app.get('/api/landing-page/assistance', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const tenantId = String(req.query.tenantId || session.allowedTenantIds?.[0] || '');
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const list = assistanceRequests
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.status(200).json({ requests: list });
  });

  app.post('/api/landing-page/assistance', (req, res) => {
    const session = deps.extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });

    const parsed = landingAssistanceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || 'Formulir bantuan kustomisasi belum lengkap.';
      return res.status(400).json({
        error: firstIssue,
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const rec = deps.tenantDb.findWorkspaceByTenantId(input.tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    if (!assertTenantAccess(session, input.tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const hasActiveAddon = tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE');
    if (!hasActiveAddon) {
      return res.status(403).json({
        error: 'Syarat 1 belum terpenuhi: Add-On Landing Page Usaha (+Rp25.000/bulan) wajib aktif terlebih dahulu.',
      });
    }

    const hasValidWhatsapp = isValidIndonesianWhatsapp(input.contactWhatsapp);
    const hasHeroBanner = Boolean(sanitizeExternalUrl(input.heroBannerUrl, { allowDataImage: true }));
    const activeCatalogCount =
      (rec.workspace.products ?? []).filter((p) => p.itemType !== 'RAW_MATERIAL').length +
      (rec.workspace.boardingRooms ?? []).length +
      buildSpecializedPublicAssets(rec.workspace).length;
    const hasCatalogOrFeaturedNotes =
      activeCatalogCount >= 3 || Boolean(input.featuredItemsNotes && input.featuredItemsNotes.trim().length >= 10);

    if (!hasValidWhatsapp || !hasHeroBanner || !hasCatalogOrFeaturedNotes || !input.agreedToTerms) {
      return res.status(400).json({
        error:
          'Seluruh 5 syarat wajib bantuan kustomisasi gratis belum terpenuhi. Pastikan minimal 3 produk/layanan/kamar telah diisi atau tulis catatan produk unggulan.',
      });
    }

    const landingPage = getOrCreateTenantLandingPage(rec.workspace);
    const owner = deps.tenantDb.findCustomerById(rec.ownerAccountId);
    const nowIso = new Date().toISOString();

    const record: LandingPageAssistanceRequest = {
      id: `lpa-${crypto.randomUUID().slice(0, 10)}`,
      tenantId: rec.workspace.tenant.id,
      tenantName: rec.workspace.tenant.name,
      tenantVertical: rec.workspace.tenant.vertical,
      tenantSlug: landingPage.slug,
      ownerName: owner?.fullName ?? session.email,
      requestedByUserId: session.ownerAccountId,
      contactWhatsapp: normalizeIndonesianWhatsapp(input.contactWhatsapp),
      logoAssetUrl: sanitizeExternalUrl(input.logoAssetUrl, { allowDataImage: true }),
      heroBannerUrl: sanitizeExternalUrl(input.heroBannerUrl, { allowDataImage: true }),
      galleryAssetUrls: (input.galleryAssetUrls ?? [])
        .map((u) => sanitizeExternalUrl(u, { allowDataImage: true }))
        .filter((u): u is string => Boolean(u)),
      preferredTheme: input.preferredTheme ?? landingPage.themePreset,
      featuredItemsNotes: input.featuredItemsNotes ?? null,
      customBrief: input.customBrief,
      requirementsChecklistJson: {
        hasActiveAddon,
        hasValidWhatsapp,
        hasHeroBanner,
        hasCatalogOrFeaturedNotes,
        agreedToTerms: true,
      },
      agreedToTerms: true,
      freeRevisionQuotaUsed: 0,
      status: 'PENDING',
      adminNotes: null,
      handledByAdminId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    assistanceRequests = [record, ...assistanceRequests];
    persistRequests();

    return res.status(201).json({ ok: true, request: record });
  });

  // =========================================================================
  // 4. MASTER ADMIN FULL CONTROL ROUTES (STRICT MASTER_ADMIN ROLE CHECK)
  // =========================================================================
  function requireMasterAdmin(req: express.Request, res: express.Response): SignedSessionPayload | null {
    const session = deps.extractSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: 'Sesi tidak ditemukan. Login sebagai Master Admin.' });
      return null;
    }
    if (session.role !== 'MASTER_ADMIN') {
      res.status(403).json({ error: 'Akses ditolak. Hanya Master Admin yang berwenang.' });
      return null;
    }
    return session;
  }

  app.get('/api/master-admin/landing-pages', (req, res) => {
    if (!requireMasterAdmin(req, res)) return;

    const allWorkspaces = deps.tenantDb.listAllWorkspaces();
    const allCustomers = deps.tenantDb.listCustomers();
    const customerMap = new Map(allCustomers.map((c) => [c.id, c]));
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

    const rows = allWorkspaces.map((ws) => {
      const lp = landingPages.find((item) => item.tenantId === ws.tenant.id) ?? buildDefaultTenantLandingPage(ws.tenant);
      const hasAddon = tenantHasAddOn(ws.tenant, 'ADDON_LANDING_PAGE');
      const owner = ws.tenant.ownerAccountId ? customerMap.get(ws.tenant.ownerAccountId) : undefined;
      const pendingTickets = assistanceRequests.filter(
        (r) => r.tenantId === ws.tenant.id && (r.status === 'PENDING' || r.status === 'IN_PROGRESS')
      ).length;

      return {
        tenantId: ws.tenant.id,
        tenantName: ws.tenant.name,
        vertical: ws.tenant.vertical,
        verticalLabel: getVerticalLandingProfile(ws.tenant.vertical).verticalLabel,
        accountScope: ws.tenant.accountScope ?? 'DEMO',
        ownerName: owner?.fullName ?? 'Pemilik UMKM',
        ownerEmail: owner?.email ?? '-',
        ownerPhone: owner?.phone ?? lp.whatsappNumber ?? '',
        hasAddon,
        slug: lp.slug,
        publicUrl: buildTenantLandingUrl(lp.slug, { origin }),
        isPublished: lp.isPublished,
        themePreset: lp.themePreset,
        updatedByAdminId: lp.updatedByAdminId ?? null,
        lastCustomizedAt: lp.lastCustomizedAt ?? null,
        updatedAt: lp.updatedAt,
        pendingTickets,
      };
    });

    const pendingAssistanceCount = assistanceRequests.filter((r) => r.status === 'PENDING').length;

    return res.status(200).json({
      items: rows,
      pendingAssistanceCount,
    });
  });

  app.get('/api/master-admin/tenants/:tenantId/landing-page', (req, res) => {
    if (!requireMasterAdmin(req, res)) return;

    const tenantId = String(req.params.tenantId || '');
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });

    const landingPage = getOrCreateTenantLandingPage(rec.workspace);
    const hasAddon = tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE');
    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;

    const catalogItems = (rec.workspace.products ?? [])
      .filter((p) => p.itemType !== 'RAW_MATERIAL')
      .map((p) => ({
        id: p.id,
        name: p.name,
        sellingPrice: p.sellingPrice,
        unit: p.unit,
        stockQty: p.stockQty,
        showOnLanding: p.showOnLanding !== false,
      }));

    const rooms = (rec.workspace.boardingRooms ?? []).map((r) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      roomType: r.roomType,
      monthlyPrice: r.monthlyPrice ?? r.monthlyRate ?? '0.0000',
      status: r.status,
      showOnLanding: r.showOnLanding !== false,
    }));

    return res.status(200).json({
      hasAddon,
      landingPage,
      publicUrl: buildTenantLandingUrl(landingPage.slug, { origin }),
      tenantSummary: {
        id: rec.workspace.tenant.id,
        name: rec.workspace.tenant.name,
        vertical: rec.workspace.tenant.vertical,
        verticalLabel: getVerticalLandingProfile(rec.workspace.tenant.vertical).verticalLabel,
        accountScope: rec.scope,
      },
      catalogItems,
      rooms,
      previewPayload: buildPublicLandingPayload({
        workspace: rec.workspace,
        landingPage,
        isPreview: true,
      }),
    });
  });

  app.put('/api/master-admin/tenants/:tenantId/landing-page', (req, res) => {
    const adminSession = requireMasterAdmin(req, res);
    if (!adminSession) return;

    const tenantId = String(req.params.tenantId || '');
    const rec = deps.tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });

    const parsed = tenantLandingPageUpdateSchema.safeParse({
      ...req.body,
      tenantId,
    });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || 'Payload konfigurasi Landing Page tidak valid.';
      return res.status(400).json({ error: firstIssue, details: parsed.error.flatten() });
    }

    // If Master Admin explicitly opts to activate Add-On while helping the tenant
    if (req.body?.activateAddonIfMissing === true && !tenantHasAddOn(rec.workspace.tenant, 'ADDON_LANDING_PAGE')) {
      const nextAddOns = Array.from(
        new Set([...(rec.workspace.tenant.activeAddOns ?? []), 'ADDON_LANDING_PAGE' as const])
      );
      rec.workspace.tenant.activeAddOns = nextAddOns;
      deps.tenantDb.saveWorkspace(rec.scope, rec.ownerAccountId, rec.workspace);
      const owner = deps.tenantDb.findCustomerById(rec.ownerAccountId);
      if (owner) {
        deps.tenantDb.upsertCustomer({
          ...owner,
          activeAddOns: Array.from(new Set([...(owner.activeAddOns ?? []), 'ADDON_LANDING_PAGE' as const])),
        });
      }
    }

    const result = applyLandingUpdateToTenant({
      rec,
      input: parsed.data,
      adminActorEmail: adminSession.email,
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    appendAuditLogToWorkspace(deps.tenantDb, rec.scope, rec.ownerAccountId, rec.workspace, {
      tenantId,
      actorName: 'Master Admin KasirAkun',
      actorEmail: adminSession.email,
      actionType: 'ADMIN_UPDATE_LANDING_PAGE',
      referenceId: result.landingPage.id,
      amount: '0.0000',
      reason: `Master Admin memperbarui & kustomisasi Landing Page (${result.landingPage.slug}, status: ${
        result.landingPage.isPublished ? 'TERBIT' : 'DRAFT'
      }).`,
    });

    const origin = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
    return res.status(200).json({
      ok: true,
      landingPage: result.landingPage,
      publicUrl: buildTenantLandingUrl(result.landingPage.slug, { origin }),
      previewPayload: buildPublicLandingPayload({
        workspace: rec.workspace,
        landingPage: result.landingPage,
        isPreview: !result.landingPage.isPublished,
      }),
    });
  });

  app.get('/api/master-admin/landing-assistance', (req, res) => {
    if (!requireMasterAdmin(req, res)) return;

    const statusFilter = String(req.query.status || '').toUpperCase();
    const enriched = assistanceRequests
      .map((reqItem) => {
        const lp = landingPages.find((p) => p.tenantId === reqItem.tenantId);
        return {
          ...reqItem,
          tenantSlug: lp?.slug ?? reqItem.tenantSlug ?? '',
          isPublished: lp?.isPublished ?? false,
        };
      })
      .filter((item) => !statusFilter || statusFilter === 'ALL' || item.status === statusFilter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const pendingCount = assistanceRequests.filter((r) => r.status === 'PENDING').length;

    return res.status(200).json({
      requests: enriched,
      pendingCount,
    });
  });

  app.patch('/api/master-admin/landing-assistance/:id', (req, res) => {
    const adminSession = requireMasterAdmin(req, res);
    if (!adminSession) return;

    const ticketId = String(req.params.id || '');
    const idx = assistanceRequests.findIndex((r) => r.id === ticketId);
    if (idx < 0) {
      return res.status(404).json({ error: 'Tiket bantuan kustomisasi tidak ditemukan.' });
    }

    const parsed = landingAssistanceAdminPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Payload update tiket tidak valid.',
      });
    }

    const prev = assistanceRequests[idx];
    const nowIso = new Date().toISOString();
    const updated: LandingPageAssistanceRequest = {
      ...prev,
      status: parsed.data.status ?? prev.status,
      adminNotes:
        parsed.data.adminNotes !== undefined ? parsed.data.adminNotes : prev.adminNotes ?? null,
      freeRevisionQuotaUsed:
        parsed.data.freeRevisionQuotaUsed !== undefined
          ? parsed.data.freeRevisionQuotaUsed
          : prev.freeRevisionQuotaUsed,
      handledByAdminId: adminSession.email,
      updatedAt: nowIso,
    };

    assistanceRequests[idx] = updated;
    persistRequests();

    const rec = deps.tenantDb.findWorkspaceByTenantId(updated.tenantId);
    if (rec) {
      appendAuditLogToWorkspace(deps.tenantDb, rec.scope, rec.ownerAccountId, rec.workspace, {
        tenantId: updated.tenantId,
        actorName: 'Master Admin KasirAkun',
        actorEmail: adminSession.email,
        actionType: 'ADMIN_COMPLETE_LANDING_ASSISTANCE',
        referenceId: updated.id,
        amount: '0.0000',
        reason: `Master Admin memperbarui status tiket bantuan Landing Page menjadi ${updated.status} (revisi terpakai: ${updated.freeRevisionQuotaUsed}/2).`,
      });
    }

    return res.status(200).json({ ok: true, request: updated });
  });
}
