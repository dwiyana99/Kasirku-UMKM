import Decimal from 'decimal.js';
import type {
  AppSession,
  BusinessVertical,
  ItemType,
  ManagedCustomerAccount,
  Product,
  ProductRecipe,
  RecipeTemplate,
  RecipeTemplateIngredient,
  TenantWorkspaceData,
} from '../../types/domain';

export interface VerticalCapabilityConfig {
  vertical: BusinessVertical;
  catalogNavLabel: string;
  catalogTitle: string;
  catalogSubtitle: string;
  supportsRawMaterialsAndBom: boolean;
  supportsQrTablesAndKitchen: boolean;
  supportsStockProcurement: boolean;
  supportsKostManagement: boolean;
  supportsAgroManagement: boolean;
  defaultSellableItemType: ItemType;
  allowedSellableItemTypes: ItemType[];
  sellableTabLabel: string;
  stockTabLabel: string;
  categoryTabLabel: string;
}

export function getVerticalCapabilities(vertical: BusinessVertical): VerticalCapabilityConfig {
  switch (vertical) {
    case 'WARUNG_SEMBAKO':
      return {
        vertical,
        catalogNavLabel: 'Barang, Stok & Kulakan',
        catalogTitle: 'Katalog Barang Sembako & Stok Kulakan',
        catalogSubtitle:
          'Fokus jual-beli barang ritel, pantau sisa stok, kulakan supplier otomatis jurnal persediaan, dan stock opname',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS'],
        sellableTabLabel: 'Katalog Barang & Harga Jual',
        stockTabLabel: 'Kulakan / Restock & Stok Opname',
        categoryTabLabel: 'Kategori Barang',
      };
    case 'FREELANCE':
      return {
        vertical,
        catalogNavLabel: 'Layanan & Paket Jasa',
        catalogTitle: 'Katalog Layanan, Paket Jasa & Tarif',
        catalogSubtitle:
          'Kelola layanan profesional, paket proyek, tarif jasa, serta atribut kontrak kustom',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: false,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Layanan & Tarif Jasa',
        stockTabLabel: 'Stok Produk Pendukung',
        categoryTabLabel: 'Kategori Layanan',
      };
    case 'KOST_KONTRAKAN':
      return {
        vertical,
        catalogNavLabel: 'Layanan & Fasilitas Kost',
        catalogTitle: 'Katalog Fasilitas Tambahan & Utilitas Kost',
        catalogSubtitle:
          'Kelola tarif layanan tambahan kost (laundry, parkir, token listrik) melengkapi manajemen kamar & tagihan sewa',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: false,
        supportsKostManagement: true,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE'],
        sellableTabLabel: 'Layanan Tambahan Kost',
        stockTabLabel: 'Perlengkapan Kamar',
        categoryTabLabel: 'Kategori Fasilitas',
      };
    case 'PETERNAKAN_PERTANIAN':
      return {
        vertical,
        catalogNavLabel: 'Gudang Pakan, Bibit & Hasil Panen',
        catalogTitle: 'Katalog Sarana Produksi Agro (Pakan/Bibit/Pupuk) & Hasil Panen',
        catalogSubtitle:
          'Kelola stok pakan, bibit, pupuk, obat ternak serta produk hasil panen otomatis dengan HPP per Kg/Ekor',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: true,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS', 'RAW_MATERIAL'],
        sellableTabLabel: 'Produk Hasil Panen & Jual',
        stockTabLabel: 'Stok Pakan, Bibit, Pupuk & Obat',
        categoryTabLabel: 'Kategori Agro',
      };
    case 'TOKO_RETAIL':
      return {
        vertical,
        catalogNavLabel: 'Produk SKU, Varian & Stok',
        catalogTitle: 'Katalog Produk Retail, SKU Varian & Stok Multi-Cabang',
        catalogSubtitle:
          'Kelola SKU, barcode, harga grosir bertingkat, kulakan supplier, transfer stok antar cabang & stock opname',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS'],
        sellableTabLabel: 'Katalog Produk & Varian SKU',
        stockTabLabel: 'Restock Supplier & Stok Opname',
        categoryTabLabel: 'Kategori Produk Retail',
      };
    case 'TOKO_FASHION':
      return {
        vertical,
        catalogNavLabel: 'Artikel Fashion, Ukuran & Stok',
        catalogTitle: 'Katalog Baju Distro, Sepatu & Varian Ukuran/Warna',
        catalogSubtitle:
          'Khusus penjualan fashion jadi (ukuran S–XXL & sepatu 38–44), barcode artikel, diskon musiman & stok siap jual',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Artikel & Ukuran',
        stockTabLabel: 'Restock Supplier & Stock Opname',
        categoryTabLabel: 'Kategori Fashion & Ukuran',
      };
    case 'TOKO_BANGUNAN':
      return {
        vertical,
        catalogNavLabel: 'Material Bangunan & Stok Gudang',
        catalogTitle: 'Katalog Material Bangunan (Eceran & Grosir Proyek)',
        catalogSubtitle:
          'Kelola semen, pasir, besi, keramik & cat dengan satuan sak/kubik/batang/dus, harga proyek & stok gudang',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Material & Harga Grosir',
        stockTabLabel: 'Restock Distributor & Opname',
        categoryTabLabel: 'Kategori Material & Satuan',
      };
    case 'MANUFAKTUR_KECIL':
      return {
        vertical,
        catalogNavLabel: 'Bahan Baku, Resep & Produk Jadi',
        catalogTitle: 'Alur Produksi: Bahan Baku (Kain/Kayu) → Resep/BOM → Barang Jadi',
        catalogSubtitle:
          'Kelola stok kain/benang/kayu mentah, formula kebutuhan bahan per produk, dan katalog barang jadi hasil produksi',
        supportsRawMaterialsAndBom: true,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS', 'RAW_MATERIAL'],
        sellableTabLabel: '3. Produk Jadi Siap Jual',
        stockTabLabel: '1. Bahan Baku (Kain/Kayu/Aksesoris)',
        categoryTabLabel: 'Kategori Produk & Bahan',
      };
    case 'BAKERY_CATERING':
      return {
        vertical,
        catalogNavLabel: 'Menu Kue, Bahan & Resep',
        catalogTitle: 'Katalog Kue, Paket Catering, Hampers & Resep Bahan Baku',
        catalogSubtitle:
          'Kelola bahan kue/masakan, resep BOM otomatis hitung HPP per box/loyang, dan produk ready stock maupun Pre-Order',
        supportsRawMaterialsAndBom: true,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'MENU_ITEM',
        allowedSellableItemTypes: ['MENU_ITEM', 'RETAIL_GOODS'],
        sellableTabLabel: '3. Katalog Kue, Box & Hampers',
        stockTabLabel: '1. Bahan Baku Dapur & Kemasan',
        categoryTabLabel: 'Kategori Bakery & Catering',
      };
    case 'BARBERSHOP':
      return {
        vertical,
        catalogNavLabel: 'Layanan Cukur & Produk Pomade',
        catalogTitle: 'Katalog Jasa Barbershop Pria & Produk Haircare',
        catalogSubtitle:
          'Kelola paket potong rambut pria, fade, shave, komisi kapster, serta stok pomade, clay & hair tonic',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Jasa Barbershop & Pomade',
        stockTabLabel: 'Stok Pomade & Perlengkapan',
        categoryTabLabel: 'Kategori Layanan Pria',
      };
    case 'SALON_KECANTIKAN':
      return {
        vertical,
        catalogNavLabel: 'Treatment Salon & Produk Kecantikan',
        catalogTitle: 'Katalog Treatment Salon Wanita (Rebounding, Nail Art, Mani-Pedi)',
        catalogSubtitle:
          'Kelola daftar treatment rambut, kuku & wajah beserta durasi, komisi stylist, serta stok serum & produk kecantikan',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Treatment Salon & Produk',
        stockTabLabel: 'Stok Obat Salon, Kuteks & Serum',
        categoryTabLabel: 'Kategori Treatment Salon',
      };
    case 'SPA_WELLNESS':
      return {
        vertical,
        catalogNavLabel: 'Paket SPA & Produk Wellness',
        catalogTitle: 'Katalog Paket SPA, Massage, Lulur & Produk Aromaterapi',
        catalogSubtitle:
          'Kelola durasi treatment SPA/refleksi, komisi terapis, serta persediaan essential oil, lulur & produk wellness',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Paket SPA & Aromaterapi',
        stockTabLabel: 'Stok Oil, Scrub & Bahan SPA',
        categoryTabLabel: 'Kategori Paket SPA',
      };
    case 'LAUNDRY':
      return {
        vertical,
        catalogNavLabel: 'Daftar Tarif Laundry & Bahan',
        catalogTitle: 'Katalog Layanan Laundry Kiloan/Satuan & Stok Deterjen',
        catalogSubtitle:
          'Kelola tarif per kg, satuan jas/bedcover, layanan express, serta persediaan deterjen, parfum & plastik packing',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Layanan Laundry',
        stockTabLabel: 'Stok Deterjen, Parfum & Plastik',
        categoryTabLabel: 'Kategori Layanan Laundry',
      };
    case 'CUCI_KENDARAAN':
      return {
        vertical,
        catalogNavLabel: 'Paket Cuci & Produk',
        catalogTitle: 'Katalog Paket Cuci Motor/Mobil, Wax & Kantin',
        catalogSubtitle:
          'Kelola tarif cuci motor, mobil kecil, SUV, poles body, serta stok sampo salju, semir ban & minuman ruang tunggu',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Paket Cuci & Minuman/Parfum',
        stockTabLabel: 'Stok Sampo Salju & Semir',
        categoryTabLabel: 'Kategori Paket Cuci',
      };
    case 'PET_SHOP':
      return {
        vertical,
        catalogNavLabel: 'Pakan Hewan, Grooming & Pet Hotel',
        catalogTitle: 'Katalog Pakan Hewan, Aksesoris, Paket Grooming & Penitipan',
        catalogSubtitle:
          'Kelola stok makanan kucing/anjing, pasir, vitamin, serta tarif layanan grooming dan penitipan per malam',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS', 'SERVICE_FREELANCE'],
        sellableTabLabel: 'Produk Pet Shop & Jasa Grooming',
        stockTabLabel: 'Restock Pakan & Perlengkapan',
        categoryTabLabel: 'Kategori Pet Shop',
      };
    case 'SEWA_LAPANGAN':
      return {
        vertical,
        catalogNavLabel: 'Kantin & Sewa Alat Olahraga',
        catalogTitle: 'Katalog Minuman Kantin, Shuttlecock & Sewa Raket/Bola',
        catalogSubtitle:
          'Kelola stok minuman dingin, shuttlecock, dan tarif sewa raket/padel pendukung booking lapangan',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'RETAIL_GOODS',
        allowedSellableItemTypes: ['RETAIL_GOODS', 'SERVICE_FREELANCE'],
        sellableTabLabel: 'Minuman, Shuttlecock & Sewa Alat',
        stockTabLabel: 'Stok Kantin & Perlengkapan',
        categoryTabLabel: 'Kategori Kantin & Alat',
      };
    case 'BIMBEL_KURSUS_GYM':
      return {
        vertical,
        catalogNavLabel: 'Program Kelas & Paket Membership',
        catalogTitle: 'Katalog Program Bimbel, Kursus, Daycare & Paket Gym',
        catalogSubtitle:
          'Kelola paket iuran bulanan SPP, membership gym, biaya pendaftaran & modul buku siswa',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: false,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Program & Membership',
        stockTabLabel: 'Modul & Perlengkapan',
        categoryTabLabel: 'Kategori Program',
      };
    case 'RENTAL_KENDARAAN':
    case 'HOMESTAY_VILLA':
    case 'SEWA_GARASI':
      return {
        vertical,
        catalogNavLabel: 'Layanan Tambahan',
        catalogTitle: 'Katalog Layanan Tambahan & Fasilitas',
        catalogSubtitle:
          'Kelola biaya layanan tambahan opsional untuk melengkapi operasional utama sewa Anda',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: false,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE'],
        sellableTabLabel: 'Layanan Tambahan',
        stockTabLabel: 'Perlengkapan Operasional',
        categoryTabLabel: 'Kategori Layanan',
      };
    case 'BARBERSHOP_SALON':
      return {
        vertical,
        catalogNavLabel: 'Layanan Salon & Produk Retail',
        catalogTitle: 'Katalog Layanan Potong/Perawatan & Produk Haircare Retail',
        catalogSubtitle:
          'Kelola daftar jasa potong/styling/creambath (dengan komisi kapster) serta stok pomade, serum & produk haircare',
        supportsRawMaterialsAndBom: false,
        supportsQrTablesAndKitchen: false,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'SERVICE_FREELANCE',
        allowedSellableItemTypes: ['SERVICE_FREELANCE', 'RETAIL_GOODS'],
        sellableTabLabel: 'Daftar Jasa Salon & Produk Haircare',
        stockTabLabel: 'Stok Pomade, Serum & Bahan Salon',
        categoryTabLabel: 'Kategori Layanan & Produk',
      };
    case 'KEDAI_MAKAN':
    case 'RESTORAN':
    default:
      return {
        vertical,
        catalogNavLabel: 'Menu, Bahan & Resep',
        catalogTitle: 'Alur Terpadu: Bahan Mentah → Resep BOM → Menu Jual',
        catalogSubtitle:
          'Kelola stok bahan baku, formulasikan resep BOM otomatis hitung HPP, lalu pilih resep saat membuat menu jual',
        supportsRawMaterialsAndBom: true,
        supportsQrTablesAndKitchen: true,
        supportsStockProcurement: true,
        supportsKostManagement: false,
        supportsAgroManagement: false,
        defaultSellableItemType: 'MENU_ITEM',
        allowedSellableItemTypes: ['MENU_ITEM', 'RETAIL_GOODS'],
        sellableTabLabel: '3. Menu & Produk Jual',
        stockTabLabel: '1. Bahan Mentah & Belanja Stok',
        categoryTabLabel: 'Kategori Menu',
      };
  }
}

