/**
 * KasirAkun UMKM — Neon / PostgreSQL & Better Auth Account Sync Helper
 * Synchronizes Master Admin, Real Customer, and Demo accounts into PostgreSQL
 * `users` and `auth_accounts` tables (`providerId: 'credential'`) so accounts created
 * or updated in Master Admin work natively with Better Auth Email + Google OAuth.
 */

import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getPrismaClient, isDatabaseConfigured } from '../prisma.ts';
import type {
  BusinessVertical,
  ManagedCustomerAccount,
  SubscriptionPlanCode,
  TaxEntityType,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import {
  buildMasterProvisionedAccountAndWorkspace,
  type MasterAdminAccountRecord,
} from './account-management.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDeterministicUuid(input: string): string {
  const trimmed = input.trim();
  if (UUID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const hex = crypto.createHash('sha256').update(`kasirakun:${trimmed}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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

    const settingsPayload = {
      legacyTenantId: ws.tenant.id,
      legacyCustomerId: params.customer.id,
      accountScope: params.customer.accountScope ?? 'REAL',
      planCode: params.customer.subscriptionPlan ?? ws.tenant.subscriptionPlan ?? 'BASIC',
      billingCycle: params.customer.billingCycle ?? 'MONTHLY',
      selectedAddOns: params.customer.activeAddOns ?? ws.tenant.activeAddOns ?? [],
      businessWhatsappNumber: ws.tenant.settings?.businessWhatsappNumber ?? null,
    } as unknown as Prisma.InputJsonValue;

    const verticalOpsPayload = (ws.verticalOps ?? {}) as unknown as Prisma.InputJsonValue;

    const tenant = await prisma.tenant.upsert({
      where: { slug },
      create: {
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
        planCode: (params.customer.subscriptionPlan ?? ws.tenant.subscriptionPlan ?? 'BASIC').slice(0, 30),
        settings: settingsPayload,
        verticalOpsJson: verticalOpsPayload,
      },
      update: {
        name: ws.tenant.name.slice(0, 150),
        vertical: safeVertical,
        taxEntity: safeTaxEntity,
        isPkp: Boolean(ws.tenant.isPkp),
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

    const primaryMembership = pgUser.memberships[0];
    if (!primaryMembership?.tenant) {
      return baseResult;
    }

    const t = primaryMembership.tenant;
    const settingsObj =
      t.settings && typeof t.settings === 'object' && !Array.isArray(t.settings)
        ? (t.settings as Record<string, unknown>)
        : {};
    const scope = settingsObj.accountScope === 'DEMO' ? 'DEMO' : 'REAL';
    const planCode = (typeof settingsObj.planCode === 'string'
      ? settingsObj.planCode
      : t.planCode || 'BASIC') as SubscriptionPlanCode;
    const billingCycle = settingsObj.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';

    const built = buildMasterProvisionedAccountAndWorkspace({
      accountScope: scope,
      fullName: baseResult.fullName,
      email: emailNorm,
      password: '••••••••',
      phone: baseResult.phone || '081200000000',
      allowGoogleLogin: true,
      allowPasswordLogin: true,
      status:
        pgUser.accountStatus === 'SUSPENDED' || pgUser.accountStatus === 'TRIAL'
          ? pgUser.accountStatus
          : 'ACTIVE',
      businessName: t.name,
      vertical: t.vertical as BusinessVertical,
      planCode,
      billingCycle,
      maxTenantsAllowed: pgUser.maxTenantsAllowed || 3,
      passwordHash: passwordHash || '',
    });

    const resolvedTenantId =
      typeof settingsObj.legacyTenantId === 'string' && settingsObj.legacyTenantId
        ? settingsObj.legacyTenantId
        : t.id;
    const resolvedCustomerId =
      typeof settingsObj.legacyCustomerId === 'string' && settingsObj.legacyCustomerId
        ? settingsObj.legacyCustomerId
        : built.customer.id;

    const hydratedCustomer: ManagedCustomerAccount = {
      ...built.customer,
      id: resolvedCustomerId,
      primaryTenantId: resolvedTenantId,
      tenantIds: [resolvedTenantId],
    };

    const hydratedWorkspace: TenantWorkspaceData = {
      ...built.workspace,
      tenant: {
        ...built.workspace.tenant,
        id: resolvedTenantId,
        slug: t.slug,
        name: t.name,
        ownerAccountId: resolvedCustomerId,
      },
    };

    return {
      ...baseResult,
      customer: hydratedCustomer,
      workspaces: [hydratedWorkspace],
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
  demoSynced: number;
  failed: number;
}> {
  if (!isDatabaseConfigured()) {
    return {
      databaseConfigured: false,
      masterSynced: 0,
      realSynced: 0,
      demoSynced: 0,
      failed: 0,
    };
  }

  let masterSynced = 0;
  let realSynced = 0;
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
    demoSynced,
    failed,
  };
}
