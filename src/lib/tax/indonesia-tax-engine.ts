/**
 * KasirAkun UMKM — Indonesian Tax Compliance Engine (DJP & Coretax 2026)
 * Strictly uses Decimal.js — zero floating-point arithmetic.
 *
 * Regulations implemented:
 * - PP No. 20 Tahun 2026 (Revision of PP 55/2022): PPh Final UMKM 0.5%
 *   - WP_OP: Exempt on first Rp500.000.000 cumulative annual turnover; valid without time limit while <= Rp4.8B.
 *   - PT_PERORANGAN: 0.5% without Rp500M exemption; valid without time limit while <= Rp4.8B.
 *   - CV_FIRMA & PT_BIASA (new): Ineligible for 0.5% final; general Art. 17 / Art. 31E (11% effective rate up to Rp4.8B proportion).
 *   - FREELANCE (Pekerjaan Bebas - Pasal 56): Excluded from 0.5% final; general Art. 17 progressive rates + optional NPPN.
 * - PMK 131/2024 & PMK 11/2025: PPN 12% x DPP Nilai Lain (11/12 of Harga Jual) = 11% effective for non-luxury BKP/JKP; 12% straight for luxury goods.
 * - PP 49/2022: 0% PPN for exempt staple goods (sembako pokok).
 * - UU HKPD: 10% PB1 / PBJT local restaurant tax for RESTORAN & KEDAI_MAKAN (non-PPN object).
 * - PP 58/2023 & PMK 168/2023: PPh 21 TER, PPh 23 (2%), PPh 4(2) land/building rent (10%).
 */

import Decimal from 'decimal.js';
import type {
  BusinessVertical,
  RegionalTaxRule,
  TaxEntityType,
  TaxType,
  TenantRegionalTaxSettings,
  WithholdingTaxType,
} from '../../types/domain.ts';
import {
  DEFAULT_INDONESIA_REGIONAL_TAXES,
  resolveEffectiveRegionalTax,
} from './regional-tax-indonesia.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const UMKM_ANNUAL_CAP = new Decimal('4800000000'); // Rp4,8 Miliar
export const WP_OP_EXEMPT_THRESHOLD = new Decimal('500000000'); // Rp500 Juta
export const PPH_FINAL_RATE = new Decimal('0.005'); // 0.5%
export const PB1_RESTO_RATE = new Decimal('0.10'); // 10%
export const PPN_STATUTORY_RATE = new Decimal('0.12'); // 12%
export const PPN_DPP_RATIO_NUM = new Decimal('11');
export const PPN_DPP_RATIO_DEN = new Decimal('12');

export interface OrderTaxInput {
  vertical: BusinessVertical;
  isPkp: boolean;
  items: Array<{
    lineSubtotal: string;
    isLuxuryGoods: boolean;
    isTaxExempt: boolean;
  }>;
  discountAmount: string;
  serviceCharge: string;
  regionalTax?: TenantRegionalTaxSettings | null;
  regionalTaxRegistry?: RegionalTaxRule[];
}

export interface OrderTaxBreakdown {
  taxType: TaxType;
  taxableBaseHargaJual: string;
  dppNilaiLain: string;
  taxAmount: string;
  effectiveRateLabel: string;
  regulationRef: string;
}

