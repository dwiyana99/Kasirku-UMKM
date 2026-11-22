import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import Decimal from 'decimal.js';
import type {
  AccountScope,
  ActivityActionType,
  ActivityLogEntry,
  AddOnModuleCode,
  AgroBatch,
  AgroBatchUsage,
  AppSession,
  AuditLog,
  BoardingInvoice,
  BoardingRoom,
  BoardingTenant,
  Branch,
  BusinessVertical,
  CashierShift,
  CatalogTaxonomy,
  Category,
  CrmCustomer,
  CustomFieldDefinition,
  DemoAppointmentRequest,
  FeatureModule,
  FixedAsset,
  InventoryMovement,
  KitchenStatus,
  ManagedCustomerAccount,
  OperationalExpense,
  Order,
  OrderMode,
  PaymentMethod,
  PriceTier,
  Product,
  ProductRecipe,
  Promotion,
  PurchaseOrder,
  PurchaseOrderStatus,
  ReceiptDesignConfig,
  RecipeTemplate,
  RecipeTemplateIngredient,
  RegionalTaxRule,
  RestaurantTable,
  StaffAccount,
  StaffPermission,
  StockAdjustmentReasonCode,
  StockOpnameSession,
  StockTransfer,
  SubscriptionPlanCode,
  Supplier,
  SystemDemoConfig,
  TaxonomyBrand,
  TaxonomyProductType,
  TaxonomySize,
  TaxonomyUnit,
  Tenant,
  TenantRegionalTaxSettings,
  TenantWorkspaceData,
  VerticalOperationsState,
  WithholdingTaxType,
} from '../types/domain';
import {
  createInitialCustomers,
  createInitialWorkspaces,
  DEFAULT_SYSTEM_DEMO_CONFIG,
  INITIAL_DEMO_APPOINTMENTS,
} from '../data/seedData';
import {
  buildJournalEntry,
  createExpenseJournalEntry,
  createMonthlyDepreciationBatch,
  createReversingJournalEntry,
  createSaleJournalEntries,
} from '../lib/accounting/journal-engine';
import { processOrderCheckout, type CartLineInput } from '../lib/pos/checkout-service';
import { calculateWithholdingTax } from '../lib/tax/indonesia-tax-engine';
import {
  DEFAULT_INDONESIA_REGIONAL_TAXES,
  mergeLatestRegionalTaxRegistry,
} from '../lib/tax/regional-tax-indonesia';
import {
  applyMasterCustomerUpdate,
  deactivateCustomerAccount,
  provisionOnboardedCustomer,
  reactivateCustomerAccount,
  type MasterCustomerSettingsPatch,
  type ProvisionOnboardedCustomerInput,
} from '../lib/saas/onboarding-service';
import {
  calculateBomUnitCost,
  calculateRestockMovingAverage,
  canAccessModule,
  createInventoryPurchaseJournalEntry,
  createStockOpnameJournalEntry,
} from '../lib/saas/subscription-lifecycle';
import {
  deriveLegacyModulesFromHybrid,
  enforceWorkspacePlanEntitlements,
  tenantHasAddOn,
} from '../lib/saas/hybrid-pricing';
import {
  calculateBoardingInvoice,
  createBoardingDepositJournal,
  createBoardingRentPaymentJournal,
  recordAgroBatchUsage,
  recordAgroHarvest,
} from '../lib/verticals/kost-agro-engine';
import {
  approveStockOpnameSession,
  ensureBranchStocksForTenant,
  receivePurchaseOrderWithLandedCost,
  receiveStockTransfer,
  recordSupplierDebtPayment,
  shipStockTransfer,
} from '../lib/inventory/multi-branch-engine';
import { closeCashierShift } from '../lib/pos/advanced-pos-engine';
import {
  calculateRecipeFormulationMetrics,
  deriveRecipeTemplatesFromWorkspace,
  getVisibleWorkspacesForSession,
} from '../lib/catalog/recipe-bom-utils';
import {
  computeBulkAdjustmentPreview,
  createBulkStockOpnameJournalEntry,
  type BulkAdjustmentLineInput,
} from '../lib/inventory/stock-monitoring';
import {
  getEffectiveTaxonomy,
  inferMeasurementUnit,
  mergeUniqueTaxonomyValues,
  syncFlatArraysFromItems,
} from '../lib/catalog/taxonomy-presets';
import { getDefaultHomeRouteForSession } from '../lib/rbac/staff-rbac';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import {
  mergeRealtimeOrders,
  mergeRealtimeProducts,
  normalizeFirestoreDocId,
  provisionDefaultFirebaseWorkspace,
  sanitizeFirestorePayload,
  toFirestoreInventoryDoc,
  toFirestoreOrderDoc,
} from '../lib/db/firestore-sync';

export interface AutoPrintNotification {
  id: string;
  order: Order;
  tenantName: string;
  receivedAt: string;
}

export interface MasterTenantSettingsPatch {
  taxEntity?: Tenant['taxEntity'];
  isPkp?: boolean;
  serviceChargeRate?: string;
  thermalPaperWidth?: '58mm' | '80mm';
  autoPrintQrOrders?: boolean;
  qrisMdrRate?: string;
}

interface AppContextValue {
  route: string;
  navigate: (path: string) => void;
  user: FirebaseUser | null;
  authReady: boolean;
  authLoading: boolean;
  realtimeInventoryCount: number;
  realtimeOrderCount: number;
  signInWithGoogle: () => Promise<{ ok: boolean; defaultRoute?: string; error?: string }>;
  signInWithFirebaseEmail: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; defaultRoute?: string; error?: string }>;
  signUpWithFirebaseEmail: (input: {
    email: string;
    password: string;
    fullName: string;
    businessName: string;
    vertical: Tenant['vertical'];
    taxEntity?: Tenant['taxEntity'];
    businessWhatsappNumber?: string;
    regionalTax?: TenantRegionalTaxSettings;
  }) => Promise<{ ok: boolean; defaultRoute?: string; error?: string }>;
  linkActiveWorkspaceToGoogleCloud: () => Promise<{ ok: boolean; error?: string }>;
  signOutUser: () => Promise<void>;
  workspaces: TenantWorkspaceData[];
  visibleWorkspaces: TenantWorkspaceData[];
  activeTenantId: string;
  activeWorkspace: TenantWorkspaceData;
  switchTenant: (tenantId: string) => void;
  findWorkspaceBySlug: (slug: string) => TenantWorkspaceData | undefined;
  autoPrintQueue: AutoPrintNotification[];
  dismissAutoPrint: (id: string) => void;
  markReceiptPrinted: (tenantId: string, orderId: string) => void;
  // Core POS & QR actions
  completePosCheckout: (params: {
    cart: CartLineInput[];
    paymentMethod: PaymentMethod;
    customerName: string;
    tableId?: string | null;
    tableNumber?: string;
    discountAmount?: string;
    gatewayRefId?: string | null;
    stylistName?: string;
    stylistCommissionRate?: string;
    customAttributes?: Record<string, string | number | boolean>;
  }) => Order;
  createPendingQrOrder: (params: {
    tenantId: string;
    tableId: string;
    tableNumber: string;
    customerName: string;
    cart: CartLineInput[];
  }) => Order;
  finalizeQrOrderViaWebhook: (params: {
    tenantId: string;
    orderId: string;
    gatewayRefId: string;
    mdrFee: string;
    paidAt: string;
  }) => Order | null;
  updateKitchenStatus: (tenantId: string, orderId: string, status: KitchenStatus) => void;
  // Accounting & Assets
  recordOperationalExpense: (params: {
    expenseAccountId: string;
    paymentAccountId: string;
    expenseDate: string;
    description: string;
    amount: string;
    withholdingTaxType: WithholdingTaxType;
    customAttributes?: Record<string, string | number | boolean>;
  }) => OperationalExpense;
  updateOperationalExpense: (
    expenseId: string,
    patch: Partial<Pick<OperationalExpense, 'description' | 'expenseDate' | 'customAttributes'>>
  ) => void;
  voidOperationalExpense: (expenseId: string, reason: string) => void;
  runMonthlyDepreciation: () => { count: number; totalDepreciation: string };
  reverseJournal: (journalEntryId: string, reason: string) => void;
  // Settings, Custom Fields, Categories, Products, Inventory, BOM Recipes & QR Tables
  addCustomField: (field: Omit<CustomFieldDefinition, 'id' | 'tenantId'>) => void;
  removeCustomField: (fieldId: string) => void;
  addCategory: (name: string) => Category;
  updateCategory: (categoryId: string, name: string) => void;
  deleteCategory: (categoryId: string) => void;
  addTaxonomyValue: (kind: 'productTypes' | 'brands' | 'sizes' | 'units', value: string) => void;
  removeTaxonomyValue: (kind: 'productTypes' | 'brands' | 'sizes' | 'units', value: string) => void;
  // Structured Hierarchical Taxonomy CRUD (Kategori -> Jenis -> Merek / Ukuran / Satuan)
  addProductTypeItem: (input: { categoryId: string; name: string }) => TaxonomyProductType | null;
  updateProductTypeItem: (id: string, patch: { categoryId: string; name: string }) => void;
  deleteProductTypeItem: (id: string) => void;
  addBrandItem: (input: { categoryId: string; productTypeId: string | null; name: string }) => TaxonomyBrand | null;
  updateBrandItem: (id: string, patch: { categoryId: string; productTypeId: string | null; name: string }) => void;
  deleteBrandItem: (id: string) => void;
  addSizeItem: (input: {
    categoryId: string | null;
    productTypeId: string | null;
    label: string;
    measurementUnit?: string;
  }) => TaxonomySize | null;
  updateSizeItem: (
    id: string,
    patch: { categoryId: string | null; productTypeId: string | null; label: string; measurementUnit?: string }
  ) => void;
  deleteSizeItem: (id: string) => void;
  addUnitItem: (input: { categoryId: string | null; productTypeId: string | null; name: string }) => TaxonomyUnit | null;
  updateUnitItem: (id: string, patch: { categoryId: string | null; productTypeId: string | null; name: string }) => void;
  deleteUnitItem: (id: string) => void;
  applyCommonCategoryPresets: (categoryNames: string[]) => number;
  // Purchase Order (PO) Management & Conversion to Stock
  createPurchaseOrder: (po: PurchaseOrder) => PurchaseOrder;
  updatePurchaseOrderStatus: (poId: string, status: PurchaseOrderStatus) => void;
  receivePurchaseOrderToStock: (params: {
    poId: string;
    paymentAccountCode: '1101' | '1102' | '2101';
    receiptNumber?: string;
    receiptImageUrl?: string;
    notes?: string;
  }) => { itemCount: number; totalPurchaseValue: string };
  updateReceiptDesign: (design: ReceiptDesignConfig) => void;
  addProduct: (product: Omit<Product, 'id' | 'tenantId' | 'createdAt'>) => Product;
  updateProduct: (
    productId: string,
    patch: Partial<Omit<Product, 'id' | 'tenantId' | 'createdAt'>>
  ) => void;
  deleteProduct: (productId: string) => void;
  restockInventoryItem: (params: {
    productId: string;
    addedQty: string;
    unitPurchaseCost: string;
    paymentAccountCode: '1101' | '1102' | '2101';
    notes?: string;
    receiptImageUrl?: string;
    receiptNumber?: string;
    supplierName?: string;
  }) => { newQty: string; newAvgCost: string; totalPurchaseValue: string };
  adjustInventoryStock: (params: {
    productId: string;
    actualStockQty: string;
    reasonCode?: StockAdjustmentReasonCode;
    notes?: string;
  }) => void;
  bulkAdjustInventoryStock: (params: {
    entries: BulkAdjustmentLineInput[];
    batchNotes?: string;
  }) => {
    adjustedCount: number;
    netValuationDelta: string;
    journalEntryNumber: string | null;
  };
  // Staff RBAC & Activity Audit Log (Owner / User Utama)
  addStaffAccount: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    roleTitle: string;
    permissions: StaffPermission[];
  }) => { ok: boolean; error?: string; staff?: StaffAccount };
  updateStaffAccount: (
    staffId: string,
    patch: Partial<Pick<StaffAccount, 'fullName' | 'phone' | 'password' | 'roleTitle' | 'permissions' | 'isActive'>>
  ) => void;
  deleteStaffAccount: (staffId: string) => void;
  saveProductRecipes: (
    menuProductId: string,
    items: Array<{ ingredientProductId: string; quantityRequired: string }>
  ) => { unitCost: string };
  saveRecipeTemplate: (input: {
    id?: string;
    name: string;
    description: string;
    yieldPortions?: number;
    ingredients: RecipeTemplateIngredient[];
  }) => { template: RecipeTemplate; unitCost: string };
  deleteRecipeTemplate: (templateId: string) => void;
  addTable: (tableNumber: string) => RestaurantTable;
  updateTable: (
    tableId: string,
    patch: Partial<Pick<RestaurantTable, 'tableNumber' | 'isActive'>>
  ) => void;
  deleteTable: (tableId: string) => void;
  addFixedAsset: (asset: Omit<FixedAsset, 'id' | 'tenantId' | 'accumulatedDepreciation' | 'status' | 'assetAccountId' | 'accumDeprAccountId' | 'deprExpenseAccountId'>) => void;
  updateTenantProfile: (
    patch: Partial<
      Pick<
        Tenant,
        | 'name'
        | 'taxEntity'
        | 'isPkp'
        | 'npwp16'
        | 'nitku22'
        | 'address'
        | 'logoUrl'
        | 'receiptFooter'
        | 'serviceChargeRate'
      >
    > & { settings?: Partial<Tenant['settings']> }
  ) => void;
  toggleTenantModule: (code: Tenant['activeModules'][number]) => void;
  hasModule: (code: FeatureModule['code']) => boolean;
  syncStatus: 'local' | 'saving' | 'synced';
  // Master Admin, Customer Auth & Onboarding
  customers: ManagedCustomerAccount[];
  session: AppSession;
  activeCustomer: ManagedCustomerAccount | null;
  loginAsMaster: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginAsCustomer: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; customer?: ManagedCustomerAccount; defaultRoute?: string }>;
  impersonateCustomer: (customerId: string) => void;
  exitImpersonation: () => void;
  updateOwnAccountProfile: (patch: {
    fullName?: string;
    phone?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => { ok: boolean; error?: string };
  logoutSession: () => Promise<void>;
  completeCustomerOnboarding: (input: ProvisionOnboardedCustomerInput) => Promise<{
    customer: ManagedCustomerAccount;
    workspace: TenantWorkspaceData;
  }>;
  updateManagedCustomer: (
    customerId: string,
    customerPatch: MasterCustomerSettingsPatch,
    tenantPatch?: MasterTenantSettingsPatch
  ) => void;
  deactivateManagedCustomer: (customerId: string, reason?: string) => void;
  reactivateManagedCustomer: (
    customerId: string,
    modulesToRestore?: FeatureModule['code'][]
  ) => void;
  // =========================================================================
  // ALL-IN-ONE UPGRADE: Multi-Branch, Demo Control, Hybrid Plan, Kost, Agro, POS Pro
  // =========================================================================
  activeBranchId: string; // 'ALL' for consolidated or specific Branch['id']
  setActiveBranchId: (branchId: string) => void;
  hasAddOn: (code: AddOnModuleCode) => boolean;
  switchHybridPlan: (planCode: SubscriptionPlanCode, addOns?: AddOnModuleCode[]) => void;
  activateAddOn: (code: AddOnModuleCode) => void;
  deactivateAddOn: (code: AddOnModuleCode) => void;
  // Demo Control & Appointments
  systemDemoConfig: SystemDemoConfig;
  demoRequests: DemoAppointmentRequest[];
  updateDemoConfig: (next: Omit<SystemDemoConfig, 'updatedAt'>) => Promise<{ ok: boolean; error?: string }>;
  submitDemoRequest: (input: {
    fullName: string;
    businessName: string;
    vertical: BusinessVertical;
    whatsappNumber: string;
    email: string;
    branchCount: number;
    preferredSchedule: string;
    notes?: string;
  }) => Promise<{ ok: boolean; request?: DemoAppointmentRequest; error?: string }>;
  approveDemoRequest: (
    requestId: string,
    opts?: { durationDays?: number; allowedPlan?: SubscriptionPlanCode }
  ) => Promise<{ ok: boolean; request?: DemoAppointmentRequest; error?: string }>;
  rejectDemoRequest: (requestId: string) => Promise<{ ok: boolean; error?: string }>;
  registerDemoTrialUser: (input: {
    fullName: string;
    email: string;
    whatsappNumber: string;
    password: string;
  }) => Promise<{
    ok: boolean;
    registrant?: {
      id: string;
      fullName: string;
      email: string;
      phone: string;
      demoExpiresAt: string;
      durationDays: number;
    };
    error?: string;
  }>;
  enterInstantDemo: (
    vertical: BusinessVertical,
    options?: {
      selectedPlan?: SubscriptionPlanCode;
      selectedAddOns?: AddOnModuleCode[];
      registrantEmail?: string;
    }
  ) => Promise<{ ok: boolean; error?: string; requiresRegistration?: boolean }>;
  enterMagicDemo: (magicToken: string) => Promise<{ ok: boolean; error?: string }>;
  // Kost & Kontrakan
  addBoardingRoom: (input: {
    roomNumber: string;
    roomType: string;
    monthlyRate: string;
    yearlyRate?: string;
    notes?: string;
  }) => BoardingRoom;
  updateBoardingRoomStatus: (roomId: string, status: BoardingRoom['status']) => void;
  checkInBoardingTenant: (input: {
    roomId: string;
    fullName: string;
    nikKtp: string;
    phoneWa: string;
    emergencyContact: string;
    checkInDate: string;
    depositAmount: string;
    paymentAccountCode: '1101' | '1102';
  }) => BoardingTenant;
  createBoardingInvoice: (input: {
    roomId: string;
    boardingTenantId: string;
    periodMonth: string;
    rentAmount: string;
    utilityFee: string;
    lateFee: string;
  }) => BoardingInvoice;
  payBoardingInvoice: (invoiceId: string, paymentAccountCode: '1101' | '1102') => void;
  // Peternakan & Pertanian
  createAgroBatch: (input: {
    name: string;
    agroType: AgroBatch['agroType'];
    startDate: string;
    initialQty: string;
    unit: string;
    notes?: string;
  }) => AgroBatch;
  updateAgroMortality: (batchId: string, mortalityQty: string) => void;
  addAgroBatchUsage: (input: {
    batchId: string;
    usageCategory: AgroBatchUsage['usageCategory'];
    productId?: string | null;
    description: string;
    qtyUsed: string;
    unit: string;
    unitCost: string;
  }) => void;
  harvestAgroBatch: (input: {
    batchId: string;
    targetProductId: string;
    netHarvestQty: string;
    unit: string;
    harvestDate?: string;
  }) => { unitHpp: string };
  // Multi-Branch, 3-Step Stock Transfer, Supplier PO & Blind Opname
  addBranch: (input: {
    code: string;
    name: string;
    branchType: Branch['branchType'];
    address: string;
    phone: string;
    nitku22?: string;
  }) => Branch;
  createStockTransfer: (input: {
    sourceBranchId: string;
    destinationBranchId: string;
    items: Array<{ productId: string; requestedQty: string }>;
    notes?: string;
  }) => StockTransfer;
  shipStockTransferById: (transferId: string) => void;
  receiveStockTransferById: (
    transferId: string,
    receivedQuantities: Record<string, { receivedQty: string; damagedQty?: string }>
  ) => void;
  addSupplier: (input: {
    name: string;
    phone: string;
    address: string;
    defaultTermDays: number;
    notes?: string;
  }) => Supplier;
  receivePoWithLandedCost: (input: {
    poId: string;
    branchId: string;
    landedCostShipping: string;
    paymentType: 'TUNAI' | 'TEMPO_HUTANG';
    paymentAccountCode: '1101' | '1102';
  }) => void;
  paySupplierDebt: (
    poId: string,
    payAmount: string,
    paymentAccountCode: '1101' | '1102',
    notes?: string
  ) => void;
  createBlindOpnameSession: (branchId: string, isBlindCount: boolean) => StockOpnameSession;
  updateOpnamePhysicalQty: (sessionId: string, productId: string, physicalQty: string) => void;
  approveOpnameSessionById: (sessionId: string) => void;
  // Advanced POS: Shift, Open/Split Bill, Move/Merge Table, Void Audit, Promo, PriceTier, CRM
  openCashierShift: (openingCash: string) => CashierShift;
  closeActiveCashierShift: (actualClosingCash: string) => { variance: string };
  holdOpenBill: (input: {
    cart: CartLineInput[];
    customerName: string;
    customerPhoneWa?: string;
    tableId?: string | null;
    tableNumber?: string;
    orderMode?: OrderMode;
    discountAmount?: string;
  }) => Order;
  settleOpenBill: (orderId: string, paymentMethod: PaymentMethod) => Order | null;
  splitOpenBill: (
    orderId: string,
    mode: 'EQUAL' | 'BY_ITEMS',
    splitValue: number | string[]
  ) => Order[];
  moveOrMergeTable: (
    orderId: string,
    targetTableId: string,
    targetTableNumber: string,
    mergeWithOrderId?: string
  ) => void;
  voidOrderWithAudit: (orderId: string, reason: string) => void;
  addPromotion: (input: Omit<Promotion, 'id' | 'tenantId' | 'createdAt'>) => Promotion;
  togglePromotion: (promoId: string) => void;
  addPriceTier: (input: Omit<PriceTier, 'id' | 'tenantId'>) => PriceTier;
  deletePriceTier: (tierId: string) => void;
  addCrmCustomer: (input: Omit<CrmCustomer, 'id' | 'tenantId' | 'createdAt'>) => CrmCustomer;
  recordCrmReceivablePayment: (
    customerId: string,
    payAmount: string,
    paymentAccountCode: '1101' | '1102'
  ) => void;
  // Indonesia Regional Tax (PBJT / UU HKPD) & 22-Vertical Operations Engine
  regionalTaxRegistry: RegionalTaxRule[];
  updateRegionalTaxRule: (rule: RegionalTaxRule) => void;
  syncLatestRegionalTaxes: () => {
    addedCount: number;
    updatedCount: number;
    syncedTenants: number;
  };
  updateTenantRegionalAndWa: (patch: {
    regionalTax?: TenantRegionalTaxSettings;
    businessWhatsappNumber?: string;
  }) => void;
  updateVerticalOps: (
    updater: (prev: VerticalOperationsState) => VerticalOperationsState,
    revenuePosting?: {
      grossAmount: string;
      pbjtAmount?: string;
      otaCommissionAmount?: string;
      description: string;
      paymentAccountCode?: '1101' | '1102';
    }
  ) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'kasirakun_umkm_workspaces_v2';
const CUSTOMERS_STORAGE_KEY = 'kasirakun_umkm_customers_v2';
const SESSION_STORAGE_KEY = 'kasirakun_umkm_session_v2';
const ACTIVE_TENANT_STORAGE_KEY = 'kasirakun_umkm_active_tenant_v2';

const GUEST_SESSION: AppSession = {
  role: 'GUEST',
  email: '',
  fullName: 'Tamu Demo',
};

const MASTER_OWNER_EMAIL = 'dwiyana99@gmail.com';

function sanitizeTenantSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
  return cleaned || 'umkm-tenant';
}

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = err instanceof Error ? err.message : String(err);
  if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
    return 'Provider Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password). Gunakan tombol "Masuk / Daftar dengan Google" atau aktifkan provider tersebut di Console.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email sudah terdaftar di Firebase Auth. Silakan gunakan tab Masuk Email Cloud.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Email atau kata sandi Firebase Auth tidak cocok.';
  }
  if (code === 'auth/weak-password') {
    return 'Kata sandi minimal 6 karakter.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Jendela login Google ditutup sebelum selesai.';
  }
  return `Autentikasi Firebase gagal: ${msg}`;
}

