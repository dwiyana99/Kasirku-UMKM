/**
 * KasirAkun UMKM — Layanan Deteksi & Rekomendasi Pajak Daerah (Perda / UU HKPD No. 1/2022)
 *
 * Fitur:
 * 1. Deteksi wilayah Perda otomatis dari koordinat GPS (Haversine) atau teks lokasi (kota/kabupaten/kecamatan/area).
 * 2. Rekomendasi modul pajak daerah & pengecualian UMKM berdasarkan kombinasi (Wilayah x Jenis Usaha).
 * 3. Integrasi langsung ke mesin akuntansi otomatis (akun Liabilitas 2103 Utang PBJT Daerah terpisah dari Omzet 4101/4104 & PPN 2102).
 */

import Decimal from 'decimal.js';
import type {
  BusinessVertical,
  RegionalTaxRule,
  TaxEntityType,
  TenantRegionalTaxSettings,
} from '../../types/domain';
import {
  DEFAULT_INDONESIA_REGIONAL_TAXES,
  describeNationalAndRegionalTaxSummary,
  getRegionalTaxRuleByCode,
  getVerticalPbjtCategory,
} from './regional-tax-indonesia';

export interface RegionGeoMetadata {
  regionCode: string;
  lat: number;
  lng: number;
  aliases: string[]; // Kecamatan, kawasan wisata, atau nama umum
}

/**
 * Koordinat & alias area populer untuk 38+ kota/kabupaten dalam database Perda Indonesia.
 */
