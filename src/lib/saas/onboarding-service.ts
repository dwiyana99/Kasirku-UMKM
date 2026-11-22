/**
 * KasirAkun UMKM — Pure SaaS Subscription, Onboarding & Master Customer Management Service
 * Strictly uses Decimal.js for all monetary calculations (zero floating-point money).
 * Applies PMK 131/2024 PPN 12% x DPP Nilai Lain (11/12) = 11% effective on SaaS invoices.
 */

import Decimal from 'decimal.js';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_FEATURE_MODULES } from '../../../prisma/seed';
import { buildJournalEntry } from '../accounting/journal-engine';
import { buildHierarchicalTaxonomyFromPresets } from '../catalog/taxonomy-presets';
import { getVerticalMeta } from '../verticals/vertical-registry';
import type {
  Account,
  BillingCycle,
  BusinessVertical,
  Category,
  CustomFieldDefinition,
  CustomerAccountStatus,
  FeatureModule,
  ManagedCustomerAccount,
  Product,
  RestaurantTable,
  SubscriptionInvoice,
  TaxEntityType,
  Tenant,
  TenantRegionalTaxSettings,
  TenantWorkspaceData,
} from '../../types/domain';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface SubscriptionPricingBreakdown {
  monthlyBase: string;
  discountAmount: string;
  subtotal: string;
  dppNilaiLain: string; // PMK 131/2024: 11/12 x Subtotal
  ppnAmount: string; // 12% x DPP Nilai Lain (effective 11%)
  grandTotal: string;
  effectiveMonthlyMrr: string;
}

export function normalizeSelectedModules(
  modules: FeatureModule['code'][]
): FeatureModule['code'][] {
  const unique = new Set<FeatureModule['code']>(modules);
  unique.add('POS_BASIC');
  return Array.from(unique);
}

export function calculateSubscriptionPricing(
  selectedModules: FeatureModule['code'][],
  billingCycle: BillingCycle
): SubscriptionPricingBreakdown {
  const normalized = normalizeSelectedModules(selectedModules);

  const monthlyBase = DEFAULT_FEATURE_MODULES.filter((m) =>
    normalized.includes(m.code as FeatureModule['code'])
  ).reduce((sum, m) => sum.plus(new Decimal(m.monthlyPrice)), new Decimal(0));

  const grossBeforeDiscount =
    billingCycle === 'ANNUAL' ? monthlyBase.times(12) : monthlyBase;

  // 15% annual savings discount
  const discountAmount =
    billingCycle === 'ANNUAL'
      ? grossBeforeDiscount.times('0.15').toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

  const subtotal = grossBeforeDiscount.minus(discountAmount);
  // PMK 131/2024: DPP Nilai Lain = 11/12 x Harga Jual, PPN = 12% x DPP Nilai Lain
  const dppNilaiLain = subtotal
    .times(11)
    .div(12)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const ppnAmount = dppNilaiLain
    .times('0.12')
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const grandTotal = subtotal.plus(ppnAmount);
  const effectiveMonthlyMrr =
    billingCycle === 'ANNUAL'
      ? subtotal.div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : subtotal;

  return {
    monthlyBase: monthlyBase.toFixed(4),
    discountAmount: discountAmount.toFixed(4),
    subtotal: subtotal.toFixed(4),
    dppNilaiLain: dppNilaiLain.toFixed(4),
    ppnAmount: ppnAmount.toFixed(4),
    grandTotal: grandTotal.toFixed(4),
    effectiveMonthlyMrr: effectiveMonthlyMrr.toFixed(4),
  };
}

export function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `umkm-${Date.now()}`;
}

export interface OnboardingMenuDraft {
  name: string;
  description: string;
  categoryName: string;
  sellingPrice: string;
  costPriceAvg: string;
  stockQty: string;
  unit: string;
  imageUrl?: string;
  barcodeQr?: string;
  isTaxExempt?: boolean;
}

export interface ProvisionOnboardedCustomerInput {
  invoice: SubscriptionInvoice;
  fullName: string;
  email: string;
  passwordDemo: string;
  phone: string;
  businessName: string;
  vertical: BusinessVertical;
  taxEntity: TaxEntityType;
  isPkp: boolean;
  npwp16: string;
  nitku22: string;
  address: string;
  receiptFooter: string;
  thermalPaperWidth: '58mm' | '80mm';
  autoPrintQrOrders: boolean;
  tableCount: number;
  initialCapital: string;
  menuDrafts: OnboardingMenuDraft[];
  customFields: Array<Omit<CustomFieldDefinition, 'id' | 'tenantId'>>;
  regionalTax?: TenantRegionalTaxSettings;
  businessWhatsappNumber?: string;
}

