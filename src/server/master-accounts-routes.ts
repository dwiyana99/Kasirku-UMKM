/**
 * Master Admin Account Management Routes (`/api/master/accounts*`)
 * Manages all three login scopes from Master Console:
 *  - MASTER: Super-admin accounts (Email/Password + Google OAuth allowlist)
 *  - REAL: Paid production owner accounts + isolated REAL workspaces
 *  - DEMO: Demo/trial accounts across all 22 UMKM verticals + isolated DEMO workspaces
 * Automatically syncs user records & credential hashes into Neon PostgreSQL (`users` & `auth_accounts`)
 * when DATABASE_URL is configured so Better Auth Email + Google OAuth work seamlessly.
 */

import type express from 'express';
import { z } from 'zod';
import { getAuthConfigurationStatus } from '../lib/auth.ts';
import {
  buildMasterProvisionedAccountAndWorkspace,
  canDeactivateOrDeleteMasterAdmin,
  hashAccountPassword,
  sanitizeCustomerForApi,
  sanitizeMasterAdminAccount,
  type MasterAdminAccountRecord,
} from '../lib/auth/account-management.ts';
import {
  countPostgresUsersSafe,
  removeUserFromPostgresByEmail,
  syncAllAccountsToPostgres,
  syncUserAccountToPostgres,
} from '../lib/auth/postgres-sync.ts';
import type { PartitionedTenantDatabase, SignedSessionPayload } from '../lib/db/tenant-db.ts';
import { calculateHybridPricing, deriveLegacyModulesFromHybrid } from '../lib/saas/hybrid-pricing.ts';
import type { BusinessVertical, ManagedCustomerAccount, TenantWorkspaceData } from '../types/domain.ts';

const ALL_VERTICALS_ENUM = [
  'WARUNG_SEMBAKO',
  'TOKO_RETAIL',
  'TOKO_FASHION',
  'TOKO_BANGUNAN',
  'MANUFAKTUR_KECIL',
  'BARBERSHOP',
  'SALON_KECANTIKAN',
  'SPA_WELLNESS',
  'BARBERSHOP_SALON',
  'KEDAI_MAKAN',
  'RESTORAN',
  'BAKERY_CATERING',
  'LAUNDRY',
  'CUCI_KENDARAAN',
  'RENTAL_KENDARAAN',
  'SEWA_LAPANGAN',
  'PET_SHOP',
  'BIMBEL_KURSUS_GYM',
  'HOMESTAY_VILLA',
  'SEWA_GARASI',
  'FREELANCE',
  'KOST_KONTRAKAN',
  'PETERNAKAN_PERTANIAN',
] as const;

const createMasterAccountSchema = z.object({
  accountType: z.enum(['MASTER', 'REAL', 'DEMO']),
  fullName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(150),
  email: z.string().trim().email('Format email tidak valid.').max(255),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter.').max(120).optional(),
  phone: z.string().trim().max(30).optional().default(''),
  allowGoogleLogin: z.boolean().optional().default(true),
  allowPasswordLogin: z.boolean().optional().default(true),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED']).optional(),
  notes: z.string().trim().max(400).optional().default(''),
  // Fields for REAL / DEMO accounts
  businessName: z.string().trim().max(150).optional(),
  vertical: z.enum(ALL_VERTICALS_ENUM).optional().default('WARUNG_SEMBAKO'),
  planCode: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).optional().default('PRO'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional().default('MONTHLY'),
  maxTenantsAllowed: z.number().int().min(1).max(100).optional().default(3),
  demoDurationDays: z.number().int().min(1).max(90).optional().default(7),
});

const patchAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED', 'DEACTIVATED']).optional(),
  allowGoogleLogin: z.boolean().optional(),
  allowPasswordLogin: z.boolean().optional(),
  notes: z.string().trim().max(400).optional(),
  newPassword: z.string().min(6, 'Kata sandi baru minimal 6 karakter.').max(120).optional(),
  planCode: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).optional(),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  maxTenantsAllowed: z.number().int().min(1).max(100).optional(),
  extendDemoDays: z.number().int().min(1).max(365).optional(),
});

