/**
 * KasirAkun UMKM — Deterministic Multi-UMKM Seed Dataset
 * 4 complete UMKM tenants under 1 business owner:
 * 1. Restoran Sate & Soto Pak Budi (RESTORAN, PT_PERORANGAN, PB1 10%, BOM recipes, QR tables)
 * 2. Warung Sembako Berkah (WARUNG_SEMBAKO, WP_OP, Barcode scanner, Rp500M PP 20/2026 tracker)
 * 3. Kedai Kopi Nusantara (KEDAI_MAKAN, WP_OP, PB1 10%, Coffee & Nasi Goreng BOM recipes)
 * 4. Studio Desain Raka (FREELANCE, WP_OP, Pekerjaan Bebas Pasal 56 — Art. 17/NPPN & PPh 23)
 */

import type {
  Account,
  FeatureModule,
  ManagedCustomerAccount,
  Product,
  TenantWorkspaceData,
} from '../types/domain.ts';
import { DEFAULT_CHART_OF_ACCOUNTS, DEFAULT_FEATURE_MODULES } from '../../prisma/seed.ts';
import {
  buildJournalEntry,
  createExpenseJournalEntry,
} from '../lib/accounting/journal-engine.ts';
import { processOrderCheckout } from '../lib/pos/checkout-service.ts';
import { buildHierarchicalTaxonomyFromPresets } from '../lib/catalog/taxonomy-presets.ts';
import {
  createDemoAgroWorkspace,
  createDemoBarbershopWorkspace,
  createDemoKostWorkspace,
  createDemoTokoRetailWorkspace,
  DEFAULT_SYSTEM_DEMO_CONFIG,
  enrichBaseWorkspaces,
  INITIAL_DEMO_APPOINTMENTS,
} from './demoSeedsExtended.ts';
import {
  createNewVerticalDemoCustomers,
  createNewVerticalDemoWorkspaces,
} from './demoSeedsVerticals.ts';

export { DEFAULT_SYSTEM_DEMO_CONFIG, INITIAL_DEMO_APPOINTMENTS };

export const HERO_IMAGE_URL = '/src/assets/images/hero_kasirakun_pos_1795047991892.jpg';
export const MENU_IMAGES = {
  sateAyam: '/src/assets/images/menu_sate_ayam_1795047991816.jpg',
  sotoBetawi: '/src/assets/images/menu_soto_betawi_1795047991686.jpg',
  kopiSusu: '/src/assets/images/menu_kopi_susu_1795047991301.jpg',
  nasiGoreng: '/src/assets/images/menu_nasi_goreng_1795047991182.jpg',
} as const;

export const MENU_IMAGE_PRESETS = [
  { label: 'Es Kopi Susu', url: MENU_IMAGES.kopiSusu },
  { label: 'Sate Ayam Madura', url: MENU_IMAGES.sateAyam },
  { label: 'Soto Betawi', url: MENU_IMAGES.sotoBetawi },
  { label: 'Nasi Goreng', url: MENU_IMAGES.nasiGoreng },
] as const;

export const FEATURE_MODULES: FeatureModule[] = DEFAULT_FEATURE_MODULES.filter(
  (m): m is (typeof DEFAULT_FEATURE_MODULES)[number] & { code: FeatureModule['code'] } =>
    m.code !== 'ADDON_LANDING_PAGE'
).map((m) => ({
  code: m.code,
  name: m.name,
  description: m.description,
  monthlyPrice: m.monthlyPrice,
  isCore: m.isCore,
}));

function buildAccounts(tenantId: string): Account[] {
  return DEFAULT_CHART_OF_ACCOUNTS.map((a, idx) => ({
    id: `${tenantId}-acc-${idx + 1}`,
    tenantId,
    code: a.code,
    name: a.name,
    category: a.category,
    normalBalance: a.normalBalance,
    isSystemLocked: a.isSystemLocked,
  }));
}