export function provisionOnboardedCustomer(
  input: ProvisionOnboardedCustomerInput
): {
  customer: ManagedCustomerAccount;
  workspace: TenantWorkspaceData;
} {
  if (input.invoice.paymentStatus !== 'VERIFIED_PAID') {
    throw new Error(
      'Pembayaran paket belum terverifikasi lunas. Selesaikan verifikasi pembayaran sebelum membuat akun.'
    );
  }
  if (!input.fullName.trim() || !input.email.trim() || !input.businessName.trim()) {
    throw new Error('Nama lengkap, email, dan nama usaha wajib diisi.');
  }

  const now = new Date().toISOString();
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const tenantId = `real-tnt-${suffix}`;
  const customerId = `real-cust-${suffix}`;
  const slug = `${slugifyBusinessName(input.businessName)}-${suffix.slice(-4)}`;
  const activeModules = normalizeSelectedModules(input.invoice.selectedModules);
  const effectivePlan = input.invoice.planCode ?? 'BASIC';
  const effectiveAddOns = input.invoice.selectedAddOns ?? [];

  const pricing = calculateSubscriptionPricing(activeModules, input.invoice.billingCycle);
  const monthlyMrr =
    input.invoice.billingCycle === 'ANNUAL'
      ? new Decimal(input.invoice.subtotalAmount || pricing.subtotal)
          .div(12)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
          .toFixed(4)
      : new Decimal(input.invoice.subtotalAmount || pricing.subtotal).toFixed(4);

  const accounts: Account[] = DEFAULT_CHART_OF_ACCOUNTS.map((a) => ({
    id: `${tenantId}-acc-${a.code}`,
    tenantId,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));

  const uniqueCategoryNames = Array.from(
    new Set(
      input.menuDrafts
        .map((m) => m.categoryName.trim())
        .filter((n) => n.length > 0)
    )
  );
  const verticalMeta = getVerticalMeta(input.vertical);
  if (uniqueCategoryNames.length === 0) {
    uniqueCategoryNames.push(verticalMeta.defaultCategoryName);
  }

  const categories: Category[] = uniqueCategoryNames.map((name, idx) => ({
    id: `cat-${suffix}-${idx + 1}`,
    tenantId,
    name,
    sortOrder: idx + 1,
  }));

  const defaultItemType: Product['itemType'] = verticalMeta.defaultItemType;

  const products: Product[] = input.menuDrafts.map((draft, idx) => {
    const cat = categories.find((c) => c.name === draft.categoryName.trim()) ?? categories[0];
    return {
      id: `prod-${suffix}-${idx + 1}`,
      tenantId,
      categoryId: cat.id,
      sku: `SKU-${String(idx + 1).padStart(3, '0')}`,
      barcodeQr: draft.barcodeQr?.trim() || `899${String(Date.now()).slice(-7)}${idx + 1}`,
      name: draft.name.trim(),
      description: draft.description.trim() || `${draft.name.trim()} — produk unggulan ${input.businessName.trim()}.`,
      imageUrl: draft.imageUrl,
      itemType: defaultItemType,
      unit: draft.unit.trim() || (defaultItemType === 'MENU_ITEM' ? 'porsi' : 'pcs'),
      sellingPrice: new Decimal(draft.sellingPrice || '0').toFixed(4),
      costPriceAvg: new Decimal(draft.costPriceAvg || '0').toFixed(4),
      stockQty: new Decimal(draft.stockQty || '0').toFixed(4),
      minStockAlert: defaultItemType === 'RETAIL_GOODS' ? '5.0000' : '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: Boolean(draft.isTaxExempt),
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    };
  });

  const isFnb = input.vertical === 'RESTORAN' || input.vertical === 'KEDAI_MAKAN';
  const clampedTables = isFnb ? Math.max(1, Math.min(30, input.tableCount || 4)) : 0;
  const tables: RestaurantTable[] = Array.from({ length: clampedTables }, (_, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return {
      id: `tbl-${suffix}-${num}`,
      tenantId,
      tableNumber: num,
      qrToken: `qr-${slug.slice(0, 14)}-meja-${num}`,
      isActive: true,
    };
  });

  const customFields: CustomFieldDefinition[] = input.customFields.map((cf, idx) => ({
    ...cf,
    id: `cf-${suffix}-${idx + 1}`,
    tenantId,
  }));

  const capitalDec = Decimal.max(new Decimal('1000000'), new Decimal(input.initialCapital || '15000000'));
  const cashPortion = capitalDec.times('0.30').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const bankPortion = capitalDec.minus(cashPortion);

  const openingJe = buildJournalEntry({
    id: `je-open-${tenantId}`,
    tenantId,
    entryNumber: `OPN-${now.slice(0, 10).replace(/-/g, '')}-0001`,
    entryDate: now.slice(0, 10),
    sourceModule: 'OPENING',
    sourceId: null,
    description: `Saldo Awal Modal Usaha — ${input.businessName.trim()}`,
    accounts,
    draftLines: [
      { accountCode: '1101', debit: cashPortion.toFixed(4), credit: '0', memo: 'Kas tunai awal kasir' },
      { accountCode: '1102', debit: bankPortion.toFixed(4), credit: '0', memo: 'Saldo bank operasional awal' },
      { accountCode: '3101', debit: '0', credit: capitalDec.toFixed(4), memo: 'Modal disetor pemilik' },
    ],
  });

  const tenant: Tenant = {
    id: tenantId,
    name: input.businessName.trim(),
    slug,
    vertical: input.vertical,
    taxEntity: input.taxEntity,
    isPkp: input.isPkp,
    npwp16: input.npwp16.trim() || '3174010000000001',
    nitku22: input.nitku22.trim() || `${(input.npwp16.trim() || '3174010000000001').slice(0, 16)}000001`,
    address: input.address.trim() || 'Indonesia',
    receiptFooter: input.receiptFooter.trim() || `Terima kasih telah berbelanja di ${input.businessName.trim()}!`,
    cumulativeTurnoverPriorMonths: '0.0000',
    serviceChargeRate: input.vertical === 'RESTORAN' ? '0.05' : '0',
    activeModules,
    accountScope: 'REAL',
    ownerAccountId: customerId,
    settings: {
      autoPrintQrOrders: input.autoPrintQrOrders,
      thermalPaperWidth: input.thermalPaperWidth,
      qrisMdrRate: '0.007',
      businessWhatsappNumber: (input.businessWhatsappNumber ?? input.phone ?? '').trim(),
      regionalTax: input.regionalTax,
    },
    createdAt: now,
  };

  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + (input.invoice.billingCycle === 'ANNUAL' ? 365 : 30));

  const customer: ManagedCustomerAccount = {
    id: customerId,
    fullName: input.fullName.trim(),
    email: input.email.trim().toLowerCase(),
    passwordDemo: input.passwordDemo.trim() || 'User2026!',
    phone: input.phone.trim() || '081200000000',
    role: 'OWNER',
    status: 'ACTIVE',
    billingCycle: input.invoice.billingCycle,
    activeModules,
    subscriptionPlan: effectivePlan,
    activeAddOns: effectiveAddOns,
    monthlyRecurringRevenue: monthlyMrr,
    maxTenantsAllowed:
      activeModules.includes('MULTI_BRANCH') || effectiveAddOns.includes('ADDON_EXTRA_BRANCH')
        ? 10
        : 1,
    tenantIds: [tenantId],
    primaryTenantId: tenantId,
    accountScope: 'REAL',
    isDemoAccount: false,
    onboardingCompleted: true,
    lastInvoiceNumber: input.invoice.invoiceNumber,
    lastPaidAt: input.invoice.paidAt || now,
    validUntil: validUntilDate.toISOString(),
    adminNotes: `Self-registered via Onboarding Wizard (${effectivePlan} · ${input.invoice.paymentMethod})`,
    createdAt: now,
  };

  const defaultBranch = {
    id: `br-${suffix}-hq`,
    tenantId,
    code: 'CAB-01',
    name: `${input.businessName.trim()} — Pusat`,
    branchType: 'OUTLET' as const,
    address: tenant.address,
    phone: input.phone.trim() || '081200000000',
    nitku22: tenant.nitku22,
    isDefault: true,
    isActive: true,
    createdAt: now,
  };

  const workspace: TenantWorkspaceData = {
    tenant: {
      ...tenant,
      subscriptionPlan: effectivePlan,
      activeAddOns: effectiveAddOns,
    },
    accounts,
    categories,
    taxonomy: buildHierarchicalTaxonomyFromPresets(input.vertical, categories),
    products,
    recipes: [],
    inventoryMovements: [],
    purchaseOrders: [],
    tables,
    orders: [],
    expenses: [],
    fixedAssets: [],
    customFields,
    journalEntries: [openingJe],
    branches: [defaultBranch],
    branchStocks: products.map((p) => ({
      id: `bs-${defaultBranch.id}-${p.id}`,
      tenantId,
      branchId: defaultBranch.id,
      productId: p.id,
      stockQty: p.stockQty,
      minStockAlert: p.minStockAlert,
      movingAvgCost: p.costPriceAvg,
      updatedAt: now,
    })),
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
  };

  return { customer, workspace };
}