function loadInitialWorkspaces(): TenantWorkspaceData[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TenantWorkspaceData[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to clean seed
  }
  return createInitialWorkspaces();
}

function loadInitialCustomers(): ManagedCustomerAccount[] {
  try {
    const raw = window.sessionStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ManagedCustomerAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to seed
  }
  return createInitialCustomers();
}

function loadInitialSession(): AppSession {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppSession;
      if (parsed && parsed.role) return parsed;
    }
  } catch {
    // fallback
  }
  return GUEST_SESSION;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<string>(() => window.location.pathname || '/');
  const [workspaces, setWorkspaces] = useState<TenantWorkspaceData[]>(loadInitialWorkspaces);
  const [customers, setCustomers] = useState<ManagedCustomerAccount[]>(loadInitialCustomers);
  const [session, setSession] = useState<AppSession>(loadInitialSession);
  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    try {
      const savedId = window.sessionStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
      const initial = loadInitialWorkspaces();
      if (savedId && initial.some((w) => w.tenant.id === savedId)) {
        return savedId;
      }
      return initial[0]?.tenant.id ?? 'tenant-resto-pak-budi';
    } catch {
      return loadInitialWorkspaces()[0]?.tenant.id ?? 'tenant-resto-pak-budi';
    }
  });
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'local' | 'saving' | 'synced'>('local');
  const [autoPrintQueue, setAutoPrintQueue] = useState<AutoPrintNotification[]>([]);
  const [regionalTaxRegistry, setRegionalTaxRegistry] = useState<RegionalTaxRule[]>(() => {
    try {
      const raw = window.localStorage.getItem('kasirakun_regional_tax_registry_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as RegionalTaxRule[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeLatestRegionalTaxRegistry(parsed).merged;
        }
      }
    } catch {
      // fallback to built-in 38+ Indonesian regions
    }
    return DEFAULT_INDONESIA_REGIONAL_TAXES;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'kasirakun_regional_tax_registry_v1',
        JSON.stringify(regionalTaxRegistry)
      );
    } catch {
      // ignore storage quota errors
    }
  }, [regionalTaxRegistry]);

  // Browser history sync
  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    const currentFull = `${window.location.pathname}${window.location.search}`;
    if (path !== currentFull) {
      window.history.pushState({}, '', path);
    }
    const cleanPathname = path.split('?')[0] || '/';
    setRoute(cleanPathname);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  // Persist workspaces, managed customers, and active session for reload resilience
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    } catch {
      // ignore quota errors
    }
  }, [workspaces]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
    } catch {
      // ignore quota errors
    }
  }, [customers]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore quota errors
    }
  }, [session]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, activeTenantId);
    } catch {
      // ignore quota errors
    }
  }, [activeTenantId]);

  // Persist workspace changes to backend partitioned database API (strictly scoped by Bearer token)
  const syncWorkspaceToServer = useCallback(
    async (token: string | undefined, ws: TenantWorkspaceData) => {
      if (!token) return;
      setSyncStatus('saving');
      try {
        const res = await fetch(`/api/db/workspace/${encodeURIComponent(ws.tenant.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ workspace: ws }),
        });
        if (res.ok) {
          setSyncStatus('synced');
        } else {
          setSyncStatus('local');
        }
      } catch {
        setSyncStatus('local');
      }
    },
    []
  );

  const syncCustomerToServer = useCallback(
    async (token: string | undefined, cust: ManagedCustomerAccount) => {
      if (!token) return;
      try {
        await fetch(`/api/db/customers/${encodeURIComponent(cust.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ customer: cust }),
        });
      } catch {
        // non-blocking
      }
    },
    []
  );

  const [activeBranchId, setActiveBranchId] = useState<string>('ALL');
  const [systemDemoConfig, setSystemDemoConfig] = useState<SystemDemoConfig>(DEFAULT_SYSTEM_DEMO_CONFIG);
  const [demoRequests, setDemoRequests] = useState<DemoAppointmentRequest[]>(INITIAL_DEMO_APPOINTMENTS);

  // Load public demo configuration from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/demo-config');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { config?: SystemDemoConfig };
        if (data.config && !cancelled) {
          setSystemDemoConfig(data.config);
        }
      } catch {
        // fallback to default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load demo appointment requests when authenticated as MASTER_ADMIN
  useEffect(() => {
    if (session.role !== 'MASTER_ADMIN' || !session.token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/demo-requests', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { requests?: DemoAppointmentRequest[] };
        if (Array.isArray(data.requests) && !cancelled) {
          setDemoRequests(data.requests);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.role, session.token]);

  // Hydrate authenticated session from real backend partitioned database on page load/reload
  useEffect(() => {
    if (session.role === 'GUEST' || !session.token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/db/bootstrap', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          customers?: ManagedCustomerAccount[];
          workspaces?: TenantWorkspaceData[];
        };
        if (cancelled) return;
        if (Array.isArray(data.customers) && data.customers.length > 0) {
          setCustomers(data.customers);
        }
        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          setActiveTenantId((prevId) =>
            data.workspaces!.some((w) => w.tenant.id === prevId)
              ? prevId
              : data.workspaces![0].tenant.id
          );
          setSyncStatus('synced');
        }
      } catch {
        // keep cached session workspace
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.role, session.token]);

  const pendingSignupProfileRef = useRef<{
    fullName: string;
    businessName: string;
    vertical: Tenant['vertical'];
    taxEntity?: Tenant['taxEntity'];
    businessWhatsappNumber?: string;
    regionalTax?: TenantRegionalTaxSettings;
  } | null>(null);
  const provisionedUidRef = useRef<string | null>(null);

  // Persist authenticated tenant ledger to Firestore (strictly partitioned by accountScope: REAL vs DEMO)
  const syncWorkspaceToFirestore = useCallback(
    async (firebaseUser: FirebaseUser, ws: TenantWorkspaceData) => {
      const scope: AccountScope = ws.tenant.accountScope === 'DEMO' ? 'DEMO' : 'REAL';
      const docTenantId = normalizeFirestoreDocId(ws.tenant.id);
      const safeSlug = sanitizeTenantSlug(ws.tenant.slug || ws.tenant.name);
      const userPath = `users/${firebaseUser.uid}`;
      const tenantPath =
        scope === 'DEMO'
          ? `demo_sandboxes/${docTenantId}`
          : `users/${firebaseUser.uid}/tenants/${docTenantId}`;
      setSyncStatus('saving');
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        const displayName = (
          firebaseUser.displayName ||
          ws.tenant.name ||
          'Pemilik UMKM'
        ).slice(0, 150);
        if (userSnap.exists()) {
          await setDoc(
            userRef,
            {
              displayName,
              activeTenantId: docTenantId,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(
            userRef,
            {
              ownerId: firebaseUser.uid,
              accountScope: scope,
              displayName,
              activeTenantId: docTenantId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, userPath);
      }
      try {
        const targetRef =
          scope === 'DEMO'
            ? doc(db, 'demo_sandboxes', docTenantId)
            : doc(db, 'users', firebaseUser.uid, 'tenants', docTenantId);
        const tenantSnap = await getDoc(targetRef);
        const cleanPayload = sanitizeFirestorePayload(ws);
        if (tenantSnap.exists()) {
          await setDoc(
            targetRef,
            {
              name: ws.tenant.name.slice(0, 150),
              slug: safeSlug,
              vertical: ws.tenant.vertical,
              taxEntity: ws.tenant.taxEntity,
              workspacePayload: cleanPayload,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(
            targetRef,
            {
              ownerId: firebaseUser.uid,
              accountScope: scope,
              tenantId: docTenantId,
              name: ws.tenant.name.slice(0, 150),
              slug: safeSlug,
              vertical: ws.tenant.vertical,
              taxEntity: ws.tenant.taxEntity,
              workspacePayload: cleanPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        setSyncStatus('synced');
      } catch (error) {
        setSyncStatus('local');
        handleFirestoreError(error, OperationType.WRITE, tenantPath);
      }
    },
    []
  );

  const syncManagedCustomerToFirestore = useCallback(
    async (firebaseUser: FirebaseUser, cust: ManagedCustomerAccount) => {
      const docCustId = normalizeFirestoreDocId(cust.id);
      const custPath = `managed_customers/${docCustId}`;
      const scope: AccountScope =
        cust.accountScope === 'DEMO' || cust.isDemoAccount ? 'DEMO' : 'REAL';
      try {
        const custRef = doc(db, 'managed_customers', docCustId);
        const existingSnap = await getDoc(custRef);
        const cleanCust = sanitizeFirestorePayload(cust);
        if (existingSnap.exists()) {
          await setDoc(
            custRef,
            {
              fullName: cust.fullName.slice(0, 150),
              customerPayload: cleanCust,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          await setDoc(
            custRef,
            {
              customerId: docCustId,
              ownerId: firebaseUser.uid,
              accountScope: scope,
              fullName: cust.fullName.slice(0, 150),
              email: cust.email.slice(0, 255),
              status: cust.status,
              billingCycle: cust.billingCycle,
              customerPayload: cleanCust,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, custPath);
      }
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
      setAuthReady(true);
      if (!fbUser) {
        provisionedUidRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Generic Realtime Firestore Collection Hooks (onSnapshot) for Tenants, Inventory Items, POS Orders & Customers
  const firebaseScopeTenantId = useMemo(
    () => normalizeFirestoreDocId(activeTenantId),
    [activeTenantId]
  );
  const isMasterFirebaseUser = user?.email?.toLowerCase() === MASTER_OWNER_EMAIL;
  const ownerConstraints = useMemo(
    () => (user ? [where('ownerId', '==', user.uid)] : []),
    [user]
  );
  const customerConstraints = useMemo(
    () => (user && !isMasterFirebaseUser ? [where('ownerId', '==', user.uid)] : []),
    [isMasterFirebaseUser, user]
  );

  const firestoreTenantsHook = useFirestoreCollection<TenantWorkspaceData>({
    enabled: Boolean(user),
    collectionPath: user ? `users/${user.uid}/tenants` : null,
    constraints: ownerConstraints,
    mapDoc: (_id, data) => {
      const ws = data.workspacePayload as TenantWorkspaceData | undefined;
      return ws && ws.tenant?.id ? ws : null;
    },
  });

  const firestoreCustomersHook = useFirestoreCollection<ManagedCustomerAccount>({
    enabled: Boolean(user),
    collectionPath: user ? 'managed_customers' : null,
    constraints: customerConstraints,
    mapDoc: (_id, data) => {
      const cust = data.customerPayload as ManagedCustomerAccount | undefined;
      return cust && cust.id ? cust : null;
    },
  });

  const activeTenantExistsInFirestore = useMemo(
    () =>
      Boolean(
        user &&
          firestoreTenantsHook.items.some(
            (w) => normalizeFirestoreDocId(w.tenant.id) === firebaseScopeTenantId
          )
      ),
    [firebaseScopeTenantId, firestoreTenantsHook.items, user]
  );

  const inventoryHook = useFirestoreCollection<Product>({
    enabled: Boolean(user && activeTenantExistsInFirestore),
    collectionPath:
      user && activeTenantExistsInFirestore
        ? `users/${user.uid}/tenants/${firebaseScopeTenantId}/products`
        : null,
    constraints: ownerConstraints,
    mapDoc: (_id, data) => {
      const prod = data.payload as Product | undefined;
      return prod && prod.id ? prod : null;
    },
  });

  const ordersHook = useFirestoreCollection<Order>({
    enabled: Boolean(user && activeTenantExistsInFirestore),
    collectionPath:
      user && activeTenantExistsInFirestore
        ? `users/${user.uid}/tenants/${firebaseScopeTenantId}/orders`
        : null,
    constraints: ownerConstraints,
    mapDoc: (_id, data) => {
      const ord = data.payload as Order | undefined;
      return ord && ord.id ? ord : null;
    },
  });

  // Hydrate workspaces & provision clean REAL workspace for new Firebase users (zero dummy fallback)
  useEffect(() => {
    if (!user || !firestoreTenantsHook.hasInitialSnapshot) return;

    const remoteTenants = firestoreTenantsHook.items;
    if (remoteTenants.length > 0) {
      setWorkspaces((prev) => {
        const localById = new Map(prev.map((w) => [w.tenant.id, w]));
        // Merge existing remote tenants and keep only remote tenants when operating in Firebase Cloud mode
        return remoteTenants.map((rw) => {
          const existing = localById.get(rw.tenant.id);
          if (!existing) return rw;
          // Preserve latest in-flight products/orders if subcollection hooks already merged them
          return {
            ...rw,
            products:
              rw.products.length >= existing.products.length ? rw.products : existing.products,
            orders: rw.orders.length >= existing.orders.length ? rw.orders : existing.orders,
          };
        });
      });

      setActiveTenantId((prevId) =>
        remoteTenants.some((w) => w.tenant.id === prevId) ? prevId : remoteTenants[0].tenant.id
      );
      setSyncStatus('synced');

      if (session.role === 'GUEST') {
        const matchingCust = firestoreCustomersHook.items[0];
        if (isMasterFirebaseUser) {
          setSession({
            role: 'MASTER_ADMIN',
            accountScope: 'REAL',
            email: user.email || MASTER_OWNER_EMAIL,
            fullName: user.displayName || 'Master Pemilik KasirAkun',
            firebaseUid: user.uid,
            authProvider: 'FIREBASE_GOOGLE',
          });
        } else {
          setSession({
            role: 'CUSTOMER',
            accountScope: 'REAL',
            email: user.email || matchingCust?.email || '',
            fullName:
              user.displayName || matchingCust?.fullName || remoteTenants[0].tenant.name,
            customerId: matchingCust?.id ?? normalizeFirestoreDocId(user.uid),
            firebaseUid: user.uid,
            authProvider:
              user.providerData?.[0]?.providerId === 'password'
                ? 'FIREBASE_EMAIL'
                : 'FIREBASE_GOOGLE',
          });
        }
      }
      return;
    }

    // First-time authenticated Firebase user with 0 tenants in Firestore -> provision clean REAL workspace
    if (provisionedUidRef.current === user.uid) return;
    provisionedUidRef.current = user.uid;

    const pendingProfile = pendingSignupProfileRef.current;
    pendingSignupProfileRef.current = null;

    const { customer, workspace } = provisionDefaultFirebaseWorkspace({
      uid: user.uid,
      email: user.email || `${user.uid}@kasirakun.id`,
      fullName: pendingProfile?.fullName || user.displayName || 'Pemilik UMKM',
      businessName: pendingProfile?.businessName,
      vertical: pendingProfile?.vertical,
      taxEntity: pendingProfile?.taxEntity,
      businessWhatsappNumber: pendingProfile?.businessWhatsappNumber,
      regionalTax: pendingProfile?.regionalTax,
    });

    setCustomers([customer]);
    setWorkspaces([workspace]);
    setActiveTenantId(workspace.tenant.id);
    setSession({
      role: isMasterFirebaseUser ? 'MASTER_ADMIN' : 'CUSTOMER',
      accountScope: 'REAL',
      email: customer.email,
      fullName: customer.fullName,
      customerId: customer.id,
      firebaseUid: user.uid,
      authProvider:
        user.providerData?.[0]?.providerId === 'password'
          ? 'FIREBASE_EMAIL'
          : 'FIREBASE_GOOGLE',
    });

    void (async () => {
      await syncWorkspaceToFirestore(user, workspace);
      await syncManagedCustomerToFirestore(user, customer);
    })();
  }, [
    firestoreCustomersHook.items,
    firestoreTenantsHook.hasInitialSnapshot,
    firestoreTenantsHook.items,
    isMasterFirebaseUser,
    session.role,
    syncManagedCustomerToFirestore,
    syncWorkspaceToFirestore,
    user,
  ]);

  // Hydrate Managed Customers from realtime Firestore snapshot
  useEffect(() => {
    if (!user || !firestoreCustomersHook.hasInitialSnapshot) return;
    if (firestoreCustomersHook.items.length === 0) return;
    setCustomers((prev) => {
      if (isMasterFirebaseUser) {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const rc of firestoreCustomersHook.items) {
          byId.set(rc.id, rc);
        }
        return Array.from(byId.values());
      }
      return firestoreCustomersHook.items;
    });
  }, [
    firestoreCustomersHook.hasInitialSnapshot,
    firestoreCustomersHook.items,
    isMasterFirebaseUser,
    user,
  ]);

  // Merge realtime Firestore Inventory Items into active tenant workspace
  useEffect(() => {
    if (!user || !activeTenantExistsInFirestore || !inventoryHook.hasInitialSnapshot) return;
    if (inventoryHook.items.length === 0) return;
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (normalizeFirestoreDocId(ws.tenant.id) !== firebaseScopeTenantId) return ws;
        const merged = mergeRealtimeProducts(ws.products, inventoryHook.items);
        if (
          merged.length === ws.products.length &&
          merged.every((p, idx) => p === ws.products[idx])
        ) {
          return ws;
        }
        return { ...ws, products: merged };
      })
    );
  }, [
    activeTenantExistsInFirestore,
    firebaseScopeTenantId,
    inventoryHook.hasInitialSnapshot,
    inventoryHook.items,
    user,
  ]);

  // Merge realtime Firestore POS Transactions into active tenant workspace
  useEffect(() => {
    if (!user || !activeTenantExistsInFirestore || !ordersHook.hasInitialSnapshot) return;
    if (ordersHook.items.length === 0) return;
    setWorkspaces((prev) =>
      prev.map((ws) => {
        if (normalizeFirestoreDocId(ws.tenant.id) !== firebaseScopeTenantId) return ws;
        const merged = mergeRealtimeOrders(ws.orders, ordersHook.items);
        if (
          merged.length === ws.orders.length &&
          merged.every((o, idx) => o === ws.orders[idx])
        ) {
          return ws;
        }
        return { ...ws, orders: merged };
      })
    );
  }, [
    activeTenantExistsInFirestore,
    firebaseScopeTenantId,
    ordersHook.hasInitialSnapshot,
    ordersHook.items,
    user,
  ]);

  // Helper to push individual product/order docs to Firestore subcollections
  const upsertProductToFirestore = useCallback(
    async (tenantId: string, product: Product) => {
      if (!user) return;
      const docTenantId = normalizeFirestoreDocId(tenantId);
      const docProdId = normalizeFirestoreDocId(product.id);
      const record = toFirestoreInventoryDoc(user.uid, docTenantId, product);
      if (docTenantId === firebaseScopeTenantId && activeTenantExistsInFirestore) {
        await inventoryHook.upsertItem(docProdId, record as unknown as Record<string, unknown>);
        return;
      }
      const path = `users/${user.uid}/tenants/${docTenantId}/products`;
      const ref = doc(db, path, docProdId);
      const snap = await getDoc(ref);
      await setDoc(
        ref,
        {
          ...record,
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [activeTenantExistsInFirestore, firebaseScopeTenantId, inventoryHook, user]
  );

  const deleteProductFromFirestore = useCallback(
    async (tenantId: string, productId: string) => {
      if (!user) return;
      const docTenantId = normalizeFirestoreDocId(tenantId);
      const docProdId = normalizeFirestoreDocId(productId);
      if (docTenantId === firebaseScopeTenantId && activeTenantExistsInFirestore) {
        await inventoryHook.deleteItem(docProdId);
      }
    },
    [activeTenantExistsInFirestore, firebaseScopeTenantId, inventoryHook, user]
  );

  const upsertOrderToFirestore = useCallback(
    async (tenantId: string, order: Order) => {
      if (!user) return;
      const docTenantId = normalizeFirestoreDocId(tenantId);
      const docOrderId = normalizeFirestoreDocId(order.id);
      const record = toFirestoreOrderDoc(user.uid, docTenantId, order);
      if (docTenantId === firebaseScopeTenantId && activeTenantExistsInFirestore) {
        await ordersHook.upsertItem(docOrderId, record as unknown as Record<string, unknown>);
        return;
      }
      const path = `users/${user.uid}/tenants/${docTenantId}/orders`;
      const ref = doc(db, path, docOrderId);
      const snap = await getDoc(ref);
      await setDoc(
        ref,
        {
          ...record,
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    [activeTenantExistsInFirestore, firebaseScopeTenantId, ordersHook, user]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const isMaster = fbUser.email?.toLowerCase() === MASTER_OWNER_EMAIL;
      const nextSession: AppSession = isMaster
        ? {
            role: 'MASTER_ADMIN',
            accountScope: 'REAL',
            email: fbUser.email || MASTER_OWNER_EMAIL,
            fullName: fbUser.displayName || 'Master Pemilik KasirAkun',
            firebaseUid: fbUser.uid,
            authProvider: 'FIREBASE_GOOGLE',
          }
        : {
            role: 'CUSTOMER',
            accountScope: 'REAL',
            email: fbUser.email || '',
            fullName: fbUser.displayName || 'Pemilik UMKM',
            customerId: normalizeFirestoreDocId(fbUser.uid),
            firebaseUid: fbUser.uid,
            authProvider: 'FIREBASE_GOOGLE',
          };
      setSession(nextSession);
      return { ok: true, defaultRoute: isMaster ? '/master' : '/dashboard' };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signInWithFirebaseEmail: AppContextValue['signInWithFirebaseEmail'] = useCallback(
    async (email, password) => {
      setAuthLoading(true);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const fbUser = cred.user;
        const isMaster = fbUser.email?.toLowerCase() === MASTER_OWNER_EMAIL;
        setSession({
          role: isMaster ? 'MASTER_ADMIN' : 'CUSTOMER',
          accountScope: 'REAL',
          email: fbUser.email || email.trim(),
          fullName: fbUser.displayName || email.trim().split('@')[0],
          customerId: normalizeFirestoreDocId(fbUser.uid),
          firebaseUid: fbUser.uid,
          authProvider: 'FIREBASE_EMAIL',
        });
        return { ok: true, defaultRoute: isMaster ? '/master' : '/dashboard' };
      } catch (err) {
        return { ok: false, error: mapFirebaseAuthError(err) };
      } finally {
        setAuthLoading(false);
      }
    },
    []
  );

  const signUpWithFirebaseEmail: AppContextValue['signUpWithFirebaseEmail'] = useCallback(
    async (input) => {
      setAuthLoading(true);
      try {
        pendingSignupProfileRef.current = {
          fullName: input.fullName.trim(),
          businessName: input.businessName.trim(),
          vertical: input.vertical,
          taxEntity: input.taxEntity,
          businessWhatsappNumber: input.businessWhatsappNumber,
          regionalTax: input.regionalTax,
        };
        const cred = await createUserWithEmailAndPassword(
          auth,
          input.email.trim(),
          input.password
        );
        if (input.fullName.trim()) {
          await updateProfile(cred.user, { displayName: input.fullName.trim() });
        }
        const { customer, workspace } = provisionDefaultFirebaseWorkspace({
          uid: cred.user.uid,
          email: cred.user.email || input.email.trim(),
          fullName: input.fullName.trim(),
          businessName: input.businessName.trim(),
          vertical: input.vertical,
          taxEntity: input.taxEntity,
          businessWhatsappNumber: input.businessWhatsappNumber,
          regionalTax: input.regionalTax,
        });
        provisionedUidRef.current = cred.user.uid;
        pendingSignupProfileRef.current = null;

        setCustomers([customer]);
        setWorkspaces([workspace]);
        setActiveTenantId(workspace.tenant.id);
        setSession({
          role: 'CUSTOMER',
          accountScope: 'REAL',
          email: customer.email,
          fullName: customer.fullName,
          customerId: customer.id,
          firebaseUid: cred.user.uid,
          authProvider: 'FIREBASE_EMAIL',
        });
        await syncWorkspaceToFirestore(cred.user, workspace);
        await syncManagedCustomerToFirestore(cred.user, customer);
        return { ok: true, defaultRoute: '/dashboard' };
      } catch (err) {
        pendingSignupProfileRef.current = null;
        return { ok: false, error: mapFirebaseAuthError(err) };
      } finally {
        setAuthLoading(false);
      }
    },
    [syncManagedCustomerToFirestore, syncWorkspaceToFirestore]
  );

  const linkActiveWorkspaceToGoogleCloud = useCallback(async () => {
    setAuthLoading(true);
    try {
      const currentWs =
        workspaces.find((w) => w.tenant.id === activeTenantId) ?? workspaces[0];
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      if (currentWs) {
        const realWs: TenantWorkspaceData = {
          ...currentWs,
          tenant: {
            ...currentWs.tenant,
            accountScope: 'REAL',
            ownerAccountId: fbUser.uid,
          },
        };
        provisionedUidRef.current = fbUser.uid;
        await syncWorkspaceToFirestore(fbUser, realWs);
        const docTenantId = normalizeFirestoreDocId(realWs.tenant.id);
        for (const prod of realWs.products) {
          const rec = toFirestoreInventoryDoc(fbUser.uid, docTenantId, prod);
          const ref = doc(
            db,
            `users/${fbUser.uid}/tenants/${docTenantId}/products`,
            normalizeFirestoreDocId(prod.id)
          );
          const snap = await getDoc(ref);
          await setDoc(
            ref,
            {
              ...rec,
              ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        for (const ord of realWs.orders) {
          const rec = toFirestoreOrderDoc(fbUser.uid, docTenantId, ord);
          const ref = doc(
            db,
            `users/${fbUser.uid}/tenants/${docTenantId}/orders`,
            normalizeFirestoreDocId(ord.id)
          );
          const snap = await getDoc(ref);
          await setDoc(
            ref,
            {
              ...rec,
              ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        setSession((prev) => ({
          ...prev,
          firebaseUid: fbUser.uid,
          authProvider: 'FIREBASE_GOOGLE',
        }));
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    } finally {
      setAuthLoading(false);
    }
  }, [activeTenantId, syncWorkspaceToFirestore, workspaces]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setSyncStatus('local');
  }, []);

  const loginAsMaster = useCallback(
    async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth/master-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as {
          authenticated?: boolean;
          accountScope?: AccountScope;
          email?: string;
          fullName?: string;
          token?: string;
          customers?: ManagedCustomerAccount[];
          workspaces?: TenantWorkspaceData[];
          error?: string;
        };
        if (!res.ok || !data.authenticated) {
          return { ok: false, error: data.error || 'Login Master Admin gagal.' };
        }
        if (Array.isArray(data.customers)) {
          setCustomers(data.customers);
        }
        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces);
          setActiveTenantId(data.workspaces[0].tenant.id);
        }
        setSession({
          role: 'MASTER_ADMIN',
          accountScope: data.accountScope ?? 'REAL',
          email: data.email || email,
          fullName: data.fullName || 'Master Pemilik KasirAkun',
          token: data.token,
        });
        setSyncStatus('synced');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal menghubungi server autentikasi.' };
      }
    },
    []
  );

  const loginAsCustomer: AppContextValue['loginAsCustomer'] = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const data = (await res.json()) as {
          authenticated?: boolean;
          role?: 'CUSTOMER' | 'STAFF';
          accountScope?: AccountScope;
          token?: string;
          customer?: ManagedCustomerAccount;
          staff?: StaffAccount;
          ownerAccount?: ManagedCustomerAccount | null;
          workspaces?: TenantWorkspaceData[];
          error?: string;
        };

        if (!res.ok || !data.authenticated || !data.token) {
          return { ok: false, error: data.error || 'Email atau kata sandi tidak sesuai.' };
        }

        const isolatedWorkspaces = data.workspaces ?? [];

        if (data.role === 'CUSTOMER' && data.customer) {
          // Strictly isolate in-memory state to ONLY this authenticated user's own customer + workspaces
          setCustomers([data.customer]);
          if (isolatedWorkspaces.length > 0) {
            setWorkspaces(isolatedWorkspaces);
            setActiveTenantId(data.customer.primaryTenantId || isolatedWorkspaces[0].tenant.id);
          }
          setSession({
            role: 'CUSTOMER',
            accountScope: data.accountScope ?? data.customer.accountScope ?? 'REAL',
            email: data.customer.email,
            fullName: data.customer.fullName,
            phone: data.customer.phone,
            customerId: data.customer.id,
            token: data.token,
          });
          setSyncStatus('synced');
          return { ok: true, customer: data.customer, defaultRoute: '/dashboard' };
        }

        if (data.role === 'STAFF' && data.staff && isolatedWorkspaces.length > 0) {
          const staffWs = isolatedWorkspaces[0];
          const loginLog: ActivityLogEntry = {
            id: `act-login-${Date.now()}`,
            tenantId: staffWs.tenant.id,
            actorName: data.staff.fullName,
            actorEmail: data.staff.email,
            actorRole: 'STAFF',
            actionType: 'AUTH_LOGIN',
            summary: `Pegawai (${data.staff.roleTitle}) masuk ke workspace ${staffWs.tenant.name}.`,
            createdAt: new Date().toISOString(),
          };
          const updatedStaffWs: TenantWorkspaceData = {
            ...staffWs,
            activityLogs: [loginLog, ...(staffWs.activityLogs ?? [])].slice(0, 300),
          };

          setCustomers(data.ownerAccount ? [data.ownerAccount] : []);
          setWorkspaces([updatedStaffWs]);
          setActiveTenantId(staffWs.tenant.id);

          const nextSession: AppSession = {
            role: 'STAFF',
            accountScope: data.accountScope ?? staffWs.tenant.accountScope ?? 'REAL',
            email: data.staff.email,
            fullName: data.staff.fullName,
            phone: data.staff.phone,
            staffId: data.staff.id,
            staffTenantId: staffWs.tenant.id,
            staffRoleTitle: data.staff.roleTitle,
            staffPermissions: data.staff.permissions,
            token: data.token,
          };
          setSession(nextSession);
          void syncWorkspaceToServer(data.token, updatedStaffWs);

          return {
            ok: true,
            defaultRoute: getDefaultHomeRouteForSession(nextSession),
          };
        }

        return { ok: false, error: 'Gagal memuat data akun dari database.' };
      } catch {
        return { ok: false, error: 'Gagal terhubung ke server database autentikasi.' };
      }
    },
    [syncWorkspaceToServer]
  );

  const impersonateCustomer = useCallback(
    (customerId: string) => {
      const found = customers.find((c) => c.id === customerId);
      if (!found) return;
      if (found.primaryTenantId) {
        setActiveTenantId(found.primaryTenantId);
      }
      setSession((prev) =>
        prev.role === 'MASTER_ADMIN'
          ? {
              ...prev,
              impersonatingCustomerId: found.id,
              impersonatingCustomerName: found.fullName,
            }
          : prev
      );
      navigate('/dashboard');
    },
    [customers, navigate]
  );

  const exitImpersonation = useCallback(() => {
    setSession((prev) =>
      prev.role === 'MASTER_ADMIN'
        ? {
            ...prev,
            impersonatingCustomerId: undefined,
            impersonatingCustomerName: undefined,
          }
        : prev
    );
    navigate('/master');
  }, [navigate]);

  const updateOwnAccountProfile: AppContextValue['updateOwnAccountProfile'] = useCallback(
    (patch) => {
      if (session.role === 'GUEST') {
        return { ok: false, error: 'Silakan login terlebih dahulu.' };
      }

      if (session.role === 'CUSTOMER' && session.customerId) {
        const target = customers.find((c) => c.id === session.customerId);
        if (!target) return { ok: false, error: 'Akun pengguna tidak ditemukan.' };

        if (patch.newPassword && patch.newPassword.trim()) {
          if (patch.currentPassword !== target.passwordDemo) {
            return { ok: false, error: 'Kata sandi saat ini tidak sesuai.' };
          }
          if (patch.newPassword.trim().length < 6) {
            return { ok: false, error: 'Kata sandi baru minimal 6 karakter.' };
          }
        }

        const nextFullName = patch.fullName?.trim() || target.fullName;
        const nextPhone = patch.phone?.trim() ?? target.phone;
        const nextPassword = patch.newPassword?.trim() || target.passwordDemo;

        const updated: ManagedCustomerAccount = {
          ...target,
          fullName: nextFullName,
          phone: nextPhone,
          passwordDemo: nextPassword,
        };

        setCustomers((prev) => prev.map((c) => (c.id === target.id ? updated : c)));
        setSession((prev) => ({
          ...prev,
          fullName: nextFullName,
          phone: nextPhone,
        }));
        void syncCustomerToServer(session.token, updated);
        if (user) {
          void syncManagedCustomerToFirestore(user, updated);
        }
        return { ok: true };
      }

      // Master Admin profile update (display name / phone)
      const nextFullName = patch.fullName?.trim() || session.fullName;
      const nextPhone = patch.phone?.trim() ?? session.phone;
      setSession((prev) => ({
        ...prev,
        fullName: nextFullName,
        phone: nextPhone,
      }));
      return { ok: true };
    },
    [customers, session, syncCustomerToServer, syncManagedCustomerToFirestore, user]
  );

  const logoutSession = useCallback(async () => {
    // Clear private user workspaces & customer records from memory & sessionStorage on logout
    setSession(GUEST_SESSION);
    setCustomers(createInitialCustomers());
    setWorkspaces(createInitialWorkspaces());
    setActiveTenantId('tenant-resto-pak-budi');
    setSyncStatus('local');
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem(CUSTOMERS_STORAGE_KEY);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (user) {
      await signOut(auth);
    }
  }, [user]);

  const completeCustomerOnboarding: AppContextValue['completeCustomerOnboarding'] = useCallback(
    async (input) => {
      const { customer, workspace } = provisionOnboardedCustomer(input);
      const res = await fetch('/api/auth/register-onboarded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, workspace }),
      });
      const data = (await res.json()) as {
        authenticated?: boolean;
        token?: string;
        customer?: ManagedCustomerAccount;
        workspace?: TenantWorkspaceData;
        error?: string;
      };
      if (!res.ok || !data.authenticated || !data.customer || !data.workspace) {
        throw new Error(data.error || 'Gagal menyimpan akun & usaha baru ke database.');
      }

      // Strictly isolate state to ONLY this newly registered REAL user
      setCustomers([data.customer]);
      setWorkspaces([data.workspace]);
      setActiveTenantId(data.workspace.tenant.id);
      setSession({
        role: 'CUSTOMER',
        accountScope: 'REAL',
        email: data.customer.email,
        fullName: data.customer.fullName,
        phone: data.customer.phone,
        customerId: data.customer.id,
        token: data.token,
      });
      setSyncStatus('synced');

      if (user) {
        void syncWorkspaceToFirestore(user, data.workspace);
        void syncManagedCustomerToFirestore(user, data.customer);
      }
      return { customer: data.customer, workspace: data.workspace };
    },
    [syncManagedCustomerToFirestore, syncWorkspaceToFirestore, user]
  );

  const updateManagedCustomer: AppContextValue['updateManagedCustomer'] = useCallback(
    (customerId, customerPatch, tenantPatch) => {
      let updatedCustomerRef: ManagedCustomerAccount | null = null;
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== customerId) return c;
          const next = applyMasterCustomerUpdate(c, customerPatch);
          updatedCustomerRef = next;
          return next;
        })
      );

      if (updatedCustomerRef) {
        const custSnapshot: ManagedCustomerAccount = updatedCustomerRef;
        void syncCustomerToServer(session.token, custSnapshot);
        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (!custSnapshot.tenantIds.includes(ws.tenant.id)) return ws;
            const nextWs: TenantWorkspaceData = {
              ...ws,
              tenant: {
                ...ws.tenant,
                activeModules: custSnapshot.activeModules,
                taxEntity: tenantPatch?.taxEntity ?? ws.tenant.taxEntity,
                isPkp: tenantPatch?.isPkp !== undefined ? tenantPatch.isPkp : ws.tenant.isPkp,
                serviceChargeRate: tenantPatch?.serviceChargeRate ?? ws.tenant.serviceChargeRate,
                settings: {
                  ...ws.tenant.settings,
                  thermalPaperWidth:
                    tenantPatch?.thermalPaperWidth ?? ws.tenant.settings.thermalPaperWidth,
                  autoPrintQrOrders:
                    tenantPatch?.autoPrintQrOrders !== undefined
                      ? tenantPatch.autoPrintQrOrders
                      : ws.tenant.settings.autoPrintQrOrders,
                  qrisMdrRate: tenantPatch?.qrisMdrRate ?? ws.tenant.settings.qrisMdrRate,
                },
              },
            };
            void syncWorkspaceToServer(session.token, nextWs);
            return nextWs;
          })
        );
        if (user) {
          void syncManagedCustomerToFirestore(user, custSnapshot);
        }
      }
    },
    [session.token, syncCustomerToServer, syncManagedCustomerToFirestore, syncWorkspaceToServer, user]
  );

  const deactivateManagedCustomer = useCallback(
    (customerId: string, reason?: string) => {
      let updatedRef: ManagedCustomerAccount | null = null;
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== customerId) return c;
          const next = deactivateCustomerAccount(c, reason);
          updatedRef = next;
          return next;
        })
      );
      if (updatedRef) {
        const snap: ManagedCustomerAccount = updatedRef;
        void syncCustomerToServer(session.token, snap);
        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (!snap.tenantIds.includes(ws.tenant.id)) return ws;
            const nextWs: TenantWorkspaceData = {
              ...ws,
              tenant: {
                ...ws.tenant,
                activeModules: ['POS_BASIC'],
              },
            };
            void syncWorkspaceToServer(session.token, nextWs);
            return nextWs;
          })
        );
        if (user) {
          void syncManagedCustomerToFirestore(user, snap);
        }
      }
    },
    [session.token, syncCustomerToServer, syncManagedCustomerToFirestore, syncWorkspaceToServer, user]
  );

  const reactivateManagedCustomer = useCallback(
    (customerId: string, modulesToRestore?: FeatureModule['code'][]) => {
      let updatedRef: ManagedCustomerAccount | null = null;
      setCustomers((prev) =>
        prev.map((c) => {
          if (c.id !== customerId) return c;
          const next = reactivateCustomerAccount(c, modulesToRestore);
          updatedRef = next;
          return next;
        })
      );
      if (updatedRef) {
        const snap: ManagedCustomerAccount = updatedRef;
        void syncCustomerToServer(session.token, snap);
        setWorkspaces((prev) =>
          prev.map((ws) => {
            if (!snap.tenantIds.includes(ws.tenant.id)) return ws;
            const nextWs: TenantWorkspaceData = {
              ...ws,
              tenant: {
                ...ws.tenant,
                activeModules: snap.activeModules,
              },
            };
            void syncWorkspaceToServer(session.token, nextWs);
            return nextWs;
          })
        );
        if (user) {
          void syncManagedCustomerToFirestore(user, snap);
        }
      }
    },
    [session.token, syncCustomerToServer, syncManagedCustomerToFirestore, syncWorkspaceToServer, user]
  );

  const activeCustomer = useMemo(() => {
    if (session.role === 'CUSTOMER' && session.customerId) {
      return customers.find((c) => c.id === session.customerId) ?? null;
    }
    if (session.role === 'STAFF' && session.staffTenantId) {
      return customers.find((c) => c.tenantIds.includes(session.staffTenantId!)) ?? null;
    }
    return null;
  }, [customers, session.customerId, session.role, session.staffTenantId]);

  const visibleWorkspaces = useMemo(
    () =>
      getVisibleWorkspacesForSession({
        session,
        workspaces,
        customers,
      }),
    [customers, session, workspaces]
  );

  const activeWorkspace = useMemo(() => {
    const pool = visibleWorkspaces.length > 0 ? visibleWorkspaces : workspaces;
    const raw = pool.find((w) => w.tenant.id === activeTenantId) ?? pool[0];
    if (!raw.recipeTemplates) {
      return {
        ...raw,
        recipeTemplates: deriveRecipeTemplatesFromWorkspace(raw),
      };
    }
    return raw;
  }, [visibleWorkspaces, workspaces, activeTenantId]);

  const makeActivityLog = useCallback(
    (tenantId: string, actionType: ActivityActionType, summary: string): ActivityLogEntry => ({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      actorName: session.fullName || 'Pengguna',
      actorEmail: session.email || '-',
      actorRole:
        session.role === 'MASTER_ADMIN'
          ? 'MASTER_ADMIN'
          : session.role === 'STAFF'
          ? 'STAFF'
          : 'OWNER',
      actionType,
      summary,
      createdAt: new Date().toISOString(),
    }),
    [session.email, session.fullName, session.role]
  );

  const updateWorkspaceById = useCallback(
    (tenantId: string, updater: (ws: TenantWorkspaceData) => TenantWorkspaceData) => {
      setWorkspaces((prev) => {
        const next = prev.map((w) => (w.tenant.id === tenantId ? updater(w) : w));
        const target = next.find((w) => w.tenant.id === tenantId);
        if (target) {
          if (session.token) {
            void syncWorkspaceToServer(session.token, target);
          }
          if (user) {
            void syncWorkspaceToFirestore(user, target);
          }
        }
        return next;
      });
    },
    [session.token, syncWorkspaceToFirestore, syncWorkspaceToServer, user]
  );

  const switchTenant = useCallback(
    (tenantId: string) => {
      if (session.role === 'STAFF') return;
      if (session.role === 'CUSTOMER') {
        const allowed = activeCustomer?.tenantIds ?? [];
        if (!allowed.includes(tenantId)) return;
      }
      setActiveTenantId(tenantId);
    },
    [activeCustomer?.tenantIds, session.role]
  );

  const findWorkspaceBySlug = useCallback(
    (slug: string) => workspaces.find((w) => w.tenant.slug === slug),
    [workspaces]
  );

  const completePosCheckout: AppContextValue['completePosCheckout'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const result = processOrderCheckout({
        tenant: ws.tenant,
        products: ws.products,
        recipes: ws.recipes,
        accounts: ws.accounts,
        cart: params.cart,
        orderSource: ws.tenant.vertical === 'FREELANCE' ? 'FREELANCE_INVOICE' : 'POS_CASHIER',
        paymentMethod: params.paymentMethod,
        customerName: params.customerName,
        tableId: params.tableId,
        tableNumber: params.tableNumber,
        discountAmount: params.discountAmount,
        gatewayRefId: params.gatewayRefId,
        stylistName: params.stylistName,
        stylistCommissionRate: params.stylistCommissionRate,
        customAttributes: params.customAttributes,
        markPaidImmediately: true,
        journalSeqStart: ws.journalEntries.length + 1,
        regionalTaxRegistry,
      });

      const saleLog = makeActivityLog(
        ws.tenant.id,
        'POS_SALE',
        `Transaksi POS #${result.order.orderNumber} (${params.customerName || 'Pelanggan Umum'}) · Total Rp${new Decimal(result.order.grandTotal).toFixed(0)} (${params.paymentMethod})`
      );

      const normalizedCustKey = (params.customerName || '').trim().toLowerCase();
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: result.updatedProducts,
        inventoryMovements: [...result.newInventoryMovements, ...prev.inventoryMovements],
        orders: [result.order, ...prev.orders],
        journalEntries: [...result.newJournalEntries, ...prev.journalEntries],
        crmCustomers: normalizedCustKey
          ? (prev.crmCustomers ?? []).map((c) => {
              if (c.name.trim().toLowerCase() !== normalizedCustKey) return c;
              const nextSpend = new Decimal(c.totalSpent || c.totalSpend || '0')
                .plus(new Decimal(result.order.grandTotal || '0'))
                .toFixed(4);
              return {
                ...c,
                totalSpend: nextSpend,
                totalSpent: nextSpend,
              };
            })
          : prev.crmCustomers,
        activityLogs: [saleLog, ...(prev.activityLogs ?? [])].slice(0, 300),
      }));

      if (user) {
        void upsertOrderToFirestore(ws.tenant.id, result.order);
        const oldMap = new Map(ws.products.map((p) => [p.id, p.stockQty]));
        for (const p of result.updatedProducts) {
          if (oldMap.get(p.id) !== p.stockQty) {
            void upsertProductToFirestore(ws.tenant.id, p);
          }
        }
      }

      return result.order;
    },
    [
      activeWorkspace,
      makeActivityLog,
      updateWorkspaceById,
      upsertOrderToFirestore,
      upsertProductToFirestore,
      user,
    ]
  );

  const createPendingQrOrder: AppContextValue['createPendingQrOrder'] = useCallback(
    (params) => {
      const ws = workspaces.find((w) => w.tenant.id === params.tenantId);
      if (!ws) throw new Error('Tenant tidak ditemukan.');
      const result = processOrderCheckout({
        tenant: ws.tenant,
        products: ws.products,
        recipes: ws.recipes,
        accounts: ws.accounts,
        cart: params.cart,
        orderSource: 'QR_SELF_ORDER',
        paymentMethod: 'QRIS_DYNAMIC',
        customerName: params.customerName,
        tableId: params.tableId,
        tableNumber: params.tableNumber,
        markPaidImmediately: false,
        journalSeqStart: ws.journalEntries.length + 1,
        regionalTaxRegistry,
      });

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        orders: [result.order, ...prev.orders],
      }));

      if (user) {
        void upsertOrderToFirestore(ws.tenant.id, result.order);
      }

      return result.order;
    },
    [updateWorkspaceById, upsertOrderToFirestore, user, workspaces]
  );

  const finalizeQrOrderViaWebhook: AppContextValue['finalizeQrOrderViaWebhook'] = useCallback(
    (params) => {
      const ws = workspaces.find((w) => w.tenant.id === params.tenantId);
      if (!ws) return null;
      const targetOrder = ws.orders.find((o) => o.id === params.orderId);
      if (!targetOrder) return null;
      if (targetOrder.paymentStatus === 'PAID') return targetOrder;

      const payment = {
        id: `pay-${targetOrder.id}`,
        tenantId: ws.tenant.id,
        orderId: targetOrder.id,
        paymentMethod: 'QRIS_DYNAMIC' as const,
        amountPaid: targetOrder.grandTotal,
        mdrFee: params.mdrFee,
        gatewayRefId: params.gatewayRefId,
        paidAt: params.paidAt,
      };

      const paidOrder: Order = {
        ...targetOrder,
        paymentStatus: 'PAID',
        kitchenStatus: 'PENDING',
        payment,
      };

      // Deduct recipe/retail stock and post balanced journals
      const checkoutStock = processOrderCheckout({
        tenant: ws.tenant,
        products: ws.products,
        recipes: ws.recipes,
        accounts: ws.accounts,
        cart: targetOrder.items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          notes: i.notes,
        })),
        orderSource: 'QR_SELF_ORDER',
        paymentMethod: 'QRIS_DYNAMIC',
        customerName: targetOrder.customerName,
        tableId: targetOrder.tableId,
        tableNumber: targetOrder.tableNumber,
        markPaidImmediately: false,
        journalSeqStart: ws.journalEntries.length + 1,
      });

      const newJournals = createSaleJournalEntries({
        tenantId: ws.tenant.id,
        order: paidOrder,
        payment,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: checkoutStock.updatedProducts,
        inventoryMovements: [...checkoutStock.newInventoryMovements, ...prev.inventoryMovements],
        orders: prev.orders.map((o) => (o.id === paidOrder.id ? paidOrder : o)),
        journalEntries: [...newJournals, ...prev.journalEntries],
      }));

      if (user) {
        void upsertOrderToFirestore(ws.tenant.id, paidOrder);
        const oldMap = new Map(ws.products.map((p) => [p.id, p.stockQty]));
        for (const p of checkoutStock.updatedProducts) {
          if (oldMap.get(p.id) !== p.stockQty) {
            void upsertProductToFirestore(ws.tenant.id, p);
          }
        }
      }

      // Trigger Cashier Auto-Print Queue
      if (ws.tenant.settings.autoPrintQrOrders) {
        setAutoPrintQueue((q) => [
          {
            id: `ap-${paidOrder.id}`,
            order: paidOrder,
            tenantName: ws.tenant.name,
            receivedAt: params.paidAt,
          },
          ...q,
        ]);
      }

      return paidOrder;
    },
    [updateWorkspaceById, upsertOrderToFirestore, upsertProductToFirestore, user, workspaces]
  );

  const dismissAutoPrint = useCallback((id: string) => {
    setAutoPrintQueue((q) => q.filter((item) => item.id !== id));
  }, []);

  const markReceiptPrinted = useCallback(
    (tenantId: string, orderId: string) => {
      updateWorkspaceById(tenantId, (prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? { ...o, isReceiptPrinted: true } : o)),
      }));
    },
    [updateWorkspaceById]
  );

  const updateKitchenStatus = useCallback(
    (tenantId: string, orderId: string, status: KitchenStatus) => {
      const targetWs = workspaces.find((w) => w.tenant.id === tenantId);
      const existingOrder = targetWs?.orders.find((o) => o.id === orderId);
      updateWorkspaceById(tenantId, (prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? { ...o, kitchenStatus: status } : o)),
      }));
      if (user && existingOrder) {
        void upsertOrderToFirestore(tenantId, { ...existingOrder, kitchenStatus: status });
      }
      void fetch(`/api/kitchen/tickets/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitchenStatus: status }),
      }).catch(() => {});
    },
    [updateWorkspaceById, upsertOrderToFirestore, user, workspaces]
  );

  const recordOperationalExpense: AppContextValue['recordOperationalExpense'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const wh = calculateWithholdingTax(params.amount, params.withholdingTaxType);
      const expense: OperationalExpense = {
        id: `exp-${Date.now()}`,
        tenantId: ws.tenant.id,
        expenseAccountId: params.expenseAccountId,
        paymentAccountId: params.paymentAccountId,
        expenseDate: params.expenseDate,
        description: params.description.trim(),
        amount: new Decimal(params.amount).toFixed(4),
        withholdingTaxType: params.withholdingTaxType,
        withholdingTaxAmount: wh.withheldAmount,
        customAttributes: params.customAttributes ?? {},
        createdAt: new Date().toISOString(),
      };

      const journal = createExpenseJournalEntry({
        tenantId: ws.tenant.id,
        expense,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });

      const expLog = makeActivityLog(
        ws.tenant.id,
        'EXPENSE_RECORD',
        `Input biaya operasional: ${expense.description} — Rp${new Decimal(expense.amount).toFixed(0)}`
      );

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        expenses: [expense, ...prev.expenses],
        journalEntries: [journal, ...prev.journalEntries],
        activityLogs: [expLog, ...(prev.activityLogs ?? [])].slice(0, 300),
      }));

      return expense;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const runMonthlyDepreciation = useCallback(() => {
    const ws = activeWorkspace;
    const today = new Date().toISOString().slice(0, 10);
    const batch = createMonthlyDepreciationBatch({
      tenantId: ws.tenant.id,
      assets: ws.fixedAssets,
      accounts: ws.accounts,
      entryDate: today,
      entrySeq: ws.journalEntries.length + 1,
    });

    if (batch.journalEntry) {
      const je = batch.journalEntry;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        fixedAssets: batch.updatedAssets,
        journalEntries: [je, ...prev.journalEntries],
      }));
    }

    return {
      count: ws.fixedAssets.filter((a) => a.status === 'ACTIVE').length,
      totalDepreciation: batch.totalDepreciation,
    };
  }, [activeWorkspace, updateWorkspaceById]);

  const reverseJournal = useCallback(
    (journalEntryId: string, reason: string) => {
      const ws = activeWorkspace;
      const original = ws.journalEntries.find((j) => j.id === journalEntryId);
      if (!original || original.status === 'REVERSED') return;

      const reversal = createReversingJournalEntry({
        original,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
        reason,
      });

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        journalEntries: [
          reversal,
          ...prev.journalEntries.map((j) =>
            j.id === journalEntryId ? { ...j, status: 'REVERSED' as const } : j
          ),
        ],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const addCustomField = useCallback(
    (field: Omit<CustomFieldDefinition, 'id' | 'tenantId'>) => {
      const ws = activeWorkspace;
      const created: CustomFieldDefinition = {
        ...field,
        id: `cf-${Date.now()}`,
        tenantId: ws.tenant.id,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        customFields: [...prev.customFields, created],
      }));
      void fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...field, tenantId: ws.tenant.id }),
      }).catch(() => {});
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const removeCustomField = useCallback(
    (fieldId: string) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        customFields: prev.customFields.filter((f) => f.id !== fieldId),
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const updateOperationalExpense: AppContextValue['updateOperationalExpense'] = useCallback(
    (expenseId, patch) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        expenses: prev.expenses.map((exp) =>
          exp.id === expenseId ? { ...exp, ...patch } : exp
        ),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const voidOperationalExpense = useCallback(
    (expenseId: string, reason: string) => {
      const ws = activeWorkspace;
      const originalJe = ws.journalEntries.find(
        (j) => j.sourceModule === 'EXPENSE' && j.sourceId === expenseId && j.status !== 'REVERSED'
      );
      const reversal = originalJe
        ? createReversingJournalEntry({
            original: originalJe,
            accounts: ws.accounts,
            entrySeq: ws.journalEntries.length + 1,
            reason: reason || 'Pembatalan biaya operasional',
          })
        : null;

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== expenseId),
        journalEntries: reversal
          ? [
              reversal,
              ...prev.journalEntries.map((j) =>
                j.id === originalJe?.id ? { ...j, status: 'REVERSED' as const } : j
              ),
            ]
          : prev.journalEntries,
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const addCategory = useCallback(
    (name: string): Category => {
      const ws = activeWorkspace;
      const created: Category = {
        id: `cat-${Date.now()}`,
        tenantId: ws.tenant.id,
        name: name.trim(),
        sortOrder: ws.categories.length + 1,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        categories: [...prev.categories, created],
        activityLogs: [
          makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan kategori "${created.name}"`),
          ...(prev.activityLogs ?? []),
        ],
      }));
      return created;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const updateCategory = useCallback(
    (categoryId: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === categoryId ? { ...c, name: clean } : c)),
        activityLogs: [
          makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Mengubah nama kategori menjadi "${clean}"`),
          ...(prev.activityLogs ?? []),
        ],
      }));
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteCategory = useCallback(
    (categoryId: string) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        const nextTaxonomy = syncFlatArraysFromItems({
          ...eff,
          productTypeItems: (eff.productTypeItems ?? []).filter((pt) => pt.categoryId !== categoryId),
          brandItems: (eff.brandItems ?? []).filter((b) => b.categoryId !== categoryId),
          sizeItems: (eff.sizeItems ?? []).filter((s) => s.categoryId !== categoryId),
          unitItems: (eff.unitItems ?? []).filter((u) => u.categoryId !== categoryId),
        });
        return {
          ...prev,
          categories: prev.categories.filter((c) => c.id !== categoryId),
          taxonomy: nextTaxonomy,
          products: prev.products.map((p) =>
            p.categoryId === categoryId ? { ...p, categoryId: null } : p
          ),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus kategori ID ${categoryId}`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const addTaxonomyValue: AppContextValue['addTaxonomyValue'] = useCallback(
    (kind, rawValue) => {
      const clean = rawValue.trim();
      if (!clean) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const effective = getEffectiveTaxonomy(prev);
        const nextValues = mergeUniqueTaxonomyValues(effective[kind], [clean]);
        return {
          ...prev,
          taxonomy: {
            ...effective,
            [kind]: nextValues,
          },
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan master ${kind} "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const removeTaxonomyValue: AppContextValue['removeTaxonomyValue'] = useCallback(
    (kind, valueToRemove) => {
      const ws = activeWorkspace;
      const needle = valueToRemove.trim().toLowerCase();
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const effective = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: {
            ...effective,
            [kind]: effective[kind].filter((v) => v.trim().toLowerCase() !== needle),
          },
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus master ${kind} "${valueToRemove}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  // Structured Hierarchical Taxonomy CRUD (Kategori -> Jenis -> Merek / Ukuran / Satuan)
  const addProductTypeItem: AppContextValue['addProductTypeItem'] = useCallback(
    (input) => {
      const clean = input.name.trim();
      if (!clean || !input.categoryId) return null;
      const ws = activeWorkspace;
      const created: TaxonomyProductType = {
        id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        categoryId: input.categoryId,
        name: clean,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        const exists = (eff.productTypeItems ?? []).some(
          (i) => i.categoryId === input.categoryId && i.name.trim().toLowerCase() === clean.toLowerCase()
        );
        if (exists) return prev;
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            productTypeItems: [created, ...(eff.productTypeItems ?? [])],
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan jenis "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
      return created;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const updateProductTypeItem: AppContextValue['updateProductTypeItem'] = useCallback(
    (id, patch) => {
      const clean = patch.name.trim();
      if (!clean || !patch.categoryId) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            productTypeItems: (eff.productTypeItems ?? []).map((item) =>
              item.id === id ? { ...item, categoryId: patch.categoryId, name: clean } : item
            ),
            brandItems: (eff.brandItems ?? []).map((b) =>
              b.productTypeId === id ? { ...b, categoryId: patch.categoryId } : b
            ),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Memperbarui jenis menjadi "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteProductTypeItem: AppContextValue['deleteProductTypeItem'] = useCallback(
    (id) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            productTypeItems: (eff.productTypeItems ?? []).filter((item) => item.id !== id),
            brandItems: (eff.brandItems ?? []).filter((b) => b.productTypeId !== id),
            sizeItems: (eff.sizeItems ?? []).filter((s) => s.productTypeId !== id),
            unitItems: (eff.unitItems ?? []).filter((u) => u.productTypeId !== id),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus jenis ID ${id}`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const addBrandItem: AppContextValue['addBrandItem'] = useCallback(
    (input) => {
      const clean = input.name.trim();
      if (!clean || !input.categoryId) return null;
      const ws = activeWorkspace;
      const created: TaxonomyBrand = {
        id: `br-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        categoryId: input.categoryId,
        productTypeId: input.productTypeId || null,
        name: clean,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        const exists = (eff.brandItems ?? []).some(
          (i) =>
            i.categoryId === input.categoryId &&
            i.productTypeId === (input.productTypeId || null) &&
            i.name.trim().toLowerCase() === clean.toLowerCase()
        );
        if (exists) return prev;
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            brandItems: [created, ...(eff.brandItems ?? [])],
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan merek "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
      return created;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const updateBrandItem: AppContextValue['updateBrandItem'] = useCallback(
    (id, patch) => {
      const clean = patch.name.trim();
      if (!clean || !patch.categoryId) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            brandItems: (eff.brandItems ?? []).map((item) =>
              item.id === id
                ? { ...item, categoryId: patch.categoryId, productTypeId: patch.productTypeId || null, name: clean }
                : item
            ),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Memperbarui merek menjadi "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteBrandItem: AppContextValue['deleteBrandItem'] = useCallback(
    (id) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            brandItems: (eff.brandItems ?? []).filter((item) => item.id !== id),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus merek ID ${id}`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const addSizeItem: AppContextValue['addSizeItem'] = useCallback(
    (input) => {
      const clean = input.label.trim();
      if (!clean) return null;
      const ws = activeWorkspace;
      const created: TaxonomySize = {
        id: `sz-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        categoryId: input.categoryId || null,
        productTypeId: input.productTypeId || null,
        label: clean,
        measurementUnit: input.measurementUnit?.trim() || inferMeasurementUnit(clean),
      };
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        const exists = (eff.sizeItems ?? []).some(
          (i) =>
            i.categoryId === (input.categoryId || null) &&
            i.productTypeId === (input.productTypeId || null) &&
            i.label.trim().toLowerCase() === clean.toLowerCase()
        );
        if (exists) return prev;
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            sizeItems: [created, ...(eff.sizeItems ?? [])],
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan ukuran/berat "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
      return created;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const updateSizeItem: AppContextValue['updateSizeItem'] = useCallback(
    (id, patch) => {
      const clean = patch.label.trim();
      if (!clean) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            sizeItems: (eff.sizeItems ?? []).map((item) =>
              item.id === id
                ? {
                    ...item,
                    categoryId: patch.categoryId || null,
                    productTypeId: patch.productTypeId || null,
                    label: clean,
                    measurementUnit: patch.measurementUnit?.trim() || inferMeasurementUnit(clean),
                  }
                : item
            ),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Memperbarui ukuran/berat menjadi "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteSizeItem: AppContextValue['deleteSizeItem'] = useCallback(
    (id) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            sizeItems: (eff.sizeItems ?? []).filter((item) => item.id !== id),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus ukuran/berat ID ${id}`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const addUnitItem: AppContextValue['addUnitItem'] = useCallback(
    (input) => {
      const clean = input.name.trim();
      if (!clean) return null;
      const ws = activeWorkspace;
      const created: TaxonomyUnit = {
        id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        categoryId: input.categoryId || null,
        productTypeId: input.productTypeId || null,
        name: clean,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        const exists = (eff.unitItems ?? []).some(
          (i) =>
            i.categoryId === (input.categoryId || null) &&
            i.productTypeId === (input.productTypeId || null) &&
            i.name.trim().toLowerCase() === clean.toLowerCase()
        );
        if (exists) return prev;
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            unitItems: [created, ...(eff.unitItems ?? [])],
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menambahkan satuan "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
      return created;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const updateUnitItem: AppContextValue['updateUnitItem'] = useCallback(
    (id, patch) => {
      const clean = patch.name.trim();
      if (!clean) return;
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            unitItems: (eff.unitItems ?? []).map((item) =>
              item.id === id
                ? {
                    ...item,
                    categoryId: patch.categoryId || null,
                    productTypeId: patch.productTypeId || null,
                    name: clean,
                  }
                : item
            ),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Memperbarui satuan menjadi "${clean}"`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteUnitItem: AppContextValue['deleteUnitItem'] = useCallback(
    (id) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const eff = getEffectiveTaxonomy(prev);
        return {
          ...prev,
          taxonomy: syncFlatArraysFromItems({
            ...eff,
            unitItems: (eff.unitItems ?? []).filter((item) => item.id !== id),
          }),
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'CATALOG_CHANGE', `Menghapus satuan ID ${id}`),
            ...(prev.activityLogs ?? []),
          ],
        };
      });
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  // Purchase Order (PO) Lifecycle & Atomic PO-to-Stock Conversion
  const createPurchaseOrder: AppContextValue['createPurchaseOrder'] = useCallback(
    (po) => {
      const ws = activeWorkspace;
      const stamped: PurchaseOrder = {
        ...po,
        tenantId: ws.tenant.id,
        createdByName: po.createdByName || session.fullName || 'Pengguna',
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        purchaseOrders: [stamped, ...(prev.purchaseOrders ?? [])],
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'PURCHASE_ORDER',
            `Membuat Purchase Order ${stamped.poNumber} ke ${stamped.supplierName} (${stamped.items.length} item · Rp${new Decimal(stamped.totalEstimatedCost).toFixed(0)})`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
      return stamped;
    },
    [activeWorkspace, makeActivityLog, session.fullName, updateWorkspaceById]
  );

  const updatePurchaseOrderStatus: AppContextValue['updatePurchaseOrderStatus'] = useCallback(
    (poId, status) => {
      const ws = activeWorkspace;
      const target = (ws.purchaseOrders ?? []).find((p) => p.id === poId);
      if (!target) return;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        purchaseOrders: (prev.purchaseOrders ?? []).map((p) =>
          p.id === poId ? { ...p, status } : p
        ),
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'PURCHASE_ORDER',
            `Mengubah status PO ${target.poNumber} menjadi ${status}`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const receivePurchaseOrderToStock: AppContextValue['receivePurchaseOrderToStock'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const po = (ws.purchaseOrders ?? []).find((p) => p.id === params.poId);
      if (!po) throw new Error('Purchase Order tidak ditemukan.');
      if (po.status === 'RECEIVED') throw new Error('Purchase Order ini sudah diterima ke stok.');

      const now = new Date().toISOString();
      const updatedProductMap = new Map(ws.products.map((p) => [p.id, { ...p }]));
      const newMovements: InventoryMovement[] = [];
      const newJournals: typeof ws.journalEntries = [];
      let totalPurchase = new Decimal(0);
      let seq = ws.journalEntries.length + 1;

      for (const item of po.items) {
        const prod = updatedProductMap.get(item.productId);
        if (!prod) continue;
        const itemUnitCost = item.unitCostEstimate ?? item.unitCost ?? '0';
        const calc = calculateRestockMovingAverage({
          currentQty: prod.stockQty,
          currentAvgCost: prod.costPriceAvg,
          addedQty: item.orderedQty,
          purchaseUnitCost: itemUnitCost,
        });
        prod.stockQty = calc.newQty;
        prod.costPriceAvg = calc.newAvgCost;
        totalPurchase = totalPurchase.plus(new Decimal(calc.totalPurchaseValue));

        newMovements.push({
          id: `mov-po-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          tenantId: ws.tenant.id,
          productId: prod.id,
          movementType: 'IN_PURCHASE',
          qtyChange: new Decimal(item.orderedQty).toFixed(4),
          unitCost: new Decimal(itemUnitCost).toFixed(4),
          referenceId: params.receiptNumber?.trim() || po.poNumber,
          notes: params.notes?.trim() || `Penerimaan barang dari ${po.poNumber}`,
          receiptImageUrl: params.receiptImageUrl || undefined,
          receiptNumber: params.receiptNumber?.trim() || po.poNumber,
          supplierName: po.supplierName,
          actorName: session.fullName || 'Pengguna',
          createdAt: now,
        });

        if (new Decimal(calc.totalPurchaseValue).gt(0)) {
          newJournals.push(
            createInventoryPurchaseJournalEntry({
              tenantId: ws.tenant.id,
              productName: `${prod.name} (${po.poNumber})`,
              addedQty: item.orderedQty,
              unit: prod.unit,
              totalPurchaseValue: calc.totalPurchaseValue,
              paymentAccountCode: params.paymentAccountCode,
              accounts: ws.accounts,
              entrySeq: seq++,
            })
          );
        }
      }

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: prev.products.map((p) => updatedProductMap.get(p.id) ?? p),
        inventoryMovements: [...newMovements, ...prev.inventoryMovements],
        journalEntries: [...newJournals, ...prev.journalEntries],
        purchaseOrders: (prev.purchaseOrders ?? []).map((p) =>
          p.id === po.id ? { ...p, status: 'RECEIVED', receivedAt: now } : p
        ),
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'PURCHASE_ORDER',
            `Penerimaan barang PO ${po.poNumber} (${po.supplierName}) · ${newMovements.length} item masuk stok · Total Rp${totalPurchase.toFixed(0)}`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));

      if (user) {
        for (const item of po.items) {
          const updatedProd = updatedProductMap.get(item.productId);
          if (updatedProd) {
            void upsertProductToFirestore(ws.tenant.id, updatedProd);
          }
        }
      }

      return {
        itemCount: newMovements.length,
        totalPurchaseValue: totalPurchase.toFixed(4),
      };
    },
    [activeWorkspace, makeActivityLog, session.fullName, updateWorkspaceById, upsertProductToFirestore, user]
  );

  const updateReceiptDesign: AppContextValue['updateReceiptDesign'] = useCallback(
    (design) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        tenant: {
          ...prev.tenant,
          settings: {
            ...prev.tenant.settings,
            receiptDesign: design,
          },
        },
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'SETTINGS_UPDATE',
            'Memperbarui desain tata letak struk thermal (Receipt Designer)'
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const applyCommonCategoryPresets: AppContextValue['applyCommonCategoryPresets'] = useCallback(
    (categoryNames) => {
      const ws = activeWorkspace;
      const existingLower = new Set(ws.categories.map((c) => c.name.trim().toLowerCase()));
      const toCreate: Category[] = [];
      let sortBase = ws.categories.length;

      for (const rawName of categoryNames) {
        const clean = rawName.trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (existingLower.has(key)) continue;
        existingLower.add(key);
        sortBase += 1;
        toCreate.push({
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}-${sortBase}`,
          tenantId: ws.tenant.id,
          name: clean,
          sortOrder: sortBase,
        });
      }

      if (toCreate.length === 0) return 0;

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        categories: [...prev.categories, ...toCreate],
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'CATALOG_CHANGE',
            `Menambahkan ${toCreate.length} kategori preset umum (${toCreate.map((c) => c.name).join(', ')})`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));

      return toCreate.length;
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const addProduct = useCallback(
    (product: Omit<Product, 'id' | 'tenantId' | 'createdAt'>): Product => {
      const ws = activeWorkspace;
      const now = new Date().toISOString();
      const created: Product = {
        ...product,
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tenantId: ws.tenant.id,
        createdAt: now,
      };

      const initialQtyDec = new Decimal(created.stockQty || '0');
      const hasInitialReceipt = Boolean(
        created.purchaseReceiptImageUrl || created.purchaseReceiptNumber || created.supplierName
      );
      const initialPurchaseMovement: InventoryMovement | null =
        hasInitialReceipt && initialQtyDec.gt(0)
          ? {
              id: `mov-in-init-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              tenantId: ws.tenant.id,
              productId: created.id,
              movementType: 'IN_PURCHASE',
              qtyChange: initialQtyDec.toFixed(4),
              unitCost: new Decimal(created.costPriceAvg || '0').toFixed(4),
              referenceId: created.purchaseReceiptNumber?.trim() || null,
              notes: 'Stok awal & bukti pembelian produk baru',
              receiptImageUrl: created.purchaseReceiptImageUrl,
              receiptNumber: created.purchaseReceiptNumber?.trim() || undefined,
              supplierName: created.supplierName?.trim() || undefined,
              actorName: session.fullName || 'Pengguna',
              createdAt: now,
            }
          : null;

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: [created, ...prev.products],
        inventoryMovements: initialPurchaseMovement
          ? [initialPurchaseMovement, ...prev.inventoryMovements]
          : prev.inventoryMovements,
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'CATALOG_CHANGE',
            `Menambahkan item baru "${created.name}" (${created.itemType})${
              created.purchaseReceiptImageUrl ? ' dengan foto bukti pembelian' : ''
            }`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
      if (user) {
        void upsertProductToFirestore(ws.tenant.id, created);
      }
      return created;
    },
    [activeWorkspace, makeActivityLog, session.fullName, updateWorkspaceById, upsertProductToFirestore, user]
  );

  const updateProduct: AppContextValue['updateProduct'] = useCallback(
    (productId, patch) => {
      const ws = activeWorkspace;
      const existing = ws.products.find((p) => p.id === productId);
      let updatedTarget: Product | null = null;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const updatedProducts = prev.products.map((p) => {
          if (p.id !== productId) return p;
          updatedTarget = { ...p, ...patch };
          return updatedTarget;
        });
        // If a raw material's average cost changed, automatically recalculate dependent menu HPP
        const touched = updatedProducts.find((p) => p.id === productId);
        const logEntry = makeActivityLog(
          ws.tenant.id,
          'CATALOG_CHANGE',
          `Memperbarui item "${patch.name ?? existing?.name ?? productId}"`
        );
        if (touched && touched.itemType === 'RAW_MATERIAL' && patch.costPriceAvg !== undefined) {
          const affectedMenuIds = new Set(
            prev.recipes
              .filter((r) => r.ingredientProductId === productId)
              .map((r) => r.menuProductId)
          );
          if (affectedMenuIds.size > 0) {
            return {
              ...prev,
              products: updatedProducts.map((p) => {
                if (!affectedMenuIds.has(p.id)) return p;
                const bom = calculateBomUnitCost(p.id, prev.recipes, updatedProducts);
                return { ...p, costPriceAvg: bom.unitCost };
              }),
              activityLogs: [logEntry, ...(prev.activityLogs ?? [])],
            };
          }
        }
        return {
          ...prev,
          products: updatedProducts,
          activityLogs: [logEntry, ...(prev.activityLogs ?? [])],
        };
      });
      if (user && existing) {
        void upsertProductToFirestore(ws.tenant.id, updatedTarget ?? { ...existing, ...patch });
      }
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById, upsertProductToFirestore, user]
  );

  const deleteProduct = useCallback(
    (productId: string) => {
      const ws = activeWorkspace;
      const existing = ws.products.find((p) => p.id === productId);
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== productId),
        recipes: prev.recipes.filter(
          (r) => r.menuProductId !== productId && r.ingredientProductId !== productId
        ),
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'CATALOG_CHANGE',
            `Menghapus item "${existing?.name ?? productId}" dari katalog`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
      if (user) {
        void deleteProductFromFirestore(ws.tenant.id, productId);
      }
    },
    [activeWorkspace, deleteProductFromFirestore, makeActivityLog, updateWorkspaceById, user]
  );

  const restockInventoryItem: AppContextValue['restockInventoryItem'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const target = ws.products.find((p) => p.id === params.productId);
      if (!target) throw new Error('Produk / bahan baku tidak ditemukan.');

      const calc = calculateRestockMovingAverage({
        currentQty: target.stockQty,
        currentAvgCost: target.costPriceAvg,
        addedQty: params.addedQty,
        purchaseUnitCost: params.unitPurchaseCost,
      });

      const cleanReceiptNo = params.receiptNumber?.trim() || undefined;
      const cleanSupplier = params.supplierName?.trim() || undefined;
      const cleanNotes = params.notes?.trim() || undefined;

      const movement: InventoryMovement = {
        id: `mov-in-${Date.now()}`,
        tenantId: ws.tenant.id,
        productId: target.id,
        movementType: 'IN_PURCHASE',
        qtyChange: new Decimal(params.addedQty).toFixed(4),
        unitCost: new Decimal(params.unitPurchaseCost).toFixed(4),
        referenceId: cleanReceiptNo ?? null,
        notes: cleanNotes,
        receiptImageUrl: params.receiptImageUrl || undefined,
        receiptNumber: cleanReceiptNo,
        supplierName: cleanSupplier,
        actorName: session.fullName || 'Pengguna',
        createdAt: new Date().toISOString(),
      };

      const journal = new Decimal(calc.totalPurchaseValue).gt(0)
        ? createInventoryPurchaseJournalEntry({
            tenantId: ws.tenant.id,
            productName: target.name,
            addedQty: params.addedQty,
            unit: target.unit,
            totalPurchaseValue: calc.totalPurchaseValue,
            paymentAccountCode: params.paymentAccountCode,
            accounts: ws.accounts,
            entrySeq: ws.journalEntries.length + 1,
          })
        : null;

      const logSummary = `Restock / Kulakan "${target.name}" +${Number(params.addedQty)} ${target.unit}${
        cleanSupplier ? ` (${cleanSupplier})` : ''
      }${cleanReceiptNo ? ` · Nota ${cleanReceiptNo}` : ''}${
        params.receiptImageUrl ? ' · Bukti Nota Terlampir' : ''
      }`;

      updateWorkspaceById(ws.tenant.id, (prev) => {
        const nextProducts = prev.products.map((p) =>
          p.id === target.id
            ? { ...p, stockQty: calc.newQty, costPriceAvg: calc.newAvgCost }
            : p
        );
        // Sync dependent BOM menu HPP automatically when raw material Moving Average changes
        const affectedMenus = new Set(
          prev.recipes
            .filter((r) => r.ingredientProductId === target.id)
            .map((r) => r.menuProductId)
        );
        const finalProducts =
          affectedMenus.size > 0
            ? nextProducts.map((p) =>
                affectedMenus.has(p.id)
                  ? { ...p, costPriceAvg: calculateBomUnitCost(p.id, prev.recipes, nextProducts).unitCost }
                  : p
              )
            : nextProducts;

        return {
          ...prev,
          products: finalProducts,
          inventoryMovements: [movement, ...prev.inventoryMovements],
          journalEntries: journal ? [journal, ...prev.journalEntries] : prev.journalEntries,
          activityLogs: [
            makeActivityLog(ws.tenant.id, 'RESTOCK_PURCHASE', logSummary),
            ...(prev.activityLogs ?? []),
          ],
        };
      });

      if (user) {
        void upsertProductToFirestore(ws.tenant.id, {
          ...target,
          stockQty: calc.newQty,
          costPriceAvg: calc.newAvgCost,
        });
      }

      return calc;
    },
    [
      activeWorkspace,
      makeActivityLog,
      session.fullName,
      updateWorkspaceById,
      upsertProductToFirestore,
      user,
    ]
  );

  const adjustInventoryStock: AppContextValue['adjustInventoryStock'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const target = ws.products.find((p) => p.id === params.productId);
      if (!target) return;

      const currentQty = new Decimal(target.stockQty || '0');
      const actualQty = Decimal.max(new Decimal(0), new Decimal(params.actualStockQty || '0'));
      const delta = actualQty.minus(currentQty);
      if (delta.isZero()) return;

      const movement: InventoryMovement = {
        id: `mov-opn-${Date.now()}`,
        tenantId: ws.tenant.id,
        productId: target.id,
        movementType: 'OPNAME_ADJ',
        qtyChange: delta.toFixed(4),
        unitCost: target.costPriceAvg,
        referenceId: null,
        reasonCode: params.reasonCode ?? (delta.gt(0) ? 'OPNAME_SURPLUS' : 'CORRECTION'),
        notes: params.notes?.trim() || undefined,
        actorName: session.fullName || 'Pengguna',
        createdAt: new Date().toISOString(),
      };

      const journal = createStockOpnameJournalEntry({
        tenantId: ws.tenant.id,
        productName: target.name,
        qtyDelta: delta.toFixed(4),
        unitCostAvg: target.costPriceAvg,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.id === target.id ? { ...p, stockQty: actualQty.toFixed(4) } : p
        ),
        inventoryMovements: [movement, ...prev.inventoryMovements],
        journalEntries: journal ? [journal, ...prev.journalEntries] : prev.journalEntries,
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'STOCK_OPNAME',
            `Stock Opname "${target.name}" (${delta.gt(0) ? '+' : ''}${Number(delta.toFixed(4))} ${target.unit})`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));

      if (user) {
        void upsertProductToFirestore(ws.tenant.id, {
          ...target,
          stockQty: actualQty.toFixed(4),
        });
      }
    },
    [
      activeWorkspace,
      makeActivityLog,
      session.fullName,
      updateWorkspaceById,
      upsertProductToFirestore,
      user,
    ]
  );

  const bulkAdjustInventoryStock: AppContextValue['bulkAdjustInventoryStock'] = useCallback(
    (params) => {
      const ws = activeWorkspace;
      const preview = computeBulkAdjustmentPreview(params.entries, ws.products);
      if (preview.changedCount === 0) {
        return {
          adjustedCount: 0,
          netValuationDelta: '0.0000',
          journalEntryNumber: null,
        };
      }

      const now = new Date().toISOString();
      const batchRefId = `OPM-BATCH-${Date.now()}`;
      const cleanBatchNotes = (params.batchNotes ?? '').trim();

      const newMovements: InventoryMovement[] = preview.changedLines.map((line, idx) => ({
        id: `mov-opn-bulk-${Date.now()}-${idx}`,
        tenantId: ws.tenant.id,
        productId: line.productId,
        movementType: 'OPNAME_ADJ',
        qtyChange: line.qtyDelta,
        unitCost: line.unitCost,
        referenceId: batchRefId,
        reasonCode: line.reasonCode,
        notes: [line.notes, cleanBatchNotes].filter(Boolean).join(' · ') || undefined,
        actorName: session.fullName || 'Pengguna',
        createdAt: now,
      }));

      const journal = createBulkStockOpnameJournalEntry({
        tenantId: ws.tenant.id,
        batchRefId,
        changedLines: preview.changedLines,
        batchNotes: cleanBatchNotes || undefined,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });

      const updatedQtyMap = new Map(preview.changedLines.map((l) => [l.productId, l.actualQty]));

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          const nextQty = updatedQtyMap.get(p.id);
          return nextQty !== undefined ? { ...p, stockQty: nextQty } : p;
        }),
        inventoryMovements: [...newMovements, ...prev.inventoryMovements],
        journalEntries: journal ? [journal, ...prev.journalEntries] : prev.journalEntries,
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'STOCK_OPNAME',
            `Bulk Stock Opname (${preview.changedCount} item${cleanBatchNotes ? ` · ${cleanBatchNotes}` : ''})`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));

      if (user) {
        for (const p of ws.products) {
          const nextQty = updatedQtyMap.get(p.id);
          if (nextQty !== undefined) {
            void upsertProductToFirestore(ws.tenant.id, { ...p, stockQty: nextQty });
          }
        }
      }

      return {
        adjustedCount: preview.changedCount,
        netValuationDelta: preview.netValuationDelta,
        journalEntryNumber: journal?.entryNumber ?? null,
      };
    },
    [
      activeWorkspace,
      makeActivityLog,
      session.fullName,
      updateWorkspaceById,
      upsertProductToFirestore,
      user,
    ]
  );

  const addStaffAccount: AppContextValue['addStaffAccount'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const cleanEmail = input.email.trim().toLowerCase();
      if (!input.fullName.trim()) {
        return { ok: false, error: 'Nama pegawai wajib diisi.' };
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { ok: false, error: 'Email pegawai tidak valid.' };
      }
      if (input.password.trim().length < 6) {
        return { ok: false, error: 'Kata sandi pegawai minimal 6 karakter.' };
      }
      if (input.permissions.length === 0) {
        return { ok: false, error: 'Pilih minimal 1 hak akses fitur untuk pegawai.' };
      }

      const duplicateCustomer = customers.some((c) => c.email.toLowerCase() === cleanEmail);
      const duplicateStaff = workspaces.some((w) =>
        (w.staffAccounts ?? []).some((s) => s.email.toLowerCase() === cleanEmail)
      );
      if (duplicateCustomer || duplicateStaff) {
        return { ok: false, error: `Email "${cleanEmail}" sudah terdaftar pada akun lain.` };
      }

      const created: StaffAccount = {
        id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        tenantId: ws.tenant.id,
        fullName: input.fullName.trim(),
        email: cleanEmail,
        password: input.password.trim(),
        phone: input.phone?.trim() || '',
        roleTitle: input.roleTitle.trim() || 'Pegawai',
        permissions: Array.from(new Set(input.permissions)),
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        staffAccounts: [created, ...(prev.staffAccounts ?? [])],
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'STAFF_MANAGE',
            `Menambahkan akun pegawai "${created.fullName}" (${created.roleTitle} · ${created.permissions.length} hak akses)`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));

      return { ok: true, staff: created };
    },
    [activeWorkspace, customers, makeActivityLog, session.fullName, updateWorkspaceById, workspaces]
  );

  const updateStaffAccount: AppContextValue['updateStaffAccount'] = useCallback(
    (staffId, patch) => {
      const ws = activeWorkspace;
      const target = (ws.staffAccounts ?? []).find((s) => s.id === staffId);
      if (!target) return;
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        staffAccounts: (prev.staffAccounts ?? []).map((s) =>
          s.id === staffId
            ? {
                ...s,
                ...patch,
                permissions: patch.permissions ? Array.from(new Set(patch.permissions)) : s.permissions,
              }
            : s
        ),
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'STAFF_MANAGE',
            `Memperbarui akun pegawai "${patch.fullName ?? target.fullName}"${
              patch.isActive === false
                ? ' (Dinonaktifkan)'
                : patch.isActive === true
                ? ' (Diaktifkan)'
                : ''
            }`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const deleteStaffAccount: AppContextValue['deleteStaffAccount'] = useCallback(
    (staffId) => {
      const ws = activeWorkspace;
      const target = (ws.staffAccounts ?? []).find((s) => s.id === staffId);
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        staffAccounts: (prev.staffAccounts ?? []).filter((s) => s.id !== staffId),
        activityLogs: [
          makeActivityLog(
            ws.tenant.id,
            'STAFF_MANAGE',
            `Menghapus akun pegawai "${target?.fullName ?? staffId}"`
          ),
          ...(prev.activityLogs ?? []),
        ],
      }));
    },
    [activeWorkspace, makeActivityLog, updateWorkspaceById]
  );

  const saveProductRecipes: AppContextValue['saveProductRecipes'] = useCallback(
    (menuProductId, items) => {
      const ws = activeWorkspace;
      const cleanItems: ProductRecipe[] = items
        .filter((i) => i.ingredientProductId && new Decimal(i.quantityRequired || '0').gt(0))
        .map((i, idx) => ({
          id: `rec-${menuProductId}-${Date.now()}-${idx}`,
          tenantId: ws.tenant.id,
          menuProductId,
          ingredientProductId: i.ingredientProductId,
          quantityRequired: new Decimal(i.quantityRequired).toFixed(4),
        }));

      const nextRecipes = [
        ...ws.recipes.filter((r) => r.menuProductId !== menuProductId),
        ...cleanItems,
      ];
      const bom = calculateBomUnitCost(menuProductId, nextRecipes, ws.products);

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        recipes: nextRecipes,
        products: prev.products.map((p) =>
          p.id === menuProductId && cleanItems.length > 0
            ? { ...p, costPriceAvg: bom.unitCost }
            : p
        ),
      }));

      return { unitCost: bom.unitCost };
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const saveRecipeTemplate: AppContextValue['saveRecipeTemplate'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const existingTemplates = deriveRecipeTemplatesFromWorkspace(ws);
      const cleanIngredients: RecipeTemplateIngredient[] = input.ingredients
        .filter((i) => i.ingredientProductId && new Decimal(i.quantityRequired || '0').gt(0))
        .map((i) => ({
          ingredientProductId: i.ingredientProductId,
          quantityRequired: new Decimal(i.quantityRequired).toFixed(4),
        }));

      const templateId = input.id || `tpl-${Date.now()}`;
      const existing = existingTemplates.find((t) => t.id === templateId);
      const template: RecipeTemplate = {
        id: templateId,
        tenantId: ws.tenant.id,
        name: input.name.trim(),
        description: input.description.trim(),
        yieldPortions: Math.max(1, input.yieldPortions || 1),
        ingredients: cleanIngredients,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };

      const metrics = calculateRecipeFormulationMetrics(
        cleanIngredients,
        ws.products,
        template.yieldPortions
      );

      updateWorkspaceById(ws.tenant.id, (prev) => {
        const prevTemplates = deriveRecipeTemplatesFromWorkspace(prev);
        const nextTemplates = existing
          ? prevTemplates.map((t) => (t.id === templateId ? template : t))
          : [template, ...prevTemplates];

        // Auto-sync any MENU_ITEM products referencing this BOM template!
        const linkedMenuIds = prev.products
          .filter((p) => p.recipeTemplateId === templateId)
          .map((p) => p.id);

        let nextRecipes = prev.recipes;
        let nextProducts = prev.products;

        if (linkedMenuIds.length > 0) {
          const linkedSet = new Set(linkedMenuIds);
          const rebuiltLines: ProductRecipe[] = [];
          for (const menuId of linkedMenuIds) {
            cleanIngredients.forEach((ing, idx) => {
              rebuiltLines.push({
                id: `rec-${menuId}-${Date.now()}-${idx}`,
                tenantId: prev.tenant.id,
                menuProductId: menuId,
                ingredientProductId: ing.ingredientProductId,
                quantityRequired: new Decimal(ing.quantityRequired)
                  .div(template.yieldPortions)
                  .toFixed(4),
              });
            });
          }
          nextRecipes = [
            ...prev.recipes.filter((r) => !linkedSet.has(r.menuProductId)),
            ...rebuiltLines,
          ];
          nextProducts = prev.products.map((p) =>
            linkedSet.has(p.id) ? { ...p, costPriceAvg: metrics.unitCost } : p
          );
        }

        return {
          ...prev,
          recipeTemplates: nextTemplates,
          recipes: nextRecipes,
          products: nextProducts,
        };
      });

      return { template, unitCost: metrics.unitCost };
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const deleteRecipeTemplate = useCallback(
    (templateId: string) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const prevTemplates = deriveRecipeTemplatesFromWorkspace(prev);
        return {
          ...prev,
          recipeTemplates: prevTemplates.filter((t) => t.id !== templateId),
          products: prev.products.map((p) =>
            p.recipeTemplateId === templateId ? { ...p, recipeTemplateId: null } : p
          ),
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const addTable = useCallback(
    (tableNumber: string): RestaurantTable => {
      const ws = activeWorkspace;
      const cleanNum = tableNumber.trim().toUpperCase();
      const tokenSuffix = cleanNum.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const created: RestaurantTable = {
        id: `tbl-${Date.now()}`,
        tenantId: ws.tenant.id,
        tableNumber: cleanNum,
        qrToken: `qr-${ws.tenant.slug.slice(0, 14)}-meja-${tokenSuffix}-${Date.now().toString(36).slice(-3)}`,
        isActive: true,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        tables: [...prev.tables, created],
      }));
      return created;
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const updateTable: AppContextValue['updateTable'] = useCallback(
    (tableId, patch) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        tables: prev.tables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const deleteTable = useCallback(
    (tableId: string) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        tables: prev.tables.filter((t) => t.id !== tableId),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const addFixedAsset: AppContextValue['addFixedAsset'] = useCallback(
    (assetInput) => {
      const ws = activeWorkspace;
      const assetAcc = ws.accounts.find((a) => a.code === '1201')!;
      const accumAcc = ws.accounts.find((a) => a.code === '1202')!;
      const deprExpAcc = ws.accounts.find((a) => a.code === '6106')!;
      const created: FixedAsset = {
        ...assetInput,
        id: `fa-${Date.now()}`,
        tenantId: ws.tenant.id,
        accumulatedDepreciation: '0.0000',
        assetAccountId: assetAcc.id,
        accumDeprAccountId: accumAcc.id,
        deprExpenseAccountId: deprExpAcc.id,
        status: 'ACTIVE',
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        fixedAssets: [created, ...prev.fixedAssets],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const updateTenantProfile: AppContextValue['updateTenantProfile'] = useCallback(
    (patch) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const { settings: settingsPatch, ...rest } = patch;
        return {
          ...prev,
          tenant: {
            ...prev.tenant,
            ...rest,
            settings: settingsPatch
              ? { ...prev.tenant.settings, ...settingsPatch }
              : prev.tenant.settings,
          },
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const toggleTenantModule = useCallback(
    (code: Tenant['activeModules'][number]) => {
      if (code === 'POS_BASIC') return; // core module always active
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const exists = prev.tenant.activeModules.includes(code);
        const nextModules = exists
          ? prev.tenant.activeModules.filter((m) => m !== code)
          : [...prev.tenant.activeModules, code];
        // Also keep owning customer record in sync if one owns this tenant
        setCustomers((prevCusts) =>
          prevCusts.map((c) =>
            c.tenantIds.includes(prev.tenant.id)
              ? applyMasterCustomerUpdate(c, { activeModules: nextModules })
              : c
          )
        );
        return {
          ...prev,
          tenant: {
            ...prev.tenant,
            activeModules: nextModules,
          },
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const hasModule = useCallback(
    (code: FeatureModule['code']) =>
      canAccessModule(
        activeWorkspace.tenant.activeModules,
        code,
        activeCustomer?.status ?? null
      ),
    [activeWorkspace.tenant.activeModules, activeCustomer?.status]
  );

  // Reset branch filter whenever switching active tenant
  useEffect(() => {
    setActiveBranchId('ALL');
  }, [activeWorkspace.tenant.id]);

  // =========================================================================
  // ALL-IN-ONE ACTIONS: Hybrid Plan, Demo Control, Kost, Agro, Multi-Branch, POS Pro
  // =========================================================================
  const hasAddOn = useCallback(
    (code: AddOnModuleCode) => {
      if (code === 'ADDON_AI_ASSISTANT' && activeWorkspace.tenant.accountScope === 'DEMO' && systemDemoConfig.allowAiInDemo) {
        return true;
      }
      return tenantHasAddOn(activeWorkspace.tenant, code);
    },
    [activeWorkspace.tenant, systemDemoConfig.allowAiInDemo]
  );

  const switchHybridPlan = useCallback(
    (planCode: SubscriptionPlanCode, customAddOns?: AddOnModuleCode[]) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const nextAddOns = customAddOns ?? (prev.tenant.activeAddOns ?? []);
        const nextLegacy = deriveLegacyModulesFromHybrid(planCode, nextAddOns);
        return enforceWorkspacePlanEntitlements({
          ...prev,
          tenant: {
            ...prev.tenant,
            subscriptionPlan: planCode,
            activeAddOns: nextAddOns,
            activeModules: nextLegacy,
          },
        });
      });
      setActiveBranchId('ALL');
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const activateAddOn = useCallback(
    (code: AddOnModuleCode) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const current = prev.tenant.activeAddOns ?? [];
        const nextAddOns = Array.from(new Set([...current, code]));
        const plan = prev.tenant.subscriptionPlan ?? 'BASIC';
        return {
          ...prev,
          tenant: {
            ...prev.tenant,
            activeAddOns: nextAddOns,
            activeModules: deriveLegacyModulesFromHybrid(plan, nextAddOns),
          },
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const deactivateAddOn = useCallback(
    (code: AddOnModuleCode) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const nextAddOns = (prev.tenant.activeAddOns ?? []).filter((a) => a !== code);
        const plan = prev.tenant.subscriptionPlan ?? 'BASIC';
        return {
          ...prev,
          tenant: {
            ...prev.tenant,
            activeAddOns: nextAddOns,
            activeModules: deriveLegacyModulesFromHybrid(plan, nextAddOns),
          },
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const updateDemoConfig: AppContextValue['updateDemoConfig'] = useCallback(
    async (next) => {
      try {
        const res = await fetch('/api/demo-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: JSON.stringify(next),
        });
        const data = (await res.json()) as { config?: SystemDemoConfig; error?: string };
        if (!res.ok || !data.config) {
          return { ok: false, error: data.error || 'Gagal menyimpan konfigurasi demo.' };
        }
        setSystemDemoConfig(data.config);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal menghubungi server.' };
      }
    },
    [session.token]
  );

  const submitDemoRequest: AppContextValue['submitDemoRequest'] = useCallback(async (input) => {
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as { request?: DemoAppointmentRequest; error?: string };
      if (!res.ok || !data.request) {
        return { ok: false, error: data.error || 'Gagal mengirim jadwal demo.' };
      }
      setDemoRequests((prev) => [data.request!, ...prev]);
      return { ok: true, request: data.request };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server.' };
    }
  }, []);

  const approveDemoRequest: AppContextValue['approveDemoRequest'] = useCallback(
    async (requestId, opts) => {
      try {
        const res = await fetch(`/api/demo-requests/${encodeURIComponent(requestId)}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: JSON.stringify(opts ?? {}),
        });
        const data = (await res.json()) as {
          request?: DemoAppointmentRequest;
          customer?: ManagedCustomerAccount;
          workspace?: TenantWorkspaceData;
          error?: string;
        };
        if (!res.ok || !data.request) {
          return { ok: false, error: data.error || 'Gagal menyetujui permintaan demo.' };
        }
        setDemoRequests((prev) => prev.map((r) => (r.id === requestId ? data.request! : r)));
        if (data.customer) {
          setCustomers((prev) => [data.customer!, ...prev.filter((c) => c.id !== data.customer!.id)]);
        }
        if (data.workspace) {
          setWorkspaces((prev) => [data.workspace!, ...prev.filter((w) => w.tenant.id !== data.workspace!.tenant.id)]);
        }
        return { ok: true, request: data.request };
      } catch {
        return { ok: false, error: 'Gagal menghubungi server.' };
      }
    },
    [session.token]
  );

  const rejectDemoRequest: AppContextValue['rejectDemoRequest'] = useCallback(
    async (requestId) => {
      try {
        const res = await fetch(`/api/demo-requests/${encodeURIComponent(requestId)}/reject`, {
          method: 'POST',
          headers: {
            ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
          },
        });
        const data = (await res.json()) as { request?: DemoAppointmentRequest; error?: string };
        if (!res.ok || !data.request) {
          return { ok: false, error: data.error || 'Gagal menolak permintaan demo.' };
        }
        setDemoRequests((prev) => prev.map((r) => (r.id === requestId ? data.request! : r)));
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal menghubungi server.' };
      }
    },
    [session.token]
  );

  const registerDemoTrialUser: AppContextValue['registerDemoTrialUser'] = useCallback(
    async (input) => {
      try {
        const res = await fetch('/api/auth/demo-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as {
          registered?: boolean;
          registrant?: {
            id: string;
            fullName: string;
            email: string;
            phone: string;
            demoExpiresAt: string;
            durationDays: number;
          };
          error?: string;
        };
        if (!res.ok || !data.registered || !data.registrant) {
          return { ok: false, error: data.error || 'Gagal mendaftarkan akun demo.' };
        }
        return { ok: true, registrant: data.registrant };
      } catch {
        return { ok: false, error: 'Gagal terhubung ke server pendaftaran demo.' };
      }
    },
    []
  );

  const enterInstantDemo: AppContextValue['enterInstantDemo'] = useCallback(
    async (vertical, options) => {
      try {
        const res = await fetch('/api/auth/demo-instant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertical,
            selectedPlan: options?.selectedPlan,
            selectedAddOns: options?.selectedAddOns,
            registrantEmail: options?.registrantEmail,
          }),
        });
        const data = (await res.json()) as {
          authenticated?: boolean;
          token?: string;
          customer?: ManagedCustomerAccount;
          workspaces?: TenantWorkspaceData[];
          error?: string;
          requiresRegistration?: boolean;
        };
        if (!res.ok || !data.authenticated || !data.customer || !data.workspaces?.length) {
          return {
            ok: false,
            error: data.error || 'Gagal membuka demo instan.',
            requiresRegistration: data.requiresRegistration,
          };
        }
        const nextSession: AppSession = {
          role: 'CUSTOMER',
          accountScope: 'DEMO',
          email: data.customer.email,
          fullName: data.customer.fullName,
          phone: data.customer.phone,
          customerId: data.customer.id,
          token: data.token,
        };
        try {
          window.sessionStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([data.customer]));
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.workspaces));
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
          window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, data.workspaces[0].tenant.id);
        } catch {
          // ignore storage quota errors
        }
        setCustomers([data.customer]);
        setWorkspaces(data.workspaces);
        setActiveTenantId(data.workspaces[0].tenant.id);
        setSession(nextSession);
        setSyncStatus('synced');
        navigate('/dashboard');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal terhubung ke server demo.' };
      }
    },
    [navigate]
  );

  const enterMagicDemo: AppContextValue['enterMagicDemo'] = useCallback(
    async (magicToken) => {
      try {
        const res = await fetch(`/api/auth/magic-demo/${encodeURIComponent(magicToken)}`);
        const data = (await res.json()) as {
          authenticated?: boolean;
          token?: string;
          customer?: ManagedCustomerAccount;
          workspaces?: TenantWorkspaceData[];
          error?: string;
        };
        if (!res.ok || !data.authenticated || !data.customer || !data.workspaces?.length) {
          return { ok: false, error: data.error || 'Link demo tidak valid atau kadaluarsa.' };
        }
        const nextSession: AppSession = {
          role: 'CUSTOMER',
          accountScope: 'DEMO',
          email: data.customer.email,
          fullName: data.customer.fullName,
          phone: data.customer.phone,
          customerId: data.customer.id,
          token: data.token,
        };
        try {
          window.sessionStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify([data.customer]));
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.workspaces));
          window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
          window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, data.workspaces[0].tenant.id);
        } catch {
          // ignore storage quota errors
        }
        setCustomers([data.customer]);
        setWorkspaces(data.workspaces);
        setActiveTenantId(data.workspaces[0].tenant.id);
        setSession(nextSession);
        setSyncStatus('synced');
        navigate('/dashboard');
        return { ok: true };
      } catch {
        return { ok: false, error: 'Gagal memverifikasi link akses demo.' };
      }
    },
    [navigate]
  );

  // --- KOST & KONTRAKAN ---
  const addBoardingRoom: AppContextValue['addBoardingRoom'] = useCallback(
    (input) => {
      const created: BoardingRoom = {
        id: `room-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        branchId: activeBranchId !== 'ALL' ? activeBranchId : activeWorkspace.branches?.[0]?.id ?? null,
        roomNumber: input.roomNumber.trim(),
        roomType: input.roomType.trim() || 'Standar AC',
        monthlyRate: new Decimal(input.monthlyRate || '0').toFixed(4),
        yearlyRate: input.yearlyRate ? new Decimal(input.yearlyRate).toFixed(4) : undefined,
        status: 'AVAILABLE',
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        boardingRooms: [...(prev.boardingRooms ?? []), created],
      }));
      return created;
    },
    [activeBranchId, activeWorkspace.branches, activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const updateBoardingRoomStatus: AppContextValue['updateBoardingRoomStatus'] = useCallback(
    (roomId, status) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        boardingRooms: (prev.boardingRooms ?? []).map((r) => (r.id === roomId ? { ...r, status } : r)),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const checkInBoardingTenant: AppContextValue['checkInBoardingTenant'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const room = (ws.boardingRooms ?? []).find((r) => r.id === input.roomId);
      const created: BoardingTenant = {
        id: `bten-${Date.now().toString(36)}`,
        tenantId: ws.tenant.id,
        roomId: input.roomId,
        fullName: input.fullName.trim(),
        nikKtp: input.nikKtp.trim(),
        phoneWa: input.phoneWa.trim(),
        emergencyContact: input.emergencyContact.trim(),
        checkInDate: input.checkInDate,
        depositAmount: new Decimal(input.depositAmount || '0').toFixed(4),
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      const depJe = createBoardingDepositJournal({
        tenantId: ws.tenant.id,
        branchId: room?.branchId ?? ws.branches?.[0]?.id ?? null,
        boardingTenant: created,
        roomNumber: room?.roomNumber ?? '-',
        paymentAccountCode: input.paymentAccountCode,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
        entryDate: input.checkInDate,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        boardingRooms: (prev.boardingRooms ?? []).map((r) =>
          r.id === input.roomId ? { ...r, status: 'OCCUPIED' } : r
        ),
        boardingTenants: [created, ...(prev.boardingTenants ?? [])],
        journalEntries: depJe ? [depJe, ...prev.journalEntries] : prev.journalEntries,
      }));
      return created;
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const createBoardingInvoice: AppContextValue['createBoardingInvoice'] = useCallback(
    (input) => {
      const calc = calculateBoardingInvoice({
        rentAmount: input.rentAmount,
        utilityFee: input.utilityFee,
        lateFee: input.lateFee,
      });
      const created: BoardingInvoice = {
        id: `binv-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        branchId: activeBranchId !== 'ALL' ? activeBranchId : activeWorkspace.branches?.[0]?.id ?? null,
        roomId: input.roomId,
        boardingTenantId: input.boardingTenantId,
        periodMonth: input.periodMonth,
        rentAmount: new Decimal(input.rentAmount || '0').toFixed(4),
        utilityFee: new Decimal(input.utilityFee || '0').toFixed(4),
        lateFee: new Decimal(input.lateFee || '0').toFixed(4),
        totalAmount: calc.totalAmount,
        pph42Amount: calc.pph42Amount,
        paymentStatus: 'UNPAID',
        paidAt: null,
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        boardingInvoices: [created, ...(prev.boardingInvoices ?? [])],
      }));
      return created;
    },
    [activeBranchId, activeWorkspace.branches, activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const payBoardingInvoice: AppContextValue['payBoardingInvoice'] = useCallback(
    (invoiceId, paymentAccountCode) => {
      const ws = activeWorkspace;
      const inv = (ws.boardingInvoices ?? []).find((i) => i.id === invoiceId);
      if (!inv || inv.paymentStatus === 'PAID') return;
      const bt = (ws.boardingTenants ?? []).find((t) => t.id === inv.boardingTenantId);
      const room = (ws.boardingRooms ?? []).find((r) => r.id === inv.roomId);
      const je = createBoardingRentPaymentJournal({
        tenantId: ws.tenant.id,
        branchId: inv.branchId ?? ws.branches?.[0]?.id ?? null,
        invoice: inv,
        tenantName: bt?.fullName ?? 'Penghuni',
        roomNumber: room?.roomNumber ?? '-',
        paymentAccountCode,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      const paidAt = new Date().toISOString();
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        boardingInvoices: (prev.boardingInvoices ?? []).map((i) =>
          i.id === invoiceId ? { ...i, paymentStatus: 'PAID', paidAt } : i
        ),
        journalEntries: [je, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  // --- PETERNAKAN & PERTANIAN ---
  const createAgroBatch: AppContextValue['createAgroBatch'] = useCallback(
    (input) => {
      const created: AgroBatch = {
        id: `agro-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        branchId: activeBranchId !== 'ALL' ? activeBranchId : activeWorkspace.branches?.[0]?.id ?? null,
        name: input.name.trim(),
        agroType: input.agroType,
        startDate: input.startDate,
        initialQty: new Decimal(input.initialQty || '0').toFixed(4),
        mortalityQty: '0.0000',
        unit: input.unit.trim() || (input.agroType === 'TERNAK' ? 'ekor' : 'hektar'),
        status: 'ACTIVE',
        accumulatedCost: '0.0000',
        notes: input.notes?.trim() || undefined,
        usages: [],
        harvests: [],
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        agroBatches: [created, ...(prev.agroBatches ?? [])],
      }));
      return created;
    },
    [activeBranchId, activeWorkspace.branches, activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const updateAgroMortality: AppContextValue['updateAgroMortality'] = useCallback(
    (batchId, mortalityQty) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        agroBatches: (prev.agroBatches ?? []).map((b) =>
          b.id === batchId ? { ...b, mortalityQty: new Decimal(mortalityQty || '0').toFixed(4) } : b
        ),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const addAgroBatchUsage: AppContextValue['addAgroBatchUsage'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const batch = (ws.agroBatches ?? []).find((b) => b.id === input.batchId);
      if (!batch) throw new Error('Batch Agro tidak ditemukan.');
      const res = recordAgroBatchUsage({
        tenantId: ws.tenant.id,
        branchId: batch.branchId ?? ws.branches?.[0]?.id ?? null,
        batch,
        usageCategory: input.usageCategory,
        productId: input.productId,
        description: input.description,
        qtyUsed: input.qtyUsed,
        unit: input.unit,
        unitCost: input.unitCost,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        agroBatches: (prev.agroBatches ?? []).map((b) => (b.id === batch.id ? res.updatedBatch : b)),
        products: input.productId
          ? prev.products.map((p) =>
              p.id === input.productId
                ? {
                    ...p,
                    stockQty: Decimal.max(
                      new Decimal(0),
                      new Decimal(p.stockQty || '0').minus(new Decimal(input.qtyUsed || '0'))
                    ).toFixed(4),
                  }
                : p
            )
          : prev.products,
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const harvestAgroBatch: AppContextValue['harvestAgroBatch'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const batch = (ws.agroBatches ?? []).find((b) => b.id === input.batchId);
      const targetProd = ws.products.find((p) => p.id === input.targetProductId);
      if (!batch || !targetProd) throw new Error('Batch atau produk hasil panen tidak ditemukan.');
      const res = recordAgroHarvest({
        tenantId: ws.tenant.id,
        branchId: batch.branchId ?? ws.branches?.[0]?.id ?? null,
        batch,
        targetProduct: targetProd,
        netHarvestQty: input.netHarvestQty,
        unit: input.unit,
        harvestDate: input.harvestDate,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        agroBatches: (prev.agroBatches ?? []).map((b) => (b.id === batch.id ? res.updatedBatch : b)),
        products: prev.products.map((p) => (p.id === targetProd.id ? res.updatedProduct : p)),
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
      return { unitHpp: res.harvest.unitHppComputed };
    },
    [activeWorkspace, updateWorkspaceById]
  );

  // --- MULTI-BRANCH, 3-STEP TRANSFER, SUPPLIER PO & BLIND OPNAME ---
  const addBranch: AppContextValue['addBranch'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const existingBranches = ws.branches ?? [];
      if (existingBranches.length >= 1 && !tenantHasAddOn(ws.tenant, 'ADDON_EXTRA_BRANCH')) {
        return existingBranches[0];
      }
      const created: Branch = {
        id: `br-${Date.now().toString(36)}`,
        tenantId: ws.tenant.id,
        code: input.code.trim().toUpperCase() || `CAB-${existingBranches.length + 1}`,
        name: input.name.trim(),
        branchType: input.branchType,
        address: input.address.trim(),
        phone: input.phone.trim(),
        nitku22: input.nitku22?.trim() || ws.tenant.nitku22,
        isDefault: existingBranches.length === 0,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const nextBranches = [...(prev.branches ?? []), created];
        const nextBranchStocks = ensureBranchStocksForTenant({
          tenantId: prev.tenant.id,
          branches: nextBranches,
          products: prev.products,
          existingStocks: prev.branchStocks ?? [],
        });
        return {
          ...prev,
          branches: nextBranches,
          branchStocks: nextBranchStocks,
        };
      });
      return created;
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const createStockTransfer: AppContextValue['createStockTransfer'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const now = new Date().toISOString();
      const seq = (ws.stockTransfers?.length ?? 0) + 1;
      const created: StockTransfer = {
        id: `trf-${Date.now().toString(36)}`,
        tenantId: ws.tenant.id,
        transferNumber: `TRF-${now.slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`,
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        status: 'REQUESTED',
        requestedBy: session.fullName || 'Pemilik Usaha',
        notes: input.notes?.trim() || undefined,
        items: input.items.map((it, idx) => {
          const prod = ws.products.find((p) => p.id === it.productId);
          return {
            id: `trfi-${Date.now()}-${idx + 1}`,
            productId: it.productId,
            productNameSnapshot: prod?.name ?? 'Produk',
            unit: prod?.unit ?? 'pcs',
            requestedQty: new Decimal(it.requestedQty || '0').toFixed(4),
            shippedQty: '0.0000',
            receivedQty: '0.0000',
            damagedQty: '0.0000',
            unitCostAtShip: prod?.costPriceAvg ?? '0.0000',
          };
        }),
        createdAt: now,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        stockTransfers: [created, ...(prev.stockTransfers ?? [])],
      }));
      return created;
    },
    [activeWorkspace, session.fullName, updateWorkspaceById]
  );

  const shipStockTransferById: AppContextValue['shipStockTransferById'] = useCallback(
    (transferId) => {
      const ws = activeWorkspace;
      const trf = (ws.stockTransfers ?? []).find((t) => t.id === transferId);
      if (!trf) throw new Error('Data transfer tidak ditemukan.');
      const branches = ws.branches ?? [];
      const srcName = branches.find((b) => b.id === trf.sourceBranchId)?.name ?? 'Cabang Sumber';
      const dstName = branches.find((b) => b.id === trf.destinationBranchId)?.name ?? 'Cabang Tujuan';
      const ensuredStocks = ensureBranchStocksForTenant({
        tenantId: ws.tenant.id,
        branches,
        products: ws.products,
        existingStocks: ws.branchStocks ?? [],
      });
      const res = shipStockTransfer({
        tenantId: ws.tenant.id,
        transfer: trf,
        sourceBranchName: srcName,
        destinationBranchName: dstName,
        branchStocks: ensuredStocks,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        stockTransfers: (prev.stockTransfers ?? []).map((t) =>
          t.id === transferId ? res.updatedTransfer : t
        ),
        branchStocks: res.updatedBranchStocks,
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const receiveStockTransferById: AppContextValue['receiveStockTransferById'] = useCallback(
    (transferId, receivedQuantities) => {
      const ws = activeWorkspace;
      const trf = (ws.stockTransfers ?? []).find((t) => t.id === transferId);
      if (!trf) throw new Error('Data transfer tidak ditemukan.');
      const branches = ws.branches ?? [];
      const dstName = branches.find((b) => b.id === trf.destinationBranchId)?.name ?? 'Cabang Tujuan';
      const res = receiveStockTransfer({
        tenantId: ws.tenant.id,
        transfer: trf,
        destinationBranchName: dstName,
        receivedQuantities,
        branchStocks: ws.branchStocks ?? [],
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        stockTransfers: (prev.stockTransfers ?? []).map((t) =>
          t.id === transferId ? res.updatedTransfer : t
        ),
        branchStocks: res.updatedBranchStocks,
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const addSupplier: AppContextValue['addSupplier'] = useCallback(
    (input) => {
      const created: Supplier = {
        id: `sup-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        name: input.name.trim(),
        phone: input.phone.trim(),
        address: input.address.trim(),
        defaultTermDays: Math.max(0, input.defaultTermDays),
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        suppliers: [created, ...(prev.suppliers ?? [])],
      }));
      return created;
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const receivePoWithLandedCost: AppContextValue['receivePoWithLandedCost'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const po = (ws.purchaseOrders ?? []).find((p) => p.id === input.poId);
      if (!po) throw new Error('Purchase Order tidak ditemukan.');
      const ensured = ensureBranchStocksForTenant({
        tenantId: ws.tenant.id,
        branches: ws.branches ?? [],
        products: ws.products,
        existingStocks: ws.branchStocks ?? [],
      });
      const res = receivePurchaseOrderWithLandedCost({
        tenantId: ws.tenant.id,
        po,
        branchId: input.branchId,
        landedCostShipping: input.landedCostShipping,
        paymentType: input.paymentType,
        paymentAccountCode: input.paymentAccountCode,
        branchStocks: ensured,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        purchaseOrders: (prev.purchaseOrders ?? []).map((p) =>
          p.id === po.id ? res.updatedPo : p
        ),
        branchStocks: res.updatedBranchStocks,
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const paySupplierDebt: AppContextValue['paySupplierDebt'] = useCallback(
    (poId, payAmount, paymentAccountCode, notes) => {
      const ws = activeWorkspace;
      const po = (ws.purchaseOrders ?? []).find((p) => p.id === poId);
      if (!po) throw new Error('PO hutang supplier tidak ditemukan.');
      const res = recordSupplierDebtPayment({
        tenantId: ws.tenant.id,
        po,
        payAmount,
        paymentAccountCode,
        notes,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        purchaseOrders: (prev.purchaseOrders ?? []).map((p) =>
          p.id === poId ? res.updatedPo : p
        ),
        journalEntries: [res.journalEntry, ...prev.journalEntries],
      }));
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const createBlindOpnameSession: AppContextValue['createBlindOpnameSession'] = useCallback(
    (branchId, isBlindCount) => {
      const ws = activeWorkspace;
      const now = new Date().toISOString();
      const ensured = ensureBranchStocksForTenant({
        tenantId: ws.tenant.id,
        branches: ws.branches ?? [],
        products: ws.products,
        existingStocks: ws.branchStocks ?? [],
      });
      const branchItems = ensured.filter((bs) => bs.branchId === branchId);
      const seq = (ws.stockOpnameSessions?.length ?? 0) + 1;
      const created: StockOpnameSession = {
        id: `opn-${Date.now().toString(36)}`,
        tenantId: ws.tenant.id,
        branchId,
        sessionNumber: `SO-${now.slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`,
        isBlindCount,
        status: 'IN_PROGRESS',
        createdBy: session.fullName || 'Petugas SO',
        totalVarianceValue: '0.0000',
        items: branchItems.map((bs, idx) => {
          const prod = ws.products.find((p) => p.id === bs.productId);
          return {
            id: `opni-${Date.now()}-${idx + 1}`,
            productId: bs.productId,
            productNameSnapshot: prod?.name ?? bs.productId,
            barcodeQr: prod?.barcodeQr,
            unit: prod?.unit ?? 'pcs',
            systemQtySnapshot: bs.stockQty,
            physicalQty: isBlindCount ? '0.0000' : bs.stockQty,
            varianceQty: '0.0000',
            unitCostSnapshot: bs.movingAvgCost,
            varianceValue: '0.0000',
          };
        }),
        createdAt: now,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        branchStocks: ensured,
        stockOpnameSessions: [created, ...(prev.stockOpnameSessions ?? [])],
      }));
      return created;
    },
    [activeWorkspace, session.fullName, updateWorkspaceById]
  );

  const updateOpnamePhysicalQty: AppContextValue['updateOpnamePhysicalQty'] = useCallback(
    (sessionId, productId, physicalQty) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        stockOpnameSessions: (prev.stockOpnameSessions ?? []).map((sess) => {
          if (sess.id !== sessionId) return sess;
          return {
            ...sess,
            items: sess.items.map((it) => {
              if (it.productId !== productId) return it;
              const phys = new Decimal(physicalQty || '0');
              const sys = new Decimal(it.systemQtySnapshot || '0');
              const diff = phys.minus(sys);
              const val = diff.times(new Decimal(it.unitCostSnapshot || '0'));
              return {
                ...it,
                physicalQty: phys.toFixed(4),
                varianceQty: diff.toFixed(4),
                varianceValue: val.toFixed(4),
              };
            }),
          };
        }),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const approveOpnameSessionById: AppContextValue['approveOpnameSessionById'] = useCallback(
    (sessionId) => {
      const ws = activeWorkspace;
      const target = (ws.stockOpnameSessions ?? []).find((s) => s.id === sessionId);
      if (!target) throw new Error('Sesi Stock Opname tidak ditemukan.');
      const branchName =
        (ws.branches ?? []).find((b) => b.id === target.branchId)?.name ?? 'Cabang Utama';
      const res = approveStockOpnameSession({
        tenantId: ws.tenant.id,
        session: target,
        branchName,
        approvedBy: session.fullName || 'Pemilik Usaha',
        branchStocks: ws.branchStocks ?? [],
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        stockOpnameSessions: (prev.stockOpnameSessions ?? []).map((s) =>
          s.id === sessionId ? res.updatedSession : s
        ),
        branchStocks: res.updatedBranchStocks,
        journalEntries: res.journalEntry
          ? [res.journalEntry, ...prev.journalEntries]
          : prev.journalEntries,
      }));
    },
    [activeWorkspace, session.fullName, updateWorkspaceById]
  );

  // --- ADVANCED POS: SHIFT, OPEN/SPLIT BILL, MOVE/MERGE TABLE, VOID AUDIT, PROMO, PRICETIER, CRM ---
  const openCashierShift: AppContextValue['openCashierShift'] = useCallback(
    (openingCash) => {
      const ws = activeWorkspace;
      const branchId =
        activeBranchId !== 'ALL' ? activeBranchId : ws.branches?.[0]?.id ?? 'default-branch';
      const created: CashierShift = {
        id: `shift-${Date.now().toString(36)}`,
        tenantId: ws.tenant.id,
        branchId,
        cashierName: session.fullName || 'Kasir',
        cashierEmail: session.email || 'kasir@toko.id',
        openedAt: new Date().toISOString(),
        openingCash: new Decimal(openingCash || '0').toFixed(4),
        expectedCash: new Decimal(openingCash || '0').toFixed(4),
        status: 'OPEN',
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        cashierShifts: [created, ...(prev.cashierShifts ?? [])],
      }));
      return created;
    },
    [activeBranchId, activeWorkspace, session.email, session.fullName, updateWorkspaceById]
  );

  const closeActiveCashierShift: AppContextValue['closeActiveCashierShift'] = useCallback(
    (actualClosingCash) => {
      const ws = activeWorkspace;
      const openShift = (ws.cashierShifts ?? []).find((s) => s.status === 'OPEN');
      if (!openShift) throw new Error('Tidak ada shift kasir yang sedang dibuka.');
      const cashSalesSinceOpen = ws.orders
        .filter(
          (o) =>
            o.paymentStatus === 'PAID' &&
            o.payment?.paymentMethod === 'CASH' &&
            new Date(o.createdAt).getTime() >= new Date(openShift.openedAt).getTime()
        )
        .reduce((sum, o) => sum.plus(new Decimal(o.grandTotal)), new Decimal(0));
      const shiftWithExpected: CashierShift = {
        ...openShift,
        expectedCash: new Decimal(openShift.openingCash).plus(cashSalesSinceOpen).toFixed(4),
      };
      const res = closeCashierShift({
        tenantId: ws.tenant.id,
        shift: shiftWithExpected,
        actualClosingCash,
        accounts: ws.accounts,
        entrySeq: ws.journalEntries.length + 1,
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        cashierShifts: (prev.cashierShifts ?? []).map((s) =>
          s.id === openShift.id ? res.closedShift : s
        ),
        journalEntries: res.journalEntry
          ? [res.journalEntry, ...prev.journalEntries]
          : prev.journalEntries,
        auditLogs: res.auditLog ? [res.auditLog, ...(prev.auditLogs ?? [])] : prev.auditLogs ?? [],
      }));
      return { variance: res.closedShift.cashVariance ?? '0.0000' };
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const holdOpenBill: AppContextValue['holdOpenBill'] = useCallback(
    (input) => {
      const ws = activeWorkspace;
      const now = new Date().toISOString();
      const result = processOrderCheckout({
        tenant: ws.tenant,
        products: ws.products,
        recipes: ws.recipes,
        accounts: ws.accounts,
        cart: input.cart,
        orderSource: 'POS_CASHIER',
        paymentMethod: 'CASH',
        customerName: input.customerName || 'Tamu Meja',
        tableId: input.tableId ?? null,
        tableNumber: input.tableNumber,
        discountAmount: input.discountAmount ?? '0',
        journalSeqStart: ws.journalEntries.length + 1,
      });
      const openOrder: Order = {
        ...result.order,
        id: `open-${Date.now().toString(36)}`,
        branchId: activeBranchId !== 'ALL' ? activeBranchId : ws.branches?.[0]?.id ?? null,
        orderMode: input.orderMode ?? 'DINE_IN',
        customerPhoneWa: input.customerPhoneWa,
        isOpenBill: true,
        paymentStatus: 'UNPAID',
        payment: undefined,
        createdAt: now,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        orders: [openOrder, ...prev.orders],
      }));
      return openOrder;
    },
    [activeBranchId, activeWorkspace, updateWorkspaceById]
  );

  const settleOpenBill: AppContextValue['settleOpenBill'] = useCallback(
    (orderId, paymentMethod) => {
      const ws = activeWorkspace;
      const openOrd = ws.orders.find(
        (o) => o.id === orderId && (o.isOpenBill || o.paymentStatus === 'UNPAID')
      );
      if (!openOrd) return null;
      const result = processOrderCheckout({
        tenant: ws.tenant,
        products: ws.products,
        recipes: ws.recipes,
        accounts: ws.accounts,
        cart: openOrd.items.map((it) => ({
          productId: it.productId,
          qty: Number(it.qty),
          notes: it.notes,
        })),
        orderSource: openOrd.orderSource,
        paymentMethod,
        customerName: openOrd.customerName,
        tableId: openOrd.tableId ?? null,
        tableNumber: openOrd.tableNumber,
        discountAmount: openOrd.discountAmount,
        journalSeqStart: ws.journalEntries.length + 1,
      });
      const settled: Order = {
        ...result.order,
        id: openOrd.id,
        orderNumber: openOrd.orderNumber,
        branchId: openOrd.branchId,
        orderMode: openOrd.orderMode,
        parentOrderId: openOrd.parentOrderId,
        customerPhoneWa: openOrd.customerPhoneWa,
        isOpenBill: false,
        cashierEmail: session.email,
      };
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        products: result.updatedProducts,
        orders: prev.orders.map((o) => (o.id === openOrd.id ? settled : o)),
        journalEntries: [...result.newJournalEntries, ...prev.journalEntries],
      }));
      return settled;
    },
    [activeWorkspace, session.email, updateWorkspaceById]
  );

  const splitOpenBill: AppContextValue['splitOpenBill'] = useCallback(
    (orderId, mode, splitValue) => {
      const ws = activeWorkspace;
      const orig = ws.orders.find(
        (o) => o.id === orderId && (o.isOpenBill || o.paymentStatus === 'UNPAID')
      );
      if (!orig) return [];

      const now = new Date().toISOString();
      let createdParts: Order[] = [];

      if (mode === 'EQUAL') {
        const parts = Math.max(2, Math.min(8, Number(splitValue) || 2));
        const subEach = new Decimal(orig.subtotal).div(parts).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        const taxEach = new Decimal(orig.taxAmount).div(parts).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        const svcEach = new Decimal(orig.serviceCharge).div(parts).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        const grandEach = subEach.plus(taxEach).plus(svcEach);
        createdParts = Array.from({ length: parts }, (_, idx) => ({
          ...orig,
          id: `${orig.id}-split-${idx + 1}`,
          parentOrderId: orig.id,
          orderNumber: `${orig.orderNumber}-S${idx + 1}`,
          customerName: `${orig.customerName} (Split ${idx + 1}/${parts})`,
          subtotal: subEach.toFixed(4),
          taxAmount: taxEach.toFixed(4),
          serviceCharge: svcEach.toFixed(4),
          grandTotal: grandEach.toFixed(4),
          createdAt: now,
        }));
      } else {
        const selectedIds = new Set(Array.isArray(splitValue) ? splitValue : []);
        const groupA = orig.items.filter((i) => selectedIds.has(i.id));
        const groupB = orig.items.filter((i) => !selectedIds.has(i.id));
        if (groupA.length === 0 || groupB.length === 0) return [orig];

        const buildPart = (items: Order['items'], suffix: string): Order => {
          const sub = items.reduce(
            (s, i) => s.plus(new Decimal(i.qty).times(new Decimal(i.unitPrice))),
            new Decimal(0)
          );
          const ratio = new Decimal(orig.subtotal).gt(0) ? sub.div(new Decimal(orig.subtotal)) : new Decimal(0.5);
          const tax = new Decimal(orig.taxAmount).times(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
          const svc = new Decimal(orig.serviceCharge).times(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
          return {
            ...orig,
            id: `${orig.id}-${suffix}`,
            parentOrderId: orig.id,
            orderNumber: `${orig.orderNumber}-${suffix}`,
            customerName: `${orig.customerName} (${suffix})`,
            items,
            subtotal: sub.toFixed(4),
            taxAmount: tax.toFixed(4),
            serviceCharge: svc.toFixed(4),
            grandTotal: sub.plus(tax).plus(svc).toFixed(4),
            createdAt: now,
          };
        };
        createdParts = [buildPart(groupA, 'A'), buildPart(groupB, 'B')];
      }

      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        orders: [...createdParts, ...prev.orders.filter((o) => o.id !== orig.id)],
      }));
      return createdParts;
    },
    [activeWorkspace, updateWorkspaceById]
  );

  const moveOrMergeTable: AppContextValue['moveOrMergeTable'] = useCallback(
    (orderId, targetTableId, targetTableNumber, mergeWithOrderId) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => {
        const src = prev.orders.find((o) => o.id === orderId);
        if (!src) return prev;
        if (mergeWithOrderId) {
          const dst = prev.orders.find((o) => o.id === mergeWithOrderId);
          if (!dst) return prev;
          const mergedItems = [...dst.items, ...src.items];
          const mergedSub = new Decimal(dst.subtotal).plus(new Decimal(src.subtotal));
          const mergedTax = new Decimal(dst.taxAmount).plus(new Decimal(src.taxAmount));
          const mergedSvc = new Decimal(dst.serviceCharge).plus(new Decimal(src.serviceCharge));
          const mergedOrder: Order = {
            ...dst,
            items: mergedItems,
            subtotal: mergedSub.toFixed(4),
            taxAmount: mergedTax.toFixed(4),
            serviceCharge: mergedSvc.toFixed(4),
            grandTotal: mergedSub.plus(mergedTax).plus(mergedSvc).toFixed(4),
          };
          return {
            ...prev,
            orders: prev.orders
              .filter((o) => o.id !== src.id)
              .map((o) => (o.id === dst.id ? mergedOrder : o)),
          };
        }
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === orderId
              ? { ...o, tableId: targetTableId, tableNumber: targetTableNumber }
              : o
          ),
        };
      });
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const voidOrderWithAudit: AppContextValue['voidOrderWithAudit'] = useCallback(
    (orderId, reason) => {
      const ws = activeWorkspace;
      const target = ws.orders.find((o) => o.id === orderId);
      if (!target || target.paymentStatus === 'VOID') return;
      const now = new Date().toISOString();
      const audit: AuditLog = {
        id: `aud-void-${Date.now()}`,
        tenantId: ws.tenant.id,
        branchId: target.branchId ?? ws.branches?.[0]?.id ?? null,
        actorName: session.fullName || 'Kasir',
        actorEmail: session.email || 'kasir@toko.id',
        actionType: 'VOID_ORDER',
        referenceId: target.id,
        amount: target.grandTotal,
        reason: reason.trim() || 'Pembatalan transaksi kasir',
        createdAt: now,
      };
      // Reverse any posted sales journals tied to this order (immutable ledger rule)
      const relatedJournals = ws.journalEntries.filter(
        (je) => je.sourceId === target.id && je.status === 'POSTED'
      );
      const reversingEntries = relatedJournals.map((je, idx) =>
        createReversingJournalEntry({
          original: je,
          reason: `Void order ${target.orderNumber}: ${audit.reason}`,
          accounts: ws.accounts,
          entrySeq: ws.journalEntries.length + idx + 1,
        })
      );
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId ? { ...o, paymentStatus: 'VOID', isOpenBill: false } : o
        ),
        journalEntries: [
          ...reversingEntries,
          ...prev.journalEntries.map((je) =>
            relatedJournals.some((r) => r.id === je.id) ? { ...je, status: 'REVERSED' as const } : je
          ),
        ],
        auditLogs: [audit, ...(prev.auditLogs ?? [])],
      }));
    },
    [activeWorkspace, session.email, session.fullName, updateWorkspaceById]
  );

  const addPromotion: AppContextValue['addPromotion'] = useCallback(
    (input) => {
      const created: Promotion = {
        ...input,
        id: `promo-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        discountValue: new Decimal(input.discountValue || '0').toFixed(4),
        minPurchase: new Decimal(input.minPurchase || '0').toFixed(4),
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        promotions: [created, ...(prev.promotions ?? [])],
      }));
      return created;
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const togglePromotion: AppContextValue['togglePromotion'] = useCallback(
    (promoId) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        promotions: (prev.promotions ?? []).map((p) =>
          p.id === promoId ? { ...p, isActive: !p.isActive } : p
        ),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const addPriceTier: AppContextValue['addPriceTier'] = useCallback(
    (input) => {
      const created: PriceTier = {
        ...input,
        id: `pt-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        minQty: new Decimal(input.minQty || '1').toFixed(4),
        tierPrice: new Decimal(input.tierPrice || '0').toFixed(4),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        priceTiers: [created, ...(prev.priceTiers ?? [])],
      }));
      return created;
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const deletePriceTier: AppContextValue['deletePriceTier'] = useCallback(
    (tierId) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        priceTiers: (prev.priceTiers ?? []).filter((t) => t.id !== tierId),
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const addCrmCustomer: AppContextValue['addCrmCustomer'] = useCallback(
    (input) => {
      const normalizedName = input.name.trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedPhone = (input.phoneWa || '').replace(/\D/g, '');
      const existing = (activeWorkspace.crmCustomers ?? []).find((c) => {
        const sameName =
          normalizedName &&
          c.name.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName;
        const samePhone =
          normalizedPhone.length >= 8 &&
          (c.phoneWa || '').replace(/\D/g, '') === normalizedPhone;
        return Boolean(sameName || samePhone);
      });

      if (existing) {
        const merged: CrmCustomer = {
          ...existing,
          name: input.name.trim() || existing.name,
          phoneWa: input.phoneWa.trim() || existing.phoneWa,
          notes: input.notes?.trim() || existing.notes,
        };
        updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
          ...prev,
          crmCustomers: (prev.crmCustomers ?? []).map((c) =>
            c.id === existing.id ? merged : c
          ),
        }));
        return merged;
      }

      const created: CrmCustomer = {
        ...input,
        id: `crm-${Date.now().toString(36)}`,
        tenantId: activeWorkspace.tenant.id,
        totalSpend: new Decimal(input.totalSpend || '0').toFixed(4),
        totalSpent: new Decimal(input.totalSpent || input.totalSpend || '0').toFixed(4),
        receivableBalance: new Decimal(input.receivableBalance || '0').toFixed(4),
        createdAt: new Date().toISOString(),
      };
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        crmCustomers: [created, ...(prev.crmCustomers ?? [])],
      }));
      return created;
    },
    [activeWorkspace.crmCustomers, activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const recordCrmReceivablePayment: AppContextValue['recordCrmReceivablePayment'] = useCallback(
    (customerId, payAmount, paymentAccountCode) => {
      const ws = activeWorkspace;
      const cust = (ws.crmCustomers ?? []).find((c) => c.id === customerId);
      if (!cust) return;
      const payDec = Decimal.min(new Decimal(cust.receivableBalance || '0'), new Decimal(payAmount || '0'));
      if (payDec.lte(0)) return;
      const entryDate = new Date().toISOString().slice(0, 10);
      const je = buildJournalEntry({
        id: `je-ar-${Date.now()}`,
        tenantId: ws.tenant.id,
        branchId: activeBranchId !== 'ALL' ? activeBranchId : ws.branches?.[0]?.id ?? null,
        entryNumber: `AR-${entryDate.replace(/-/g, '')}-${String(ws.journalEntries.length + 1).padStart(4, '0')}`,
        entryDate,
        sourceModule: 'POS',
        sourceId: cust.id,
        description: `Pelunasan Piutang Pelanggan ${cust.name}`,
        accounts: ws.accounts,
        draftLines: [
          { accountCode: paymentAccountCode, debit: payDec.toFixed(4), credit: '0.0000', memo: `Penerimaan piutang ${cust.name}` },
          { accountCode: '1104', debit: '0.0000', credit: payDec.toFixed(4), memo: `Pengurangan piutang usaha ${cust.name}` },
        ],
      });
      updateWorkspaceById(ws.tenant.id, (prev) => ({
        ...prev,
        crmCustomers: (prev.crmCustomers ?? []).map((c) =>
          c.id === customerId
            ? {
                ...c,
                receivableBalance: new Decimal(c.receivableBalance || '0').minus(payDec).toFixed(4),
              }
            : c
        ),
        journalEntries: [je, ...prev.journalEntries],
      }));
    },
    [activeBranchId, activeWorkspace, updateWorkspaceById]
  );

  const updateRegionalTaxRule: AppContextValue['updateRegionalTaxRule'] = useCallback((rule) => {
    const nowIso = new Date().toISOString();
    const stampedRule: RegionalTaxRule = {
      ...rule,
      updatedAt: nowIso,
    };
    setRegionalTaxRegistry((prev) => {
      const exists = prev.some((r) => r.regionCode === stampedRule.regionCode);
      if (exists) {
        return prev.map((r) => (r.regionCode === stampedRule.regionCode ? stampedRule : r));
      }
      return [...prev, stampedRule];
    });
    // Auto-sync matching tenants immediately
    setWorkspaces((prev) =>
      prev.map((ws) => {
        const reg = ws.tenant.settings.regionalTax;
        if (!reg || reg.regionCode !== stampedRule.regionCode) return ws;
        return {
          ...ws,
          tenant: {
            ...ws.tenant,
            settings: {
              ...ws.tenant.settings,
              regionalTax: {
                ...reg,
                cityName: stampedRule.cityName,
                province: stampedRule.province,
                lastSyncedAt: nowIso,
              },
            },
          },
        };
      })
    );
  }, []);

  const syncLatestRegionalTaxes: AppContextValue['syncLatestRegionalTaxes'] = useCallback(() => {
    const nowIso = new Date().toISOString();
    const result = mergeLatestRegionalTaxRegistry(regionalTaxRegistry);
    setRegionalTaxRegistry(result.merged);
    const byCode = new Map(result.merged.map((r) => [r.regionCode, r]));
    let syncedTenants = 0;
    setWorkspaces((prev) =>
      prev.map((ws) => {
        const reg = ws.tenant.settings.regionalTax;
        if (!reg) return ws;
        const matched = byCode.get(reg.regionCode);
        if (!matched) return ws;
        syncedTenants += 1;
        return {
          ...ws,
          tenant: {
            ...ws.tenant,
            settings: {
              ...ws.tenant.settings,
              regionalTax: {
                ...reg,
                cityName: matched.cityName,
                province: matched.province,
                lastSyncedAt: nowIso,
              },
            },
          },
        };
      })
    );
    return {
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      syncedTenants,
    };
  }, [regionalTaxRegistry]);

  const updateTenantRegionalAndWa: AppContextValue['updateTenantRegionalAndWa'] = useCallback(
    (patch) => {
      updateWorkspaceById(activeWorkspace.tenant.id, (prev) => ({
        ...prev,
        tenant: {
          ...prev.tenant,
          settings: {
            ...prev.tenant.settings,
            ...(patch.businessWhatsappNumber !== undefined
              ? { businessWhatsappNumber: patch.businessWhatsappNumber.trim() }
              : {}),
            ...(patch.regionalTax !== undefined ? { regionalTax: patch.regionalTax } : {}),
          },
        },
      }));
    },
    [activeWorkspace.tenant.id, updateWorkspaceById]
  );

  const updateVerticalOps: AppContextValue['updateVerticalOps'] = useCallback(
    (updater, revenuePosting) => {
      const ws = activeWorkspace;
      updateWorkspaceById(ws.tenant.id, (prev) => {
        const nextOps = updater(prev.verticalOps ?? {});
        const nextJournals = [...prev.journalEntries];
        if (revenuePosting) {
          const grossDec = new Decimal(revenuePosting.grossAmount || '0');
          const pbjtDec = new Decimal(revenuePosting.pbjtAmount || '0');
          const otaDec = new Decimal(revenuePosting.otaCommissionAmount || '0');
          const netCashDec = Decimal.max(new Decimal(0), grossDec.plus(pbjtDec).minus(otaDec));
          if (grossDec.gt(0)) {
            const cashAcc = revenuePosting.paymentAccountCode ?? '1102';
            const lines: Array<{ accountCode: string; debit: string; credit: string; memo?: string }> = [
              {
                accountCode: cashAcc,
                debit: netCashDec.toFixed(4),
                credit: '0',
                memo: revenuePosting.description,
              },
            ];
            if (otaDec.gt(0)) {
              lines.push({
                accountCode: '6105',
                debit: otaDec.toFixed(4),
                credit: '0',
                memo: 'Potongan Komisi Channel / OTA',
              });
            }
            lines.push({
              accountCode: '4101',
              debit: '0',
              credit: grossDec.toFixed(4),
              memo: 'Pendapatan Usaha (Di luar PBJT Daerah)',
            });
            if (pbjtDec.gt(0)) {
              lines.push({
                accountCode: '2102',
                debit: '0',
                credit: pbjtDec.toFixed(4),
                memo: 'Titipan PBJT Pajak Daerah (Terpisah dari Omzet Pemilik)',
              });
            }
            const today = new Date().toISOString().slice(0, 10);
            const je = buildJournalEntry({
              id: `je-vops-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tenantId: prev.tenant.id,
              branchId: activeBranchId !== 'ALL' ? activeBranchId : prev.branches?.[0]?.id ?? null,
              entryNumber: `VOP-${today.replace(/-/g, '')}-${String(nextJournals.length + 1).padStart(4, '0')}`,
              entryDate: today,
              sourceModule: 'POS_SALE',
              sourceId: null,
              description: revenuePosting.description,
              accounts: prev.accounts,
              draftLines: lines,
            });
            nextJournals.unshift(je);
          }
        }
        return {
          ...prev,
          verticalOps: nextOps,
          journalEntries: nextJournals,
        };
      });
    },
    [activeBranchId, activeWorkspace, updateWorkspaceById]
  );

  const value: AppContextValue = {
    route,
    navigate,
    user,
    authReady,
    authLoading,
    realtimeInventoryCount: inventoryHook.items.length,
    realtimeOrderCount: ordersHook.items.length,
    signInWithGoogle,
    signInWithFirebaseEmail,
    signUpWithFirebaseEmail,
    linkActiveWorkspaceToGoogleCloud,
    signOutUser,
    workspaces,
    visibleWorkspaces,
    activeTenantId: activeWorkspace.tenant.id,
    activeWorkspace,
    switchTenant,
    findWorkspaceBySlug,
    autoPrintQueue,
    dismissAutoPrint,
    markReceiptPrinted,
    completePosCheckout,
    createPendingQrOrder,
    finalizeQrOrderViaWebhook,
    updateKitchenStatus,
    recordOperationalExpense,
    updateOperationalExpense,
    voidOperationalExpense,
    runMonthlyDepreciation,
    reverseJournal,
    addCustomField,
    removeCustomField,
    addCategory,
    updateCategory,
    deleteCategory,
    addTaxonomyValue,
    removeTaxonomyValue,
    addProductTypeItem,
    updateProductTypeItem,
    deleteProductTypeItem,
    addBrandItem,
    updateBrandItem,
    deleteBrandItem,
    addSizeItem,
    updateSizeItem,
    deleteSizeItem,
    addUnitItem,
    updateUnitItem,
    deleteUnitItem,
    applyCommonCategoryPresets,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    receivePurchaseOrderToStock,
    updateReceiptDesign,
    addProduct,
    updateProduct,
    deleteProduct,
    restockInventoryItem,
    adjustInventoryStock,
    bulkAdjustInventoryStock,
    addStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
    saveProductRecipes,
    saveRecipeTemplate,
    deleteRecipeTemplate,
    addTable,
    updateTable,
    deleteTable,
    addFixedAsset,
    updateTenantProfile,
    toggleTenantModule,
    hasModule,
    syncStatus,
    customers,
    session,
    activeCustomer,
    loginAsMaster,
    loginAsCustomer,
    impersonateCustomer,
    exitImpersonation,
    updateOwnAccountProfile,
    logoutSession,
    completeCustomerOnboarding,
    updateManagedCustomer,
    deactivateManagedCustomer,
    reactivateManagedCustomer,
    // All-In-One additions
    activeBranchId,
    setActiveBranchId,
    hasAddOn,
    switchHybridPlan,
    activateAddOn,
    deactivateAddOn,
    systemDemoConfig,
    demoRequests,
    updateDemoConfig,
    submitDemoRequest,
    approveDemoRequest,
    rejectDemoRequest,
    registerDemoTrialUser,
    enterInstantDemo,
    enterMagicDemo,
    addBoardingRoom,
    updateBoardingRoomStatus,
    checkInBoardingTenant,
    createBoardingInvoice,
    payBoardingInvoice,
    createAgroBatch,
    updateAgroMortality,
    addAgroBatchUsage,
    harvestAgroBatch,
    addBranch,
    createStockTransfer,
    shipStockTransferById,
    receiveStockTransferById,
    addSupplier,
    receivePoWithLandedCost,
    paySupplierDebt,
    createBlindOpnameSession,
    updateOpnamePhysicalQty,
    approveOpnameSessionById,
    openCashierShift,
    closeActiveCashierShift,
    holdOpenBill,
    settleOpenBill,
    splitOpenBill,
    moveOrMergeTable,
    voidOrderWithAudit,
    addPromotion,
    togglePromotion,
    addPriceTier,
    deletePriceTier,
    addCrmCustomer,
    recordCrmReceivablePayment,
    regionalTaxRegistry,
    updateRegionalTaxRule,
    syncLatestRegionalTaxes,
    updateTenantRegionalAndWa,
    updateVerticalOps,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
