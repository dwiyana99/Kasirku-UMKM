/**
 * KasirAkun UMKM — Indonesian Regional Tax Database & Engine (UU No. 1 Tahun 2022 tentang HKPD / PBJT)
 * Covers 38+ major Kabupaten/Kota across Indonesia with latest 2024–2026 Perda PDRD tariffs & UMKM thresholds.
 *
 * Design rules:
 * - Strictly uses Decimal.js (zero floating-point money).
 * - If a tenant's vertical is NOT a regional PBJT object (e.g., Warung Sembako, Laundry, Manufaktur, Toko Bangunan)
 *   OR the user opts out because their turnover is below the local UMKM exemption threshold (`applyRegionalTax = false`),
 *   regional PBJT resolves to 0% cleanly without disturbing national DJP 2026 taxes.
 * - Master Admin can import/sync latest tariffs or update any region, propagating automatically to tenants.
 */

import Decimal from 'decimal.js';
import type {
  BusinessVertical,
  RegionalPbjtCategory,
  RegionalTaxRule,
  TaxType,
  TenantRegionalTaxSettings,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const INDONESIA_REGIONAL_TAX_VERSION = 'UU-HKPD-2026.1';

/**
 * Maps each UMKM vertical to its applicable Indonesian Regional Tax (PBJT) object category.
 */
export function getVerticalPbjtCategory(vertical: BusinessVertical): RegionalPbjtCategory {
  switch (vertical) {
    case 'RESTORAN':
    case 'KEDAI_MAKAN':
    case 'BAKERY_CATERING':
      return 'FOOD_BEVERAGE';
    case 'HOMESTAY_VILLA':
      return 'HOSPITALITY';
    case 'SPA_WELLNESS':
      return 'ENTERTAINMENT_SPA';
    case 'SEWA_GARASI':
      return 'PARKING';
    case 'SEWA_LAPANGAN':
      return 'SPORTS';
    default:
      return 'NONE';
  }
}

export function getRegionalPbjtCategoryLabel(cat: RegionalPbjtCategory): string {
  switch (cat) {
    case 'FOOD_BEVERAGE':
      return 'PBJT Makanan & Minuman (PB1)';
    case 'HOSPITALITY':
      return 'PBJT Jasa Perhotelan / Homestay / Villa';
    case 'ENTERTAINMENT_SPA':
      return 'PBJT Jasa Kesenian & Hiburan (SPA / Mandi Uap)';
    case 'PARKING':
      return 'PBJT Jasa Parkir Komersial';
    case 'SPORTS':
      return 'PBJT Olahraga / Hiburan Daerah';
    default:
      return 'Bukan Objek Pajak Daerah (PBJT 0%)';
  }
}

const UPDATED_AT = '2026-01-15T00:00:00.000Z';

function makeRegion(
  regionCode: string,
  province: string,
  cityName: string,
  opts?: Partial<Omit<RegionalTaxRule, 'regionCode' | 'province' | 'cityName'>>
): RegionalTaxRule {
  return {
    regionCode,
    province,
    cityName,
    pbjtFoodBeverageRate: opts?.pbjtFoodBeverageRate ?? '0.10',
    pbjtHospitalityRate: opts?.pbjtHospitalityRate ?? '0.10',
    pbjtEntertainmentSpaRate: opts?.pbjtEntertainmentSpaRate ?? '0.40',
    pbjtParkingRate: opts?.pbjtParkingRate ?? '0.10',
    pbjtSportsRate: opts?.pbjtSportsRate ?? '0.00',
    umkmExemptMonthlyThreshold: opts?.umkmExemptMonthlyThreshold ?? '5000000.0000',
    perdaReference: opts?.perdaReference ?? `Perda PDRD ${cityName} (UU HKPD No. 1/2022)`,
    notes:
      opts?.notes ??
      'PBJT 10% untuk Makanan/Minuman, Perhotelan & Parkir komersial; UMKM di bawah batas omzet daerah dapat dikecualikan.',
    isActive: opts?.isActive ?? true,
    updatedAt: opts?.updatedAt ?? UPDATED_AT,
  };
}

/**
 * Comprehensive default dataset covering 38 major Indonesian cities/regencies across Sumatra, Java, Bali,
 * Nusa Tenggara, Kalimantan, Sulawesi, Maluku & Papua.
 */
export const DEFAULT_INDONESIA_REGIONAL_TAXES: RegionalTaxRule[] = [
  // Opsi Bebas / Non-PBJT
  makeRegion('ID-NONE', 'Umum / Nasional', 'Tanpa Pajak Daerah (UMKM Dikecualikan)', {
    pbjtFoodBeverageRate: '0.00',
    pbjtHospitalityRate: '0.00',
    pbjtEntertainmentSpaRate: '0.00',
    pbjtParkingRate: '0.00',
    pbjtSportsRate: '0.00',
    umkmExemptMonthlyThreshold: '0.0000',
    perdaReference: 'Pengecualian UMKM / Non-Objek PBJT Daerah',
    notes: 'Gunakan opsi ini jika usaha Anda tidak termasuk objek pajak daerah atau dibebaskan Perda setempat.',
  }),
  // DKI Jakarta & Jabodetabek
  makeRegion('ID-JK-JKT', 'DKI Jakarta', 'Jakarta (Seluruh Wilayah DKI)', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.40',
    pbjtParkingRate: '0.10',
    umkmExemptMonthlyThreshold: '200000000.0000', // Rp200jt/tahun ~ Rp16.6jt/bln, Perda 1/2024 DKI
    perdaReference: 'Perda Prov. DKI Jakarta No. 1 Tahun 2024 (PDRD)',
    notes: 'PBJT Restoran & Hotel 10%; usaha kuliner omzet s.d. Rp200jt/tahun dibebaskan PBJT (Perda 1/2024). SPA 40% (insentif sesuai SK Gubernur).',
  }),
  makeRegion('ID-JB-BGR', 'Jawa Barat', 'Kota Bogor', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Bogor No. 11 Tahun 2023',
  }),
  makeRegion('ID-JB-DPK', 'Jawa Barat', 'Kota Depok', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Depok No. 1 Tahun 2024',
  }),
  makeRegion('ID-JB-BKS', 'Jawa Barat', 'Kota Bekasi', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Bekasi No. 1 Tahun 2024',
  }),
  makeRegion('ID-BT-TNG', 'Banten', 'Kota Tangerang', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Tangerang No. 10 Tahun 2023',
  }),
  makeRegion('ID-BT-TGS', 'Banten', 'Kota Tangerang Selatan', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '15000000.0000',
    perdaReference: 'Perda Kota Tangerang Selatan No. 1 Tahun 2024',
  }),
  // Jawa Barat, Jateng, DIY, Jatim
  makeRegion('ID-JB-BDG', 'Jawa Barat', 'Kota Bandung', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.40',
    pbjtParkingRate: '0.10',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Bandung No. 1 Tahun 2024',
    notes: 'PBJT Makanan/Minuman & Perhotelan 10%; warung/kedai mikro di bawah ambang batas dibebaskan.',
  }),
  makeRegion('ID-JB-CBN', 'Jawa Barat', 'Kota Cirebon', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-JT-SMG', 'Jawa Tengah', 'Kota Semarang', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Semarang No. 8 Tahun 2023',
  }),
  makeRegion('ID-JT-SLO', 'Jawa Tengah', 'Kota Surakarta (Solo)', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '5000000.0000',
    perdaReference: 'Perda Kota Surakarta No. 14 Tahun 2023',
  }),
  makeRegion('ID-YO-YOG', 'DI Yogyakarta', 'Kota Yogyakarta', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
    perdaReference: 'Perda Kota Yogyakarta No. 10 Tahun 2023',
    notes: 'Homestay, guest house & resto wajib PBJT 10% terpisah dari omzet; angkringan/UMKM mikro dibebaskan.',
  }),
  makeRegion('ID-YO-SLM', 'DI Yogyakarta', 'Kabupaten Sleman', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
    perdaReference: 'Perda Kab. Sleman No. 7 Tahun 2023',
  }),
  makeRegion('ID-JI-SBY', 'Jawa Timur', 'Kota Surabaya', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.40',
    pbjtParkingRate: '0.10',
    umkmExemptMonthlyThreshold: '15000000.0000',
    perdaReference: 'Perda Kota Surabaya No. 7 Tahun 2023',
    notes: 'PBJT Restoran & Hotel 10%; usaha kuliner omzet di bawah Rp15jt/bulan dikecualikan PBJT.',
  }),
  makeRegion('ID-JI-MLG', 'Jawa Timur', 'Kota Malang', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
    perdaReference: 'Perda Kota Malang No. 4 Tahun 2023',
  }),
  makeRegion('ID-JI-SDA', 'Jawa Timur', 'Kabupaten Sidoarjo', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
  }),
  // Bali & Nusa Tenggara
  makeRegion('ID-BA-DPS', 'Bali', 'Kota Denpasar', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.15', // Insentif pariwisata SPA Bali
    pbjtParkingRate: '0.10',
    umkmExemptMonthlyThreshold: '5000000.0000',
    perdaReference: 'Perda Kota Denpasar No. 7 Tahun 2023 & Insentif Pariwisata Bali',
    notes: 'Villa, Homestay & Restoran 10% PBJT; SPA wellness mendukung tarif insentif pariwisata daerah (dapat disesuaikan).',
  }),
  makeRegion('ID-BA-BDG', 'Bali', 'Kabupaten Badung (Kuta / Canggu / Seminyak / Nusa Dua)', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.15',
    pbjtParkingRate: '0.10',
    umkmExemptMonthlyThreshold: '5000000.0000',
    perdaReference: 'Perda Kab. Badung No. 7 Tahun 2023 (PBJT Pariwisata)',
    notes: 'Tarif PBJT Villa/Homestay & Restoran 10% terpisah dari omzet & komisi OTA (Airbnb/Traveloka).',
  }),
  makeRegion('ID-BA-GYR', 'Bali', 'Kabupaten Gianyar (Ubud / Sanur Timur)', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.15',
    umkmExemptMonthlyThreshold: '5000000.0000',
    perdaReference: 'Perda Kab. Gianyar No. 7 Tahun 2023',
  }),
  makeRegion('ID-NB-MTR', 'Nusa Tenggara Barat', 'Kota Mataram', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-NB-LBR', 'Nusa Tenggara Barat', 'Kabupaten Lombok Barat (Senggigi / Sekotong)', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-NT-KPG', 'Nusa Tenggara Timur', 'Kota Kupang', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  // Sumatra
  makeRegion('ID-AC-BNA', 'Aceh', 'Kota Banda Aceh', {
    pbjtEntertainmentSpaRate: '0.10',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-SU-MDN', 'Sumatera Utara', 'Kota Medan', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Medan No. 1 Tahun 2024',
  }),
  makeRegion('ID-SB-PDG', 'Sumatera Barat', 'Kota Padang', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-RI-PKU', 'Riau', 'Kota Pekanbaru', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
  }),
  makeRegion('ID-KR-BTM', 'Kepulauan Riau', 'Kota Batam', {
    pbjtFoodBeverageRate: '0.10',
    pbjtHospitalityRate: '0.10',
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Batam No. 1 Tahun 2024',
  }),
  makeRegion('ID-JA-JMB', 'Jambi', 'Kota Jambi', {
    pbjtEntertainmentSpaRate: '0.25',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-SS-PLG', 'Sumatera Selatan', 'Kota Palembang', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
  }),
  makeRegion('ID-BE-BKL', 'Bengkulu', 'Kota Bengkulu', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-LA-BDL', 'Lampung', 'Kota Bandar Lampung', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
  }),
  // Kalimantan
  makeRegion('ID-KB-PTK', 'Kalimantan Barat', 'Kota Pontianak', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-KS-BJM', 'Kalimantan Selatan', 'Kota Banjarmasin', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-KI-BPN', 'Kalimantan Timur', 'Kota Balikpapan', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Balikpapan No. 8 Tahun 2023',
  }),
  makeRegion('ID-KI-SMD', 'Kalimantan Timur', 'Kota Samarinda', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '7500000.0000',
  }),
  // Sulawesi, Maluku & Papua
  makeRegion('ID-SN-MKS', 'Sulawesi Selatan', 'Kota Makassar', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '10000000.0000',
    perdaReference: 'Perda Kota Makassar No. 1 Tahun 2024',
  }),
  makeRegion('ID-SA-MDO', 'Sulawesi Utara', 'Kota Manado', {
    pbjtEntertainmentSpaRate: '0.40',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-ST-PLU', 'Sulawesi Tengah', 'Kota Palu', {
    pbjtEntertainmentSpaRate: '0.25',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-SG-KDI', 'Sulawesi Tenggara', 'Kota Kendari', {
    pbjtEntertainmentSpaRate: '0.25',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-MA-AMB', 'Maluku', 'Kota Ambon', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
  makeRegion('ID-PA-JYP', 'Papua', 'Kota Jayapura', {
    pbjtEntertainmentSpaRate: '0.20',
    umkmExemptMonthlyThreshold: '5000000.0000',
  }),
];

export function getRegionalTaxRuleByCode(
  regionCode: string | undefined | null,
  registry: RegionalTaxRule[] = DEFAULT_INDONESIA_REGIONAL_TAXES
): RegionalTaxRule {
  const found = registry.find((r) => r.regionCode === regionCode);
  return found ?? registry[0];
}

export function buildDefaultTenantRegionalTax(
  vertical: BusinessVertical,
  regionCode = 'ID-JK-JKT',
  registry: RegionalTaxRule[] = DEFAULT_INDONESIA_REGIONAL_TAXES
): TenantRegionalTaxSettings {
  const rule = getRegionalTaxRuleByCode(regionCode, registry);
  const category = getVerticalPbjtCategory(vertical);
  // Only enable regional PBJT by default for clear PBJT verticals & non-exempt region
  const autoApply =
    rule.regionCode !== 'ID-NONE' &&
    (category === 'FOOD_BEVERAGE' ||
      category === 'HOSPITALITY' ||
      category === 'ENTERTAINMENT_SPA');

  return {
    regionCode: rule.regionCode,
    province: rule.province,
    cityName: rule.cityName,
    applyRegionalTax: autoApply,
    customRateOverride: null,
    lastSyncedAt: new Date().toISOString(),
  };
}

export interface EffectiveRegionalTaxResolution {
  applies: boolean;
  category: RegionalPbjtCategory;
  taxType: TaxType;
  rateDecimal: string; // e.g. '0.10'
  ratePercentLabel: string; // e.g. '10%'
  taxLabel: string;
  perdaReference: string;
  regionName: string;
  exemptionNote: string;
}

/**
 * Resolves the exact regional PBJT rate for a given vertical + tenant domicile + master admin registry.
 */
export function resolveEffectiveRegionalTax(
  vertical: BusinessVertical,
  tenantRegionalTax?: TenantRegionalTaxSettings | null,
  registry: RegionalTaxRule[] = DEFAULT_INDONESIA_REGIONAL_TAXES
): EffectiveRegionalTaxResolution {
  const category = getVerticalPbjtCategory(vertical);
  const rule = getRegionalTaxRuleByCode(tenantRegionalTax?.regionCode ?? 'ID-NONE', registry);

  if (category === 'NONE') {
    const customOverride = tenantRegionalTax?.customRateOverride
      ? new Decimal(tenantRegionalTax.customRateOverride || '0')
      : new Decimal(0);
    if (
      tenantRegionalTax?.applyRegionalTax &&
      tenantRegionalTax.regionCode !== 'ID-NONE' &&
      customOverride.gt(0)
    ) {
      const pctNum = customOverride.times(100).toDecimalPlaces(2).toString();
      const customLabel =
        tenantRegionalTax.customTaxName?.trim() || 'Pajak / Retribusi Daerah Khusus';
      return {
        applies: true,
        category,
        taxType: 'PBJT_HOTEL_10',
        rateDecimal: customOverride.toFixed(4),
        ratePercentLabel: `${pctNum}%`,
        taxLabel: `${customLabel} ${pctNum}% (${rule.cityName})`,
        perdaReference: rule.perdaReference,
        regionName: rule.cityName,
        exemptionNote: `Pungutan daerah tambahan aktif sesuai pengaturan Perda ${rule.cityName}.`,
      };
    }

    return {
      applies: false,
      category,
      taxType: 'NONE',
      rateDecimal: '0.00',
      ratePercentLabel: '0%',
      taxLabel: 'Bukan Objek Pajak Daerah (PBJT)',
      perdaReference: 'UU HKPD No. 1/2022',
      regionName: rule.cityName,
      exemptionNote:
        'Jenis usaha ini secara bawaan tidak dikenakan PBJT daerah; hanya mengikuti PPh/PPN nasional (dapat ditambah tarif Perda khusus jika berlaku di daerah Anda).',
    };
  }

  // If tenant explicitly disabled regional tax (UMKM exempt/ignored) or chose ID-NONE
  if (tenantRegionalTax && (!tenantRegionalTax.applyRegionalTax || tenantRegionalTax.regionCode === 'ID-NONE')) {
    return {
      applies: false,
      category,
      taxType: 'NONE',
      rateDecimal: '0.00',
      ratePercentLabel: '0%',
      taxLabel: 'Pajak Daerah Diabaikan (UMKM Dikecualikan)',
      perdaReference: rule.perdaReference,
      regionName: rule.cityName,
      exemptionNote: 'Pajak daerah dinonaktifkan untuk usaha ini (di bawah batas omzet Perda / pengecualian UMKM).',
    };
  }

  let rawRate = '0.00';
  let taxType: TaxType = 'NONE';
  if (category === 'FOOD_BEVERAGE') {
    rawRate = tenantRegionalTax?.customRateOverride ?? (rule.regionCode === 'ID-NONE' ? '0.10' : rule.pbjtFoodBeverageRate);
    taxType = 'PB1_RESTO_10';
  } else if (category === 'HOSPITALITY') {
    rawRate = tenantRegionalTax?.customRateOverride ?? (rule.regionCode === 'ID-NONE' ? '0.10' : rule.pbjtHospitalityRate);
    taxType = 'PBJT_HOTEL_10';
  } else if (category === 'ENTERTAINMENT_SPA') {
    rawRate = tenantRegionalTax?.customRateOverride ?? (rule.regionCode === 'ID-NONE' ? '0.15' : rule.pbjtEntertainmentSpaRate);
    taxType = 'PBJT_SPA_HIBURAN';
  } else if (category === 'PARKING') {
    rawRate = tenantRegionalTax?.customRateOverride ?? (rule.regionCode === 'ID-NONE' ? '0.00' : rule.pbjtParkingRate);
    taxType = 'PBJT_PARKIR';
  } else if (category === 'SPORTS') {
    rawRate = tenantRegionalTax?.customRateOverride ?? rule.pbjtSportsRate;
    taxType = new Decimal(rawRate || '0').gt(0) ? 'PBJT_SPA_HIBURAN' : 'NONE';
  }

  const rateDec = new Decimal(rawRate || '0');
  if (rateDec.lte(0)) {
    return {
      applies: false,
      category,
      taxType: 'NONE',
      rateDecimal: '0.00',
      ratePercentLabel: '0%',
      taxLabel: 'PBJT Daerah 0% (Bebas Pajak Daerah)',
      perdaReference: rule.perdaReference,
      regionName: rule.cityName,
      exemptionNote: rule.notes,
    };
  }

  const pctNum = rateDec.times(100).toDecimalPlaces(2).toString();
  const customName = tenantRegionalTax?.customTaxName?.trim();
  const baseLabel = customName
    ? `${customName} ${pctNum}%`
    : category === 'FOOD_BEVERAGE'
    ? `PBJT Makanan/Minuman ${pctNum}%`
    : category === 'HOSPITALITY'
    ? `PBJT Perhotelan/Villa ${pctNum}%`
    : category === 'ENTERTAINMENT_SPA'
    ? `PBJT SPA & Hiburan ${pctNum}%`
    : category === 'PARKING'
    ? `PBJT Parkir/Garasi ${pctNum}%`
    : `PBJT Olahraga / Daerah ${pctNum}%`;

  return {
    applies: true,
    category,
    taxType,
    rateDecimal: rateDec.toFixed(4),
    ratePercentLabel: `${pctNum}%`,
    taxLabel: `${baseLabel} (${rule.cityName})`,
    perdaReference: rule.perdaReference,
    regionName: rule.cityName,
    exemptionNote: rule.notes,
  };
}

export interface TaxProfilePreviewSummary {
  nationalLabel: string;
  nationalDetail: string;
  regionalResolution: EffectiveRegionalTaxResolution;
  hasStandardPbjtCategory: boolean;
  monthlyThresholdRupiah: string;
}

/**
 * Generates a human-readable Indonesian preview of BOTH National (DJP 2026)
 * and Regional (Perda / UU HKPD) taxes based on user domicile + business vertical.
 */
export function describeNationalAndRegionalTaxSummary(params: {
  vertical: BusinessVertical;
  taxEntity: 'WP_OP' | 'PT_PERORANGAN' | 'CV_FIRMA' | 'PT_BIASA';
  isPkp: boolean;
  regionalTax?: TenantRegionalTaxSettings | null;
  registry?: RegionalTaxRule[];
}): TaxProfilePreviewSummary {
  const registry = params.registry ?? DEFAULT_INDONESIA_REGIONAL_TAXES;
  const regionalResolution = resolveEffectiveRegionalTax(
    params.vertical,
    params.regionalTax,
    registry
  );
  const rule = getRegionalTaxRuleByCode(params.regionalTax?.regionCode ?? 'ID-NONE', registry);
  const category = getVerticalPbjtCategory(params.vertical);

  let nationalLabel = 'PPh Final UMKM 0,5% (PP 20/2026)';
  let nationalDetail =
    params.taxEntity === 'WP_OP'
      ? 'WP Orang Pribadi bebas PPh Final untuk omzet kumulatif sampai Rp500 juta/tahun, selebihnya 0,5%.'
      : params.taxEntity === 'PT_PERORANGAN'
      ? 'PT Perorangan dikenakan PPh Final 0,5% selama omzet <= Rp4,8 miliar/tahun.'
      : 'Mengikuti tarif PPh Badan / Tarif Umum sesuai ketentuan DJP 2026.';

  if (params.vertical === 'KOST_KONTRAKAN') {
    nationalLabel = 'PPh Final Sewa Bangunan Pasal 4(2) 10%';
    nationalDetail =
      'Pendapatan sewa kamar kost/kontrakan dihitung PPh Final Pasal 4(2) 10% terpisah dari uang jaminan/deposit.';
  } else if (params.vertical === 'FREELANCE') {
    nationalLabel = 'PPh 21 / PPh 23 Jasa (Pasal 56)';
    nationalDetail =
      'Penghasilan jasa profesional mengikuti skema PPh 21/23 atau norma penghitungan sesuai status NPWP/PKP.';
  }

  if (params.isPkp) {
    nationalLabel += ' + PPN 11% Efektif';
    nationalDetail += ' Status PKP aktif: pungut PPN 12% x DPP Nilai Lain 11/12 (11% efektif).';
  }

  const thresholdNum = new Decimal(rule.umkmExemptMonthlyThreshold || '0').toDecimalPlaces(0).toNumber();
  const monthlyThresholdRupiah =
    thresholdNum > 0 ? `Rp${thresholdNum.toLocaleString('id-ID')}/bln` : 'Mengikuti Perda setempat';

  return {
    nationalLabel,
    nationalDetail,
    regionalResolution,
    hasStandardPbjtCategory: category !== 'NONE',
    monthlyThresholdRupiah,
  };
}

/**
 * Merges latest preset Indonesia regional tax rules into an existing Master Admin registry
 * while preserving any custom regions added by Master Admin.
 */
export function mergeLatestRegionalTaxRegistry(existing: RegionalTaxRule[]): RegionalTaxRule[] {
  const now = new Date().toISOString();
  const byCode = new Map<string, RegionalTaxRule>();
  for (const r of existing) {
    byCode.set(r.regionCode, r);
  }
  for (const preset of DEFAULT_INDONESIA_REGIONAL_TAXES) {
    byCode.set(preset.regionCode, {
      ...preset,
      updatedAt: now,
    });
  }
  return Array.from(byCode.values());
}
