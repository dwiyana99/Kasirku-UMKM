import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PartitionedTenantDatabase,
  assertTenantAccess,
  resolveAccountScope,
  signSessionToken,
  verifySessionToken,
} from './tenant-db';
import { createInitialCustomers, createInitialWorkspaces } from '../../data/seedData';
import type { ManagedCustomerAccount, TenantWorkspaceData } from '../../types/domain';

test('signSessionToken and verifySessionToken reject tampered payloads', () => {
  const token = signSessionToken({
    role: 'CUSTOMER',
    accountScope: 'REAL',
    ownerAccountId: 'real-cust-101',
    email: 'owner@tokosatu.id',
    allowedTenantIds: ['real-tenant-101'],
    issuedAt: Date.now(),
  });

  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified?.ownerAccountId, 'real-cust-101');
  assert.equal(verified?.accountScope, 'REAL');

  // Tamper signature
  const tampered = `${token.slice(0, -4)}ffff`;
  assert.equal(verifySessionToken(tampered), null);
  assert.equal(verifySessionToken('invalid-token'), null);
});

test('assertTenantAccess strictly enforces per-user & DEMO vs REAL isolation', () => {
  const userASession = {
    role: 'CUSTOMER' as const,
    accountScope: 'REAL' as const,
    ownerAccountId: 'real-cust-A',
    email: 'usera@toko.id',
    allowedTenantIds: ['real-tenant-A'],
    issuedAt: Date.now(),
  };

  const demoSession = {
    role: 'CUSTOMER' as const,
    accountScope: 'DEMO' as const,
    ownerAccountId: 'cust-warung-berkah',
    email: 'demo.sembako@kasirakun.id',
    allowedTenantIds: ['tenant-warung-berkah'],
    issuedAt: Date.now(),
  };

  const masterSession = {
    role: 'MASTER_ADMIN' as const,
    accountScope: 'REAL' as const,
    ownerAccountId: 'master',
    email: 'master@kasirakun.id',
    allowedTenantIds: [],
    issuedAt: Date.now(),
  };

  // User A can access own REAL tenant, but NOT User B's tenant or any DEMO tenant
  assert.equal(assertTenantAccess(userASession, 'real-tenant-A', 'REAL'), true);
  assert.equal(assertTenantAccess(userASession, 'real-tenant-B', 'REAL'), false);
  assert.equal(assertTenantAccess(userASession, 'tenant-warung-berkah', 'DEMO'), false);
  assert.equal(assertTenantAccess(userASession, 'real-tenant-A', 'DEMO'), false);

  // Demo user can access own DEMO tenant, but NOT another DEMO user or REAL user
  assert.equal(assertTenantAccess(demoSession, 'tenant-warung-berkah', 'DEMO'), true);
  assert.equal(assertTenantAccess(demoSession, 'tenant-kedai-kopi', 'DEMO'), false);
  assert.equal(assertTenantAccess(demoSession, 'real-tenant-A', 'REAL'), false);

  // Master Admin can access all scopes
  assert.equal(assertTenantAccess(masterSession, 'real-tenant-A', 'REAL'), true);
  assert.equal(assertTenantAccess(masterSession, 'tenant-warung-berkah', 'DEMO'), true);
});

test('PartitionedTenantDatabase separates DEMO and REAL directories and isolates owners', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirakun-db-test-'));
  try {
    const db = new PartitionedTenantDatabase(tmpDir);
    const initialCustomers = createInitialCustomers();
    const initialWorkspaces = createInitialWorkspaces();

    db.seedIfEmpty({ initialCustomers, initialWorkspaces });

    // All 8 seeded UMKM demo accounts must live in `demo/` partition, ZERO in `real/`
    assert.equal(db.listCustomers('DEMO').length, 8);
    assert.equal(db.listCustomers('REAL').length, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, 'demo', 'cust-warung-berkah', 'tenant-warung-berkah.json')), true);

    // Add a REAL user and verify it lands in `.data/db/real/{realCustomerId}/{realTenantId}.json`
    const realCustomer: ManagedCustomerAccount = {
      ...initialCustomers[0],
      id: 'real-cust-budi99',
      fullName: 'Budi Pemilik Asli',
      email: 'budi.asli@tokojaya.id',
      isDemoAccount: false,
      accountScope: 'REAL',
      tenantIds: ['real-tenant-budi99'],
      primaryTenantId: 'real-tenant-budi99',
    };
    const realWorkspace: TenantWorkspaceData = {
      ...initialWorkspaces[1],
      tenant: {
        ...initialWorkspaces[1].tenant,
        id: 'real-tenant-budi99',
        name: 'Toko Jaya Asli',
        slug: 'toko-jaya-asli',
        accountScope: 'REAL',
        ownerAccountId: 'real-cust-budi99',
      },
    };

    assert.equal(resolveAccountScope(realCustomer), 'REAL');
    db.upsertCustomer(realCustomer);
    db.saveWorkspace('REAL', realCustomer.id, realWorkspace);

    assert.equal(db.listCustomers('REAL').length, 1);
    assert.equal(db.listCustomers('DEMO').length, 8);
    assert.equal(
      fs.existsSync(path.join(tmpDir, 'real', 'real-cust-budi99', 'real-tenant-budi99.json')),
      true
    );

    // Querying workspaces for demo owner never returns REAL workspaces
    const demoOwnerWs = db.listWorkspacesForOwner('DEMO', 'cust-warung-berkah');
    assert.equal(demoOwnerWs.length, 1);
    assert.equal(demoOwnerWs[0].tenant.id, 'tenant-warung-berkah');

    // Querying workspaces for REAL owner never returns DEMO workspaces
    const realOwnerWs = db.listWorkspacesForOwner('REAL', 'real-cust-budi99');
    assert.equal(realOwnerWs.length, 1);
    assert.equal(realOwnerWs[0].tenant.id, 'real-tenant-budi99');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
