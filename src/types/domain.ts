/**
 * KasirAkun UMKM — Strict Domain Types (All-in-One 6 Verticals, Multi-Branch, Hybrid Plans & Demo Control)
 * All monetary, stock, and tax figures are represented as exact decimal strings (matching PostgreSQL NUMERIC(19,4))
 * and computed strictly via Decimal.js (zero floating-point money).
 */

export type BusinessVertical =
  | 'WARUNG_SEMBAKO'
  | 'TOKO_RETAIL'
  | 'TOKO_FASHION'
  | 'TOKO_BANGUNAN'
  | 'MANUFAKTUR_KECIL'
  | 'BARBERSHOP'
  | 'SALON_KECANTIKAN'
  | 'SPA_WELLNESS'
  | 'BARBERSHOP_SALON'
  | 'KEDAI_MAKAN'
  | 'RESTORAN'
  | 'BAKERY_CATERING'
  | 'LAUNDRY'
  | 'CUCI_KENDARAAN'
  | 'RENTAL_KENDARAAN'
  | 'SEWA_LAPANGAN'
  | 'PET_SHOP'
  | 'BIMBEL_KURSUS_GYM'
  | 'HOMESTAY_VILLA'
  | 'SEWA_GARASI'
  | 'FREELANCE'
  | 'KOST_KONTRAKAN'
  | 'PETERNAKAN_PERTANIAN';

export type TaxEntityType = 'WP_OP' | 'PT_PERORANGAN' | 'CV_FIRMA' | 'PT_BIASA';
export type MemberRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'KITCHEN' | 'ACCOUNTANT';
export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type BalanceSide = 'DEBIT' | 'CREDIT';

export type ItemType = 'RETAIL_GOODS' | 'RAW_MATERIAL' | 'MENU_ITEM' | 'SERVICE_FREELANCE';
export type CustomFieldTarget = 'products' | 'orders' | 'expenses' | 'assets';
export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';

export type OrderSource = 'POS_CASHIER' | 'QR_SELF_ORDER' | 'FREELANCE_INVOICE';
export type OrderMode = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type TaxType =
  | 'NONE'
  | 'PPN_11_12'
  | 'PPN_12'
  | 'PB1_RESTO_10'
  | 'PBJT_HOTEL_10'
  | 'PBJT_SPA_HIBURAN'
  | 'PBJT_PARKIR';
export type PaymentStatus = 'UNPAID' | 'PENDING_QRIS' | 'PAID' | 'VOID';
export type KitchenStatus = 'PENDING' | 'COOKING' | 'READY' | 'SERVED';
export type PaymentMethod =
  | 'CASH'
  | 'QRIS_DYNAMIC'
  | 'EWALLET_GOPAY'
  | 'EWALLET_DANA'
  | 'EWALLET_OVO'
  | 'EWALLET_SHOPEEPAY'
  | 'VIRTUAL_ACCOUNT'
  | 'BANK_TRANSFER';
export type WithholdingTaxType = 'NONE' | 'PPH_21_TER' | 'PPH_23_2PCT' | 'PPH_4_2_SEWA_10PCT';

export type SubscriptionPlanCode = 'LITE' | 'BASIC' | 'PRO' | 'EXPERT';

export type AddOnModuleCode =
  | 'ADDON_NON_CASH_PAYMENT'
  | 'ADDON_THERMAL_RECEIPT'
  | 'ADDON_PRICING_SIMULATOR'
  | 'ADDON_PURCHASE_ORDER'
  | 'ADDON_INVENTORY_PRO'
  | 'ADDON_RESTO_QR_KDS'
  | 'ADDON_PROMO_CRM'
  | 'ADDON_ACCOUNTING_PRO'
  | 'ADDON_TAX_CORETAX'
  | 'ADDON_EXTRA_BRANCH'
  | 'ADDON_EXTRA_STAFF'
  | 'ADDON_WA_FONNTE'
  | 'ADDON_AI_ASSISTANT';

export type PostgresProviderCode = 'CURRENT_LOCAL_FIRESTORE' | 'SUPABASE_POSTGRES' | 'NEON_POSTGRES';
export type StorageProviderCode = 'CURRENT_LOCAL_FIRESTORE' | 'SUPABASE_STORAGE' | 'CLOUDFLARE_R2';

export interface InfraMigrationConfig {
  activeDbProvider: PostgresProviderCode;
  activeStorageProvider: StorageProviderCode;
  targetDbProvider: 'SUPABASE_POSTGRES' | 'NEON_POSTGRES';
  targetStorageProvider: 'SUPABASE_STORAGE' | 'CLOUDFLARE_R2';
  pgHostPreview: string;
  pgDatabaseName: string;
  pgSslRequired: boolean;
  pgPoolerEnabled: boolean;
  storageBucketName: string;
  storageEndpointPreview: string;
  storagePublicBaseUrl: string;
  maintenanceModeZeroDowntime: boolean;
  lastTestedAt?: string;
  lastTestOk?: boolean;
  lastCutoverAt?: string;
  lastAutoSyncAt?: string;
  autoSyncStatus?: 'WAITING_SERVER_ENV' | 'SYNCED_READY';
  cutoverStage: 'IDLE' | 'PREFLIGHT_VERIFIED' | 'DUAL_WRITE_READY' | 'CUTOVER_ACTIVE';
  updatedAt: string;
}

export interface FeatureModule {
  code: 'POS_BASIC' | 'QR_TABLE_KITCHEN' | 'ACCOUNTING_FULL' | 'TAX_CORETAX' | 'MULTI_BRANCH';
  name: string;
  description: string;
  monthlyPrice: string; // NUMERIC(19, 4)
  isCore: boolean;
}

export type AccountScope = 'DEMO' | 'REAL';

