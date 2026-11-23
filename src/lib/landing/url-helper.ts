/**
 * KasirAkun UMKM — Sub-path Now & Subdomain-Ready Landing Page URL Helper,
 * Strict DNS-Safe Slug Validation, External URL XSS Sanitization & Zod Schemas.
 *
 * Supports seamless zero-downtime migration from `/toko/[slug]` (SUBPATH)
 * to `https://[slug].[ROOT_DOMAIN]` (SUBDOMAIN) simply by setting env vars:
 * - VITE_LANDING_URL_MODE / NEXT_PUBLIC_LANDING_URL_MODE ("SUBPATH" | "SUBDOMAIN")
 * - VITE_ROOT_DOMAIN / NEXT_PUBLIC_ROOT_DOMAIN (e.g. "kasirakun.id")
 */

import { z } from 'zod';
import type { LandingThemePreset } from '../../types/domain.ts';

export type LandingUrlMode = 'SUBPATH' | 'SUBDOMAIN';

export const LANDING_THEME_PRESET_CODES = [
  'WARM_EMERALD',
  'TERRACOTTA_CRAFT',
  'SLATE_NAVY',
  'ORGANIC_SAGE',
] as const;

export const LANDING_ASSISTANCE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'NEEDS_INFO',
] as const;

export const RESERVED_LANDING_SLUGS = new Set<string>([
  'www',
  'app',
  'api',
  'admin',
  'master',
  'master-admin',
  'dashboard',
  'login',
  'register',
  'signup',
  'signin',
  'logout',
  'toko',
  'order',
  'pos',
  'kds',
  'kitchen',
  'settings',
  'billing',
  'demo',
  'onboarding',
  'contracts',
  'returns',
  'inventory',
  'catalog',
  'accounting',
  'tax',
  'staff',
  'crm',
  'pricing',
  'support',
  'help',
  'docs',
  'blog',
  'mail',
  'cdn',
  'static',
  'assets',
  'public',
  'status',
  'health',
  'webhook',
  'webhooks',
  'customer-display',
]);

export const DNS_SAFE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

export function normalizeSlugCandidate(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function isReservedLandingSlug(slug: string): boolean {
  return RESERVED_LANDING_SLUGS.has(slug.trim().toLowerCase());
}

export function validateLandingSlug(slug: string): { valid: boolean; reason?: string; normalized: string } {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 50) {
    return { valid: false, normalized, reason: 'Slug wajib 3 sampai 50 karakter.' };
  }
  if (!DNS_SAFE_SLUG_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      reason: 'Slug hanya boleh huruf kecil (a-z), angka (0-9), dan tanda hubung (-) tanpa diawali/diakhiri tanda hubung.',
    };
  }
  if (normalized.includes('--')) {
    return {
      valid: false,
      normalized,
      reason: 'Slug tidak boleh mengandung tanda hubung ganda (--).',
    };
  }
  if (isReservedLandingSlug(normalized)) {
    return {
      valid: false,
      normalized,
      reason: `Slug "${normalized}" dicadangkan oleh sistem. Gunakan nama usaha yang lebih spesifik.`,
    };
  }
  return { valid: true, normalized };
}

export const landingSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug minimal 3 karakter.')
  .max(50, 'Slug maksimal 50 karakter.')
  .regex(
    DNS_SAFE_SLUG_REGEX,
    'Slug hanya boleh huruf kecil, angka, dan tanda hubung (-) tanpa diawali/diakhiri tanda hubung.'
  )
  .refine((val) => !val.includes('--'), 'Slug tidak boleh mengandung tanda hubung ganda (--).')
  .refine((val) => !isReservedLandingSlug(val), 'Slug ini dicadangkan oleh sistem. Pilih slug lain.');

/**
 * Sanitizes external URLs and image data URLs to prevent XSS (`javascript:`, `vbscript:`, unsafe `data:`).
 * Allows:
 * - Empty string / null / undefined -> null
 * - Relative internal paths (`/assets/...`, `/toko/...`)
 * - Valid `https://` and `http://` URLs
 * - Bounded `data:image/(png|jpeg|jpg|webp);base64,...` for uploaded brand/hero assets
 */
