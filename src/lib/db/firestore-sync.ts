/**
 * KasirAkun UMKM — Pure Firestore Serialization, Merge & Workspace Provisioning Helpers
 * Ensures zero undefined values, strict adherence to firebase-blueprint.json & firestore.rules,
 * and deterministic realtime snapshot merging for POS transactions and inventory items.
 */

import { buildHierarchicalTaxonomyFromPresets } from '../catalog/taxonomy-presets';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../../prisma/seed';
import { getDefaultReceiptDesign } from '../pos/receipt-design';
import { getVerticalMeta } from '../verticals/vertical-registry';
import type {
  Account,
  BusinessVertical,
  Category,
  ManagedCustomerAccount,
  Order,
  Product,
  TaxEntityType,
  TenantRegionalTaxSettings,
  TenantWorkspaceData,
} from '../../types/domain';

export function sanitizeFirestorePayload<T>(value: T): T {
  if (value === null || value === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeFirestorePayload(v);
    }
    return out as T;
  }
  return value;
}

export function normalizeFirestoreDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return cleaned.slice(0, 120) || `doc-${Date.now()}`;
}

export interface FirestoreInventoryRecord {
  ownerId: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  itemType: Product['itemType'];
  sellingPrice: string;
  costPriceAvg: string;
  stockQty: string;
  unit: string;
  payload: Product;
}

export function toFirestoreInventoryDoc(
  ownerId: string,
  tenantId: string,
  product: Product
): FirestoreInventoryRecord {
  return {
    ownerId: normalizeFirestoreDocId(ownerId),
    tenantId: normalizeFirestoreDocId(tenantId),
    productId: normalizeFirestoreDocId(product.id),
    name: (product.name || 'Produk UMKM').slice(0, 200),
    sku: (product.sku || `SKU-${product.id.slice(-4)}`).slice(0, 80),
    itemType: product.itemType,
    sellingPrice: String(product.sellingPrice || '0.0000').slice(0, 40),
    costPriceAvg: String(product.costPriceAvg || '0.0000').slice(0, 40),
    stockQty: String(product.stockQty || '0.0000').slice(0, 40),
    unit: (product.unit || 'pcs').slice(0, 40),
    payload: sanitizeFirestorePayload(product),
  };
}

export interface FirestorePosOrderRecord {
  ownerId: string;
  tenantId: string;
  orderId: string;
  orderNumber: string;
  orderSource: Order['orderSource'];
  paymentMethod: string;
  paymentStatus: Order['paymentStatus'];
  kitchenStatus: Order['kitchenStatus'];
  grandTotal: string;
  payload: Order;
}

export function toFirestoreOrderDoc(
  ownerId: string,
  tenantId: string,
  order: Order
): FirestorePosOrderRecord {
  return {
    ownerId: normalizeFirestoreDocId(ownerId),
    tenantId: normalizeFirestoreDocId(tenantId),
    orderId: normalizeFirestoreDocId(order.id),
    orderNumber: (order.orderNumber || order.id).slice(0, 80),
    orderSource: order.orderSource,
    paymentMethod: order.payment?.paymentMethod ?? 'CASH',
    paymentStatus: order.paymentStatus,
    kitchenStatus: order.kitchenStatus,
    grandTotal: String(order.grandTotal || '0.0000').slice(0, 40),
    payload: sanitizeFirestorePayload(order),
  };
}

/**
 * Merges realtime Firestore inventory items snapshot with current local list,
 * preferring remote documents by id while preserving order.
 */
export function mergeRealtimeProducts(localProducts: Product[], remoteProducts: Product[]): Product[] {
  if (remoteProducts.length === 0) return localProducts;
  const byId = new Map<string, Product>();
  for (const p of localProducts) {
    byId.set(p.id, p);
  }
  for (const rp of remoteProducts) {
    if (rp && rp.id) {
      byId.set(rp.id, rp);
    }
  }
  return Array.from(byId.values());
}

/**
 * Merges realtime Firestore POS orders snapshot sorted newest first.
 */