export interface ReceiptDesignConfig {
  showLogo: boolean;
  logoSize: 'sm' | 'md' | 'lg';
  brandingBannerUrl?: string;
  headerAlignment: 'center' | 'left';
  headerTagline: string;
  showAddress: boolean;
  showNpwp: boolean;
  showCustomerInfo: boolean;
  showCashierInfo: boolean;
  showItemNotes: boolean;
  showDiscountLine: boolean;
  showServiceChargeLine: boolean;
  showTaxLine: boolean;
  showDppDetailLine: boolean;
  dividerStyle: 'dashed' | 'dotted' | 'solid' | 'double';
  showFeedbackQr: boolean;
  feedbackQrUrl: string;
  feedbackQrLabel: string;
  showFooter: boolean;
  showPoweredBy: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  vertical: BusinessVertical;
  taxEntity: TaxEntityType;
  isPkp: boolean;
  npwp16: string;
  nitku22: string;
  address: string;
  logoUrl?: string;
  receiptFooter: string;
  cumulativeTurnoverPriorMonths: string; // Prior YTD turnover in current tax year (NUMERIC)
  serviceChargeRate: string; // e.g., '0.05' for 5% on restaurants, '0' otherwise
  activeModules: FeatureModule['code'][];
  billingCycle?: BillingCycle;
  subscriptionPlan?: SubscriptionPlanCode;
  activeAddOns?: AddOnModuleCode[];
  extraBranchCount?: number;
  extraStaffCount?: number;
  accountScope?: AccountScope; // 'DEMO' vs 'REAL' database isolation scope
  ownerAccountId?: string; // Strict per-user ownership ID
  settings: {
    autoPrintQrOrders: boolean;
    thermalPaperWidth: '58mm' | '80mm';
    qrisMdrRate: string; // Default '0.007' (0.7% standard QRIS MDR)
    receiptDesign?: ReceiptDesignConfig;
    fonnteSenderLabel?: string;
    fonnteAutoSendReceipt?: boolean;
    businessWhatsappNumber?: string; // User's own WhatsApp number for free wa.me direct sending (Lite+)
    regionalTax?: TenantRegionalTaxSettings;
  };
  createdAt: string;
}

// =========================================================================
// MULTI-BRANCH, WAREHOUSE, STOCK TRANSFER, SUPPLIER PO & BLIND OPNAME
// =========================================================================

export type BranchType = 'OUTLET' | 'CENTRAL_WAREHOUSE';

export interface Branch {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  branchType: BranchType;
  address: string;
  phone: string;
  nitku22: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface BranchStock {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  stockQty: string; // NUMERIC(19,4)
  minStockAlert: string; // NUMERIC(19,4)
  sellingPriceOverride?: string | null; // NUMERIC(19,4)
  movingAvgCost: string; // NUMERIC(19,4)
  updatedAt: string;
}

export type StockTransferStatus = 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface StockTransferItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productName?: string;
  unitSnapshot?: string;
  unit?: string;
  requestedQty: string; // NUMERIC(19,4)
  shippedQty: string; // NUMERIC(19,4)
  receivedQty: string; // NUMERIC(19,4)
  damagedQty: string; // NUMERIC(19,4)
  unitCostAtShip: string; // NUMERIC(19,4)
  unitCostSnapshot?: string;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  transferNumber: string;
  sourceBranchId: string;
  sourceBranchName?: string;
  destinationBranchId: string;
  destinationBranchName?: string;
  status: StockTransferStatus;
  notes?: string;
  requestedBy: string;
  shippedAt?: string | null;
  receivedAt?: string | null;
  items: StockTransferItem[];
  createdAt: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  address: string;
  paymentTermDays?: number;
  defaultTermDays?: number;
  notes?: string;
  isActive?: boolean;
  createdAt: string;
}

export interface SupplierDebtPayment {
  id: string;
  paidAt: string;
  amount: string; // NUMERIC(19,4)
  paymentAccountCode: '1101' | '1102';
  notes?: string;
}

export type StockOpnameSessionStatus = 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';

export interface StockOpnameItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  productName?: string;
  skuSnapshot?: string;
  sku?: string;
  barcodeSnapshot?: string;
  unitSnapshot?: string;
  unit?: string;
  systemQtySnapshot: string; // NUMERIC(19,4)
  physicalQty: string; // NUMERIC(19,4)
  varianceQty: string; // NUMERIC(19,4)
  unitCostSnapshot: string; // NUMERIC(19,4)
  varianceValue: string; // NUMERIC(19,4)
  reasonCode?: StockAdjustmentReasonCode;
}

export interface StockOpnameSession {
  id: string;
  tenantId: string;
  branchId: string;
  branchName?: string;
  sessionNumber: string;
  status: StockOpnameSessionStatus;
  isBlindCount: boolean;
  totalVarianceValue: string; // NUMERIC(19,4)
  notes?: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  items: StockOpnameItem[];
  createdAt: string;
}

// =========================================================================
// KOST & KONTRAKAN (BOARDING HOUSE)
// =========================================================================

export type BoardingRoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';

export interface BoardingRoom {
  id: string;
  tenantId: string;
  branchId?: string | null;
  roomNumber: string;
  roomType: string;
  monthlyPrice?: string; // NUMERIC(19,4)
  monthlyRate?: string; // Alias NUMERIC(19,4)
  annualPrice?: string; // NUMERIC(19,4)
  yearlyRate?: string; // Alias NUMERIC(19,4)
  status: BoardingRoomStatus;
  facilities?: string;
  notes?: string;
  createdAt?: string;
}

export interface BoardingTenant {
  id: string;
  tenantId: string;
  roomId: string | null;
  fullName: string;
  nikKtp: string;
  phoneWa: string;
  emergencyContact: string;
  checkInDate: string; // YYYY-MM-DD
  depositAmount: string; // NUMERIC(19,4) -> Liability account 2106!
  isActive: boolean;
  createdAt?: string;
}

export interface BoardingInvoice {
  id: string;
  tenantId: string;
  branchId?: string | null;
  roomId: string;
  boardingTenantId: string;
  periodMonth: string; // YYYY-MM
  rentAmount: string; // NUMERIC(19,4)
  utilityFee: string; // Listrik / Air / WiFi NUMERIC(19,4)
  lateFee: string; // Denda telat NUMERIC(19,4)
  totalAmount: string; // NUMERIC(19,4)
  pph42Amount: string; // 10% PPh Final Sewa Bangunan Pasal 4(2)
  paymentStatus: 'UNPAID' | 'PAID' | 'OVERDUE';
  paidAt?: string | null;
  createdAt: string;
}

// =========================================================================
// PETERNAKAN & PERTANIAN (AGRO BATCH WIP & HARVEST HPP)
// =========================================================================

export type AgroBatchKind = 'TERNAK' | 'TANAMAN';
export type AgroBatchStatus = 'ACTIVE' | 'HARVESTED';

