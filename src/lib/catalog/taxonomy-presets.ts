/**
 * KasirAkun UMKM — Hierarchical Master Taxonomy Presets & Cascading Filters
 * Hierarchy:
 *   Kategori (Category)
 *     └── Jenis (TaxonomyProductType, linked to categoryId)
 *           └── Merek (TaxonomyBrand, linked to categoryId + optional productTypeId)
 *   Ukuran / Berat / Spek (TaxonomySize: kg, gram, ml, liter, 70 gsm, 2 L, etc., global or category/type scoped)
 *   Satuan (TaxonomyUnit: pcs, rim, dus, karung, pouch, etc., global or category/type scoped)
 */

import type {
  BusinessVertical,
  CatalogTaxonomy,
  Category,
  TaxonomyBrand,
  TaxonomyProductType,
  TaxonomySize,
  TaxonomyUnit,
  TenantWorkspaceData,
} from '../../types/domain';

export interface HierarchicalPresetGroup {
  categoryName: string;
  types: Array<{
    name: string;
    brands: string[];
    sizes?: string[];
    units?: string[];
  }>;
}

export interface VerticalTaxonomyPresets {
  commonCategories: string[];
  globalSizes: Array<{ label: string; measurementUnit: string }>;
  globalUnits: string[];
  hierarchicalPresets: HierarchicalPresetGroup[];
  defaultTaxonomy: CatalogTaxonomy;
}

export const WEIGHT_VOLUME_MEASUREMENT_UNITS = [
  'kg',
  'gram',
  'mg',
  'liter',
  'ml',
  'gsm',
  'oz',
  'cm',
  'mm',
  'lembar',
  'pcs',
] as const;