export interface RecipeFormulationMetrics {
  unitCost: string; // NUMERIC(19,4)
  maxCraftablePortions: number | null;
  limitingIngredientName: string | null;
  breakdown: Array<{
    ingredientProductId: string;
    ingredientName: string;
    unit: string;
    quantityRequired: string;
    availableStock: string;
    unitCostAvg: string;
    lineCost: string;
    portionsPossible: number;
  }>;
}

/**
 * Pure Decimal.js calculator for any BOM ingredient list (either a named RecipeTemplate
 * or an active MENU_ITEM's ProductRecipe lines). Aggregates duplicate ingredient IDs
 * so remaining raw material stock & max craftable portions are 100% accurate.
 */
export function calculateRecipeFormulationMetrics(
  ingredients: RecipeTemplateIngredient[],
  products: Product[],
  yieldPortions = 1
): RecipeFormulationMetrics {
  const safeYield = Math.max(1, yieldPortions);
  const aggregatedQty = new Map<string, Decimal>();

  for (const row of ingredients) {
    const qty = new Decimal(row.quantityRequired || '0');
    if (qty.lte(0)) continue;
    const prev = aggregatedQty.get(row.ingredientProductId) ?? new Decimal(0);
    aggregatedQty.set(row.ingredientProductId, prev.plus(qty));
  }

  let totalCost = new Decimal(0);
  let maxPortions: number | null = null;
  let limitingIngredientName: string | null = null;
  const breakdown: RecipeFormulationMetrics['breakdown'] = [];

  for (const [ingredientId, qty] of aggregatedQty.entries()) {
    const ing = products.find((p) => p.id === ingredientId);
    if (!ing) continue;
    const unitCost = new Decimal(ing.costPriceAvg || '0');
    const lineCost = qty.times(unitCost);
    totalCost = totalCost.plus(lineCost);

    const stock = Decimal.max(new Decimal(0), new Decimal(ing.stockQty || '0'));
    const perPortionQty = qty.div(safeYield);
    const possible = perPortionQty.gt(0) ? stock.div(perPortionQty).floor().toNumber() : 0;

    if (maxPortions === null || possible < maxPortions) {
      maxPortions = possible;
      limitingIngredientName = ing.name;
    }

    breakdown.push({
      ingredientProductId: ing.id,
      ingredientName: ing.name,
      unit: ing.unit,
      quantityRequired: qty.toFixed(4),
      availableStock: stock.toFixed(4),
      unitCostAvg: unitCost.toFixed(4),
      lineCost: lineCost.toFixed(4),
      portionsPossible: possible,
    });
  }

  return {
    unitCost: totalCost.div(safeYield).toFixed(4),
    maxCraftablePortions: breakdown.length > 0 ? maxPortions : null,
    limitingIngredientName,
    breakdown,
  };
}

