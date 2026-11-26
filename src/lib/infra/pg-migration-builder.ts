/**
 * KasirAkun UMKM — PostgreSQL (Supabase / Neon) & Object Storage (Supabase Storage / Cloudflare R2)
 * Zero-Downtime Migration Readiness Engine & Idempotent SQL Dump Generator
 *
 * Strictly NUMERIC(19, 4) for all money, stock, and tax fields.
 * Never logs or echoes raw database passwords or secret keys into generated previews.
 */

import Decimal from 'decimal.js';
import type {
  InfraMigrationConfig,
  ManagedCustomerAccount,
  TenantWorkspaceData,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const DEFAULT_INFRA_MIGRATION_CONFIG: InfraMigrationConfig = {
  activeDbProvider: 'CURRENT_LOCAL_FIRESTORE',
  activeStorageProvider: 'CURRENT_LOCAL_FIRESTORE',
  targetDbProvider: 'NEON_POSTGRES',
  targetStorageProvider: 'NEON_OBJECT_STORAGE',
  pgHostPreview: 'ep-kasirakun-pooler.ap-southeast-1.aws.neon.tech:5432',
  pgDatabaseName: 'neondb',
  pgSslRequired: true,
  pgPoolerEnabled: true,
  storageBucketName: 'kasirakun-assets',
  storageEndpointPreview: 'https://br-kasirakun.storage.c-1.ap-southeast-1.aws.neon.tech',
  storagePublicBaseUrl: 'https://br-kasirakun.storage.c-1.ap-southeast-1.aws.neon.tech/kasirakun-assets',
  maintenanceModeZeroDowntime: true,
  cutoverStage: 'IDLE',
  updatedAt: new Date().toISOString(),
};

export interface PostgresUriValidationResult {
  valid: boolean;
  providerDetected: 'SUPABASE_POSTGRES' | 'NEON_POSTGRES' | 'GENERIC_POSTGRES' | 'UNKNOWN';
  hostPreview: string;
  port: number;
  databaseName: string;
  sslRequired: boolean;
  poolerDetected: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Parses and validates a PostgreSQL connection string (Supabase / Neon / Cloud SQL)
 * without ever echoing back credentials.
 */
export function validatePostgresConnectionUri(rawUri: string): PostgresUriValidationResult {
  const trimmed = rawUri.trim();
  if (!trimmed) {
    return {
      valid: false,
      providerDetected: 'UNKNOWN',
      hostPreview: '',
      port: 5432,
      databaseName: '',
      sslRequired: false,
      poolerDetected: false,
      warnings: [],
      error: 'Connection string PostgreSQL (DATABASE_URL) wajib diisi.',
    };
  }

  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      providerDetected: 'UNKNOWN',
      hostPreview: '',
      port: 5432,
      databaseName: '',
      sslRequired: false,
      poolerDetected: false,
      warnings: [],
      error: 'Format harus diawali postgresql:// atau postgres://',
    };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const port = Number(parsed.port || 5432);
    const dbName = parsed.pathname.replace(/^\//, '') || 'postgres';
    const sslMode = (parsed.searchParams.get('sslmode') || '').toLowerCase();
    const pgbouncer = parsed.searchParams.get('pgbouncer') === 'true';

    if (!host) {
      return {
        valid: false,
        providerDetected: 'UNKNOWN',
        hostPreview: '',
        port,
        databaseName: dbName,
        sslRequired: false,
        poolerDetected: false,
        warnings: [],
        error: 'Host database PostgreSQL tidak valid.',
      };
    }

    const providerDetected: PostgresUriValidationResult['providerDetected'] =
      host.includes('supabase.co') || host.includes('supabase.com')
        ? 'SUPABASE_POSTGRES'
        : host.includes('neon.tech')
        ? 'NEON_POSTGRES'
        : 'GENERIC_POSTGRES';

    const poolerDetected =
      pgbouncer || port === 6543 || host.includes('pooler') || host.includes('-pooler');
    const sslRequired =
      sslMode === 'require' ||
      sslMode === 'verify-full' ||
      sslMode === 'verify-ca' ||
      providerDetected === 'SUPABASE_POSTGRES' ||
      providerDetected === 'NEON_POSTGRES';

    const warnings: string[] = [];
    if (!sslMode) {
      warnings.push('Tambahkan ?sslmode=require agar koneksi ke Supabase/Neon terenkripsi TLS.');
    }
    if (providerDetected === 'SUPABASE_POSTGRES' && port === 6543 && !pgbouncer) {
      warnings.push('Port 6543 (Supabase Transaction Pooler) disarankan menyertakan pgbouncer=true.');
    }
    if (!parsed.username || !parsed.password) {
      warnings.push('Pastikan username dan password database terisi pada DATABASE_URL server.');
    }

    return {
      valid: true,
      providerDetected,
      hostPreview: `${host}:${port}`,
      port,
      databaseName: dbName,
      sslRequired,
      poolerDetected,
      warnings,
    };
  } catch {
    return {
      valid: false,
      providerDetected: 'UNKNOWN',
      hostPreview: '',
      port: 5432,
      databaseName: '',
      sslRequired: false,
      poolerDetected: false,
      warnings: [],
      error: 'URL PostgreSQL tidak dapat diparsing. Periksa karakter khusus password (URL-encode).',
    };
  }
}

export interface StorageConfigValidationResult {
  valid: boolean;
  endpointPreview: string;
  bucketName: string;
  warnings: string[];
  error?: string;
}

export function validateStorageTargetConfig(params: {
  provider: 'NEON_OBJECT_STORAGE' | 'SUPABASE_STORAGE' | 'CLOUDFLARE_R2';
  endpointUrl: string;
  bucketName: string;
  publicBaseUrl?: string;
}): StorageConfigValidationResult {
  const endpoint = params.endpointUrl.trim();
  const bucket = params.bucketName.trim();
  const warnings: string[] = [];

  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    return {
      valid: false,
      endpointPreview: endpoint,
      bucketName: bucket,
      warnings,
      error: 'Nama bucket harus 3–63 karakter huruf kecil, angka, atau tanda hubung (-).',
    };
  }

  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') {
      warnings.push('Endpoint storage wajib menggunakan HTTPS di produksi.');
    }
    if (
      params.provider === 'NEON_OBJECT_STORAGE' &&
      !u.hostname.includes('neon.tech') &&
      !u.hostname.includes('neon.build')
    ) {
      warnings.push('Endpoint Neon Object Storage umumnya berakhiran .aws.neon.tech');
    }
    if (params.provider === 'CLOUDFLARE_R2' && !u.hostname.includes('r2.cloudflarestorage.com')) {
      warnings.push('Endpoint Cloudflare R2 umumnya berakhiran .r2.cloudflarestorage.com');
    }
    if (params.provider === 'SUPABASE_STORAGE' && !u.hostname.includes('supabase.co')) {
      warnings.push('Endpoint Supabase Storage umumnya berakhiran .supabase.co');
    }
    return {
      valid: true,
      endpointPreview: `${u.protocol}//${u.hostname}`,
      bucketName: bucket,
      warnings,
    };
  } catch {
    return {
      valid: false,
      endpointPreview: endpoint,
      bucketName: bucket,
      warnings,
      error: 'URL endpoint Storage tidak valid (harus diawali https://).',
    };
  }
}

