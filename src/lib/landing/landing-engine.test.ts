import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTenantLandingUrl,
  extractSubdomainFromHost,
  landingAssistanceCreateSchema,
  landingSlugSchema,
  normalizeIndonesianWhatsapp,
  parseFirstHostHeader,
  parseSubpathTenantSlug,
  resolveSubdomainRoutingDecision,
  sanitizeExternalUrl,
  tenantLandingPageUpdateSchema,
  validateLandingSlug,
} from './url-helper';
import {
  buildDefaultTenantLandingPage,
  getVerticalLandingProfile,
  LANDING_THEME_PRESETS,
} from './landing-presets';
import {
  config as middlewareConfig,
  createSubdomainRewriteMiddleware,
  middleware as subdomainMiddleware,
} from '../../middleware';
import type { BusinessVertical } from '../../types/domain';

const ALL_22_ACTIVE_VERTICALS: BusinessVertical[] = [
  'WARUNG_SEMBAKO',
  'TOKO_RETAIL',
  'TOKO_FASHION',
  'TOKO_BANGUNAN',
  'MANUFAKTUR_KECIL',
  'PETERNAKAN_PERTANIAN',
  'KEDAI_MAKAN',
  'RESTORAN',
  'BAKERY_CATERING',
  'LAUNDRY',
  'CUCI_KENDARAAN',
  'BARBERSHOP',
  'SALON_KECANTIKAN',
  'SPA_WELLNESS',
  'PET_SHOP',
  'BIMBEL_KURSUS_GYM',
  'FREELANCE',
  'RENTAL_KENDARAAN',
  'SEWA_LAPANGAN',
  'HOMESTAY_VILLA',
  'KOST_KONTRAKAN',
  'SEWA_GARASI',
];

test('slug validation enforces DNS-safe rules and blocks reserved words', () => {
  assert.equal(validateLandingSlug('warung-berkah-jaya').valid, true);
  assert.equal(validateLandingSlug('kost-melati-01').valid, true);

  // Too short / invalid chars / leading-trailing hyphen / double hyphen
  assert.equal(validateLandingSlug('ab').valid, false);
  assert.equal(validateLandingSlug('-warung-jaya').valid, false);
  assert.equal(validateLandingSlug('warung-jaya-').valid, false);
  assert.equal(validateLandingSlug('warung--jaya').valid, false);
  assert.equal(validateLandingSlug('warung_jaya').valid, false);
  assert.equal(validateLandingSlug('warung.jaya').valid, false);

  // Reserved words
  for (const reserved of ['www', 'app', 'api', 'admin', 'master-admin', 'dashboard', 'login', 'register', 'toko']) {
    assert.equal(validateLandingSlug(reserved).valid, false, `Expected "${reserved}" to be rejected`);
    assert.equal(landingSlugSchema.safeParse(reserved).success, false);
  }
});

test('buildTenantLandingUrl switches cleanly between SUBPATH and SUBDOMAIN modes', () => {
  const subpath = buildTenantLandingUrl('warung-berkah', {
    origin: 'https://kasirakun.example.com',
    mode: 'SUBPATH',
  });
  assert.equal(subpath, 'https://kasirakun.example.com/toko/warung-berkah');

  const subdomain = buildTenantLandingUrl('warung-berkah', {
    origin: 'https://kasirakun.id',
    mode: 'SUBDOMAIN',
    rootDomain: 'kasirakun.id',
  });
  assert.equal(subdomain, 'https://warung-berkah.kasirakun.id');

  // Falls back safely to SUBPATH if SUBDOMAIN mode has empty rootDomain
  const fallback = buildTenantLandingUrl('warung-berkah', {
    origin: 'https://preview.run.app',
    mode: 'SUBDOMAIN',
    rootDomain: '',
  });
  assert.equal(fallback, 'https://preview.run.app/toko/warung-berkah');
});

test('extractSubdomainFromHost ignores localhost, preview domains, root domain, and reserved subdomains', () => {
  assert.equal(extractSubdomainFromHost('warung-berkah.kasirakun.id', 'kasirakun.id'), 'warung-berkah');
  assert.equal(extractSubdomainFromHost('kost-melati.kasirakun.id:443', 'kasirakun.id'), 'kost-melati');

  // Must ignore root, www, reserved, localhost, vercel/railway/run.app
  assert.equal(extractSubdomainFromHost('kasirakun.id', 'kasirakun.id'), null);
  assert.equal(extractSubdomainFromHost('www.kasirakun.id', 'kasirakun.id'), null);
  assert.equal(extractSubdomainFromHost('app.kasirakun.id', 'kasirakun.id'), null);
  assert.equal(extractSubdomainFromHost('admin.kasirakun.id', 'kasirakun.id'), null);
  assert.equal(extractSubdomainFromHost('localhost:3000', 'kasirakun.id'), null);
  assert.equal(extractSubdomainFromHost('my-app.vercel.app', 'vercel.app'), null);
  assert.equal(extractSubdomainFromHost('ais-dev-123.run.app', 'run.app'), null);
  assert.equal(extractSubdomainFromHost('a.b.kasirakun.id', 'kasirakun.id'), null);
});

