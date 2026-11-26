import type { IncomingMessage, ServerResponse } from 'node:http';
import { getExpressApp } from '../server.ts';

function normalizeApiRequestUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/api';
  const qIndex = rawUrl.indexOf('?');
  const pathPart = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;
  const queryPart = qIndex >= 0 ? rawUrl.slice(qIndex) : '';

  if (pathPart.startsWith('/api')) {
    return;
  }

  // Fallback if an upstream proxy/rewrite stripped `/api`
  const headerOrig = req.headers['x-vercel-original-url'] || req.headers['x-forwarded-uri'];
  if (typeof headerOrig === 'string' && headerOrig.startsWith('/api')) {
    req.url = headerOrig;
    return;
  }

  req.url = `/api${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}${queryPart}`;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    normalizeApiRequestUrl(req);
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