export interface PreflightAuditSummary {
  totalCustomers: number;
  realCustomers: number;
  demoCustomers: number;
  totalWorkspaces: number;
  totalBranches: number;
  totalProducts: number;
  totalOrders: number;
  totalJournalEntries: number;
  totalJournalLines: number;
  unbalancedJournalsCount: number;
  allDoubleEntryBalanced: boolean;
  checkedAt: string;
}

/**
 * Runs a full financial & relational pre-flight audit across all workspaces before migration.
 */
export function runMigrationPreflightAudit(
  customers: ManagedCustomerAccount[],
  workspaces: TenantWorkspaceData[]
): PreflightAuditSummary {
  let totalBranches = 0;
  let totalProducts = 0;
  let totalOrders = 0;
  let totalJournalEntries = 0;
  let totalJournalLines = 0;
  let unbalancedJournalsCount = 0;

  for (const ws of workspaces) {
    const entries = ws.journalEntries ?? [];
    totalBranches += (ws.branches ?? []).length;
    totalProducts += ws.products.length;
    totalOrders += ws.orders.length;
    totalJournalEntries += entries.length;
    for (const je of entries) {
      totalJournalLines += je.lines.length;
      const sumDr = je.lines.reduce((acc, l) => acc.plus(new Decimal(l.debit || '0')), new Decimal(0));
      const sumCr = je.lines.reduce((acc, l) => acc.plus(new Decimal(l.credit || '0')), new Decimal(0));
      if (!sumDr.eq(sumCr)) {
        unbalancedJournalsCount += 1;
      }
    }
  }

  const demoCustomers = customers.filter((c) => c.accountScope === 'DEMO' || c.isDemoAccount).length;
  const realCustomers = customers.length - demoCustomers;

  return {
    totalCustomers: customers.length,
    realCustomers,
    demoCustomers,
    totalWorkspaces: workspaces.length,
    totalBranches,
    totalProducts,
    totalOrders,
    totalJournalEntries,
    totalJournalLines,
    unbalancedJournalsCount,
    allDoubleEntryBalanced: unbalancedJournalsCount === 0,
    checkedAt: new Date().toISOString(),
  };
}

