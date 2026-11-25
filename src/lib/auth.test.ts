import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrustedOrigins,
  getAuthConfigurationStatus,
  isGoogleOAuthConfigured,
  resolveBaseUrl,
} from './auth.ts';
import { isDatabaseConfigured } from './prisma.ts';
import {
  buildInitialMasterAdminAccounts,
  buildMasterProvisionedAccountAndWorkspace,
  canDeactivateOrDeleteMasterAdmin,
  hashAccountPassword,
  resolveBetterAuthLoginTarget,
  sanitizeCustomerForApi,
  sanitizeMasterAdminAccount,
  verifyAccountPassword,
} from './auth/account-management.ts';
import type { ManagedCustomerAccount } from '../types/domain.ts';

describe('Better Auth & Neon Deployment Configuration Helpers', () => {
  it('resolves baseURL across BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, VERCEL_URL, and localhost', () => {
    assert.equal(resolveBaseUrl({}), 'http://localhost:3000');
    assert.equal(
      resolveBaseUrl({ VERCEL_URL: 'kasirakun-preview.vercel.app' }),
      'https://kasirakun-preview.vercel.app',
    );
    assert.equal(
      resolveBaseUrl({
        NEXT_PUBLIC_APP_URL: 'https://kasirakun.id/',
        VERCEL_URL: 'kasirakun-preview.vercel.app',
      }),
      'https://kasirakun.id',
    );
    assert.equal(
      resolveBaseUrl({
        BETTER_AUTH_URL: 'https://app.kasirakun.id/',
        NEXT_PUBLIC_APP_URL: 'https://kasirakun.id',
      }),
      'https://app.kasirakun.id',
    );
  });

  it('builds trustedOrigins including Vercel preview URLs and wildcard root domains', () => {
    const origins = buildTrustedOrigins({
      BETTER_AUTH_URL: 'https://kasirakun.id',
      VERCEL_URL: 'kasirakun-git-main.vercel.app',
      ROOT_DOMAIN: 'kasirakun.id',
    });
    assert.ok(origins.includes('http://localhost:3000'));
    assert.ok(origins.includes('https://kasirakun.id'));
    assert.ok(origins.includes('https://kasirakun-git-main.vercel.app'));
    assert.ok(origins.includes('https://*.kasirakun.id'));
  });

  it('detects Google OAuth & PostgreSQL Neon configuration cleanly without crashing when empty', () => {
    assert.equal(isGoogleOAuthConfigured({}), false);
    assert.equal(isGoogleOAuthConfigured({ GOOGLE_CLIENT_ID: 'abc', GOOGLE_CLIENT_SECRET: '' }), false);
    assert.equal(
      isGoogleOAuthConfigured({
        GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'GOCSPX-secret',
      }),
      true,
    );

    assert.equal(isDatabaseConfigured({}), false);
    assert.equal(
      isDatabaseConfigured({
        DATABASE_URL: 'postgresql://neondb_owner:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb',
      }),
      false,
    );
    assert.equal(
      isDatabaseConfigured({
        DATABASE_URL: 'postgresql://user:realpass@ep-cool-fire-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
      }),
      true,
    );

    const status = getAuthConfigurationStatus({
      BETTER_AUTH_SECRET: '0123456789abcdef0123456789abcdef',
      GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'GOCSPX-secret',
      DATABASE_URL: 'postgresql://user:realpass@ep-cool-fire-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    });
    assert.equal(status.googleAuthConfigured, true);
    assert.equal(status.betterAuthSecretConfigured, true);
    assert.equal(status.databaseConfigured, true);
    assert.equal(status.betterAuthReady, true);
  });
});

describe('Master / Real / Demo Account Management & Better Auth Resolution', () => {
  it('hashes and verifies passwords with scrypt and masks secrets during sanitization', async () => {
    const hash = await hashAccountPassword('Rahasia2026!');
    assert.ok(hash.includes(':'));
    assert.equal(await verifyAccountPassword('Rahasia2026!', hash), true);
    assert.equal(await verifyAccountPassword('Salah123', hash), false);

    const masters = await buildInitialMasterAdminAccounts();
    assert.equal(masters.length, 2);
    const sanitizedMaster = sanitizeMasterAdminAccount(masters[0]);
    assert.equal('passwordHash' in sanitizedMaster, false);
    assert.equal(sanitizedMaster.hasPassword, true);

    const realProv = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'REAL',
      fullName: 'Budi Santoso',
      email: 'budi@tokosumber.id',
      password: 'PasswordKuat1',
      businessName: 'Toko Sumber Makmur',
      vertical: 'WARUNG_SEMBAKO',
      planCode: 'PRO',
      billingCycle: 'MONTHLY',
      passwordHash: hash,
    });
    const safeReal = sanitizeCustomerForApi(realProv.customer);
    assert.equal(safeReal.passwordDemo, '••••••••');
    assert.equal(safeReal.passwordHash, undefined);
    assert.equal(realProv.workspace.tenant.accountScope, 'REAL');

    const demoProv = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'DEMO',
      fullName: 'Rina Demo',
      email: 'rina.demo@kasirakun.id',
      password: 'DemoUser123',
      businessName: 'Kost Melati Demo',
      vertical: 'KOST_KONTRAKAN',
      planCode: 'PRO',
      billingCycle: 'MONTHLY',
      demoDurationDays: 14,
      passwordHash: hash,
    });
    const safeDemo = sanitizeCustomerForApi(demoProv.customer);
    assert.equal(safeDemo.passwordDemo, 'DemoUser123');
    assert.equal(safeDemo.passwordHash, undefined);
    assert.equal(demoProv.workspace.tenant.accountScope, 'DEMO');
  });

  it('prevents self-lockout and deleting the last active Master Admin account', async () => {
    const masters = await buildInitialMasterAdminAccounts();
    const selfDelete = canDeactivateOrDeleteMasterAdmin({
      allMasters: masters,
      targetId: masters[0].id,
      actorEmail: masters[0].email,
      action: 'DELETE',
    });
    assert.equal(selfDelete.allowed, false);

    const otherDelete = canDeactivateOrDeleteMasterAdmin({
      allMasters: masters,
      targetId: masters[1].id,
      actorEmail: masters[0].email,
      action: 'DELETE',
    });
    assert.equal(otherDelete.allowed, true);

    const singleMaster = [masters[0]];
    const lastMasterSuspend = canDeactivateOrDeleteMasterAdmin({
      allMasters: singleMaster,
      targetId: singleMaster[0].id,
      actorEmail: 'other@kasirakun.id',
      action: 'SUSPEND',
    });
    assert.equal(lastMasterSuspend.allowed, false);
  });

  it('resolves Better Auth Google & Email login targets with strict status and method enforcement', async () => {
    const masters = await buildInitialMasterAdminAccounts();
    const hash = await hashAccountPassword('User2026!');

    // Master Admin Google login allowed
    const mRes = resolveBetterAuthLoginTarget({
      email: 'dwiyana99@gmail.com',
      authMethod: 'GOOGLE',
      masterAccounts: masters,
      customer: null,
      staffMatch: null,
    });
    assert.equal(mRes.allowed, true);
    assert.equal(mRes.targetRole, 'MASTER_ADMIN');

    // Suspended Master Admin blocked
    const suspendedMasters = masters.map((m) =>
      m.email === 'dwiyana99@gmail.com' ? { ...m, status: 'SUSPENDED' as const } : m,
    );
    const mBlocked = resolveBetterAuthLoginTarget({
      email: 'dwiyana99@gmail.com',
      authMethod: 'GOOGLE',
      masterAccounts: suspendedMasters,
      customer: null,
      staffMatch: null,
    });
    assert.equal(mBlocked.allowed, false);

    // Real customer with allowGoogleLogin = false blocked on Google, allowed on Email
    const realCust: ManagedCustomerAccount = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'REAL',
      fullName: 'Toko Jaya',
      email: 'jaya@toko.id',
      password: 'User2026!',
      businessName: 'Toko Jaya',
      vertical: 'TOKO_RETAIL',
      planCode: 'BASIC',
      billingCycle: 'MONTHLY',
      allowGoogleLogin: false,
      allowPasswordLogin: true,
      passwordHash: hash,
    }).customer;

    const cGoogleBlocked = resolveBetterAuthLoginTarget({
      email: 'jaya@toko.id',
      authMethod: 'GOOGLE',
      masterAccounts: masters,
      customer: realCust,
      staffMatch: null,
    });
    assert.equal(cGoogleBlocked.allowed, false);

    const cEmailAllowed = resolveBetterAuthLoginTarget({
      email: 'jaya@toko.id',
      authMethod: 'EMAIL',
      masterAccounts: masters,
      customer: realCust,
      staffMatch: null,
    });
    assert.equal(cEmailAllowed.allowed, true);
    assert.equal(cEmailAllowed.targetRole, 'CUSTOMER');

    // Expired Demo blocked
    const expiredDemo: ManagedCustomerAccount = {
      ...realCust,
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoExpiresAt: '2020-01-01T00:00:00.000Z',
      allowGoogleLogin: true,
    };
    const dExpired = resolveBetterAuthLoginTarget({
      email: 'jaya@toko.id',
      authMethod: 'GOOGLE',
      masterAccounts: masters,
      customer: expiredDemo,
      staffMatch: null,
    });
    assert.equal(dExpired.allowed, false);

    // Brand-new Google user needs onboarding
    const newGoogle = resolveBetterAuthLoginTarget({
      email: 'baru@gmail.com',
      authMethod: 'GOOGLE',
      masterAccounts: masters,
      customer: null,
      staffMatch: null,
    });
    assert.equal(newGoogle.allowed, true);
    assert.equal(newGoogle.targetRole, 'NEEDS_ONBOARDING');
  });
});