export function sanitizeExternalUrl(
  raw: string | null | undefined,
  options?: { allowDataImage?: boolean; maxDataImageLength?: number }
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('data:text/') ||
    lower.startsWith('data:image/svg')
  ) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) return null;
    return trimmed;
  }

  if (options?.allowDataImage && lower.startsWith('data:image/')) {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed);
    const maxLen = options.maxDataImageLength ?? 1_800_000; // ~1.3MB raw binary
    if (match && trimmed.length <= maxLen) {
      return trimmed;
    }
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const safeExternalUrlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    return val;
  })
  .refine(
    (val) => {
      if (!val) return true;
      return sanitizeExternalUrl(val, { allowDataImage: false }) !== null;
    },
    { message: 'URL tidak valid atau tidak aman. Gunakan alamat https:// yang benar.' }
  );

export const safeImageUrlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    return val;
  })
  .refine(
    (val) => {
      if (!val) return true;
      return sanitizeExternalUrl(val, { allowDataImage: true }) !== null;
    },
    { message: 'URL gambar tidak valid. Gunakan link https:// atau unggah file JPG/PNG/WebP.' }
  );

export function normalizeIndonesianWhatsapp(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function isValidIndonesianWhatsapp(raw: string | null | undefined): boolean {
  const normalized = normalizeIndonesianWhatsapp(raw);
  return /^62\d{8,14}$/.test(normalized);
}

export function buildWhatsappDirectUrl(phoneRaw: string | null | undefined, message: string): string | null {
  const phone = normalizeIndonesianWhatsapp(phoneRaw);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export interface LandingUrlRuntimeConfig {
  mode: LandingUrlMode;
  rootDomain: string;
}

export function resolveLandingUrlConfig(envOverride?: {
  mode?: string;
  rootDomain?: string;
}): LandingUrlRuntimeConfig {
  let rawMode = envOverride?.mode;
  let rawRoot = envOverride?.rootDomain;

  if (!rawMode) {
    try {
      const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
      if (metaEnv) {
        rawMode = metaEnv.VITE_LANDING_URL_MODE || metaEnv.NEXT_PUBLIC_LANDING_URL_MODE;
        rawRoot = rawRoot ?? (metaEnv.VITE_ROOT_DOMAIN || metaEnv.NEXT_PUBLIC_ROOT_DOMAIN);
      }
    } catch {
      // Ignore in non-Vite Node runtime
    }
  }

  if (!rawMode && typeof process !== 'undefined' && process.env) {
    rawMode =
      process.env.VITE_LANDING_URL_MODE ||
      process.env.NEXT_PUBLIC_LANDING_URL_MODE ||
      process.env.LANDING_URL_MODE;
    rawRoot =
      rawRoot ??
      (process.env.VITE_ROOT_DOMAIN ||
        process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
        process.env.ROOT_DOMAIN);
  }

  const cleanRoot = (rawRoot || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');

  const mode: LandingUrlMode =
    (rawMode || '').trim().toUpperCase() === 'SUBDOMAIN' && cleanRoot.length > 0
      ? 'SUBDOMAIN'
      : 'SUBPATH';

  return { mode, rootDomain: cleanRoot };
}

/**
 * Generates the canonical public URL for a UMKM tenant landing page.
 * - SUBPATH mode (default): `{origin}/toko/{slug}` (or `/toko/{slug}` if origin omitted)
 * - SUBDOMAIN mode: `https://{slug}.{rootDomain}`
 */
export function buildTenantLandingUrl(
  slug: string,
  options?: { origin?: string; mode?: string; rootDomain?: string }
): string {
  const safeSlug = normalizeSlugCandidate(slug);
  const cfg = resolveLandingUrlConfig({
    mode: options?.mode,
    rootDomain: options?.rootDomain,
  });

  if (cfg.mode === 'SUBDOMAIN' && cfg.rootDomain) {
    return `https://${safeSlug}.${cfg.rootDomain}`;
  }

  const origin =
    options?.origin ??
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  const cleanOrigin = origin.replace(/\/+$/, '');
  return cleanOrigin ? `${cleanOrigin}/toko/${safeSlug}` : `/toko/${safeSlug}`;
}

export function buildSubdomainPreviewAddress(slug: string, rootDomain = 'kasirakun.id'): string {
  const safeSlug = normalizeSlugCandidate(slug) || 'nama-usaha';
  const cleanRoot = rootDomain.trim().toLowerCase() || 'kasirakun.id';
  return `${safeSlug}.${cleanRoot}`;
}

const IGNORED_PREVIEW_HOST_SUFFIXES = [
  '.vercel.app',
  '.up.railway.app',
  '.run.app',
  '.ai.studio',
  '.googleusercontent.com',
  '.local',
];

export const IGNORED_ROUTING_PATH_PREFIXES = [
  '/api/',
  '/_next/',
  '/assets/',
  '/@',
  '/src/',
  '/node_modules/',
  '/favicon',
  '/manifest',
  '/sw.js',
  '/workbox-',
] as const;

/**
 * Safely extracts the primary hostname (without port) from a raw `Host` or
 * comma-separated `X-Forwarded-Host` header.
 */
export function parseFirstHostHeader(rawHost: string | undefined | null): string {
  if (!rawHost) return '';
  const firstEntry = rawHost.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!firstEntry) return '';
  // Strip IPv6 brackets or :port suffix safely
  if (firstEntry.startsWith('[')) {
    const closeIdx = firstEntry.indexOf(']');
    return closeIdx > 0 ? firstEntry.slice(1, closeIdx) : '';
  }
  return firstEntry.split(':')[0] ?? '';
}

/**
 * Returns true if the pathname belongs to an API route, build asset, service worker,
 * or static file that must never be rewritten by tenant subdomain middleware.
 */
export function isIgnoredRoutingPath(pathname: string): boolean {
  const cleanPath = pathname || '/';
  if (IGNORED_ROUTING_PATH_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))) {
    return true;
  }
  return /\.[a-z0-9]{2,6}$/i.test(cleanPath);
}