interface MountMasterAccountsDeps {
  tenantDb: PartitionedTenantDatabase;
  extractSessionFromRequest: (req: express.Request) => SignedSessionPayload | null;
}

export function mountMasterAccountsRoutes(
  app: express.Express,
  deps: MountMasterAccountsDeps,
): void {
  const { tenantDb, extractSessionFromRequest } = deps;

  const buildPayload = async () => {
    const masterAccounts = tenantDb.listMasterAccounts().map(sanitizeMasterAdminAccount);
    const allCustomers = tenantDb.listCustomers();
    const allWorkspaces = tenantDb.listAllWorkspaces();
    const workspaceByTenant = new Map<string, TenantWorkspaceData>(
      allWorkspaces.map((w) => [w.tenant.id, w]),
    );

    const mapCustomer = (c: ManagedCustomerAccount) => {
      const safe = sanitizeCustomerForApi(c);
      const ws = workspaceByTenant.get(c.primaryTenantId);
      return {
        ...safe,
        businessName: ws?.tenant.name || c.fullName,
        vertical: ws?.tenant.vertical || c.demoVertical || 'WARUNG_SEMBAKO',
        tenantSlug: ws?.tenant.slug || '',
      };
    };

    const realAccounts = allCustomers
      .filter((c) => !c.isDemoAccount && c.accountScope !== 'DEMO')
      .map(mapCustomer);
    const demoAccounts = allCustomers
      .filter((c) => c.isDemoAccount || c.accountScope === 'DEMO')
      .map(mapCustomer);

    const authStatus = getAuthConfigurationStatus();
    const pgUserCount = await countPostgresUsersSafe();

    return {
      masterAccounts,
      realAccounts,
      demoAccounts,
      authInfraStatus: {
        ...authStatus,
        googleCallbackUrl: `${authStatus.baseURL}/api/auth/callback/google`,
        pgUserCount,
      },
    };
  };

  // GET /api/master/accounts — Unified directory of Master, Real, and Demo login accounts
  app.get('/api/master/accounts', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang berwenang mengakses manajemen akun login.',
      });
    }
    const payload = await buildPayload();
    return res.status(200).json(payload);
  });

  // POST /api/master/accounts — Create MASTER, REAL, or DEMO login account + optional Neon sync
  app.post('/api/master/accounts', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang berwenang menambahkan akun login.',
      });
    }

    const parsed = createMasterAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Data akun baru belum lengkap atau tidak valid.',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const emailNorm = input.email.toLowerCase();

    // Prevent email collision across login directories
    const existingMaster = tenantDb.findMasterAccountByEmail(emailNorm);
    const existingCustomer = tenantDb.findCustomerByEmail(emailNorm);
    if (existingMaster || existingCustomer) {
      return res.status(409).json({
        error: `Email ${emailNorm} sudah terdaftar pada akun lain. Gunakan email berbeda atau edit akun yang ada.`,
      });
    }

    if (input.allowPasswordLogin && !input.password) {
      return res.status(400).json({
        error: 'Masukkan kata sandi minimal 6 karakter atau matikan opsi Login Email & Sandi.',
      });
    }

    const nowIso = new Date().toISOString();
    const rawPassword = input.password || `Ka-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashAccountPassword(rawPassword);

    if (input.accountType === 'MASTER') {
      const newMaster: MasterAdminAccountRecord = {
        id: `master-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        email: emailNorm,
        fullName: input.fullName,
        phone: input.phone || '',
        passwordHash: input.password ? passwordHash : '',
        status: input.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        allowGoogleLogin: input.allowGoogleLogin,
        allowPasswordLogin: input.allowPasswordLogin && Boolean(input.password),
        isPrimaryOwner: false,
        notes: input.notes || `Ditambahkan oleh ${session.email}`,
        lastLoginAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      tenantDb.upsertMasterAccount(newMaster);
      const pgSync = await syncUserAccountToPostgres({
        email: newMaster.email,
        fullName: newMaster.fullName,
        phone: newMaster.phone,
        passwordHash: newMaster.passwordHash || null,
        isSuperAdmin: true,
        accountStatus: newMaster.status,
        maxTenantsAllowed: 100,
      });
      const payload = await buildPayload();
      return res.status(201).json({
        ok: true,
        accountType: 'MASTER',
        createdMaster: sanitizeMasterAdminAccount(newMaster),
        pgSynced: pgSync.synced,
        message: `Akun Master Admin ${newMaster.email} berhasil dibuat${
          pgSync.synced ? ' dan tersinkron ke Neon PostgreSQL.' : '.'
        }`,
        ...payload,
      });
    }

    // REAL or DEMO account provisioning
    const businessName = input.businessName?.trim() || `Usaha ${input.fullName}`;
    const vertical = input.vertical as BusinessVertical;
    const templateMatch =
      input.accountType === 'DEMO'
        ? tenantDb
            .listAllWorkspaces('DEMO')
            .find((w) => w.tenant.vertical === vertical && w.products.length > 0) ?? null
        : null;

    const provisioned = buildMasterProvisionedAccountAndWorkspace({
      accountScope: input.accountType,
      fullName: input.fullName,
      email: emailNorm,
      password: rawPassword,
      phone: input.phone,
      businessName,
      vertical,
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      status:
        input.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : input.accountType === 'DEMO'
          ? 'TRIAL'
          : input.status || 'ACTIVE',
      maxTenantsAllowed: input.maxTenantsAllowed,
      demoDurationDays: input.demoDurationDays,
      allowGoogleLogin: input.allowGoogleLogin,
      allowPasswordLogin: input.allowPasswordLogin,
      notes: input.notes,
      passwordHash,
      templateWorkspace: templateMatch,
    });

    tenantDb.upsertCustomer(provisioned.customer);
    tenantDb.saveWorkspace(input.accountType, provisioned.customer.id, provisioned.workspace);

    const pgSync = await syncUserAccountToPostgres({
      email: provisioned.customer.email,
      fullName: provisioned.customer.fullName,
      phone: provisioned.customer.phone,
      passwordHash,
      isSuperAdmin: false,
      accountStatus: provisioned.customer.status,
      maxTenantsAllowed: provisioned.customer.maxTenantsAllowed,
    });

    const payload = await buildPayload();
    return res.status(201).json({
      ok: true,
      accountType: input.accountType,
      createdCustomer: sanitizeCustomerForApi(provisioned.customer),
      createdWorkspace: provisioned.workspace,
      pgSynced: pgSync.synced,
      message: `Akun ${input.accountType === 'DEMO' ? 'Demo' : 'Usaha Real'} ${emailNorm} (${businessName}) berhasil dibuat${
        pgSync.synced ? ' dan disinkronkan ke Neon PostgreSQL.' : '.'
      }`,
      ...payload,
    });
  });

  // PATCH /api/master/accounts/:accountType/:id — Edit, toggle status, Google allow, or reset password
  app.patch('/api/master/accounts/:accountType/:id', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang berwenang memperbarui akun login.',
      });
    }

    const accountType = String(req.params.accountType || '').toUpperCase();
    const targetId = String(req.params.id || '');
    const parsed = patchAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Perubahan data akun tidak valid.',
      });
    }
    const patch = parsed.data;
    const nowIso = new Date().toISOString();

    if (accountType === 'MASTER') {
      const existing = tenantDb.findMasterAccountById(targetId);
      if (!existing) {
        return res.status(404).json({ error: 'Akun Master Admin tidak ditemukan.' });
      }
      if (patch.status === 'SUSPENDED' || patch.status === 'DEACTIVATED') {
        const guard = canDeactivateOrDeleteMasterAdmin({
          allMasters: tenantDb.listMasterAccounts(),
          targetId,
          actorEmail: session.email,
          action: 'SUSPEND',
        });
        if (!guard.allowed) {
          return res.status(409).json({ error: guard.reason });
        }
      }

      const nextHash = patch.newPassword
        ? await hashAccountPassword(patch.newPassword)
        : existing.passwordHash;
      const updated: MasterAdminAccountRecord = {
        ...existing,
        fullName: patch.fullName ?? existing.fullName,
        phone: patch.phone ?? existing.phone,
        status:
          patch.status === 'SUSPENDED' || patch.status === 'DEACTIVATED'
            ? 'SUSPENDED'
            : patch.status === 'ACTIVE'
            ? 'ACTIVE'
            : existing.status,
        allowGoogleLogin: patch.allowGoogleLogin ?? existing.allowGoogleLogin,
        allowPasswordLogin: patch.allowPasswordLogin ?? existing.allowPasswordLogin,
        notes: patch.notes ?? existing.notes,
        passwordHash: nextHash,
        updatedAt: nowIso,
      };
      tenantDb.upsertMasterAccount(updated);
      const pgSync = await syncUserAccountToPostgres({
        email: updated.email,
        fullName: updated.fullName,
        phone: updated.phone,
        passwordHash: patch.newPassword ? nextHash : undefined,
        isSuperAdmin: true,
        accountStatus: updated.status,
        maxTenantsAllowed: 100,
      });

      const payload = await buildPayload();
      return res.status(200).json({
        ok: true,
        pgSynced: pgSync.synced,
        message: patch.newPassword
          ? `Kata sandi & profil Master Admin ${updated.email} berhasil diperbarui.`
          : `Profil Master Admin ${updated.email} berhasil diperbarui.`,
        ...payload,
      });
    }

    if (accountType === 'REAL' || accountType === 'DEMO') {
      const existing = tenantDb.findCustomerById(targetId);
      if (!existing) {
        return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      const isDemo = existing.isDemoAccount || existing.accountScope === 'DEMO';
      const nextPlan = patch.planCode ?? existing.subscriptionPlan ?? 'BASIC';
      const nextCycle = patch.billingCycle ?? existing.billingCycle;
      const addOns = existing.activeAddOns ?? [];
      const nextModules = patch.planCode
        ? deriveLegacyModulesFromHybrid(nextPlan, addOns)
        : existing.activeModules;
      const pricing = calculateHybridPricing({
        planCode: nextPlan,
        selectedAddOns: addOns,
        billingCycle: nextCycle,
        extraBranchQty: 1,
        extraStaffQty: 1,
      });

      let nextDemoExpires = existing.demoExpiresAt ?? null;
      if (patch.extendDemoDays && isDemo) {
        const baseTime =
          existing.demoExpiresAt && new Date(existing.demoExpiresAt).getTime() > Date.now()
            ? new Date(existing.demoExpiresAt).getTime()
            : Date.now();
        nextDemoExpires = new Date(
          baseTime + patch.extendDemoDays * 24 * 60 * 60 * 1000,
        ).toISOString();
      }

      const nextHash = patch.newPassword
        ? await hashAccountPassword(patch.newPassword)
        : existing.passwordHash;

      const updatedCustomer: ManagedCustomerAccount = {
        ...existing,
        fullName: patch.fullName ?? existing.fullName,
        phone: patch.phone ?? existing.phone,
        status: patch.status ?? existing.status,
        allowGoogleLogin: patch.allowGoogleLogin ?? existing.allowGoogleLogin ?? true,
        allowPasswordLogin: patch.allowPasswordLogin ?? existing.allowPasswordLogin ?? true,
        subscriptionPlan: nextPlan,
        billingCycle: nextCycle,
        activeModules: nextModules,
        monthlyRecurringRevenue: isDemo ? '0.0000' : pricing.effectiveMonthlySubtotal,
        maxTenantsAllowed: patch.maxTenantsAllowed ?? existing.maxTenantsAllowed,
        adminNotes: patch.notes ?? existing.adminNotes,
        demoExpiresAt: nextDemoExpires,
        validUntil: nextDemoExpires || existing.validUntil,
        passwordHash: nextHash,
        passwordDemo: patch.newPassword
          ? isDemo
            ? patch.newPassword
            : '••••••••'
          : existing.passwordDemo,
      };

      tenantDb.upsertCustomer(updatedCustomer);

      // Keep associated workspaces in sync with plan & modules
      const scope = isDemo ? 'DEMO' : 'REAL';
      for (const tid of updatedCustomer.tenantIds) {
        const ws = tenantDb.getWorkspace(scope, updatedCustomer.id, tid);
        if (ws) {
          tenantDb.saveWorkspace(scope, updatedCustomer.id, {
            ...ws,
            tenant: {
              ...ws.tenant,
              subscriptionPlan: nextPlan,
              activeModules: nextModules,
            },
          });
        }
      }

      const pgSync = await syncUserAccountToPostgres({
        email: updatedCustomer.email,
        fullName: updatedCustomer.fullName,
        phone: updatedCustomer.phone,
        passwordHash: patch.newPassword ? nextHash : undefined,
        isSuperAdmin: false,
        accountStatus: updatedCustomer.status,
        maxTenantsAllowed: updatedCustomer.maxTenantsAllowed,
      });

      const payload = await buildPayload();
      return res.status(200).json({
        ok: true,
        pgSynced: pgSync.synced,
        message: patch.newPassword
          ? `Kata sandi baru & pengaturan akun ${updatedCustomer.email} berhasil disimpan.`
          : `Pengaturan akun ${updatedCustomer.email} berhasil diperbarui.`,
        ...payload,
      });
    }

    return res.status(400).json({ error: 'Tipe akun tidak dikenali.' });
  });

  // DELETE /api/master/accounts/:accountType/:id — Delete login account safely
  app.delete('/api/master/accounts/:accountType/:id', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang berwenang menghapus akun login.',
      });
    }

    const accountType = String(req.params.accountType || '').toUpperCase();
    const targetId = String(req.params.id || '');

    if (accountType === 'MASTER') {
      const target = tenantDb.findMasterAccountById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'Akun Master Admin tidak ditemukan.' });
      }
      const guard = canDeactivateOrDeleteMasterAdmin({
        allMasters: tenantDb.listMasterAccounts(),
        targetId,
        actorEmail: session.email,
        action: 'DELETE',
      });
      if (!guard.allowed) {
        return res.status(409).json({ error: guard.reason });
      }
      tenantDb.deleteMasterAccount(targetId);
      await removeUserFromPostgresByEmail(target.email);
      const payload = await buildPayload();
      return res.status(200).json({
        ok: true,
        message: `Akun Master Admin ${target.email} berhasil dihapus.`,
        ...payload,
      });
    }

    if (accountType === 'REAL' || accountType === 'DEMO') {
      const target = tenantDb.findCustomerById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      tenantDb.deleteCustomer(targetId);
      await removeUserFromPostgresByEmail(target.email);
      const payload = await buildPayload();
      return res.status(200).json({
        ok: true,
        message: `Akun ${accountType === 'DEMO' ? 'Demo' : 'Real'} ${target.email} berhasil dihapus.`,
        ...payload,
      });
    }

    return res.status(400).json({ error: 'Tipe akun tidak valid.' });
  });

  // POST /api/master/accounts/sync-postgres — Push all Master, Real, Demo accounts into Neon PostgreSQL
  app.post('/api/master/accounts/sync-postgres', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang dapat menyinkronkan akun ke Neon PostgreSQL.',
      });
    }

    const syncRes = await syncAllAccountsToPostgres({
      masterAccounts: tenantDb.listMasterAccounts(),
      customers: tenantDb.listCustomers(),
    });

    if (!syncRes.databaseConfigured) {
      return res.status(200).json({
        ok: false,
        ...syncRes,
        message:
          'DATABASE_URL Neon / PostgreSQL belum dikonfigurasi. Atur DATABASE_URL terlebih dahulu di menu Pengaturan API & Secret Key.',
      });
    }

    const payload = await buildPayload();
    return res.status(200).json({
      ok: true,
      ...syncRes,
      message: `Sinkronisasi ke Neon PostgreSQL selesai: ${syncRes.masterSynced} Master Admin, ${syncRes.realSynced} Akun Real, ${syncRes.demoSynced} Akun Demo berhasil disinkronkan.`,
      ...payload,
    });
  });
}
