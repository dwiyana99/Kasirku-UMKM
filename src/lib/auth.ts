/**
 * Better Auth Server Configuration (Email/Password + Google OAuth)
 * - Backed by Neon / PostgreSQL via Prisma Adapter (`authAccount` model avoids collision with CoA `Account`).
 * - Dynamically resolves env keys so secrets updated from Master Admin Env Vault apply immediately.
 * - Exposes `getCurrentSession()` uniting Better Auth cookie sessions and existing HMAC Bearer tokens
 *   for consistent anti-BOLA authorization across all API routes.
 */

import crypto from 'node:crypto';
import type express from 'express';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { fromNodeHeaders } from 'better-auth/node';
import { getPrismaClient, isDatabaseConfigured } from './prisma.ts';
import type { SignedSessionPayload } from './db/tenant-db.ts';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export interface AuthConfigurationStatus {
  googleAuthConfigured: boolean;
  betterAuthSecretConfigured: boolean;
  databaseConfigured: boolean;
  betterAuthReady: boolean;
  baseURL: string;
}

export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (
    env.BETTER_AUTH_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    env.APP_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (explicit) return explicit;

  const vercelProdUrl = (env.VERCEL_PROJECT_PRODUCTION_URL || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const vercelUrl = (env.VERCEL_URL || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  if (env.VERCEL_ENV === 'production' && vercelProdUrl) {
    return `https://${vercelProdUrl}`;
  }
  if (vercelUrl) return `https://${vercelUrl}`;
  if (vercelProdUrl) return `https://${vercelProdUrl}`;

  return 'http://localhost:3000';
}

export function buildTrustedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const candidates = [
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
    env.APP_URL,
  ];
  for (const raw of candidates) {
    const trimmed = (raw || '').trim().replace(/\/+$/, '');
    if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
      origins.add(trimmed);
    }
  }

  const vercelUrl = (env.VERCEL_URL || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (vercelUrl) {
    origins.add(`https://${vercelUrl}`);
  }

  const vercelProdUrl = (env.VERCEL_PROJECT_PRODUCTION_URL || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (vercelProdUrl) {
    origins.add(`https://${vercelProdUrl}`);
  }

  if (env.VERCEL) {
    origins.add('https://*.vercel.app');
  }

  const customDomain = (env.CUSTOM_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (customDomain) {
    origins.add(`https://${customDomain}`);
    if (!customDomain.startsWith('www.')) {
      origins.add(`https://www.${customDomain}`);
    }
  }

  const rootDomain = (env.ROOT_DOMAIN || env.NEXT_PUBLIC_ROOT_DOMAIN || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (rootDomain) {
    origins.add(`https://${rootDomain}`);
    origins.add(`https://*.${rootDomain}`);
  }

  return Array.from(origins);
}

export function isGoogleOAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  return Boolean(
    clientId &&
      clientSecret &&
      !clientId.includes('YOUR_') &&
      !clientSecret.includes('YOUR_'),
  );
}

export function getAuthConfigurationStatus(
  env: NodeJS.ProcessEnv = process.env,
): AuthConfigurationStatus {
  const secretRaw = (env.BETTER_AUTH_SECRET || '').trim();
  const betterAuthSecretConfigured =
    secretRaw.length >= 16 && !secretRaw.includes('REPLACE_WITH_');
  const databaseConfigured = isDatabaseConfigured(env);
  const googleAuthConfigured = isGoogleOAuthConfigured(env);

  return {
    googleAuthConfigured,
    betterAuthSecretConfigured,
    databaseConfigured,
    betterAuthReady: databaseConfigured,
    baseURL: resolveBaseUrl(env),
  };
}

function createBetterAuthInstance(params: {
  prismaClient: NonNullable<ReturnType<typeof getPrismaClient>>;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  googleClientId: string;
  googleClientSecret: string;
  hasGoogle: boolean;
}) {
  const socialProviders = params.hasGoogle
    ? {
        google: {
          clientId: params.googleClientId,
          clientSecret: params.googleClientSecret,
          prompt: 'select_account' as const,
          redirectURI: `${params.baseURL}/api/auth/callback/google`,
        },
      }
    : undefined;
  const isAiStudioIframe = params.baseURL.includes('.run.app');

  return betterAuth({
    database: prismaAdapter(params.prismaClient, {
      provider: 'postgresql',
    }),
    baseURL: params.baseURL,
    basePath: '/api/auth',
    secret: params.secret,
    trustedOrigins: params.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      autoSignIn: true,
    },
    ...(socialProviders ? { socialProviders } : {}),
    // Remap Better Auth's `account` model to `authAccount` to prevent collision with
    // the accounting Chart of Accounts `Account` model in prisma/schema.prisma.
    account: {
      modelName: 'authAccount',
    },
    advanced: {
      defaultCookieAttributes: isAiStudioIframe
        ? { sameSite: 'none', secure: true, httpOnly: true }
        : { sameSite: 'lax', secure: params.baseURL.startsWith('https://'), httpOnly: true },
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    user: {
      additionalFields: {
        fullName: {
          type: 'string',
          required: false,
          defaultValue: '',
        },
        isSuperAdmin: {
          type: 'boolean',
          required: false,
          defaultValue: false,
        },
        accountStatus: {
          type: 'string',
          required: false,
          defaultValue: 'ACTIVE',
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const emailNorm = String(user.email || '').trim().toLowerCase();
            const masterPrimary = (process.env.MASTER_ADMIN_EMAIL || 'master@kasirakun.id')
              .trim()
              .toLowerCase();
            const shouldBeSuperAdmin =
              emailNorm === masterPrimary || emailNorm === 'dwiyana99@gmail.com';
            return {
              data: {
                ...user,
                fullName:
                  typeof (user as { fullName?: string }).fullName === 'string' &&
                  (user as { fullName?: string }).fullName?.trim()
                    ? (user as { fullName?: string }).fullName
                    : user.name || emailNorm.split('@')[0] || 'Pengguna KasirAkun',
                isSuperAdmin: Boolean((user as { isSuperAdmin?: boolean }).isSuperAdmin) || shouldBeSuperAdmin,
              },
            };
          },
        },
      },
    },
  });
}

export type KasirAkunAuthInstance = ReturnType<typeof createBetterAuthInstance>;

let cachedAuthFingerprint = '';
let cachedAuthInstance: KasirAkunAuthInstance | null = null;

export function resetBetterAuthCache(): void {
  cachedAuthFingerprint = '';
  cachedAuthInstance = null;
}

/**
 * Lazily creates (and caches) the Better Auth instance bound to Prisma PostgreSQL.
 * Returns null if DATABASE_URL is not configured yet so preview builds never crash.
 */
export function getBetterAuthInstance(): KasirAkunAuthInstance | null {
  const prismaClient = getPrismaClient();
  if (!prismaClient) {
    return null;
  }

  const baseURL = resolveBaseUrl();
  const secret =
    (process.env.BETTER_AUTH_SECRET || '').trim() ||
    (process.env.SESSION_SIGNING_SECRET || '').trim() ||
    EPHEMERAL_FALLBACK_SECRET;
  const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const hasGoogle = isGoogleOAuthConfigured();
  const trustedOrigins = buildTrustedOrigins();

  const fingerprint = [
    baseURL,
    secret.slice(-8),
    hasGoogle ? `${googleClientId.slice(-6)}:${googleClientSecret.slice(-4)}` : 'no-google',
    trustedOrigins.join(','),
  ].join('|');

  if (cachedAuthInstance && cachedAuthFingerprint === fingerprint) {
    return cachedAuthInstance;
  }

  cachedAuthInstance = createBetterAuthInstance({
    prismaClient,
    baseURL,
    secret,
    trustedOrigins,
    googleClientId,
    googleClientSecret,
    hasGoogle,
  });

  cachedAuthFingerprint = fingerprint;
  return cachedAuthInstance;
}

export interface UnifiedCurrentSession {
  userId: string;
  email: string;
  fullName: string;
  role: 'MASTER_ADMIN' | 'TENANT_OWNER' | 'STAFF';
  allowedTenantIds: string[];
  accountScope: 'REAL' | 'DEMO';
  needsOnboarding: boolean;
  authSource: 'better_auth' | 'bearer_token';
  image?: string | null;
}

/**
 * Unified server-side session reader for API route authorization & anti-BOLA checks.
 * 1. Checks existing HMAC Bearer token (`extractLegacySession`) for instant compatibility.
 * 2. Falls back to Better Auth cookie session + loads the user's owned/member Tenants from PostgreSQL.
 */
export async function getCurrentSession(
  req: express.Request,
  extractLegacySession?: (r: express.Request) => SignedSessionPayload | null,
): Promise<UnifiedCurrentSession | null> {
  if (extractLegacySession) {
    const legacy = extractLegacySession(req);
    if (legacy) {
      const mappedRole: UnifiedCurrentSession['role'] =
        legacy.role === 'MASTER_ADMIN'
          ? 'MASTER_ADMIN'
          : legacy.role === 'STAFF'
          ? 'STAFF'
          : 'TENANT_OWNER';
      return {
        userId: legacy.staffId || legacy.ownerAccountId,
        email: legacy.email,
        fullName: legacy.email.split('@')[0] || 'Pengguna KasirAkun',
        role: mappedRole,
        allowedTenantIds: legacy.allowedTenantIds,
        accountScope: legacy.accountScope,
        needsOnboarding:
          mappedRole !== 'MASTER_ADMIN' && legacy.allowedTenantIds.length === 0,
        authSource: 'bearer_token',
      };
    }
  }

  const authInstance = getBetterAuthInstance();
  const prismaClient = getPrismaClient();
  if (!authInstance || !prismaClient) {
    return null;
  }

  try {
    const sessionData = await authInstance.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!sessionData?.user?.id) {
      return null;
    }

    const dbUser = await prismaClient.user.findUnique({
      where: { id: sessionData.user.id },
      include: {
        memberships: {
          where: { isActive: true },
          select: { tenantId: true, role: true },
        },
      },
    });

    const allowedTenantIds = (dbUser?.memberships ?? []).map((m) => m.tenantId);
    const isMaster = Boolean(dbUser?.isSuperAdmin);
    const hasOwnerMembership = (dbUser?.memberships ?? []).some((m) => m.role === 'OWNER');
    const role: UnifiedCurrentSession['role'] = isMaster
      ? 'MASTER_ADMIN'
      : hasOwnerMembership || allowedTenantIds.length === 0
      ? 'TENANT_OWNER'
      : 'STAFF';

    return {
      userId: sessionData.user.id,
      email: sessionData.user.email,
      fullName: dbUser?.fullName || sessionData.user.name || sessionData.user.email,
      role,
      allowedTenantIds,
      accountScope: 'REAL',
      needsOnboarding: !isMaster && allowedTenantIds.length === 0,
      authSource: 'better_auth',
      image: sessionData.user.image ?? null,
    };
  } catch {
    return null;
  }
}