export interface MasterCustomerSettingsPatch {
  fullName?: string;
  phone?: string;
  status?: CustomerAccountStatus;
  billingCycle?: BillingCycle;
  activeModules?: FeatureModule['code'][];
  maxTenantsAllowed?: number;
  adminNotes?: string;
}

export function applyMasterCustomerUpdate(
  customer: ManagedCustomerAccount,
  patch: MasterCustomerSettingsPatch
): ManagedCustomerAccount {
  const nextModules = patch.activeModules
    ? normalizeSelectedModules(patch.activeModules)
    : customer.activeModules;
  const nextCycle = patch.billingCycle ?? customer.billingCycle;
  const pricing = calculateSubscriptionPricing(nextModules, nextCycle);

  return {
    ...customer,
    fullName: patch.fullName !== undefined ? patch.fullName.trim() || customer.fullName : customer.fullName,
    phone: patch.phone !== undefined ? patch.phone.trim() : customer.phone,
    status: patch.status ?? customer.status,
    billingCycle: nextCycle,
    activeModules: nextModules,
    monthlyRecurringRevenue: pricing.effectiveMonthlyMrr,
    maxTenantsAllowed:
      patch.maxTenantsAllowed !== undefined
        ? Math.max(1, Math.min(100, patch.maxTenantsAllowed))
        : customer.maxTenantsAllowed,
    adminNotes: patch.adminNotes !== undefined ? patch.adminNotes : customer.adminNotes,
  };
}