export function calculateOrderTax(input: OrderTaxInput): OrderTaxBreakdown {
  const grossSubtotal = input.items.reduce(
    (sum, item) => sum.plus(new Decimal(item.lineSubtotal || '0')),
    new Decimal(0)
  );
  const discount = new Decimal(input.discountAmount || '0');
  const serviceCharge = new Decimal(input.serviceCharge || '0');
  const netBase = Decimal.max(new Decimal(0), grossSubtotal.minus(discount).plus(serviceCharge));

  // Regional PBJT check (UU HKPD): Restoran, Kedai Makan, Bakery/Catering, Homestay/Villa, SPA, Garasi/Parkir
  const regionalResolution = resolveEffectiveRegionalTax(
    input.vertical,
    input.regionalTax,
    input.regionalTaxRegistry ?? DEFAULT_INDONESIA_REGIONAL_TAXES
  );

  // If tenant explicitly configured regionalTax, honor their regional PBJT rate (or 0% if opted out / exempt)
  if (regionalResolution.category !== 'NONE') {
    if (input.regionalTax) {
      if (regionalResolution.applies) {
        const rateDec = new Decimal(regionalResolution.rateDecimal);
        const taxAmount = netBase.times(rateDec).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
        return {
          taxType: regionalResolution.taxType,
          taxableBaseHargaJual: netBase.toFixed(4),
          dppNilaiLain: netBase.toFixed(4),
          taxAmount: taxAmount.toFixed(4),
          effectiveRateLabel: regionalResolution.taxLabel,
          regulationRef: regionalResolution.perdaReference,
        };
      }
      // Regional tax explicitly disabled / exempt for this UMKM -> fall through to 0% (or PPN if PKP & non-PBJT)
      if (
        input.vertical === 'RESTORAN' ||
        input.vertical === 'KEDAI_MAKAN' ||
        input.vertical === 'HOMESTAY_VILLA' ||
        input.vertical === 'SPA_WELLNESS'
      ) {
        return {
          taxType: 'NONE',
          taxableBaseHargaJual: netBase.toFixed(4),
          dppNilaiLain: '0.0000',
          taxAmount: '0.0000',
          effectiveRateLabel: 'Bebas PBJT Daerah (UMKM Dikecualikan)',
          regulationRef: regionalResolution.perdaReference,
        };
      }
    } else if (
      input.vertical === 'RESTORAN' ||
      input.vertical === 'KEDAI_MAKAN' ||
      input.vertical === 'HOMESTAY_VILLA'
    ) {
      // Backward-compatible default PB1 / PBJT 10% when regionalTax object is not passed
      const taxAmount = netBase.times(PB1_RESTO_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
      const isHotel = input.vertical === 'HOMESTAY_VILLA';
      return {
        taxType: isHotel ? 'PBJT_HOTEL_10' : 'PB1_RESTO_10',
        taxableBaseHargaJual: netBase.toFixed(4),
        dppNilaiLain: netBase.toFixed(4),
        taxAmount: taxAmount.toFixed(4),
        effectiveRateLabel: isHotel ? 'PBJT Perhotelan/Villa 10%' : 'PB1 Restoran 10%',
        regulationRef: isHotel
          ? 'UU HKPD (PBJT Jasa Perhotelan/Homestay/Villa 10% terpisah dari omzet)'
          : 'UU HKPD (Pajak Barang & Jasa Tertentu Makanan/Minuman)',
      };
    }
  }

  // Kost / Kontrakan & Sewa Garasi Pribadi: Sewa ruang/bangunan bukan objek PPN (tunduk PPh Final Pasal 4(2) 10%)
  if (input.vertical === 'KOST_KONTRAKAN' || input.vertical === 'SEWA_GARASI') {
    return {
      taxType: 'NONE',
      taxableBaseHargaJual: netBase.toFixed(4),
      dppNilaiLain: '0.0000',
      taxAmount: '0.0000',
      effectiveRateLabel:
        input.vertical === 'SEWA_GARASI'
          ? 'Non-PPN (Sewa Garasi · PPh 4(2) / Opsional PBJT Parkir)'
          : 'Non-PPN (Objek PPh 4(2) 10%)',
      regulationRef: 'PP 34/2017 & UU PPN (Sewa Ruang/Bangunan Non-PPN, PPh Final 4(2) 10%)',
    };
  }

  // Non-PKP Retail / Freelance / Agro: No PPN collected
  if (!input.isPkp) {
    return {
      taxType: 'NONE',
      taxableBaseHargaJual: netBase.toFixed(4),
      dppNilaiLain: '0.0000',
      taxAmount: '0.0000',
      effectiveRateLabel: 'Non-PKP (PPN 0%)',
      regulationRef: 'Belum Wajib PKP (Omzet <= Rp4,8 Miliar/tahun)',
    };
  }

  // PKP Retail / Freelance: Split luxury vs non-luxury vs staple exempt (PP 49/2022)
  const discountRatio = grossSubtotal.gt(0)
    ? Decimal.max(new Decimal(0), grossSubtotal.minus(discount)).div(grossSubtotal)
    : new Decimal(1);

  let luxuryBase = new Decimal(0);
  let nonLuxuryTaxableBase = new Decimal(0);

  for (const item of input.items) {
    if (item.isTaxExempt) continue; // Staple goods exempt per PP 49/2022
    const netItem = new Decimal(item.lineSubtotal).times(discountRatio);
    if (item.isLuxuryGoods) {
      luxuryBase = luxuryBase.plus(netItem);
    } else {
      nonLuxuryTaxableBase = nonLuxuryTaxableBase.plus(netItem);
    }
  }

  nonLuxuryTaxableBase = nonLuxuryTaxableBase.plus(serviceCharge);

  // PMK 131/2024: Non-luxury uses DPP Nilai Lain = (11/12) x Harga Jual, PPN = 12% x DPP = 11% effective
  const dppNonLuxury = nonLuxuryTaxableBase.times(PPN_DPP_RATIO_NUM).div(PPN_DPP_RATIO_DEN);
  const ppnNonLuxury = dppNonLuxury.times(PPN_STATUTORY_RATE);
  const ppnLuxury = luxuryBase.times(PPN_STATUTORY_RATE);

  const totalDpp = dppNonLuxury.plus(luxuryBase);
  const totalTax = ppnNonLuxury.plus(ppnLuxury).toDecimalPlaces(0, Decimal.ROUND_FLOOR);

  if (totalTax.lte(0)) {
    return {
      taxType: 'NONE',
      taxableBaseHargaJual: '0.0000',
      dppNilaiLain: '0.0000',
      taxAmount: '0.0000',
      effectiveRateLabel: 'Dibebaskan PPN (Sembako Pokok)',
      regulationRef: 'PP 49/2022 (Barang Kebutuhan Pokok Dibebaskan PPN)',
    };
  }

  if (luxuryBase.gt(0) && nonLuxuryTaxableBase.eq(0)) {
    return {
      taxType: 'PPN_12',
      taxableBaseHargaJual: luxuryBase.toFixed(4),
      dppNilaiLain: luxuryBase.toFixed(4),
      taxAmount: totalTax.toFixed(4),
      effectiveRateLabel: 'PPN Barang Mewah 12%',
      regulationRef: 'PMK 131/2024 (BKP Mewah / PPnBM — 12% Penuh)',
    };
  }

  return {
    taxType: 'PPN_11_12',
    taxableBaseHargaJual: nonLuxuryTaxableBase.plus(luxuryBase).toFixed(4),
    dppNilaiLain: totalDpp.toFixed(4),
    taxAmount: totalTax.toFixed(4),
    effectiveRateLabel: 'PPN 12% × DPP 11/12 (Efektif 11%)',
    regulationRef: 'PMK 131/2024 & PMK 11/2025 (DPP Nilai Lain 11/12)',
  };
}

export interface PPhSummaryInput {
  vertical: BusinessVertical;
  taxEntity: TaxEntityType;
  priorCumulativeTurnover: string;
  currentMonthTurnover: string;
  currentMonthNetProfit: string;
  marketplaceWithheldPPh?: string;
}

export interface PPhSummaryResult {
  regime: 'PPH_FINAL_UMKM_0_5' | 'PPH_BADAN_31E' | 'PPH_OP_PASAL_17_NPPN' | 'PPH_FINAL_SEWA_4_2_10';
  regimeTitle: string;
  regulationRef: string;
  isEligibleFinal05: boolean;
  cumulativeYtdTurnover: string;
  exemptRemainingRp500M: string;
  exemptProgressPct: number;
  taxableTurnoverThisMonth: string;
  estimatedTaxPayable: string;
  marketplaceCredit: string;
  netTaxToRemit: string;
  pkpWarning: boolean;
  complianceNotes: string[];
}

export function calculatePPhCompliance(input: PPhSummaryInput): PPhSummaryResult {
  const prior = new Decimal(input.priorCumulativeTurnover || '0');
  const current = new Decimal(input.currentMonthTurnover || '0');
  const netProfit = Decimal.max(new Decimal(0), new Decimal(input.currentMonthNetProfit || '0'));
  const marketplaceCredit = new Decimal(input.marketplaceWithheldPPh || '0');
  const ytd = prior.plus(current);
  const pkpWarning = ytd.gt(UMKM_ANNUAL_CAP);

  // 1. Freelance / Pekerjaan Bebas (Pasal 56 PP 20/2026) — Excluded from 0.5% Final
  if (input.vertical === 'FREELANCE') {
    // Estimate NPPN (Norma Penghitungan Penghasilan Neto 50% for creative/design consultants) or net profit
    const nppnNetBase = current.times('0.50');
    // Illustrative progressive Art. 17 bracket (5% up to 60M, 15% above)
    const estimatedArt17 = nppnNetBase.times('0.05').toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    const netRemit = Decimal.max(new Decimal(0), estimatedArt17.minus(marketplaceCredit));

    return {
      regime: 'PPH_OP_PASAL_17_NPPN',
      regimeTitle: 'PPh OP Tarif Umum Pasal 17 / NPPN',
      regulationRef: 'Pasal 56 PP No. 20 Tahun 2026 (Pekerjaan Bebas Dikecualikan dari 0,5%)',
      isEligibleFinal05: false,
      cumulativeYtdTurnover: ytd.toFixed(4),
      exemptRemainingRp500M: '0.0000',
      exemptProgressPct: 0,
      taxableTurnoverThisMonth: current.toFixed(4),
      estimatedTaxPayable: estimatedArt17.toFixed(4),
      marketplaceCredit: marketplaceCredit.toFixed(4),
      netTaxToRemit: netRemit.toFixed(4),
      pkpWarning,
      complianceNotes: [
        'Jasa profesional & kreator konten (Pekerjaan Bebas Pasal 56) tidak diperkenankan menggunakan PPh Final 0,5%.',
        'Wajib menggunakan tarif progresif Pasal 17 (dapat mengajukan NPPN via Coretax LA.04-01 jika omzet < Rp4,8 Miliar).',
        'Bukti potong PPh 21/23 dari klien dapat dikreditkan langsung pada SPT Tahunan.',
      ],
    };
  }

  // 1b. Kost / Kontrakan & Sewa Garasi Mobil (Sewa Tanah & Bangunan — PPh Final Pasal 4 ayat 2 10%)
  if (input.vertical === 'KOST_KONTRAKAN' || input.vertical === 'SEWA_GARASI') {
    const pph42 = current.times('0.10').toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    const netRemit = Decimal.max(new Decimal(0), pph42.minus(marketplaceCredit));
    const isGarage = input.vertical === 'SEWA_GARASI';
    return {
      regime: 'PPH_FINAL_SEWA_4_2_10',
      regimeTitle: isGarage
        ? 'PPh Final Sewa Garasi / Bangunan Pasal 4(2) (10%)'
        : 'PPh Final Sewa Tanah & Bangunan Pasal 4(2) (10%)',
      regulationRef: 'PP No. 34 Tahun 2017 jo. UU PPh Pasal 4 ayat (2) (Tarif Final 10% Bruto Sewa)',
      isEligibleFinal05: false,
      cumulativeYtdTurnover: ytd.toFixed(4),
      exemptRemainingRp500M: '0.0000',
      exemptProgressPct: 100,
      taxableTurnoverThisMonth: current.toFixed(4),
      estimatedTaxPayable: pph42.toFixed(4),
      marketplaceCredit: marketplaceCredit.toFixed(4),
      netTaxToRemit: netRemit.toFixed(4),
      pkpWarning,
      complianceNotes: isGarage
        ? [
            'Pendapatan sewa petak garasi bulanan (tanah & bangunan) tunduk pada PPh Final Pasal 4(2) sebesar 10% dari bruto sewa.',
            'Jika dikelola sebagai parkir umum komersial daerah, aktifkan opsi PBJT Parkir Daerah di menu Pengaturan Domisili.',
            'Setor PPh Final Pasal 4(2) melalui e-Billing Coretax paling lambat tanggal 15 bulan berikutnya.',
          ]
        : [
            'Pendapatan sewa kamar kost/kontrakan dikenakan PPh Final Pasal 4 ayat (2) sebesar 10% dari nilai bruto sewa.',
            'Uang jaminan (deposit) penghuni dicatat sebagai Utang Deposit (2106), BUKAN pendapatan dan BUKAN objek pajak.',
            'Setor PPh Final Pasal 4(2) melalui e-Billing Coretax paling lambat tanggal 15 bulan berikutnya.',
          ],
    };
  }

  // 2. Newly Registered CV / Firma / PT Biasa (Post-PP 20/2026) — Ineligible for 0.5% Final
  if (input.taxEntity === 'CV_FIRMA' || input.taxEntity === 'PT_BIASA' || pkpWarning) {
    // PPh Badan Pasal 31E: 50% reduction of 22% = 11% effective rate for turnover <= Rp4.8B
    const effectiveRate = new Decimal('0.11');
    const estimatedCorpTax = netProfit.times(effectiveRate).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    const netRemit = Decimal.max(new Decimal(0), estimatedCorpTax.minus(marketplaceCredit));

    return {
      regime: 'PPH_BADAN_31E',
      regimeTitle: 'PPh Badan Tarif Umum (Fasilitas Pasal 31E: 11%)',
      regulationRef: 'PP No. 20 Tahun 2026 & UU HPP Pasal 17 jo. Pasal 31E',
      isEligibleFinal05: false,
      cumulativeYtdTurnover: ytd.toFixed(4),
      exemptRemainingRp500M: '0.0000',
      exemptProgressPct: 100,
      taxableTurnoverThisMonth: netProfit.toFixed(4),
      estimatedTaxPayable: estimatedCorpTax.toFixed(4),
      marketplaceCredit: marketplaceCredit.toFixed(4),
      netTaxToRemit: netRemit.toFixed(4),
      pkpWarning,
      complianceNotes: [
        pkpWarning
          ? 'Omzet tahunan melebihi Rp4,8 Miliar: Wajib pengukuhan PKP dan pembukuan penuh.'
          : 'CV/Firma dan PT Biasa baru pasca PP 20/2026 menggunakan rezim pembukuan penuh Pasal 17 / Pasal 31E.',
        'Fasilitas Pasal 31E memberikan diskon tarif 50% (efektif 11%) atas bagian penghasilan kena pajak hingga Rp4,8 Miliar.',
      ],
    };
  }

  // 3. WP Orang Pribadi (WP_OP) — Rp500M Cumulative Exemption + 0.5% Final without time limit
  if (input.taxEntity === 'WP_OP') {
    const exemptRemainingBefore = Decimal.max(new Decimal(0), WP_OP_EXEMPT_THRESHOLD.minus(prior));
    const taxableThisMonth = Decimal.max(new Decimal(0), current.minus(exemptRemainingBefore));
    const exemptRemainingAfter = Decimal.max(new Decimal(0), WP_OP_EXEMPT_THRESHOLD.minus(ytd));
    const progressPct = Math.min(
      100,
      Number(ytd.div(WP_OP_EXEMPT_THRESHOLD).times(100).toFixed(1))
    );

    const taxPayable = taxableThisMonth.times(PPH_FINAL_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    const netRemit = Decimal.max(new Decimal(0), taxPayable.minus(marketplaceCredit));

    return {
      regime: 'PPH_FINAL_UMKM_0_5',
      regimeTitle: 'PPh Final UMKM 0,5% (WP Orang Pribadi)',
      regulationRef: 'PP No. 20 Tahun 2026 (Bebas Pajak s.d. Rp500 Juta/Tahun, Tanpa Batas Waktu)',
      isEligibleFinal05: true,
      cumulativeYtdTurnover: ytd.toFixed(4),
      exemptRemainingRp500M: exemptRemainingAfter.toFixed(4),
      exemptProgressPct: progressPct,
      taxableTurnoverThisMonth: taxableThisMonth.toFixed(4),
      estimatedTaxPayable: taxPayable.toFixed(4),
      marketplaceCredit: marketplaceCredit.toFixed(4),
      netTaxToRemit: netRemit.toFixed(4),
      pkpWarning: false,
      complianceNotes: [
        exemptRemainingAfter.gt(0)
          ? `Sisa kuota bebas PPh Final 0,5% tahun ini: Rp${exemptRemainingAfter.toDecimalPlaces(0).toNumber().toLocaleString('id-ID')}.`
          : 'Omzet kumulatif telah melampaui Rp500 Juta. PPh Final 0,5% berlaku atas kelebihan omzet.',
        'Sesuai PP 20/2026, WP Orang Pribadi berhak memakai tarif 0,5% selamanya selama omzet <= Rp4,8 Miliar/tahun.',
        'Aturan Anti-Splitting: Omzet digabung lintas usaha pribadi & PT Perorangan yang dimiliki.',
      ],
    };
  }

  // 4. PT Perorangan — 0.5% Final without time limit (No Rp500M exemption)
  const taxPayable = current.times(PPH_FINAL_RATE).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const netRemit = Decimal.max(new Decimal(0), taxPayable.minus(marketplaceCredit));

  return {
    regime: 'PPH_FINAL_UMKM_0_5',
    regimeTitle: 'PPh Final UMKM 0,5% (PT Perorangan)',
    regulationRef: 'PP No. 20 Tahun 2026 (Tanpa Batas Waktu <= Rp4,8 Miliar, Tanpa Bebas Rp500 Juta)',
    isEligibleFinal05: true,
    cumulativeYtdTurnover: ytd.toFixed(4),
    exemptRemainingRp500M: '0.0000',
    exemptProgressPct: 100,
    taxableTurnoverThisMonth: current.toFixed(4),
    estimatedTaxPayable: taxPayable.toFixed(4),
    marketplaceCredit: marketplaceCredit.toFixed(4),
    netTaxToRemit: netRemit.toFixed(4),
    pkpWarning: false,
    complianceNotes: [
      'PT Perorangan berhak menggunakan PPh Final 0,5% tanpa batas jangka waktu selama omzet <= Rp4,8 Miliar/tahun.',
      'Pengecualian bebas omzet Rp500 Juta hanya berlaku untuk WP Orang Pribadi, sehingga PT Perorangan dikenakan 0,5% sejak rupiah pertama.',
    ],
  };
}

export function calculateWithholdingTax(
  grossAmount: string,
  type: WithholdingTaxType
): { rateLabel: string; withheldAmount: string; netCashOut: string } {
  const gross = new Decimal(grossAmount || '0');
  let rate = new Decimal(0);
  let rateLabel = 'Tidak Ada Potongan PPh';

  switch (type) {
    case 'PPH_21_TER':
      rate = new Decimal('0.025'); // Illustrative TER Category A/B effective monthly band
      rateLabel = 'PPh 21 TER (2,5% — PP 58/2023)';
      break;
    case 'PPH_23_2PCT':
      rate = new Decimal('0.02');
      rateLabel = 'PPh Pasal 23 Jasa (2%)';
      break;
    case 'PPH_4_2_SEWA_10PCT':
      rate = new Decimal('0.10');
      rateLabel = 'PPh Pasal 4(2) Sewa Tanah/Bangunan (10%)';
      break;
    default:
      rate = new Decimal(0);
  }

  const withheld = gross.times(rate).toDecimalPlaces(0, Decimal.ROUND_FLOOR);
  const netOut = gross.minus(withheld);

  return {
    rateLabel,
    withheldAmount: withheld.toFixed(4),
    netCashOut: netOut.toFixed(4),
  };
}

export function validateCoretaxIds(npwp16: string, nitku22: string): {
  npwpValid: boolean;
  nitkuValid: boolean;
} {
  const cleanNpwp = npwp16.replace(/\D/g, '');
  const cleanNitku = nitku22.replace(/\D/g, '');
  return {
    npwpValid: cleanNpwp.length === 16,
    nitkuValid: cleanNitku.length === 22,
  };
}
