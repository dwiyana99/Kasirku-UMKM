/**
 * Vercel Serverless Function Entry Point (`/api/*`)
 * Routes all `/api/*` requests (Better Auth, Master Admin, Tenant DB, POS/QRIS, Uploads)
 * to the Express application exported from `../server.ts`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getExpressApp } from '../server.ts';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getExpressApp();
  return app(
    req as unknown as Parameters<typeof app>[0],
    res as unknown as Parameters<typeof app>[1],
  );
}
