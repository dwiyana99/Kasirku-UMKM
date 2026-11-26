/**
 * KasirAkun UMKM — Unified Account Management & Better Auth Role Resolution Logic
 * Supports Demo, Real (Paid), and Master Admin login accounts with scrypt password hashing
 * compatible with Better Auth (`better-auth/crypto`) and Neon PostgreSQL.
 */

import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  calculateHybridPricing,
  deriveLegacyModulesFromHybrid,
  enforceWorkspacePlanEntitlements,
} from '../saas/hybrid-pricing.ts';
import { provisionOnboardedCustomer } from '../saas/onboarding-service.ts';
import type {
  AccountScope,
  AddOnModuleCode,
  BillingCycle,
  BusinessVertical,
  ManagedCustomerAccount,
  MasterAdminAccountSummary,
  StaffAccount,
  SubscriptionInvoice,
  SubscriptionPlanCode,
  TaxEntityType,
  TenantWorkspaceData,
} from '../../types/domain.ts';

import {
  DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
  DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
  normalizeIdleTimeoutMinutes,
} from './session-timeout.ts';

export interface MasterAdminAccountRecord {
  id: string;
  username?: string;
  email: string;
  fullName: string;
  phone: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
  allowGoogleLogin: boolean;
  allowPasswordLogin: boolean;
  isPrimaryOwner: boolean;
  idleTimeoutMinutes?: number;
  notes: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9._-]/g, '');
  if (!cleaned) return undefined;
  return cleaned.slice(0, 32);
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_REGEX.test(raw.trim().toLowerCase().replace(/^@+/, ''));
}

