/**
 * KasirAkun UMKM — Partitioned Multi-Tenant Database Store & Privacy Isolation Engine
 *
 * Guarantees strict data separation between:
 *  1. DEMO accounts (namespace: `demo`, IDs prefixed `demo-` / `accountScope: 'DEMO'`)
 *  2. REAL production user accounts (namespace: `real`, IDs prefixed `real-` / `accountScope: 'REAL'`)
 *  3. Individual users within each namespace (User A can NEVER read/write User B's tenant records)
 *
 * Uses atomic JSON-file persistence on disk under `.data/db/{demo|real}/` and HMAC-SHA256
 * signed session tokens verified on every API call.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AccountScope,
  ManagedCustomerAccount,
  TenantWorkspaceData,
} from '../../types/domain.ts';
import type { MasterAdminAccountRecord } from '../auth/account-management.ts';

export interface SignedSessionPayload {
  role: 'MASTER_ADMIN' | 'CUSTOMER' | 'STAFF';
  accountScope: AccountScope;
  ownerAccountId: string;
  email: string;
  allowedTenantIds: string[];
  staffId?: string;
  staffTenantId?: string;
  issuedAt: number;
}

const SESSION_SECRET =
  process.env.KASIRAKUN_DB_SESSION_SECRET || 'kasirakun-privacy-isolation-secret-2026';

export function resolveAccountScope(
  customer?: Pick<ManagedCustomerAccount, 'isDemoAccount' | 'accountScope' | 'id'> | null,
  tenantId?: string
): AccountScope {
  if (customer?.accountScope === 'DEMO' || customer?.accountScope === 'REAL') {
    return customer.accountScope;
  }
  if (customer?.isDemoAccount) return 'DEMO';
  if (customer?.id?.startsWith('cust-demo-') || customer?.id?.startsWith('demo-')) return 'DEMO';
  if (tenantId?.startsWith('demo-')) return 'DEMO';
  return 'REAL';
}

export function normalizeIdSegment(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleaned) {
    throw new Error('Identifier tidak valid untuk partisi database.');
  }
  return cleaned;
}

export function signSessionToken(payload: SignedSessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SignedSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('hex');
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (!parsed || !parsed.role || !parsed.ownerAccountId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Enforces strict tenant authorization:
 * - MASTER_ADMIN can access any tenant for SaaS management & support impersonation.
 * - CUSTOMER can access ONLY tenants inside their `allowedTenantIds` AND matching their `accountScope`.
 * - STAFF can access ONLY their assigned `staffTenantId`.
 */
export function assertTenantAccess(
  session: SignedSessionPayload,
  targetTenantId: string,
  targetScope?: AccountScope
): boolean {
  if (session.role === 'MASTER_ADMIN') return true;
  if (session.role === 'STAFF') {
    return session.staffTenantId === targetTenantId && (!targetScope || targetScope === session.accountScope);
  }
  if (session.role === 'CUSTOMER') {
    const ownsTenant = session.allowedTenantIds.includes(targetTenantId);
    const scopeMatches = !targetScope || targetScope === session.accountScope;
    return ownsTenant && scopeMatches;
  }
  return false;
}

interface PartitionedDbSnapshot {
  version: number;
  customers: ManagedCustomerAccount[];
}