export const INDONESIA_REGION_GEO_INDEX: RegionGeoMetadata[] = [
  { regionCode: 'ID-JK-JKT', lat: -6.2088, lng: 106.8456, aliases: ['jakarta', 'jaksel', 'jakpus', 'jakbar', 'jakut', 'jaktim', 'tebet', 'kemang', 'sudirman', 'senopati', 'pik', 'kelapa gading', 'menteng', 'kuningan', 'setiabudi'] },
  { regionCode: 'ID-JB-BDG', lat: -6.9175, lng: 107.6191, aliases: ['bandung', 'dago', 'braga', 'riau', 'cibeunying', 'coblong', 'buah batu', 'pasteur', 'antapani'] },
  { regionCode: 'ID-JB-BGR', lat: -6.5971, lng: 106.806, aliases: ['bogor', 'pajajaran', 'sentul', 'cibinong', 'puncak'] },
  { regionCode: 'ID-JB-BKS', lat: -6.2383, lng: 106.9756, aliases: ['bekasi', 'summarecon bekasi', 'cikarang', 'galaxy', 'jatiasih'] },
  { regionCode: 'ID-JB-DPK', lat: -6.4025, lng: 106.7942, aliases: ['depok', 'margonda', 'cinere', 'beji', 'sawangan'] },
  { regionCode: 'ID-JB-CBN', lat: -6.732, lng: 108.5523, aliases: ['cirebon', 'kesambi', 'kejaksan', 'harjamukti'] },
  { regionCode: 'ID-BT-TNG', lat: -6.1783, lng: 106.6319, aliases: ['tangerang', 'karawaci', 'cikupa', 'ciledug'] },
  { regionCode: 'ID-BT-TGS', lat: -6.2886, lng: 106.7179, aliases: ['tangsel', 'tangerang selatan', 'bsd', 'bintaro', 'serpong', 'alam sutera', 'pamulang', 'ciputat'] },
  { regionCode: 'ID-JT-SMG', lat: -6.9667, lng: 110.4167, aliases: ['semarang', 'simpang lima', 'tembalang', 'banyumanik', 'ungaran'] },
  { regionCode: 'ID-JT-SLO', lat: -7.5755, lng: 110.8243, aliases: ['solo', 'surakarta', 'laweyan', 'manahan', 'jebres', 'slametriyadi'] },
  { regionCode: 'ID-YO-YOG', lat: -7.7956, lng: 110.3695, aliases: ['jogja', 'yogya', 'yogyakarta', 'malioboro', 'prawirotaman', 'kotabaru', 'umbulharjo'] },
  { regionCode: 'ID-YO-SLM', lat: -7.7156, lng: 110.3556, aliases: ['sleman', 'seturan', 'kaliurang', 'condongcatur', 'pogung', 'babarsari', 'mlati', 'depok sleman'] },
  { regionCode: 'ID-JI-SBY', lat: -7.2575, lng: 112.7521, aliases: ['surabaya', 'gubeng', 'rungkut', 'citraland', 'tunjungan', 'wonokromo', 'sukolilo', 'pakuwon'] },
  { regionCode: 'ID-JI-MLG', lat: -7.9666, lng: 112.6326, aliases: ['malang', 'lowokwaru', 'suhat', 'soekarno hatta malang', 'klojen', 'batu'] },
  { regionCode: 'ID-JI-SDA', lat: -7.4478, lng: 112.7183, aliases: ['sidoarjo', 'waru', 'juanda', 'krian'] },
  { regionCode: 'ID-BA-DPS', lat: -8.6705, lng: 115.2126, aliases: ['denpasar', 'sanur', 'renon', 'teuku umar', 'sesetan'] },
  { regionCode: 'ID-BA-BDG', lat: -8.5819, lng: 115.1771, aliases: ['badung', 'kuta', 'canggu', 'seminyak', 'nusa dua', 'jimbaran', 'uluwatu', 'legian', 'kerobokan', 'berawa', 'pererenan'] },
  { regionCode: 'ID-BA-GYR', lat: -8.5069, lng: 115.2625, aliases: ['gianyar', 'ubud', 'tegallalang', 'sayan', 'mas ubud'] },
  { regionCode: 'ID-NB-MTR', lat: -8.5833, lng: 116.1167, aliases: ['mataram', 'cakranegara', 'ampenan'] },
  { regionCode: 'ID-NB-LBR', lat: -8.4969, lng: 116.0462, aliases: ['lombok barat', 'senggigi', 'sekotong', 'gili', 'lombok'] },
  { regionCode: 'ID-NT-KPG', lat: -10.1772, lng: 123.607, aliases: ['kupang', 'oebobo', 'kelapa lima'] },
  { regionCode: 'ID-AC-BNA', lat: 5.5483, lng: 95.3238, aliases: ['banda aceh', 'aceh', 'syiah kuala'] },
  { regionCode: 'ID-SU-MDN', lat: 3.5952, lng: 98.6722, aliases: ['medan', 'polonia', 'petisah', 'sunggal', 'deli serdang'] },
  { regionCode: 'ID-SB-PDG', lat: -0.9471, lng: 100.4172, aliases: ['padang', 'bukittinggi', 'sumbar'] },
  { regionCode: 'ID-RI-PKU', lat: 0.5071, lng: 101.4478, aliases: ['pekanbaru', 'panam', 'marpoyan'] },
  { regionCode: 'ID-KR-BTM', lat: 1.0456, lng: 104.0305, aliases: ['batam', 'nagoya', 'batam center', 'harbour bay'] },
  { regionCode: 'ID-JA-JMB', lat: -1.6101, lng: 103.6131, aliases: ['jambi', 'telanaipura'] },
  { regionCode: 'ID-SS-PLG', lat: -2.9761, lng: 104.7754, aliases: ['palembang', 'ilir', 'jakabaring'] },
  { regionCode: 'ID-BE-BKL', lat: -3.7928, lng: 102.2608, aliases: ['bengkulu'] },
  { regionCode: 'ID-LA-BDL', lat: -5.4292, lng: 105.261, aliases: ['bandar lampung', 'lampung', 'tanjung karang'] },
  { regionCode: 'ID-KB-PTK', lat: -0.0263, lng: 109.3425, aliases: ['pontianak', 'kalbar'] },
  { regionCode: 'ID-KS-BJM', lat: -3.3194, lng: 114.5908, aliases: ['banjarmasin', 'banjarbaru', 'kalsel'] },
  { regionCode: 'ID-KI-BPN', lat: -1.2379, lng: 116.8529, aliases: ['balikpapan', 'ikn', 'nusantara'] },
  { regionCode: 'ID-KI-SMD', lat: -0.5022, lng: 117.1536, aliases: ['samarinda', 'kaltim'] },
  { regionCode: 'ID-SN-MKS', lat: -5.1477, lng: 119.4327, aliases: ['makassar', 'panakkukang', 'losari', 'gowa'] },
  { regionCode: 'ID-SA-MDO', lat: 1.4748, lng: 124.8421, aliases: ['manado', 'bunaken', 'sulut'] },
  { regionCode: 'ID-ST-PLU', lat: -0.8917, lng: 119.8707, aliases: ['palu', 'sulteng'] },
  { regionCode: 'ID-SG-KDI', lat: -3.9985, lng: 122.5129, aliases: ['kendari', 'sultra'] },
  { regionCode: 'ID-MA-AMB', lat: -3.6954, lng: 128.1814, aliases: ['ambon', 'maluku'] },
  { regionCode: 'ID-PA-JYP', lat: -2.5916, lng: 140.669, aliases: ['jayapura', 'abepura', 'papua'] },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface DetectedRegionMatch {
  region: RegionalTaxRule;
  source: 'GEOLOCATION' | 'LOCATION_TEXT';
  distanceKm?: number;
  matchedKeyword?: string;
  explanation: string;
}

/**
 * Mendeteksi wilayah Perda terdekat dari koordinat GPS pengguna (browser Geolocation).
 */
export function detectRegionFromCoordinates(
  lat: number,
  lng: number,
  registry: RegionalTaxRule[] = DEFAULT_INDONESIA_REGIONAL_TAXES
): DetectedRegionMatch | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let bestMeta: RegionGeoMetadata | null = null;
  let bestDist = Infinity;

  for (const meta of INDONESIA_REGION_GEO_INDEX) {
    const existsInRegistry = registry.some((r) => r.regionCode === meta.regionCode);
    if (!existsInRegistry) continue;
    const dist = haversineKm(lat, lng, meta.lat, meta.lng);
    if (dist < bestDist) {
      bestDist = dist;
      bestMeta = meta;
    }
  }

  if (!bestMeta) return null;
  const region = getRegionalTaxRuleByCode(bestMeta.regionCode, registry);
  const roundedKm = Math.round(bestDist * 10) / 10;

  return {
    region,
    source: 'GEOLOCATION',
    distanceKm: roundedKm,
    explanation:
      roundedKm <= 120
        ? `Lokasi terdeteksi di sekitar ${region.cityName} (${region.province}), jarak ~${roundedKm} km dari pusat wilayah Perda.`
        : `Wilayah Perda terdekat yang ditemukan: ${region.cityName} (${region.province}). Anda dapat menyesuaikan kota secara manual bila diperlukan.`,
  };
}

