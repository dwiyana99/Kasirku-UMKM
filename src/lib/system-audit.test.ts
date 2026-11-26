import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Decimal from 'decimal.js';
import {
  buildMasterProvisionedAccountAndWorkspace,
  isValidUsername,
  maskEmailForRecovery,
  maskUsernameForRecovery,
  normalizeUsername,
  resolveBetterAuthLoginTarget,
  suggestUsernameFromEmail,
} from './auth/account-management.ts';
import { PasswordRecoveryManager } from './auth/password-recovery.ts';
import { PartitionedTenantDatabase } from './db/tenant-db.ts';
import { ACTIVE_VERTICAL_DEFINITIONS } from './verticals/vertical-registry.ts';
import { buildSidebarNavGroups } from './navigation/sidebar-config.ts';
import type { AppSession } from '../types/domain.ts';

test('Username normalization, validation, and recovery masking work strictly', () => {
  assert.equal(normalizeUsername('  @Warung_Maju.99  '), 'warung_maju.99');
  assert.equal(normalizeUsername(''), undefined);

  assert.equal(isValidUsername('warung_maju'), true);
  assert.equal(isValidUsername('ab'), false); // too short
  assert.equal(isValidUsername('bad user!'), false); // invalid chars

  const suggested = suggestUsernameFromEmail('budi.santoso+pos@gmail.com');
  assert.equal(isValidUsername(suggested), true);
  assert.ok(suggested.startsWith('budi.santoso'));

  const maskedEmail = maskEmailForRecovery('dwiyana99@gmail.com');
  assert.ok(maskedEmail.endsWith('@gmail.com') && !maskedEmail.includes('dwiyana99'));

  const maskedUser = maskUsernameForRecovery('sim_warung');
  assert.ok(maskedUser.startsWith('si') && !maskedUser.includes('sim_warung'));
});

test('Simulation account provisions like Real with isolated scope, Rp 0 MRR, username, and Google OAuth support', () => {
  const { customer, workspace } = buildMasterProvisionedAccountAndWorkspace({
    accountScope: 'SIMULATION',
    fullName: 'Budi Simulasi',
    email: 'budi.sim@example.com',
    username: '@BudiSimulasi',
    password: 'SimUser2026!',
    passwordHash: 'hashed-password-placeholder',
    businessName: 'Kedai Simulasi Nusantara',
    vertical: 'RESTORAN',
    taxEntity: 'WP_OP',
    planCode: 'PRO',
    billingCycle: 'MONTHLY',
    allowGoogleLogin: true,
    allowPasswordLogin: true,
    templateWorkspace: null,
  });

  assert.equal(customer.accountScope, 'SIMULATION');
  assert.equal(customer.isDemoAccount, false);
  assert.equal(customer.monthlyRecurringRevenue, '0.0000');
  assert.equal(customer.username, 'budisimulasi');
  assert.equal(customer.allowGoogleLogin, true);
  assert.equal(workspace.tenant.accountScope, 'SIMULATION');
  assert.equal(workspace.products.length, 0); // clean slate like Real when no templateWorkspace

  // Verify Google OAuth login resolution accepts Simulation accounts cleanly
  const oauthResolution = resolveBetterAuthLoginTarget({
    email: 'budi.sim@example.com',
    authMethod: 'GOOGLE',
    masterAccounts: [],
    customer,
    staffMatch: null,
  });
  assert.equal(oauthResolution.allowed, true);
  if (oauthResolution.allowed) {
    assert.equal(oauthResolution.targetRole, 'CUSTOMER');
    assert.equal(oauthResolution.customer?.accountScope, 'SIMULATION');
  }
});

