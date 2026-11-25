/**
 * Prisma Singleton Client for Vercel Serverless & Neon PostgreSQL
 * - Reuses a single PrismaClient instance via globalThis to prevent connection exhaustion
 *   across Vercel Serverless warm invocations and local development reloads.
 * - Gracefully handles environments where DATABASE_URL is not yet configured (zero-config preview).
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  __kasirAkunPrisma?: PrismaClient;
  __kasirAkunPrismaUrl?: string;
};

export function isDatabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = (env.DATABASE_URL || '').trim();
  if (!url) return false;
  if (
    url.includes('USER:PASSWORD') ||
    url.includes('YOUR_PASSWORD') ||
    url.includes('neondb_owner:PASSWORD@ep-xxx')
  ) {
    return false;
  }
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

/**
 * Returns the global singleton PrismaClient when DATABASE_URL is configured.
 * Returns null if DATABASE_URL has not been configured yet so the app stays
 * operational in zero-config preview / local fallback mode.
 */
export function getPrismaClient(): PrismaClient | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const currentUrl = (process.env.DATABASE_URL || '').trim();
  if (globalForPrisma.__kasirAkunPrisma && globalForPrisma.__kasirAkunPrismaUrl === currentUrl) {
    return globalForPrisma.__kasirAkunPrisma;
  }

  const client = new PrismaClient({
    datasources: {
      db: { url: currentUrl },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  globalForPrisma.__kasirAkunPrisma = client;
  globalForPrisma.__kasirAkunPrismaUrl = currentUrl;
  return client;
}

/**
 * Standard named export `prisma` for direct Prisma ORM usage when DATABASE_URL is set.
 * Uses a Proxy so importing `prisma` never throws during static build or zero-config boot.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    if (!client) {
      throw new Error('DATABASE_URL PostgreSQL belum dikonfigurasi.');
    }
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export function resetPrismaClientCache(): void {
  if (globalForPrisma.__kasirAkunPrisma) {
    void globalForPrisma.__kasirAkunPrisma.$disconnect().catch(() => {});
  }
  globalForPrisma.__kasirAkunPrisma = undefined;
  globalForPrisma.__kasirAkunPrismaUrl = undefined;
}

export interface DatabaseHealthResult {
  status: 'connected' | 'local_fallback' | 'error';
  latencyMs?: number;
}

/**
 * Safe database connectivity check running `SELECT 1` without ever leaking
 * connection strings or raw PostgreSQL error details.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  if (!isDatabaseConfigured()) {
    return { status: 'local_fallback' };
  }
  const startedAt = Date.now();
  try {
    const client = getPrismaClient();
    if (!client) {
      return { status: 'local_fallback' };
    }
    await client.$queryRaw`SELECT 1`;
    return {
      status: 'connected',
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  } catch {
    return { status: 'error' };
  }
}
