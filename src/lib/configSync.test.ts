import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnvironmentDiagnosticReport,
  computeSecretFingerprint,
  detectRuntimeEnvironment,
  getStandardEnvValue,
  isPlaceholderEnvValue,
  maskEnvPreview,
  stripEnvQuotes,
  type DiagnosticKeyDescriptor,
} from './configSync.ts';

test('stripEnvQuotes & isPlaceholderEnvValue sanitize env inputs safely', () => {
  assert.equal(stripEnvQuotes('  "my-secret-value"  '), 'my-secret-value');
  assert.equal(stripEnvQuotes("  'postgresql://user:pass@host/db' "), 'postgresql://user:pass@host/db');
  assert.equal(stripEnvQuotes(undefined), '');

  assert.equal(isPlaceholderEnvValue(''), true);
  assert.equal(isPlaceholderEnvValue('YOUR_GOOGLE_CLIENT_ID'), true);
  assert.equal(isPlaceholderEnvValue('REPLACE_WITH_SECRET'), true);
  assert.equal(isPlaceholderEnvValue('https://your-project.vercel.app'), true);
  assert.equal(isPlaceholderEnvValue('real-production-secret-9999'), false);
});

test('getStandardEnvValue ignores placeholders and returns clean fallback key value', () => {
  const env: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: '"YOUR_GOOGLE_CLIENT_ID"',
    ALT_GOOGLE_ID: '"123456.apps.googleusercontent.com"',
    GOOGLE_CLIENT_SECRET: '"GOCSPX-real-secret-value-1234"',
    DATABASE_URL: '  "postgresql://neondb_owner:secret@ep-demo.neon.tech/neondb" ',
  };

  assert.equal(getStandardEnvValue('GOOGLE_CLIENT_ID', { env }), '');
  assert.equal(
    getStandardEnvValue('GOOGLE_CLIENT_ID', { env, fallbackKeys: ['ALT_GOOGLE_ID'] }),
    '123456.apps.googleusercontent.com',
  );
  assert.equal(getStandardEnvValue('GOOGLE_CLIENT_SECRET', { env }), 'GOCSPX-real-secret-value-1234');
  assert.equal(
    getStandardEnvValue('DATABASE_URL', { env }),
    'postgresql://neondb_owner:secret@ep-demo.neon.tech/neondb',
  );
});

test('computeSecretFingerprint produces deterministic non-reversible fp:<8hex> and never exposes raw secret', () => {
  const secret = 'GOCSPX-super-confidential-key-2026';
  const fp1 = computeSecretFingerprint(secret);
  const fp2 = computeSecretFingerprint(`  "${secret}"  `);
  const fpOther = computeSecretFingerprint('GOCSPX-different-key-2026');

  assert.ok(fp1 && /^fp:[a-f0-9]{8}$/.test(fp1));
  assert.equal(fp1, fp2);
  assert.notEqual(fp1, fpOther);
  assert.ok(!fp1.includes('GOCSPX'));
  assert.equal(computeSecretFingerprint('YOUR_SECRET_HERE'), null);

  const masked = maskEnvPreview(secret, true);
  assert.ok(masked && masked.length > 0 && masked.includes('*'));
  assert.ok(!masked.includes('confidential'));
});

test('detectRuntimeEnvironment distinguishes Vercel Prod, Vercel Preview, AI Studio, and Local Dev', () => {
  const vercelProd = detectRuntimeEnvironment({
    VERCEL: '1',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'kasirakun.vercel.app',
  });
  assert.equal(vercelProd.type, 'VERCEL_PRODUCTION');
  assert.equal(vercelProd.isVercel, true);
  assert.equal(vercelProd.host, 'kasirakun.vercel.app');

  const vercelPreview = detectRuntimeEnvironment({
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'kasirakun-git-dev.vercel.app',
  });
  assert.equal(vercelPreview.type, 'VERCEL_PREVIEW');
  assert.equal(vercelPreview.isVercel, true);

  const aiStudio = detectRuntimeEnvironment(
    { APP_URL: 'https://ais-dev-demo-1234.asia-southeast1.run.app' },
    'ais-dev-demo-1234.asia-southeast1.run.app',
  );
  assert.equal(aiStudio.type, 'AI_STUDIO_PREVIEW');
  assert.equal(aiStudio.isAiStudio, true);

  const localDev = detectRuntimeEnvironment({}, 'localhost:3000');
  assert.equal(localDev.type, 'LOCAL_DEV');
  assert.equal(localDev.isVercel, false);
  assert.equal(localDev.isAiStudio, false);
});