function sqlLit(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlNum(val: string | number | null | undefined): string {
  try {
    return new Decimal(val ?? '0').toFixed(4);
  } catch {
    return '0.0000';
  }
}

function sqlJson(val: unknown): string {
  return `${sqlLit(JSON.stringify(val ?? {}))}::jsonb`;
}

/**
 * Generates an idempotent PostgreSQL migration script (Supabase & Neon compatible)
 * with NUMERIC(19, 4) financial precision, JSONB custom attributes, and ON CONFLICT DO NOTHING.
 */
export function buildPostgresMigrationSql(params: {
  targetProvider: 'SUPABASE_POSTGRES' | 'NEON_POSTGRES';
  customers: ManagedCustomerAccount[];
  workspaces: TenantWorkspaceData[];
}): string {
  const { targetProvider, customers, workspaces } = params;
  const lines: string[] = [
    `-- =============================================================================`,
    `-- KasirAkun UMKM — Idempotent PostgreSQL Migration Script`,
    `-- Target Provider : ${targetProvider}`,
    `-- Generated At    : ${new Date().toISOString()}`,
    `-- Monetary Type   : NUMERIC(19, 4) (Zero Floating-Point Guarantee)`,
    `-- Safe to run directly in Supabase SQL Editor or Neon Console`,
    `-- =============================================================================`,
    `BEGIN;`,
    ``,
    `-- 1. Core Multi-Tenant & Financial Tables (Additive & Idempotent)`,
    `CREATE TABLE IF NOT EXISTS kasirakun_customers (`,
    `  id TEXT PRIMARY KEY,`,
    `  full_name TEXT NOT NULL,`,
    `  email TEXT NOT NULL UNIQUE,`,
    `  phone TEXT,`,
    `  account_scope TEXT NOT NULL DEFAULT 'REAL',`,
    `  subscription_plan TEXT NOT NULL DEFAULT 'BASIC',`,
    `  active_addons JSONB NOT NULL DEFAULT '[]'::jsonb,`,
    `  billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',`,
    `  monthly_fee NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,`,
    `  status TEXT NOT NULL DEFAULT 'ACTIVE',`,
    `  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `);`,
    ``,
    `CREATE TABLE IF NOT EXISTS kasirakun_tenants (`,
    `  id TEXT PRIMARY KEY,`,
    `  owner_account_id TEXT REFERENCES kasirakun_customers(id),`,
    `  account_scope TEXT NOT NULL DEFAULT 'REAL',`,
    `  name TEXT NOT NULL,`,
    `  slug TEXT NOT NULL,`,
    `  vertical TEXT NOT NULL,`,
    `  tax_entity TEXT NOT NULL,`,
    `  is_pkp BOOLEAN NOT NULL DEFAULT FALSE,`,
    `  npwp16 TEXT,`,
    `  nitku22 TEXT,`,
    `  subscription_plan TEXT NOT NULL DEFAULT 'BASIC',`,
    `  active_addons JSONB NOT NULL DEFAULT '[]'::jsonb,`,
    `  settings JSONB NOT NULL DEFAULT '{}'::jsonb,`,
    `  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `);`,
    ``,
    `CREATE TABLE IF NOT EXISTS kasirakun_products (`,
    `  id TEXT PRIMARY KEY,`,
    `  tenant_id TEXT NOT NULL REFERENCES kasirakun_tenants(id) ON DELETE CASCADE,`,
    `  sku TEXT NOT NULL,`,
    `  name TEXT NOT NULL,`,
    `  item_type TEXT NOT NULL,`,
    `  unit TEXT NOT NULL DEFAULT 'pcs',`,
    `  selling_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,`,
    `  cost_price_avg NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,`,
    `  stock_qty NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,`,
    `  min_stock_alert NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,`,
    `  custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `);`,
    `CREATE INDEX IF NOT EXISTS idx_products_tenant ON kasirakun_products(tenant_id);`,
    `CREATE INDEX IF NOT EXISTS idx_products_custom_attrs ON kasirakun_products USING GIN(custom_attributes);`,
    ``,
    `CREATE TABLE IF NOT EXISTS kasirakun_journal_entries (`,
    `  id TEXT PRIMARY KEY,`,
    `  tenant_id TEXT NOT NULL REFERENCES kasirakun_tenants(id) ON DELETE CASCADE,`,
    `  reference_no TEXT NOT NULL,`,
    `  transaction_date DATE NOT NULL,`,
    `  description TEXT NOT NULL,`,
    `  source_module TEXT NOT NULL,`,
    `  status TEXT NOT NULL DEFAULT 'POSTED',`,
    `  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `);`,
    `CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON kasirakun_journal_entries(tenant_id);`,
    ``,
    `CREATE TABLE IF NOT EXISTS kasirakun_journal_lines (`,
    `  id TEXT PRIMARY KEY,`,
    `  entry_id TEXT NOT NULL REFERENCES kasirakun_journal_entries(id) ON DELETE CASCADE,`,
    `  account_code TEXT NOT NULL,`,
    `  account_name TEXT NOT NULL,`,
    `  debit NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (debit >= 0),`,
    `  credit NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (credit >= 0)`,
    `);`,
    `CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON kasirakun_journal_lines(entry_id);`,
    ``,
    `CREATE TABLE IF NOT EXISTS kasirakun_workspace_snapshots (`,
    `  tenant_id TEXT PRIMARY KEY REFERENCES kasirakun_tenants(id) ON DELETE CASCADE,`,
    `  account_scope TEXT NOT NULL,`,
    `  payload JSONB NOT NULL,`,
    `  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `);`,
    ``,
    `-- 2. Data Seed: Customers (${customers.length} records)`,
  ];

  for (const c of customers) {
    lines.push(
      `INSERT INTO kasirakun_customers (id, full_name, email, phone, account_scope, subscription_plan, active_addons, billing_cycle, monthly_fee, status, created_at) VALUES (${sqlLit(
        c.id
      )}, ${sqlLit(c.fullName)}, ${sqlLit(c.email)}, ${sqlLit(c.phone)}, ${sqlLit(
        c.accountScope ?? (c.isDemoAccount ? 'DEMO' : 'REAL')
      )}, ${sqlLit(c.subscriptionPlan ?? 'BASIC')}, ${sqlJson(c.activeAddOns ?? [])}, ${sqlLit(
        c.billingCycle
      )}, ${sqlNum(c.monthlyRecurringRevenue)}, ${sqlLit(c.status)}, ${sqlLit(
        c.createdAt
      )}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  lines.push(``, `-- 3. Data Seed: Tenants, Products & Immutable Double-Entry Journals (${workspaces.length} workspaces)`);

  for (const ws of workspaces) {
    const t = ws.tenant;
    const ownerExists = t.ownerAccountId && customers.some((c) => c.id === t.ownerAccountId);
    lines.push(
      `INSERT INTO kasirakun_tenants (id, owner_account_id, account_scope, name, slug, vertical, tax_entity, is_pkp, npwp16, nitku22, subscription_plan, active_addons, settings, created_at) VALUES (${sqlLit(
        t.id
      )}, ${ownerExists ? sqlLit(t.ownerAccountId) : 'NULL'}, ${sqlLit(
        t.accountScope ?? 'REAL'
      )}, ${sqlLit(t.name)}, ${sqlLit(t.slug)}, ${sqlLit(t.vertical)}, ${sqlLit(
        t.taxEntity
      )}, ${t.isPkp ? 'TRUE' : 'FALSE'}, ${sqlLit(t.npwp16)}, ${sqlLit(t.nitku22)}, ${sqlLit(
        t.subscriptionPlan ?? 'BASIC'
      )}, ${sqlJson(t.activeAddOns ?? [])}, ${sqlJson(t.settings)}, ${sqlLit(
        t.createdAt
      )}) ON CONFLICT (id) DO NOTHING;`
    );

    for (const p of ws.products) {
      lines.push(
        `INSERT INTO kasirakun_products (id, tenant_id, sku, name, item_type, unit, selling_price, cost_price_avg, stock_qty, min_stock_alert, custom_attributes) VALUES (${sqlLit(
          `${t.id}__${p.id}`
        )}, ${sqlLit(t.id)}, ${sqlLit(p.sku)}, ${sqlLit(p.name)}, ${sqlLit(p.itemType)}, ${sqlLit(
          p.unit
        )}, ${sqlNum(p.sellingPrice)}, ${sqlNum(p.costPriceAvg)}, ${sqlNum(p.stockQty)}, ${sqlNum(
          p.minStockAlert
        )}, ${sqlJson(p.customAttributes)}) ON CONFLICT (id) DO NOTHING;`
      );
    }

    for (const je of ws.journalEntries ?? []) {
      const jeId = `${t.id}__${je.id}`;
      lines.push(
        `INSERT INTO kasirakun_journal_entries (id, tenant_id, reference_no, transaction_date, description, source_module, status, created_at) VALUES (${sqlLit(
          jeId
        )}, ${sqlLit(t.id)}, ${sqlLit(je.entryNumber)}, ${sqlLit(
          (je.entryDate || new Date().toISOString()).slice(0, 10)
        )}, ${sqlLit(je.description)}, ${sqlLit(je.sourceModule)}, ${sqlLit(je.status)}, ${sqlLit(
          je.createdAt
        )}) ON CONFLICT (id) DO NOTHING;`
      );
      je.lines.forEach((jl, idx) => {
        lines.push(
          `INSERT INTO kasirakun_journal_lines (id, entry_id, account_code, account_name, debit, credit) VALUES (${sqlLit(
            `${jeId}__L${idx + 1}`
          )}, ${sqlLit(jeId)}, ${sqlLit(jl.accountCodeSnapshot)}, ${sqlLit(jl.accountNameSnapshot)}, ${sqlNum(
            jl.debit
          )}, ${sqlNum(jl.credit)}) ON CONFLICT (id) DO NOTHING;`
        );
      });
    }
  }

  lines.push(``, `COMMIT;`);
  return lines.join('\n');
}

/**
 * Generates a clean, minimal 14-variable production .env template for Vercel:
 * Neon PostgreSQL + Better Auth (Neon) + Neon Object Storage + Midtrans + Fonnte.
 */
export function buildProductionEnvSnippet(config: InfraMigrationConfig): string {
  const hostPreview = config.pgHostPreview || 'ep-kasirakun-pooler.ap-southeast-1.aws.neon.tech';
  const directHost = hostPreview.replace('-pooler', '');
  const dbName = config.pgDatabaseName || 'neondb';
  const storageEndpoint =
    config.storageEndpointPreview || 'https://br-xxxx.storage.c-1.ap-southeast-1.aws.neon.tech';
  const bucketName = config.storageBucketName || 'kasirakun-assets';

  return [
    `# 1. Neon PostgreSQL Database (WAJIB)`,
    `DATABASE_URL="postgresql://neondb_owner:<PASSWORD>@${hostPreview}/${dbName}?sslmode=require"`,
    `DIRECT_URL="postgresql://neondb_owner:<PASSWORD>@${directHost}/${dbName}?sslmode=require"`,
    ``,
    `# 2. Better Auth di Neon & Akun Master Admin (WAJIB)`,
    `BETTER_AUTH_SECRET="<ISI_HASIL_openssl_rand_hex_32>"`,
    `BETTER_AUTH_URL="https://nama-app-anda.vercel.app"`,
    `MASTER_ADMIN_EMAIL="master@kasirakun.id"`,
    `MASTER_ADMIN_PASSWORD="<GANTI_PASSWORD_MASTER_KUAT>"`,
    ``,
    `# 3. Neon Object Storage — S3 Compatible (WAJIB)`,
    `AWS_ENDPOINT_URL_S3="${storageEndpoint}"`,
    `AWS_REGION="ap-southeast-1"`,
    `AWS_ACCESS_KEY_ID="nak_live_<ISI_ACCESS_KEY>"`,
    `AWS_SECRET_ACCESS_KEY="nsk_live_<ISI_SECRET_KEY>"`,
    `S3_BUCKET="${bucketName}"`,
    ``,
    `# 4. Pembayaran Master Admin: Midtrans (WAJIB)`,
    `MIDTRANS_SERVER_KEY="SB-Mid-server-<ISI_SERVER_KEY>"`,
    `MIDTRANS_CLIENT_KEY="SB-Mid-client-<ISI_CLIENT_KEY>"`,
    ``,
    `# 5. WhatsApp Otomatis: Fonnte (WAJIB)`,
    `FONNTE_TOKEN="<ISI_FONNTE_DEVICE_TOKEN>"`,
  ].join('\n');
}
