import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  buildTrustedOrigins,
  getAuthConfigurationStatus,
  isGoogleOAuthConfigured,
  resolveBaseUrl,
} from './auth.ts';
import { resolveDefaultDataRoot } from './db/tenant-db.ts';
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

describe('Vercel Serverless Runtime Compatibility', () => {
  it('uses writable tmpdir for DATA_ROOT on Vercel and trusts *.vercel.app origins', () => {
    const vercelRoot = resolveDefaultDataRoot({ VERCEL: '1' });
    assert.equal(vercelRoot, path.join(os.tmpdir(), 'kasirakun-data', 'db'));

    const localRoot = resolveDefaultDataRoot({});
    assert.equal(localRoot, path.resolve(process.cwd(), '.data', 'db'));

    assert.equal(
      resolveBaseUrl({
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'kasirakun-prod.vercel.app',
        VERCEL_URL: 'kasirakun-git-main.vercel.app',
      }),
      'https://kasirakun-prod.vercel.app',
    );

    const origins = buildTrustedOrigins({ VERCEL: '1' });
    assert.ok(origins.includes('https://*.vercel.app'));
  });

  it('serves /api/auth/config-status and /api/auth/master-login through api/index.ts without binding port', async () => {
    const fs = await import('node:fs');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirakun-vercel-test-'));
    process.env.KASIRAKUN_SERVERLESS_ONLY = '1';
    process.env.KASIRAKUN_DATA_ROOT = tempRoot;
    const http = await import('node:http');
    const { default: vercelHandler } = await import('../../api/index.ts');

    const srv = http.createServer((req, res) => {
      void vercelHandler(req, res);
    });
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const cfgResp = await fetch(`${baseUrl}/api/auth/config-status`);
      assert.equal(cfgResp.status, 200);
      const cfgJson = (await cfgResp.json()) as Record<string, unknown>;
      assert.equal(typeof cfgJson.betterAuthReady, 'boolean');

      // Simulate Vercel rewrite `/api/:path* -> /api/index?__vercel_path=:path*`
      const rewrittenCfgResp = await fetch(
        `${baseUrl}/api/index?__vercel_path=${encodeURIComponent('auth/config-status')}`,
      );
      assert.equal(rewrittenCfgResp.status, 200);
      const rewrittenCfgJson = (await rewrittenCfgResp.json()) as Record<string, unknown>;
      assert.equal(typeof rewrittenCfgJson.betterAuthReady, 'boolean');

      // Verify diagnostic endpoint exposes safe Better Auth & Google OAuth readiness without leaking secrets
      const diagResp = await fetch(
        `${baseUrl}/api/index?__vercel_path=${encodeURIComponent('auth/diagnostics')}`,
      );
      assert.equal(diagResp.status, 200);
      const diagJson = (await diagResp.json()) as Record<string, unknown>;
      assert.equal(diagJson.status, 'ok');
      assert.equal(diagJson.matchedPath, '/api/auth/diagnostics');
      assert.equal(diagJson.masterGoogleAdminEmail, 'dwiyana99@gmail.com');
      assert.equal(diagJson.newUserGoogleOnboardingEnabled, true);
      assert.equal(typeof diagJson.betterAuthUrlMatchesRequestHost, 'boolean');
      assert.ok(String(diagJson.googleCallbackUrl).endsWith('/api/auth/callback/google'));
      assert.equal('BETTER_AUTH_SECRET' in diagJson, false);
      assert.equal('GOOGLE_CLIENT_SECRET' in diagJson, false);

      const loginResp = await fetch(
        `${baseUrl}/api/index?__vercel_path=${encodeURIComponent('auth/master-login')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'master@kasirakun.id',
            password: 'Master2026!',
          }),
        },
      );
      assert.equal(loginResp.status, 200);
      const loginJson = (await loginResp.json()) as Record<string, unknown>;
      assert.equal(loginJson.authenticated, true);
      assert.equal(loginJson.role, 'MASTER_ADMIN');
      assert.ok(typeof loginJson.token === 'string' && loginJson.token.length > 10);

      const demoResp = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'demo.sembako@kasirakun.id',
          password: 'Demo2026!',
        }),
      });
      assert.equal(demoResp.status, 200);
      const demoJson = (await demoResp.json()) as Record<string, unknown>;
      assert.equal(demoJson.authenticated, true);
      assert.equal(demoJson.role, 'CUSTOMER');
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      fs.rmSync(tempRoot, { recursive: true, force: true });
      delete process.env.KASIRAKUN_DATA_ROOT;
    }
  });
});

describe('Environment Mapping, Gateway Env Fallback & Neon Workspace Snapshot Sync', () => {
  it('synchronizes STANDARD_ENV_CATALOG and buildProductionEnvSnippet to the 16 Vercel + Neon + Midtrans + Fonnte + Google keys', async () => {
    const { STANDARD_ENV_CATALOG } = await import('../server/env-secrets-routes.ts');
    const { buildProductionEnvSnippet, DEFAULT_INFRA_MIGRATION_CONFIG } = await import(
      './infra/pg-migration-builder.ts'
    );

    const catalogKeys = new Set(STANDARD_ENV_CATALOG.map((item) => item.key));
    const expectedKeys = [
      'DATABASE_URL',
      'DIRECT_URL',
      'AWS_ENDPOINT_URL_S3',
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'S3_BUCKET',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'MASTER_ADMIN_EMAIL',
      'MASTER_ADMIN_PASSWORD',
      'MIDTRANS_SERVER_KEY',
      'MIDTRANS_CLIENT_KEY',
      'FONNTE_TOKEN',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
    ];
    assert.equal(STANDARD_ENV_CATALOG.length, expectedKeys.length);
    for (const key of expectedKeys) {
      assert.ok(catalogKeys.has(key), `Missing ${key} in STANDARD_ENV_CATALOG`);
    }

    const removedKeys = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'DUITKU_MERCHANT_CODE',
      'DUITKU_API_KEY',
      'TRIPAY_MERCHANT_CODE',
      'TRIPAY_API_KEY',
      'TRIPAY_PRIVATE_KEY',
      'GEMINI_API_KEY',
    ];
    for (const removed of removedKeys) {
      assert.equal(catalogKeys.has(removed), false, `Unused key ${removed} should be removed`);
    }

    const snippet = buildProductionEnvSnippet({
      ...DEFAULT_INFRA_MIGRATION_CONFIG,
      targetDbProvider: 'NEON_POSTGRES',
      targetStorageProvider: 'NEON_OBJECT_STORAGE',
    });
    for (const token of [
      'DATABASE_URL=',
      'DIRECT_URL=',
      'BETTER_AUTH_SECRET=',
      'BETTER_AUTH_URL=',
      'MASTER_ADMIN_EMAIL=',
      'MASTER_ADMIN_PASSWORD=',
      'AWS_ENDPOINT_URL_S3=',
      'AWS_REGION=',
      'AWS_ACCESS_KEY_ID=',
      'AWS_SECRET_ACCESS_KEY=',
      'S3_BUCKET=',
      'MIDTRANS_SERVER_KEY=',
      'MIDTRANS_CLIENT_KEY=',
      'FONNTE_TOKEN=',
      'GOOGLE_CLIENT_ID=',
      'GOOGLE_CLIENT_SECRET=',
    ]) {
      assert.ok(snippet.includes(token), `Missing ${token} in buildProductionEnvSnippet`);
    }
    assert.equal(snippet.includes('DUITKU_'), false);
    assert.equal(snippet.includes('TRIPAY_'), false);
    assert.equal(snippet.includes('SUPABASE_'), false);
    assert.equal(snippet.includes('R2_'), false);
    assert.equal(snippet.includes('GEMINI_'), false);
  });

  it('resolves per-tenant encrypted payment credentials and falls back to platform env vars safely', async () => {
    const { encryptSecret } = await import('./payments/crypto.ts');
    const { hasRequiredGatewayCredentials, resolveEffectiveGatewayCredentials } = await import(
      './payments/gateway-credentials.ts'
    );

    const emptyCfg = {
      provider: 'MIDTRANS' as const,
      environment: 'SANDBOX' as const,
      merchantCode: null,
      encryptedServerKey: null,
      encryptedClientKey: null,
      encryptedPrivateKey: null,
    };

    const platformFallback = resolveEffectiveGatewayCredentials(emptyCfg, {
      MIDTRANS_SERVER_KEY: 'Mid-server-live123',
      MIDTRANS_CLIENT_KEY: 'Mid-client-live123',
    });
    assert.equal(platformFallback.serverKey, 'Mid-server-live123');
    assert.equal(platformFallback.clientKey, 'Mid-client-live123');
    assert.equal(platformFallback.environment, 'PRODUCTION');
    assert.equal(hasRequiredGatewayCredentials('MIDTRANS', platformFallback), true);

    const tenantOverride = resolveEffectiveGatewayCredentials(
      {
        ...emptyCfg,
        encryptedServerKey: encryptSecret('SB-Mid-server-tenant999'),
      },
      {
        MIDTRANS_SERVER_KEY: 'Mid-server-live123',
      },
    );
    assert.equal(tenantOverride.serverKey, 'SB-Mid-server-tenant999');

    const tripayFallback = resolveEffectiveGatewayCredentials(
      { ...emptyCfg, provider: 'TRIPAY' },
      {
        TRIPAY_MERCHANT_CODE: 'T9999',
        TRIPAY_API_KEY: 'DEV-abc',
        TRIPAY_PRIVATE_KEY: 'priv-xyz',
      },
    );
    assert.equal(hasRequiredGatewayCredentials('TRIPAY', tripayFallback), true);
    assert.equal(tripayFallback.merchantCode, 'T9999');
  });

  it('preserves and extracts full workspaceSnapshot inside Neon Tenant settings payload', async () => {
    const { buildTenantSettingsPayload, extractWorkspaceSnapshotFromSettings } = await import(
      './auth/postgres-sync.ts'
    );
    const hash = await hashAccountPassword('Pass1234');
    const prov = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'REAL',
      fullName: 'Siti Warung',
      email: 'siti@warung.id',
      password: 'Pass1234',
      businessName: 'Warung Siti Berkah',
      vertical: 'WARUNG_SEMBAKO',
      planCode: 'PRO',
      billingCycle: 'MONTHLY',
      passwordHash: hash,
    });

    const settingsPayload = buildTenantSettingsPayload({
      customer: prov.customer,
      workspace: prov.workspace,
    });
    const restored = extractWorkspaceSnapshotFromSettings(settingsPayload);
    assert.ok(restored);
    assert.equal(restored.tenant.id, prov.workspace.tenant.id);
    assert.equal(restored.tenant.name, 'Warung Siti Berkah');
    assert.equal(restored.accounts.length, prov.workspace.accounts.length);
    assert.equal(extractWorkspaceSnapshotFromSettings({}), null);
  });

  it('keeps vault secrets readable after BETTER_AUTH_SECRET is hydrated and parses bulk .env text', async () => {
    const { encryptSecret, decryptSecretWithFallback } = await import('./payments/crypto.ts');
    const { parseBulkEnvText } = await import('../server/env-secrets-routes.ts');

    const prevSecret = process.env.BETTER_AUTH_SECRET;
    try {
      delete process.env.BETTER_AUTH_SECRET;
      const encryptedBeforeSecret = encryptSecret('SB-Mid-server-TestKey123');
      process.env.BETTER_AUTH_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const fallbackRes = decryptSecretWithFallback(encryptedBeforeSecret);
      assert.equal(fallbackRes.plaintext, 'SB-Mid-server-TestKey123');
      assert.equal(fallbackRes.usedFallbackKey, true);

      const encryptedAfterSecret = encryptSecret('GOCSPX-RealGoogleSecret999');
      const primaryRes = decryptSecretWithFallback(encryptedAfterSecret);
      assert.equal(primaryRes.plaintext, 'GOCSPX-RealGoogleSecret999');
      assert.equal(primaryRes.usedFallbackKey, false);
    } finally {
      if (prevSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = prevSecret;
      }
    }

    const parsed = parseBulkEnvText(`
      # Comment line
      GOOGLE_CLIENT_ID="12345.apps.googleusercontent.com"
      export GOOGLE_CLIENT_SECRET='GOCSPX-abc123'
      MIDTRANS_SERVER_KEY=SB-Mid-server-xyz999
      FONNTE_TOKEN=REPLACE_WITH_TOKEN
      EMPTY_VAL=
    `);
    assert.deepEqual(parsed, [
      { key: 'GOOGLE_CLIENT_ID', value: '12345.apps.googleusercontent.com' },
      { key: 'GOOGLE_CLIENT_SECRET', value: 'GOCSPX-abc123' },
      { key: 'MIDTRANS_SERVER_KEY', value: 'SB-Mid-server-xyz999' },
    ]);
  });

  it('prevents local vault restart deadlock across BETTER_AUTH_SECRET changes and derives identical Neon sync keys for pooler/direct URLs', async () => {
    const {
      deriveNeonSyncKey,
      encryptLocalVaultSecret,
      decryptLocalVaultSecret,
      encryptNeonVaultSecret,
      decryptNeonVaultSecret,
    } = await import('./payments/crypto.ts');

    const prevSecret = process.env.BETTER_AUTH_SECRET;
    try {
      process.env.BETTER_AUTH_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const localCipher = encryptLocalVaultSecret('postgresql://user:pass@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require');

      // Simulate container restart where OS env BETTER_AUTH_SECRET is absent or changed
      delete process.env.BETTER_AUTH_SECRET;
      assert.equal(
        decryptLocalVaultSecret(localCipher).plaintext,
        'postgresql://user:pass@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
      );

      process.env.BETTER_AUTH_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      assert.equal(
        decryptLocalVaultSecret(localCipher).plaintext,
        'postgresql://user:pass@ep-cool-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
      );
    } finally {
      if (prevSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = prevSecret;
    }

    const pooledUrl =
      'postgresql://neondb_owner:secret123@ep-icy-lake-1234-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    const directUrl =
      'postgresql://neondb_owner:secret123@ep-icy-lake-1234.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
    assert.deepEqual(deriveNeonSyncKey(pooledUrl), deriveNeonSyncKey(directUrl));

    const neonCipher = encryptNeonVaultSecret('GOCSPX-SyncedFromVercel', pooledUrl);
    assert.equal(decryptNeonVaultSecret(neonCipher, directUrl).plaintext, 'GOCSPX-SyncedFromVercel');
  });

  it('honors AI Studio .run.app requestOrigin even when BETTER_AUTH_URL is synced from Vercel and serves iframe popup done HTML', async () => {
    const aiOrigin = 'https://ais-dev-demo123.asia-southeast1.run.app';
    assert.equal(
      resolveBaseUrl(
        { BETTER_AUTH_URL: 'https://kasirku-umkm.vercel.app' },
        aiOrigin,
      ),
      aiOrigin,
    );
    assert.equal(
      resolveBaseUrl(
        { VERCEL: '1', BETTER_AUTH_URL: 'https://kasirku-umkm.vercel.app' },
        aiOrigin,
      ),
      'https://kasirku-umkm.vercel.app',
    );
    const localOrigins = buildTrustedOrigins({}, aiOrigin);
    assert.ok(localOrigins.includes(aiOrigin));
    assert.ok(localOrigins.includes('https://*.run.app'));

    const fs = await import('node:fs');
    const http = await import('node:http');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirakun-popup-test-'));
    process.env.KASIRAKUN_SERVERLESS_ONLY = '1';
    process.env.KASIRAKUN_DATA_ROOT = tempRoot;
    const { default: vercelHandler } = await import('../../api/index.ts');
    const srv = http.createServer((req, res) => {
      void vercelHandler(req, res);
    });
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    try {
      const popupResp = await fetch(`http://127.0.0.1:${port}/api/auth/oauth-popup-done?error=oauth_failed`);
      assert.equal(popupResp.status, 200);
      assert.ok((popupResp.headers.get('content-type') || '').includes('text/html'));
      const html = await popupResp.text();
      assert.ok(html.includes('KASIRAKUN_OAUTH_SUCCESS'));
      assert.ok(html.includes('window.opener.postMessage'));

      // Invalid/expired handoff code must be rejected with 401
      const badExchange = await fetch(`http://127.0.0.1:${port}/api/auth/better-auth/exchange`, {
        headers: { 'x-oauth-handoff': 'invalid-code-xyz' },
      });
      assert.equal(badExchange.status, 401);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      fs.rmSync(tempRoot, { recursive: true, force: true });
      delete process.env.KASIRAKUN_DATA_ROOT;
    }
  });
});