export function deactivateCustomerAccount(
  customer: ManagedCustomerAccount,
  reason?: string
): ManagedCustomerAccount {
  const note = reason?.trim()
    ? `${customer.adminNotes ? `${customer.adminNotes} | ` : ''}Dinonaktifkan Master: ${reason.trim()}`
    : customer.adminNotes;
  return {
    ...customer,
    status: 'DEACTIVATED',
    activeModules: ['POS_BASIC'],
    monthlyRecurringRevenue: '0.0000',
    adminNotes: note,
  };
}

export function reactivateCustomerAccount(
  customer: ManagedCustomerAccount,
  modulesToRestore?: FeatureModule['code'][]
): ManagedCustomerAccount {
  const nextModules = normalizeSelectedModules(
    modulesToRestore && modulesToRestore.length > 0 ? modulesToRestore : customer.activeModules
  );
  const pricing = calculateSubscriptionPricing(nextModules, customer.billingCycle);
  return {
    ...customer,
    status: 'ACTIVE',
    activeModules: nextModules,
    monthlyRecurringRevenue: pricing.effectiveMonthlyMrr,
  };
}

export function calculatePlatformMrrSummary(customers: ManagedCustomerAccount[]): {
  totalMrr: string;
  activeCount: number;
  suspendedCount: number;
  deactivatedCount: number;
  totalTenantsManaged: number;
} {
  let totalMrr = new Decimal(0);
  let activeCount = 0;
  let suspendedCount = 0;
  let deactivatedCount = 0;
  let totalTenantsManaged = 0;

  for (const c of customers) {
    totalTenantsManaged += c.tenantIds.length;
    if (c.status === 'ACTIVE' || c.status === 'TRIAL') {
      activeCount += 1;
      if (c.status === 'ACTIVE') {
        totalMrr = totalMrr.plus(new Decimal(c.monthlyRecurringRevenue || '0'));
      }
    } else if (c.status === 'SUSPENDED') {
      suspendedCount += 1;
    } else if (c.status === 'DEACTIVATED') {
      deactivatedCount += 1;
    }
  }

  return {
    totalMrr: totalMrr.toFixed(4),
    activeCount,
    suspendedCount,
    deactivatedCount,
    totalTenantsManaged,
  };
}