test('sanitizeExternalUrl blocks javascript:, vbscript:, and SVG data URIs while allowing safe URLs', () => {
  assert.equal(sanitizeExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeExternalUrl('  JaVaScRiPt:void(0)  '), null);
  assert.equal(sanitizeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(sanitizeExternalUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(sanitizeExternalUrl('//evil.com/x'), null);

  assert.equal(sanitizeExternalUrl('https://maps.google.com/?q=Jakarta'), 'https://maps.google.com/?q=Jakarta');
  assert.equal(sanitizeExternalUrl('/assets/banner.jpg'), '/assets/banner.jpg');
  assert.equal(
    sanitizeExternalUrl('data:image/png;base64,iVBORw0KGgo=', { allowDataImage: true }),
    'data:image/png;base64,iVBORw0KGgo='
  );
  assert.equal(
    sanitizeExternalUrl('data:image/png;base64,iVBORw0KGgo=', { allowDataImage: false }),
    null
  );
});

test('WhatsApp normalization formats Indonesian numbers cleanly', () => {
  assert.equal(normalizeIndonesianWhatsapp('0812-3456-7890'), '6281234567890');
  assert.equal(normalizeIndonesianWhatsapp('+62 812 3456 7890'), '6281234567890');
  assert.equal(normalizeIndonesianWhatsapp('81234567890'), '6281234567890');
});

test('All 22 active UMKM verticals have tailored landing profiles, valid themes, and default builders', () => {
  assert.equal(ALL_22_ACTIVE_VERTICALS.length, 22);
  for (const vertical of ALL_22_ACTIVE_VERTICALS) {
    const profile = getVerticalLandingProfile(vertical);
    assert.equal(profile.vertical, vertical);
    assert.ok(profile.catalogSectionTitle.length > 5);
    assert.ok(profile.primaryCtaLabel.length > 5);
    assert.ok(LANDING_THEME_PRESETS[profile.recommendedTheme]);
    assert.ok(profile.waPrimaryGreeting('Toko Contoh').includes('Toko Contoh'));
    assert.ok(profile.waItemMessage('Toko Contoh', 'Produk A', 'Rp10.000').includes('Produk A'));

    const def = buildDefaultTenantLandingPage({
      id: 't-123456',
      name: `Usaha ${vertical}`,
      slug: `usaha-${vertical.toLowerCase().replace(/_/g, '-')}`,
      vertical,
      address: 'Jl. Merdeka No. 1',
      settings: {
        autoPrintQrOrders: false,
        thermalPaperWidth: '58mm',
        qrisMdrRate: '0.007',
      },
    });
    assert.equal(validateLandingSlug(def.slug).valid, true, `Default slug invalid for ${vertical}: ${def.slug}`);
  }
});

test('Zod schemas reject unsafe URLs and incomplete assistance requests', () => {
  const badUpdate = tenantLandingPageUpdateSchema.safeParse({
    tenantId: 't-1',
    slug: 'toko-segar',
    isPublished: true,
    themePreset: 'WARM_EMERALD',
    heroTitle: 'Toko Segar',
    googleMapsUrl: 'javascript:alert(1)',
  });
  assert.equal(badUpdate.success, false);

  const badAssist = landingAssistanceCreateSchema.safeParse({
    tenantId: 't-1',
    contactWhatsapp: '081234567890',
    heroBannerUrl: '',
    customBrief: 'Tolong bantu buat landing page yang rapi untuk warung kami.',
    agreedToTerms: false,
  });
  assert.equal(badAssist.success, false);

  const goodAssist = landingAssistanceCreateSchema.safeParse({
    tenantId: 't-1',
    contactWhatsapp: '081234567890',
    heroBannerUrl: 'https://example.com/banner.jpg',
    customBrief: 'Tolong rapikan halaman warung sembako kami dengan fokus harga grosir.',
    agreedToTerms: true,
  });
  assert.equal(goodAssist.success, true);
});

test('parseFirstHostHeader and parseSubpathTenantSlug handle proxy headers and reject traversal', () => {
  assert.equal(parseFirstHostHeader('warung-berkah.kasirakun.id:443, 10.0.0.1'), 'warung-berkah.kasirakun.id');
  assert.equal(parseFirstHostHeader('[::1]:3000'), '::1');
  assert.deepEqual(parseSubpathTenantSlug('/toko/warung-berkah'), {
    slug: 'warung-berkah',
    trailingPath: '',
  });
  assert.deepEqual(parseSubpathTenantSlug('/toko/warung-berkah/katalog'), {
    slug: 'warung-berkah',
    trailingPath: '/katalog',
  });
  assert.equal(parseSubpathTenantSlug('/toko/admin'), null);
  assert.equal(parseSubpathTenantSlug('/toko/warung-berkah/../../etc/passwd'), null);
});

test('resolveSubdomainRoutingDecision rewrites tenant subdomains and redirects root /toko/[slug] in SUBDOMAIN mode', () => {
  const rewriteRoot = resolveSubdomainRoutingDecision({
    hostHeader: 'warung-berkah.kasirakun.id',
    pathname: '/',
    search: '?preview=1',
    envOverride: { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' },
  });
  assert.deepEqual(rewriteRoot, {
    action: 'REWRITE',
    tenantSlug: 'warung-berkah',
    rewritePath: '/toko/warung-berkah?preview=1',
    originalPath: '/?preview=1',
  });

  const rewriteNested = resolveSubdomainRoutingDecision({
    hostHeader: 'kost-griya.kasirakun.id, proxy.internal',
    pathname: '/kamar',
    search: '?lantai=2',
    envOverride: { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' },
  });
  assert.equal(rewriteNested.action, 'REWRITE');
  if (rewriteNested.action === 'REWRITE') {
    assert.equal(rewriteNested.rewritePath, '/toko/kost-griya/kamar?lantai=2');
  }

  // Already at /toko/[slug] -> no double prefix
  const alreadyTargeted = resolveSubdomainRoutingDecision({
    hostHeader: 'warung-berkah.kasirakun.id',
    pathname: '/toko/warung-berkah',
    envOverride: { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' },
  });
  assert.deepEqual(alreadyTargeted, {
    action: 'PASS_THROUGH',
    reason: 'ALREADY_AT_TENANT_PATH',
  });

  // Canonical 301 redirect in SUBDOMAIN mode
  const canonicalRedirect = resolveSubdomainRoutingDecision({
    hostHeader: 'kasirakun.id',
    pathname: '/toko/warung-berkah',
    search: '?utm=wa',
    method: 'GET',
    envOverride: { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' },
  });
  assert.deepEqual(canonicalRedirect, {
    action: 'REDIRECT_CANONICAL',
    tenantSlug: 'warung-berkah',
    redirectUrl: 'https://warung-berkah.kasirakun.id?utm=wa',
    statusCode: 301,
  });

  // SUBPATH mode keeps /toko/[slug] without redirect
  const subpathPass = resolveSubdomainRoutingDecision({
    hostHeader: 'kasirakun.id',
    pathname: '/toko/warung-berkah',
    envOverride: { mode: 'SUBPATH', rootDomain: 'kasirakun.id' },
  });
  assert.deepEqual(subpathPass, {
    action: 'PASS_THROUGH',
    reason: 'NOT_TENANT_SUBDOMAIN',
  });

  // API & static assets must never be rewritten even on tenant subdomain
  const apiPass = resolveSubdomainRoutingDecision({
    hostHeader: 'warung-berkah.kasirakun.id',
    pathname: '/api/public/toko/warung-berkah',
    envOverride: { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' },
  });
  assert.deepEqual(apiPass, { action: 'PASS_THROUGH', reason: 'IGNORED_PATH' });
});

test('src/middleware.ts handles Fetch-compatible directives and Express rewrite/redirect execution', () => {
  assert.ok(Array.isArray(middlewareConfig.matcher) && middlewareConfig.matcher.length > 0);

  // Web-Request directive check
  const directive = subdomainMiddleware(
    {
      url: 'https://kopi-senja.kasirakun.id/?ref=qr',
      method: 'GET',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'host' ? 'kopi-senja.kasirakun.id' : null),
      },
    },
    { mode: 'SUBDOMAIN', rootDomain: 'kasirakun.id' }
  );
  assert.equal(directive.type, 'rewrite');
  if (directive.type === 'rewrite') {
    assert.equal(directive.targetPath, '/toko/kopi-senja?ref=qr');
    assert.equal(directive.headers['x-tenant-slug'], 'kopi-senja');
  }

  // Express runtime rewrite check
  const expressMw = createSubdomainRewriteMiddleware({
    mode: 'SUBDOMAIN',
    rootDomain: 'kasirakun.id',
  });

  const rewrittenReq: { url: string; method: string; headers: Record<string, string> } = {
    url: '/?promo=1',
    method: 'GET',
    headers: { host: 'warung-makmur.kasirakun.id' },
  };
  const responseHeaders: Record<string, string> = {};
  let nextCalled = false;
  expressMw(
    rewrittenReq as never,
    {
      setHeader: (k: string, v: string) => {
        responseHeaders[k.toLowerCase()] = v;
      },
      redirect: () => {
        throw new Error('Unexpected redirect on subdomain rewrite');
      },
    } as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
  assert.equal(rewrittenReq.url, '/toko/warung-makmur?promo=1');
  assert.equal(rewrittenReq.headers['x-tenant-slug'], 'warung-makmur');
  assert.equal(responseHeaders['x-tenant-slug'], 'warung-makmur');

  // Express runtime 301 canonical redirect check
  let redirectArgs: { status: number; target: string } | null = null;
  expressMw(
    {
      url: '/toko/warung-makmur?src=ig',
      method: 'GET',
      headers: { host: 'kasirakun.id' },
    } as never,
    {
      setHeader: () => undefined,
      redirect: (status: number, target: string) => {
        redirectArgs = { status, target };
      },
    } as never,
    () => {
      throw new Error('next() must not be called on 301 redirect');
    }
  );
  assert.deepEqual(redirectArgs, {
    status: 301,
    target: 'https://warung-makmur.kasirakun.id?src=ig',
  });
});