test('buildEnvironmentDiagnosticReport classifies MATCHED, MISMATCH, MISSING_NEON, MISSING_LOCAL, HOST_SPECIFIC_OK, and NOT_CONFIGURED', () => {
  const descriptors: DiagnosticKeyDescriptor[] = [
    { key: 'DATABASE_URL', label: 'Database URL', serviceName: 'Neon', category: 'DB', isSecret: true },
    { key: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', serviceName: 'Google', category: 'AUTH', isSecret: false },
    { key: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', serviceName: 'Google', category: 'AUTH', isSecret: true },
    { key: 'FONNTE_TOKEN', label: 'Fonnte WA Token', serviceName: 'Fonnte', category: 'WA', isSecret: true },
    { key: 'BETTER_AUTH_URL', label: 'Better Auth URL', serviceName: 'Auth', category: 'AUTH', isSecret: false },
    { key: 'MIDTRANS_SERVER_KEY', label: 'Midtrans Key', serviceName: 'Midtrans', category: 'PAY', isSecret: true },
  ];

  const report = buildEnvironmentDiagnosticReport({
    descriptors,
    runtimeEnv: {
      DATABASE_URL: 'postgresql://user:pass@ep-1.neon.tech/db',
      GOOGLE_CLIENT_ID: '123456.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret-runtime-v1',
      FONNTE_TOKEN: 'fonnte-only-in-runtime',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
    neonVaultEntries: {
      DATABASE_URL: { value: 'postgresql://user:pass@ep-1.neon.tech/db' },
      GOOGLE_CLIENT_ID: { value: '123456.apps.googleusercontent.com' },
      GOOGLE_CLIENT_SECRET: { value: 'secret-neon-v2-different' },
      BETTER_AUTH_URL: { value: 'https://kasirakun.vercel.app' },
    },
    localVaultEntries: {
      DATABASE_URL: { value: 'postgresql://user:pass@ep-1.neon.tech/db' },
      // GOOGLE_CLIENT_ID missing locally -> MISSING_LOCAL on non-Vercel host
      GOOGLE_CLIENT_SECRET: { value: 'secret-runtime-v1' },
    },
    neonConnected: true,
    requestHost: 'localhost:3000',
  });

  const byKey = new Map(report.rows.map((r) => [r.key, r]));
  assert.equal(byKey.get('DATABASE_URL')?.status, 'MATCHED');
  assert.equal(byKey.get('GOOGLE_CLIENT_ID')?.status, 'MISSING_LOCAL');
  assert.equal(byKey.get('GOOGLE_CLIENT_SECRET')?.status, 'MISMATCH');
  assert.equal(byKey.get('FONNTE_TOKEN')?.status, 'MISSING_NEON');
  assert.equal(byKey.get('BETTER_AUTH_URL')?.status, 'HOST_SPECIFIC_OK');
  assert.equal(byKey.get('MIDTRANS_SERVER_KEY')?.status, 'NOT_CONFIGURED');

  assert.equal(report.summary.matchedCount, 1);
  assert.equal(report.summary.hostSpecificOkCount, 1);
  assert.equal(report.summary.mismatchCount, 1);
  assert.equal(report.summary.missingNeonCount, 1);
  assert.equal(report.summary.missingLocalCount, 1);
  assert.equal(report.summary.notConfiguredCount, 1);
  assert.equal(report.summary.issueCount, 3);
});