export const VERTICAL_TAXONOMY_PRESETS: Record<BusinessVertical, VerticalTaxonomyPresets> = {
  WARUNG_SEMBAKO: {
    commonCategories: [
      'Bahan Pokok',
      'Kertas & ATK',
      'Minuman Kemasan',
      'Bumbu & Masakan',
      'Mie & Makanan Instan',
      'Kebutuhan Rumah Tangga',
      'Telur, Susu & Roti',
      'Camilan & Snack',
    ],
    globalSizes: [
      { label: 'kg', measurementUnit: 'kg' },
      { label: 'gram', measurementUnit: 'gram' },
      { label: 'liter', measurementUnit: 'liter' },
      { label: 'ml', measurementUnit: 'ml' },
      { label: '250 ml', measurementUnit: 'ml' },
      { label: '500 ml', measurementUnit: 'ml' },
      { label: '1 liter', measurementUnit: 'liter' },
      { label: '2 liter', measurementUnit: 'liter' },
      { label: '165 gram', measurementUnit: 'gram' },
      { label: '250 gram', measurementUnit: 'gram' },
      { label: '500 gram', measurementUnit: 'gram' },
      { label: '1 kg', measurementUnit: 'kg' },
      { label: '5 kg', measurementUnit: 'kg' },
      { label: '10 kg', measurementUnit: 'kg' },
      { label: '70 gsm', measurementUnit: 'gsm' },
      { label: '80 gsm', measurementUnit: 'gsm' },
    ],
    globalUnits: [
      'pcs',
      'pack',
      'pouch',
      'botol',
      'karung',
      'dus',
      'rim',
      'renceng',
      'kg',
      'liter',
      'tray',
    ],
    hierarchicalPresets: [
      {
        categoryName: 'Bahan Pokok',
        types: [
          {
            name: 'Beras',
            brands: ['Rojolele', 'Pandan Wangi', 'Sania', 'Topi Koki', 'Tanpa Merek / Curah'],
            sizes: ['1 kg', '5 kg', '10 kg', '25 kg'],
            units: ['karung', 'pack', 'kg'],
          },
          {
            name: 'Minyak Goreng',
            brands: ['Bimoli', 'Filma', 'Tropical', 'Sania', 'SunCo', 'Minyakita'],
            sizes: ['500 ml', '1 liter', '2 liter'],
            units: ['pouch', 'botol', 'dus', 'liter'],
          },
          {
            name: 'Gula Pasir',
            brands: ['Gulaku', 'Rose Brand', 'GMP', 'Tanpa Merek / Curah'],
            sizes: ['250 gram', '500 gram', '1 kg'],
            units: ['pack', 'kg', 'karung'],
          },
          {
            name: 'Tepung Terigu',
            brands: ['Segitiga Biru', 'Cakra Kembar', 'Kunci Biru', 'Rose Brand'],
            sizes: ['500 gram', '1 kg'],
            units: ['pack', 'dus', 'kg'],
          },
        ],
      },
      {
        categoryName: 'Kertas & ATK',
        types: [
          {
            name: 'A4',
            brands: ['Sinar Dunia (SiDU)', 'PaperOne', 'Natural', 'Copy Paper'],
            sizes: ['70 gsm', '75 gsm', '80 gsm'],
            units: ['rim', 'dus', 'pack'],
          },
          {
            name: 'Folio (F4)',
            brands: ['Sinar Dunia (SiDU)', 'PaperOne', 'Bola Dunia'],
            sizes: ['70 gsm', '75 gsm', '80 gsm'],
            units: ['rim', 'dus', 'pack'],
          },
          {
            name: 'A3',
            brands: ['Sinar Dunia (SiDU)', 'PaperOne'],
            sizes: ['70 gsm', '80 gsm'],
            units: ['rim', 'dus'],
          },
        ],
      },
      {
        categoryName: 'Mie & Makanan Instan',
        types: [
          {
            name: 'Mie Instan',
            brands: ['Indomie', 'Mie Sedaap', 'Sarimi', 'Pop Mie'],
            sizes: ['85 gram', '1 Dus (40 pcs)'],
            units: ['pcs', 'dus', 'pack'],
          },
        ],
      },
      {
        categoryName: 'Minuman Kemasan',
        types: [
          {
            name: 'Kopi Sachet / Bubuk',
            brands: ['Kapal Api', 'ABC', 'Good Day', 'Luwak White Koffie'],
            sizes: ['165 gram', '1 Renteng (10 pcs)'],
            units: ['pack', 'renceng', 'pcs', 'dus'],
          },
          {
            name: 'Air Mineral / Minuman',
            brands: ['Aqua', 'Le Minerale', 'Teh Pucuk', 'Floridina'],
            sizes: ['250 ml', '600 ml', '1.5 liter'],
            units: ['botol', 'dus', 'pcs'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: [
        'Beras',
        'Minyak Goreng',
        'Gula Pasir',
        'Tepung Terigu',
        'A4',
        'Folio (F4)',
        'Mie Instan',
        'Kopi Sachet / Bubuk',
        'Air Mineral / Minuman',
      ],
      brands: [
        'Bimoli',
        'Gulaku',
        'Rojolele',
        'Indomie',
        'Kapal Api',
        'Sinar Dunia (SiDU)',
        'PaperOne',
        'Filma',
        'Tropical',
        'Sania',
        'Rose Brand',
        'Aqua',
        'Tanpa Merek / Curah',
      ],
      sizes: [
        'kg',
        'gram',
        'liter',
        'ml',
        '250 ml',
        '500 ml',
        '1 liter',
        '2 liter',
        '165 gram',
        '500 gram',
        '1 kg',
        '5 kg',
        '70 gsm',
        '80 gsm',
      ],
      units: ['pcs', 'pack', 'pouch', 'botol', 'karung', 'dus', 'rim', 'renceng', 'kg', 'liter', 'tray'],
    },
  },
  KEDAI_MAKAN: {
    commonCategories: [
      'Kopi & Espresso',
      'Non-Kopi & Teh',
      'Makanan Kedai',
      'Camilan & Pastry',
      'Bahan Baku',
      'Kemasan & Cup',
    ],
    globalSizes: [
      { label: 'Regular (250 ml)', measurementUnit: 'ml' },
      { label: 'Large (350 ml)', measurementUnit: 'ml' },
      { label: '1 liter', measurementUnit: 'liter' },
      { label: '500 gram', measurementUnit: 'gram' },
      { label: '1 kg', measurementUnit: 'kg' },
      { label: '1 Porsi', measurementUnit: 'pcs' },
    ],
    globalUnits: ['gelas', 'cup', 'porsi', 'botol', 'pcs', 'kg', 'liter', 'gram', 'pack'],
    hierarchicalPresets: [
      {
        categoryName: 'Kopi & Espresso',
        types: [
          {
            name: 'Kopi Susu',
            brands: ['House Blend', 'Arabika Gayo', 'Arabika Flores'],
            sizes: ['Regular (250 ml)', 'Large (350 ml)', '1 liter'],
            units: ['gelas', 'cup', 'botol'],
          },
          {
            name: 'Kopi Hitam / Manual Brew',
            brands: ['Arabika Gayo', 'Arabika Toraja', 'House Blend'],
            sizes: ['Regular (250 ml)', 'Large (350 ml)'],
            units: ['gelas', 'cup'],
          },
        ],
      },
      {
        categoryName: 'Bahan Baku',
        types: [
          {
            name: 'Biji Kopi',
            brands: ['Arabika Gayo', 'Robusta Lampung', 'House Blend'],
            sizes: ['250 gram', '500 gram', '1 kg'],
            units: ['kg', 'pack', 'gram'],
          },
          {
            name: 'Susu & Sirup',
            brands: ['Greenfields', 'Diamond', 'Oatside', 'Monin'],
            sizes: ['750 ml', '1 liter'],
            units: ['liter', 'botol', 'pack'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Kopi Susu', 'Kopi Hitam / Manual Brew', 'Teh & Matcha', 'Nasi & Lauk', 'Biji Kopi', 'Susu & Sirup'],
      brands: ['House Blend', 'Arabika Gayo', 'Greenfields', 'Diamond', 'Oatside', 'Monin', 'Homemade'],
      sizes: ['Regular (250 ml)', 'Large (350 ml)', '1 liter', '500 gram', '1 kg', '1 Porsi'],
      units: ['gelas', 'cup', 'porsi', 'botol', 'pcs', 'kg', 'liter', 'gram', 'pack'],
    },
  },
  RESTORAN: {
    commonCategories: [
      'Hidangan Utama',
      'Menu Pembuka',
      'Minuman & Jus',
      'Dessert',
      'Paket Keluarga',
      'Bahan Baku Dapur',
    ],
    globalSizes: [
      { label: 'Reguler', measurementUnit: 'pcs' },
      { label: 'Jumbo', measurementUnit: 'pcs' },
      { label: '500 gram', measurementUnit: 'gram' },
      { label: '1 kg', measurementUnit: 'kg' },
      { label: '1 liter', measurementUnit: 'liter' },
    ],
    globalUnits: ['porsi', 'piring', 'mangkok', 'gelas', 'teko', 'paket', 'kg', 'liter', 'pcs'],
    hierarchicalPresets: [
      {
        categoryName: 'Hidangan Utama',
        types: [
          {
            name: 'Ayam / Bebek',
            brands: ['Signature Chef', 'Lokal Segar'],
            sizes: ['Reguler', 'Jumbo'],
            units: ['porsi', 'piring', 'paket'],
          },
          {
            name: 'Daging Sapi',
            brands: ['Signature Chef', 'Impor Premium'],
            sizes: ['Reguler', 'Jumbo'],
            units: ['porsi', 'mangkok', 'paket'],
          },
        ],
      },
      {
        categoryName: 'Bahan Baku Dapur',
        types: [
          {
            name: 'Daging & Unggas',
            brands: ['PT Unggas Jaya', 'RPH Dharma Jaya', 'Lokal Segar'],
            sizes: ['500 gram', '1 kg', '5 kg'],
            units: ['kg', 'pack'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Ayam / Bebek', 'Daging Sapi', 'Ikan & Seafood', 'Sayur & Sup', 'Minuman Dingin', 'Daging & Unggas'],
      brands: ['Signature Chef', 'Lokal Segar', 'Impor Premium', 'Homemade'],
      sizes: ['Reguler', 'Jumbo', 'Sharing (2-3 Orang)', '500 gram', '1 kg'],
      units: ['porsi', 'piring', 'mangkok', 'gelas', 'teko', 'paket', 'kg', 'liter', 'pcs'],
    },
  },
  FREELANCE: {
    commonCategories: [
      'Layanan Desain & Konsultasi',
      'Desain & Branding',
      'Pengembangan Web & App',
      'Konten & Pemasaran Digital',
      'Maintenance Bulanan',
    ],
    globalSizes: [
      { label: '1-3 Hari Kerja', measurementUnit: 'pcs' },
      { label: '1 Minggu', measurementUnit: 'pcs' },
      { label: '2 Minggu', measurementUnit: 'pcs' },
      { label: '1 Bulan', measurementUnit: 'pcs' },
    ],
    globalUnits: ['proyek', 'jam', 'paket', 'bulan', 'halaman', 'sesi'],
    hierarchicalPresets: [
      {
        categoryName: 'Layanan Desain & Konsultasi',
        types: [
          {
            name: 'Brand Identity & Logo',
            brands: ['Paket Basic', 'Paket Professional', 'Paket Enterprise'],
            sizes: ['1 Minggu', '2 Minggu'],
            units: ['proyek', 'paket'],
          },
          {
            name: 'UI/UX & Website',
            brands: ['Paket Basic', 'Paket Professional', 'Custom'],
            sizes: ['2 Minggu', '1 Bulan'],
            units: ['proyek', 'halaman', 'paket'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Brand Identity & Logo', 'UI/UX & Website', 'Audit & Konsultasi', 'Maintenance Bulanan'],
      brands: ['Paket Basic', 'Paket Professional', 'Paket Enterprise', 'Custom'],
      sizes: ['1-3 Hari Kerja', '1 Minggu', '2 Minggu', '1 Bulan'],
      units: ['proyek', 'jam', 'paket', 'bulan', 'halaman', 'sesi'],
    },
  },
  KOST_KONTRAKAN: {
    commonCategories: ['Sewa Kamar', 'Utilitas & Listrik', 'Layanan Tambahan', 'Perlengkapan Kamar'],
    globalSizes: [
      { label: '3x3 m', measurementUnit: 'cm' },
      { label: '3x4 m', measurementUnit: 'cm' },
      { label: '4x5 m', measurementUnit: 'cm' },
      { label: '1 Bulan', measurementUnit: 'pcs' },
      { label: '1 Tahun', measurementUnit: 'pcs' },
    ],
    globalUnits: ['bulan', 'tahun', 'kamar', 'kwh', 'm3', 'paket'],
    hierarchicalPresets: [
      {
        categoryName: 'Sewa Kamar',
        types: [
          {
            name: 'Kamar Standar',
            brands: ['AC + KM Dalam', 'Non-AC + KM Luar'],
            sizes: ['3x3 m', '3x4 m'],
            units: ['bulan', 'tahun'],
          },
          {
            name: 'Kamar VIP / Studio',
            brands: ['Full Furnished', 'Semi Furnished'],
            sizes: ['4x5 m'],
            units: ['bulan', 'tahun'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Kamar Standar', 'Kamar VIP / Studio', 'Token Listrik', 'Air & WiFi', 'Laundry'],
      brands: ['AC + KM Dalam', 'Full Furnished', 'PLN', 'PDAM'],
      sizes: ['3x3 m', '3x4 m', '4x5 m', '1 Bulan', '1 Tahun'],
      units: ['bulan', 'tahun', 'kamar', 'kwh', 'm3', 'paket'],
    },
  },
  PETERNAKAN_PERTANIAN: {
    commonCategories: ['Hasil Panen', 'Pakan Ternak', 'Bibit & Benih', 'Pupuk & Nutrisi', 'Obat & Vitamin'],
    globalSizes: [
      { label: '1 kg', measurementUnit: 'kg' },
      { label: '5 kg', measurementUnit: 'kg' },
      { label: '25 kg', measurementUnit: 'kg' },
      { label: '50 kg', measurementUnit: 'kg' },
      { label: '500 ml', measurementUnit: 'ml' },
      { label: '1 liter', measurementUnit: 'liter' },
    ],
    globalUnits: ['kg', 'ekor', 'ton', 'karung', 'sak', 'liter', 'botol', 'box', 'tray'],
    hierarchicalPresets: [
      {
        categoryName: 'Pakan Ternak',
        types: [
          {
            name: 'Pakan Broiler Starter/Finisher',
            brands: ['Pokphand (CP)', 'Japfa Comfeed', 'Malindo', 'New Hope'],
            sizes: ['25 kg', '50 kg'],
            units: ['sak', 'karung', 'kg'],
          },
        ],
      },
      {
        categoryName: 'Pupuk & Nutrisi',
        types: [
          {
            name: 'Pupuk Urea / NPK',
            brands: ['Pupuk Indonesia', 'Phonska', 'Mutiara 16-16-16'],
            sizes: ['25 kg', '50 kg'],
            units: ['karung', 'kg'],
          },
        ],
      },
      {
        categoryName: 'Hasil Panen',
        types: [
          {
            name: 'Ayam Broiler Hidup / Karkas',
            brands: ['Grade A', 'Grade B'],
            sizes: ['1 kg', '1.8 kg', '2 kg'],
            units: ['kg', 'ekor'],
          },
          {
            name: 'Gabah Kering Panen / Beras',
            brands: ['IR64', 'Ciherang', 'Invari 32'],
            sizes: ['25 kg', '50 kg'],
            units: ['kg', 'karung', 'ton'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Ayam Broiler Hidup / Karkas', 'Gabah Kering Panen / Beras', 'Pakan Broiler Starter/Finisher', 'Bibit DOC', 'Pupuk Urea / NPK', 'Vitamin & Vaksin'],
      brands: ['Pokphand (CP)', 'Japfa Comfeed', 'Pupuk Indonesia', 'Phonska', 'Medion', 'Grade A'],
      sizes: ['1 kg', '5 kg', '25 kg', '50 kg', '500 ml', '1 liter'],
      units: ['kg', 'ekor', 'ton', 'karung', 'sak', 'liter', 'botol', 'box', 'tray'],
    },
  },
  TOKO_RETAIL: {
    commonCategories: ['Fashion & Pakaian', 'Aksesoris & Tas', 'Elektronik & Gadget', 'Kosmetik & Skincare', 'Perlengkapan Rumah'],
    globalSizes: [
      { label: 'S', measurementUnit: 'pcs' },
      { label: 'M', measurementUnit: 'pcs' },
      { label: 'L', measurementUnit: 'pcs' },
      { label: 'XL', measurementUnit: 'pcs' },
      { label: 'All Size', measurementUnit: 'pcs' },
      { label: '100 ml', measurementUnit: 'ml' },
      { label: '250 gram', measurementUnit: 'gram' },
    ],
    globalUnits: ['pcs', 'pasang', 'set', 'lusin', 'box', 'pack', 'dus'],
    hierarchicalPresets: [
      {
        categoryName: 'Fashion & Pakaian',
        types: [
          {
            name: 'Kemeja & Kaos',
            brands: ['Sentosa Basic', 'Urban Cotton', 'Nusantara Batik'],
            sizes: ['S', 'M', 'L', 'XL'],
            units: ['pcs', 'lusin'],
          },
          {
            name: 'Celana & Denim',
            brands: ['Sentosa Denim', 'Urban Cotton'],
            sizes: ['M', 'L', 'XL'],
            units: ['pcs', 'lusin'],
          },
        ],
      },
      {
        categoryName: 'Elektronik & Gadget',
        types: [
          {
            name: 'Aksesoris HP & Charger',
            brands: ['Anker', 'Baseus', 'Robot', 'Ugreen'],
            sizes: ['All Size'],
            units: ['pcs', 'box'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Kemeja & Kaos', 'Celana & Denim', 'Tas & Dompet', 'Aksesoris HP & Charger', 'Skincare'],
      brands: ['Sentosa Basic', 'Urban Cotton', 'Anker', 'Baseus', 'Local Brand'],
      sizes: ['S', 'M', 'L', 'XL', 'All Size', '100 ml'],
      units: ['pcs', 'pasang', 'set', 'lusin', 'box', 'pack', 'dus'],
    },
  },
  BARBERSHOP_SALON: {
    commonCategories: ['Layanan Potong & Styling', 'Perawatan Rambut & Creambath', 'Pewarnaan & Smoothing', 'Produk Retail Haircare'],
    globalSizes: [
      { label: '30 Menit', measurementUnit: 'pcs' },
      { label: '45 Menit', measurementUnit: 'pcs' },
      { label: '60 Menit', measurementUnit: 'pcs' },
      { label: '100 gram', measurementUnit: 'gram' },
      { label: '100 ml', measurementUnit: 'ml' },
      { label: '250 ml', measurementUnit: 'ml' },
    ],
    globalUnits: ['sesi', 'paket', 'jar', 'botol', 'tube', 'pcs'],
    hierarchicalPresets: [
      {
        categoryName: 'Layanan Potong & Styling',
        types: [
          {
            name: 'Gentleman Haircut',
            brands: ['Senior Barber', 'Junior Barber', 'VIP Stylist'],
            sizes: ['30 Menit', '45 Menit'],
            units: ['sesi', 'paket'],
          },
          {
            name: 'Shaving & Beard Trim',
            brands: ['Senior Barber', 'VIP Stylist'],
            sizes: ['30 Menit'],
            units: ['sesi'],
          },
        ],
      },
      {
        categoryName: 'Produk Retail Haircare',
        types: [
          {
            name: 'Pomade & Clay',
            brands: ['Suavecito', 'Smith Men Supply', 'Gatsby', 'Chief Barber'],
            sizes: ['100 gram'],
            units: ['jar', 'pcs'],
          },
          {
            name: 'Hair Tonic & Serum',
            brands: ['Makarizo', 'Loreal', 'Chief Barber'],
            sizes: ['100 ml', '250 ml'],
            units: ['botol', 'pcs'],
          },
        ],
      },
    ],
    defaultTaxonomy: {
      productTypes: ['Gentleman Haircut', 'Shaving & Beard Trim', 'Creambath & Spa', 'Hair Coloring', 'Pomade & Clay', 'Hair Tonic & Serum'],
      brands: ['Senior Barber', 'VIP Stylist', 'Suavecito', 'Chief Barber', 'Makarizo', 'Loreal'],
      sizes: ['30 Menit', '45 Menit', '60 Menit', '100 gram', '100 ml', '250 ml'],
      units: ['sesi', 'paket', 'jar', 'botol', 'tube', 'pcs'],
    },
  },
  MANUFAKTUR_KECIL: {
    commonCategories: ['Produk Jadi Konveksi / Mebel', 'Bahan Baku Kain & Kayu', 'Aksesoris & Finishing'],
    globalSizes: [
      { label: 'S', measurementUnit: 'pcs' },
      { label: 'M', measurementUnit: 'pcs' },
      { label: 'L', measurementUnit: 'pcs' },
      { label: 'XL', measurementUnit: 'pcs' },
      { label: '1 Meter', measurementUnit: 'cm' },
      { label: '1 Lembar', measurementUnit: 'lembar' },
    ],
    globalUnits: ['pcs', 'meter', 'yard', 'lembar', 'batang', 'set', 'lusin', 'kodi'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Baju Jahit / Butik', 'Seragam Custom', 'Furniture Kayu', 'Kain & Bahan Baku', 'Benang & Aksesoris'],
      brands: ['Produksi Sendiri', 'Custom Order', 'Kain Katun Toyobo', 'Kayu Jati'],
      sizes: ['S', 'M', 'L', 'XL', '1 Meter', '1 Lembar'],
      units: ['pcs', 'meter', 'yard', 'lembar', 'batang', 'set', 'lusin', 'kodi'],
    },
  },
  LAUNDRY: {
    commonCategories: ['Cuci Kiloan', 'Cuci Satuan & Dry Clean', 'Express & Kilat', 'Parfum & Deterjen'],
    globalSizes: [
      { label: 'Reguler 2 Hari', measurementUnit: 'pcs' },
      { label: 'Express 6 Jam', measurementUnit: 'pcs' },
      { label: '1 Kg', measurementUnit: 'kg' },
    ],
    globalUnits: ['kg', 'pcs', 'pasang', 'paket', 'set'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Cuci Komplit Lipat', 'Cuci Setrika', 'Setrika Saja', 'Bedcover & Selimut', 'Cuci Sepatu / Tas'],
      brands: ['Reguler', 'Express', 'VIP'],
      sizes: ['Reguler 2 Hari', 'Express 6 Jam', '1 Kg'],
      units: ['kg', 'pcs', 'pasang', 'paket', 'set'],
    },
  },
  CUCI_KENDARAAN: {
    commonCategories: ['Cuci Motor', 'Cuci Mobil', 'Detailing & Salon Mobil', 'Aksesoris & Parfum'],
    globalSizes: [
      { label: 'Motor Bebek/Matic', measurementUnit: 'pcs' },
      { label: 'Motor Besar', measurementUnit: 'pcs' },
      { label: 'Mobil Kecil/City Car', measurementUnit: 'pcs' },
      { label: 'Mobil SUV/MPV', measurementUnit: 'pcs' },
    ],
    globalUnits: ['unit', 'sesi', 'paket', 'botol', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Cuci Salju Motor', 'Cuci Hidrolik Mobil', 'Vacuum Interior', 'Wax & Poles Body'],
      brands: ['Standar', 'Premium Wax', 'Nano Ceramic'],
      sizes: ['Motor Bebek/Matic', 'Motor Besar', 'Mobil Kecil/City Car', 'Mobil SUV/MPV'],
      units: ['unit', 'sesi', 'paket', 'botol', 'pcs'],
    },
  },
  BARBERSHOP: {
    commonCategories: ['Potong Rambut Pria', 'Shaving & Grooming', 'Produk Pomade & Haircare'],
    globalSizes: [
      { label: '30 Menit', measurementUnit: 'pcs' },
      { label: '45 Menit', measurementUnit: 'pcs' },
      { label: '100 gram', measurementUnit: 'gram' },
    ],
    globalUnits: ['sesi', 'paket', 'jar', 'botol', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Gentleman Haircut', 'Skin Fade', 'Beard Trim & Shave', 'Hot Towel Massage', 'Pomade & Clay'],
      brands: ['Senior Kapster', 'Master Barber', 'Chief', 'Smith'],
      sizes: ['30 Menit', '45 Menit', '100 gram'],
      units: ['sesi', 'paket', 'jar', 'botol', 'pcs'],
    },
  },
  SALON_KECANTIKAN: {
    commonCategories: ['Potong & Blow Wanita', 'Smoothing & Rebonding', 'Nail Art & Mani-Pedi', 'Hair Coloring & Treatment'],
    globalSizes: [
      { label: 'Rambut Pendek', measurementUnit: 'pcs' },
      { label: 'Rambut Sedang', measurementUnit: 'pcs' },
      { label: 'Rambut Panjang', measurementUnit: 'pcs' },
    ],
    globalUnits: ['sesi', 'paket', 'set', 'botol', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Rebonding / Smoothing', 'Nail Art Gel', 'Manicure & Pedicure', 'Hair Coloring', 'Creambath & Hair Spa'],
      brands: ['Loreal', 'Makarizo', 'Matrix', 'OPI Gel'],
      sizes: ['Rambut Pendek', 'Rambut Sedang', 'Rambut Panjang'],
      units: ['sesi', 'paket', 'set', 'botol', 'pcs'],
    },
  },
  SPA_WELLNESS: {
    commonCategories: ['Pijat & Refleksi', 'Body Scrub & Lulur', 'Paket Couple & VIP SPA', 'Essential Oil & Herbal'],
    globalSizes: [
      { label: '60 Menit', measurementUnit: 'pcs' },
      { label: '90 Menit', measurementUnit: 'pcs' },
      { label: '120 Menit', measurementUnit: 'pcs' },
    ],
    globalUnits: ['sesi', 'paket', 'botol', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Traditional Massage', 'Reflexology', 'Balinese Boreh / Lulur', 'Aromatherapy SPA', 'Sauna & Bath'],
      brands: ['Terapis Senior', 'VIP Room', 'Bali Botanical'],
      sizes: ['60 Menit', '90 Menit', '120 Menit'],
      units: ['sesi', 'paket', 'botol', 'pcs'],
    },
  },
  TOKO_FASHION: {
    commonCategories: ['Atasan & Distro', 'Celana & Bawahan', 'Sepatu & Sneakers', 'Tas & Aksesoris'],
    globalSizes: [
      { label: 'S', measurementUnit: 'pcs' },
      { label: 'M', measurementUnit: 'pcs' },
      { label: 'L', measurementUnit: 'pcs' },
      { label: 'XL', measurementUnit: 'pcs' },
      { label: '40', measurementUnit: 'pcs' },
      { label: '41', measurementUnit: 'pcs' },
      { label: '42', measurementUnit: 'pcs' },
      { label: '43', measurementUnit: 'pcs' },
    ],
    globalUnits: ['pcs', 'pasang', 'set', 'lusin', 'box'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Kaos Distro', 'Hoodie & Jaket', 'Sneakers', 'Sepatu Kasual', 'Celana Cargo / Chino', 'Topi & Tas'],
      brands: ['Local Pride', 'Urban Distro', 'Streetwear ID'],
      sizes: ['S', 'M', 'L', 'XL', '40', '41', '42', '43'],
      units: ['pcs', 'pasang', 'set', 'lusin', 'box'],
    },
  },
  TOKO_BANGUNAN: {
    commonCategories: ['Semen, Pasir & Bata', 'Besi, Baja Ringan & Kayu', 'Cat & Pelapis', 'Pipa, Keramik & Pertukangan'],
    globalSizes: [
      { label: '40 Kg', measurementUnit: 'kg' },
      { label: '50 Kg', measurementUnit: 'kg' },
      { label: '5 Kg', measurementUnit: 'kg' },
      { label: '20 Kg', measurementUnit: 'kg' },
      { label: '6 Meter', measurementUnit: 'cm' },
    ],
    globalUnits: ['sak', 'kubik', 'batang', 'lembar', 'dus', 'kaleng', 'pail', 'pcs', 'kg'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Semen Portland', 'Besi Beton', 'Cat Tembok', 'Keramik Lantai', 'Pipa PVC', 'Pasir & Batu Split'],
      brands: ['Tiga Roda', 'Semen Gresik', 'Nippon Paint', 'Dulux', 'Rucika', 'Krakatau Steel'],
      sizes: ['40 Kg', '50 Kg', '5 Kg', '20 Kg', '6 Meter'],
      units: ['sak', 'kubik', 'batang', 'lembar', 'dus', 'kaleng', 'pail', 'pcs', 'kg'],
    },
  },
  BAKERY_CATERING: {
    commonCategories: ['Roti & Pastry Harian', 'Kue Ulang Tahun (Pre-Order)', 'Nasi Box & Catering', 'Hampers & Parcel'],
    globalSizes: [
      { label: 'Diameter 16 cm', measurementUnit: 'cm' },
      { label: 'Diameter 20 cm', measurementUnit: 'cm' },
      { label: 'Box Isi 6', measurementUnit: 'pcs' },
      { label: 'Box Isi 12', measurementUnit: 'pcs' },
    ],
    globalUnits: ['pcs', 'box', 'loyang', 'paket', 'porsi', 'keranjang'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Birthday Cake Custom', 'Nasi Box Catering', 'Hampers Lebaran/Natal', 'Roti Manis & Croissant', 'Kue Kering'],
      brands: ['Homemade Kitchen', 'Premium Butter', 'Custom PO'],
      sizes: ['Diameter 16 cm', 'Diameter 20 cm', 'Box Isi 6', 'Box Isi 12'],
      units: ['pcs', 'box', 'loyang', 'paket', 'porsi', 'keranjang'],
    },
  },
  RENTAL_KENDARAAN: {
    commonCategories: ['Sewa Mobil Lepas Kunci', 'Sewa Mobil + Sopir', 'Sewa Motor Harian', 'Biaya Tambahan (Overtime/BBM)'],
    globalSizes: [
      { label: '12 Jam', measurementUnit: 'pcs' },
      { label: '24 Jam / Harian', measurementUnit: 'pcs' },
      { label: 'Mingguan', measurementUnit: 'pcs' },
    ],
    globalUnits: ['hari', 'jam', 'paket', 'unit'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['MPV 7-Seater', 'City Car Matic', 'Motor Matic 150cc', 'Jasa Sopir', 'Antar-Jemput Bandara'],
      brands: ['Toyota', 'Honda', 'Daihatsu', 'Yamaha'],
      sizes: ['12 Jam', '24 Jam / Harian', 'Mingguan'],
      units: ['hari', 'jam', 'paket', 'unit'],
    },
  },
  SEWA_LAPANGAN: {
    commonCategories: ['Lapangan Badminton', 'Lapangan Futsal', 'Lapangan Padel', 'Sewa Alat & Kantin'],
    globalSizes: [
      { label: '1 Jam', measurementUnit: 'pcs' },
      { label: '2 Jam', measurementUnit: 'pcs' },
      { label: 'Member Bulanan', measurementUnit: 'pcs' },
    ],
    globalUnits: ['jam', 'sesi', 'paket', 'tabung', 'botol', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Court Badminton', 'Court Futsal Vinyl', 'Court Padel', 'Shuttlecock', 'Sewa Raket', 'Minuman Dingin'],
      brands: ['Reguler Siang', 'Prime Time Malam', 'Yonex', 'Pocari'],
      sizes: ['1 Jam', '2 Jam', 'Member Bulanan'],
      units: ['jam', 'sesi', 'paket', 'tabung', 'botol', 'pcs'],
    },
  },
  PET_SHOP: {
    commonCategories: ['Makanan Kucing & Anjing', 'Layanan Grooming', 'Penitipan / Pet Hotel', 'Pasir, Vitamin & Aksesoris'],
    globalSizes: [
      { label: '500 gram', measurementUnit: 'gram' },
      { label: '1.5 kg', measurementUnit: 'kg' },
      { label: '5 kg', measurementUnit: 'kg' },
      { label: '10 Liter', measurementUnit: 'liter' },
    ],
    globalUnits: ['pcs', 'pack', 'sak', 'sesi', 'malam', 'botol'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Dry Food', 'Wet Food', 'Grooming Sehat/Jamur', 'Pet Hotel Harian', 'Pasir Gumpal Wangi'],
      brands: ['Royal Canin', 'Whiskas', 'Bolt', 'Me-O', 'Pro Plan'],
      sizes: ['500 gram', '1.5 kg', '5 kg', '10 Liter'],
      units: ['pcs', 'pack', 'sak', 'sesi', 'malam', 'botol'],
    },
  },
  BIMBEL_KURSUS_GYM: {
    commonCategories: ['SPP & Paket Kursus', 'Membership Gym / Studio', 'Kelas Privat & Personal Trainer', 'Modul & Perlengkapan'],
    globalSizes: [
      { label: 'Bulanan', measurementUnit: 'pcs' },
      { label: 'Per 8 Sesi', measurementUnit: 'pcs' },
      { label: 'Harian / Visit', measurementUnit: 'pcs' },
    ],
    globalUnits: ['bulan', 'sesi', 'paket', 'visit', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['SPP Bimbel Bulanan', 'Kursus Bahasa / Musik', 'Daycare Bulanan', 'Gym Membership', 'Personal Trainer'],
      brands: ['Reguler', 'Intensif', 'VIP Privat'],
      sizes: ['Bulanan', 'Per 8 Sesi', 'Harian / Visit'],
      units: ['bulan', 'sesi', 'paket', 'visit', 'pcs'],
    },
  },
  HOMESTAY_VILLA: {
    commonCategories: ['Sewa Kamar & Villa', 'Sewa Slot Jam / Transit', 'Extra Bed & Sarapan', 'Layanan Tamu'],
    globalSizes: [
      { label: 'Per Malam', measurementUnit: 'pcs' },
      { label: 'Slot 3 Jam', measurementUnit: 'pcs' },
      { label: 'Slot 6 Jam', measurementUnit: 'pcs' },
    ],
    globalUnits: ['malam', 'slot', 'paket', 'pcs'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Private Pool Villa', 'Deluxe Room', 'Family Suite', 'Extra Bed', 'Floating Breakfast'],
      brands: ['Direct Booking', 'Traveloka', 'Airbnb', 'Tiket.com'],
      sizes: ['Per Malam', 'Slot 3 Jam', 'Slot 6 Jam'],
      units: ['malam', 'slot', 'paket', 'pcs'],
    },
  },
  SEWA_GARASI: {
    commonCategories: ['Sewa Garasi Bulanan', 'Parkir Harian / Mingguan', 'Layanan Tambahan'],
    globalSizes: [
      { label: 'Indoor Tertutup', measurementUnit: 'pcs' },
      { label: 'Kanopi', measurementUnit: 'pcs' },
    ],
    globalUnits: ['bulan', 'hari', 'slot', 'paket'],
    hierarchicalPresets: [],
    defaultTaxonomy: {
      productTypes: ['Slot Mobil Indoor', 'Slot Mobil Kanopi', 'Slot Motor', 'Cuci Mobil Bulanan'],
      brands: ['Bulanan', 'Harian'],
      sizes: ['Indoor Tertutup', 'Kanopi'],
      units: ['bulan', 'hari', 'slot', 'paket'],
    },
  },
};

export function mergeUniqueTaxonomyValues(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((v) => v.trim().toLowerCase()));
  const result = [...existing];
  for (const raw of incoming) {
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

/**
 * Builds structured hierarchical taxonomy items linked to the tenant's actual Categories.
 */
export function buildHierarchicalTaxonomyFromPresets(
  vertical: BusinessVertical,
  categories: Category[]
): CatalogTaxonomy {
  const preset = VERTICAL_TAXONOMY_PRESETS[vertical];
  const productTypeItems: TaxonomyProductType[] = [];
  const brandItems: TaxonomyBrand[] = [];
  const sizeItems: TaxonomySize[] = [];
  const unitItems: TaxonomyUnit[] = [];

  const categoryByName = new Map(
    categories
      .filter((c) => typeof c?.name === 'string' && c.name.trim().length > 0)
      .map((c) => [c.name.trim().toLowerCase(), c])
  );

  // 1. Add global measurement sizes & units
  preset.globalSizes.forEach((sz, idx) => {
    sizeItems.push({
      id: `sz-global-${idx + 1}`,
      categoryId: null,
      productTypeId: null,
      label: sz.label,
      measurementUnit: sz.measurementUnit,
    });
  });

  preset.globalUnits.forEach((u, idx) => {
    unitItems.push({
      id: `unit-global-${idx + 1}`,
      categoryId: null,
      productTypeId: null,
      name: u,
    });
  });

  // 2. Link preset hierarchical groups to matching categories
  let typeSeq = 1;
  let brandSeq = 1;
  let sizeSeq = 1;
  let unitSeq = 1;

  for (const group of preset.hierarchicalPresets) {
    const matchedCat = categoryByName.get(group.categoryName.trim().toLowerCase());
    if (!matchedCat) continue;

    for (const typeDef of group.types) {
      const typeId = `pt-${matchedCat.id}-${typeSeq++}`;
      productTypeItems.push({
        id: typeId,
        categoryId: matchedCat.id,
        name: typeDef.name,
      });

      for (const brandName of typeDef.brands) {
        brandItems.push({
          id: `br-${typeId}-${brandSeq++}`,
          categoryId: matchedCat.id,
          productTypeId: typeId,
          name: brandName,
        });
      }

      if (typeDef.sizes) {
        for (const szLabel of typeDef.sizes) {
          const inferredUnit = inferMeasurementUnit(szLabel);
          sizeItems.push({
            id: `sz-${typeId}-${sizeSeq++}`,
            categoryId: matchedCat.id,
            productTypeId: typeId,
            label: szLabel,
            measurementUnit: inferredUnit,
          });
        }
      }

      if (typeDef.units) {
        for (const uName of typeDef.units) {
          unitItems.push({
            id: `unit-${typeId}-${unitSeq++}`,
            categoryId: matchedCat.id,
            productTypeId: typeId,
            name: uName,
          });
        }
      }
    }
  }

  return syncFlatArraysFromItems({
    productTypes: [...preset.defaultTaxonomy.productTypes],
    brands: [...preset.defaultTaxonomy.brands],
    sizes: [...preset.defaultTaxonomy.sizes],
    units: [...preset.defaultTaxonomy.units],
    productTypeItems,
    brandItems,
    sizeItems,
    unitItems,
  });
}

export function inferMeasurementUnit(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('gsm')) return 'gsm';
  if (lower.includes('kg')) return 'kg';
  if (lower.includes('gram') || lower.includes('gr')) return 'gram';
  if (lower.includes('ml')) return 'ml';
  if (lower.includes('liter') || /\b\d+(\.\d+)?\s*l\b/.test(lower)) return 'liter';
  if (lower.includes('mg')) return 'mg';
  if (lower.includes('oz')) return 'oz';
  return 'pcs';
}

export function syncFlatArraysFromItems(taxonomy: CatalogTaxonomy): CatalogTaxonomy {
  const ptItems = taxonomy.productTypeItems ?? [];
  const brItems = taxonomy.brandItems ?? [];
  const szItems = taxonomy.sizeItems ?? [];
  const unItems = taxonomy.unitItems ?? [];

  return {
    ...taxonomy,
    productTypeItems: ptItems,
    brandItems: brItems,
    sizeItems: szItems,
    unitItems: unItems,
    productTypes: ptItems.length > 0 ? mergeUniqueTaxonomyValues([], ptItems.map((i) => i.name)) : taxonomy.productTypes,
    brands: brItems.length > 0 ? mergeUniqueTaxonomyValues([], brItems.map((i) => i.name)) : taxonomy.brands,
    sizes: szItems.length > 0 ? mergeUniqueTaxonomyValues([], szItems.map((i) => i.label)) : taxonomy.sizes,
    units: unItems.length > 0 ? mergeUniqueTaxonomyValues([], unItems.map((i) => i.name)) : taxonomy.units,
  };
}

/**
 * Returns normalized CatalogTaxonomy guaranteeing populated hierarchical arrays even on legacy workspaces.
 */
export function getEffectiveTaxonomy(
  ws: Pick<TenantWorkspaceData, 'tenant' | 'taxonomy' | 'categories'>
): CatalogTaxonomy {
  const builtDefault = buildHierarchicalTaxonomyFromPresets(ws.tenant.vertical, ws.categories);

  if (!ws.taxonomy) {
    return builtDefault;
  }

  const hasStructured =
    (ws.taxonomy.productTypeItems && ws.taxonomy.productTypeItems.length > 0) ||
    (ws.taxonomy.brandItems && ws.taxonomy.brandItems.length > 0) ||
    (ws.taxonomy.sizeItems && ws.taxonomy.sizeItems.length > 0) ||
    (ws.taxonomy.unitItems && ws.taxonomy.unitItems.length > 0);

  if (!hasStructured) {
    // Migrate legacy flat arrays while preserving preset links
    return syncFlatArraysFromItems({
      ...builtDefault,
      productTypes: mergeUniqueTaxonomyValues(builtDefault.productTypes, ws.taxonomy.productTypes),
      brands: mergeUniqueTaxonomyValues(builtDefault.brands, ws.taxonomy.brands),
      sizes: mergeUniqueTaxonomyValues(builtDefault.sizes, ws.taxonomy.sizes),
      units: mergeUniqueTaxonomyValues(builtDefault.units, ws.taxonomy.units),
    });
  }

  return syncFlatArraysFromItems({
    productTypes: ws.taxonomy.productTypes,
    brands: ws.taxonomy.brands,
    sizes: ws.taxonomy.sizes,
    units: ws.taxonomy.units,
    productTypeItems: ws.taxonomy.productTypeItems ?? [],
    brandItems: ws.taxonomy.brandItems ?? [],
    sizeItems: ws.taxonomy.sizeItems ?? builtDefault.sizeItems ?? [],
    unitItems: ws.taxonomy.unitItems ?? builtDefault.unitItems ?? [],
  });
}

/**
 * Cascading Selector 1: Jenis filtered strictly by selected Category.
 */
export function getProductTypesForCategory(
  taxonomy: CatalogTaxonomy,
  categoryId: string | null | undefined
): TaxonomyProductType[] {
  const items = taxonomy.productTypeItems ?? [];
  if (!categoryId) return items;
  return items.filter((pt) => pt.categoryId === categoryId);
}

/**
 * Cascading Selector 2: Merek filtered by selected Category AND Jenis.
 * If Jenis is selected, returns brands linked to that Jenis OR category-wide brands (productTypeId === null).
 */
export function getBrandsForSelection(
  taxonomy: CatalogTaxonomy,
  categoryId: string | null | undefined,
  productTypeId: string | null | undefined
): TaxonomyBrand[] {
  const items = taxonomy.brandItems ?? [];
  const rawList = (() => {
    if (!categoryId) return items;
    const byCategory = items.filter((b) => b.categoryId === categoryId);
    if (!productTypeId) return byCategory;
    const exactOrCatWide = byCategory.filter(
      (b) => b.productTypeId === productTypeId || b.productTypeId === null
    );
    return exactOrCatWide.length > 0 ? exactOrCatWide : byCategory;
  })();

  const seen = new Set<string>();
  const deduped: TaxonomyBrand[] = [];
  for (const item of rawList) {
    const key = item.name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}

/**
 * Cascading Selector 3: Ukuran / Berat / Spek filtered by Category & Jenis, with global fallback.
 * Specific matches (category+type) are prioritized first; global measurement units remain available.
 */
export function getSizesForSelection(
  taxonomy: CatalogTaxonomy,
  categoryId: string | null | undefined,
  productTypeId: string | null | undefined
): TaxonomySize[] {
  const items = taxonomy.sizeItems ?? [];
  const specific: TaxonomySize[] = [];
  const globalItems: TaxonomySize[] = [];

  for (const item of items) {
    if (item.categoryId === null) {
      globalItems.push(item);
    } else if (categoryId && item.categoryId === categoryId) {
      if (!productTypeId || item.productTypeId === null || item.productTypeId === productTypeId) {
        specific.push(item);
      }
    }
  }

  // Deduplicate by lowercase label, prioritizing specific matches first
  const seen = new Set<string>();
  const combined: TaxonomySize[] = [];
  for (const item of [...specific, ...globalItems]) {
    const key = item.label.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
  return combined;
}

/**
 * Cascading Selector 4: Satuan filtered by Category & Jenis, with global fallback.
 */
export function getUnitsForSelection(
  taxonomy: CatalogTaxonomy,
  categoryId: string | null | undefined,
  productTypeId: string | null | undefined
): TaxonomyUnit[] {
  const items = taxonomy.unitItems ?? [];
  const specific: TaxonomyUnit[] = [];
  const globalItems: TaxonomyUnit[] = [];

  for (const item of items) {
    if (item.categoryId === null) {
      globalItems.push(item);
    } else if (categoryId && item.categoryId === categoryId) {
      if (!productTypeId || item.productTypeId === null || item.productTypeId === productTypeId) {
        specific.push(item);
      }
    }
  }

  const seen = new Set<string>();
  const combined: TaxonomyUnit[] = [];
  for (const item of [...specific, ...globalItems]) {
    const key = item.name.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }
  return combined;
}

export function buildSuggestedProductName(parts: {
  productType?: string;
  brand?: string;
  sizeLabel?: string;
}): string {
  const tokens = [parts.productType, parts.brand, parts.sizeLabel]
    .map((v) => (v ?? '').trim())
    .filter((v) => v.length > 0 && v.toLowerCase() !== 'tanpa merek / curah');
  return tokens.join(' ');
}