/**
 * Mendeteksi wilayah Perda secara cerdas dari nama kota, kabupaten, kecamatan, kawasan, atau alamat usaha.
 */
export function detectRegionFromLocationText(
  query: string,
  registry: RegionalTaxRule[] = DEFAULT_INDONESIA_REGIONAL_TAXES
): DetectedRegionMatch | null {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return null;

  const hasWordBoundary = (haystack: string, needle: string): boolean => {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  };

  let bestScore = -Infinity;
  let bestMatch: DetectedRegionMatch | null = null;
  const consider = (score: number, match: DetectedRegionMatch) => {
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  };

  // 1. Cek kecocokan terhadap kode wilayah atau nama kota/kabupaten di registry
  for (const rule of registry) {
    if (rule.regionCode === 'ID-NONE') continue;
    const cityLower = rule.cityName.toLowerCase();
    const provLower = rule.province.toLowerCase();

    if (normalized === rule.regionCode.toLowerCase() || normalized.includes(rule.regionCode.toLowerCase())) {
      consider(1000 + rule.regionCode.length, {
        region: rule,
        source: 'LOCATION_TEXT',
        matchedKeyword: rule.regionCode,
        explanation: `Wilayah Perda terdeteksi dari kode ${rule.regionCode}: ${rule.cityName} (${rule.province}).`,
      });
    }

    if (normalized === cityLower || normalized.includes(cityLower)) {
      consider(500 + cityLower.length, {
        region: rule,
        source: 'LOCATION_TEXT',
        matchedKeyword: rule.cityName,
        explanation: `Wilayah Perda terdeteksi otomatis: ${rule.cityName} (${rule.province}).`,
      });
    } else if (normalized.length >= 4 && cityLower.includes(normalized)) {
      consider(200 + normalized.length, {
        region: rule,
        source: 'LOCATION_TEXT',
        matchedKeyword: rule.cityName,
        explanation: `Wilayah Perda terdeteksi otomatis: ${rule.cityName} (${rule.province}).`,
      });
    }

    const strippedCity = cityLower
      .replace(/^(kota|kabupaten)\s+/i, '')
      .replace(/\s*\(.*\)$/, '')
      .trim();
    if (strippedCity.length >= 4 && normalized.includes(strippedCity)) {
      const boundaryBonus = hasWordBoundary(normalized, strippedCity) ? 120 : 0;
      consider(260 + boundaryBonus + strippedCity.length * 4, {
        region: rule,
        source: 'LOCATION_TEXT',
        matchedKeyword: strippedCity,
        explanation: `Wilayah Perda terdeteksi dari kata kunci "${strippedCity}": ${rule.cityName} (${rule.province}).`,
      });
    }

    if (provLower.length >= 4 && normalized === provLower) {
      consider(250 + provLower.length, {
        region: rule,
        source: 'LOCATION_TEXT',
        matchedKeyword: rule.province,
        explanation: `Wilayah Perda provinsi ${rule.province} diarahkan ke ${rule.cityName}.`,
      });
    }
  }

  // 2. Cek alias kecamatan / kawasan populer (pilih kecocokan kata penuh & terpanjang)
  for (const meta of INDONESIA_REGION_GEO_INDEX) {
    const rule = registry.find((r) => r.regionCode === meta.regionCode);
    if (!rule) continue;

    for (const alias of meta.aliases) {
      if (normalized === alias) {
        consider(900 + alias.length * 5, {
          region: rule,
          source: 'LOCATION_TEXT',
          matchedKeyword: alias,
          explanation: `Kawasan "${alias}" masuk wilayah ${rule.cityName} (${rule.province}).`,
        });
      } else if (normalized.includes(alias)) {
        const isWholeWord = hasWordBoundary(normalized, alias);
        // Penalize short generic words like "batu" when embedded inside a street name ("Batu Bolong")
        const streetPenalty =
          alias === 'batu' && (normalized.includes('batu bolong') || normalized.includes('buah batu'))
            ? -300
            : 0;
        const score = (isWholeWord ? 360 : 180) + alias.length * 10 + streetPenalty;
        consider(score, {
          region: rule,
          source: 'LOCATION_TEXT',
          matchedKeyword: alias,
          explanation: `Kawasan "${alias}" masuk wilayah ${rule.cityName} (${rule.province}).`,
        });
      } else if (normalized.length >= 3 && alias.includes(normalized)) {
        consider(150 + normalized.length * 4, {
          region: rule,
          source: 'LOCATION_TEXT',
          matchedKeyword: alias,
          explanation: `Kawasan "${alias}" masuk wilayah ${rule.cityName} (${rule.province}).`,
        });
      }
    }
  }

  return bestMatch;
}