/**
 * Extracts a DNS-safe tenant slug from a canonical subpath route (`/toko/[slug]...`).
 * Rejects reserved slugs, traversal attempts, and invalid characters.
 */
export function parseSubpathTenantSlug(pathname: string): {
  slug: string;
  trailingPath: string;
} | null {
  if (!pathname.startsWith('/toko/')) return null;
  const remainder = pathname.slice('/toko/'.length);
  const slashIdx = remainder.indexOf('/');
  const rawSlug = slashIdx === -1 ? remainder : remainder.slice(0, slashIdx);
  const trailingPath = slashIdx === -1 ? '' : remainder.slice(slashIdx);

  if (!rawSlug || rawSlug.includes('..') || trailingPath.includes('..')) {
    return null;
  }

  const check = validateLandingSlug(rawSlug);
  if (!check.valid) return null;

  return {
    slug: check.normalized,
    trailingPath,
  };
}

/**
 * Extracts a tenant slug subdomain when hosted on a custom ROOT_DOMAIN.
 * Safely returns `null` for localhost, raw IP addresses, hosting preview domains,
 * bare root domain, or reserved system subdomains (`www`, `app`, `api`, `admin`).
 */
export function extractSubdomainFromHost(
  hostHeader: string | undefined | null,
  rootDomain: string | undefined | null
): string | null {
  if (!hostHeader || !rootDomain) return null;
  const cleanRoot = rootDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '');
  if (!cleanRoot || !cleanRoot.includes('.')) return null;

  const hostname = parseFirstHostHeader(hostHeader);
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  ) {
    return null;
  }

  for (const suffix of IGNORED_PREVIEW_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return null;
    }
  }

  if (hostname === cleanRoot || hostname === `www.${cleanRoot}`) {
    return null;
  }

  const expectedSuffix = `.${cleanRoot}`;
  if (!hostname.endsWith(expectedSuffix)) {
    return null;
  }

  const sub = hostname.slice(0, -expectedSuffix.length);
  // Only allow single-level subdomain matching strict DNS-safe slug
  if (!sub || sub.includes('.')) return null;

  const check = validateLandingSlug(sub);
  return check.valid ? check.normalized : null;
}

