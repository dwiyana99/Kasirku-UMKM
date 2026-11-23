/**
 * KasirAkun UMKM — Production Domain & Subdomain-to-Tenant-Slug Rewrite Middleware
 *
 * Prepares the application for seamless, zero-downtime migration from subpath URLs
 * (`/toko/[slug]`) to tenant subdomains (`https://[slug].[ROOT_DOMAIN]`).
 *
 * Behavior:
 * 1. Ignores `/api/*`, `/_next/*`, `/assets/*`, static files, localhost, raw IPs,
 *    hosting preview domains (`.run.app`, `.vercel.app`, `.ai.studio`), bare root
 *    domain, and reserved system subdomains (`www`, `app`, `api`, `admin`, `master`, etc.).
 * 2. When a valid tenant subdomain hits `https://[slug].[ROOT_DOMAIN]/*`:
 *    - Rewrites the internal path to `/toko/[slug]...` while preserving query params.
 *    - Attaches `x-tenant-slug` and `x-landing-routing-mode: SUBDOMAIN` headers.
 * 3. When `LANDING_URL_MODE=SUBDOMAIN` and a GET request hits the root domain at
 *    `/toko/[slug]`, issues a clean `301 Moved Permanently` canonical redirect to
 *    `https://[slug].[ROOT_DOMAIN]`.
 *
 * Exposes both:
 * - `createSubdomainRewriteMiddleware()` for the active Express (`server.ts`) runtime.
 * - `resolveSubdomainMiddlewareDecision()` & `config.matcher` for Edge / Next.js deployment.
 */

import type express from 'express';
import {
  resolveSubdomainRoutingDecision,
  type SubdomainRoutingDecision,
} from './lib/landing/url-helper.ts';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - API routes (`/api/...`)
     * - Build & static assets (`/_next/...`, `/assets/...`, `/src/...`, `/node_modules/...`)
     * - PWA / metadata files (`favicon.ico`, `manifest.webmanifest`, `sw.js`, `workbox-*.js`)
     */
    '/((?!api|_next/static|_next/image|assets|src|node_modules|favicon\\.ico|manifest|sw\\.js|workbox-).*)',
  ],
};

export interface SubdomainMiddlewareEnvOverride {
  mode?: string;
  rootDomain?: string;
}

export interface WebRequestLike {
  url: string;
  method?: string;
  headers: {
    get(name: string): string | null;
  };
}

export type MiddlewareDirective =
  | { type: 'next'; decision: SubdomainRoutingDecision }
  | {
      type: 'rewrite';
      targetPath: string;
      tenantSlug: string;
      headers: Record<string, string>;
      decision: SubdomainRoutingDecision;
    }
  | {
      type: 'redirect';
      location: string;
      statusCode: 301;
      tenantSlug: string;
      decision: SubdomainRoutingDecision;
    };

/**
 * Framework-agnostic Web-Request middleware evaluator.
 * Allows direct integration with Next.js Edge Middleware (`NextResponse.rewrite` / `NextResponse.redirect`)
 * or any Fetch API server adapter without duplicating routing logic.
 */
export function resolveSubdomainMiddlewareDecision(
  request: WebRequestLike,
  envOverride?: SubdomainMiddlewareEnvOverride
): MiddlewareDirective {
  const parsedUrl = new URL(request.url, 'http://localhost');
  const hostHeader =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || parsedUrl.host;

  const decision = resolveSubdomainRoutingDecision({
    hostHeader,
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    method: request.method || 'GET',
    envOverride,
  });

  if (decision.action === 'REWRITE') {
    return {
      type: 'rewrite',
      targetPath: decision.rewritePath,
      tenantSlug: decision.tenantSlug,
      headers: {
        'x-tenant-slug': decision.tenantSlug,
        'x-landing-routing-mode': 'SUBDOMAIN',
        'x-landing-original-path': decision.originalPath,
      },
      decision,
    };
  }

  if (decision.action === 'REDIRECT_CANONICAL') {
    return {
      type: 'redirect',
      location: decision.redirectUrl,
      statusCode: decision.statusCode,
      tenantSlug: decision.tenantSlug,
      decision,
    };
  }

  return { type: 'next', decision };
}

/**
 * Express middleware mounted in `server.ts` to execute subdomain-to-tenant-slug
 * rewrites and canonical redirects at runtime.
 */
export function createSubdomainRewriteMiddleware(
  envOverride?: SubdomainMiddlewareEnvOverride
): express.RequestHandler {
  return (req, res, next) => {
    const rawUrl = req.url || '/';
    const queryIdx = rawUrl.indexOf('?');
    const pathname = queryIdx === -1 ? rawUrl : rawUrl.slice(0, queryIdx);
    const search = queryIdx === -1 ? '' : rawUrl.slice(queryIdx);

    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : forwardedHost || req.headers.host || '';

    const decision = resolveSubdomainRoutingDecision({
      hostHeader: rawHost,
      pathname,
      search,
      method: req.method,
      envOverride,
    });

    if (decision.action === 'REWRITE') {
      req.headers['x-tenant-slug'] = decision.tenantSlug;
      req.headers['x-landing-routing-mode'] = 'SUBDOMAIN';
      req.headers['x-landing-original-path'] = decision.originalPath;
      res.setHeader('X-Tenant-Slug', decision.tenantSlug);
      res.setHeader('X-Landing-Routing-Mode', 'SUBDOMAIN');
      req.url = decision.rewritePath;
      return next();
    }

    if (decision.action === 'REDIRECT_CANONICAL') {
      res.setHeader('X-Tenant-Slug', decision.tenantSlug);
      return res.redirect(decision.statusCode, decision.redirectUrl);
    }

    return next();
  };
}

/**
 * Default middleware export (Fetch-compatible directive) ready for production Edge/Next.js migration.
 */
export function middleware(
  request: WebRequestLike,
  envOverride?: SubdomainMiddlewareEnvOverride
): MiddlewareDirective {
  return resolveSubdomainMiddlewareDecision(request, envOverride);
}