/**
 * Derive initial RecipeTemplates from existing ProductRecipe links if a workspace
 * doesn't yet have explicit recipeTemplates populated (backward-compatible migration).
 */
export function deriveRecipeTemplatesFromWorkspace(
  ws: Pick<TenantWorkspaceData, 'tenant' | 'products' | 'recipes' | 'recipeTemplates'>
): RecipeTemplate[] {
  if (ws.recipeTemplates && ws.recipeTemplates.length > 0) {
    return ws.recipeTemplates;
  }
  const byMenu = new Map<string, ProductRecipe[]>();
  for (const r of ws.recipes) {
    const list = byMenu.get(r.menuProductId) ?? [];
    list.push(r);
    byMenu.set(r.menuProductId, list);
  }
  const templates: RecipeTemplate[] = [];
  for (const [menuId, lines] of byMenu.entries()) {
    const menu = ws.products.find((p) => p.id === menuId);
    if (!menu) continue;
    templates.push({
      id: `tpl-${menu.id}`,
      tenantId: ws.tenant.id,
      name: `Resep ${menu.name}`,
      description: `Formulasi BOM otomatis untuk ${menu.name}`,
      yieldPortions: 1,
      ingredients: lines.map((l) => ({
        ingredientProductId: l.ingredientProductId,
        quantityRequired: l.quantityRequired,
      })),
      createdAt: menu.createdAt,
    });
  }
  return templates;
}