export type SubdomainRoutingDecision =
  | {
      action: 'PASS_THROUGH';
      reason:
        | 'IGNORED_PATH'
        | 'NO_ROOT_DOMAIN'
        | 'NOT_TENANT_SUBDOMAIN'
        | 'ALREADY_AT_TENANT_PATH';
    }
  | {
      action: 'REWRITE';
      tenantSlug: string;
      rewritePath: string;
      originalPath: string;
    }
  | {
      action: 'REDIRECT_CANONICAL';
      tenantSlug: string;
      redirectUrl: string;
      statusCode: 301;
    };

/**
 * Pure subdomain-to-tenant-slug rewrite and canonical redirect decision engine.
 * Shared by `src/middleware.ts` (Express runtime & future Edge/Next.js migration) and unit tests.
 */
export function resolveSubdomainRoutingDecision(params: {
  hostHeader: string | undefined | null;
  pathname: string;
  search?: string;
  method?: string;
  envOverride?: { mode?: string; rootDomain?: string };
}): SubdomainRoutingDecision {
  const pathname = params.pathname || '/';
  const search = params.search && params.search.startsWith('?')
    ? params.search
    : params.search
      ? `?${params.search}`
      : '';
  const method = (params.method || 'GET').toUpperCase();

  if (isIgnoredRoutingPath(pathname)) {
    return { action: 'PASS_THROUGH', reason: 'IGNORED_PATH' };
  }

  const cfg = resolveLandingUrlConfig(params.envOverride);
  if (!cfg.rootDomain) {
    return { action: 'PASS_THROUGH', reason: 'NO_ROOT_DOMAIN' };
  }

  const subdomainSlug = extractSubdomainFromHost(params.hostHeader, cfg.rootDomain);

  if (subdomainSlug) {
    // Already targeting `/toko/{subdomainSlug}` directly -> pass through without double-prefixing
    const existingSubpath = parseSubpathTenantSlug(pathname);
    if (existingSubpath && existingSubpath.slug === subdomainSlug) {
      return { action: 'PASS_THROUGH', reason: 'ALREADY_AT_TENANT_PATH' };
    }

    // Prevent path traversal while preserving clean nested storefront paths
    const cleanSubpath = pathname === '/' || pathname.includes('..') ? '' : pathname;
    const rewritePath = `/toko/${subdomainSlug}${cleanSubpath}${search}`;

    return {
      action: 'REWRITE',
      tenantSlug: subdomainSlug,
      rewritePath,
      originalPath: `${pathname}${search}`,
    };
  }

  // Root-domain `/toko/[slug]` -> 301 canonical redirect to `https://[slug].[rootDomain]` in SUBDOMAIN mode
  if (cfg.mode === 'SUBDOMAIN' && method === 'GET' && pathname.startsWith('/toko/')) {
    const parsedSubpath = parseSubpathTenantSlug(pathname);
    if (parsedSubpath) {
      const targetUrl = `https://${parsedSubpath.slug}.${cfg.rootDomain}${parsedSubpath.trailingPath}${search}`;
      return {
        action: 'REDIRECT_CANONICAL',
        tenantSlug: parsedSubpath.slug,
        redirectUrl: targetUrl,
        statusCode: 301,
      };
    }
  }

  return { action: 'PASS_THROUGH', reason: 'NOT_TENANT_SUBDOMAIN' };
}

// =========================================================================
// ZOD SCHEMAS FOR API VALIDATION (USER EDITOR, ASSISTANCE, MASTER ADMIN)
// =========================================================================

export const openingHourItemSchema = z.object({
  day: z.string().trim().min(2).max(40),
  hours: z.string().trim().min(1).max(60),
  isClosed: z.boolean().optional(),
});

export const socialLinksSchema = z.object({
  instagram: safeExternalUrlSchema,
  tiktok: safeExternalUrlSchema,
  facebook: safeExternalUrlSchema,
  website: safeExternalUrlSchema,
});