export function mergeRealtimeOrders(localOrders: Order[], remoteOrders: Order[]): Order[] {
  if (remoteOrders.length === 0) return localOrders;
  const byId = new Map<string, Order>();
  for (const o of localOrders) {
    byId.set(o.id, o);
  }
  for (const ro of remoteOrders) {
    if (ro && ro.id) {
      byId.set(ro.id, ro);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Provisions a clean, real starting workspace (with zero static demo/dummy records)
 * for a newly authenticated Firebase user.
 */
export function provisionDefaultFirebaseWorkspace(params: {
  uid: string;
  email: string;
  fullName: string;
  businessName?: string;
  vertical?: BusinessVertical;
  taxEntity?: TaxEntityType;
  businessWhatsappNumber?: string;
  regionalTax?: TenantRegionalTaxSettings;
}): { customer: ManagedCustomerAccount; workspace: TenantWorkspaceData } {
  const safeUid = normalizeFirestoreDocId(params.uid);
  const vertical: BusinessVertical = params.vertical ?? 'WARUNG_SEMBAKO';
  const taxEntity: TaxEntityType = params.taxEntity ?? 'WP_OP';
  const now = new Date().toISOString();
  const cleanBizName =
    params.businessName?.trim() || `${params.fullName.trim() || 'Usaha'} UMKM`;
  const slugBase = cleanBizName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const tenantId = `real-tnt-${safeUid.slice(0, 12)}-${Date.now().toString(36)}`;
  const slug = `${slugBase || 'umkm'}-${Date.now().toString(36).slice(-4)}`;

  const verticalMeta = getVerticalMeta(vertical);
  const defaultCats: Category[] =
    vertical === 'WARUNG_SEMBAKO'
      ? [
          { id: `cat-${tenantId}-1`, tenantId, name: 'Bahan Pokok', sortOrder: 1 },
          { id: `cat-${tenantId}-2`, tenantId, name: 'Minuman & Snack', sortOrder: 2 },
          { id: `cat-${tenantId}-3`, tenantId, name: 'Kertas & ATK', sortOrder: 3 },
        ]
      : vertical === 'KOST_KONTRAKAN'
      ? [
          { id: `cat-${tenantId}-1`, tenantId, name: 'Sewa Kamar', sortOrder: 1 },
          { id: `cat-${tenantId}-2`, tenantId, name: 'Utilitas & Listrik', sortOrder: 2 },
        ]
      : vertical === 'PETERNAKAN_PERTANIAN'
      ? [
          { id: `cat-${tenantId}-1`, tenantId, name: 'Hasil Panen', sortOrder: 1 },
          { id: `cat-${tenantId}-2`, tenantId, name: 'Pakan Ternak', sortOrder: 2 },
          { id: `cat-${tenantId}-3`, tenantId, name: 'Pupuk & Nutrisi', sortOrder: 3 },
        ]
      : vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN'
      ? [
          { id: `cat-${tenantId}-1`, tenantId, name: 'Menu Utama', sortOrder: 1 },
          { id: `cat-${tenantId}-2`, tenantId, name: 'Minuman', sortOrder: 2 },
        ]
      : [
          { id: `cat-${tenantId}-1`, tenantId, name: verticalMeta.defaultCategoryName, sortOrder: 1 },
        ];

  const defaultBranch = {
    id: `br-${tenantId}-hq`,
    tenantId,
    code: 'CAB-01',
    name: `${cleanBizName} — Pusat`,
    branchType: 'OUTLET' as const,
    address: 'Alamat Usaha (Lengkapi di Pengaturan Usaha)',
    phone: '',
    nitku22: '',
    isDefault: true,
    isActive: true,
    createdAt: now,
  };

  const workspace: TenantWorkspaceData = {
    tenant: {
      id: tenantId,
      name: cleanBizName,
      slug,
      vertical,
      taxEntity,
      isPkp: false,
      npwp16: '',
      nitku22: '',
      address: 'Alamat Usaha (Lengkapi di Pengaturan Usaha)',
      receiptFooter: 'Terima kasih telah berbelanja!',
      cumulativeTurnoverPriorMonths: '0.0000',
      serviceChargeRate: vertical === 'RESTORAN' ? '0.0500' : '0.0000',
      activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
      subscriptionPlan: 'BASIC',
      activeAddOns: [],
      accountScope: 'REAL',
      ownerAccountId: safeUid,
      settings: {
        thermalPaperWidth: '58mm',
        autoPrintQrOrders: vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN',
        qrisMdrRate: '0.007',
        receiptDesign: getDefaultReceiptDesign({ slug, vertical }),
        businessWhatsappNumber: params.businessWhatsappNumber?.trim() || '',
        regionalTax: params.regionalTax,
      },
      createdAt: now,
    },
    accounts: DEFAULT_CHART_OF_ACCOUNTS.map(
      (a, idx): Account => ({
        id: `acc-${tenantId}-${idx + 1}`,
        tenantId,
        code: a.code,
        name: a.name,
        category: a.category,
        normalBalance: a.normalBalance,
        isSystemLocked: a.isSystemLocked,
      })
    ),
    categories: defaultCats,
    taxonomy: buildHierarchicalTaxonomyFromPresets(vertical, defaultCats),
    products: [],
    recipes: [],
    recipeTemplates: [],
    inventoryMovements: [],
    purchaseOrders: [],
    tables:
      vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN'
        ? [
            {
              id: `tbl-${tenantId}-1`,
              tenantId,
              tableNumber: 'Meja 01',
              qrToken: `qr-${slug}-01`,
              isActive: true,
            },
          ]
        : [],
    orders: [],
    expenses: [],
    fixedAssets: [],
    customFields: [],
    journalEntries: [],
    staffAccounts: [],
    branches: [defaultBranch],
    branchStocks: [],
    stockTransfers: [],
    suppliers: [],
    stockOpnameSessions: [],
    boardingRooms: [],
    boardingTenants: [],
    boardingInvoices: [],
    agroBatches: [],
    agroUsages: [],
    agroHarvests: [],
    cashierShifts: [],
    auditLogs: [],
    promotions: [],
    priceTiers: [],
    crmCustomers: [],
    activityLogs: [
      {
        id: `act-init-${Date.now()}`,
        tenantId,
        actorName: params.fullName || 'Pemilik Usaha',
        actorEmail: params.email,
        actorRole: 'OWNER',
        actionType: 'SETTINGS_UPDATE',
        summary: `Workspace Cloud Realtime "${cleanBizName}" dibuat & terhubung ke Firestore.`,
        createdAt: now,
      },
    ],
  };

  const validUntil = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const customer: ManagedCustomerAccount = {
    id: safeUid,
    fullName: params.fullName || 'Pemilik UMKM',
    email: params.email,
    passwordDemo: '',
    phone: '',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    monthlyRecurringRevenue: '227000.0000',
    maxTenantsAllowed: 3,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'REAL',
    isDemoAccount: false,
    onboardingCompleted: true,
    lastInvoiceNumber: `CLOUD-${Date.now().toString().slice(-6)}`,
    lastPaidAt: now,
    validUntil,
    adminNotes: 'Terdaftar via Firebase Cloud Authentication.',
    createdAt: now,
  };

  return { customer, workspace };
}