/**
 * Strict multi-tenant privacy isolation:
 * - GUEST: sees 0 workspaces (must log in first).
 * - CUSTOMER (demo or real): sees ONLY tenants listed in activeCustomer.tenantIds.
 * - MASTER_ADMIN: sees all workspaces, or the inspected customer's tenants when impersonating.
 */
export function getVisibleWorkspacesForSession(params: {
  session: AppSession;
  workspaces: TenantWorkspaceData[];
  customers: ManagedCustomerAccount[];
}): TenantWorkspaceData[] {
  const { session, workspaces, customers } = params;
  if (session.role === 'GUEST') {
    return [];
  }
  if (session.role === 'STAFF') {
    if (!session.staffTenantId) return [];
    return workspaces.filter((ws) => ws.tenant.id === session.staffTenantId);
  }
  if (session.role === 'CUSTOMER') {
    const customer = customers.find((c) => c.id === session.customerId);
    if (!customer) return [];
    const allowed = new Set(customer.tenantIds);
    return workspaces.filter((ws) => allowed.has(ws.tenant.id));
  }
  if (session.role === 'MASTER_ADMIN') {
    if (session.impersonatingCustomerId) {
      const target = customers.find((c) => c.id === session.impersonatingCustomerId);
      if (target) {
        const allowed = new Set(target.tenantIds);
        const scoped = workspaces.filter((ws) => allowed.has(ws.tenant.id));
        if (scoped.length > 0) return scoped;
      }
    }
    return workspaces;
  }
  return [];
}

/**
 * Validate product image URL or uploaded compressed data URI.
 */
export function isValidProductImageSource(src: string | undefined): boolean {
  if (!src) return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/src/assets/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
}