test('PartitionedTenantDatabase isolates SIMULATION accounts & resolves login via Email or Username', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirakun-sim-audit-'));
  try {
    const db = new PartitionedTenantDatabase(tmpDir);
    const { customer, workspace } = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'SIMULATION',
      fullName: 'Rina Latihan',
      email: 'rina.sim@kasirakun.id',
      username: 'rina_latihan',
      password: 'SimUser2026!',
      passwordHash: 'hash-123',
      businessName: 'Laundry Latihan Rina',
      vertical: 'LAUNDRY',
      taxEntity: 'WP_OP',
      phone: '081234567890',
      planCode: 'BASIC',
      billingCycle: 'MONTHLY',
      templateWorkspace: null,
    });

    db.upsertCustomer(customer);
    db.saveWorkspace('SIMULATION', customer.id, workspace);

    // Must live in simulation partition, NOT real or demo
    assert.equal(db.listCustomers('SIMULATION').length, 1);
    assert.equal(db.listCustomers('REAL').length, 0);
    assert.equal(db.listCustomers('DEMO').length, 0);

    // Resolve via username (with or without @) and via email
    assert.equal(db.findCustomerByUsernameOrEmail('rina_latihan')?.id, customer.id);
    assert.equal(db.findCustomerByUsernameOrEmail('@RINA_LATIHAN')?.id, customer.id);
    assert.equal(db.findCustomerByUsernameOrEmail('rina.sim@kasirakun.id')?.id, customer.id);

    // Username uniqueness check
    assert.equal(db.isUsernameTaken('rina_latihan'), true);
    assert.equal(db.isUsernameTaken('rina_latihan', customer.id), false);
    assert.equal(db.isUsernameTaken('other_user'), false);

    // Account recovery lookup by phone + business name
    const recovered = db.findCustomerByPhoneAndBusiness('081234567890', 'Laundry Latihan');
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].customer.id, customer.id);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PasswordRecoveryManager enforces 6-digit codes, cooldown, expiry, max 5 attempts, and single-use', () => {
  const mgr = new PasswordRecoveryManager({
    ttlMs: 15 * 60 * 1000,
    maxAttempts: 5,
    cooldownMs: 30 * 1000,
  });

  const t0 = 1_700_000_000_000;
  const first = mgr.issueChallenge({
    accountRole: 'CUSTOMER',
    accountId: 'cust-1',
    email: 'owner@toko.id',
    nowMs: t0,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.match(first.issued.code, /^\d{6}$/);

  // Cooldown blocks immediate re-issue
  const blocked = mgr.issueChallenge({
    accountRole: 'CUSTOMER',
    accountId: 'cust-1',
    email: 'owner@toko.id',
    nowMs: t0 + 5_000,
  });
  assert.equal(blocked.ok, false);

  // Wrong code decrements attempts
  const wrong1 = mgr.verifyAndConsume({
    accountRole: 'CUSTOMER',
    email: 'owner@toko.id',
    code: '000000',
    nowMs: t0 + 10_000,
  });
  assert.equal(wrong1.ok, false);

  // Valid code succeeds once
  const valid = mgr.verifyAndConsume({
    accountRole: 'CUSTOMER',
    email: 'owner@toko.id',
    code: first.issued.code,
    nowMs: t0 + 20_000,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.accountId, 'cust-1');

  // Replaying the same code fails (single-use)
  const replay = mgr.verifyAndConsume({
    accountRole: 'CUSTOMER',
    email: 'owner@toko.id',
    code: first.issued.code,
    nowMs: t0 + 21_000,
  });
  assert.equal(replay.ok, false);

  // Expired challenge fails
  const second = mgr.issueChallenge({
    accountRole: 'CUSTOMER',
    accountId: 'cust-1',
    email: 'owner@toko.id',
    nowMs: t0 + 60_000,
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const expired = mgr.verifyAndConsume({
    accountRole: 'CUSTOMER',
    email: 'owner@toko.id',
    code: second.issued.code,
    nowMs: t0 + 60_000 + 16 * 60 * 1000,
  });
  assert.equal(expired.ok, false);

  // Lockout after 5 wrong attempts
  const third = mgr.issueChallenge({
    accountRole: 'CUSTOMER',
    accountId: 'cust-1',
    email: 'owner@toko.id',
    nowMs: t0 + 2_000_000,
  });
  assert.equal(third.ok, true);
  if (!third.ok) return;
  for (let i = 0; i < 5; i += 1) {
    const attempt = mgr.verifyAndConsume({
      accountRole: 'CUSTOMER',
      email: 'owner@toko.id',
      code: '999999',
      nowMs: t0 + 2_001_000 + i * 100,
    });
    assert.equal(attempt.ok, false);
  }
  const locked = mgr.verifyAndConsume({
    accountRole: 'CUSTOMER',
    email: 'owner@toko.id',
    code: third.issued.code,
    nowMs: t0 + 2_002_000,
  });
  assert.equal(locked.ok, false);
});

test('Full 22 UMKM Verticals Audit: every vertical builds a valid workspace, balanced opening journal, and non-empty sidebar', () => {
  assert.equal(ACTIVE_VERTICAL_DEFINITIONS.length, 22);

  for (const def of ACTIVE_VERTICAL_DEFINITIONS) {
    const { customer, workspace } = buildMasterProvisionedAccountAndWorkspace({
      accountScope: 'REAL',
      fullName: `Owner ${def.shortLabel}`,
      email: `owner.${def.id.toLowerCase()}@audit.id`,
      password: 'AuditUser2026!',
      passwordHash: 'scrypt-hash',
      businessName: `Usaha ${def.shortLabel}`,
      vertical: def.id,
      taxEntity: 'WP_OP',
      planCode: 'PRO',
      billingCycle: 'MONTHLY',
    });

    assert.equal(workspace.tenant.vertical, def.id);
    assert.ok(workspace.accounts.length >= 5, `${def.id} must have Chart of Accounts`);

    // Verify every journal entry is strictly balanced (SUM(debit) === SUM(credit))
    for (const je of workspace.journalEntries) {
      let debit = new Decimal(0);
      let credit = new Decimal(0);
      for (const line of je.lines) {
        debit = debit.plus(new Decimal(line.debit));
        credit = credit.plus(new Decimal(line.credit));
      }
      assert.equal(
        debit.toFixed(4),
        credit.toFixed(4),
        `Unbalanced journal entry ${je.id} in vertical ${def.id}`,
      );
    }

    // Verify vertical-adaptive sidebar navigation has valid groups & no duplicate Master link
    const mockSession: AppSession = {
      role: 'CUSTOMER',
      email: customer.email,
      fullName: customer.fullName,
      customerId: customer.id,
      accountScope: 'REAL',
    };

    const groups = buildSidebarNavGroups({
      vertical: def.id,
      plan: 'PRO',
      hasAddOn: () => true,
      session: mockSession,
      notifBadgeCount: 0,
    });
    assert.ok(groups.length >= 4, `${def.id} sidebar must have at least 4 groups`);
    const allPaths = groups.flatMap((g) =>
      g.items.flatMap((item) => (item.children ? item.children.map((c) => c.path) : [item.path])),
    );
    assert.ok(allPaths.includes('/dashboard'), `${def.id} must include /dashboard`);
    assert.ok(allPaths.includes('/accounting'), `${def.id} must include /accounting`);
    assert.ok(
      !allPaths.includes('/master-admin'),
      `${def.id} must not duplicate /master-admin in tenant sidebar`,
    );
  }
});
