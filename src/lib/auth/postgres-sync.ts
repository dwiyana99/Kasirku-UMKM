/**
 * KasirAkun UMKM — Neon / PostgreSQL & Better Auth Persistence + Cold-Start Hydration
 * Synchronizes Master Admin, Real Customer, Demo accounts, full Tenant Workspaces
 * (products, orders, double-entry journals, rooms, settings), and Tenant Payment Configs
 * into Neon PostgreSQL so Vercel serverless deployments survive cold starts seamlessly.
 */

import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getPrismaClient, isDatabaseConfigured } from '../prisma.ts';
import type {
  BusinessVertical,
  ManagedCustomerAccount,
  SubscriptionPlanCode,
  TaxEntityType,
  TenantPaymentConfig,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import {
  buildMasterProvisionedAccountAndWorkspace,
  type MasterAdminAccountRecord,
} from './account-management.ts';
import { maskSecretKey } from '../payments/crypto.ts';
import { DEFAULT_ENABLED_CHANNELS } from '../payments/fee-calculator.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDeterministicUuid(input: string): string {
  const trimmed = input.trim();
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const hex = crypto.createHash('sha256').update(`kasirakun:${trimmed}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function buildTenantSettingsPayload(params: {
  customer?: Pick<
    ManagedCustomerAccount,
    'id' | 'accountScope' | 'subscriptionPlan' | 'billingCycle' | 'activeAddOns' | 'username' | 'idleTimeoutMinutes'
  >;
  workspace: TenantWorkspaceData;
  existingSettings?: unknown;
}): Record<string, unknown> {
  const prev =
    params.existingSettings &&
    typeof params.existingSettings === 'object' &&
    !Array.isArray(params.existingSettings)
      ? (params.existingSettings as Record<string, unknown>)
      : {};

  const ws = params.workspace;
  // Clone cleanly via JSON roundtrip to ensure plain JSONB compatibility
  const cleanSnapshot = JSON.parse(JSON.stringify(ws)) as TenantWorkspaceData;

  return {
    ...prev,
    legacyTenantId: ws.tenant.id,
    legacyCustomerId: params.customer?.id ?? ws.tenant.ownerAccountId ?? prev.legacyCustomerId ?? null,
    ownerUsername: params.customer?.username ?? prev.ownerUsername ?? null,
    ownerIdleTimeoutMinutes:
      params.customer?.idleTimeoutMinutes !== undefined
        ? params.customer.idleTimeoutMinutes
        : prev.ownerIdleTimeoutMinutes ?? 0,
    accountScope: params.customer?.accountScope ?? ws.tenant.accountScope ?? 'REAL',
    planCode: params.customer?.subscriptionPlan ?? ws.tenant.subscriptionPlan ?? 'BASIC',
    billingCycle: params.customer?.billingCycle ?? prev.billingCycle ?? 'MONTHLY',
    selectedAddOns: params.customer?.activeAddOns ?? ws.tenant.activeAddOns ?? [],
    businessWhatsappNumber: ws.tenant.settings?.businessWhatsappNumber ?? null,
    workspaceSnapshot: cleanSnapshot,
    snapshotUpdatedAt: new Date().toISOString(),
  };
}

export function extractWorkspaceSnapshotFromSettings(
  settings: unknown,
): TenantWorkspaceData | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }
  const snap = (settings as Record<string, unknown>).workspaceSnapshot;
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    return null;
  }
  const candidate = snap as Partial<TenantWorkspaceData>;
  if (!candidate.tenant?.id || !Array.isArray(candidate.products) || !Array.isArray(candidate.accounts)) {
    return null;
  }
  return candidate as TenantWorkspaceData;
}

export interface PostgresAccountSyncInput {
  email: string;
  fullName: string;
  phone?: string | null;
  passwordHash?: string | null;
  isSuperAdmin: boolean;
  accountStatus: string;
  maxTenantsAllowed?: number;
  emailVerified?: boolean;
}

export interface PostgresSyncResult {
  synced: boolean;
  reason?: 'DB_UNCONFIGURED' | 'ERROR';
  userId?: string;
}

export async function syncUserAccountToPostgres(
  input: PostgresAccountSyncInput,
): Promise<PostgresSyncResult> {
  if (!isDatabaseConfigured()) {
    return { synced: false, reason: 'DB_UNCONFIGURED' };
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    return { synced: false, reason: 'DB_UNCONFIGURED' };
  }

  const emailNorm = input.email.trim().toLowerCase();
  const safeName = input.fullName.trim().slice(0, 150) || emailNorm;
  const safeStatus = input.accountStatus.slice(0, 20);
  const safePhone = input.phone ? input.phone.trim().slice(0, 30) : null;

  try {
    const user = await prisma.user.upsert({
      where: { email: emailNorm },
      create: {
        email: emailNorm,
        name: safeName,
        fullName: safeName,
        phone: safePhone,
        passwordHash: input.passwordHash || null,
        emailVerified: input.emailVerified ?? true,
        isSuperAdmin: input.isSuperAdmin,
        accountStatus: safeStatus,
        maxTenantsAllowed: Math.max(1, input.maxTenantsAllowed ?? 3),
      },
      update: {
        name: safeName,
        fullName: safeName,
        ...(safePhone !== null ? { phone: safePhone } : {}),
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
        isSuperAdmin: input.isSuperAdmin,
        accountStatus: safeStatus,
        ...(input.maxTenantsAllowed !== undefined
          ? { maxTenantsAllowed: Math.max(1, input.maxTenantsAllowed) }
          : {}),
      },
    });

    if (input.passwordHash) {
      await prisma.authAccount.upsert({
        where: {
          providerId_accountId: {
            providerId: 'credential',
            accountId: user.id,
          },
        },
        create: {
          providerId: 'credential',
          accountId: user.id,
          userId: user.id,
          password: input.passwordHash,
        },
        update: {
          password: input.passwordHash,
        },
      });
    }

    return { synced: true, userId: user.id };
  } catch {
    return { synced: false, reason: 'ERROR' };
  }
}

export async function syncTenantWorkspaceToPostgres(params: {
  email: string;
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const prisma = getPrismaClient();
  if (!prisma) return false;

  const emailNorm = params.email.trim().toLowerCase();
  try {
    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
      select: { id: true },
    });
    if (!user) return false;

    const ws = params.workspace;
    const tenantUuid = toDeterministicUuid(ws.tenant.id);
    const slug = (ws.tenant.slug || ws.tenant.id).slice(0, 100);
    const safeVertical = ws.tenant.vertical as BusinessVertical;
    const safeTaxEntity = (ws.tenant.taxEntity || 'WP_OP') as TaxEntityType;

    const existingTenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantUuid }, { slug }] },
      select: { id: true, settings: true },
    });

    const settingsPayload = buildTenantSettingsPayload({
      customer: params.customer,
      workspace: ws,
      existingSettings: existingTenant?.settings,
    }) as unknown as Prisma.InputJsonValue;

    const verticalOpsPayload = (ws.verticalOps ?? {}) as unknown as Prisma.InputJsonValue;

    const tenant = existingTenant
      ? await prisma.tenant.update({
          where: { id: existingTenant.id },
          data: {
            name: ws.tenant.name.slice(0, 150),
            slug,
            vertical: safeVertical,
            taxEntity: safeTaxEntity,
            isPkp: Boolean(ws.tenant.isPkp),
            npwp16: ws.tenant.npwp16?.slice(0, 16) ?? null,
            nitku22: ws.tenant.nitku22?.slice(0, 22) ?? null,
            address: ws.tenant.address ?? null,
            logoUrl: ws.tenant.logoUrl ?? null,
            receiptFooter: ws.tenant.receiptFooter ?? undefined,
            planCode: (params.customer.subscriptionPlan ?? ws.tenant.subscriptionPlan ?? 'BASIC').slice(0, 30),
            settings: settingsPayload,
            verticalOpsJson: verticalOpsPayload,
          },
        })
      : await prisma.tenant.create({
          data: {
            id: tenantUuid,
            name: ws.tenant.name.slice(0, 150),
            slug,
            vertical: safeVertical,
            taxEntity: safeTaxEntity,
            isPkp: Boolean(ws.tenant.isPkp),
            npwp16: ws.tenant.npwp16?.slice(0, 16) ?? null,
            nitku22: ws.tenant.nitku22?.slice(0, 22) ?? null,
            address: ws.tenant.address ?? null,
            logoUrl: ws.tenant.logoUrl ?? null,
            receiptFooter: ws.tenant.receiptFooter ?? undefined,
            planCode: (params.customer.subscriptionPlan ?? ws.tenant.subscriptionPlan ?? 'BASIC').slice(0, 30),
            settings: settingsPayload,
            verticalOpsJson: verticalOpsPayload,
          },
        });

    await prisma.tenantMembership.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id,
        },
      },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'OWNER',
        isActive: true,
      },
      update: {
        role: 'OWNER',
        isActive: true,
      },
    });

    return true;
  } catch {
    return false;
  }
}

export async function syncTenantWorkspaceOnlyToPostgres(
  workspace: TenantWorkspaceData,
  ownerEmail?: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const prisma = getPrismaClient();
  if (!prisma) return false;

  try {
    const ws = workspace;
    const tenantUuid = toDeterministicUuid(ws.tenant.id);
    const slug = (ws.tenant.slug || ws.tenant.id).slice(0, 100);
    const safeVertical = ws.tenant.vertical as BusinessVertical;
    const safeTaxEntity = (ws.tenant.taxEntity || 'WP_OP') as TaxEntityType;

    const existingTenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantUuid }, { slug }] },
      select: { id: true, settings: true },
    });

    const settingsPayload = buildTenantSettingsPayload({
      workspace: ws,
      existingSettings: existingTenant?.settings,
    }) as unknown as Prisma.InputJsonValue;

    const verticalOpsPayload = (ws.verticalOps ?? {}) as unknown as Prisma.InputJsonValue;

    const tenant = existingTenant
      ? await prisma.tenant.update({
          where: { id: existingTenant.id },
          data: {
            name: ws.tenant.name.slice(0, 150),
            slug,
            vertical: safeVertical,
            taxEntity: safeTaxEntity,
            isPkp: Boolean(ws.tenant.isPkp),
            npwp16: ws.tenant.npwp16?.slice(0, 16) ?? null,
            nitku22: ws.tenant.nitku22?.slice(0, 22) ?? null,
            address: ws.tenant.address ?? null,
            logoUrl: ws.tenant.logoUrl ?? null,
            receiptFooter: ws.tenant.receiptFooter ?? undefined,
            planCode: (ws.tenant.subscriptionPlan ?? 'BASIC').slice(0, 30),
            settings: settingsPayload,
            verticalOpsJson: verticalOpsPayload,
          },
        })
      : await prisma.tenant.create({
          data: {
            id: tenantUuid,
            name: ws.tenant.name.slice(0, 150),
            slug,
            vertical: safeVertical,
            taxEntity: safeTaxEntity,
            isPkp: Boolean(ws.tenant.isPkp),
            npwp16: ws.tenant.npwp16?.slice(0, 16) ?? null,
            nitku22: ws.tenant.nitku22?.slice(0, 22) ?? null,
            address: ws.tenant.address ?? null,
            logoUrl: ws.tenant.logoUrl ?? null,
            receiptFooter: ws.tenant.receiptFooter ?? undefined,
            planCode: (ws.tenant.subscriptionPlan ?? 'BASIC').slice(0, 30),
            settings: settingsPayload,
            verticalOpsJson: verticalOpsPayload,
          },
        });

    if (ownerEmail) {
      const user = await prisma.user.findUnique({
        where: { email: ownerEmail.trim().toLowerCase() },
        select: { id: true },
      });
      if (user) {
        await prisma.tenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: user.id,
              tenantId: tenant.id,
            },
          },
          create: {
            userId: user.id,
            tenantId: tenant.id,
            role: 'OWNER',
            isActive: true,
          },
          update: {
            role: 'OWNER',
            isActive: true,
          },
        });
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function syncCustomerUpdateToPostgres(
  customer: ManagedCustomerAccount,
): Promise<boolean> {
  const res = await syncUserAccountToPostgres({
    email: customer.email,
    fullName: customer.fullName,
    phone: customer.phone,
    passwordHash: customer.passwordHash || undefined,
    isSuperAdmin: false,
    accountStatus: customer.status,
    maxTenantsAllowed: customer.maxTenantsAllowed,
  });
  return res.synced;
}

function hydrateTenantRowToWorkspace(params: {
  tenantRow: {
    id: string;
    name: string;
    slug: string;
    vertical: BusinessVertical;
    taxEntity: TaxEntityType;
    isPkp: boolean;
    npwp16: string | null;
    nitku22: string | null;
    address: string | null;
    logoUrl: string | null;
    receiptFooter: string | null;
    planCode: string;
    settings: unknown;
    verticalOpsJson: unknown;
  };
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  ownerStatus: string;
  maxTenantsAllowed: number;
  passwordHash: string | null;
}): { customer: ManagedCustomerAccount; workspace: TenantWorkspaceData } {
  const t = params.tenantRow;
  const settingsObj =
    t.settings && typeof t.settings === 'object' && !Array.isArray(t.settings)
      ? (t.settings as Record<string, unknown>)
      : {};
  const scope: 'DEMO' | 'REAL' | 'SIMULATION' =
    settingsObj.accountScope === 'DEMO'
      ? 'DEMO'
      : settingsObj.accountScope === 'SIMULATION'
      ? 'SIMULATION'
      : 'REAL';
  const planCode = (typeof settingsObj.planCode === 'string'
    ? settingsObj.planCode
    : t.planCode || 'BASIC') as SubscriptionPlanCode;
  const billingCycle = settingsObj.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const ownerUsername =
    typeof settingsObj.ownerUsername === 'string' && settingsObj.ownerUsername.trim()
      ? settingsObj.ownerUsername.trim()
      : undefined;
  const ownerIdleTimeoutMinutes =
    typeof settingsObj.ownerIdleTimeoutMinutes === 'number' &&
    Number.isFinite(settingsObj.ownerIdleTimeoutMinutes)
      ? settingsObj.ownerIdleTimeoutMinutes
      : 0;

  const built = buildMasterProvisionedAccountAndWorkspace({
    accountScope: scope,
    fullName: params.ownerName,
    username: ownerUsername,
    email: params.ownerEmail,
    password: '••••••••',
    phone: params.ownerPhone || '081200000000',
    allowGoogleLogin: true,
    allowPasswordLogin: true,
    idleTimeoutMinutes: ownerIdleTimeoutMinutes,
    status:
      params.ownerStatus === 'SUSPENDED' || params.ownerStatus === 'TRIAL'
        ? params.ownerStatus
        : 'ACTIVE',
    businessName: t.name,
    vertical: t.vertical,
    planCode,
    billingCycle,
    maxTenantsAllowed: params.maxTenantsAllowed || 3,
    passwordHash: params.passwordHash || '',
  });

  const resolvedTenantId =
    typeof settingsObj.legacyTenantId === 'string' && settingsObj.legacyTenantId
      ? settingsObj.legacyTenantId
      : t.id;
  const resolvedCustomerId =
    typeof settingsObj.legacyCustomerId === 'string' && settingsObj.legacyCustomerId
      ? settingsObj.legacyCustomerId
      : built.customer.id;

  const snapshot = extractWorkspaceSnapshotFromSettings(t.settings);
  const baseWorkspace = snapshot ?? built.workspace;

  const hydratedWorkspace: TenantWorkspaceData = {
    ...baseWorkspace,
    tenant: {
      ...baseWorkspace.tenant,
      id: resolvedTenantId,
      slug: t.slug,
      name: t.name,
      vertical: t.vertical,
      taxEntity: t.taxEntity,
      isPkp: t.isPkp,
      npwp16: t.npwp16 ?? baseWorkspace.tenant.npwp16,
      nitku22: t.nitku22 ?? baseWorkspace.tenant.nitku22,
      address: t.address ?? baseWorkspace.tenant.address,
      logoUrl: t.logoUrl ?? baseWorkspace.tenant.logoUrl,
      receiptFooter: t.receiptFooter ?? baseWorkspace.tenant.receiptFooter,
      subscriptionPlan: planCode,
      accountScope: scope,
      ownerAccountId: resolvedCustomerId,
    },
  };

  const hydratedCustomer: ManagedCustomerAccount = {
    ...built.customer,
    id: resolvedCustomerId,
    primaryTenantId: resolvedTenantId,
    tenantIds: [resolvedTenantId],
  };

  return { customer: hydratedCustomer, workspace: hydratedWorkspace };
}

export interface HydratedPostgresUserResult {
  found: boolean;
  userId?: string;
  email: string;
  fullName: string;
  phone: string;
  isSuperAdmin: boolean;
  accountStatus: string;
  passwordHash: string | null;
  customer?: ManagedCustomerAccount;
  workspaces?: TenantWorkspaceData[];
}

export async function hydrateUserFromPostgresByEmail(
  email: string,
): Promise<HydratedPostgresUserResult | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const emailNorm = email.trim().toLowerCase();
  try {
    const pgUser = await prisma.user.findUnique({
      where: { email: emailNorm },
      include: {
        authAccounts: {
          where: { providerId: 'credential' },
          select: { password: true },
        },
        memberships: {
          where: { isActive: true },
          include: { tenant: true },
        },
      },
    });
    if (!pgUser) return null;

    const passwordHash = pgUser.authAccounts[0]?.password || pgUser.passwordHash || null;
    const baseResult: HydratedPostgresUserResult = {
      found: true,
      userId: pgUser.id,
      email: emailNorm,
      fullName: pgUser.fullName || pgUser.name || emailNorm.split('@')[0],
      phone: pgUser.phone || '',
      isSuperAdmin: Boolean(pgUser.isSuperAdmin),
      accountStatus: pgUser.accountStatus || 'ACTIVE',
      passwordHash,
    };

    const validMemberships = pgUser.memberships.filter((m) => Boolean(m.tenant));
    if (validMemberships.length === 0) {
      return baseResult;
    }

    const hydratedPairs = validMemberships.map((m) =>
      hydrateTenantRowToWorkspace({
        tenantRow: m.tenant,
        ownerEmail: emailNorm,
        ownerName: baseResult.fullName,
        ownerPhone: baseResult.phone,
        ownerStatus: baseResult.accountStatus,
        maxTenantsAllowed: pgUser.maxTenantsAllowed || 3,
        passwordHash,
      }),
    );

    const primary = hydratedPairs[0];
    const allTenantIds = Array.from(new Set(hydratedPairs.map((p) => p.workspace.tenant.id)));
    const hydratedCustomer: ManagedCustomerAccount = {
      ...primary.customer,
      tenantIds: allTenantIds,
    };
    const hydratedWorkspaces = hydratedPairs.map((p) => ({
      ...p.workspace,
      tenant: {
        ...p.workspace.tenant,
        ownerAccountId: hydratedCustomer.id,
      },
    }));

    return {
      ...baseResult,
      customer: hydratedCustomer,
      workspaces: hydratedWorkspaces,
    };
  } catch {
    return null;
  }
}

export async function hydrateWorkspaceFromPostgresByTenantId(tenantId: string): Promise<{
  scope: 'DEMO' | 'REAL' | 'SIMULATION';
  ownerAccountId: string;
  customer: ManagedCustomerAccount | null;
  workspace: TenantWorkspaceData;
} | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;

  try {
    const candidateUuid = toDeterministicUuid(tenantId);
    const tenantRow = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: candidateUuid },
          { slug: tenantId },
          { settings: { path: ['legacyTenantId'], equals: tenantId } },
        ],
      },
      include: {
        memberships: {
          where: { isActive: true },
          include: {
            user: {
              include: {
                authAccounts: {
                  where: { providerId: 'credential' },
                  select: { password: true },
                },
              },
            },
          },
        },
      },
    });
    if (!tenantRow) return null;

    const ownerUser =
      tenantRow.memberships.find((m) => m.role === 'OWNER')?.user ??
      tenantRow.memberships[0]?.user ??
      null;

    const pair = hydrateTenantRowToWorkspace({
      tenantRow,
      ownerEmail: ownerUser?.email || `owner-${tenantRow.slug}@kasirakun.id`,
      ownerName: ownerUser?.fullName || ownerUser?.name || tenantRow.name,
      ownerPhone: ownerUser?.phone || '',
      ownerStatus: ownerUser?.accountStatus || 'ACTIVE',
      maxTenantsAllowed: ownerUser?.maxTenantsAllowed || 3,
      passwordHash: ownerUser?.authAccounts[0]?.password || ownerUser?.passwordHash || null,
    });

    const scope: 'DEMO' | 'REAL' | 'SIMULATION' =
      pair.workspace.tenant.accountScope === 'DEMO'
        ? 'DEMO'
        : pair.workspace.tenant.accountScope === 'SIMULATION'
        ? 'SIMULATION'
        : 'REAL';
    return {
      scope,
      ownerAccountId: pair.customer.id,
      customer: ownerUser ? pair.customer : null,
      workspace: pair.workspace,
    };
  } catch {
    return null;
  }
}

export async function hydrateWorkspaceFromPostgresBySlug(
  slug: string,
): Promise<TenantWorkspaceData | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;

  try {
    const tenantRow = await prisma.tenant.findUnique({
      where: { slug },
      include: {
        memberships: {
          where: { isActive: true },
          include: { user: true },
        },
      },
    });
    if (!tenantRow) return null;

    const ownerUser =
      tenantRow.memberships.find((m) => m.role === 'OWNER')?.user ??
      tenantRow.memberships[0]?.user ??
      null;

    const pair = hydrateTenantRowToWorkspace({
      tenantRow,
      ownerEmail: ownerUser?.email || `owner-${tenantRow.slug}@kasirakun.id`,
      ownerName: ownerUser?.fullName || ownerUser?.name || tenantRow.name,
      ownerPhone: ownerUser?.phone || '',
      ownerStatus: ownerUser?.accountStatus || 'ACTIVE',
      maxTenantsAllowed: ownerUser?.maxTenantsAllowed || 3,
      passwordHash: ownerUser?.passwordHash || null,
    });
    return pair.workspace;
  } catch {
    return null;
  }
}

export async function hydrateAllPostgresWorkspacesForMaster(): Promise<{
  customers: ManagedCustomerAccount[];
  workspaces: TenantWorkspaceData[];
}> {
  if (!isDatabaseConfigured()) {
    return { customers: [], workspaces: [] };
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    return { customers: [], workspaces: [] };
  }

  try {
    const pgUsers = await prisma.user.findMany({
      where: { isSuperAdmin: false },
      include: {
        authAccounts: {
          where: { providerId: 'credential' },
          select: { password: true },
        },
        memberships: {
          where: { isActive: true },
          include: { tenant: true },
        },
      },
    });

    const customers: ManagedCustomerAccount[] = [];
    const workspaces: TenantWorkspaceData[] = [];

    for (const u of pgUsers) {
      const valid = u.memberships.filter((m) => Boolean(m.tenant));
      if (valid.length === 0) continue;
      const passwordHash = u.authAccounts[0]?.password || u.passwordHash || null;
      const pairs = valid.map((m) =>
        hydrateTenantRowToWorkspace({
          tenantRow: m.tenant,
          ownerEmail: u.email,
          ownerName: u.fullName || u.name || u.email,
          ownerPhone: u.phone || '',
          ownerStatus: u.accountStatus || 'ACTIVE',
          maxTenantsAllowed: u.maxTenantsAllowed || 3,
          passwordHash,
        }),
      );
      const allIds = Array.from(new Set(pairs.map((p) => p.workspace.tenant.id)));
      customers.push({
        ...pairs[0].customer,
        tenantIds: allIds,
      });
      for (const p of pairs) {
        workspaces.push({
          ...p.workspace,
          tenant: {
            ...p.workspace.tenant,
            ownerAccountId: pairs[0].customer.id,
          },
        });
      }
    }

    return { customers, workspaces };
  } catch {
    return { customers: [], workspaces: [] };
  }
}

export async function syncTenantPaymentConfigToPostgres(
  config: TenantPaymentConfig,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const prisma = getPrismaClient();
  if (!prisma) return false;

  try {
    const tenantUuid = toDeterministicUuid(config.tenantId);
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: tenantUuid },
          { settings: { path: ['legacyTenantId'], equals: config.tenantId } },
        ],
      },
      select: { id: true },
    });
    if (!tenant) return false;

    const prismaProvider: 'MIDTRANS' | 'MANUAL_ONLY' | 'SIMULATOR' =
      config.provider === 'MIDTRANS' ||
      config.provider === 'MANUAL_ONLY' ||
      config.provider === 'SIMULATOR'
        ? config.provider
        : 'SIMULATOR';

    await prisma.tenantPaymentConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        provider: prismaProvider,
        environment: config.environment,
        merchantCode: config.merchantCode ?? null,
        encryptedServerKey: config.encryptedServerKey ?? null,
        encryptedClientKey: config.encryptedClientKey ?? null,
        encryptedPrivateKey: config.encryptedPrivateKey ?? null,
        feeBearer: config.feeBearer,
        qrisMdrPercent: config.qrisMdrPercent,
        vaFlatFee: config.vaFlatFee,
        ewalletFeePercent: config.ewalletFeePercent,
        enabledChannels: config.enabledChannels as unknown as Prisma.InputJsonValue,
        manualBankAccounts: config.manualBankAccounts as unknown as Prisma.InputJsonValue,
        setupStatus: config.setupStatus,
        lastTestedAt: config.lastTestedAt ? new Date(config.lastTestedAt) : null,
        configuredByAdminId: config.configuredByAdminId ?? null,
      },
      update: {
        provider: prismaProvider,
        environment: config.environment,
        merchantCode: config.merchantCode ?? null,
        encryptedServerKey: config.encryptedServerKey ?? null,
        encryptedClientKey: config.encryptedClientKey ?? null,
        encryptedPrivateKey: config.encryptedPrivateKey ?? null,
        feeBearer: config.feeBearer,
        qrisMdrPercent: config.qrisMdrPercent,
        vaFlatFee: config.vaFlatFee,
        ewalletFeePercent: config.ewalletFeePercent,
        enabledChannels: config.enabledChannels as unknown as Prisma.InputJsonValue,
        manualBankAccounts: config.manualBankAccounts as unknown as Prisma.InputJsonValue,
        setupStatus: config.setupStatus,
        lastTestedAt: config.lastTestedAt ? new Date(config.lastTestedAt) : null,
        configuredByAdminId: config.configuredByAdminId ?? null,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function hydrateTenantPaymentConfigFromPostgres(
  tenantId: string,
): Promise<TenantPaymentConfig | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;

  try {
    const tenantUuid = toDeterministicUuid(tenantId);
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: tenantUuid },
          { settings: { path: ['legacyTenantId'], equals: tenantId } },
        ],
      },
      include: { paymentConfig: true },
    });
    const row = tenant?.paymentConfig;
    if (!row) return null;

    return {
      id: row.id,
      tenantId,
      provider: row.provider,
      environment: row.environment,
      merchantCode: row.merchantCode ?? null,
      encryptedServerKey: row.encryptedServerKey ?? null,
      encryptedClientKey: row.encryptedClientKey ?? null,
      encryptedPrivateKey: row.encryptedPrivateKey ?? null,
      maskedServerKey: row.encryptedServerKey ? maskSecretKey(row.encryptedServerKey) : null,
      maskedClientKey: row.encryptedClientKey ? maskSecretKey(row.encryptedClientKey) : null,
      maskedPrivateKey: row.encryptedPrivateKey ? maskSecretKey(row.encryptedPrivateKey) : null,
      hasServerKey: Boolean(row.encryptedServerKey),
      hasClientKey: Boolean(row.encryptedClientKey),
      hasPrivateKey: Boolean(row.encryptedPrivateKey),
      feeBearer: row.feeBearer,
      qrisMdrPercent: row.qrisMdrPercent.toFixed(4),
      vaFlatFee: row.vaFlatFee.toFixed(4),
      ewalletFeePercent: row.ewalletFeePercent.toFixed(4),
      enabledChannels: {
        ...DEFAULT_ENABLED_CHANNELS,
        ...(row.enabledChannels && typeof row.enabledChannels === 'object' && !Array.isArray(row.enabledChannels)
          ? (row.enabledChannels as unknown as Partial<TenantPaymentConfig['enabledChannels']>)
          : {}),
      },
      manualBankAccounts: Array.isArray(row.manualBankAccounts)
        ? (row.manualBankAccounts as unknown as TenantPaymentConfig['manualBankAccounts'])
        : [],
      setupStatus: row.setupStatus as TenantPaymentConfig['setupStatus'],
      lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
      configuredByAdminId: row.configuredByAdminId ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function removeUserFromPostgresByEmail(email: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const prisma = getPrismaClient();
  if (!prisma) return false;
  try {
    const emailNorm = email.trim().toLowerCase();
    await prisma.user.deleteMany({
      where: { email: emailNorm },
    });
    return true;
  } catch {
    return false;
  }
}

export async function countPostgresUsersSafe(): Promise<number | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrismaClient();
  if (!prisma) return null;
  try {
    return await prisma.user.count();
  } catch {
    return null;
  }
}

export async function syncAllAccountsToPostgres(params: {
  masterAccounts: MasterAdminAccountRecord[];
  customers: ManagedCustomerAccount[];
  workspacesByTenantId?: Map<string, TenantWorkspaceData>;
}): Promise<{
  databaseConfigured: boolean;
  masterSynced: number;
  realSynced: number;
  simulationSynced: number;
  demoSynced: number;
  failed: number;
}> {
  if (!isDatabaseConfigured()) {
    return {
      databaseConfigured: false,
      masterSynced: 0,
      realSynced: 0,
      simulationSynced: 0,
      demoSynced: 0,
      failed: 0,
    };
  }

  let masterSynced = 0;
  let realSynced = 0;
  let simulationSynced = 0;
  let demoSynced = 0;
  let failed = 0;

  for (const m of params.masterAccounts) {
    const res = await syncUserAccountToPostgres({
      email: m.email,
      fullName: m.fullName,
      phone: m.phone,
      passwordHash: m.passwordHash,
      isSuperAdmin: true,
      accountStatus: m.status,
      maxTenantsAllowed: 100,
    });
    if (res.synced) masterSynced += 1;
    else failed += 1;
  }

  for (const c of params.customers) {
    const isDemo = Boolean(c.isDemoAccount || c.accountScope === 'DEMO');
    const isSim = c.accountScope === 'SIMULATION';
    const res = await syncUserAccountToPostgres({
      email: c.email,
      fullName: c.fullName,
      phone: c.phone,
      passwordHash: c.passwordHash || null,
      isSuperAdmin: false,
      accountStatus: c.status,
      maxTenantsAllowed: c.maxTenantsAllowed,
    });
    if (res.synced) {
      if (isDemo) demoSynced += 1;
      else if (isSim) simulationSynced += 1;
      else realSynced += 1;

      const ws = params.workspacesByTenantId?.get(c.primaryTenantId);
      if (ws) {
        await syncTenantWorkspaceToPostgres({
          email: c.email,
          customer: c,
          workspace: ws,
        });
      }
    } else {
      failed += 1;
    }
  }

  return {
    databaseConfigured: true,
    masterSynced,
    realSynced,
    simulationSynced,
    demoSynced,
    failed,
  };
}