export function suggestUsernameFromEmail(email: string): string {
  const local = (email.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
  if (local.length >= 3) return local.slice(0, 28);
  return `${local || 'user'}2026`.slice(0, 28);
}

export function maskEmailForRecovery(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

export function maskUsernameForRecovery(username: string): string {
  const clean = username.trim().toLowerCase();
  if (clean.length <= 3) return `${clean[0] || '*'}***`;
  return `${clean.slice(0, 2)}***${clean.slice(-1)}`;
}

export async function hashAccountPassword(plainPassword: string): Promise<string> {
  return hashPassword(plainPassword);
}

export async function verifyAccountPassword(
  plainPassword: string,
  passwordHash?: string | null,
  legacyPlaintext?: string | null,
): Promise<boolean> {
  if (!plainPassword) return false;
  if (passwordHash && passwordHash.trim().length > 0) {
    try {
      return await verifyPassword({
        hash: passwordHash.trim(),
        password: plainPassword,
      });
    } catch {
      return false;
    }
  }
  if (legacyPlaintext && legacyPlaintext !== '••••••••') {
    const a = Buffer.from(plainPassword, 'utf8');
    const b = Buffer.from(legacyPlaintext, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return false;
}

export function sanitizeMasterAdminAccount(
  rec: MasterAdminAccountRecord,
): MasterAdminAccountSummary {
  return {
    id: rec.id,
    username: rec.username,
    email: rec.email,
    fullName: rec.fullName,
    phone: rec.phone,
    status: rec.status,
    allowGoogleLogin: rec.allowGoogleLogin,
    allowPasswordLogin: rec.allowPasswordLogin,
    isPrimaryOwner: rec.isPrimaryOwner,
    hasPassword: Boolean(rec.passwordHash && rec.passwordHash.trim().length > 0),
    idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
      rec.idleTimeoutMinutes,
      DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
    ),
    notes: rec.notes,
    lastLoginAt: rec.lastLoginAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

export function sanitizeCustomerForApi(
  cust: ManagedCustomerAccount,
): ManagedCustomerAccount {
  const isDemo = cust.isDemoAccount || cust.accountScope === 'DEMO';
  const safe: ManagedCustomerAccount = {
    ...cust,
    passwordDemo: isDemo
      ? cust.passwordDemo || 'Demo2026!'
      : cust.passwordHash
      ? '••••••••'
      : cust.passwordDemo,
    allowGoogleLogin: cust.allowGoogleLogin ?? true,
    allowPasswordLogin: cust.allowPasswordLogin ?? true,
    idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
      cust.idleTimeoutMinutes,
      DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
    ),
  };
  delete safe.passwordHash;
  return safe;
}

export async function buildInitialMasterAdminAccounts(params?: {
  primaryEmail?: string;
  primaryPassword?: string;
  secondaryOwnerEmail?: string;
}): Promise<MasterAdminAccountRecord[]> {
  const now = new Date().toISOString();
  const primaryEmail = (params?.primaryEmail || 'master@kasirakun.id').trim().toLowerCase();
  const primaryPassword = params?.primaryPassword || 'Master2026!';
  const secondaryEmail = (params?.secondaryOwnerEmail || 'dwiyana99@gmail.com')
    .trim()
    .toLowerCase();

  const defaultHash = await hashAccountPassword(primaryPassword);
  const list: MasterAdminAccountRecord[] = [
    {
      id: 'master-primary-1',
      username: 'master',
      email: primaryEmail,
      fullName: 'Master Pemilik KasirAkun',
      phone: '081100000001',
      passwordHash: defaultHash,
      status: 'ACTIVE',
      allowGoogleLogin: true,
      allowPasswordLogin: true,
      isPrimaryOwner: true,
      idleTimeoutMinutes: DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
      notes: 'Akun utama pengelola platform KasirAkun UMKM',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  if (secondaryEmail && secondaryEmail !== primaryEmail) {
    list.push({
      id: 'master-owner-google',
      username: suggestUsernameFromEmail(secondaryEmail),
      email: secondaryEmail,
      fullName: 'Pemilik Platform (Google & Email)',
      phone: '081100000002',
      passwordHash: defaultHash,
      status: 'ACTIVE',
      allowGoogleLogin: true,
      allowPasswordLogin: true,
      isPrimaryOwner: true,
      idleTimeoutMinutes: DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES,
      notes: 'Akun Google Pemilik Utama terhubung dengan konsol Master Admin',
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return list;
}

export function canDeactivateOrDeleteMasterAdmin(params: {
  allMasters: MasterAdminAccountRecord[];
  targetId: string;
  actorEmail?: string;
  action: 'SUSPEND' | 'DELETE';
}): { allowed: boolean; reason?: string } {
  const target = params.allMasters.find((m) => m.id === params.targetId);
  if (!target) {
    return { allowed: false, reason: 'Akun Master Admin tidak ditemukan.' };
  }
  if (
    params.actorEmail &&
    target.email.trim().toLowerCase() === params.actorEmail.trim().toLowerCase()
  ) {
    return {
      allowed: false,
      reason:
        params.action === 'DELETE'
          ? 'Anda tidak dapat menghapus akun Master Admin yang sedang digunakan.'
          : 'Anda tidak dapat menangguhkan akun Master Admin yang sedang digunakan.',
    };
  }
  const activeCount = params.allMasters.filter((m) => m.status === 'ACTIVE').length;
  if (target.status === 'ACTIVE' && activeCount <= 1) {
    return {
      allowed: false,
      reason: 'Minimal harus ada 1 akun Master Admin berstatus AKTIF agar akses konsol tidak terkunci.',
    };
  }
  return { allowed: true };
}

export interface BetterAuthResolutionResult {
  allowed: boolean;
  error?: string;
  targetRole: 'MASTER_ADMIN' | 'CUSTOMER' | 'STAFF' | 'NEEDS_ONBOARDING';
  masterAccount?: MasterAdminAccountRecord;
  customer?: ManagedCustomerAccount;
  staffMatch?: {
    scope: AccountScope;
    ownerAccountId: string;
    workspace: TenantWorkspaceData;
    staff: StaffAccount;
    ownerAccount: ManagedCustomerAccount | null;
  };
}

export function resolveBetterAuthLoginTarget(params: {
  email: string;
  authMethod: 'GOOGLE' | 'EMAIL';
  masterAccounts: MasterAdminAccountRecord[];
  customer: ManagedCustomerAccount | null;
  staffMatch: BetterAuthResolutionResult['staffMatch'] | null;
  isPostgresSuperAdmin?: boolean;
}): BetterAuthResolutionResult {
  const emailNorm = params.email.trim().toLowerCase();

  // 1. Check Master Admin directory first
  const masterHit = params.masterAccounts.find(
    (m) => m.email.trim().toLowerCase() === emailNorm,
  );
  if (masterHit) {
    if (masterHit.status !== 'ACTIVE') {
      return {
        allowed: false,
        targetRole: 'MASTER_ADMIN',
        error: 'Akun Master Admin ini sedang ditangguhkan. Hubungi pengelola utama.',
      };
    }
    if (params.authMethod === 'GOOGLE' && !masterHit.allowGoogleLogin) {
      return {
        allowed: false,
        targetRole: 'MASTER_ADMIN',
        error: 'Login Google dinonaktifkan untuk akun Master Admin ini. Gunakan email & kata sandi.',
      };
    }
    if (params.authMethod === 'EMAIL' && !masterHit.allowPasswordLogin) {
      return {
        allowed: false,
        targetRole: 'MASTER_ADMIN',
        error: 'Login kata sandi dinonaktifkan untuk akun ini. Gunakan tombol Masuk dengan Google.',
      };
    }
    return {
      allowed: true,
      targetRole: 'MASTER_ADMIN',
      masterAccount: masterHit,
    };
  }

  // Allow PostgreSQL super-admin flag if no local record yet
  if (params.isPostgresSuperAdmin) {
    return {
      allowed: true,
      targetRole: 'MASTER_ADMIN',
    };
  }

  // 2. Check Customer (REAL or DEMO)
  if (params.customer) {
    const cust = params.customer;
    if (cust.status === 'SUSPENDED' || cust.status === 'DEACTIVATED') {
      return {
        allowed: false,
        targetRole: 'CUSTOMER',
        error: `Akun usaha berstatus ${cust.status}. Hubungi Master Admin untuk mengaktifkan kembali.`,
      };
    }
    if (
      cust.accountScope === 'DEMO' &&
      cust.demoExpiresAt &&
      new Date(cust.demoExpiresAt).getTime() < Date.now()
    ) {
      return {
        allowed: false,
        targetRole: 'CUSTOMER',
        error: 'Masa berlaku akun demo telah berakhir. Silakan hubungi Master Admin atau pilih paket berbayar.',
      };
    }
    if (params.authMethod === 'GOOGLE' && cust.allowGoogleLogin === false) {
      return {
        allowed: false,
        targetRole: 'CUSTOMER',
        error: 'Login Google dinonaktifkan oleh Master Admin untuk akun ini.',
      };
    }
    if (params.authMethod === 'EMAIL' && cust.allowPasswordLogin === false) {
      return {
        allowed: false,
        targetRole: 'CUSTOMER',
        error: 'Login kata sandi dinonaktifkan untuk akun ini. Gunakan Masuk dengan Google.',
      };
    }
    return {
      allowed: true,
      targetRole: 'CUSTOMER',
      customer: cust,
    };
  }

  // 3. Check Staff accounts across tenants
  if (params.staffMatch) {
    if (!params.staffMatch.staff.isActive) {
      return {
        allowed: false,
        targetRole: 'STAFF',
        error: 'Akun pegawai sedang dinonaktifkan oleh pemilik usaha.',
      };
    }
    if (
      params.staffMatch.ownerAccount &&
      (params.staffMatch.ownerAccount.status === 'SUSPENDED' ||
        params.staffMatch.ownerAccount.status === 'DEACTIVATED')
    ) {
      return {
        allowed: false,
        targetRole: 'STAFF',
        error: 'Akun pemilik usaha sedang nonaktif.',
      };
    }
    return {
      allowed: true,
      targetRole: 'STAFF',
      staffMatch: params.staffMatch,
    };
  }

  // 4. Brand-new Google / Better Auth user not yet bound to any tenant
  return {
    allowed: true,
    targetRole: 'NEEDS_ONBOARDING',
  };
}

export interface MasterProvisionCustomerInput {
  accountScope: AccountScope;
  fullName: string;
  username?: string;
  email: string;
  password: string;
  phone?: string;
  businessName: string;
  vertical: BusinessVertical;
  planCode: SubscriptionPlanCode;
  billingCycle: BillingCycle;
  status?: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  maxTenantsAllowed?: number;
  demoDurationDays?: number;
  allowGoogleLogin?: boolean;
  allowPasswordLogin?: boolean;
  idleTimeoutMinutes?: number;
  taxEntity?: TaxEntityType;
  notes?: string;
  passwordHash: string;
  templateWorkspace?: TenantWorkspaceData | null;
}

export function buildMasterProvisionedAccountAndWorkspace(
  input: MasterProvisionCustomerInput,
): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  const now = new Date();
  const nowIso = now.toISOString();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const emailNorm = input.email.trim().toLowerCase();
  const normalizedUsername = normalizeUsername(input.username) || suggestUsernameFromEmail(emailNorm);
  const addOns: AddOnModuleCode[] =
    input.planCode === 'EXPERT'
      ? ['ADDON_EXTRA_BRANCH', 'ADDON_TAX_CORETAX', 'ADDON_ACCOUNTING_PRO']
      : [];
  const legacyModules = deriveLegacyModulesFromHybrid(input.planCode, addOns);
  const pricing = calculateHybridPricing({
    planCode: input.planCode,
    selectedAddOns: addOns,
    billingCycle: input.billingCycle,
    extraBranchQty: 1,
    extraStaffQty: 1,
  });

  if (input.accountScope === 'DEMO') {
    const durationDays = Math.max(1, Math.min(90, input.demoDurationDays ?? 7));
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const custId = `cust-demo-adm-${suffix}`;
    const tenantId = `demo-adm-${suffix}`;

    let workspace: TenantWorkspaceData;
    if (input.templateWorkspace) {
      workspace = enforceWorkspacePlanEntitlements({
        ...input.templateWorkspace,
        tenant: {
          ...input.templateWorkspace.tenant,
          id: tenantId,
          name: input.businessName.trim(),
          slug: `${input.businessName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 36)}-${suffix.slice(-4)}`,
          vertical: input.vertical,
          accountScope: 'DEMO',
          ownerAccountId: custId,
          subscriptionPlan: input.planCode,
          activeAddOns: addOns,
          activeModules: legacyModules,
        },
      });
    } else {
      const fakeInv: SubscriptionInvoice = {
        id: `inv-demo-${suffix}`,
        invoiceNumber: `DEMO-${suffix.toUpperCase()}`,
        customerEmail: emailNorm,
        billingCycle: input.billingCycle,
        planCode: input.planCode,
        selectedAddOns: addOns,
        selectedModules: legacyModules,
        subtotalAmount: '0.0000',
        dppNilaiLain: '0.0000',
        ppnAmount: '0.0000',
        grandTotal: '0.0000',
        paymentMethod: 'QRIS_DYNAMIC',
        paymentStatus: 'VERIFIED_PAID',
        gatewayRefId: null,
        paidAt: nowIso,
        createdAt: nowIso,
      };
      const provisioned = provisionOnboardedCustomer({
        invoice: fakeInv,
        fullName: input.fullName.trim(),
        email: emailNorm,
        passwordDemo: input.password,
        phone: input.phone?.trim() || '081200000000',
        businessName: input.businessName.trim(),
        vertical: input.vertical,
        taxEntity: input.taxEntity || 'WP_OP',
        isPkp: false,
        npwp16: '3174010000000001',
        nitku22: '3174010000000001000001',
        address: 'Indonesia',
        receiptFooter: `Terima kasih telah berkunjung ke ${input.businessName.trim()}!`,
        thermalPaperWidth: '80mm',
        autoPrintQrOrders: true,
        tableCount: input.vertical === 'RESTORAN' || input.vertical === 'KEDAI_MAKAN' ? 6 : 0,
        initialCapital: '25000000',
        menuDrafts: [],
        customFields: [],
      });
      workspace = enforceWorkspacePlanEntitlements({
        ...provisioned.workspace,
        tenant: {
          ...provisioned.workspace.tenant,
          id: tenantId,
          accountScope: 'DEMO',
          ownerAccountId: custId,
        },
      });
    }

    const customer: ManagedCustomerAccount = {
      id: custId,
      fullName: input.fullName.trim(),
      username: normalizedUsername,
      email: emailNorm,
      passwordDemo: input.password,
      passwordHash: input.passwordHash,
      allowGoogleLogin: input.allowGoogleLogin ?? true,
      allowPasswordLogin: input.allowPasswordLogin ?? true,
      phone: input.phone?.trim() || '081200000000',
      role: 'OWNER',
      status: input.status || 'TRIAL',
      billingCycle: input.billingCycle,
      subscriptionPlan: input.planCode,
      activeModules: legacyModules,
      activeAddOns: addOns,
      monthlyRecurringRevenue: '0.0000',
      maxTenantsAllowed: Math.max(1, input.maxTenantsAllowed ?? 2),
      tenantIds: [tenantId],
      primaryTenantId: tenantId,
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: input.vertical,
      demoExpiresAt: expiresAt,
      onboardingCompleted: true,
      lastInvoiceNumber: `DEMO-${suffix.toUpperCase()}`,
      lastPaidAt: nowIso,
      validUntil: expiresAt,
      adminNotes:
        input.notes?.trim() || `Akun Demo dibuat Master Admin (${durationDays} hari · ${input.planCode})`,
      idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
        input.idleTimeoutMinutes,
        DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      ),
      createdAt: nowIso,
    };

    return { customer, workspace };
  }

  // SIMULATION account provisioning — 100% clean-slate workspace (zero dummy data, Rp 0 opening capital)
  // behaving identically to a brand-new REAL account in an isolated `simulation` partition with Rp 0 MRR.
  if (input.accountScope === 'SIMULATION') {
    const custId = `cust-sim-${suffix}`;
    const tenantId = `sim-${suffix}`;
    const validUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const simInv: SubscriptionInvoice = {
      id: `inv-sim-${suffix}`,
      invoiceNumber: `SIM-${nowIso.slice(0, 10).replace(/-/g, '')}-${suffix.slice(-4).toUpperCase()}`,
      customerEmail: emailNorm,
      billingCycle: input.billingCycle,
      planCode: input.planCode,
      selectedAddOns: addOns,
      selectedModules: legacyModules,
      subtotalAmount: '0.0000',
      dppNilaiLain: '0.0000',
      ppnAmount: '0.0000',
      grandTotal: '0.0000',
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'VERIFIED_PAID',
      gatewayRefId: `SIMULATION-PROVISION-${suffix}`,
      paidAt: nowIso,
      createdAt: nowIso,
    };

    const provisioned = provisionOnboardedCustomer({
      invoice: simInv,
      accountScope: 'SIMULATION',
      username: normalizedUsername,
      idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
        input.idleTimeoutMinutes,
        DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      ),
      fullName: input.fullName.trim(),
      email: emailNorm,
      passwordDemo: input.password,
      phone: input.phone?.trim() || '081200000000',
      businessName: input.businessName.trim(),
      vertical: input.vertical,
      taxEntity: input.taxEntity || 'WP_OP',
      isPkp: false,
      npwp16: '3174010000000001',
      nitku22: '3174010000000001000001',
      address: 'Indonesia',
      receiptFooter: `Terima kasih telah berkunjung ke ${input.businessName.trim()}!`,
      thermalPaperWidth: '80mm',
      autoPrintQrOrders: true,
      tableCount: input.vertical === 'RESTORAN' || input.vertical === 'KEDAI_MAKAN' ? 4 : 0,
      initialCapital: '0',
      menuDrafts: [],
      customFields: [],
    });

    const workspace = enforceWorkspacePlanEntitlements({
      ...provisioned.workspace,
      tenant: {
        ...provisioned.workspace.tenant,
        id: tenantId,
        accountScope: 'SIMULATION',
        ownerAccountId: custId,
      },
    });

    const customer: ManagedCustomerAccount = {
      id: custId,
      fullName: input.fullName.trim(),
      username: normalizedUsername,
      email: emailNorm,
      passwordDemo: '••••••••',
      passwordHash: input.passwordHash,
      allowGoogleLogin: input.allowGoogleLogin ?? true,
      allowPasswordLogin: input.allowPasswordLogin ?? true,
      phone: input.phone?.trim() || '081200000000',
      role: 'OWNER',
      status: input.status || 'ACTIVE',
      billingCycle: input.billingCycle,
      subscriptionPlan: input.planCode,
      activeModules: legacyModules,
      activeAddOns: addOns,
      monthlyRecurringRevenue: '0.0000',
      maxTenantsAllowed: Math.max(1, input.maxTenantsAllowed ?? 3),
      tenantIds: [tenantId],
      primaryTenantId: tenantId,
      accountScope: 'SIMULATION',
      isDemoAccount: false,
      demoVertical: input.vertical,
      demoExpiresAt: null,
      onboardingCompleted: true,
      lastInvoiceNumber: `SIM-${suffix.slice(-6).toUpperCase()}`,
      lastPaidAt: nowIso,
      validUntil,
      adminNotes:
        input.notes?.trim() || `Akun Simulasi bersih dari awal (tanpa data dummy · ${input.planCode})`,
      idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
        input.idleTimeoutMinutes,
        DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
      ),
      createdAt: nowIso,
    };

    return { customer, workspace };
  }

  // REAL account provisioning
  const invoice: SubscriptionInvoice = {
    id: `inv-adm-${suffix}`,
    invoiceNumber: `ADM-${nowIso.slice(0, 10).replace(/-/g, '')}-${suffix.slice(-4).toUpperCase()}`,
    customerEmail: emailNorm,
    billingCycle: input.billingCycle,
    planCode: input.planCode,
    selectedAddOns: addOns,
    selectedModules: legacyModules,
    subtotalAmount: pricing.billingSubtotal,
    dppNilaiLain: pricing.dppNilaiLain,
    ppnAmount: pricing.ppnAmount,
    grandTotal: pricing.grandTotal,
    paymentMethod: 'BANK_TRANSFER',
    paymentStatus: 'VERIFIED_PAID',
    gatewayRefId: `MASTER-PROVISION-${suffix}`,
    paidAt: nowIso,
    createdAt: nowIso,
  };

  const provisioned = provisionOnboardedCustomer({
    invoice,
    fullName: input.fullName.trim(),
    email: emailNorm,
    passwordDemo: input.password,
    phone: input.phone?.trim() || '081200000000',
    businessName: input.businessName.trim(),
    vertical: input.vertical,
    taxEntity: input.taxEntity || 'WP_OP',
    isPkp: false,
    npwp16: '3174010000000001',
    nitku22: '3174010000000001000001',
    address: 'Indonesia',
    receiptFooter: `Terima kasih telah berbelanja di ${input.businessName.trim()}!`,
    thermalPaperWidth: '80mm',
    autoPrintQrOrders: true,
    tableCount: input.vertical === 'RESTORAN' || input.vertical === 'KEDAI_MAKAN' ? 6 : 0,
    initialCapital: '25000000',
    menuDrafts: [],
    customFields: [],
  });

  const customer: ManagedCustomerAccount = {
    ...provisioned.customer,
    username: normalizedUsername,
    passwordDemo: '••••••••',
    passwordHash: input.passwordHash,
    allowGoogleLogin: input.allowGoogleLogin ?? true,
    allowPasswordLogin: input.allowPasswordLogin ?? true,
    status: input.status || 'ACTIVE',
    maxTenantsAllowed: Math.max(1, input.maxTenantsAllowed ?? provisioned.customer.maxTenantsAllowed),
    idleTimeoutMinutes: normalizeIdleTimeoutMinutes(
      input.idleTimeoutMinutes,
      DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
    ),
    adminNotes:
      input.notes?.trim() || `Akun Usaha Asli dibuat via Master Admin (${input.planCode})`,
  };

  return { customer, workspace: provisioned.workspace };
}