export function createInitialWorkspaces(): TenantWorkspaceData[] {
  const now = '2026-11-18T08:30:00.000Z';

  // =========================================================================
  // 1. RESTORAN SATE & SOTO PAK BUDI (PT Perorangan, PB1 10%, BOM, QR Tables)
  // =========================================================================
  const tRestoId = 'tenant-resto-pak-budi';
  const restoAccounts = buildAccounts(tRestoId);
  const restoTenant = {
    id: tRestoId,
    name: 'Restoran Sate & Soto Pak Budi',
    slug: 'restoran-pak-budi',
    vertical: 'RESTORAN' as const,
    taxEntity: 'PT_PERORANGAN' as const,
    isPkp: false,
    npwp16: '0192837465019283',
    nitku22: '0192837465019283000001',
    address: 'Jl. Kemang Selatan No. 48, Jakarta Selatan',
    receiptFooter: 'Terima kasih telah bersantap di Sate & Soto Pak Budi.',
    cumulativeTurnoverPriorMonths: '642500000.0000',
    serviceChargeRate: '0.05',
    activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'] as FeatureModule['code'][],
    accountScope: 'DEMO' as const,
    ownerAccountId: 'cust-pak-budi',
    settings: {
      autoPrintQrOrders: true,
      thermalPaperWidth: '80mm' as const,
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-01-10T00:00:00.000Z',
  };

  const restoProducts: Product[] = [
    // Raw Materials (Ingredients)
    {
      id: 'prod-resto-raw-ayam',
      tenantId: tRestoId,
      categoryId: 'cat-resto-raw',
      sku: 'RAW-AYAM',
      barcodeQr: '899000100001',
      name: 'Ayam Fillet Dada Segar',
      description: 'Bahan baku utama sate ayam (disimpan suhu 2°C).',
      itemType: 'RAW_MATERIAL' as const,
      unit: 'kg',
      sellingPrice: '0.0000',
      costPriceAvg: '48000.0000',
      stockQty: '95.0000',
      minStockAlert: '8.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: { supplier_utama: 'PT Unggas Jaya' },
      createdAt: now,
    },
    {
      id: 'prod-resto-raw-sapi',
      tenantId: tRestoId,
      categoryId: 'cat-resto-raw',
      sku: 'RAW-SAPI',
      barcodeQr: '899000100002',
      name: 'Daging Sapi Sandung Lamur',
      description: 'Bahan baku soto betawi.',
      itemType: 'RAW_MATERIAL' as const,
      unit: 'kg',
      sellingPrice: '0.0000',
      costPriceAvg: '135000.0000',
      stockQty: '55.0000',
      minStockAlert: '5.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: { supplier_utama: 'RPH Dharma Jaya' },
      createdAt: now,
    },
    {
      id: 'prod-resto-raw-kacang',
      tenantId: tRestoId,
      categoryId: 'cat-resto-raw',
      sku: 'RAW-KCG',
      barcodeQr: '899000100003',
      name: 'Bumbu Kacang Halus & Kecap',
      description: 'Racikan bumbu sate.',
      itemType: 'RAW_MATERIAL' as const,
      unit: 'kg',
      sellingPrice: '0.0000',
      costPriceAvg: '36000.0000',
      stockQty: '45.0000',
      minStockAlert: '4.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
      createdAt: now,
    },
    // Visual Menu Items
    {
      id: 'prod-resto-sate',
      tenantId: tRestoId,
      categoryId: 'cat-resto-main',
      sku: 'MNU-001',
      barcodeQr: 'MNU001',
      name: 'Sate Ayam Madura + Lontong',
      description: '10 tusuk daging dada ayam bakar arang, bumbu kacang kental, bawang merah & jeruk limau.',
      imageUrl: MENU_IMAGES.sateAyam,
      itemType: 'MENU_ITEM' as const,
      unit: 'porsi',
      sellingPrice: '48000.0000',
      costPriceAvg: '15600.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { tingkat_pedas_default: 'Sedang' },
      createdAt: now,
    },
    {
      id: 'prod-resto-soto',
      tenantId: tRestoId,
      categoryId: 'cat-resto-main',
      sku: 'MNU-002',
      barcodeQr: 'MNU002',
      name: 'Soto Betawi Kuah Susu',
      description: 'Potongan daging sapi empuk, kuah santan-susu rempah, emping melinjo, dan acar segar.',
      imageUrl: MENU_IMAGES.sotoBetawi,
      itemType: 'MENU_ITEM' as const,
      unit: 'porsi',
      sellingPrice: '54000.0000',
      costPriceAvg: '20250.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { tingkat_pedas_default: 'Tidak Pedas' },
      createdAt: now,
    },
    {
      id: 'prod-resto-nasgor',
      tenantId: tRestoId,
      categoryId: 'cat-resto-main',
      sku: 'MNU-003',
      barcodeQr: 'MNU003',
      name: 'Nasi Goreng Kampung Spesial',
      description: 'Nasi goreng bumbu terasi rumahan dengan telur mata sapi setengah matang, acar & kerupuk udang.',
      imageUrl: MENU_IMAGES.nasiGoreng,
      itemType: 'MENU_ITEM' as const,
      unit: 'porsi',
      sellingPrice: '42000.0000',
      costPriceAvg: '13200.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { tingkat_pedas_default: 'Sedang' },
      createdAt: now,
    },
    {
      id: 'prod-resto-kopi',
      tenantId: tRestoId,
      categoryId: 'cat-resto-drink',
      sku: 'MNU-004',
      barcodeQr: 'MNU004',
      name: 'Es Kopi Susu Gula Aren',
      description: 'Espresso arabika Gayo, susu segar, dan sirup gula aren organik.',
      imageUrl: MENU_IMAGES.kopiSusu,
      itemType: 'MENU_ITEM' as const,
      unit: 'gelas',
      sellingPrice: '28000.0000',
      costPriceAvg: '8500.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
  ];

  const restoRecipes = [
    {
      id: 'rec-r1',
      tenantId: tRestoId,
      menuProductId: 'prod-resto-sate',
      ingredientProductId: 'prod-resto-raw-ayam',
      quantityRequired: '0.2500',
    },
    {
      id: 'rec-r2',
      tenantId: tRestoId,
      menuProductId: 'prod-resto-sate',
      ingredientProductId: 'prod-resto-raw-kacang',
      quantityRequired: '0.1000',
    },
    {
      id: 'rec-r3',
      tenantId: tRestoId,
      menuProductId: 'prod-resto-soto',
      ingredientProductId: 'prod-resto-raw-sapi',
      quantityRequired: '0.1500',
    },
    {
      id: 'rec-r4',
      tenantId: tRestoId,
      menuProductId: 'prod-resto-nasgor',
      ingredientProductId: 'prod-resto-raw-ayam',
      quantityRequired: '0.1200',
    },
  ];

  const restoOpeningJe = buildJournalEntry({
    id: 'je-open-resto',
    tenantId: tRestoId,
    entryNumber: 'OPN-20261101-0001',
    entryDate: '2026-11-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Neraca November 2026 — Restoran Sate & Soto Pak Budi',
    accounts: restoAccounts,
    draftLines: [
      { accountCode: '1101', debit: '12500000.0000', credit: '0', memo: 'Kas tunai kasir' },
      { accountCode: '1102', debit: '68000000.0000', credit: '0', memo: 'Saldo Bank BCA' },
      { accountCode: '1105', debit: '18500000.0000', credit: '0', memo: 'Persediaan bahan dapur awal' },
      { accountCode: '1201', debit: '72000000.0000', credit: '0', memo: 'Peralatan dapur, freezer & POS' },
      { accountCode: '1202', debit: '0', credit: '12000000.0000', memo: 'Akumulasi penyusutan awal' },
      { accountCode: '2101', debit: '0', credit: '9000000.0000', memo: 'Utang supplier bahan baku' },
      { accountCode: '3101', debit: '0', credit: '150000000.0000', memo: 'Modal disetor PT Perorangan' },
    ],
  });

  const restoSale0 = processOrderCheckout({
    tenant: restoTenant,
    products: restoProducts,
    recipes: restoRecipes,
    accounts: restoAccounts,
    cart: [
      { productId: 'prod-resto-sate', qty: 200, notes: 'Paket jamuan prasmanan' },
      { productId: 'prod-resto-soto', qty: 160, notes: 'Paket jamuan prasmanan' },
      { productId: 'prod-resto-nasgor', qty: 140 },
      { productId: 'prod-resto-kopi', qty: 220 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'BANK_TRANSFER',
    customerName: 'PT Nusantara Digital (Katering Rapat)',
    tableId: null,
    journalSeqStart: 2,
  });
  restoSale0.order.kitchenStatus = 'SERVED';

  const restoSale1 = processOrderCheckout({
    tenant: restoTenant,
    products: restoSale0.updatedProducts,
    recipes: restoRecipes,
    accounts: restoAccounts,
    cart: [
      { productId: 'prod-resto-sate', qty: 2, notes: 'Sambal pisah' },
      { productId: 'prod-resto-soto', qty: 1, notes: 'Tanpa tomat' },
      { productId: 'prod-resto-kopi', qty: 2, notes: 'Less sugar' },
    ],
    orderSource: 'QR_SELF_ORDER',
    paymentMethod: 'QRIS_DYNAMIC',
    customerName: 'Ibu Dewi (Meja 02)',
    tableId: 'tbl-resto-02',
    tableNumber: '02',
    journalSeqStart: 4,
  });
  restoSale1.order.kitchenStatus = 'COOKING';

  const restoSale2 = processOrderCheckout({
    tenant: restoTenant,
    products: restoSale1.updatedProducts,
    recipes: restoRecipes,
    accounts: restoAccounts,
    cart: [
      { productId: 'prod-resto-nasgor', qty: 2, notes: 'Pedas' },
      { productId: 'prod-resto-kopi', qty: 1 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'CASH',
    customerName: 'Bapak Hendra (Meja 01)',
    tableId: 'tbl-resto-01',
    tableNumber: '01',
    journalSeqStart: 6,
  });
  restoSale2.order.kitchenStatus = 'READY';

  const restoExp1 = {
    id: 'exp-resto-01',
    tenantId: tRestoId,
    expenseAccountId: restoAccounts.find((a) => a.code === '6102')!.id,
    paymentAccountId: restoAccounts.find((a) => a.code === '1102')!.id,
    expenseDate: '2026-11-05',
    description: 'Sewa Ruko Kemang Bulan November 2026',
    amount: '12000000.0000',
    withholdingTaxType: 'PPH_4_2_SEWA_10PCT' as const,
    withholdingTaxAmount: '1200000.0000',
    customAttributes: { nomor_kontrak: 'KTR-2026-011' },
    createdAt: '2026-11-05T09:00:00.000Z',
  };
  const restoExpJe = createExpenseJournalEntry({
    tenantId: tRestoId,
    expense: restoExp1,
    accounts: restoAccounts,
    entrySeq: 8,
  });

  const restoWorkspace: TenantWorkspaceData = {
    tenant: restoTenant,
    accounts: restoAccounts,
    categories: [
      { id: 'cat-resto-main', tenantId: tRestoId, name: 'Menu Utama', sortOrder: 1 },
      { id: 'cat-resto-drink', tenantId: tRestoId, name: 'Minuman', sortOrder: 2 },
      { id: 'cat-resto-raw', tenantId: tRestoId, name: 'Bahan Baku Dapur', sortOrder: 3 },
    ],
    products: restoSale2.updatedProducts,
    recipes: restoRecipes,
    inventoryMovements: [
      ...restoSale0.newInventoryMovements,
      ...restoSale1.newInventoryMovements,
      ...restoSale2.newInventoryMovements,
    ],
    tables: [
      { id: 'tbl-resto-01', tenantId: tRestoId, tableNumber: '01', qrToken: 'tbl-meja-01', isActive: true },
      { id: 'tbl-resto-02', tenantId: tRestoId, tableNumber: '02', qrToken: 'tbl-meja-02', isActive: true },
      { id: 'tbl-resto-03', tenantId: tRestoId, tableNumber: '03', qrToken: 'tbl-meja-03', isActive: true },
      { id: 'tbl-resto-04', tenantId: tRestoId, tableNumber: '04', qrToken: 'tbl-meja-04', isActive: true },
    ],
    orders: [restoSale1.order, restoSale2.order, restoSale0.order],
    expenses: [restoExp1],
    fixedAssets: [
      {
        id: 'fa-resto-1',
        tenantId: tRestoId,
        assetCode: 'FA-KTC-001',
        name: 'Chiller & Freezer Stainless 4 Pintu',
        acquisitionDate: '2026-01-15',
        acquisitionCost: '48000000.0000',
        salvageValue: '0.0000',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '10000000.0000',
        assetAccountId: restoAccounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: restoAccounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: restoAccounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
      {
        id: 'fa-resto-2',
        tenantId: tRestoId,
        assetCode: 'FA-POS-002',
        name: 'Paket Kasir Tablet + Printer Thermal 80mm',
        acquisitionDate: '2026-03-01',
        acquisitionCost: '24000000.0000',
        salvageValue: '0.0000',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '2000000.0000',
        assetAccountId: restoAccounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: restoAccounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: restoAccounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [
      {
        id: 'cf-resto-1',
        tenantId: tRestoId,
        targetEntity: 'products',
        fieldKey: 'tingkat_pedas_default',
        fieldLabel: 'Tingkat Pedas Default',
        fieldType: 'SELECT',
        options: ['Tidak Pedas', 'Sedang', 'Pedas', 'Ekstra Pedas'],
        isRequired: false,
      },
      {
        id: 'cf-resto-2',
        tenantId: tRestoId,
        targetEntity: 'expenses',
        fieldKey: 'nomor_kontrak',
        fieldLabel: 'No. Kontrak / Kwitansi',
        fieldType: 'TEXT',
        options: [],
        isRequired: false,
      },
    ],
    journalEntries: [
      restoOpeningJe,
      ...restoSale0.newJournalEntries,
      ...restoSale1.newJournalEntries,
      ...restoSale2.newJournalEntries,
      restoExpJe,
    ],
  };

  // =========================================================================
  // 2. WARUNG SEMBAKO BERKAH (WP_OP, Barcode/QR Scanner, Rp500M Tracker)
  // =========================================================================
  const tWarungId = 'tenant-warung-berkah';
  const warungAccounts = buildAccounts(tWarungId);
  const warungTenant = {
    id: tWarungId,
    name: 'Warung Sembako Berkah',
    slug: 'warung-sembako-berkah',
    vertical: 'WARUNG_SEMBAKO' as const,
    taxEntity: 'WP_OP' as const,
    isPkp: false,
    npwp16: '3174051908880002',
    nitku22: '3174051908880002000001',
    address: 'Jl. Raya Pasar Minggu No. 17, Jakarta Selatan',
    receiptFooter: 'Barang yang sudah dibeli tidak dapat dikembalikan. Terima kasih!',
    cumulativeTurnoverPriorMonths: '488500000.0000', // Close to Rp500M PP 20/2026 threshold!
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'] as FeatureModule['code'][],
    accountScope: 'DEMO' as const,
    ownerAccountId: 'cust-warung-berkah',
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '58mm' as const,
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-01-02T00:00:00.000Z',
  };

  const warungProducts: Product[] = [
    {
      id: 'prod-w-beras',
      tenantId: tWarungId,
      categoryId: 'cat-w-pokok',
      sku: 'SMB-001',
      barcodeQr: '8992761110015',
      name: 'Beras Rojolele Premium 5kg',
      productType: 'Beras',
      brand: 'Rojolele',
      sizeLabel: '5 kg',
      description: 'Beras pulen bebas pemutih (Sembako pokok bebas PPN PP 49/2022).',
      itemType: 'RETAIL_GOODS' as const,
      unit: 'karung',
      sellingPrice: '78000.0000',
      costPriceAvg: '67500.0000',
      stockQty: '24.0000',
      minStockAlert: '10.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: true,
      customAttributes: { rak_lorong: 'A-01', kadaluarsa: '2027-06-30' },
      createdAt: now,
    },
    {
      id: 'prod-w-minyak',
      tenantId: tWarungId,
      categoryId: 'cat-w-pokok',
      sku: 'SMB-002',
      barcodeQr: '8992696404441',
      name: 'Minyak Goreng Bimoli Pouch 2L',
      productType: 'Minyak Goreng',
      brand: 'Bimoli',
      sizeLabel: '2 L',
      description: 'Minyak goreng kelapa sawit 2 liter.',
      itemType: 'RETAIL_GOODS' as const,
      unit: 'pouch',
      sellingPrice: '38500.0000',
      costPriceAvg: '33200.0000',
      stockQty: '4.0000', // Low stock alert!
      minStockAlert: '8.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { rak_lorong: 'A-02', kadaluarsa: '2027-03-15' },
      createdAt: now,
    },
    {
      id: 'prod-w-gula',
      tenantId: tWarungId,
      categoryId: 'cat-w-pokok',
      sku: 'SMB-003',
      barcodeQr: '8993175530019',
      name: 'Gula Pasir Gulaku Putih 1kg',
      productType: 'Gula Pasir',
      brand: 'Gulaku',
      sizeLabel: '1 kg',
      description: 'Gula tebu murni kemasan 1 kilogram.',
      itemType: 'RETAIL_GOODS' as const,
      unit: 'pack',
      sellingPrice: '18500.0000',
      costPriceAvg: '15800.0000',
      stockQty: '42.0000',
      minStockAlert: '12.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: true,
      customAttributes: { rak_lorong: 'A-03', kadaluarsa: '2027-11-01' },
      createdAt: now,
    },
    {
      id: 'prod-w-mie',
      tenantId: tWarungId,
      categoryId: 'cat-w-instan',
      sku: 'SMB-004',
      barcodeQr: '089686010947',
      name: 'Indomie Goreng Original (1 Dus / 40 pcs)',
      productType: 'Mie Instan',
      brand: 'Indomie',
      sizeLabel: '1 Dus (40 pcs)',
      description: 'Kemasan karton grosir warung.',
      itemType: 'RETAIL_GOODS' as const,
      unit: 'dus',
      sellingPrice: '118000.0000',
      costPriceAvg: '104000.0000',
      stockQty: '3.0000', // Low stock alert!
      minStockAlert: '5.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { rak_lorong: 'B-01', kadaluarsa: '2027-05-20' },
      createdAt: now,
    },
    {
      id: 'prod-w-kopi',
      tenantId: tWarungId,
      categoryId: 'cat-w-minuman',
      sku: 'SMB-005',
      barcodeQr: '8991002101210',
      name: 'Kopi Kapal Api Special 165g',
      productType: 'Kopi Sachet / Bubuk',
      brand: 'Kapal Api',
      sizeLabel: '165 gr',
      description: 'Kopi bubuk hitam aroma mantap.',
      itemType: 'RETAIL_GOODS' as const,
      unit: 'pack',
      sellingPrice: '17500.0000',
      costPriceAvg: '14200.0000',
      stockQty: '29.0000',
      minStockAlert: '10.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { rak_lorong: 'C-02', kadaluarsa: '2027-09-12' },
      createdAt: now,
    },
  ];

  const warungOpeningJe = buildJournalEntry({
    id: 'je-open-warung',
    tenantId: tWarungId,
    entryNumber: 'OPN-20261101-0001',
    entryDate: '2026-11-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Neraca November 2026 — Warung Sembako Berkah',
    accounts: warungAccounts,
    draftLines: [
      { accountCode: '1101', debit: '8400000.0000', credit: '0' },
      { accountCode: '1102', debit: '22600000.0000', credit: '0' },
      { accountCode: '1105', debit: '34000000.0000', credit: '0' },
      { accountCode: '1201', debit: '15000000.0000', credit: '0' },
      { accountCode: '1202', debit: '0', credit: '2500000.0000' },
      { accountCode: '2101', debit: '0', credit: '7500000.0000' },
      { accountCode: '3101', debit: '0', credit: '70000000.0000' },
    ],
  });

  const daysAgoIso = (daysAgo: number) => {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    return d.toISOString();
  };

  const warungHist1 = processOrderCheckout({
    tenant: warungTenant,
    products: warungProducts,
    recipes: [],
    accounts: warungAccounts,
    cart: [
      { productId: 'prod-w-minyak', qty: 2 },
      { productId: 'prod-w-mie', qty: 1 },
      { productId: 'prod-w-beras', qty: 3 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'CASH',
    customerName: 'Pak Hendra (Grosir)',
    journalSeqStart: 2,
  });
  warungHist1.order.createdAt = daysAgoIso(9);

  const warungHist2 = processOrderCheckout({
    tenant: warungTenant,
    products: warungProducts,
    recipes: [],
    accounts: warungAccounts,
    cart: [
      { productId: 'prod-w-minyak', qty: 3 },
      { productId: 'prod-w-gula', qty: 5 },
      { productId: 'prod-w-kopi', qty: 4 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'QRIS_DYNAMIC',
    customerName: 'Warung Kopi Tetangga',
    journalSeqStart: 4,
  });
  warungHist2.order.createdAt = daysAgoIso(5);

  const warungHist3 = processOrderCheckout({
    tenant: warungTenant,
    products: warungProducts,
    recipes: [],
    accounts: warungAccounts,
    cart: [
      { productId: 'prod-w-minyak', qty: 3 },
      { productId: 'prod-w-mie', qty: 2 },
      { productId: 'prod-w-beras', qty: 2 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'CASH',
    customerName: 'Ibu Ratna',
    journalSeqStart: 6,
  });
  warungHist3.order.createdAt = daysAgoIso(2);

  const warungSale1 = processOrderCheckout({
    tenant: warungTenant,
    products: warungProducts,
    recipes: [],
    accounts: warungAccounts,
    cart: [
      { productId: 'prod-w-beras', qty: 2 },
      { productId: 'prod-w-minyak', qty: 2 },
      { productId: 'prod-w-gula', qty: 3 },
    ],
    orderSource: 'POS_CASHIER',
    paymentMethod: 'CASH',
    customerName: 'Ibu Sari',
    journalSeqStart: 8,
  });
  warungSale1.order.createdAt = daysAgoIso(0);

  const warungCategories = [
    { id: 'cat-w-pokok', tenantId: tWarungId, name: 'Bahan Pokok', sortOrder: 1 },
    { id: 'cat-w-instan', tenantId: tWarungId, name: 'Mie & Makanan Instan', sortOrder: 2 },
    { id: 'cat-w-minuman', tenantId: tWarungId, name: 'Minuman Kemasan', sortOrder: 3 },
    { id: 'cat-w-kertas', tenantId: tWarungId, name: 'Kertas & ATK', sortOrder: 4 },
  ];

  const warungWorkspace: TenantWorkspaceData = {
    tenant: warungTenant,
    accounts: warungAccounts,
    categories: warungCategories,
    taxonomy: buildHierarchicalTaxonomyFromPresets('WARUNG_SEMBAKO', warungCategories),
    products: warungSale1.updatedProducts,
    recipes: [],
    inventoryMovements: [
      ...warungHist1.newInventoryMovements,
      ...warungHist2.newInventoryMovements,
      ...warungHist3.newInventoryMovements,
      ...warungSale1.newInventoryMovements,
    ],
    purchaseOrders: [],
    staffAccounts: [
      {
        id: 'stf-w-kasir',
        tenantId: tWarungId,
        fullName: 'Rina Lestari (Kasir)',
        email: 'kasir.sembako@kasirakun.id',
        password: 'Staff2026!',
        phone: '0812-8800-1122',
        roleTitle: 'Kasir',
        permissions: ['POS_CASHIER'],
        isActive: true,
        createdAt: '2026-02-01T08:00:00.000Z',
      },
      {
        id: 'stf-w-gudang',
        tenantId: tWarungId,
        fullName: 'Hendra Wijaya (Gudang & SO)',
        email: 'gudang.sembako@kasirakun.id',
        password: 'Staff2026!',
        phone: '0813-7700-3344',
        roleTitle: 'Admin Gudang / Kulakan & SO',
        permissions: ['INVENTORY_RESTOCK', 'INVENTORY_OPNAME', 'CATALOG_MANAGE'],
        isActive: true,
        createdAt: '2026-02-05T08:00:00.000Z',
      },
    ],
    activityLogs: [
      {
        id: 'act-w-init-1',
        tenantId: tWarungId,
        actorName: 'Hj. Siti Aminah (Pemilik)',
        actorEmail: 'demo.sembako@kasirakun.id',
        actorRole: 'OWNER',
        actionType: 'POS_SALE',
        summary: `Transaksi kasir #${warungSale1.order.orderNumber} (Ibu Sari) selesai — Rp288.500`,
        createdAt: now,
      },
    ],
    tables: [],
    orders: [warungSale1.order, warungHist3.order, warungHist2.order, warungHist1.order],
    expenses: [],
    fixedAssets: [
      {
        id: 'fa-w-1',
        tenantId: tWarungId,
        assetCode: 'FA-WRG-001',
        name: 'Rak Gondola Besi & Scanner Barcode 2D',
        acquisitionDate: '2026-02-01',
        acquisitionCost: '15000000.0000',
        salvageValue: '0.0000',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '2500000.0000',
        assetAccountId: warungAccounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: warungAccounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: warungAccounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [
      {
        id: 'cf-w-1',
        tenantId: tWarungId,
        targetEntity: 'products',
        fieldKey: 'rak_lorong',
        fieldLabel: 'Kode Rak / Lorong',
        fieldType: 'TEXT',
        options: [],
        isRequired: false,
      },
      {
        id: 'cf-w-2',
        tenantId: tWarungId,
        targetEntity: 'products',
        fieldKey: 'kadaluarsa',
        fieldLabel: 'Tanggal Kedaluwarsa',
        fieldType: 'DATE',
        options: [],
        isRequired: false,
      },
    ],
    journalEntries: [
      warungOpeningJe,
      ...warungHist1.newJournalEntries,
      ...warungHist2.newJournalEntries,
      ...warungHist3.newJournalEntries,
      ...warungSale1.newJournalEntries,
    ],
  };

  // =========================================================================
  // 3. KEDAI KOPI NUSANTARA (KEDAI_MAKAN, WP_OP, PB1 10%, QR Table)
  // =========================================================================
  const tKedaiId = 'tenant-kedai-kopi';
  const kedaiAccounts = buildAccounts(tKedaiId);
  const kedaiTenant = {
    id: tKedaiId,
    name: 'Kedai Kopi Nusantara',
    slug: 'kedai-kopi-nusantara',
    vertical: 'KEDAI_MAKAN' as const,
    taxEntity: 'WP_OP' as const,
    isPkp: false,
    npwp16: '3273081205910004',
    nitku22: '3273081205910004000001',
    address: 'Jl. Progo No. 22, Bandung',
    receiptFooter: 'Seduh hangat setiap hari. Terima kasih!',
    cumulativeTurnoverPriorMonths: '285000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'] as FeatureModule['code'][],
    accountScope: 'DEMO' as const,
    ownerAccountId: 'cust-demo-user',
    settings: {
      autoPrintQrOrders: true,
      thermalPaperWidth: '58mm' as const,
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-02-14T00:00:00.000Z',
  };

  const kedaiProducts: Product[] = [
    {
      id: 'prod-k-beans',
      tenantId: tKedaiId,
      categoryId: 'cat-k-raw',
      sku: 'RAW-ARABIKA',
      barcodeQr: '',
      name: 'Biji Kopi Arabika Gayo Roasted',
      description: 'Bahan baku espresso & manual brew.',
      itemType: 'RAW_MATERIAL' as const,
      unit: 'kg',
      sellingPrice: '0.0000',
      costPriceAvg: '210000.0000',
      stockQty: '12.0000',
      minStockAlert: '3.0000',
      isLuxuryGoods: false,
      isTaxExempt: true,
      isAvailable: false,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-k-kopi',
      tenantId: tKedaiId,
      categoryId: 'cat-k-kopi',
      sku: 'KPI-001',
      barcodeQr: 'KPI001',
      name: 'Es Kopi Susu Gula Aren',
      description: 'Double shot arabika Gayo, susu segar, gula aren organik.',
      imageUrl: MENU_IMAGES.kopiSusu,
      itemType: 'MENU_ITEM' as const,
      unit: 'gelas',
      sellingPrice: '26000.0000',
      costPriceAvg: '7800.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
    {
      id: 'prod-k-nasgor',
      tenantId: tKedaiId,
      categoryId: 'cat-k-makan',
      sku: 'KPI-002',
      barcodeQr: 'KPI002',
      name: 'Nasi Goreng Kampung Kedai',
      description: 'Disajikan hangat dengan telur mata sapi dan acar.',
      imageUrl: MENU_IMAGES.nasiGoreng,
      itemType: 'MENU_ITEM' as const,
      unit: 'porsi',
      sellingPrice: '34000.0000',
      costPriceAvg: '11500.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: {},
      createdAt: now,
    },
  ];

  const kedaiRecipes = [
    {
      id: 'rec-k1',
      tenantId: tKedaiId,
      menuProductId: 'prod-k-kopi',
      ingredientProductId: 'prod-k-beans',
      quantityRequired: '0.0200', // 20g coffee beans per cup
    },
  ];

  const kedaiOpeningJe = buildJournalEntry({
    id: 'je-open-kedai',
    tenantId: tKedaiId,
    entryNumber: 'OPN-20261101-0001',
    entryDate: '2026-11-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Neraca November 2026 — Kedai Kopi Nusantara',
    accounts: kedaiAccounts,
    draftLines: [
      { accountCode: '1101', debit: '6000000.0000', credit: '0' },
      { accountCode: '1102', debit: '32000000.0000', credit: '0' },
      { accountCode: '1105', debit: '7500000.0000', credit: '0' },
      { accountCode: '1201', debit: '36000000.0000', credit: '0' },
      { accountCode: '1202', debit: '0', credit: '6000000.0000' },
      { accountCode: '3101', debit: '0', credit: '75500000.0000' },
    ],
  });

  const kedaiWorkspace: TenantWorkspaceData = {
    tenant: kedaiTenant,
    accounts: kedaiAccounts,
    categories: [
      { id: 'cat-k-kopi', tenantId: tKedaiId, name: 'Kopi & Espresso', sortOrder: 1 },
      { id: 'cat-k-makan', tenantId: tKedaiId, name: 'Makanan Kedai', sortOrder: 2 },
      { id: 'cat-k-raw', tenantId: tKedaiId, name: 'Bahan Baku', sortOrder: 3 },
    ],
    products: kedaiProducts,
    recipes: kedaiRecipes,
    inventoryMovements: [],
    tables: [
      { id: 'tbl-k-01', tenantId: tKedaiId, tableNumber: 'A1', qrToken: 'kedai-a1', isActive: true },
      { id: 'tbl-k-02', tenantId: tKedaiId, tableNumber: 'A2', qrToken: 'kedai-a2', isActive: true },
    ],
    orders: [],
    expenses: [],
    fixedAssets: [
      {
        id: 'fa-k-1',
        tenantId: tKedaiId,
        assetCode: 'FA-KPI-001',
        name: 'Mesin Espresso Simonelli 2 Group & Grinder',
        acquisitionDate: '2026-02-20',
        acquisitionCost: '36000000.0000',
        salvageValue: '0.0000',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '6000000.0000',
        assetAccountId: kedaiAccounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: kedaiAccounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: kedaiAccounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [],
    journalEntries: [kedaiOpeningJe],
  };

  // =========================================================================
  // 4. STUDIO DESAIN RAKA (FREELANCE — Pekerjaan Bebas Pasal 56 PP 20/2026)
  // =========================================================================
  const tFreeId = 'tenant-studio-raka';
  const freeAccounts = buildAccounts(tFreeId);
  const freeTenant = {
    id: tFreeId,
    name: 'Studio Desain Raka (Freelance)',
    slug: 'studio-desain-raka',
    vertical: 'FREELANCE' as const,
    taxEntity: 'WP_OP' as const,
    isPkp: false,
    npwp16: '3171042107940008',
    nitku22: '3171042107940008000001',
    address: 'Jl. Tebet Barat Dalam No. 9, Jakarta Selatan',
    receiptFooter: 'Pembayaran via transfer BCA a.n. Raka Pratama. Terima kasih!',
    cumulativeTurnoverPriorMonths: '215000000.0000',
    serviceChargeRate: '0',
    activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'] as FeatureModule['code'][],
    accountScope: 'DEMO' as const,
    ownerAccountId: 'cust-studio-raka',
    settings: {
      autoPrintQrOrders: false,
      thermalPaperWidth: '80mm' as const,
      qrisMdrRate: '0.007',
    },
    createdAt: '2026-01-20T00:00:00.000Z',
  };

  const freeProducts: Product[] = [
    {
      id: 'prod-f-brand',
      tenantId: tFreeId,
      categoryId: 'cat-f-jasa',
      sku: 'SVC-001',
      barcodeQr: 'SVC001',
      name: 'Paket Brand Identity & Logo UMKM',
      description: 'Logo utama, panduan warna & tipografi, serta aset kemasan siap cetak.',
      itemType: 'SERVICE_FREELANCE' as const,
      unit: 'proyek',
      sellingPrice: '4500000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { estimasi_hari: 14 },
      createdAt: now,
    },
    {
      id: 'prod-f-web',
      tenantId: tFreeId,
      categoryId: 'cat-f-jasa',
      sku: 'SVC-002',
      barcodeQr: 'SVC002',
      name: 'Desain UI/UX Landing Page & Prototype',
      description: 'Desain responsif desktop & mobile siap serah terima developer.',
      itemType: 'SERVICE_FREELANCE' as const,
      unit: 'proyek',
      sellingPrice: '6500000.0000',
      costPriceAvg: '0.0000',
      stockQty: '0.0000',
      minStockAlert: '0.0000',
      isLuxuryGoods: false,
      isTaxExempt: false,
      isAvailable: true,
      customAttributes: { estimasi_hari: 10 },
      createdAt: now,
    },
  ];

  const freeOpeningJe = buildJournalEntry({
    id: 'je-open-free',
    tenantId: tFreeId,
    entryNumber: 'OPN-20261101-0001',
    entryDate: '2026-11-01',
    sourceModule: 'OPENING',
    sourceId: null,
    description: 'Saldo Awal Neraca November 2026 — Studio Desain Raka',
    accounts: freeAccounts,
    draftLines: [
      { accountCode: '1102', debit: '42000000.0000', credit: '0' },
      { accountCode: '1201', debit: '28000000.0000', credit: '0' },
      { accountCode: '1202', debit: '0', credit: '4000000.0000' },
      { accountCode: '3101', debit: '0', credit: '66000000.0000' },
    ],
  });

  const freeSale1 = processOrderCheckout({
    tenant: freeTenant,
    products: freeProducts,
    recipes: [],
    accounts: freeAccounts,
    cart: [{ productId: 'prod-f-brand', qty: 1 }],
    orderSource: 'FREELANCE_INVOICE',
    paymentMethod: 'BANK_TRANSFER',
    customerName: 'PT Kopi Maju Bersama',
    journalSeqStart: 2,
  });

  const freeWorkspace: TenantWorkspaceData = {
    tenant: freeTenant,
    accounts: freeAccounts,
    categories: [{ id: 'cat-f-jasa', tenantId: tFreeId, name: 'Layanan Desain & Konsultasi', sortOrder: 1 }],
    products: freeProducts,
    recipes: [],
    inventoryMovements: [],
    tables: [],
    orders: [freeSale1.order],
    expenses: [],
    fixedAssets: [
      {
        id: 'fa-f-1',
        tenantId: tFreeId,
        assetCode: 'FA-STD-001',
        name: 'Workstation MacBook Pro M4 & Studio Display',
        acquisitionDate: '2026-01-25',
        acquisitionCost: '28000000.0000',
        salvageValue: '0.0000',
        usefulLifeMonths: 48,
        depreciationMethod: 'STRAIGHT_LINE',
        accumulatedDepreciation: '4000000.0000',
        assetAccountId: freeAccounts.find((a) => a.code === '1201')!.id,
        accumDeprAccountId: freeAccounts.find((a) => a.code === '1202')!.id,
        deprExpenseAccountId: freeAccounts.find((a) => a.code === '6106')!.id,
        status: 'ACTIVE',
      },
    ],
    customFields: [
      {
        id: 'cf-f-1',
        tenantId: tFreeId,
        targetEntity: 'products',
        fieldKey: 'estimasi_hari',
        fieldLabel: 'Estimasi Pengerjaan (Hari)',
        fieldType: 'NUMBER',
        options: [],
        isRequired: false,
      },
    ],
    journalEntries: [freeOpeningJe, ...freeSale1.newJournalEntries],
  };

  const enrichedBase = enrichBaseWorkspaces([
    restoWorkspace,
    warungWorkspace,
    kedaiWorkspace,
    freeWorkspace,
  ]);
  const kostDemo = createDemoKostWorkspace();
  const agroDemo = createDemoAgroWorkspace();
  const barberDemo = createDemoBarbershopWorkspace();
  const retailDemo = createDemoTokoRetailWorkspace();

  return [
    ...enrichedBase,
    kostDemo.workspace,
    agroDemo.workspace,
    barberDemo.workspace,
    retailDemo.workspace,
    ...createNewVerticalDemoWorkspaces(),
  ];
}

export function createInitialCustomers(): ManagedCustomerAccount[] {
  return [
    {
      id: 'cust-warung-berkah',
      fullName: 'Hj. Siti Aminah (Demo Warung Sembako)',
      email: 'demo.sembako@kasirakun.id',
      passwordDemo: 'Demo2026!',
      phone: '0813-7745-1002',
      role: 'OWNER',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
      monthlyRecurringRevenue: '148000.0000',
      maxTenantsAllowed: 2,
      tenantIds: ['tenant-warung-berkah'],
      primaryTenantId: 'tenant-warung-berkah',
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: 'WARUNG_SEMBAKO',
      onboardingCompleted: true,
      lastInvoiceNumber: 'SUB-20261103-5520',
      lastPaidAt: '2026-11-03T07:40:00.000Z',
      validUntil: '2026-12-03T07:40:00.000Z',
      adminNotes:
        'Demo Warung Sembako & Retail: fokus stok kulakan, barcode scanner, HPP Moving Average, bebas PPN sembako PP 49/2022 & pantauan omzet Rp500 Juta WP OP.',
      createdAt: '2026-11-03T07:30:00.000Z',
    },
    {
      id: 'cust-demo-user',
      fullName: 'Rina Kusuma (Demo Kedai Kopi)',
      email: 'demo@kedaisenja.id',
      passwordDemo: 'Demo2026!',
      phone: '0812-3456-7890',
      role: 'OWNER',
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      activeModules: ['POS_BASIC', 'QR_TABLE_KITCHEN', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
      monthlyRecurringRevenue: '227000.0000',
      maxTenantsAllowed: 3,
      tenantIds: ['tenant-kedai-kopi'],
      primaryTenantId: 'tenant-kedai-kopi',
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: 'KEDAI_MAKAN',
      onboardingCompleted: true,
      lastInvoiceNumber: 'SUB-20261101-8801',
      lastPaidAt: '2026-11-01T08:15:00.000Z',
      validUntil: '2026-12-01T08:15:00.000Z',
      adminNotes:
        'Demo Kedai Kopi & Warung Makan Kecil: POS visual, QR Meja, Layar Dapur, Bahan Mentah → Resep BOM → Menu Jadi, PB1 10%, dan Pembukuan Otomatis.',
      createdAt: '2026-11-01T08:10:00.000Z',
    },
    {
      id: 'cust-pak-budi',
      fullName: 'Budi Santoso (Demo Restoran)',
      email: 'demo.resto@kasirakun.id',
      passwordDemo: 'Demo2026!',
      phone: '0811-9888-2211',
      role: 'OWNER',
      status: 'ACTIVE',
      billingCycle: 'ANNUAL',
      activeModules: [
        'POS_BASIC',
        'QR_TABLE_KITCHEN',
        'ACCOUNTING_FULL',
        'TAX_CORETAX',
        'MULTI_BRANCH',
      ],
      monthlyRecurringRevenue: '226100.0000',
      maxTenantsAllowed: 10,
      tenantIds: ['tenant-resto-pak-budi'],
      primaryTenantId: 'tenant-resto-pak-budi',
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: 'RESTORAN',
      onboardingCompleted: true,
      lastInvoiceNumber: 'SUB-20261015-4102',
      lastPaidAt: '2026-10-15T10:20:00.000Z',
      validUntil: '2027-10-15T10:20:00.000Z',
      adminNotes:
        'Demo Restoran Full Enterprise (PT Perorangan): QR Self-Order, Kitchen Display, BOM Resep Dapur, Service Charge 5%, PB1 10%, dan Laporan 3-Tier PSAK.',
      createdAt: '2026-10-15T10:00:00.000Z',
    },
    {
      id: 'cust-studio-raka',
      fullName: 'Raka Pratama (Demo Jasa & Freelance)',
      email: 'demo.jasa@kasirakun.id',
      passwordDemo: 'Demo2026!',
      phone: '0856-9011-4432',
      role: 'OWNER',
      status: 'TRIAL',
      billingCycle: 'MONTHLY',
      activeModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
      monthlyRecurringRevenue: '148000.0000',
      maxTenantsAllowed: 1,
      tenantIds: ['tenant-studio-raka'],
      primaryTenantId: 'tenant-studio-raka',
      accountScope: 'DEMO',
      isDemoAccount: true,
      demoVertical: 'FREELANCE',
      onboardingCompleted: true,
      lastInvoiceNumber: 'SUB-20261110-7719',
      lastPaidAt: '2026-11-10T14:00:00.000Z',
      validUntil: '2026-12-10T14:00:00.000Z',
      adminNotes:
        'Demo Jasa & Freelance (Pekerjaan Bebas Pasal 56 PP 20/2026): katalog layanan proyek, invoice klien, kredit PPh 23, dan estimasi Pasal 17 / NPPN.',
      createdAt: '2026-11-10T13:50:00.000Z',
    },
    createDemoKostWorkspace().customer,
    createDemoAgroWorkspace().customer,
    createDemoBarbershopWorkspace().customer,
    createDemoTokoRetailWorkspace().customer,
    ...createNewVerticalDemoCustomers(),
  ];
}

