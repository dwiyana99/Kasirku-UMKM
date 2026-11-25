/**
 * KasirAkun UMKM — Neon / PostgreSQL & Better Auth Account Sync Helper
 * Synchronizes Master Admin, Real Customer, and Demo accounts into PostgreSQL
 * `users` and `auth_accounts` tables (`providerId: 'credential'`) so accounts created
 * or updated in Master Admin work natively with Better Auth Email + Google OAuth.
 */

import { getPrismaClient, isDatabaseConfigured } from '../prisma.ts';
import type { ManagedCustomerAccount } from '../../types/domain.ts';
import type { MasterAdminAccountRecord } from './account-management.ts';

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
