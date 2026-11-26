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

export function extractRequestOrigin(
  req?: { headers?: Record<string, string | string[] | undefined> },
): string | undefined {
  if (!req?.headers) return undefined;
  const rawHostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const rawHost = Array.isArray(rawHostHeader)
    ? String(rawHostHeader[0] || '')
    : String(rawHostHeader || '');
  const host = rawHost.split(',')[0].trim();
  if (!host || /[\s/\\]/.test(host)) return undefined;
  const rawProtoHeader = req.headers['x-forwarded-proto'];
  const rawProto = Array.isArray(rawProtoHeader)
    ? String(rawProtoHeader[0] || '')
    : String(rawProtoHeader || '');
  const protoCandidate = rawProto.split(',')[0].trim().toLowerCase();
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto =
    protoCandidate === 'http' || protoCandidate === 'https'
      ? protoCandidate
      : isLocal
      ? 'http'
      : 'https';
  return `${proto}://${host}`;
}

export function resolveBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
  requestOrigin?: string,
): string {
  const cleanReqOrigin = (requestOrigin || '').trim().replace(/\/+$/, '');
  // Inside Gemini AI Studio Preview (*.run.app), always honor the active preview origin
  // even when BETTER_AUTH_URL was synced from Vercel via Neon DB so OAuth popup callbacks match.
  if (!env.VERCEL && cleanReqOrigin && cleanReqOrigin.includes('.run.app')) {
    return cleanReqOrigin;
  }

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

  if (cleanReqOrigin && (cleanReqOrigin.startsWith('http://') || cleanReqOrigin.startsWith('https://'))) {
    return cleanReqOrigin;
  }

  return 'http://localhost:3000';
}

export function buildTrustedOrigins(
  env: NodeJS.ProcessEnv = process.env,
  requestOrigin?: string,
): string[] {
  const origins = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const candidates = [
    env.BETTER_AUTH_URL,
    env.NEXT_PUBLIC_APP_URL,
    env.APP_URL,
    requestOrigin,
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
  } else {
    origins.add('https://*.run.app');
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
  requestOrigin?: string,
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
    baseURL: resolveBaseUrl(env, requestOrigin),
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

const cachedAuthInstances = new Map<string, KasirAkunAuthInstance>();

export function resetBetterAuthCache(): void {
  cachedAuthInstances.clear();
}

/**
 * Lazily creates (and caches) the Better Auth instance bound to Prisma PostgreSQL.
 * Returns null if DATABASE_URL is not configured yet so preview builds never crash.
 */
export function getBetterAuthInstance(requestOrigin?: string): KasirAkunAuthInstance | null {
  const prismaClient = getPrismaClient();
  if (!prismaClient) {
    return null;
  }

  const baseURL = resolveBaseUrl(process.env, requestOrigin);
  const secret =
    (process.env.BETTER_AUTH_SECRET || '').trim() ||
    (process.env.SESSION_SIGNING_SECRET || '').trim() ||
    EPHEMERAL_FALLBACK_SECRET;
  const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const hasGoogle = isGoogleOAuthConfigured();
  const trustedOrigins = buildTrustedOrigins(process.env, requestOrigin);

  const fingerprint = [
    baseURL,
    secret.slice(-8),
    hasGoogle ? `${googleClientId.slice(-6)}:${googleClientSecret.slice(-4)}` : 'no-google',
    trustedOrigins.join(','),
  ].join('|');

  const existing = cachedAuthInstances.get(fingerprint);
  if (existing) {
    return existing;
  }

  const instance = createBetterAuthInstance({
    prismaClient,
    baseURL,
    secret,
    trustedOrigins,
    googleClientId,
    googleClientSecret,
    hasGoogle,
  });

  if (cachedAuthInstances.size > 8) {
    cachedAuthInstances.clear();
  }
  cachedAuthInstances.set(fingerprint, instance);
  return instance;
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

  const authInstance = getBetterAuthInstance(extractRequestOrigin(req));
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
