import type { IncomingMessage, ServerResponse } from 'node:http';
import { getExpressApp } from '../server.ts';

function normalizeApiRequestUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/api';
  const parsed = new URL(rawUrl, 'http://localhost');
  const vercelPath = parsed.searchParams.get('__vercel_path');

  if (vercelPath !== null) {
    parsed.searchParams.delete('__vercel_path');
    const cleanPath = vercelPath.replace(/^\/+/, '');
    parsed.pathname = cleanPath ? `/api/${cleanPath}` : '/api';
    const qs = parsed.searchParams.toString();
    req.url = qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
    return;
  }

  if (parsed.pathname === '/api/index') {
    const headerOrig = req.headers['x-vercel-original-url'] || req.headers['x-forwarded-uri'];
    if (typeof headerOrig === 'string' && headerOrig.startsWith('/api')) {
      req.url = headerOrig;
      return;
    }
  }

  if (parsed.pathname.startsWith('/api')) {
    return;
  }

  const qs = parsed.searchParams.toString();
  const normalizedPath = `/api${parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`}`;
  req.url = qs ? `${normalizedPath}?${qs}` : normalizedPath;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/api';
  const rawPath = rawUrl.split('?')[0];
  try {
    normalizeApiRequestUrl(req);
    const normalizedPath = (req.url || '/api').split('?')[0];
    if (process.env.VERCEL || process.env.AUTH_DEBUG === 'true') {
      console.info(
        `[vercel-api] ${req.method || 'GET'} raw=${rawPath} -> normalized=${normalizedPath}`,
      );
    }
    const app = await getExpressApp();
    return app(req, res);
  } catch (err) {
    console.error('[vercel-api-handler] Failed to initialize Express app:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'Server API mengalami gangguan saat inisialisasi. Periksa log Vercel Functions.',
        }),
      );
    }
  }
}
