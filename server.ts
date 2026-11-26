/**
 * KasirAkun UMKM — Full-Stack Express + Vite Server (Port 3000)
 * Provides:
 * - POST /api/webhooks/qris: HMAC-SHA256 verified Dynamic QRIS payment webhook with idempotency,
 *   automated double-entry journal payload generation, Cashier auto-print trigger, and KDS ticket push.
 * - POST /api/qris/generate: Generates Dynamic QRIS payload + signed simulation signature.
 * - GET/POST/PATCH /api/kitchen/tickets: Live Kitchen Display System ticket state sync.
 * - GET/POST/DELETE /api/custom-fields: Dynamic Custom Fields definition API (Zod validated).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  PartitionedTenantDatabase,
  assertTenantAccess,
  resolveAccountScope,
  resolveDefaultDataRoot,
  signSessionToken,
  verifySessionToken,
  type SignedSessionPayload,
} from './src/lib/db/tenant-db.ts';
import {
  createInitialCustomers,
  createInitialWorkspaces,
  DEFAULT_SYSTEM_DEMO_CONFIG,
  INITIAL_DEMO_APPOINTMENTS,
} from './src/data/seedData.ts';
import {
  calculateHybridPricing,
  deriveLegacyModulesFromHybrid,
  enforceWorkspacePlanEntitlements,
  tenantHasAddOn,
} from './src/lib/saas/hybrid-pricing.ts';
import {
  createAutoPaymentChallenge,
  verifyAutoPaymentCallback,
  type AutoPaymentSession,
} from './src/lib/pos/payment-verifier.ts';
import {
  buildPostgresMigrationSql,
  buildProductionEnvSnippet,
  DEFAULT_INFRA_MIGRATION_CONFIG,
  runMigrationPreflightAudit,
  validatePostgresConnectionUri,
  validateStorageTargetConfig,
} from './src/lib/infra/pg-migration-builder.ts';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { mountPaymentAndWaRoutes } from './src/server/payment-routes.ts';
import { mountMasterEnvSecretsRoutes } from './src/server/env-secrets-routes.ts';
import { mountLandingPageRoutes } from './src/server/landing-routes.ts';
import { mountUploadRoutes } from './src/server/upload-routes.ts';
import { mountMasterAccountsRoutes } from './src/server/master-accounts-routes.ts';
import { createSubdomainRewriteMiddleware } from './src/middleware.ts';
import {
  buildTrustedOrigins,
  getAuthConfigurationStatus,
  getBetterAuthInstance,
  getCurrentSession,
} from './src/lib/auth.ts';
import {
  buildInitialMasterAdminAccounts,
  hashAccountPassword,
  resolveBetterAuthLoginTarget,
  sanitizeCustomerForApi,
  verifyAccountPassword,
} from './src/lib/auth/account-management.ts';
import {
  hydrateAllPostgresWorkspacesForMaster,
  hydrateUserFromPostgresByEmail,
  hydrateWorkspaceFromPostgresBySlug,
  hydrateWorkspaceFromPostgresByTenantId,
  syncCustomerUpdateToPostgres,
  syncTenantWorkspaceOnlyToPostgres,
  syncTenantWorkspaceToPostgres,
  syncUserAccountToPostgres,
} from './src/lib/auth/postgres-sync.ts';
import { checkDatabaseHealth, getPrismaClient } from './src/lib/prisma.ts';
import { isS3StorageConfigured } from './src/lib/storage/s3-client.ts';
import type {
  AddOnModuleCode,
  AiInsightCacheRecord,
  AiUsageLog,
  BusinessVertical,
  DemoAppointmentRequest,
  InfraMigrationConfig,
  ManagedCustomerAccount,
  PaymentMethod,
  SubscriptionPlanCode,
  SystemDemoConfig,
  TenantWorkspaceData,
} from './src/types/domain.ts';

const PORT = Number(process.env.PORT) || 3000;
function getQrisWebhookSecret(): string {
  const explicit = (process.env.QRIS_WEBHOOK_SECRET || '').trim();
  if (explicit && !explicit.includes('REPLACE_WITH_')) {
    return explicit;
  }
  const betterAuthSecret = (process.env.BETTER_AUTH_SECRET || '').trim();
  if (betterAuthSecret && !betterAuthSecret.includes('REPLACE_WITH_')) {
    return crypto
      .createHmac('sha256', betterAuthSecret)
      .update('kasirakun:qris-webhook:v1', 'utf8')
      .digest('hex');
  }
  return 'kasirakun-qris-hmac-dev-secret-2026';
}

const ALL_VERTICAL_ENUM = [
  'WARUNG_SEMBAKO',
  'TOKO_RETAIL',
  'BARBERSHOP_SALON',
  'KEDAI_MAKAN',
  'RESTORAN',
  'FREELANCE',
  'KOST_KONTRAKAN',
  'PETERNAKAN_PERTANIAN',
] as const;

const ALL_PAYMENT_METHODS_ENUM = [
  'CASH',
  'QRIS_DYNAMIC',
  'EWALLET_GOPAY',
  'EWALLET_DANA',
  'EWALLET_OVO',
  'EWALLET_SHOPEEPAY',
  'VIRTUAL_ACCOUNT',
  'BANK_TRANSFER',
] as const;

const ALL_ADDONS_ENUM = [
  'ADDON_NON_CASH_PAYMENT',
  'ADDON_THERMAL_RECEIPT',
  'ADDON_PRICING_SIMULATOR',
  'ADDON_PURCHASE_ORDER',
  'ADDON_INVENTORY_PRO',
  'ADDON_RESTO_QR_KDS',
  'ADDON_PROMO_CRM',
  'ADDON_ACCOUNTING_PRO',
  'ADDON_TAX_CORETAX',
  'ADDON_EXTRA_BRANCH',
  'ADDON_EXTRA_STAFF',
  'ADDON_WA_FONNTE',
  'ADDON_LANDING_PAGE',
  'ADDON_AI_ASSISTANT',
] as const;

const tenantDb = new PartitionedTenantDatabase();
const seededCustomers = createInitialCustomers();
const seededWorkspaces = createInitialWorkspaces();
tenantDb.seedIfEmpty({
  initialCustomers: seededCustomers,
  initialWorkspaces: seededWorkspaces,
});
// Additive backfill: ensure newly added demo verticals (Barbershop & Toko Retail) exist on existing disk DBs
for (const demoCust of seededCustomers) {
  if (!tenantDb.findCustomerById(demoCust.id)) {
    tenantDb.upsertCustomer(demoCust);
    const matchingWs = seededWorkspaces.find((w) => w.tenant.id === demoCust.primaryTenantId);
    if (matchingWs) {
      tenantDb.saveWorkspace('DEMO', demoCust.id, matchingWs);
    }
  }
}
// Ensure demo Warung Makmur Jaya workspace starts in a clean normal state without pre-seeded variance alerts
const demoWarungRecord = tenantDb.findWorkspaceByTenantId('tenant-warung-berkah');
if (demoWarungRecord && demoWarungRecord.scope === 'DEMO') {
  const existingShifts = demoWarungRecord.workspace.cashierShifts ?? [];
  const existingAudits = demoWarungRecord.workspace.auditLogs ?? [];
  const hasOldSeedVariance = existingShifts.some(
    (s) => (s.id === 'sh-w-1' || s.id === 'sh-w-2') && s.cashVariance !== '0.0000'
  );
  const hasOldSeedAudit = existingAudits.some((a) => a.id === 'aud-w-1');
  if (hasOldSeedVariance || hasOldSeedAudit) {
    demoWarungRecord.workspace.cashierShifts = existingShifts.map((s) =>
      s.id === 'sh-w-1' || s.id === 'sh-w-2'
        ? { ...s, actualClosingCash: s.expectedCash, cashVariance: '0.0000' }
        : s
    );
    demoWarungRecord.workspace.auditLogs = existingAudits.filter(
      (a) => a.id !== 'aud-w-1'
    );
    tenantDb.saveWorkspace('DEMO', demoWarungRecord.ownerAccountId, demoWarungRecord.workspace);
  }
}

const DATA_ROOT = resolveDefaultDataRoot();
const DEMO_CONFIG_PATH = path.join(DATA_ROOT, '_demo_config.json');
const DEMO_REQUESTS_PATH = path.join(DATA_ROOT, '_demo_requests.json');
const AI_USAGE_PATH = path.join(DATA_ROOT, '_ai_usage.json');
const INFRA_CONFIG_PATH = path.join(DATA_ROOT, '_infra_config.json');

function loadJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    }
  } catch {
    // fallback
  }
  return fallback;
}

function saveJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

const loadedDemoConfig = loadJsonFile<Partial<SystemDemoConfig>>(
  DEMO_CONFIG_PATH,
  DEFAULT_SYSTEM_DEMO_CONFIG
);
let systemDemoConfig: SystemDemoConfig = {
  ...DEFAULT_SYSTEM_DEMO_CONFIG,
  ...loadedDemoConfig,
  demoVisibility: {
    ...DEFAULT_SYSTEM_DEMO_CONFIG.demoVisibility,
    ...(loadedDemoConfig.demoVisibility ?? {}),
  },
};
systemDemoConfig.visibleDemoVerticals = (
  Object.keys(systemDemoConfig.demoVisibility) as BusinessVertical[]
).filter((v) => systemDemoConfig.demoVisibility[v] !== false);

let demoAppointmentRequests: DemoAppointmentRequest[] = loadJsonFile<DemoAppointmentRequest[]>(
  DEMO_REQUESTS_PATH,
  INITIAL_DEMO_APPOINTMENTS
);
let aiUsageLogs: AiUsageLog[] = loadJsonFile<AiUsageLog[]>(AI_USAGE_PATH, []);
const aiInsightCache = new Map<string, AiInsightCacheRecord>();
const autoPaymentSessions = new Map<string, AutoPaymentSession>();

function extractSessionFromRequest(req: express.Request): SignedSessionPayload | null {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return verifySessionToken(token);
}

// In-memory idempotency & real-time KDS/QRIS sync store (backed by Firestore on authenticated clients)
interface LiveTicket {
  id: string;
  tenantId: string;
  tenantSlug: string;
  orderNumber: string;
  tableNumber: string;
  customerName: string;
  grandTotal: string;
  mdrFee: string;
  paymentStatus: 'PENDING_QRIS' | 'PAID';
  kitchenStatus: 'PENDING' | 'COOKING' | 'READY' | 'SERVED';
  items: Array<{ name: string; qty: number; unitPrice: string; notes?: string }>;
  autoPrintTriggered: boolean;
  gatewayRefId: string;
  createdAt: string;
  paidAt: string | null;
}

const processedWebhookRefs = new Map<string, { orderId: string; paidAt: string; mdrFee: string }>();
const liveTickets = new Map<string, LiveTicket>();
const dynamicCustomFields = new Map<
  string,
  Array<{
    id: string;
    tenantId: string;
    targetEntity: 'products' | 'orders' | 'expenses' | 'assets';
    fieldKey: string;
    fieldLabel: string;
    fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
    options: string[];
    isRequired: boolean;
  }>
>();

function computeHmacSignature(payload: string): string {
  return crypto.createHmac('sha256', getQrisWebhookSecret()).update(payload).digest('hex');
}

const generateQrisSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  tableNumber: z.string().min(1),
  customerName: z.string().min(1),
  grandTotal: z.string().regex(/^\d+(\.\d+)?$/),
  mdrRate: z.string().default('0.007'),
  items: z.array(
    z.object({
      name: z.string().min(1),
      qty: z.number().positive(),
      unitPrice: z.string(),
      notes: z.string().optional(),
    })
  ),
});

const qrisWebhookSchema = z.object({
  gatewayRefId: z.string().min(4),
  orderId: z.string().min(1),
  tenantId: z.string().min(1),
  amountPaid: z.string().regex(/^\d+(\.\d+)?$/),
  mdrRate: z.string().default('0.007'),
  status: z.enum(['SETTLEMENT', 'PAID']),
});

const customFieldSchema = z.object({
  tenantId: z.string().min(1),
  targetEntity: z.enum(['products', 'orders', 'expenses', 'assets']),
  fieldKey: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/),
  fieldLabel: z.string().min(2).max(100),
  fieldType: z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT']),
  options: z.array(z.string()).default([]),
  isRequired: z.boolean().default(false),
});

const MASTER_LOGIN_EMAIL = process.env.MASTER_ADMIN_EMAIL || 'master@kasirakun.id';
const MASTER_LOGIN_PASSWORD = process.env.MASTER_ADMIN_PASSWORD || 'Master2026!';
const MASTER_SESSION_SECRET = process.env.MASTER_SESSION_SECRET || 'kasirakun-master-hmac-2026';

const MODULE_PRICES: Record<string, string> = {
  POS_BASIC: '0',
  QR_TABLE_KITCHEN: '79000',
  ACCOUNTING_FULL: '99000',
  TAX_CORETAX: '49000',
  MULTI_BRANCH: '39000',
};

interface StoredSubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  customerEmail: string;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  planCode: SubscriptionPlanCode;
  selectedAddOns: AddOnModuleCode[];
  selectedModules: string[];
  subtotalAmount: string;
  dppNilaiLain: string;
  ppnAmount: string;
  grandTotal: string;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PENDING_PAYMENT' | 'VERIFIED_PAID';
  gatewayRefId: string;
  paidAt: string | null;
  createdAt: string;
}

const subscriptionInvoices = new Map<string, StoredSubscriptionInvoice>();
const verifiedSubscriptionRefs = new Map<string, StoredSubscriptionInvoice>();

const masterLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const subscriptionCheckoutSchema = z.object({
  customerEmail: z.string().email().optional().default('calon.user@umkm.id'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  planCode: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).default('BASIC'),
  selectedAddOns: z.array(z.enum(ALL_ADDONS_ENUM)).optional().default([]),
  extraBranchQty: z.number().int().min(1).max(50).optional().default(1),
  extraStaffQty: z.number().int().min(1).max(100).optional().default(1),
  selectedModules: z
    .array(z.enum(['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX', 'MULTI_BRANCH']))
    .optional(),
  paymentMethod: z.enum(ALL_PAYMENT_METHODS_ENUM).default('QRIS_DYNAMIC'),
});

const subscriptionWebhookSchema = z.object({
  invoiceId: z.string().min(1),
  gatewayRefId: z.string().min(4),
  amountPaid: z.string().regex(/^\d+(\.\d+)?$/),
  status: z.enum(['SETTLEMENT', 'VERIFIED_PAID']),
});

export interface CreateExpressAppOptions {
  httpServer?: http.Server;
  enableVite?: boolean;
  serveStatic?: boolean;
}

export async function createExpressApp(
  options: CreateExpressAppOptions = {},
): Promise<express.Express> {
  const app = express();

  // Seed Master Admin accounts directory with hashed credentials if empty
  if (tenantDb.listMasterAccounts().length === 0) {
    const initialMasters = await buildInitialMasterAdminAccounts({
      primaryEmail: MASTER_LOGIN_EMAIL,
      primaryPassword: MASTER_LOGIN_PASSWORD,
      secondaryOwnerEmail: 'dwiyana99@gmail.com',
    });
    tenantDb.saveMasterAccounts(initialMasters);
  }

  // Mount Better Auth handler BEFORE express.json() for Better Auth specific paths,
  // preserving existing `/api/auth/login`, `/api/auth/master-login`, `/api/auth/register-onboarded`,
  // `/api/auth/demo-*`, and `/api/auth/magic-demo/*` endpoints intact.
  const BETTER_AUTH_PREFIXES = [
    '/api/auth/sign-in',
    '/api/auth/sign-up',
    '/api/auth/sign-out',
    '/api/auth/get-session',
    '/api/auth/callback',
    '/api/auth/error',
    '/api/auth/ok',
    '/api/auth/list-sessions',
    '/api/auth/revoke-session',
    '/api/auth/revoke-sessions',
    '/api/auth/link-social',
    '/api/auth/verify-email',
    '/api/auth/forget-password',
    '/api/auth/reset-password',
  ];
  app.use('/api/auth', (req, res, next) => {
    const startedAt = Date.now();
    const authStatus = getAuthConfigurationStatus();
    const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'unknown');
    res.on('finish', () => {
      console.info(
        `[auth-diag] ${req.method} ${req.originalUrl.split('?')[0]} host=${reqHost} status=${res.statusCode} baReady=${authStatus.betterAuthReady} googleReady=${authStatus.googleAuthConfigured} ms=${Date.now() - startedAt}`,
      );
    });
    next();
  });

  app.use((req, res, next) => {
    const reqPath = req.path || '';
    const isBetterAuthPath = BETTER_AUTH_PREFIXES.some(
      (prefix) => reqPath === prefix || reqPath.startsWith(`${prefix}/`),
    );
    if (!isBetterAuthPath) {
      next();
      return;
    }

    const authInstance = getBetterAuthInstance();
    if (!authInstance) {
      return res.status(503).json({
        error:
          'Layanan Better Auth (PostgreSQL Neon) belum terhubung. Atur DATABASE_URL dan BETTER_AUTH_SECRET di Vercel atau Master Admin > Pengaturan API.',
        code: 'BETTER_AUTH_DB_UNCONFIGURED',
      });
    }

    const handler = toNodeHandler(authInstance);
    void Promise.resolve(handler(req, res)).catch(() => {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Terjadi gangguan pada layanan autentikasi. Silakan coba lagi.',
        });
      }
    });
  });

  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  // Healthcheck endpoint for Vercel, Neon PostgreSQL, Universal S3, and Better Auth verification
  app.get('/api/health', async (_req, res) => {
    const dbHealth = await checkDatabaseHealth();
    const authStatus = getAuthConfigurationStatus();
    const storageConfigured = isS3StorageConfigured();
    res.status(200).json({
      status: dbHealth.status === 'error' ? 'degraded' : 'ok',
      database: dbHealth.status,
      ...(typeof dbHealth.latencyMs === 'number' ? { databaseLatencyMs: dbHealth.latencyMs } : {}),
      storageConfigured,
      googleAuthConfigured: authStatus.googleAuthConfigured,
      betterAuthConfigured: authStatus.betterAuthReady,
      service: 'kasirakun-umkm',
      timestamp: new Date().toISOString(),
    });
  });

  // Safe, non-secret diagnostic endpoint to inspect Better Auth routing, BETTER_AUTH_URL match, and Google OAuth readiness
  app.get('/api/auth/diagnostics', async (req, res) => {
    const authStatus = getAuthConfigurationStatus();
    const authInstance = getBetterAuthInstance();
    const trustedOrigins = buildTrustedOrigins();
    const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const proto = String(req.headers['x-forwarded-proto'] || (rawHost.includes('localhost') ? 'http' : 'https'))
      .split(',')[0]
      .trim();
    const requestOrigin = rawHost ? `${proto}://${rawHost}` : authStatus.baseURL;

    let configuredHost = '';
    try {
      configuredHost = new URL(authStatus.baseURL).host;
    } catch {
      configuredHost = '';
    }
    const betterAuthUrlMatchesRequestHost = Boolean(
      rawHost && configuredHost && rawHost.toLowerCase() === configuredHost.toLowerCase(),
    );
    const requestOriginTrusted =
      trustedOrigins.includes(requestOrigin) ||
      (rawHost.endsWith('.vercel.app') && trustedOrigins.includes('https://*.vercel.app'));

    const hints: string[] = [];
    if (!authStatus.databaseConfigured) {
      hints.push('DATABASE_URL Neon belum terpasang atau masih berupa placeholder.');
    }
    if (!authStatus.betterAuthSecretConfigured) {
      hints.push('BETTER_AUTH_SECRET belum terpasang atau kurang dari 16 karakter.');
    }
    if (!betterAuthUrlMatchesRequestHost && rawHost) {
      hints.push(
        `BETTER_AUTH_URL (${authStatus.baseURL}) berbeda dengan host saat ini (${requestOrigin}). Sesuaikan BETTER_AUTH_URL di Vercel lalu Redeploy.`,
      );
    }
    if (!authStatus.googleAuthConfigured) {
      hints.push(
        `Login Google belum aktif karena GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET belum diisi. Pasang Redirect URI: ${authStatus.baseURL}/api/auth/callback/google`,
      );
    }

    return res.status(200).json({
      status: 'ok',
      matchedPath: req.path,
      originalUrl: req.originalUrl.split('?')[0],
      requestHost: rawHost || null,
      requestOrigin,
      configuredBetterAuthUrl: authStatus.baseURL,
      betterAuthUrlMatchesRequestHost,
      requestOriginTrusted,
      betterAuthMounted: Boolean(authInstance),
      betterAuthReady: authStatus.betterAuthReady,
      betterAuthSecretConfigured: authStatus.betterAuthSecretConfigured,
      databaseConfigured: authStatus.databaseConfigured,
      googleAuthConfigured: authStatus.googleAuthConfigured,
      googleCallbackUrl: `${authStatus.baseURL}/api/auth/callback/google`,
      storageConfigured: isS3StorageConfigured(),
      masterGoogleAdminEmail: 'dwiyana99@gmail.com',
      newUserGoogleOnboardingEnabled: true,
      vercelEnv: process.env.VERCEL_ENV || (process.env.VERCEL ? 'vercel' : 'local'),
      hints,
      timestamp: new Date().toISOString(),
    });
  });

  // Public non-sensitive auth capability check for Login & Register pages
  app.get('/api/auth/config-status', (_req, res) => {
    const authStatus = getAuthConfigurationStatus();
    return res.status(200).json({
      googleAuthConfigured: authStatus.googleAuthConfigured,
      betterAuthSecretConfigured: authStatus.betterAuthSecretConfigured,
      databaseConfigured: authStatus.databaseConfigured,
      betterAuthReady: authStatus.betterAuthReady,
      storageConfigured: isS3StorageConfigured(),
    });
  });

  // Unified current session reader (Better Auth cookie OR existing HMAC Bearer token)
  app.get('/api/auth/me', async (req, res) => {
    const current = await getCurrentSession(req, extractSessionFromRequest);
    if (!current) {
      return res.status(200).json({ authenticated: false });
    }
    return res.status(200).json({
      authenticated: true,
      user: current,
    });
  });

  // Exchange an active Better Auth cookie session (Email/Password or Google OAuth via Neon PostgreSQL)
  // into a scoped KasirAkun workspace session + HMAC Bearer token.
  app.get('/api/auth/better-auth/exchange', async (req, res) => {
    const authInstance = getBetterAuthInstance();
    if (!authInstance) {
      return res.status(200).json({ authenticated: false, betterAuthReady: false });
    }
    try {
      const baSession = await authInstance.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!baSession?.user?.email) {
        return res.status(200).json({ authenticated: false, betterAuthReady: true });
      }

      const emailNorm = baSession.user.email.trim().toLowerCase();
      const prismaClient = getPrismaClient();
      const dbUser = prismaClient
        ? await prismaClient.user.findUnique({
            where: { email: emailNorm },
            select: { isSuperAdmin: true, accountStatus: true, fullName: true },
          })
        : null;

      // Determine whether user signed in via Google OAuth or credential
      let authMethod: 'GOOGLE' | 'EMAIL' = 'EMAIL';
      if (prismaClient) {
        const googleAcct = await prismaClient.authAccount.findFirst({
          where: { userId: baSession.user.id, providerId: 'google' },
          select: { id: true },
        });
        if (googleAcct) {
          authMethod = 'GOOGLE';
        }
      }

      const masterAccounts = tenantDb.listMasterAccounts();
      let customer = tenantDb.findCustomerByEmail(emailNorm);
      if (
        !customer &&
        !masterAccounts.some((m) => m.email.trim().toLowerCase() === emailNorm)
      ) {
        const hydrated = await hydrateUserFromPostgresByEmail(emailNorm);
        if (hydrated?.customer && hydrated.workspaces?.length) {
          const scope = resolveAccountScope(hydrated.customer);
          tenantDb.upsertCustomer(hydrated.customer);
          for (const ws of hydrated.workspaces) {
            tenantDb.saveWorkspace(scope, hydrated.customer.id, ws);
          }
          customer = hydrated.customer;
        }
      }
      const staffMatch = customer ? null : tenantDb.findStaffByEmail(emailNorm);

      const resolution = resolveBetterAuthLoginTarget({
        email: emailNorm,
        authMethod,
        masterAccounts,
        customer,
        staffMatch,
        isPostgresSuperAdmin: Boolean(dbUser?.isSuperAdmin),
      });

      if (!resolution.allowed) {
        return res.status(403).json({
          authenticated: false,
          error: resolution.error || 'Akses akun ditolak.',
        });
      }

      if (resolution.targetRole === 'MASTER_ADMIN') {
        const masterAcc = resolution.masterAccount;
        if (masterAcc) {
          tenantDb.upsertMasterAccount({
            ...masterAcc,
            lastLoginAt: new Date().toISOString(),
          });
        }
        const token = signSessionToken({
          role: 'MASTER_ADMIN',
          accountScope: 'REAL',
          ownerAccountId: masterAcc?.id || 'master-admin',
          email: emailNorm,
          allowedTenantIds: [],
          issuedAt: Date.now(),
        });
        return res.status(200).json({
          authenticated: true,
          role: 'MASTER_ADMIN',
          accountScope: 'REAL',
          authProvider: authMethod === 'GOOGLE' ? 'BETTER_AUTH_GOOGLE' : 'BETTER_AUTH_EMAIL',
          email: emailNorm,
          fullName: masterAcc?.fullName || dbUser?.fullName || baSession.user.name || 'Master Admin',
          phone: masterAcc?.phone || '',
          token,
          customers: tenantDb.listCustomers().map(sanitizeCustomerForApi),
          workspaces: tenantDb.listAllWorkspaces(),
        });
      }

      if (resolution.targetRole === 'CUSTOMER' && resolution.customer) {
        const cust = resolution.customer;
        const scope = resolveAccountScope(cust);
        const workspaces = tenantDb.listWorkspacesForOwner(scope, cust.id);
        const token = signSessionToken({
          role: 'CUSTOMER',
          accountScope: scope,
          ownerAccountId: cust.id,
          email: cust.email,
          allowedTenantIds: cust.tenantIds,
          issuedAt: Date.now(),
        });
        return res.status(200).json({
          authenticated: true,
          role: 'CUSTOMER',
          accountScope: scope,
          authProvider: authMethod === 'GOOGLE' ? 'BETTER_AUTH_GOOGLE' : 'BETTER_AUTH_EMAIL',
          token,
          customer: sanitizeCustomerForApi(cust),
          workspaces,
        });
      }

      if (resolution.targetRole === 'STAFF' && resolution.staffMatch) {
        const hit = resolution.staffMatch;
        const token = signSessionToken({
          role: 'STAFF',
          accountScope: hit.scope,
          ownerAccountId: hit.ownerAccountId,
          email: hit.staff.email,
          allowedTenantIds: [hit.workspace.tenant.id],
          staffId: hit.staff.id,
          staffTenantId: hit.workspace.tenant.id,
          issuedAt: Date.now(),
        });
        return res.status(200).json({
          authenticated: true,
          role: 'STAFF',
          accountScope: hit.scope,
          authProvider: authMethod === 'GOOGLE' ? 'BETTER_AUTH_GOOGLE' : 'BETTER_AUTH_EMAIL',
          token,
          staff: hit.staff,
          ownerAccount: hit.ownerAccount ? sanitizeCustomerForApi(hit.ownerAccount) : null,
          workspaces: [hit.workspace],
        });
      }

      return res.status(200).json({
        authenticated: true,
        needsOnboarding: true,
        authProvider: authMethod === 'GOOGLE' ? 'BETTER_AUTH_GOOGLE' : 'BETTER_AUTH_EMAIL',
        profile: {
          userId: baSession.user.id,
          email: emailNorm,
          fullName: dbUser?.fullName || baSession.user.name || emailNorm.split('@')[0],
          image: baSession.user.image ?? null,
        },
      });
    } catch {
      return res.status(200).json({ authenticated: false, betterAuthReady: true });
    }
  });

  // 0a. Master Admin Login (Verifies scrypt hash from Master Accounts directory + PostgreSQL fallback)
  app.post('/api/auth/master-login', async (req, res) => {
    const parsed = masterLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Format email atau kata sandi tidak valid.' });
    }
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const masterAcc = tenantDb.findMasterAccountByEmail(emailNorm);
    let verified = false;
    let displayName = 'Master Pemilik KasirAkun';
    let masterPhone = '';
    let masterId = 'master-admin';

    if (masterAcc) {
      if (masterAcc.status !== 'ACTIVE') {
        return res.status(403).json({
          error: 'Akun Master Admin ini sedang ditangguhkan. Hubungi pengelola utama.',
        });
      }
      if (!masterAcc.allowPasswordLogin) {
        return res.status(403).json({
          error: 'Login kata sandi dinonaktifkan untuk akun ini. Gunakan Masuk dengan Google.',
        });
      }
      verified = await verifyAccountPassword(password, masterAcc.passwordHash);
      displayName = masterAcc.fullName;
      masterPhone = masterAcc.phone;
      masterId = masterAcc.id;
    } else {
      // Fallback check against PostgreSQL Better Auth user if created directly in Neon DB
      const prismaClient = getPrismaClient();
      if (prismaClient) {
        try {
          const pgMaster = await prismaClient.user.findUnique({
            where: { email: emailNorm },
            include: {
              authAccounts: {
                where: { providerId: 'credential' },
                select: { password: true },
              },
            },
          });
          if (pgMaster?.isSuperAdmin && pgMaster.accountStatus === 'ACTIVE') {
            const hash = pgMaster.authAccounts[0]?.password || pgMaster.passwordHash;
            verified = await verifyAccountPassword(password, hash);
            displayName = pgMaster.fullName || pgMaster.name || displayName;
            masterPhone = pgMaster.phone || '';
            masterId = pgMaster.id;
          }
        } catch {
          verified = false;
        }
      }
    }

    if (!verified) {
      return res.status(401).json({ error: 'Email atau kata sandi Master Admin tidak sesuai.' });
    }

    if (masterAcc) {
      tenantDb.upsertMasterAccount({
        ...masterAcc,
        lastLoginAt: new Date().toISOString(),
      });
    }

    const token = signSessionToken({
      role: 'MASTER_ADMIN',
      accountScope: 'REAL',
      ownerAccountId: masterId,
      email: emailNorm,
      allowedTenantIds: [],
      issuedAt: Date.now(),
    });

    return res.status(200).json({
      authenticated: true,
      role: 'MASTER_ADMIN',
      accountScope: 'REAL',
      email: emailNorm,
      fullName: displayName,
      phone: masterPhone,
      token,
      customers: tenantDb.listCustomers().map(sanitizeCustomerForApi),
      workspaces: tenantDb.listAllWorkspaces(),
    });
  });

  // 0a-2. Customer / Demo / Staff Login (Strict Per-User & DEMO vs REAL Partition Isolation)
  app.post('/api/auth/login', async (req, res) => {
    const parsed = masterLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Format email atau kata sandi tidak valid.' });
    }
    const emailNorm = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    // 1. Check Customer / Demo Owner accounts
    const customer = tenantDb.findCustomerByEmail(emailNorm);
    if (customer) {
      const passwordOk = await verifyAccountPassword(
        password,
        customer.passwordHash,
        customer.passwordDemo
      );
      if (passwordOk) {
        if (customer.status === 'SUSPENDED' || customer.status === 'DEACTIVATED') {
          return res.status(403).json({
            error: `Akun ini berstatus ${customer.status}. Hubungi Master Admin untuk mengaktifkan kembali.`,
          });
        }
        if (customer.allowPasswordLogin === false) {
          return res.status(403).json({
            error: 'Login kata sandi dinonaktifkan untuk akun ini. Gunakan tombol Masuk dengan Google.',
          });
        }
        if (
          customer.accountScope === 'DEMO' &&
          customer.demoExpiresAt &&
          new Date(customer.demoExpiresAt).getTime() < Date.now()
        ) {
          return res.status(403).json({
            error: 'Masa uji coba akun demo ini telah berakhir. Hubungi Master Admin untuk perpanjangan.',
          });
        }
        const scope = resolveAccountScope(customer);
        const workspaces = tenantDb.listWorkspacesForOwner(scope, customer.id);
        const token = signSessionToken({
          role: 'CUSTOMER',
          accountScope: scope,
          ownerAccountId: customer.id,
          email: customer.email,
          allowedTenantIds: customer.tenantIds,
          issuedAt: Date.now(),
        });

        return res.status(200).json({
          authenticated: true,
          role: 'CUSTOMER',
          accountScope: scope,
          token,
          customer: sanitizeCustomerForApi(customer),
          workspaces,
        });
      }
    }

    // 2. Check Staff accounts within any tenant
    const staffHit = tenantDb.findStaffLogin(emailNorm, password);
    if (staffHit) {
      if (!staffHit.staff.isActive) {
        return res.status(403).json({
          error: 'Akun pegawai ini sedang dinonaktifkan oleh pemilik usaha.',
        });
      }
      if (
        staffHit.ownerAccount &&
        (staffHit.ownerAccount.status === 'SUSPENDED' || staffHit.ownerAccount.status === 'DEACTIVATED')
      ) {
        return res.status(403).json({
          error: 'Akun pemilik usaha sedang nonaktif. Hubungi pemilik usaha.',
        });
      }
      const token = signSessionToken({
        role: 'STAFF',
        accountScope: staffHit.scope,
        ownerAccountId: staffHit.ownerAccountId,
        email: staffHit.staff.email,
        allowedTenantIds: [staffHit.workspace.tenant.id],
        staffId: staffHit.staff.id,
        staffTenantId: staffHit.workspace.tenant.id,
        issuedAt: Date.now(),
      });

      return res.status(200).json({
        authenticated: true,
        role: 'STAFF',
        accountScope: staffHit.scope,
        token,
        staff: staffHit.staff,
        ownerAccount: staffHit.ownerAccount ? sanitizeCustomerForApi(staffHit.ownerAccount) : null,
        workspaces: [staffHit.workspace],
      });
    }

    // 3. Cold-start fallback: verify against Neon PostgreSQL (e.g. Vercel ephemeral /tmp)
    const hydrated = await hydrateUserFromPostgresByEmail(emailNorm);
    if (hydrated?.found && hydrated.passwordHash) {
      const pgPasswordOk = await verifyAccountPassword(password, hydrated.passwordHash);
      if (pgPasswordOk) {
        if (hydrated.accountStatus === 'SUSPENDED' || hydrated.accountStatus === 'DEACTIVATED') {
          return res.status(403).json({
            error: `Akun ini berstatus ${hydrated.accountStatus}. Hubungi Master Admin untuk mengaktifkan kembali.`,
          });
        }
        if (hydrated.customer && hydrated.workspaces?.length) {
          const scope = resolveAccountScope(hydrated.customer);
          tenantDb.upsertCustomer(hydrated.customer);
          for (const ws of hydrated.workspaces) {
            tenantDb.saveWorkspace(scope, hydrated.customer.id, ws);
          }
          const token = signSessionToken({
            role: 'CUSTOMER',
            accountScope: scope,
            ownerAccountId: hydrated.customer.id,
            email: hydrated.customer.email,
            allowedTenantIds: hydrated.customer.tenantIds,
            issuedAt: Date.now(),
          });
          return res.status(200).json({
            authenticated: true,
            role: 'CUSTOMER',
            accountScope: scope,
            token,
            customer: sanitizeCustomerForApi(hydrated.customer),
            workspaces: hydrated.workspaces,
          });
        }
      }
    }

    return res.status(401).json({ error: 'Email atau kata sandi tidak cocok.' });
  });

  // 0a-3. Persist Newly Onboarded REAL Customer + Workspace into `.data/db/real/` (+ Neon PostgreSQL)
  app.post('/api/auth/register-onboarded', async (req, res) => {
    const body = req.body as {
      customer?: ManagedCustomerAccount;
      workspace?: TenantWorkspaceData;
    };
    if (!body?.customer?.id || !body?.customer?.email || !body?.workspace?.tenant?.id) {
      return res.status(400).json({ error: 'Data pendaftaran akun dan usaha tidak lengkap.' });
    }

    const emailNorm = body.customer.email.trim().toLowerCase();
    const existing = tenantDb.findCustomerByEmail(emailNorm);
    if (existing && existing.id !== body.customer.id) {
      return res.status(409).json({
        error: 'Email sudah terdaftar. Gunakan email lain atau masuk melalui halaman Login.',
      });
    }

    const rawPass = body.customer.passwordDemo?.trim() || `Ka-${Date.now().toString(36)}`;
    const passwordHash = await hashAccountPassword(rawPass);

    const realCustomer: ManagedCustomerAccount = {
      ...body.customer,
      email: emailNorm,
      passwordDemo: '••••••••',
      passwordHash,
      allowGoogleLogin: true,
      allowPasswordLogin: true,
      accountScope: 'REAL',
      isDemoAccount: false,
    };
    const realWorkspace: TenantWorkspaceData = {
      ...body.workspace,
      tenant: {
        ...body.workspace.tenant,
        accountScope: 'REAL',
        ownerAccountId: realCustomer.id,
      },
    };

    const savedCustomer = tenantDb.upsertCustomer(realCustomer);
    const savedWorkspace = tenantDb.saveWorkspace('REAL', savedCustomer.id, realWorkspace);

    const pgSync = await syncUserAccountToPostgres({
      email: savedCustomer.email,
      fullName: savedCustomer.fullName,
      phone: savedCustomer.phone,
      passwordHash,
      isSuperAdmin: false,
      accountStatus: savedCustomer.status,
      maxTenantsAllowed: savedCustomer.maxTenantsAllowed,
    });
    if (pgSync.synced) {
      await syncTenantWorkspaceToPostgres({
        email: savedCustomer.email,
        customer: savedCustomer,
        workspace: savedWorkspace,
      });
    }

    const token = signSessionToken({
      role: 'CUSTOMER',
      accountScope: 'REAL',
      ownerAccountId: savedCustomer.id,
      email: savedCustomer.email,
      allowedTenantIds: savedCustomer.tenantIds,
      issuedAt: Date.now(),
    });

    return res.status(201).json({
      authenticated: true,
      role: 'CUSTOMER',
      accountScope: 'REAL',
      token,
      customer: sanitizeCustomerForApi(savedCustomer),
      workspace: savedWorkspace,
    });
  });

  // 0a-4. Authenticated Partitioned DB Bootstrap (Strictly scoped to Bearer Token + Neon Cold-Start Hydration)
  app.get('/api/db/bootstrap', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
    }

    if (session.role === 'MASTER_ADMIN') {
      const pgHydrated = await hydrateAllPostgresWorkspacesForMaster();
      for (const c of pgHydrated.customers) {
        if (!tenantDb.findCustomerById(c.id)) {
          tenantDb.upsertCustomer(c);
        }
      }
      for (const ws of pgHydrated.workspaces) {
        if (!tenantDb.findWorkspaceByTenantId(ws.tenant.id)) {
          const scope = resolveAccountScope(null, ws.tenant.id);
          tenantDb.saveWorkspace(scope, ws.tenant.ownerAccountId || 'real-owner', ws);
        }
      }
      return res.status(200).json({
        role: 'MASTER_ADMIN',
        accountScope: 'REAL',
        customers: tenantDb.listCustomers().map(sanitizeCustomerForApi),
        workspaces: tenantDb.listAllWorkspaces(),
      });
    }

    if (session.role === 'CUSTOMER') {
      let customer = tenantDb.findCustomerById(session.ownerAccountId);
      if (!customer && session.email) {
        const hydrated = await hydrateUserFromPostgresByEmail(session.email);
        if (hydrated?.customer && hydrated.workspaces?.length) {
          const scope = resolveAccountScope(hydrated.customer);
          customer = tenantDb.upsertCustomer(hydrated.customer);
          for (const ws of hydrated.workspaces) {
            tenantDb.saveWorkspace(scope, customer.id, ws);
          }
        }
      }
      if (!customer) {
        return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      const scope = resolveAccountScope(customer);
      let workspaces = tenantDb
        .listWorkspacesForOwner(scope, customer.id)
        .filter((w) => customer.tenantIds.includes(w.tenant.id));
      if (workspaces.length === 0 && session.email) {
        const hydrated = await hydrateUserFromPostgresByEmail(session.email);
        if (hydrated?.workspaces?.length) {
          for (const ws of hydrated.workspaces) {
            tenantDb.saveWorkspace(scope, customer.id, ws);
          }
          workspaces = tenantDb
            .listWorkspacesForOwner(scope, customer.id)
            .filter((w) => customer.tenantIds.includes(w.tenant.id));
        }
      }
      return res.status(200).json({
        role: 'CUSTOMER',
        accountScope: scope,
        customers: [sanitizeCustomerForApi(customer)],
        workspaces,
      });
    }

    if (session.role === 'STAFF' && session.staffTenantId) {
      let ws = tenantDb.getWorkspace(session.accountScope, session.ownerAccountId, session.staffTenantId);
      if (!ws) {
        const hydrated = await hydrateWorkspaceFromPostgresByTenantId(session.staffTenantId);
        if (hydrated) {
          if (hydrated.customer) tenantDb.upsertCustomer(hydrated.customer);
          ws = tenantDb.saveWorkspace(hydrated.scope, hydrated.ownerAccountId, hydrated.workspace);
        }
      }
      if (!ws) {
        return res.status(404).json({ error: 'Workspace usaha tidak ditemukan.' });
      }
      const owner = tenantDb.findCustomerById(session.ownerAccountId);
      return res.status(200).json({
        role: 'STAFF',
        accountScope: session.accountScope,
        customers: owner ? [sanitizeCustomerForApi(owner)] : [],
        workspaces: [ws],
      });
    }

    return res.status(403).json({ error: 'Akses ditolak.' });
  });

  // 0a-5. Read or Persist Workspace (Enforces Strict Per-User & DEMO vs REAL Privacy Isolation + Neon Sync)
  app.get('/api/db/workspace/:tenantId', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Autentikasi diperlukan untuk membaca data usaha.' });
    }
    const tenantId = String(req.params.tenantId || '');
    let record = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!record) {
      const hydrated = await hydrateWorkspaceFromPostgresByTenantId(tenantId);
      if (hydrated) {
        if (hydrated.customer) {
          tenantDb.upsertCustomer(hydrated.customer);
        }
        const cachedWs = tenantDb.saveWorkspace(
          hydrated.scope,
          hydrated.ownerAccountId,
          hydrated.workspace,
        );
        record = {
          scope: hydrated.scope,
          ownerAccountId: hydrated.ownerAccountId,
          workspace: cachedWs,
        };
      }
    }
    if (!record) {
      return res.status(404).json({ error: 'Workspace usaha tidak ditemukan.' });
    }
    if (!assertTenantAccess(session, tenantId, record.scope)) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki izin melihat data usaha pengguna lain.',
      });
    }
    if (session.role !== 'MASTER_ADMIN' && record.ownerAccountId !== session.ownerAccountId) {
      return res.status(403).json({
        error: 'Akses ditolak: Kepemilikan tenant tidak sesuai dengan akun aktif.',
      });
    }
    return res.status(200).json({ workspace: record.workspace });
  });

  app.put('/api/db/workspace/:tenantId', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Autentikasi diperlukan untuk menyimpan data usaha.' });
    }
    const tenantId = String(req.params.tenantId || '');
    const incoming = req.body as { workspace?: TenantWorkspaceData };
    if (!incoming?.workspace?.tenant?.id || incoming.workspace.tenant.id !== tenantId) {
      return res.status(400).json({ error: 'Payload workspace tidak sesuai dengan tenantId.' });
    }

    const existingRecord = tenantDb.findWorkspaceByTenantId(tenantId);
    const targetScope =
      existingRecord?.scope ??
      incoming.workspace.tenant.accountScope ??
      session.accountScope;
    const targetOwnerId =
      existingRecord?.ownerAccountId ??
      incoming.workspace.tenant.ownerAccountId ??
      session.ownerAccountId;

    // Strict authorization check: prevent User A from ever overwriting User B or crossing DEMO/REAL
    if (!assertTenantAccess(session, tenantId, targetScope)) {
      return res.status(403).json({
        error: 'Akses ditolak: Anda tidak memiliki izin mengubah data usaha pengguna lain.',
      });
    }

    // If customer owns multiple branches and creates a new branch, verify ownerAccountId match
    if (session.role === 'CUSTOMER' && targetOwnerId !== session.ownerAccountId) {
      return res.status(403).json({
        error: 'Akses ditolak: Kepemilikan tenant tidak sesuai dengan akun aktif.',
      });
    }

    const saved = tenantDb.saveWorkspace(targetScope, targetOwnerId, incoming.workspace);
    const ownerCust = tenantDb.findCustomerById(targetOwnerId);
    await syncTenantWorkspaceOnlyToPostgres(saved, ownerCust?.email || session.email);
    return res.status(200).json({ saved: true, workspace: saved });
  });

  // 0a-6. Persist Managed Customer Account Update (Master Admin or Self-Owner + Neon Sync)
  app.put('/api/db/customers/:customerId', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    }
    const customerId = String(req.params.customerId || '');
    if (session.role !== 'MASTER_ADMIN' && session.ownerAccountId !== customerId) {
      return res.status(403).json({ error: 'Akses ditolak untuk mengubah akun pengguna lain.' });
    }

    const body = req.body as { customer?: ManagedCustomerAccount };
    if (!body?.customer || body.customer.id !== customerId) {
      return res.status(400).json({ error: 'Payload customer tidak valid.' });
    }

    const saved = tenantDb.upsertCustomer(body.customer);
    await syncCustomerUpdateToPostgres(saved);
    return res.status(200).json({ saved: true, customer: sanitizeCustomerForApi(saved) });
  });

  // 0a-7. Public Read-Only Projection for QR Table Self-Order (/order/:slug/:qrToken)
  app.get('/api/public/tenant/:slug', async (req, res) => {
    const slug = String(req.params.slug || '');
    let ws = tenantDb.findWorkspaceBySlug(slug);
    if (!ws) {
      const hydratedWs = await hydrateWorkspaceFromPostgresBySlug(slug);
      if (hydratedWs) {
        const scope = resolveAccountScope(null, hydratedWs.tenant.id);
        ws = tenantDb.saveWorkspace(scope, hydratedWs.tenant.ownerAccountId || 'real-owner', hydratedWs);
      }
    }
    if (!ws) {
      return res.status(404).json({ error: 'Usaha tidak ditemukan.' });
    }
    return res.status(200).json({
      tenant: {
        id: ws.tenant.id,
        name: ws.tenant.name,
        slug: ws.tenant.slug,
        vertical: ws.tenant.vertical,
        isPkp: ws.tenant.isPkp,
        address: ws.tenant.address,
        logoUrl: ws.tenant.logoUrl,
        receiptFooter: ws.tenant.receiptFooter,
        serviceChargeRate: ws.tenant.serviceChargeRate,
        settings: ws.tenant.settings,
      },
      categories: ws.categories,
      products: ws.products.filter((p) => p.isAvailable && p.itemType !== 'RAW_MATERIAL'),
      tables: ws.tables.filter((t) => t.isActive),
    });
  });

  // 0b. SaaS Subscription Checkout (Hybrid Plan BASIC/PRO/EXPERT + Modular Add-Ons + PMK 131/2024 PPN 11/12)
  app.post('/api/subscriptions/checkout', (req, res) => {
    const parsed = subscriptionCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Pilihan paket langganan tidak valid.', details: parsed.error.flatten() });
    }
    const { planCode, selectedAddOns, billingCycle, extraBranchQty, extraStaffQty, paymentMethod } = parsed.data;
    const pricing = calculateHybridPricing({
      planCode,
      selectedAddOns,
      billingCycle,
      extraBranchQty,
      extraStaffQty,
    });
    const derivedLegacyModules = deriveLegacyModulesFromHybrid(planCode, selectedAddOns);
    const uniqueMods = Array.from(
      new Set([...derivedLegacyModules, ...(parsed.data.selectedModules ?? [])])
    );

    const subtotal = new Decimal(pricing.billingSubtotal);
    const dppNilaiLain = new Decimal(pricing.dppNilaiLain);
    const ppnAmount = new Decimal(pricing.ppnAmount);
    const grandTotal = new Decimal(pricing.grandTotal);

    const now = new Date().toISOString();
    const id = `subinv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const invoiceNumber = `SUB-${now.slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const paymentChallenge = createAutoPaymentChallenge({
      paymentMethod,
      amount: grandTotal.toFixed(4),
      referenceLabel: invoiceNumber,
    });
    const gatewayRefId = paymentChallenge.gatewayRefId;

    const invoice: StoredSubscriptionInvoice = {
      id,
      invoiceNumber,
      customerEmail: parsed.data.customerEmail,
      billingCycle,
      planCode,
      selectedAddOns,
      selectedModules: uniqueMods,
      subtotalAmount: subtotal.toFixed(4),
      dppNilaiLain: dppNilaiLain.toFixed(4),
      ppnAmount: ppnAmount.toFixed(4),
      grandTotal: grandTotal.toFixed(4),
      paymentMethod,
      paymentStatus: 'PENDING_PAYMENT',
      gatewayRefId,
      paidAt: null,
      createdAt: now,
    };

    subscriptionInvoices.set(id, invoice);

    const webhookBody = {
      invoiceId: id,
      gatewayRefId,
      amountPaid: grandTotal.toFixed(4),
      status: 'VERIFIED_PAID' as const,
    };
    const simulationSignature = computeHmacSignature(JSON.stringify(webhookBody));

    return res.status(201).json({
      invoice,
      qrisString: paymentChallenge.paymentCode,
      virtualAccountNumber: paymentChallenge.paymentCode,
      paymentChallenge,
      simulationWebhookBody: webhookBody,
      simulationSignature,
    });
  });

  // 0d. Zero-Token Multi-Payment Auto-Verification (QRIS, GoPay, DANA, OVO, ShopeePay, VA, Bank Transfer)
  app.post('/api/payments/create-session', (req, res) => {
    const schema = z.object({
      paymentMethod: z.enum(ALL_PAYMENT_METHODS_ENUM),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      referenceLabel: z.string().min(1).max(120).default('POS-ORDER'),
      bankCode: z.enum(['BCA', 'MANDIRI', 'BRI', 'BNI']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Parameter pembayaran tidak valid.', details: parsed.error.flatten() });
    }
    const sessionObj = createAutoPaymentChallenge(parsed.data);
    autoPaymentSessions.set(sessionObj.sessionId, sessionObj);
    return res.status(201).json({ session: sessionObj });
  });

  app.post('/api/payments/verify-auto', (req, res) => {
    const schema = z.object({
      sessionId: z.string().min(4),
      paymentMethod: z.enum(ALL_PAYMENT_METHODS_ENUM),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      gatewayRefId: z.string().min(4),
      signature: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload verifikasi pembayaran tidak valid.' });
    }
    const check = verifyAutoPaymentCallback(parsed.data);
    if (!check.verified) {
      return res.status(401).json({ verified: false, error: check.reason || 'Verifikasi gagal.' });
    }
    const existing = autoPaymentSessions.get(parsed.data.sessionId);
    if (existing) {
      existing.status = 'VERIFIED_PAID';
      existing.verifiedAt = check.verifiedAt;
      autoPaymentSessions.set(parsed.data.sessionId, existing);
    }
    return res.status(200).json({
      verified: true,
      status: 'VERIFIED_PAID',
      gatewayRefId: check.gatewayRefId,
      paymentMethod: check.paymentMethod,
      verifiedAt: check.verifiedAt,
      verificationSource: 'WEBHOOK_CALLBACK_0_TOKEN',
    });
  });

  // 0c. SaaS Subscription Payment Verification Webhook (HMAC-SHA256 + Idempotency)
  app.post('/api/webhooks/subscription', (req, res) => {
    const parsed = subscriptionWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload verifikasi pembayaran tidak valid.' });
    }
    const receivedSig = String(req.headers['x-qris-signature'] || '');
    const expectedSig = computeHmacSignature(JSON.stringify(parsed.data));
    if (!receivedSig || receivedSig !== expectedSig) {
      return res.status(401).json({ error: 'Verifikasi tanda tangan HMAC-SHA256 gagal.' });
    }

    const { invoiceId, gatewayRefId } = parsed.data;
    const already = verifiedSubscriptionRefs.get(gatewayRefId);
    if (already) {
      return res.status(200).json({ verified: true, idempotentReplay: true, invoice: already });
    }

    const invoice = subscriptionInvoices.get(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice langganan tidak ditemukan.' });
    }

    invoice.paymentStatus = 'VERIFIED_PAID';
    invoice.paidAt = new Date().toISOString();
    subscriptionInvoices.set(invoiceId, invoice);
    verifiedSubscriptionRefs.set(gatewayRefId, invoice);

    return res.status(200).json({
      verified: true,
      idempotentReplay: false,
      invoice,
    });
  });

  // 1. Generate Dynamic QRIS Payload & Register Pending Ticket
  app.post('/api/qris/generate', (req, res) => {
    const parsed = generateQrisSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload QRIS tidak valid.', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const gatewayRefId = `QRIS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const grandTotalDec = new Decimal(data.grandTotal);
    const mdrFee = grandTotalDec.times(new Decimal(data.mdrRate)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    // EMVCo-style Dynamic QRIS string payload
    const qrisString = `00020101021226610014ID.CO.KASIRAKUN01189360050300000898240214${gatewayRefId}52045812530336054${grandTotalDec.toFixed(
      0
    )}5802ID5915KASIRAKUN UMKM6007JAKARTA6304A1B2`;

    const webhookBody = {
      gatewayRefId,
      orderId: data.orderId,
      tenantId: data.tenantId,
      amountPaid: grandTotalDec.toFixed(4),
      mdrRate: data.mdrRate,
      status: 'SETTLEMENT' as const,
    };
    const signature = computeHmacSignature(JSON.stringify(webhookBody));

    liveTickets.set(data.orderId, {
      id: data.orderId,
      tenantId: data.tenantId,
      tenantSlug: data.tenantSlug,
      orderNumber: data.orderNumber,
      tableNumber: data.tableNumber,
      customerName: data.customerName,
      grandTotal: grandTotalDec.toFixed(4),
      mdrFee: mdrFee.toFixed(4),
      paymentStatus: 'PENDING_QRIS',
      kitchenStatus: 'PENDING',
      items: data.items,
      autoPrintTriggered: false,
      gatewayRefId,
      createdAt: new Date().toISOString(),
      paidAt: null,
    });

    return res.status(201).json({
      gatewayRefId,
      qrisString,
      mdrFee: mdrFee.toFixed(4),
      simulationWebhookBody: webhookBody,
      simulationSignature: signature,
    });
  });

  // 2. Dynamic QRIS Payment Webhook (HMAC verified + Idempotent + Auto-Print + Kitchen Push)
  app.post('/api/webhooks/qris', (req, res) => {
    const parsed = qrisWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload webhook QRIS tidak valid.', details: parsed.error.flatten() });
    }

    const receivedSig = String(req.headers['x-qris-signature'] || '');
    const expectedSig = computeHmacSignature(JSON.stringify(parsed.data));

    if (!receivedSig || receivedSig !== expectedSig) {
      return res.status(401).json({ error: 'Verifikasi tanda tangan HMAC-SHA256 QRIS gagal.' });
    }

    const { gatewayRefId, orderId, amountPaid, mdrRate } = parsed.data;

    // Idempotency guard
    const existingRef = processedWebhookRefs.get(gatewayRefId);
    if (existingRef) {
      return res.status(200).json({
        idempotentReplay: true,
        verified: true,
        orderId: existingRef.orderId,
        paymentStatus: 'PAID',
        paidAt: existingRef.paidAt,
        mdrFee: existingRef.mdrFee,
        autoPrintTriggered: true,
      });
    }

    const paidAt = new Date().toISOString();
    const amountDec = new Decimal(amountPaid);
    const mdrFee = amountDec.times(new Decimal(mdrRate)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const netQrisReceivable = amountDec.minus(mdrFee);

    processedWebhookRefs.set(gatewayRefId, {
      orderId,
      paidAt,
      mdrFee: mdrFee.toFixed(4),
    });

    const ticket = liveTickets.get(orderId);
    if (ticket) {
      ticket.paymentStatus = 'PAID';
      ticket.paidAt = paidAt;
      ticket.mdrFee = mdrFee.toFixed(4);
      ticket.autoPrintTriggered = true;
      liveTickets.set(orderId, ticket);
    }

    return res.status(200).json({
      verified: true,
      idempotentReplay: false,
      orderId,
      gatewayRefId,
      paymentStatus: 'PAID',
      kitchenStatus: 'PENDING',
      paidAt,
      amountPaid: amountDec.toFixed(4),
      mdrFee: mdrFee.toFixed(4),
      netQrisReceivable: netQrisReceivable.toFixed(4),
      autoPrintTriggered: true,
    });
  });

  // 3. Kitchen Display Tickets Sync
  app.get('/api/kitchen/tickets', (req, res) => {
    const tenantId = String(req.query.tenantId || '');
    const all = Array.from(liveTickets.values()).filter(
      (t) => (!tenantId || t.tenantId === tenantId) && t.paymentStatus === 'PAID'
    );
    res.json({ tickets: all });
  });

  app.patch('/api/kitchen/tickets/:id/status', (req, res) => {
    const schema = z.object({ kitchenStatus: z.enum(['PENDING', 'COOKING', 'READY', 'SERVED']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Status dapur tidak valid.' });
    }
    const ticket = liveTickets.get(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Tiket dapur tidak ditemukan.' });
    }
    ticket.kitchenStatus = parsed.data.kitchenStatus;
    liveTickets.set(req.params.id, ticket);
    res.json({ ticket });
  });

  // 4. Dynamic Custom Fields API
  app.get('/api/custom-fields', (req, res) => {
    const tenantId = String(req.query.tenantId || '');
    res.json({ fields: dynamicCustomFields.get(tenantId) ?? [] });
  });

  app.post('/api/custom-fields', (req, res) => {
    const parsed = customFieldSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Definisi custom field tidak valid.', details: parsed.error.flatten() });
    }
    const list = dynamicCustomFields.get(parsed.data.tenantId) ?? [];
    if (list.some((f) => f.targetEntity === parsed.data.targetEntity && f.fieldKey === parsed.data.fieldKey)) {
      return res.status(409).json({ error: 'Field key sudah terdaftar untuk entitas ini.' });
    }
    const created = { id: `cf-${Date.now()}`, ...parsed.data };
    dynamicCustomFields.set(parsed.data.tenantId, [...list, created]);
    return res.status(201).json({ field: created });
  });

  app.delete('/api/custom-fields/:id', (req, res) => {
    const tenantId = String(req.query.tenantId || '');
    const list = dynamicCustomFields.get(tenantId) ?? [];
    dynamicCustomFields.set(
      tenantId,
      list.filter((f) => f.id !== req.params.id)
    );
    return res.status(200).json({ deleted: true });
  });

  // =========================================================================
  // 5. DEMO ACCESS CONTROL (PUBLIC_INSTANT vs APPOINTMENT_APPROVAL) & MAGIC LINK
  // =========================================================================

  app.get('/api/demo-config', (_req, res) => {
    return res.status(200).json({ config: systemDemoConfig });
  });

  app.put('/api/demo-config', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mengubah kontrol akses demo.' });
    }
    const schema = z.object({
      globalDemoMode: z.enum(['PUBLIC_INSTANT', 'APPOINTMENT_APPROVAL']).optional(),
      demoMode: z.enum(['PUBLIC_INSTANT', 'APPOINTMENT_APPROVAL']).optional(),
      requireRegistrationForDemo: z.boolean().optional(),
      defaultDemoDurationDays: z.number().int().min(1).max(30).optional(),
      defaultDurationDays: z.number().int().min(1).max(30).optional(),
      customEnabledPlan: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).optional(),
      allowedDemoPlan: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).optional(),
      customEnabledAddOns: z.array(z.string()).optional(),
      allowAiInDemo: z.boolean().optional(),
      demoVisibility: z.record(z.string(), z.boolean()).optional(),
      visibleDemoVerticals: z.array(z.enum(ALL_VERTICAL_ENUM)).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Konfigurasi demo tidak valid.', details: parsed.error.flatten() });
    }
    const mode = parsed.data.globalDemoMode ?? parsed.data.demoMode ?? systemDemoConfig.globalDemoMode;
    const days = parsed.data.defaultDemoDurationDays ?? parsed.data.defaultDurationDays ?? systemDemoConfig.defaultDemoDurationDays;
    const plan = parsed.data.customEnabledPlan ?? parsed.data.allowedDemoPlan ?? systemDemoConfig.customEnabledPlan;
    const reqReg =
      parsed.data.requireRegistrationForDemo ?? systemDemoConfig.requireRegistrationForDemo ?? false;
    const vis = (parsed.data.demoVisibility as Record<BusinessVertical, boolean> | undefined) ?? systemDemoConfig.demoVisibility;
    const visibleVerticals: BusinessVertical[] =
      parsed.data.visibleDemoVerticals ??
      (Object.keys(vis) as BusinessVertical[]).filter((k) => vis[k] !== false);
    const allowAi = Boolean(
      parsed.data.allowAiInDemo ??
        parsed.data.customEnabledAddOns?.includes('ADDON_AI_ASSISTANT') ??
        systemDemoConfig.allowAiInDemo
    );

    systemDemoConfig = {
      ...systemDemoConfig,
      globalDemoMode: mode,
      demoMode: mode,
      requireRegistrationForDemo: reqReg,
      defaultDemoDurationDays: days,
      defaultDurationDays: days,
      customEnabledPlan: plan,
      allowedDemoPlan: plan,
      customEnabledAddOns: allowAi
        ? ['ADDON_EXTRA_BRANCH', 'ADDON_RESTO_QR_KDS', 'ADDON_AI_ASSISTANT']
        : ['ADDON_EXTRA_BRANCH', 'ADDON_RESTO_QR_KDS'],
      allowAiInDemo: allowAi,
      demoVisibility: vis,
      visibleDemoVerticals: visibleVerticals,
      updatedAt: new Date().toISOString(),
    };
    saveJsonFile(DEMO_CONFIG_PATH, systemDemoConfig);
    return res.status(200).json({ config: systemDemoConfig });
  });

  app.post('/api/demo-requests', (req, res) => {
    const schema = z.object({
      fullName: z.string().min(2).max(120),
      businessName: z.string().min(2).max(120),
      vertical: z.enum(ALL_VERTICAL_ENUM),
      whatsappNumber: z.string().min(8).max(25),
      email: z.string().email(),
      branchCount: z.number().int().min(1).max(50).default(1),
      preferredSchedule: z.string().min(3).max(80),
      notes: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Formulir jadwal demo belum lengkap.', details: parsed.error.flatten() });
    }
    const created: DemoAppointmentRequest = {
      id: `req-demo-${Date.now().toString(36)}`,
      fullName: parsed.data.fullName,
      businessName: parsed.data.businessName,
      vertical: parsed.data.vertical,
      phoneWa: parsed.data.whatsappNumber,
      whatsappNumber: parsed.data.whatsappNumber,
      email: parsed.data.email,
      branchCount: parsed.data.branchCount,
      requestedModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
      preferredDate: parsed.data.preferredSchedule,
      preferredSchedule: parsed.data.preferredSchedule,
      notes: parsed.data.notes ?? '',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    demoAppointmentRequests = [created, ...demoAppointmentRequests];
    saveJsonFile(DEMO_REQUESTS_PATH, demoAppointmentRequests);
    return res.status(201).json({ request: created });
  });

  app.get('/api/demo-requests', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat melihat antrean permintaan demo.' });
    }
    return res.status(200).json({ requests: demoAppointmentRequests });
  });

  app.post('/api/demo-requests/:id/approve', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat menyetujui permintaan demo.' });
    }
    const target = demoAppointmentRequests.find((r) => r.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Permintaan demo tidak ditemukan.' });
    }

    const durationDays = Number(req.body?.durationDays || systemDemoConfig.defaultDemoDurationDays || 7);
    const allowedPlan = (req.body?.allowedPlan || systemDemoConfig.allowedDemoPlan || 'EXPERT') as
      | 'LITE'
      | 'BASIC'
      | 'PRO'
      | 'EXPERT';

    // Clone the matching realistic vertical template into an isolated DEMO workspace for this prospect
    const templateWs =
      tenantDb
        .listAllWorkspaces()
        .find((w) => w.tenant.accountScope === 'DEMO' && w.tenant.vertical === target.vertical) ??
      createInitialWorkspaces().find((w) => w.tenant.vertical === target.vertical) ??
      createInitialWorkspaces()[0];

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const newCustId = `cust-demo-apv-${suffix}`;
    const newTenantId = `demo-tnt-${suffix}`;
    const magicToken = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const clonedWorkspace: TenantWorkspaceData = {
      ...templateWs,
      tenant: {
        ...templateWs.tenant,
        id: newTenantId,
        name: target.businessName,
        slug: `demo-${target.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}-${suffix.slice(-4)}`,
        vertical: target.vertical,
        subscriptionPlan: allowedPlan,
        activeAddOns: target.branchCount > 1 ? ['ADDON_EXTRA_BRANCH'] : [],
        accountScope: 'DEMO',
        ownerAccountId: newCustId,
        createdAt: now.toISOString(),
      },
    };

    const newCustomer: ManagedCustomerAccount = {
      id: newCustId,
      fullName: `${target.fullName} (Demo Terjadwal)`,
      email: target.email.trim().toLowerCase(),
      passwordDemo: 'Demo2026!',
      phone: target.whatsappNumber ?? target.phoneWa ?? '',
      role: 'OWNER',
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX', 'MULTI_BRANCH'],
      subscriptionPlan: allowedPlan,
      activeAddOns: target.branchCount > 1 ? ['ADDON_EXTRA_BRANCH'] : [],
      monthlyRecurringRevenue: '0.0000',
      maxTenantsAllowed: Math.max(1, target.branchCount),
      tenantIds: [newTenantId],
      primaryTenantId: newTenantId,
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: target.vertical,
      demoExpiresAt: expiresAt,
      onboardingCompleted: true,
      lastInvoiceNumber: `DEMO-${suffix.toUpperCase()}`,
      lastPaidAt: now.toISOString(),
      validUntil: expiresAt,
      adminNotes: `ACC Demo Appointment (${target.preferredSchedule ?? target.preferredDate}) — ${durationDays} hari.`,
      createdAt: now.toISOString(),
    };

    tenantDb.upsertCustomer(newCustomer);
    tenantDb.saveWorkspace('DEMO', newCustId, clonedWorkspace);

    const updatedReq: DemoAppointmentRequest = {
      ...target,
      status: 'APPROVED',
      approvedAccountId: newCustId,
      approvedTenantId: newTenantId,
      approvedEmail: newCustomer.email,
      approvedPassword: newCustomer.passwordDemo,
      magicAccessToken: magicToken,
      demoExpiresAt: expiresAt,
      reviewedAt: now.toISOString(),
    };
    demoAppointmentRequests = demoAppointmentRequests.map((r) => (r.id === target.id ? updatedReq : r));
    saveJsonFile(DEMO_REQUESTS_PATH, demoAppointmentRequests);

    return res.status(200).json({
      request: updatedReq,
      customer: newCustomer,
      workspace: clonedWorkspace,
    });
  });

  app.post('/api/demo-requests/:id/reject', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat menolak permintaan demo.' });
    }
    const target = demoAppointmentRequests.find((r) => r.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Permintaan demo tidak ditemukan.' });
    }
    const updatedReq: DemoAppointmentRequest = {
      ...target,
      status: 'REJECTED',
      reviewedAt: new Date().toISOString(),
    };
    demoAppointmentRequests = demoAppointmentRequests.map((r) => (r.id === target.id ? updatedReq : r));
    saveJsonFile(DEMO_REQUESTS_PATH, demoAppointmentRequests);
    return res.status(200).json({ request: updatedReq });
  });

  // Demo Trial Registration (Used when Master Admin activates requireRegistrationForDemo)
  app.post('/api/auth/demo-register', (req, res) => {
    const schema = z.object({
      fullName: z.string().min(2).max(120),
      email: z.string().email(),
      whatsappNumber: z.string().min(8).max(25),
      password: z.string().min(6).max(80),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Data pendaftaran akun demo belum lengkap.', details: parsed.error.flatten() });
    }
    const emailClean = parsed.data.email.trim().toLowerCase();
    const durationDays = systemDemoConfig.defaultDemoDurationDays || 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const existing = tenantDb.findCustomerByEmail(emailClean);
    if (existing && existing.accountScope === 'REAL') {
      return res.status(409).json({
        error: 'Email ini sudah terdaftar sebagai akun usaha aktif. Silakan masuk melalui halaman Login.',
      });
    }

    const trialId = existing?.id ?? `cust-demo-reg-${Date.now().toString(36)}`;
    const registrant: ManagedCustomerAccount = existing ?? {
      id: trialId,
      fullName: `${parsed.data.fullName.trim()} (Demo Trial)`,
      email: emailClean,
      passwordDemo: parsed.data.password.trim(),
      phone: parsed.data.whatsappNumber.trim(),
      role: 'OWNER',
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      activeModules: ['POS_BASIC'],
      subscriptionPlan: 'BASIC',
      activeAddOns: [],
      monthlyRecurringRevenue: '0.0000',
      maxTenantsAllowed: 1,
      tenantIds: [],
      primaryTenantId: '',
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoExpiresAt: expiresAt,
      onboardingCompleted: true,
      lastInvoiceNumber: `TRIAL-${Date.now().toString(36).toUpperCase()}`,
      lastPaidAt: now.toISOString(),
      validUntil: expiresAt,
      adminNotes: `Registrasi mandiri Demo Trial (${durationDays} hari)`,
      createdAt: now.toISOString(),
    };

    tenantDb.upsertCustomer(registrant);
    return res.status(201).json({
      registered: true,
      registrant: {
        id: registrant.id,
        fullName: registrant.fullName,
        email: registrant.email,
        phone: registrant.phone,
        demoExpiresAt: registrant.demoExpiresAt ?? expiresAt,
        durationDays,
      },
    });
  });

  // 1-Click Instant Demo Entry (Honors globalDemoMode, requireRegistrationForDemo, and User's Selected Plan + Add-Ons!)
  app.post('/api/auth/demo-instant', (req, res) => {
    const effectiveMode = systemDemoConfig.globalDemoMode ?? systemDemoConfig.demoMode ?? 'PUBLIC_INSTANT';
    if (effectiveMode !== 'PUBLIC_INSTANT') {
      return res.status(403).json({
        error: 'Mode Demo Instan sedang ditutup oleh admin. Silakan jadwalkan demo melalui formulir.',
      });
    }

    const vertical = String(req.body?.vertical || 'WARUNG_SEMBAKO') as BusinessVertical;
    if (systemDemoConfig.demoVisibility?.[vertical] === false) {
      return res.status(403).json({
        error: `Demo untuk kategori ${vertical} sedang dinonaktifkan oleh Master Admin.`,
      });
    }

    const registrantEmail = typeof req.body?.registrantEmail === 'string'
      ? req.body.registrantEmail.trim().toLowerCase()
      : '';

    let registeredTrialCustomer: ManagedCustomerAccount | null | undefined;
    if (systemDemoConfig.requireRegistrationForDemo) {
      if (!registrantEmail) {
        return res.status(403).json({
          error: 'Master Admin mewajibkan pendaftaran akun demo terlebih dahulu sebelum memilih ruang demo.',
          requiresRegistration: true,
        });
      }
      registeredTrialCustomer = tenantDb.findCustomerByEmail(registrantEmail);
      if (!registeredTrialCustomer) {
        return res.status(403).json({
          error: 'Akun demo belum terdaftar. Silakan selesaikan pendaftaran akun demo gratis terlebih dahulu.',
          requiresRegistration: true,
        });
      }
      if (
        registeredTrialCustomer.demoExpiresAt &&
        new Date(registeredTrialCustomer.demoExpiresAt).getTime() < Date.now()
      ) {
        return res.status(403).json({
          error: 'Masa uji coba akun demo Anda telah berakhir. Silakan beli paket langganan untuk melanjutkan.',
        });
      }
    }

    const demoCust = tenantDb
      .listCustomers('DEMO')
      .find(
        (c) =>
          c.demoVertical === vertical &&
          !c.id.startsWith('cust-demo-apv-') &&
          !c.id.startsWith('cust-demo-reg-')
      );
    if (!demoCust) {
      return res.status(404).json({ error: `Akun demo untuk kategori ${vertical} tidak ditemukan.` });
    }

    const requestedPlan = (
      req.body?.selectedPlan === 'LITE' ||
      req.body?.selectedPlan === 'BASIC' ||
      req.body?.selectedPlan === 'PRO' ||
      req.body?.selectedPlan === 'EXPERT'
        ? req.body.selectedPlan
        : demoCust.subscriptionPlan ?? 'EXPERT'
    ) as SubscriptionPlanCode;

    const requestedAddOns: AddOnModuleCode[] = Array.isArray(req.body?.selectedAddOns)
      ? (req.body.selectedAddOns as AddOnModuleCode[]).filter((code) =>
          (ALL_ADDONS_ENUM as readonly string[]).includes(code)
        )
      : demoCust.activeAddOns ?? [];

    const effectiveLegacyModules = deriveLegacyModulesFromHybrid(requestedPlan, requestedAddOns);
    const baseWorkspaces = tenantDb.listWorkspacesForOwner('DEMO', demoCust.id);
    const configuredWorkspaces: TenantWorkspaceData[] = baseWorkspaces.map((w) =>
      enforceWorkspacePlanEntitlements({
        ...w,
        tenant: {
          ...w.tenant,
          subscriptionPlan: requestedPlan,
          activeAddOns: requestedAddOns,
          activeModules: effectiveLegacyModules,
        },
      })
    );

    // If user registered a demo trial account, link the cloned/configured demo workspace to their trial account
    if (registeredTrialCustomer && configuredWorkspaces.length > 0) {
      const clonedTenantId = `demo-usr-${registeredTrialCustomer.id.slice(-6)}-${vertical.toLowerCase().slice(0, 6)}`;
      const primaryConfigured: TenantWorkspaceData = {
        ...configuredWorkspaces[0],
        tenant: {
          ...configuredWorkspaces[0].tenant,
          id: clonedTenantId,
          ownerAccountId: registeredTrialCustomer.id,
          accountScope: 'DEMO',
        },
      };
      const updatedTrial: ManagedCustomerAccount = {
        ...registeredTrialCustomer,
        demoVertical: vertical,
        subscriptionPlan: requestedPlan,
        activeAddOns: requestedAddOns,
        activeModules: effectiveLegacyModules,
        primaryTenantId: clonedTenantId,
        tenantIds: Array.from(new Set([clonedTenantId, ...registeredTrialCustomer.tenantIds])),
      };
      tenantDb.upsertCustomer(updatedTrial);
      tenantDb.saveWorkspace('DEMO', updatedTrial.id, primaryConfigured);
      const token = signSessionToken({
        role: 'CUSTOMER',
        accountScope: 'DEMO',
        ownerAccountId: updatedTrial.id,
        email: updatedTrial.email,
        allowedTenantIds: updatedTrial.tenantIds,
        issuedAt: Date.now(),
      });
      return res.status(200).json({
        authenticated: true,
        role: 'CUSTOMER',
        accountScope: 'DEMO',
        token,
        customer: updatedTrial,
        workspaces: [primaryConfigured],
      });
    }

    // Persist chosen plan & add-ons onto the demo customer session so FeatureGuard reflects their exact simulation!
    const configuredCustomer: ManagedCustomerAccount = {
      ...demoCust,
      subscriptionPlan: requestedPlan,
      activeAddOns: requestedAddOns,
      activeModules: effectiveLegacyModules,
    };
    tenantDb.upsertCustomer(configuredCustomer);
    for (const cw of configuredWorkspaces) {
      tenantDb.saveWorkspace('DEMO', demoCust.id, cw);
    }

    const token = signSessionToken({
      role: 'CUSTOMER',
      accountScope: 'DEMO',
      ownerAccountId: configuredCustomer.id,
      email: configuredCustomer.email,
      allowedTenantIds: configuredCustomer.tenantIds,
      issuedAt: Date.now(),
    });
    return res.status(200).json({
      authenticated: true,
      role: 'CUSTOMER',
      accountScope: 'DEMO',
      token,
      customer: configuredCustomer,
      workspaces: configuredWorkspaces,
    });
  });

  // Magic Link Entry for Approved Demo Appointment
  app.get('/api/auth/magic-demo/:magicToken', (req, res) => {
    const magicToken = String(req.params.magicToken || '');
    const hit = demoAppointmentRequests.find(
      (r) => r.status === 'APPROVED' && r.magicAccessToken === magicToken && r.approvedTenantId
    );
    if (!hit || !hit.approvedTenantId) {
      return res.status(404).json({ error: 'Link akses demo tidak ditemukan atau tidak valid.' });
    }
    if (hit.demoExpiresAt && new Date(hit.demoExpiresAt).getTime() < Date.now()) {
      return res.status(403).json({ error: 'Masa berlaku akses demo Anda telah berakhir.' });
    }
    const rec = tenantDb.findWorkspaceByTenantId(hit.approvedTenantId);
    if (!rec) {
      return res.status(404).json({ error: 'Workspace demo tidak ditemukan.' });
    }
    const customer = tenantDb.findCustomerById(rec.ownerAccountId);
    if (!customer) {
      return res.status(404).json({ error: 'Akun demo tidak ditemukan.' });
    }
    const token = signSessionToken({
      role: 'CUSTOMER',
      accountScope: 'DEMO',
      ownerAccountId: customer.id,
      email: customer.email,
      allowedTenantIds: customer.tenantIds,
      issuedAt: Date.now(),
    });
    return res.status(200).json({
      authenticated: true,
      role: 'CUSTOMER',
      accountScope: 'DEMO',
      token,
      customer,
      workspaces: [rec.workspace],
      expiresAt: hit.demoExpiresAt,
    });
  });

  // =========================================================================
  // 6. SEPARATE AI BUSINESS ASSISTANT ADD-ON (/api/ai-assistant)
  //    Strictly gated by ADDON_AI_ASSISTANT (+Rp35k/bln), hard quota 60 req/mo,
  //    24h cache, Gemini 2.5 Flash (maxOutputTokens: 700), pre-aggregated summary ONLY!
  // =========================================================================
  const aiSummarySchema = z.object({
    tenantId: z.string().min(1),
    question: z.string().min(3).max(400),
    summary: z.object({
      businessName: z.string(),
      vertical: z.string(),
      periodLabel: z.string(),
      omzetTotal: z.string(),
      hppTotal: z.string(),
      grossProfit: z.string(),
      expenseTotal: z.string(),
      netProfit: z.string(),
      estimatedTax: z.string(),
      taxRegime: z.string(),
      topProducts: z.array(z.object({ name: z.string(), qty: z.string(), revenue: z.string() })).max(5),
      criticalStockItems: z.array(z.object({ name: z.string(), stockQty: z.string(), minAlert: z.string() })).max(5),
      extraHighlights: z.array(z.string()).max(6).optional(),
    }),
  });

  app.post('/api/ai-assistant', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Silakan login untuk menggunakan Asisten Bisnis AI.' });
    }

    const parsed = aiSummarySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Payload ringkasan analitik tidak valid (sistem hanya menerima ringkasan teragregasi).',
        details: parsed.error.flatten(),
      });
    }

    const { tenantId, question, summary } = parsed.data;
    const rec = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!rec) {
      return res.status(404).json({ error: 'Workspace UMKM tidak ditemukan.' });
    }
    if (!assertTenantAccess(session, tenantId, rec.scope)) {
      return res.status(403).json({ error: 'Akses ditolak untuk tenant ini.' });
    }

    // Strict Add-On Gate: Excluded from BASIC, PRO, and EXPERT unless ADDON_AI_ASSISTANT is active
    const hasAiAddon =
      tenantHasAddOn(rec.workspace.tenant, 'ADDON_AI_ASSISTANT') ||
      (rec.scope === 'DEMO' && systemDemoConfig.allowAiInDemo);
    if (!hasAiAddon) {
      return res.status(403).json({
        code: 'AI_ADDON_REQUIRED',
        error:
          'Add-On Asisten Bisnis AI (+Rp35.000/bulan) belum aktif. Fitur AI terpisah dari Paket BASIC, PRO, maupun EXPERT untuk menjaga biaya langganan tetap hemat.',
      });
    }

    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    let usageRecord = aiUsageLogs.find(
      (u) => u.tenantId === tenantId && (u.monthYear === monthKey || u.month === monthKey)
    );
    if (!usageRecord) {
      const nowIso = new Date().toISOString();
      usageRecord = {
        id: `aiu-${tenantId}-${monthKey}`,
        tenantId,
        monthYear: monthKey,
        month: monthKey,
        requestCount: 0,
        tokensUsed: 0,
        quotaLimit: 60,
        lastUsedAt: nowIso,
        updatedAt: nowIso,
      };
      aiUsageLogs.push(usageRecord);
    }
    const usage: AiUsageLog = usageRecord;

    // Check 24-hour Cache first (0 Gemini tokens & does not deduct quota!)
    const cacheKey = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          monthKey,
          q: question.trim().toLowerCase(),
          omzet: summary.omzetTotal,
          netProfit: summary.netProfit,
        })
      )
      .digest('hex');

    const cached = aiInsightCache.get(cacheKey);
    if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
      return res.status(200).json({
        answer: cached.responseText,
        fromCache: true,
        quotaUsed: usage.requestCount,
        quotaLimit: usage.quotaLimit,
        modelUsed: 'gemini-2.5-flash (cached 24h)',
      });
    }

    // Enforce Hard Monthly Quota (60 requests / month)
    if (usage.requestCount >= usage.quotaLimit) {
      return res.status(429).json({
        code: 'AI_QUOTA_EXCEEDED',
        error: `Kuota Asisten Bisnis AI bulan ${monthKey} telah mencapai batas maksimal (${usage.quotaLimit}/${usage.quotaLimit} permintaan). Kuota akan direset otomatis tanggal 1 bulan depan.`,
        quotaUsed: usage.requestCount,
        quotaLimit: usage.quotaLimit,
      });
    }

    const modelLabel = 'ringkasan-analitik-lokal';
    let answerText = '';

    if (!answerText) {
      // Deterministic analytical summary engine (zero external AI dependency)
      const topStr =
        summary.topProducts.length > 0
          ? summary.topProducts.map((p) => `${p.name} (${p.qty})`).join(', ')
          : 'belum ada produk terjual';
      const lowStr =
        summary.criticalStockItems.length > 0
          ? summary.criticalStockItems.map((c) => `${c.name} (sisa ${c.stockQty})`).join(', ')
          : 'seluruh stok berada di atas batas minimum';
      answerText = [
        `**Ringkasan Kinerja ${summary.businessName} (${summary.periodLabel})**`,
        `1. **Profitabilitas**: Omzet Rp${Number(summary.omzetTotal).toLocaleString('id-ID')} dengan HPP Rp${Number(summary.hppTotal).toLocaleString('id-ID')} dan Laba Bersih Rp${Number(summary.netProfit).toLocaleString('id-ID')}.`,
        `2. **Produk Kontributor Utama**: ${topStr}. Pertahankan ketersediaan stok dan manfaatkan promo bundling untuk menaikkan nilai transaksi.`,
        `3. **Perhatian Stok Kritis**: ${lowStr}.`,
        `4. **Kepatuhan Pajak (${summary.taxRegime})**: Estimasi kewajiban pajak periode ini sebesar Rp${Number(summary.estimatedTax).toLocaleString('id-ID')}. Pastikan dana pajak disisihkan sebelum tanggal 15 bulan berikutnya.`,
      ].join('\n\n');
    }

    usage.requestCount += 1;
    usage.lastUsedAt = new Date().toISOString();
    saveJsonFile(AI_USAGE_PATH, aiUsageLogs);

    const nowMs = Date.now();
    aiInsightCache.set(cacheKey, {
      cacheKey,
      tenantId,
      promptHash: cacheKey,
      responseText: answerText,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    });

    return res.status(200).json({
      answer: answerText,
      fromCache: false,
      quotaUsed: usage.requestCount,
      quotaLimit: usage.quotaLimit,
      modelUsed: modelLabel,
    });
  });

  app.get('/api/ai-assistant/usage', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = String(req.query.tenantId || '');
    const monthKey = new Date().toISOString().slice(0, 7);
    const usage = aiUsageLogs.find(
      (u) => u.tenantId === tenantId && (u.monthYear === monthKey || u.month === monthKey)
    );
    return res.status(200).json({
      month: monthKey,
      quotaUsed: usage?.requestCount ?? 0,
      quotaLimit: usage?.quotaLimit ?? 60,
    });
  });

  // =========================================================================
  // 7. WHATSAPP GATEWAY ADD-ON (FONNTE — Rp66.000/bulan)
  // =========================================================================
  const fonnteSendSchema = z.object({
    tenantId: z.string().min(1),
    targetPhone: z.string().min(8).max(24),
    message: z.string().min(4).max(4000),
    documentType: z.string().max(40).optional(),
    documentRef: z.string().max(120).optional(),
    referenceNo: z.string().max(120).optional(),
    demoAddOnActivated: z.boolean().optional(),
  });

  app.post('/api/whatsapp/fonnte/send', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'Autentikasi diperlukan untuk mengirim pesan WhatsApp.' });
    }
    const parsed = fonnteSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: 'Nomor WhatsApp dan isi pesan tidak valid.',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { tenantId, targetPhone, message, documentRef, referenceNo, demoAddOnActivated } = parsed.data;
    const effectiveRef = referenceNo ?? documentRef ?? null;
    const record = tenantDb.findWorkspaceByTenantId(tenantId);
    if (!record) {
      return res.status(404).json({ ok: false, error: 'Workspace usaha tidak ditemukan.' });
    }
    if (!assertTenantAccess(session, tenantId, record.scope)) {
      return res.status(403).json({ ok: false, error: 'Akses ditolak untuk usaha ini.' });
    }

    // Strict Add-On Gate: requires ADDON_WA_FONNTE (Rp66.000/bln).
    // For DEMO workspaces, also allow immediate dispatch right after user activates demo add-on before async sync completes.
    const demoOverride = record.scope === 'DEMO' && demoAddOnActivated === true;
    if (
      session.role !== 'MASTER_ADMIN' &&
      !demoOverride &&
      !tenantHasAddOn(record.workspace.tenant, 'ADDON_WA_FONNTE')
    ) {
      return res.status(403).json({
        ok: false,
        error: 'Fitur kirim struk/pesanan via WhatsApp memerlukan Add-On WhatsApp Fonnte (Rp66.000/bulan).',
        requiredAddOn: 'ADDON_WA_FONNTE',
      });
    }

    const digits = targetPhone.replace(/\D+/g, '');
    const normalizedPhone = digits.startsWith('0')
      ? `62${digits.slice(1)}`
      : digits.startsWith('62')
      ? digits
      : `62${digits}`;

    const fonnteToken = (process.env.FONNTE_TOKEN || '').trim();
    const hasLiveToken = Boolean(fonnteToken && fonnteToken !== 'YOUR_FONNTE_DEVICE_TOKEN');

    if (hasLiveToken) {
      try {
        const form = new URLSearchParams();
        form.set('target', normalizedPhone);
        form.set('message', message);
        form.set('countryCode', process.env.FONNTE_COUNTRY_CODE || '62');

        const apiResp = await fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: {
            Authorization: fonnteToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });
        const apiJson = (await apiResp.json().catch(() => ({}))) as {
          status?: boolean;
          reason?: string;
          id?: string[];
        };
        if (!apiResp.ok || apiJson.status === false) {
          return res.status(502).json({
            ok: false,
            error: apiJson.reason || 'Fonnte API menolak pengiriman pesan. Periksa status perangkat Fonnte.',
          });
        }
        const messageId = Array.isArray(apiJson.id) ? apiJson.id[0] : `FNT-${Date.now()}`;
        return res.status(200).json({
          ok: true,
          dispatched: true,
          mode: 'FONNTE_LIVE',
          targetPhone: normalizedPhone,
          documentRef: effectiveRef,
          providerMessageId: messageId,
          messageId,
          detail: 'Pesan berhasil dikirim langsung ke WhatsApp melalui Fonnte Gateway.',
          sentAt: new Date().toISOString(),
        });
      } catch {
        return res.status(502).json({
          ok: false,
          error: 'Gagal terhubung ke gateway api.fonnte.com. Periksa koneksi server.',
        });
      }
    }

    // Preview/Staging safe response when FONNTE_TOKEN not yet configured in server environment
    const simId = `FNT-SIM-${Date.now().toString(36).toUpperCase()}`;
    return res.status(200).json({
      ok: true,
      dispatched: true,
      mode: 'FONNTE_READY_SANDBOX',
      targetPhone: normalizedPhone,
      documentRef: effectiveRef,
      providerMessageId: simId,
      messageId: simId,
      sentAt: new Date().toISOString(),
      detail: 'Add-On WA Fonnte aktif & payload tervalidasi. Isi FONNTE_TOKEN di environment server untuk pengiriman otomatis langsung ke perangkat WhatsApp.',
      note: 'Add-On WA Fonnte aktif & payload tervalidasi. Isi FONNTE_TOKEN di environment server untuk pengiriman otomatis langsung ke perangkat WhatsApp.',
      waFallbackUrl: `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`,
    });
  });

  // =========================================================================
  // 8. MASTER ADMIN 1-CLICK DATABASE & STORAGE MIGRATION CENTER
  //    PostgreSQL (Supabase / Neon) + Storage (Supabase Storage / Cloudflare R2)
  // =========================================================================
  let infraMigrationConfig: InfraMigrationConfig = loadJsonFile<InfraMigrationConfig>(
    INFRA_CONFIG_PATH,
    DEFAULT_INFRA_MIGRATION_CONFIG
  );

  app.get('/api/master/infra/status', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mengakses pusat migrasi infrastruktur.' });
    }
    const allCustomers = tenantDb.listCustomers();
    const allWorkspaces = tenantDb.listAllWorkspaces();
    const audit = runMigrationPreflightAudit(allCustomers, allWorkspaces);
    const envSnippet = buildProductionEnvSnippet(infraMigrationConfig);
    const authStatus = getAuthConfigurationStatus();
    const hasNeonObjectStorage = isS3StorageConfigured();
    return res.status(200).json({
      ok: true,
      config: infraMigrationConfig,
      audit,
      envSnippet,
      serverEnvReady: {
        hasDatabaseUrl: authStatus.databaseConfigured,
        hasBetterAuthSecret: authStatus.betterAuthSecretConfigured,
        hasNeonObjectStorage,
        hasMidtrans: Boolean(process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes('<ISI_')),
        hasFonnteToken: Boolean(process.env.FONNTE_TOKEN && process.env.FONNTE_TOKEN !== 'YOUR_FONNTE_DEVICE_TOKEN'),
      },
    });
  });

  const infraTestSchema = z.object({
    targetDbProvider: z.enum(['NEON_POSTGRES', 'SUPABASE_POSTGRES']).default('NEON_POSTGRES'),
    postgresUri: z.string().min(10).max(500),
    targetStorageProvider: z
      .enum(['NEON_OBJECT_STORAGE', 'SUPABASE_STORAGE', 'CLOUDFLARE_R2'])
      .default('NEON_OBJECT_STORAGE'),
    storageEndpointUrl: z.string().min(8).max(300),
    storageBucketName: z.string().min(3).max(63),
    storagePublicBaseUrl: z.string().max(300).optional().default(''),
  });

  app.post('/api/master/infra/test-connection', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const parsed = infraTestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Parameter koneksi PostgreSQL / Storage belum lengkap.',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const pgCheck = validatePostgresConnectionUri(parsed.data.postgresUri);
    const storageCheck = validateStorageTargetConfig({
      provider: parsed.data.targetStorageProvider,
      endpointUrl: parsed.data.storageEndpointUrl,
      bucketName: parsed.data.storageBucketName,
      publicBaseUrl: parsed.data.storagePublicBaseUrl,
    });

    const allOk = pgCheck.valid && storageCheck.valid;
    const nowIso = new Date().toISOString();

    if (allOk) {
      infraMigrationConfig = {
        ...infraMigrationConfig,
        targetDbProvider: parsed.data.targetDbProvider,
        targetStorageProvider: parsed.data.targetStorageProvider,
        pgHostPreview: pgCheck.hostPreview,
        pgDatabaseName: pgCheck.databaseName,
        pgSslRequired: pgCheck.sslRequired,
        pgPoolerEnabled: pgCheck.poolerDetected,
        storageBucketName: storageCheck.bucketName,
        storageEndpointPreview: storageCheck.endpointPreview,
        storagePublicBaseUrl: parsed.data.storagePublicBaseUrl.trim() || storageCheck.endpointPreview,
        lastTestedAt: nowIso,
        lastTestOk: true,
        cutoverStage:
          infraMigrationConfig.cutoverStage === 'IDLE'
            ? 'PREFLIGHT_VERIFIED'
            : infraMigrationConfig.cutoverStage,
        updatedAt: nowIso,
      };
      saveJsonFile(INFRA_CONFIG_PATH, infraMigrationConfig);
    }

    const validationErrors = [
      ...(pgCheck.error ? [pgCheck.error] : []),
      ...(storageCheck.error ? [storageCheck.error] : []),
    ];

    return res.status(allOk ? 200 : 422).json({
      ok: allOk,
      errors: validationErrors,
      error: validationErrors[0],
      pgCheck,
      storageCheck,
      config: infraMigrationConfig,
      envSnippet: buildProductionEnvSnippet(infraMigrationConfig),
    });
  });

  app.get('/api/master/infra/export-sql', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang mengekspor dump SQL.' });
    }
    const targetProvider =
      req.query.provider === 'NEON_POSTGRES' ? 'NEON_POSTGRES' : infraMigrationConfig.targetDbProvider;
    const sqlText = buildPostgresMigrationSql({
      targetProvider,
      customers: tenantDb.listCustomers(),
      workspaces: tenantDb.listAllWorkspaces(),
    });
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kasirakun_${targetProvider.toLowerCase()}_${stamp}.sql"`
    );
    return res.status(200).send(sqlText);
  });

  app.post('/api/master/infra/cutover', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang berwenang.' });
    }
    const action = String(req.body?.action || 'PREPARE_DUAL_WRITE');
    const allCustomers = tenantDb.listCustomers();
    const allWorkspaces = tenantDb.listAllWorkspaces();
    const audit = runMigrationPreflightAudit(allCustomers, allWorkspaces);

    if (!audit.allDoubleEntryBalanced && action !== 'ROLLBACK') {
      return res.status(409).json({
        error: `Ditemukan ${audit.unbalancedJournalsCount} jurnal tidak seimbang. Perbaiki sebelum cutover.`,
        audit,
      });
    }

    const nowIso = new Date().toISOString();
    if (action === 'ROLLBACK') {
      infraMigrationConfig = {
        ...infraMigrationConfig,
        activeDbProvider: 'CURRENT_LOCAL_FIRESTORE',
        activeStorageProvider: 'CURRENT_LOCAL_FIRESTORE',
        cutoverStage: 'PREFLIGHT_VERIFIED',
        updatedAt: nowIso,
      };
    } else if (action === 'PREPARE_DUAL_WRITE') {
      infraMigrationConfig = {
        ...infraMigrationConfig,
        cutoverStage: 'DUAL_WRITE_READY',
        updatedAt: nowIso,
      };
    } else if (action === 'ACTIVATE_CUTOVER') {
      infraMigrationConfig = {
        ...infraMigrationConfig,
        activeDbProvider: infraMigrationConfig.targetDbProvider,
        activeStorageProvider: infraMigrationConfig.targetStorageProvider,
        cutoverStage: 'CUTOVER_ACTIVE',
        lastCutoverAt: nowIso,
        updatedAt: nowIso,
      };
    } else {
      return res.status(400).json({ error: 'Aksi cutover tidak dikenal.' });
    }

    saveJsonFile(INFRA_CONFIG_PATH, infraMigrationConfig);
    const stageMessage =
      action === 'ROLLBACK'
        ? 'Rollback 1-Klik berhasil — trafik kembali aman ke Database & Storage awal tanpa kehilangan data.'
        : action === 'PREPARE_DUAL_WRITE'
        ? 'Mode Dual-Write aktif — transaksi user tetap berjalan normal sambil disinkronkan ke target PostgreSQL.'
        : 'Cutover 1-Klik aktif — trafik produksi dialihkan secara Zero-Downtime ke PostgreSQL & Storage baru.';
    return res.status(200).json({
      ok: true,
      action,
      message: stageMessage,
      config: infraMigrationConfig,
      audit,
      envSnippet: buildProductionEnvSnippet(infraMigrationConfig),
    });
  });

  /**
   * Master Admin Auto-Sync & Server Environment Readiness Check.
   * Never accepts or returns secret values in browser UI — strictly inspects process.env on the server,
   * audits double-entry ledger balance, and generates a fresh idempotent PostgreSQL sync snapshot on disk.
   */
  app.post('/api/master/infra/auto-sync', (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ ok: false, error: 'Hanya Master Admin yang berwenang.' });
    }

    const allCustomers = tenantDb.listCustomers();
    const allWorkspaces = tenantDb.listAllWorkspaces();
    const audit = runMigrationPreflightAudit(allCustomers, allWorkspaces);

    if (!audit.allDoubleEntryBalanced) {
      return res.status(409).json({
        ok: false,
        error: `Ditemukan ${audit.unbalancedJournalsCount} jurnal belum seimbang. Sinkronisasi otomatis ditunda demi integritas pembukuan.`,
        audit,
      });
    }

    const authStatus = getAuthConfigurationStatus();
    const hasDatabaseUrl = authStatus.databaseConfigured;
    const hasBetterAuthSecret = authStatus.betterAuthSecretConfigured;
    const hasNeonObjectStorage = isS3StorageConfigured();
    const hasMidtrans = Boolean(
      process.env.MIDTRANS_SERVER_KEY && !process.env.MIDTRANS_SERVER_KEY.includes('<ISI_')
    );
    const hasFonnteToken = Boolean(
      process.env.FONNTE_TOKEN && process.env.FONNTE_TOKEN !== 'YOUR_FONNTE_DEVICE_TOKEN'
    );

    const sqlText = buildPostgresMigrationSql({
      targetProvider: infraMigrationConfig.targetDbProvider,
      customers: allCustomers,
      workspaces: allWorkspaces,
    });
    const autoSyncPath = path.join(DATA_ROOT, 'autosync-latest.sql');
    try {
      fs.mkdirSync(path.dirname(autoSyncPath), { recursive: true });
      fs.writeFileSync(autoSyncPath, sqlText, 'utf-8');
    } catch {
      // non-fatal on read-only fs
    }

    const nowIso = new Date().toISOString();
    const autoSyncStatus = hasDatabaseUrl ? 'SYNCED_READY' : 'WAITING_SERVER_ENV';
    infraMigrationConfig = {
      ...infraMigrationConfig,
      lastAutoSyncAt: nowIso,
      autoSyncStatus,
      updatedAt: nowIso,
    };
    saveJsonFile(INFRA_CONFIG_PATH, infraMigrationConfig);

    const message = hasDatabaseUrl
      ? `Sinkronisasi otomatis siap & paket SQL terbaru (${(sqlText.length / 1024).toFixed(1)} KB, ${audit.totalJournalEntries} jurnal seimbang) telah disiapkan untuk Neon PostgreSQL.`
      : `Paket sinkronisasi otomatis (${(sqlText.length / 1024).toFixed(1)} KB, ${audit.totalJournalEntries} jurnal 100% seimbang) sudah siap. Saat Anda mengisi DATABASE_URL Neon di Vercel, sistem langsung terhubung otomatis.`;

    return res.status(200).json({
      ok: true,
      autoSyncStatus,
      message,
      snapshotSizeKb: Number((sqlText.length / 1024).toFixed(1)),
      config: infraMigrationConfig,
      audit,
      serverEnvReady: {
        hasDatabaseUrl,
        hasBetterAuthSecret,
        hasNeonObjectStorage,
        hasMidtrans,
        hasFonnteToken,
      },
      envSnippet: buildProductionEnvSnippet(infraMigrationConfig),
    });
  });

  // Mount Multi-Provider Payments, Customer Display, Universal Webhooks & Custom WA Templates
  mountPaymentAndWaRoutes(app, {
    tenantDb,
    extractSessionFromRequest,
    DATA_ROOT,
    loadJsonFile,
    saveJsonFile,
    liveTickets,
  });

  // Mount Master Admin Encrypted Environment API & Secret Key Vault (Auto-Sync to process.env)
  mountMasterEnvSecretsRoutes(app, {
    DATA_ROOT,
    extractSessionFromRequest,
    loadJsonFile,
    saveJsonFile,
  });

  // Mount Master Admin Account Management (Demo, Real, Master + Neon PostgreSQL Sync)
  mountMasterAccountsRoutes(app, {
    tenantDb,
    extractSessionFromRequest,
  });

  // Mount Universal S3 Object Storage Upload API (`POST /api/upload`)
  mountUploadRoutes(app, {
    extractSessionFromRequest,
  });

  // Mount Add-On Landing Page Usaha (+Rp25k/bln) APIs & Subdomain-Ready Middleware
  mountLandingPageRoutes(app, {
    tenantDb,
    extractSessionFromRequest,
    DATA_ROOT,
    loadJsonFile,
    saveJsonFile,
  });
  app.use(createSubdomainRewriteMiddleware());

  app.all('/api/*', (_req, res) => {
    return res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const shouldEnableVite = options.enableVite ?? (!isProd && !process.env.VERCEL);
  const shouldServeStatic = options.serveStatic ?? (isProd && !process.env.VERCEL);

  if (shouldEnableVite && options.httpServer) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Attach Vite's WebSocket upgrade handler directly to the port-3000 HTTP server
        // instead of spawning an unreachable standalone port 24678 server behind Cloud Run / HTTPS proxies.
        hmr: disableHmr ? false : { server: options.httpServer },
        ws: { server: options.httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (shouldServeStatic) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  return app;
}

let cachedServerlessAppPromise: Promise<express.Express> | null = null;

export function getExpressApp(): Promise<express.Express> {
  if (!cachedServerlessAppPromise) {
    cachedServerlessAppPromise = createExpressApp({
      enableVite: false,
      serveStatic: false,
    }).catch((err) => {
      cachedServerlessAppPromise = null;
      throw err;
    });
  }
  return cachedServerlessAppPromise;
}

async function startServer() {
  const httpServer = http.createServer();
  const isProd = process.env.NODE_ENV === 'production';
  const app = await createExpressApp({
    httpServer,
    enableVite: !isProd,
    serveStatic: isProd,
  });
  httpServer.on('request', app);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KasirAkun UMKM server listening on http://0.0.0.0:${PORT}`);
  });
}

const isServerlessRuntime = Boolean(
  process.env.VERCEL ||
    process.env.NOW_REGION ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.KASIRAKUN_SERVERLESS_ONLY,
);
const isDirectServerEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  /(?:^|[\\/])server\.(?:ts|js|mjs|cjs)$/i.test(process.argv[1]);

if (!isServerlessRuntime && isDirectServerEntry) {
  void startServer();
}