export class PartitionedTenantDatabase {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || path.resolve(process.cwd(), '.data', 'db');
    this.ensureDirs();
  }

  private ensureDirs(): void {
    fs.mkdirSync(path.join(this.rootDir, 'demo'), { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, 'real'), { recursive: true });
  }

  private getCustomersIndexPath(scope: AccountScope): string {
    return path.join(this.rootDir, scope.toLowerCase(), '_customers.json');
  }

  private getTenantFilePath(scope: AccountScope, ownerAccountId: string, tenantId: string): string {
    const safeOwner = normalizeIdSegment(ownerAccountId);
    const safeTenant = normalizeIdSegment(tenantId);
    const dir = path.join(this.rootDir, scope.toLowerCase(), safeOwner);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${safeTenant}.json`);
  }

  private writeJsonAtomic(filePath: string, data: unknown): void {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  }

  private readJsonSafe<T>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Seeds initial demo & baseline customers/workspaces once if the DB directory is empty.
   * Strictly separates DEMO records into `.data/db/demo/` and REAL records into `.data/db/real/`.
   */
  public seedIfEmpty(params: {
    initialCustomers: ManagedCustomerAccount[];
    initialWorkspaces: TenantWorkspaceData[];
  }): void {
    const demoIndex = this.readJsonSafe<PartitionedDbSnapshot>(this.getCustomersIndexPath('DEMO'));
    const realIndex = this.readJsonSafe<PartitionedDbSnapshot>(this.getCustomersIndexPath('REAL'));
    if (demoIndex || realIndex) {
      // Additive sync: ensure newly introduced DEMO accounts (e.g., Kost & Agro) and upgraded multi-branch demo data exist
      const existingDemo = demoIndex?.customers ?? [];
      const existingDemoIds = new Set(existingDemo.map((c) => c.id));
      let demoChanged = false;
      const mergedDemo = [...existingDemo];

      for (const rawCust of params.initialCustomers) {
        if (resolveAccountScope(rawCust) !== 'DEMO') continue;
        if (!existingDemoIds.has(rawCust.id)) {
          mergedDemo.push({ ...rawCust, accountScope: 'DEMO', isDemoAccount: true });
          demoChanged = true;
        }
      }
      if (demoChanged) {
        this.writeJsonAtomic(this.getCustomersIndexPath('DEMO'), {
          version: 1,
          customers: mergedDemo,
        });
      }

      for (const ws of params.initialWorkspaces) {
        const owner = mergedDemo.find((c) => c.tenantIds.includes(ws.tenant.id));
        if (!owner) continue;
        const existingWs = this.getWorkspace('DEMO', owner.id, ws.tenant.id);
        if (!existingWs || !existingWs.branches || existingWs.branches.length === 0) {
          this.saveWorkspace('DEMO', owner.id, {
            ...ws,
            tenant: { ...ws.tenant, accountScope: 'DEMO', ownerAccountId: owner.id },
          });
        }
      }
      return;
    }

    const demoCustomers: ManagedCustomerAccount[] = [];
    const realCustomers: ManagedCustomerAccount[] = [];

    for (const rawCust of params.initialCustomers) {
      const scope = resolveAccountScope(rawCust);
      const taggedCust: ManagedCustomerAccount = {
        ...rawCust,
        accountScope: scope,
        isDemoAccount: scope === 'DEMO',
      };
      if (scope === 'DEMO') {
        demoCustomers.push(taggedCust);
      } else {
        realCustomers.push(taggedCust);
      }
    }

    this.writeJsonAtomic(this.getCustomersIndexPath('DEMO'), {
      version: 1,
      customers: demoCustomers,
    });
    this.writeJsonAtomic(this.getCustomersIndexPath('REAL'), {
      version: 1,
      customers: realCustomers,
    });

    const allTaggedCustomers = [...demoCustomers, ...realCustomers];
    for (const ws of params.initialWorkspaces) {
      const owner = allTaggedCustomers.find((c) => c.tenantIds.includes(ws.tenant.id));
      const scope: AccountScope = owner ? resolveAccountScope(owner) : 'DEMO';
      const ownerId = owner ? owner.id : 'demo-shared';
      const taggedWs: TenantWorkspaceData = {
        ...ws,
        tenant: {
          ...ws.tenant,
          accountScope: scope,
          ownerAccountId: ownerId,
        },
      };
      this.saveWorkspace(scope, ownerId, taggedWs);
    }
  }

  public listCustomers(scope?: AccountScope): ManagedCustomerAccount[] {
    if (scope) {
      return this.readJsonSafe<PartitionedDbSnapshot>(this.getCustomersIndexPath(scope))?.customers ?? [];
    }
    return [...this.listCustomers('DEMO'), ...this.listCustomers('REAL')];
  }

  public upsertCustomer(customer: ManagedCustomerAccount): ManagedCustomerAccount {
    const scope = resolveAccountScope(customer);
    const tagged: ManagedCustomerAccount = {
      ...customer,
      accountScope: scope,
      isDemoAccount: scope === 'DEMO',
    };
    const existing = this.listCustomers(scope);
    const idx = existing.findIndex((c) => c.id === tagged.id);
    const next = idx >= 0 ? existing.map((c) => (c.id === tagged.id ? tagged : c)) : [tagged, ...existing];
    this.writeJsonAtomic(this.getCustomersIndexPath(scope), {
      version: 1,
      customers: next,
    });
    return tagged;
  }

  public findCustomerByEmail(email: string): ManagedCustomerAccount | null {
    const norm = email.trim().toLowerCase();
    return this.listCustomers().find((c) => c.email.trim().toLowerCase() === norm) ?? null;
  }

  public findCustomerById(customerId: string): ManagedCustomerAccount | null {
    return this.listCustomers().find((c) => c.id === customerId) ?? null;
  }

  public saveWorkspace(
    scope: AccountScope,
    ownerAccountId: string,
    workspace: TenantWorkspaceData
  ): TenantWorkspaceData {
    const tagged: TenantWorkspaceData = {
      ...workspace,
      tenant: {
        ...workspace.tenant,
        accountScope: scope,
        ownerAccountId,
      },
    };
    const filePath = this.getTenantFilePath(scope, ownerAccountId, tagged.tenant.id);
    this.writeJsonAtomic(filePath, tagged);
    return tagged;
  }

  public getWorkspace(
    scope: AccountScope,
    ownerAccountId: string,
    tenantId: string
  ): TenantWorkspaceData | null {
    const filePath = this.getTenantFilePath(scope, ownerAccountId, tenantId);
    return this.readJsonSafe<TenantWorkspaceData>(filePath);
  }

  public listWorkspacesForOwner(scope: AccountScope, ownerAccountId: string): TenantWorkspaceData[] {
    const safeOwner = normalizeIdSegment(ownerAccountId);
    const dir = path.join(this.rootDir, scope.toLowerCase(), safeOwner);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const result: TenantWorkspaceData[] = [];
    for (const file of files) {
      const parsed = this.readJsonSafe<TenantWorkspaceData>(path.join(dir, file));
      if (parsed && parsed.tenant?.id) {
        result.push(parsed);
      }
    }
    return result;
  }

  public listAllWorkspaces(scope?: AccountScope): TenantWorkspaceData[] {
    const scopes: AccountScope[] = scope ? [scope] : ['DEMO', 'REAL'];
    const result: TenantWorkspaceData[] = [];
    for (const sc of scopes) {
      const scopeDir = path.join(this.rootDir, sc.toLowerCase());
      if (!fs.existsSync(scopeDir)) continue;
      for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        result.push(...this.listWorkspacesForOwner(sc, entry.name));
      }
    }
    return result;
  }

  public findWorkspaceByTenantId(tenantId: string): {
    scope: AccountScope;
    ownerAccountId: string;
    workspace: TenantWorkspaceData;
  } | null {
    for (const sc of ['DEMO', 'REAL'] as const) {
      const scopeDir = path.join(this.rootDir, sc.toLowerCase());
      if (!fs.existsSync(scopeDir)) continue;
      for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = this.getWorkspace(sc, entry.name, tenantId);
        if (candidate) {
          return {
            scope: sc,
            ownerAccountId: entry.name,
            workspace: candidate,
          };
        }
      }
    }
    return null;
  }

  public findStaffLogin(email: string, password: string): {
    scope: AccountScope;
    ownerAccountId: string;
    workspace: TenantWorkspaceData;
    staff: NonNullable<TenantWorkspaceData['staffAccounts']>[number];
    ownerAccount: ManagedCustomerAccount | null;
  } | null {
    const norm = email.trim().toLowerCase();
    for (const sc of ['DEMO', 'REAL'] as const) {
      const scopeDir = path.join(this.rootDir, sc.toLowerCase());
      if (!fs.existsSync(scopeDir)) continue;
      for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const ownerWorkspaces = this.listWorkspacesForOwner(sc, entry.name);
        for (const ws of ownerWorkspaces) {
          const staff = (ws.staffAccounts ?? []).find(
            (s) => s.email.trim().toLowerCase() === norm && s.password === password
          );
          if (staff) {
            const ownerAccount = this.findCustomerById(entry.name);
            return {
              scope: sc,
              ownerAccountId: entry.name,
              workspace: ws,
              staff,
              ownerAccount,
            };
          }
        }
      }
    }
    return null;
  }

  public findWorkspaceBySlug(slug: string): TenantWorkspaceData | null {
    return this.listAllWorkspaces().find((w) => w.tenant.slug === slug) ?? null;
  }

  public deleteCustomer(customerId: string): boolean {
    let deleted = false;
    for (const sc of ['DEMO', 'REAL'] as const) {
      const existing = this.listCustomers(sc);
      const target = existing.find((c) => c.id === customerId);
      if (!target) continue;
      const next = existing.filter((c) => c.id !== customerId);
      this.writeJsonAtomic(this.getCustomersIndexPath(sc), {
        version: 1,
        customers: next,
      });
      const safeOwner = normalizeIdSegment(customerId);
      const ownerDir = path.join(this.rootDir, sc.toLowerCase(), safeOwner);
      if (fs.existsSync(ownerDir)) {
        fs.rmSync(ownerDir, { recursive: true, force: true });
      }
      deleted = true;
    }
    return deleted;
  }

  public deleteWorkspace(scope: AccountScope, ownerAccountId: string, tenantId: string): boolean {
    const filePath = this.getTenantFilePath(scope, ownerAccountId, tenantId);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  public findStaffByEmail(email: string): {
    scope: AccountScope;
    ownerAccountId: string;
    workspace: TenantWorkspaceData;
    staff: NonNullable<TenantWorkspaceData['staffAccounts']>[number];
    ownerAccount: ManagedCustomerAccount | null;
  } | null {
    const norm = email.trim().toLowerCase();
    for (const sc of ['DEMO', 'REAL'] as const) {
      const scopeDir = path.join(this.rootDir, sc.toLowerCase());
      if (!fs.existsSync(scopeDir)) continue;
      for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const ownerWorkspaces = this.listWorkspacesForOwner(sc, entry.name);
        for (const ws of ownerWorkspaces) {
          const staff = (ws.staffAccounts ?? []).find(
            (s) => s.email.trim().toLowerCase() === norm
          );
          if (staff) {
            const ownerAccount = this.findCustomerById(entry.name);
            return {
              scope: sc,
              ownerAccountId: entry.name,
              workspace: ws,
              staff,
              ownerAccount,
            };
          }
        }
      }
    }
    return null;
  }

  private getMasterAccountsPath(): string {
    return path.join(this.rootDir, '_master_accounts.json');
  }

  public listMasterAccounts(): MasterAdminAccountRecord[] {
    const data = this.readJsonSafe<{ version: number; accounts: MasterAdminAccountRecord[] }>(
      this.getMasterAccountsPath()
    );
    return data?.accounts ?? [];
  }

  public saveMasterAccounts(accounts: MasterAdminAccountRecord[]): void {
    this.writeJsonAtomic(this.getMasterAccountsPath(), {
      version: 1,
      accounts,
    });
  }

  public findMasterAccountByEmail(email: string): MasterAdminAccountRecord | null {
    const norm = email.trim().toLowerCase();
    return this.listMasterAccounts().find((m) => m.email.trim().toLowerCase() === norm) ?? null;
  }

  public findMasterAccountById(id: string): MasterAdminAccountRecord | null {
    return this.listMasterAccounts().find((m) => m.id === id) ?? null;
  }

  public upsertMasterAccount(account: MasterAdminAccountRecord): MasterAdminAccountRecord {
    const existing = this.listMasterAccounts();
    const idx = existing.findIndex((m) => m.id === account.id);
    const next = idx >= 0 ? existing.map((m) => (m.id === account.id ? account : m)) : [account, ...existing];
    this.saveMasterAccounts(next);
    return account;
  }

  public deleteMasterAccount(id: string): boolean {
    const existing = this.listMasterAccounts();
    const next = existing.filter((m) => m.id !== id);
    if (next.length === existing.length) return false;
    this.saveMasterAccounts(next);
    return true;
  }
}
