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
  isValidUsername,
  normalizeUsername,
  sanitizeCustomerForApi,
  sanitizeMasterAdminAccount,
  suggestUsernameFromEmail,
  type MasterAdminAccountRecord,
} from '../lib/auth/account-management.ts';
import {
  DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
  DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  normalizeIdleTimeoutMinutes,
} from '../lib/auth/session-timeout.ts';
import {
  countPostgresUsersSafe,
  removeUserFromPostgresByEmail,
  syncAllAccountsToPostgres,
  syncTenantWorkspaceToPostgres,
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
  accountType: z.enum(['MASTER', 'REAL', 'SIMULATION', 'DEMO']),
  fullName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(150),
  username: z.string().trim().max(36).optional(),
  email: z.string().trim().email('Format email tidak valid.').max(255),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter.').max(120).optional(),
  phone: z.string().trim().max(30).optional().default(''),
  allowGoogleLogin: z.boolean().optional().default(true),
  allowPasswordLogin: z.boolean().optional().default(true),
  idleTimeoutMinutes: z.number().int().min(0).max(1440).optional(),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED']).optional(),
  notes: z.string().trim().max(400).optional().default(''),
  // Fields for REAL / SIMULATION / DEMO accounts
  businessName: z.string().trim().max(150).optional(),
  vertical: z.enum(ALL_VERTICALS_ENUM).optional().default('WARUNG_SEMBAKO'),
  planCode: z.enum(['LITE', 'BASIC', 'PRO', 'EXPERT']).optional().default('PRO'),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional().default('MONTHLY'),
  maxTenantsAllowed: z.number().int().min(1).max(100).optional().default(3),
  demoDurationDays: z.number().int().min(1).max(90).optional().default(7),
});

const patchAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(150).optional(),
  username: z.string().trim().max(36).optional(),
  phone: z.string().trim().max(30).optional(),
  status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED', 'DEACTIVATED']).optional(),
  allowGoogleLogin: z.boolean().optional(),
  allowPasswordLogin: z.boolean().optional(),
  idleTimeoutMinutes: z.number().int().min(0).max(1440).optional(),
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
      .filter((c) => !c.isDemoAccount && c.accountScope !== 'DEMO' && c.accountScope !== 'SIMULATION')
      .map(mapCustomer);
    const simulationAccounts = allCustomers
      .filter((c) => c.accountScope === 'SIMULATION')
      .map(mapCustomer);
    const demoAccounts = allCustomers
      .filter((c) => c.isDemoAccount || c.accountScope === 'DEMO')
      .map(mapCustomer);

    const authStatus = getAuthConfigurationStatus();
    const pgUserCount = await countPostgresUsersSafe();

    return {
      masterAccounts,
      realAccounts,
      simulationAccounts,
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

    // Prevent email & username collision across login directories
    const existingMaster = tenantDb.findMasterAccountByEmail(emailNorm);
    const existingCustomer = tenantDb.findCustomerByEmail(emailNorm);
    if (existingMaster || existingCustomer) {
      return res.status(409).json({
        error: `Email ${emailNorm} sudah terdaftar pada akun lain. Gunakan email berbeda atau edit akun yang ada.`,
      });
    }

    let resolvedUsername = normalizeUsername(input.username);
    if (input.username && input.username.trim().length > 0 && (!resolvedUsername || !isValidUsername(resolvedUsername))) {
      return res.status(400).json({
        error: 'Username harus 3–32 karakter (huruf kecil, angka, titik, garis bawah, atau tanda hubung).',
      });
    }
    if (!resolvedUsername) {
      let candidate = suggestUsernameFromEmail(emailNorm);
      if (tenantDb.isUsernameTaken(candidate)) {
        candidate = `${candidate.slice(0, 24)}_${Date.now().toString(36).slice(-4)}`;
      }
      resolvedUsername = candidate;
    } else if (tenantDb.isUsernameTaken(resolvedUsername)) {
      return res.status(409).json({
        error: `Username "${resolvedUsername}" sudah digunakan akun lain. Pilih username berbeda.`,
      });
    }

    if (input.allowPasswordLogin && !input.password) {
      return res.status(400).json({
        error: 'Masukkan kata sandi minimal 6 karakter atau matikan opsi Login Email/Username & Sandi.',
      });
    }

    const nowIso = new Date().toISOString();
    const rawPassword = input.password || `Ka-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hashAccountPassword(rawPassword);

    if (input.accountType === 'MASTER') {
      const newMaster: MasterAdminAccountRecord = {
        id: `master-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        username: resolvedUsername,
        email: emailNorm,
        fullName: input.fullName,
        phone: input.phone || '',
        passwordHash: input.password ? passwordHash : '',
        status: input.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        allowGoogleLogin: input.allowGoogleLogin,
        allowPasswordLogin: input.allowPasswordLogin && Boolean(input.password),
        isPrimaryOwner: false,
        idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
          input.idleTimeoutMinutes,
          DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
        ),
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
        message: `Akun Master Admin ${newMaster.email} (@${resolvedUsername}) berhasil dibuat${
          pgSync.synced ? ' dan tersinkron ke Neon PostgreSQL.' : '.'
        }`,
        ...payload,
      });
    }

    // REAL, SIMULATION (100% clean slate), or DEMO account provisioning
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
      username: resolvedUsername,
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
      idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
        input.idleTimeoutMinutes,
        DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      ),
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
    if (pgSync.synced) {
      await syncTenantWorkspaceToPostgres({
        email: provisioned.customer.email,
        customer: provisioned.customer,
        workspace: provisioned.workspace,
      });
    }

    const scopeText =
      input.accountType === 'DEMO'
        ? 'Demo'
        : input.accountType === 'SIMULATION'
        ? 'Simulasi (setara Akun Real)'
        : 'Usaha Real';
    const payload = await buildPayload();
    return res.status(201).json({
      ok: true,
      accountType: input.accountType,
      createdCustomer: sanitizeCustomerForApi(provisioned.customer),
      createdWorkspace: provisioned.workspace,
      pgSynced: pgSync.synced,
      message: `Akun ${scopeText} ${emailNorm} (@${resolvedUsername}) untuk ${businessName} berhasil dibuat${
        pgSync.synced ? ' dan siap login via Google maupun Username/Email.' : '.'
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

      let nextUsername = existing.username;
      if (patch.username !== undefined) {
        const norm = normalizeUsername(patch.username);
        if (patch.username.trim().length > 0 && (!norm || !isValidUsername(norm))) {
          return res.status(400).json({ error: 'Format username tidak valid (3–32 karakter huruf kecil/angka/._-).' });
        }
        if (norm && tenantDb.isUsernameTaken(norm, existing.id)) {
          return res.status(409).json({ error: `Username "${norm}" sudah dipakai akun lain.` });
        }
        nextUsername = norm;
      }

      const nextHash = patch.newPassword
        ? await hashAccountPassword(patch.newPassword)
        : existing.passwordHash;
      const updated: MasterAdminAccountRecord = {
        ...existing,
        username: nextUsername,
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
        idleTimeoutMinutes:
          patch.idleTimeoutMinutes !== undefined
            ? normalizeIdleTimeoutMinutes(
                patch.idleTimeoutMinutes,
                DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
              )
            : normalizeIdleTimeoutMinutes(
                existing.idleTimeoutMinutes,
                DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
              ),
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

    if (accountType === 'REAL' || accountType === 'SIMULATION' || accountType === 'DEMO') {
      const existing = tenantDb.findCustomerById(targetId);
      if (!existing) {
        return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      let nextUsername = existing.username;
      if (patch.username !== undefined) {
        const norm = normalizeUsername(patch.username);
        if (patch.username.trim().length > 0 && (!norm || !isValidUsername(norm))) {
          return res.status(400).json({ error: 'Format username tidak valid (3–32 karakter huruf kecil/angka/._-).' });
        }
        if (norm && tenantDb.isUsernameTaken(norm, existing.id)) {
          return res.status(409).json({ error: `Username "${norm}" sudah dipakai akun lain.` });
        }
        nextUsername = norm;
      }

      const isDemo = existing.isDemoAccount || existing.accountScope === 'DEMO';
      const isSim = existing.accountScope === 'SIMULATION';
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
        username: nextUsername,
        fullName: patch.fullName ?? existing.fullName,
        phone: patch.phone ?? existing.phone,
        status: patch.status ?? existing.status,
        allowGoogleLogin: patch.allowGoogleLogin ?? existing.allowGoogleLogin ?? true,
        allowPasswordLogin: patch.allowPasswordLogin ?? existing.allowPasswordLogin ?? true,
        subscriptionPlan: nextPlan,
        billingCycle: nextCycle,
        activeModules: nextModules,
        monthlyRecurringRevenue: isDemo || isSim ? '0.0000' : pricing.effectiveMonthlySubtotal,
        maxTenantsAllowed: patch.maxTenantsAllowed ?? existing.maxTenantsAllowed,
        idleTimeoutMinutes:
          patch.idleTimeoutMinutes !== undefined
            ? normalizeIdleTimeoutMinutes(
                patch.idleTimeoutMinutes,
                DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
              )
            : normalizeIdleTimeoutMinutes(
                existing.idleTimeoutMinutes,
                DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
              ),
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
      const scope = isDemo ? 'DEMO' : isSim ? 'SIMULATION' : 'REAL';
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

    if (accountType === 'REAL' || accountType === 'SIMULATION' || accountType === 'DEMO') {
      const target = tenantDb.findCustomerById(targetId);
      if (!target) {
        return res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
      }
      tenantDb.deleteCustomer(targetId);
      await removeUserFromPostgresByEmail(target.email);
      const payload = await buildPayload();
      return res.status(200).json({
        ok: true,
        message: `Akun ${
          accountType === 'DEMO'
            ? 'Demo'
            : accountType === 'SIMULATION'
            ? 'Simulasi'
            : 'Real'
        } ${target.email} berhasil dihapus.`,
        ...payload,
      });
    }

    return res.status(400).json({ error: 'Tipe akun tidak valid.' });
  });

  // POST /api/master/accounts/simulation/:id/reset — Reset simulation workspace transactions/stock cleanly
  app.post('/api/master/accounts/simulation/:id/reset', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Master Admin yang dapat mereset ruang kerja simulasi.' });
    }
    const targetId = String(req.params.id || '');
    const target = tenantDb.findCustomerById(targetId);
    if (!target || target.accountScope !== 'SIMULATION') {
      return res.status(404).json({ error: 'Akun Simulasi tidak ditemukan.' });
    }
    const existingWs = tenantDb.getWorkspace('SIMULATION', target.id, target.primaryTenantId);
    const rebuilt = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'SIMULATION',
      fullName: target.fullName,
      username: target.username,
      email: target.email,
      password: '••••••••',
      phone: target.phone,
      businessName: existingWs?.tenant.name || `Simulasi ${target.fullName}`,
      vertical: existingWs?.tenant.vertical || target.demoVertical || 'WARUNG_SEMBAKO',
      planCode: target.subscriptionPlan || 'PRO',
      billingCycle: target.billingCycle,
      allowGoogleLogin: target.allowGoogleLogin ?? true,
      allowPasswordLogin: target.allowPasswordLogin ?? true,
      passwordHash: target.passwordHash || '',
    });
    const resetWs: TenantWorkspaceData = {
      ...rebuilt.workspace,
      tenant: {
        ...rebuilt.workspace.tenant,
        id: target.primaryTenantId,
        slug: existingWs?.tenant.slug || rebuilt.workspace.tenant.slug,
        ownerAccountId: target.id,
        accountScope: 'SIMULATION',
      },
    };
    tenantDb.saveWorkspace('SIMULATION', target.id, resetWs);
    await syncTenantWorkspaceToPostgres({
      email: target.email,
      customer: target,
      workspace: resetWs,
    });
    const payload = await buildPayload();
    return res.status(200).json({
      ok: true,
      message: `Data ruang kerja simulasi ${resetWs.tenant.name} berhasil direset bersih seperti awal.`,
      ...payload,
    });
  });

  // POST /api/master/accounts/sync-postgres — Push all Master, Real, Simulation, Demo accounts into Neon PostgreSQL
  app.post('/api/master/accounts/sync-postgres', async (req, res) => {
    const session = extractSessionFromRequest(req);
    if (!session || session.role !== 'MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Hanya Master Admin yang dapat menyinkronkan akun ke Neon PostgreSQL.',
      });
    }

    const allWs = tenantDb.listAllWorkspaces();
    const wsMap = new Map(allWs.map((w) => [w.tenant.id, w]));
    const syncRes = await syncAllAccountsToPostgres({
      masterAccounts: tenantDb.listMasterAccounts(),
      customers: tenantDb.listCustomers(),
      workspacesByTenantId: wsMap,
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
      message: `Sinkronisasi ke Neon PostgreSQL selesai: ${syncRes.masterSynced} Master Admin, ${syncRes.realSynced} Akun Real, ${syncRes.simulationSynced} Akun Simulasi, ${syncRes.demoSynced} Akun Demo berhasil disinkronkan.`,
      ...payload,
    });
  });
}