export interface AgroBatchUsage {
  id: string;
  agroBatchId: string;
  productId?: string | null; // Optional link to warehouse raw material
  usageCategory: 'BIBIT' | 'PAKAN' | 'PUPUK' | 'OBAT' | 'TENAGA_KERJA';
  description: string;
  qtyUsed: string; // NUMERIC(19,4)
  unit: string;
  unitCost: string; // NUMERIC(19,4)
  totalCost: string; // NUMERIC(19,4)
  usageDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface AgroHarvest {
  id: string;
  agroBatchId: string;
  targetProductId: string;
  targetProductName: string;
  harvestDate: string; // YYYY-MM-DD
  netHarvestQty: string; // NUMERIC(19,4)
  unit: string; // Kg / Ekor / Ton
  totalBatchCost: string; // NUMERIC(19,4)
  unitHppComputed: string; // NUMERIC(19,4) = totalBatchCost / netHarvestQty
  createdAt: string;
}

export interface AgroBatch {
  id: string;
  tenantId: string;
  branchId?: string | null;
  name: string;
  batchKind?: AgroBatchKind;
  agroType?: AgroBatchKind;
  startDate: string; // YYYY-MM-DD
  initialQty: string; // NUMERIC(19,4)
  mortalityQty: string; // NUMERIC(19,4)
  unit: string; // Ekor / Bibit / Hektar
  status: AgroBatchStatus;
  accumulatedCost: string; // NUMERIC(19,4)
  notes?: string;
  usages: AgroBatchUsage[];
  harvests: AgroHarvest[];
  createdAt: string;
}

// =========================================================================
// CASHIER SHIFT, ANTI-FRAUD AUDIT LOG, PROMO, WHOLESALE TIERS & CRM
// =========================================================================

export interface CashierShift {
  id: string;
  tenantId: string;
  branchId?: string | null;
  cashierName: string;
  cashierEmail: string;
  openingCash: string; // NUMERIC(19,4)
  expectedCash: string; // NUMERIC(19,4)
  nonCashTotal?: string; // NUMERIC(19,4)
  actualClosingCash?: string | null; // NUMERIC(19,4)
  cashVariance?: string; // actualClosingCash - expectedCash
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string | null;
}

export type SensitiveAuditAction =
  | 'VOID_ORDER'
  | 'REFUND'
  | 'MANUAL_DISCOUNT'
  | 'PRICE_OVERRIDE'
  | 'SHIFT_VARIANCE';

export interface AuditLog {
  id: string;
  tenantId: string;
  branchId?: string | null;
  actorName: string;
  actorEmail: string;
  actionType: SensitiveAuditAction;
  referenceId?: string | null;
  amount: string; // NUMERIC(19,4)
  reason: string;
  createdAt: string;
}

export type PromotionType = 'PERCENT' | 'FIXED' | 'BUY_X_GET_Y' | 'COMBO';

export interface Promotion {
  id: string;
  tenantId: string;
  code?: string;
  name: string;
  promoType: PromotionType;
  discountValue: string; // % or Rp NUMERIC(19,4)
  minPurchase: string; // NUMERIC(19,4)
  buyQty?: number;
  getQty?: number;
  isActive: boolean;
  createdAt: string;
}

export interface PriceTier {
  id: string;
  tenantId: string;
  productId: string;
  minQty: string; // NUMERIC(19,4)
  tierPrice: string; // NUMERIC(19,4)
  label: string; // e.g., "Grosir >= 10 pcs" or "Harga 1 Dus (24 pcs)"
}

export interface CustomerCrm {
  id: string;
  tenantId: string;
  name: string;
  phoneWa: string;
  email?: string;
  totalSpent?: string; // NUMERIC(19,4)
  totalSpend?: string; // Alias NUMERIC(19,4)
  loyaltyPoints: number;
  receivableBalance?: string; // Buku Piutang Warung Sembako NUMERIC(19,4)
  notes?: string;
  createdAt: string;
}

export type CrmCustomer = CustomerCrm;

export interface AiUsageLog {
  id?: string;
  tenantId: string;
  monthYear: string; // YYYY-MM
  month?: string; // Alias YYYY-MM
  requestCount: number;
  tokensUsed: number;
  quotaLimit: number; // default 60
  lastUsedAt?: string;
  updatedAt: string;
}

export interface AiInsightCacheRecord {
  cacheKey: string;
  tenantId: string;
  promptHash: string;
  responseText: string;
  createdAt: string;
  expiresAt: string;
}

// =========================================================================
// MASTER ADMIN DEMO CONTROL & APPOINTMENT REQUESTS
// =========================================================================

export type GlobalDemoMode = 'PUBLIC_INSTANT' | 'APPOINTMENT_APPROVAL';
export type DemoRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SystemDemoConfig {
  globalDemoMode: GlobalDemoMode;
  demoMode?: GlobalDemoMode;
  requireRegistrationForDemo?: boolean;
  demoVisibility: Record<BusinessVertical, boolean>;
  visibleDemoVerticals?: BusinessVertical[];
  defaultDemoDurationDays: number;
  defaultDurationDays?: number;
  customEnabledPlan: SubscriptionPlanCode;
  allowedDemoPlan?: SubscriptionPlanCode;
  customEnabledAddOns: AddOnModuleCode[];
  allowAiInDemo?: boolean;
  updatedAt: string;
}

export interface DemoAppointmentRequest {
  id: string;
  fullName: string;
  businessName: string;
  phoneWa?: string;
  whatsappNumber?: string;
  email: string;
  vertical: BusinessVertical;
  branchCount: number;
  requestedModules?: string[];
  preferredDate?: string;
  preferredSchedule?: string;
  notes: string;
  status: DemoRequestStatus;
  approvedAccountId?: string | null;
  approvedTenantId?: string | null;
  approvedEmail?: string | null;
  approvedPassword?: string | null;
  demoExpiresAt?: string | null;
  magicAccessToken?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

// =========================================================================
// EXISTING CORE MODELS (BACKWARD-COMPATIBLE)
// =========================================================================

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  targetEntity: CustomFieldTarget;
  fieldKey: string;
  fieldLabel: string;
  fieldType: CustomFieldType;
  options: string[];
  isRequired: boolean;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  sku: string;
  barcodeQr: string;
  name: string;
  description: string;
  imageUrl?: string;
  productType?: string; // Jenis barang (e.g., Minyak Goreng, Gula Pasir, Beras)
  brand?: string; // Merek (e.g., Bimoli, Gulaku, Rojolele)
  sizeLabel?: string; // Ukuran / kemasan (e.g., 2 L, 1 kg, 5 kg)
  purchaseReceiptImageUrl?: string; // Foto nota bukti pembelian awal (cross-check & pajak)
  purchaseReceiptNumber?: string;
  supplierName?: string;
  itemType: ItemType;
  unit: string;
  secondaryUnit?: string; // Satuan bertingkat e.g. 'dus' / 'sak'
  secondaryUnitRatio?: string; // e.g. '24' (1 dus = 24 pcs)
  sellingPrice: string; // NUMERIC(19,4)
  costPriceAvg: string; // NUMERIC(19,4)
  stockQty: string; // NUMERIC(19,4)
  minStockAlert: string; // NUMERIC(19,4)
  isLuxuryGoods: boolean;
  isTaxExempt: boolean; // e.g., staple foods PP 49/2022
  isAvailable: boolean;
  recipeTemplateId?: string | null;
  customAttributes: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface ProductRecipe {
  id: string;
  tenantId: string;
  menuProductId: string;
  ingredientProductId: string;
  quantityRequired: string; // NUMERIC(19,4)
}

export interface RecipeTemplateIngredient {
  ingredientProductId: string;
  quantityRequired: string; // NUMERIC(19,4)
}

export interface RecipeTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  yieldPortions: number; // default 1 porsi
  ingredients: RecipeTemplateIngredient[];
  createdAt: string;
}

export type StockAdjustmentReasonCode =
  | 'BREAKAGE'
  | 'LOSS'
  | 'EXPIRED'
  | 'SHRINKAGE'
  | 'INTERNAL_USE'
  | 'OPNAME_SURPLUS'
  | 'CORRECTION';

export interface InventoryMovement {
  id: string;
  tenantId: string;
  branchId?: string | null;
  productId: string;
  movementType: 'IN_PURCHASE' | 'OUT_SALE' | 'OUT_RECIPE' | 'OPNAME_ADJ' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'AGRO_USAGE' | 'AGRO_HARVEST';
  qtyChange: string;
  unitCost: string;
  referenceId: string | null;
  reasonCode?: StockAdjustmentReasonCode;
  notes?: string;
  receiptImageUrl?: string; // Bukti foto nota pembelian untuk cross-check & pelaporan pajak
  receiptNumber?: string;
  supplierName?: string;
  actorName?: string;
  createdAt: string;
}

export interface RestaurantTable {
  id: string;
  tenantId: string;
  branchId?: string | null;
  tableNumber: string;
  qrToken: string;
  isActive: boolean;
  mergedWithTableId?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  itemNameSnapshot: string;
  qty: string;
  unitPrice: string;
  unitCogs: string;
  notes?: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  mdrFee: string;
  gatewayRefId: string | null;
  paidAt: string | null;
}

export interface Order {
  id: string;
  tenantId: string;
  branchId?: string | null;
  parentOrderId?: string | null; // For Split Bill tracking
  orderNumber: string;
  orderSource: OrderSource;
  orderMode?: OrderMode; // DINE_IN, TAKEAWAY, DELIVERY
  tableId: string | null;
  tableNumber?: string;
  customerName: string;
  customerPhoneWa?: string;
  customerId?: string | null;
  promoCodeApplied?: string | null;
  subtotal: string;
  discountAmount: string;
  serviceCharge: string;
  taxType: TaxType;
  dppNilaiLain: string; // Explicit 11/12 DPP for PMK 131/2024 compliance
  taxAmount: string;
  grandTotal: string;
  totalCogs: string;
  paymentStatus: PaymentStatus;
  kitchenStatus: KitchenStatus;
  isOpenBill?: boolean;
  isReceiptPrinted: boolean;
  cashierEmail?: string;
  stylistName?: string;
  stylistCommissionRate?: string;
  stylistCommissionAmount?: string;
  items: OrderItem[];
  payment?: Payment;
  customAttributes: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface OperationalExpense {
  id: string;
  tenantId: string;
  branchId?: string | null;
  expenseAccountId: string;
  expenseAccountCode?: string;
  paymentAccountId: string;
  paymentAccountCode?: string;
  expenseDate: string;
  description: string;
  amount: string;
  withholdingTaxType: WithholdingTaxType;
  withholdingTaxAmount: string;
  receiptImageUrl?: string;
  customAttributes: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface FixedAsset {
  id: string;
  tenantId: string;
  assetCode: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  depreciationMethod: 'STRAIGHT_LINE';
  accumulatedDepreciation: string;
  assetAccountId: string;
  accumDeprAccountId: string;
  deprExpenseAccountId: string;
  status: 'ACTIVE' | 'FULLY_DEPRECIATED' | 'DISPOSED';
}

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: BalanceSide;
  isSystemLocked: boolean;
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCodeSnapshot: string;
  accountNameSnapshot: string;
  debit: string;
  credit: string;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId?: string | null;
  entryNumber: string;
  entryDate: string;
  sourceModule:
    | 'POS'
    | 'QR_ORDER'
    | 'EXPENSE'
    | 'INVENTORY'
    | 'DEPRECIATION'
    | 'REVERSAL'
    | 'OPENING'
    | 'STOCK_TRANSFER'
    | 'PURCHASE'
    | 'OPNAME'
    | 'SHIFT'
    | 'KOST'
    | 'AGRO';
  sourceId: string | null;
  description: string;
  status: 'POSTED' | 'REVERSED';
  reversedEntryId: string | null;
  lines: JournalLine[];
  createdAt: string;
}

export interface TaxonomyProductType {
  id: string;
  categoryId: string;
  name: string;
}

export interface TaxonomyBrand {
  id: string;
  categoryId: string;
  productTypeId: string | null;
  name: string;
}

export interface TaxonomySize {
  id: string;
  categoryId: string | null;
  productTypeId: string | null;
  label: string;
  measurementUnit?: string;
}

export interface TaxonomyUnit {
  id: string;
  categoryId: string | null;
  productTypeId: string | null;
  name: string;
}

export interface CatalogTaxonomy {
  productTypes: string[];
  brands: string[];
  sizes: string[];
  units: string[];
  productTypeItems?: TaxonomyProductType[];
  brandItems?: TaxonomyBrand[];
  sizeItems?: TaxonomySize[];
  unitItems?: TaxonomyUnit[];
}

export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id?: string;
  productId: string;
  productNameSnapshot?: string;
  productName?: string;
  skuSnapshot?: string;
  sku?: string;
  unitSnapshot?: string;
  unit?: string;
  orderedQty: string; // NUMERIC(19,4)
  receivedQty?: string; // NUMERIC(19,4)
  unitCostEstimate?: string; // NUMERIC(19,4)
  unitCost?: string; // Alias NUMERIC(19,4)
  lineTotal: string; // NUMERIC(19,4)
  dailyVelocitySnapshot?: string;
  daysOfCoverSnapshot?: string;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  branchId?: string | null;
  supplierId?: string | null;
  poNumber: string;
  supplierName: string;
  supplierPhone?: string;
  orderDate?: string; // YYYY-MM-DD
  expectedDeliveryDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD for TEMPO_HUTANG
  paymentType?: 'TUNAI' | 'TEMPO_HUTANG';
  landedCostShipping?: string; // NUMERIC(19,4) ongkir menambah HPP
  amountPaid?: string; // NUMERIC(19,4)
  paidAmount?: string; // Alias NUMERIC(19,4)
  debtPayments?: SupplierDebtPayment[];
  status: PurchaseOrderStatus;
  totalEstimatedCost: string; // NUMERIC(19,4)
  notes?: string;
  receiptImageUrl?: string;
  items: PurchaseOrderItem[];
  receivedAt?: string | null;
  createdByName?: string;
  createdAt: string;
}

export type StaffPermission =
  | 'POS_CASHIER'
  | 'INVENTORY_RESTOCK'
  | 'INVENTORY_OPNAME'
  | 'CATALOG_MANAGE'
  | 'EXPENSE_INPUT'
  | 'ACCOUNTING_TAX'
  | 'TABLES_KITCHEN';

export interface StaffAccount {
  id: string;
  tenantId: string;
  branchId?: string | null;
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  roleTitle: string;
  permissions: StaffPermission[];
  isActive: boolean;
  createdAt: string;
}

export type ActivityActionType =
  | 'AUTH_LOGIN'
  | 'POS_SALE'
  | 'RESTOCK_PURCHASE'
  | 'PURCHASE_ORDER'
  | 'STOCK_OPNAME'
  | 'STOCK_TRANSFER'
  | 'CATALOG_CHANGE'
  | 'EXPENSE_RECORD'
  | 'ACCOUNTING_ACTION'
  | 'STAFF_MANAGE'
  | 'SETTINGS_UPDATE'
  | 'SHIFT_CLOSE'
  | 'KOST_BILLING'
  | 'AGRO_HARVEST';

export interface ActivityLogEntry {
  id: string;
  tenantId: string;
  branchId?: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: 'OWNER' | 'STAFF' | 'MASTER_ADMIN';
  actionType: ActivityActionType;
  summary: string;
  createdAt: string;
}

export interface TenantWorkspaceData {
  tenant: Tenant;
  accounts: Account[];
  categories: Category[];
  taxonomy?: CatalogTaxonomy;
  products: Product[];
  recipes: ProductRecipe[];
  recipeTemplates?: RecipeTemplate[];
  inventoryMovements: InventoryMovement[];
  purchaseOrders?: PurchaseOrder[];
  tables: RestaurantTable[];
  orders: Order[];
  expenses: OperationalExpense[];
  fixedAssets: FixedAsset[];
  customFields: CustomFieldDefinition[];
  journalEntries: JournalEntry[];
  staffAccounts?: StaffAccount[];
  activityLogs?: ActivityLogEntry[];
  // Multi-Branch, Warehouse, Suppliers & Blind Opname
  branches?: Branch[];
  branchStocks?: BranchStock[];
  stockTransfers?: StockTransfer[];
  suppliers?: Supplier[];
  opnameSessions?: StockOpnameSession[];
  stockOpnameSessions?: StockOpnameSession[];
  // Kost & Kontrakan
  boardingRooms?: BoardingRoom[];
  boardingTenants?: BoardingTenant[];
  boardingInvoices?: BoardingInvoice[];
  // Peternakan & Pertanian
  agroBatches?: AgroBatch[];
  agroUsages?: AgroBatchUsage[];
  agroHarvests?: AgroHarvest[];
  // Shifts, Audit Log, Promos, Price Tiers & CRM
  cashierShifts?: CashierShift[];
  auditLogs?: AuditLog[];
  promotions?: Promotion[];
  priceTiers?: PriceTier[];
  crmCustomers?: CustomerCrm[];
  aiUsageLog?: AiUsageLog;
  // Specialized UMKM Vertical Operational Modules (Laundry, Rental, Courts, Homestay, Bimbel, PetShop, Manufaktur, Bakery PO, etc.)
  verticalOps?: VerticalOperationsState;
}

export type CustomerAccountStatus =
  | 'ACTIVE'
  | 'TRIAL'
  | 'SUSPENDED'
  | 'DEACTIVATED'
  | 'PENDING_PAYMENT';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';

export interface SubscriptionInvoice {
  id: string;
  invoiceNumber: string;
  customerEmail: string;
  billingCycle: BillingCycle;
  selectedModules: FeatureModule['code'][];
  planCode?: SubscriptionPlanCode;
  selectedAddOns?: AddOnModuleCode[];
  subtotalAmount: string; // NUMERIC(19,4)
  dppNilaiLain: string; // PMK 131/2024 11/12
  ppnAmount: string; // 12% x DPP Nilai Lain = 11% effective
  grandTotal: string;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PENDING_PAYMENT' | 'VERIFIED_PAID';
  gatewayRefId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ManagedCustomerAccount {
  id: string;
  fullName: string;
  email: string;
  passwordDemo: string;
  phone: string;
  role: MemberRole;
  status: CustomerAccountStatus;
  billingCycle: BillingCycle;
  subscriptionPlan?: SubscriptionPlanCode;
  activeModules: FeatureModule['code'][];
  activeAddOns?: AddOnModuleCode[];
  monthlyRecurringRevenue: string; // NUMERIC(19,4)
  maxTenantsAllowed: number;
  tenantIds: string[];
  primaryTenantId: string;
  accountScope?: AccountScope;
  isDemoAccount?: boolean;
  demoVertical?: BusinessVertical;
  demoExpiresAt?: string | null;
  onboardingCompleted: boolean;
  lastInvoiceNumber: string;
  lastPaidAt: string;
  validUntil: string;
  adminNotes: string;
  createdAt: string;
}

export interface AppSession {
  role: 'GUEST' | 'MASTER_ADMIN' | 'CUSTOMER' | 'STAFF';
  accountScope?: AccountScope;
  email: string;
  fullName: string;
  phone?: string;
  customerId?: string;
  firebaseUid?: string;
  authProvider?: 'FIREBASE_GOOGLE' | 'FIREBASE_EMAIL' | 'SAAS_ACCOUNT';
  staffId?: string;
  staffTenantId?: string;
  staffRoleTitle?: string;
  staffPermissions?: StaffPermission[];
  impersonatingCustomerId?: string;
  impersonatingCustomerName?: string;
  token?: string;
}

// =========================================================================
// MULTI-PROVIDER PAYMENT GATEWAY (MIDTRANS, DUITKU, TRIPAY, SIMULATOR),
// CUSTOMER DISPLAY, ASSISTANCE REQUESTS, SETTLEMENTS & CUSTOM WA TEMPLATES
// =========================================================================

export type PaymentGatewayProvider =
  | 'SIMULATOR'
  | 'MIDTRANS'
  | 'DUITKU'
  | 'TRIPAY'
  | 'MANUAL_ONLY';

export type GatewayEnvironment = 'SANDBOX' | 'PRODUCTION';
export type FeeBearer = 'MERCHANT' | 'CUSTOMER';

export interface EnabledPaymentChannels {
  cash: boolean;
  qris_dynamic: boolean;
  ewallet_gopay: boolean;
  ewallet_shopeepay: boolean;
  ewallet_dana: boolean;
  ewallet_ovo: boolean;
  va_bca: boolean;
  va_mandiri: boolean;
  va_bri: boolean;
  va_bni: boolean;
  va_bsi: boolean;
  va_permata: boolean;
  manual_transfer: boolean;
}

export interface ManualBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isActive: boolean;
}

export type PaymentSetupStatus =
  | 'SIMULATOR_MODE'
  | 'MANUAL_ONLY'
  | 'ASSISTANCE_REQUESTED'
  | 'ASSISTANCE_IN_PROGRESS'
  | 'ACTIVE';

export interface TenantPaymentConfig {
  id: string;
  tenantId: string;
  provider: PaymentGatewayProvider;
  environment: GatewayEnvironment;
  merchantCode?: string | null;
  // Server-side encrypted blobs (never returned raw to frontend)
  encryptedServerKey?: string | null;
  encryptedClientKey?: string | null;
  encryptedPrivateKey?: string | null;
  // Masked previews safe for UI rendering (e.g., "Mid-server-****9a2b")
  maskedServerKey?: string | null;
  maskedClientKey?: string | null;
  maskedPrivateKey?: string | null;
  hasServerKey?: boolean;
  hasClientKey?: boolean;
  hasPrivateKey?: boolean;
  feeBearer: FeeBearer;
  qrisMdrPercent: string; // Decimal(5,4) e.g. '0.0070'
  vaFlatFee: string; // Decimal(19,4) e.g. '4250.0000'
  ewalletFeePercent: string; // Decimal(5,4) e.g. '0.0200'
  enabledChannels: EnabledPaymentChannels;
  manualBankAccounts: ManualBankAccount[];
  setupStatus: PaymentSetupStatus;
  lastTestedAt?: string | null;
  configuredByAdminId?: string | null;
  updatedAt: string;
}

export type PaymentCheckoutMode = 'COUNTER_SCREEN' | 'MOBILE_SELF_ORDER';
export type PaymentCategory =
  | 'CASH'
  | 'QRIS_DYNAMIC'
  | 'EWALLET_DIRECT'
  | 'VIRTUAL_ACCOUNT'
  | 'MANUAL_TRANSFER';

export type PaymentTxnStatus =
  | 'PENDING'
  | 'WAITING_MANUAL_VERIFY'
  | 'PAID'
  | 'EXPIRED'
  | 'FAILED'
  | 'SETTLED';

export interface PaymentTransaction {
  id: string;
  tenantId: string;
  branchId?: string | null;
  orderId?: string | null;
  boardingInvoiceId?: string | null;
  orderNumber?: string;
  customerName?: string;
  tableNumber?: string;
  provider: PaymentGatewayProvider;
  checkoutMode: PaymentCheckoutMode;
  paymentCategory: PaymentCategory;
  channelCode: string; // QRIS | GOPAY | SHOPEEPAY | DANA | OVO | VA_BCA | VA_BRI | VA_MANDIRI | VA_BNI | VA_BSI | VA_PERMATA | MANUAL_BANK
  baseAmount: string; // Decimal(19,4)
  uniqueCode?: number | null;
  customerAdminFee: string; // Decimal(19,4)
  gatewayMdrFee: string; // Decimal(19,4)
  totalPayable: string; // Decimal(19,4)
  netSettlementAmount: string; // Decimal(19,4)
  gatewayRefId?: string | null;
  qrString?: string | null;
  qrImageUrl?: string | null;
  vaNumber?: string | null;
  deeplinkUrl?: string | null;
  ovoPhoneNumber?: string | null;
  manualProofUrl?: string | null;
  status: PaymentTxnStatus;
  expiresAt?: string | null;
  paidAt?: string | null;
  rawWebhookPayload?: Record<string, unknown> | null;
  createdAt: string;
}

export interface CustomerDisplaySnapshot {
  branchId: string;
  tenantId: string;
  tenantName: string;
  branchName: string;
  state: 'IDLE' | 'WAITING_PAYMENT' | 'PAID';
  transaction?: PaymentTransaction | null;
  itemsSummary?: Array<{ name: string; qty: number; subtotal: string }>;
  updatedAt: string;
}

export type BusinessLegalityType = 'PERORANGAN_KTP' | 'PT_PERORANGAN' | 'CV_PT';
export type PaymentAssistStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface PaymentSetupAssistanceRequest {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantVertical?: BusinessVertical;
  ownerName?: string;
  requestedByUserId: string;
  preferredProvider: PaymentGatewayProvider;
  hasExistingAccount: boolean;
  settlementBankName: string;
  settlementAccountHolder: string;
  whatsappNumber: string;
  businessLegality: BusinessLegalityType;
  notes?: string | null;
  status: PaymentAssistStatus;
  adminNotes?: string | null;
  handledByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementBatch {
  id: string;
  tenantId: string;
  provider: PaymentGatewayProvider;
  settlementDate: string;
  totalGross: string; // Decimal(19,4)
  totalGatewayFee: string; // Decimal(19,4)
  totalNetReceived: string; // Decimal(19,4)
  destinationBankAccountId: string;
  journalEntryId?: string | null;
  notes?: string | null;
  createdAt: string;
}

export type WaTemplateCategory = 'PAYMENT_ASSIST' | 'DEMO' | 'GENERAL';

export interface WaMessageTemplate {
  id: string;
  code: string;
  title: string;
  category: WaTemplateCategory;
  bodyTemplate: string;
  isActive: boolean;
  updatedByAdminId?: string | null;
  updatedAt: string;
}

// =========================================================================
// INDONESIAN REGIONAL TAX (UU HKPD / PBJT PER KABUPATEN/KOTA)
// =========================================================================

export type RegionalPbjtCategory =
  | 'NONE'
  | 'FOOD_BEVERAGE'
  | 'HOSPITALITY'
  | 'ENTERTAINMENT_SPA'
  | 'PARKING'
  | 'SPORTS';

export interface RegionalTaxRule {
  regionCode: string;
  province: string;
  cityName: string;
  pbjtFoodBeverageRate: string; // Decimal e.g. '0.10'
  pbjtHospitalityRate: string; // Decimal e.g. '0.10'
  pbjtEntertainmentSpaRate: string; // Decimal e.g. '0.10' to '0.40'
  pbjtParkingRate: string; // Decimal e.g. '0.10'
  pbjtSportsRate: string; // Decimal e.g. '0.00'
  umkmExemptMonthlyThreshold: string; // NUMERIC(19,4) monthly turnover exemption for local PBJT
  perdaReference: string;
  notes: string;
  isActive: boolean;
  updatedAt: string;
}

export interface TenantRegionalTaxSettings {
  regionCode: string;
  province: string;
  cityName: string;
  applyRegionalTax: boolean; // False = UMKM exempt / ignored per regional threshold or user preference
  customRateOverride?: string | null; // Optional Decimal override e.g. '0.10'
  lastSyncedAt?: string;
}

// =========================================================================
// SPECIALIZED VERTICAL OPERATIONS (14 NEW UMKM MODULES)
// =========================================================================

export interface ManufacturingWorkOrder {
  id: string;
  code: string;
  productName: string;
  customerOrBatch: string;
  targetQty: number;
  unit: string;
  rawMaterialsUsed: Array<{ name: string; qty: number; unit: string; unitCost: string }>;
  laborCost: string; // NUMERIC(19,4)
  overheadCost: string; // NUMERIC(19,4)
  totalHpp: string; // NUMERIC(19,4)
  hppPerUnit: string; // NUMERIC(19,4)
  sellingPricePerUnit: string; // NUMERIC(19,4)
  status: 'PLANNING' | 'CUTTING_PROCESS' | 'FINISHING_QC' | 'COMPLETED';
  dueDate: string;
  createdAt: string;
}

export type LaundryOrderStatus = 'DITERIMA' | 'DICUCI' | 'SETRIKA' | 'SIAP_AMBIL' | 'SELESAI';

export interface LaundryOrder {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  serviceType: 'KILOAN' | 'SATUAN' | 'EXPRESS';
  itemSummary: string;
  weightKg: string; // NUMERIC(10,2)
  pieceCount: number;
  parfum: string;
  rackLocation: string;
  totalAmount: string; // NUMERIC(19,4)
  paidAmount: string; // NUMERIC(19,4)
  paymentStatus: 'UNPAID' | 'DP' | 'PAID';
  status: LaundryOrderStatus;
  estimatedReadyAt: string;
  notes?: string;
  createdAt: string;
}

export interface VehicleWashOrder {
  id: string;
  queueNumber: string;
  plateNumber: string;
  vehicleType: 'MOTOR' | 'MOBIL_KECIL' | 'MOBIL_BESAR_SUV';
  customerName: string;
  customerPhone: string;
  serviceName: string;
  washerName: string;
  washerCommissionRate: string; // Decimal e.g. '0.20'
  washerCommissionAmount: string; // NUMERIC(19,4)
  price: string; // NUMERIC(19,4)
  status: 'ANTRI' | 'DICUCI' | 'FINISHING' | 'SELESAI';
  paymentStatus: 'UNPAID' | 'PAID';
  createdAt: string;
}

export interface BakeryPreOrder {
  id: string;
  poCode: string;
  customerName: string;
  customerPhone: string;
  orderCategory: 'BAKERY_CAKE' | 'CATERING_BOX' | 'HAMPERS';
  itemDescription: string;
  qty: number;
  unit: string;
  deliveryDate: string;
  deliveryTime: string;
  greetingCardNote?: string;
  totalAmount: string; // NUMERIC(19,4)
  dpAmount: string; // NUMERIC(19,4)
  remainingAmount: string; // NUMERIC(19,4)
  status: 'PO_MASUK' | 'PRODUKSI' | 'SIAP_KIRIM' | 'SELESAI';
  createdAt: string;
}

export interface RentalVehicle {
  id: string;
  name: string;
  vehicleCategory: 'MOBIL' | 'MOTOR';
  plateNumber: string;
  year: number;
  dailyRate: string; // NUMERIC(19,4)
  overtimeHourlyRate: string; // NUMERIC(19,4)
  lastOdometerKm: number;
  status: 'TERSEDIA' | 'DISEWA' | 'SERVIS';
}

export interface RentalContract {
  id: string;
  contractNumber: string;
  vehicleId: string;
  vehicleName: string;
  plateNumber: string;
  renterName: string;
  renterNik: string;
  renterPhone: string;
  renterAddress: string;
  startDateTime: string;
  plannedReturnDateTime: string;
  actualReturnDateTime?: string | null;
  kmStart: number;
  kmEnd?: number | null;
  fuelStartPct: number; // 0..100
  fuelEndPct?: number | null;
  fuelPenaltyAmount: string; // NUMERIC(19,4)
  overtimeHours: number;
  overtimeChargeAmount: string; // NUMERIC(19,4)
  baseRentalAmount: string; // NUMERIC(19,4)
  depositAmount: string; // NUMERIC(19,4)
  totalFinalAmount: string; // NUMERIC(19,4)
  kycIdPhotoUrl?: string; // DataURL / URL KTP
  kycSimPhotoUrl?: string; // DataURL / URL SIM
  handoverPhotoUrl?: string; // DataURL / URL serah terima
  status: 'BOOKED' | 'ACTIVE' | 'OVERDUE' | 'RETURNED';
  notes?: string;
  createdAt: string;
}

export interface SportsCourt {
  id: string;
  name: string;
  sportType: 'BADMINTON' | 'FUTSAL' | 'PADEL';
  hourlyRate: string; // NUMERIC(19,4)
  isActive: boolean;
}

export interface CourtBooking {
  id: string;
  bookingCode: string;
  courtId: string;
  courtName: string;
  sportType: 'BADMINTON' | 'FUTSAL' | 'PADEL';
  customerName: string;
  customerPhone: string;
  bookingDate: string; // YYYY-MM-DD
  startHour: number; // e.g. 18
  durationHours: number; // e.g. 2
  rentalEquipmentNote?: string;
  equipmentFee: string; // NUMERIC(19,4)
  totalAmount: string; // NUMERIC(19,4)
  dpAmount: string; // NUMERIC(19,4)
  remainingAmount: string; // NUMERIC(19,4)
  status: 'BOOKED_DP' | 'LUNAS' | 'SELESAI' | 'BATAL';
  createdAt: string;
}

export interface PetServiceOrder {
  id: string;
  ticketCode: string;
  petName: string;
  petSpecies: 'KUCING' | 'ANJING' | 'LAINNYA';
  breed: string;
  ownerName: string;
  ownerPhone: string;
  serviceKind: 'GROOMING' | 'PENITIPAN_HOTEL';
  packageName: string;
  cageNumber?: string;
  checkInDate: string;
  checkOutDate?: string;
  nights: number;
  vaccineNote?: string;
  feedingNote?: string;
  totalAmount: string; // NUMERIC(19,4)
  status: 'TERDAFTAR' | 'PROSES' | 'SIAP_JEMPUT' | 'SELESAI';
  paymentStatus: 'UNPAID' | 'PAID';
  createdAt: string;
}

export interface AcademyMember {
  id: string;
  memberCode: string;
  fullName: string;
  parentOrContactName?: string;
  phone: string;
  programName: string; // e.g. "Bimbel SMA IPA", "Daycare Full-Day", "Gym All-Access"
  monthlyFee: string; // NUMERIC(19,4)
  dueDayOfMonth: number;
  status: 'AKTIF' | 'CUTI' | 'NONAKTIF';
  joinedAt: string;
}

export interface AcademyBillingRecord {
  id: string;
  memberId: string;
  memberName: string;
  phone: string;
  programName: string;
  periodLabel: string; // e.g. "2026-11"
  amount: string; // NUMERIC(19,4)
  dueDate: string;
  status: 'UNPAID' | 'OVERDUE' | 'PAID';
  paidAt?: string | null;
}

export interface AcademyAttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  programName: string;
  sessionDate: string;
  status: 'HADIR' | 'IZIN' | 'ALPHA';
  tutorName: string;
}

export interface TutorHonorSession {
  id: string;
  tutorName: string;
  subjectOrClass: string;
  sessionDate: string;
  sessionCount: number;
  ratePerSession: string; // NUMERIC(19,4)
  totalHonor: string; // NUMERIC(19,4)
  status: 'UNPAID' | 'PAID';
}

export interface HomestayUnit {
  id: string;
  name: string;
  unitType: 'VILLA' | 'KAMAR_HOMESTAY' | 'CABIN';
  nightlyRate: string; // NUMERIC(19,4)
  hourlySlotRate: string; // NUMERIC(19,4)
  status: 'TERSEDIA' | 'TERISI' | 'CLEANING';
}

export type OtaChannel = 'DIRECT' | 'TRAVELOKA' | 'AIRBNB' | 'TIKET_COM' | 'BOOKING_COM';

export interface HomestayBooking {
  id: string;
  bookingCode: string;
  unitId: string;
  unitName: string;
  guestName: string;
  guestPhone: string;
  bookingMode: 'PER_MALAM' | 'PER_SLOT_JAM';
  checkInDate: string;
  checkOutDate: string;
  durationCount: number; // nights or hours
  otaChannel: OtaChannel;
  otaCommissionPct: string; // Decimal e.g. '0.15'
  grossRoomRevenue: string; // NUMERIC(19,4)
  otaCommissionAmount: string; // NUMERIC(19,4)
  pbjtRate: string; // Decimal e.g. '0.10'
  pbjtTaxAmount: string; // NUMERIC(19,4) — strictly separated from owner net revenue!
  ownerNetRevenue: string; // NUMERIC(19,4)
  guestTotalPaid: string; // NUMERIC(19,4)
  status: 'BOOKED' | 'CHECK_IN' | 'CHECK_OUT' | 'CLEANING';
  createdAt: string;
}

export interface GarageSlot {
  id: string;
  slotCode: string;
  slotType: 'TERTUTUP_INDOOR' | 'KANOPI' | 'OUTDOOR';
  monthlyRate: string; // NUMERIC(19,4)
  dailyRate: string; // NUMERIC(19,4)
  status: 'KOSONG' | 'TERISI';
  tenantName?: string;
  tenantPhone?: string;
  plateNumber?: string;
  carModel?: string;
  nextDueDate?: string;
  paymentStatus?: 'LUNAS' | 'JATUH_TEMPO';
}

export interface BeautySpaAppointment {
  id: string;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  treatmentName: string;
  staffName: string; // Kapster / Stylist / Terapis
  roomOrChair: string;
  durationMinutes: number;
  scheduleTime: string;
  price: string; // NUMERIC(19,4)
  staffCommissionRate: string; // Decimal
  staffCommissionAmount: string; // NUMERIC(19,4)
  status: 'TERJADWAL' | 'BERLANGSUNG' | 'SELESAI';
  paymentStatus: 'UNPAID' | 'PAID';
}

export interface BuildingDeliveryOrder {
  id: string;
  doNumber: string;
  customerOrContractor: string;
  customerPhone: string;
  projectAddress: string;
  itemsSummary: string;
  driverName: string;
  truckPlate: string;
  totalValue: string; // NUMERIC(19,4)
  paymentTerm: 'TUNAI' | 'TEMPO_PROYEK';
  status: 'MUAT_BARANG' | 'DIKIRIM' | 'DITERIMA_PROYEK';
  createdAt: string;
}

export interface VerticalOperationsState {
  manufacturingOrders?: ManufacturingWorkOrder[];
  laundryOrders?: LaundryOrder[];
  vehicleWashOrders?: VehicleWashOrder[];
  bakeryPreOrders?: BakeryPreOrder[];
  rentalVehicles?: RentalVehicle[];
  rentalContracts?: RentalContract[];
  sportsCourts?: SportsCourt[];
  courtBookings?: CourtBooking[];
  petAppointments?: PetServiceOrder[];
  academyMembers?: AcademyMember[];
  academyInvoices?: AcademyBillingRecord[];
  academyAttendances?: AcademyAttendanceRecord[];
  tutorSessions?: TutorHonorSession[];
  homestayUnits?: HomestayUnit[];
  homestayBookings?: HomestayBooking[];
  garageSlots?: GarageSlot[];
  beautyAppointments?: BeautySpaAppointment[];
  buildingDeliveries?: BuildingDeliveryOrder[];
}