export interface RegionalTaxModuleSuggestion {
  id: string;
  title: string;
  badge: 'Disarankan' | 'Pengecualian UMKM' | 'Modul Perda Tambahan';
  ratePercentLabel: string;
  summary: string;
  accountingImpact: string;
  perdaReference: string;
  isRecommended: boolean;
  presetConfig: {
    applyRegionalTax: boolean;
    customTaxName: string | null;
    customRateOverride: string | null; // Decimal string e.g. '0.1000' or null
  };
}

export interface RegionalTaxLookupResult {
  region: RegionalTaxRule;
  nationalSummary: {
    label: string;
    detail: string;
  };
  monthlyThresholdRupiah: string;
  suggestions: RegionalTaxModuleSuggestion[];
}

function formatPctFromDecimal(decStr: string): string {
  const num = new Decimal(decStr || '0').times(100).toDecimalPlaces(2).toString();
  return `${num}%`;
}

/**
 * Menghasilkan daftar rekomendasi modul pajak daerah & pengecualian UMKM
 * yang siap langsung diterapkan ke mesin perhitungan akuntansi otomatis.
 */
export function lookupRegionalTaxRecommendations(params: {
  vertical: BusinessVertical;
  regionCode: string;
  taxEntity: TaxEntityType;
  isPkp: boolean;
  registry?: RegionalTaxRule[];
}): RegionalTaxLookupResult {
  const registry = params.registry ?? DEFAULT_INDONESIA_REGIONAL_TAXES;
  const region = getRegionalTaxRuleByCode(params.regionCode, registry);
  const category = getVerticalPbjtCategory(params.vertical);
  const basePreview = describeNationalAndRegionalTaxSummary({
    vertical: params.vertical,
    taxEntity: params.taxEntity,
    isPkp: params.isPkp,
    regionalTax: {
      regionCode: region.regionCode,
      province: region.province,
      cityName: region.cityName,
      applyRegionalTax: region.regionCode !== 'ID-NONE' && category !== 'NONE',
    },
    registry,
  });

  const thresholdLabel = basePreview.monthlyThresholdRupiah;
  const suggestions: RegionalTaxModuleSuggestion[] = [];

  if (region.regionCode === 'ID-NONE') {
    suggestions.push({
      id: 'exempt-no-region',
      title: 'Tanpa Pajak Daerah (Hanya Pajak Nasional 0% PBJT)',
      badge: 'Pengecualian UMKM',
      ratePercentLabel: '0%',
      summary:
        'Cocok bila usaha Anda belum memilih kota domisili atau dibebaskan penuh dari pungutan daerah setempat.',
      accountingImpact:
        'Transaksi dicatat murni ke Pendapatan (4101/4104) dan PPh/PPN nasional tanpa pemotongan akun Utang PBJT (2103).',
      perdaReference: 'UU HKPD No. 1/2022',
      isRecommended: true,
      presetConfig: {
        applyRegionalTax: false,
        customTaxName: null,
        customRateOverride: null,
      },
    });
    return {
      region,
      nationalSummary: {
        label: basePreview.nationalLabel,
        detail: basePreview.nationalDetail,
      },
      monthlyThresholdRupiah: thresholdLabel,
      suggestions,
    };
  }

  // 1. KOST & KONTRAKAN: Khusus — default bebas PBJT (<=10 kamar), namun Perda banyak kota mengenakan PBJT Perhotelan untuk Kost >10 kamar
  if (params.vertical === 'KOST_KONTRAKAN') {
    const hotelRatePct = formatPctFromDecimal(region.pbjtHospitalityRate);
    suggestions.push(
      {
        id: 'kost-exempt-standard',
        title: `Kost <= 10 Kamar: Bebas PBJT Daerah (Fokus PPh Final 4(2) 10%)`,
        badge: 'Disarankan',
        ratePercentLabel: '0%',
        summary: `Berdasarkan UU HKPD & Perda ${region.cityName}, usaha kost rumah tangga sampai 10 kamar bukan objek PBJT Perhotelan dan hanya menghitung PPh Final Sewa Bangunan Pasal 4(2) 10%.`,
        accountingImpact:
          'Sewa masuk ke Pendapatan Sewa Kamar (4104), Deposit ke Liabilitas (2106), dan akrual PPh 4(2) 10% ke Utang PPh (2105).',
        perdaReference: region.perdaReference,
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'kost-pbjt-over-10',
        title: `Kost > 10 Kamar / Eksklusif: Aktifkan PBJT Kos (${hotelRatePct})`,
        badge: 'Modul Perda Tambahan',
        ratePercentLabel: hotelRatePct,
        summary: `Gunakan modul ini jika properti Anda memiliki lebih dari 10 kamar atau ditetapkan sebagai objek PBJT Jasa Perhotelan oleh Bapenda ${region.cityName}.`,
        accountingImpact: `Otomatis memungut PBJT Kos ${hotelRatePct} pada tagihan sewa & memisahkannya ke akun Liabilitas 2103 (Utang PB1/PBJT Daerah) agar tidak tercampur omzet.`,
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: 'PBJT Kos (>10 Kamar)',
          customRateOverride: new Decimal(region.pbjtHospitalityRate || '0.10').toFixed(4),
        },
      }
    );
  } else if (category === 'FOOD_BEVERAGE') {
    const fbRatePct = formatPctFromDecimal(region.pbjtFoodBeverageRate);
    suggestions.push(
      {
        id: 'pbjt-fnb-standard',
        title: `Aktifkan PBJT Makanan & Minuman / PB1 (${fbRatePct})`,
        badge: 'Disarankan',
        ratePercentLabel: fbRatePct,
        summary: `Tarif resmi ${region.cityName} untuk restoran, kafe, dan kedai makan dengan omzet di atas ${thresholdLabel}.`,
        accountingImpact: `Pajak ${fbRatePct} otomatis terpisah dari omzet kasir dan dijurnal ke akun Liabilitas 2103 (Utang PB1/PBJT Daerah).`,
        perdaReference: region.perdaReference,
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'pbjt-fnb-micro-exempt',
        title: `Pengecualian UMKM Mikro (Omzet < ${thresholdLabel})`,
        badge: 'Pengecualian UMKM',
        ratePercentLabel: '0%',
        summary: `Bebas pungutan PBJT daerah apabila omzet bulanan usaha kuliner Anda masih di bawah batas ketentuan Perda ${region.cityName}.`,
        accountingImpact:
          'Kasir tidak memungut PB1/PBJT di struk (0%); seluruh penjualan masuk ke Pendapatan (4101) dan hanya mengikuti PPh Final UMKM PP 20/2026.',
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      }
    );
  } else if (category === 'HOSPITALITY') {
    const hotelRatePct = formatPctFromDecimal(region.pbjtHospitalityRate);
    suggestions.push(
      {
        id: 'pbjt-hotel-standard',
        title: `Aktifkan PBJT Perhotelan / Homestay / Villa (${hotelRatePct})`,
        badge: 'Disarankan',
        ratePercentLabel: hotelRatePct,
        summary: `Tarif PBJT jasa perhotelan resmi ${region.cityName} untuk homestay, guest house, dan villa harian.`,
        accountingImpact: `PBJT ${hotelRatePct} dihitung terpisah dari tarif kamar & dijurnal otomatis ke akun Liabilitas 2103 (Utang PBJT Daerah).`,
        perdaReference: region.perdaReference,
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'pbjt-hotel-exempt',
        title: `Pengecualian Penginapan Mikro (Bebas PBJT 0%)`,
        badge: 'Pengecualian UMKM',
        ratePercentLabel: '0%',
        summary: `Pilih jika penginapan skala kecil Anda masuk kriteria pengecualian omzet di bawah ${thresholdLabel} sesuai Perda setempat.`,
        accountingImpact: 'Tagihan tamu dicatat tanpa PBJT daerah (0%) dan langsung masuk Pendapatan (4101).',
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      }
    );
  } else if (category === 'ENTERTAINMENT_SPA') {
    const spaRatePct = formatPctFromDecimal(region.pbjtEntertainmentSpaRate);
    suggestions.push(
      {
        id: 'pbjt-spa-standard',
        title: `Aktifkan PBJT Jasa SPA & Hiburan (${spaRatePct})`,
        badge: 'Disarankan',
        ratePercentLabel: spaRatePct,
        summary: `Tarif PBJT SPA & Hiburan sesuai Perda ${region.cityName} (${region.perdaReference}).`,
        accountingImpact: `PBJT ${spaRatePct} otomatis dipungut di kasir dan masuk ke akun Liabilitas 2103 (Utang PBJT Daerah) terpisah dari komisi terapis & omzet.`,
        perdaReference: region.perdaReference,
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'pbjt-spa-exempt',
        title: `Pengecualian Pijat Tradisional / Mikro (Bebas PBJT 0%)`,
        badge: 'Pengecualian UMKM',
        ratePercentLabel: '0%',
        summary: `Gunakan jika layanan pijat tradisional/refleksi Anda dikecualikan dari PBJT SPA oleh Bapenda ${region.cityName}.`,
        accountingImpact: 'Kasir mencatat transaksi tanpa PBJT daerah (0%) dan tetap menghitung PPh UMKM nasional.',
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      }
    );
  } else if (category === 'PARKING') {
    const parkRatePct = formatPctFromDecimal(region.pbjtParkingRate);
    suggestions.push(
      {
        id: 'pbjt-parking-standard',
        title: `Aktifkan PBJT Jasa Parkir / Penitipan (${parkRatePct})`,
        badge: 'Disarankan',
        ratePercentLabel: parkRatePct,
        summary: `Berlaku untuk pengelola parkir komersial & garasi berbayar umum di ${region.cityName}.`,
        accountingImpact: `PBJT Parkir ${parkRatePct} dipisah otomatis ke akun Liabilitas 2103 (Utang PBJT Daerah).`,
        perdaReference: region.perdaReference,
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'pbjt-parking-private',
        title: 'Bebas PBJT Parkir (Sewa Garasi Pribadi · PPh 4(2) 10%)',
        badge: 'Pengecualian UMKM',
        ratePercentLabel: '0%',
        summary: 'Cocok untuk sewa garasi/gudang tertutup perorangan yang tidak termasuk parkir umum.',
        accountingImpact: 'Tanpa PBJT daerah; dicatat sebagai pendapatan sewa ruang non-PPN.',
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      }
    );
  } else if (category === 'SPORTS') {
    const sportsDec = new Decimal(region.pbjtSportsRate || '0');
    const sportsPct = formatPctFromDecimal(sportsDec.gt(0) ? region.pbjtSportsRate : '0.05');
    suggestions.push(
      {
        id: 'pbjt-sports-exempt',
        title: `Bebas PBJT Olahraga (0%, Umumnya Dikecualikan UU HKPD)`,
        badge: 'Disarankan',
        ratePercentLabel: '0%',
        summary: `Sebagian besar Perda mengecualikan penyewaan lapangan futsal/badminton/padel rakyat dari PBJT daerah.`,
        accountingImpact: 'Seluruh sewa lapangan masuk ke Pendapatan (4101) tanpa pemotongan akun 2103.',
        perdaReference: region.perdaReference,
        isRecommended: sportsDec.lte(0),
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'pbjt-sports-perda',
        title: `Aktifkan PBJT / Retribusi Sarana Olahraga (${sportsPct})`,
        badge: 'Modul Perda Tambahan',
        ratePercentLabel: sportsPct,
        summary: `Aktifkan jika Perda ${region.cityName} menetapkan pungutan daerah untuk gelanggang olahraga komersial Anda.`,
        accountingImpact: `Tarif ${sportsPct} otomatis masuk ke akun Liabilitas 2103 (Utang PBJT Daerah) terpisah dari omzet sewa lapangan.`,
        perdaReference: region.perdaReference,
        isRecommended: sportsDec.gt(0),
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: 'PBJT Sarana Olahraga',
          customRateOverride: sportsDec.gt(0) ? sportsDec.toFixed(4) : '0.0500',
        },
      }
    );
  } else {
    // Non-PBJT verticals (Warung, Retail, Laundry, Rental Kendaraan, Barbershop, Bimbel, Freelance, Manufaktur, Agro)
    suggestions.push(
      {
        id: 'non-pbjt-national-only',
        title: 'Bukan Objek PBJT Daerah (0%), Fokus Pajak Nasional DJP 2026',
        badge: 'Disarankan',
        ratePercentLabel: '0%',
        summary: `Jenis usaha ini secara bawaan tidak dikenakan PBJT di ${region.cityName}. Sistem fokus menghitung ${basePreview.nationalLabel}.`,
        accountingImpact:
          params.isPkp
            ? 'PPN PKP (11% efektif) dijurnal ke 2102 (Utang PPN Keluaran) tanpa potongan PBJT Daerah (2103).'
            : 'Penjualan bersih masuk ke Pendapatan (4101) dan otomatis dipantau di pelacak omzet PPh Final PP 20/2026.',
        perdaReference: 'UU HKPD No. 1/2022',
        isRecommended: true,
        presetConfig: {
          applyRegionalTax: false,
          customTaxName: null,
          customRateOverride: null,
        },
      },
      {
        id: 'non-pbjt-custom-retribusi',
        title: `Tambah Modul Pungutan / Retribusi Daerah Khusus (5%)`,
        badge: 'Modul Perda Tambahan',
        ratePercentLabel: '5%',
        summary: `Aktifkan jika usaha Anda di ${region.cityName} dikenakan retribusi khusus kawasan/pasar/daerah yang ingin dipungut otomatis di setiap transaksi (tarif dapat diubah di bawah).`,
        accountingImpact:
          'Pungutan daerah otomatis dipisahkan ke akun Liabilitas 2103 (Utang PBJT / Retribusi Daerah) pada setiap transaksi.',
        perdaReference: region.perdaReference,
        isRecommended: false,
        presetConfig: {
          applyRegionalTax: true,
          customTaxName: `Retribusi / Pajak Daerah ${region.cityName.split(' ')[0]}`,
          customRateOverride: '0.0500',
        },
      }
    );
  }

  return {
    region,
    nationalSummary: {
      label: basePreview.nationalLabel,
      detail: basePreview.nationalDetail,
    },
    monthlyThresholdRupiah: thresholdLabel,
    suggestions,
  };
}