export const sectionsVisibilitySchema = z.object({
  hero: z.boolean(),
  catalog: z.boolean(),
  highlights: z.boolean(),
  about: z.boolean(),
  location: z.boolean(),
  contact: z.boolean(),
});

export const tenantLandingPageUpdateSchema = z.object({
  tenantId: z.string().trim().min(1, 'Tenant ID wajib diisi.'),
  slug: landingSlugSchema,
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(150)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  isPublished: z.boolean(),
  themePreset: z.enum(LANDING_THEME_PRESET_CODES),
  logoUrl: safeImageUrlSchema,
  heroTitle: z.string().trim().min(3, 'Judul utama minimal 3 karakter.').max(180),
  heroSubtitle: z.string().trim().max(400).optional().nullable(),
  heroImageUrl: safeImageUrlSchema,
  aboutText: z.string().trim().max(2500).optional().nullable(),
  whatsappNumber: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .refine((v) => !v || isValidIndonesianWhatsapp(v), {
      message: 'Nomor WhatsApp tidak valid. Contoh: 081234567890 atau 6281234567890.',
    }),
  address: z.string().trim().max(500).optional().nullable(),
  googleMapsUrl: safeExternalUrlSchema,
  openingHoursJson: z.array(openingHourItemSchema).max(14).default([]),
  socialLinksJson: socialLinksSchema.default({
    instagram: null,
    tiktok: null,
    facebook: null,
    website: null,
  }),
  highlightsJson: z
    .array(z.string().trim().min(2).max(140))
    .max(6)
    .default([]),
  sectionsVisibilityJson: sectionsVisibilitySchema.default({
    hero: true,
    catalog: true,
    highlights: true,
    about: true,
    location: true,
    contact: true,
  }),
  seoTitle: z.string().trim().max(180).optional().nullable(),
  seoDescription: z.string().trim().max(320).optional().nullable(),
  // Optional bulk catalog showOnLanding toggles saved atomically alongside landing page config
  productVisibilityMap: z.record(z.string(), z.boolean()).optional(),
  roomVisibilityMap: z.record(z.string(), z.boolean()).optional(),
});

export const landingAssistanceCreateSchema = z.object({
  tenantId: z.string().trim().min(1),
  contactWhatsapp: z
    .string()
    .trim()
    .min(9, 'Nomor WhatsApp aktif wajib diisi.')
    .max(30)
    .refine((v) => isValidIndonesianWhatsapp(v), {
      message: 'Format nomor WhatsApp tidak valid. Gunakan format 08xx atau 628xx.',
    }),
  logoAssetUrl: safeImageUrlSchema,
  heroBannerUrl: safeImageUrlSchema.refine((v) => Boolean(v && v.length > 0), {
    message: 'Foto utama usaha / banner hero wajib diisi sebagai syarat bantuan gratis.',
  }),
  galleryAssetUrls: z.array(safeImageUrlSchema).max(6).default([]),
  preferredTheme: z.enum(LANDING_THEME_PRESET_CODES).optional().nullable(),
  featuredItemsNotes: z.string().trim().max(1500).optional().nullable(),
  customBrief: z
    .string()
    .trim()
    .min(15, 'Mohon tulis catatan singkat konsep / kebutuhan halaman minimal 15 karakter.')
    .max(2500),
  agreedToTerms: z.literal(true, {
    message: 'Anda wajib menyetujui ketentuan bantuan kustomisasi gratis (1x setup + 2x revisi ringan).',
  }),
});

export const landingAssistanceAdminPatchSchema = z.object({
  status: z.enum(LANDING_ASSISTANCE_STATUSES).optional(),
  adminNotes: z.string().trim().max(2000).optional().nullable(),
  freeRevisionQuotaUsed: z.number().int().min(0).max(5).optional(),
});

export type TenantLandingPageUpdateInput = z.infer<typeof tenantLandingPageUpdateSchema>;
export type LandingAssistanceCreateInput = z.infer<typeof landingAssistanceCreateSchema>;
export type LandingAssistanceAdminPatchInput = z.infer<typeof landingAssistanceAdminPatchSchema>;
export type { LandingThemePreset };
