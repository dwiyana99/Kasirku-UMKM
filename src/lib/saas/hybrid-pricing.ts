/**
 * KasirAkun UMKM — Hybrid Subscription Bundling (LITE Rp49k, BASIC Rp100k, PRO Rp199k, EXPERT Rp349k)
 * + Modular Add-Ons (PO Supplier, Cetak Struk, Pembayaran Non-Tunai, WA Fonnte, QR Meja, Cabang, AI)
 * Strictly Decimal.js — 100% Zero AI Token cost on all core plans.
 */

import Decimal from 'decimal.js';
import type {
  AddOnModuleCode,
  BillingCycle,
  FeatureModule,
  SubscriptionPlanCode,
  Tenant,
  TenantWorkspaceData,
} from '../../types/domain.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface HybridPlanDefinition {
  code: SubscriptionPlanCode;
  name: string;
  tagline: string;
  badge?: string;
  monthlyPrice: string; // NUMERIC(19,4)
  annualMonthlyEquivalent: string; // 15% discount
  maxBranches: number;
  maxStaff: number;
  includedAddOns: AddOnModuleCode[];
  includedLegacyModules: FeatureModule['code'][];
  highlights: string[];
  zeroAiTokenNote: string;
}

export interface AddOnDefinition {
  code: AddOnModuleCode;
  name: string;
  shortLabel: string;
  description: string;
  monthlyPrice: string; // NUMERIC(19,4)
  isSeparateAi?: boolean;
  quotaLabel?: string;
  badgeLabel?: string;
  unlocksLegacyModule?: FeatureModule['code'];
  includedInPlans: SubscriptionPlanCode[];
}

export const HYBRID_PLANS: HybridPlanDefinition[] = [
  {
    code: 'LITE',
    name: 'Paket LITE',
    tagline:
      'Paling hemat & super sederhana: khusus bayar tunai, biaya operasional harian, dan laporan untung-rugi sederhana.',
    badge: 'Paling Hemat',
    monthlyPrice: '49000.0000',
    annualMonthlyEquivalent: '41650.0000',
    maxBranches: 1,
    maxStaff: 1,
    includedAddOns: [],
    includedLegacyModules: ['POS_BASIC'],
    highlights: [
      '1 Lokasi Usaha & 1 Akun Pemilik (tampilan ringkas, langsung pakai)',
      'Cocok untuk Warung Sembako, Kost & Kontrakan, Freelance, dan Peternakan/Pertanian',
      'Transaksi harian atau pengelolaan kamar/operasional sesuai jenis UMKM',
      'Sudah termasuk Catat Biaya Operasional (listrik, air, Wi-Fi, gaji) & Laporan Laba Rugi / Kas Sederhana',
      'Bisa tambah Add-On Non-Tunai (+25rb), Cetak Struk (+15rb), atau PO (+25rb) kapan saja',
    ],
    zeroAiTokenNote: '0 Biaya Token AI · Solusi paling hemat dengan laporan untung-rugi & biaya operasional siap pakai',
  },
  {
    code: 'BASIC',
    name: 'Paket BASIC',
    tagline: 'Lebih hemat Rp9rb-Rp29rb dibanding beli eceran: Non-Tunai otomatis, cetak struk, biaya operasional & 3 staf.',
    monthlyPrice: '95000.0000',
    annualMonthlyEquivalent: '80750.0000',
    maxBranches: 1,
    maxStaff: 3,
    includedAddOns: ['ADDON_NON_CASH_PAYMENT', 'ADDON_THERMAL_RECEIPT', 'ADDON_PRICING_SIMULATOR'],
    includedLegacyModules: ['POS_BASIC'],
    highlights: [
      '1 Lokasi Usaha & Maksimal 3 Akun Staf/Kasir (lebih hemat dibanding LITE + 3 Add-On eceran Rp104rb)',
      'Sudah termasuk Pembayaran Non-Tunai otomatis (QRIS, GoPay, ShopeePay, DANA, OVO, VA) & Layar Pelanggan',
      'Sudah termasuk Cetak Struk Thermal 58/80mm + Simulasi Harga Jual & Untung',
      'Sudah termasuk Biaya Operasional (listrik, Wi-Fi, gaji) & Laporan Laba Rugi / Arus Kas Sederhana',
      'Kulakan Cepat & Shift Kasir Harian (Akuntansi Pro & PO Supplier tersedia sebagai Add-On / paket di atasnya)',
    ],
    zeroAiTokenNote: '0 Biaya Token AI · Paket Bundling lebih murah dibanding tambah Add-On Non-Tunai + Struk + Simulasi eceran',
  },
  {
    code: 'PRO',
    name: 'Paket PRO',
    tagline: 'Lebih hemat Rp10rb-Rp80rb dari eceran: kontrol stok pro, PO Supplier, resep bahan, harga grosir & 10 staf.',
    badge: 'Paling Populer',
    monthlyPrice: '175000.0000',
    annualMonthlyEquivalent: '148750.0000',
    maxBranches: 1,
    maxStaff: 10,
    includedAddOns: [
      'ADDON_NON_CASH_PAYMENT',
      'ADDON_THERMAL_RECEIPT',
      'ADDON_PRICING_SIMULATOR',
      'ADDON_PURCHASE_ORDER',
      'ADDON_INVENTORY_PRO',
      'ADDON_PROMO_CRM',
    ],
    includedLegacyModules: ['POS_BASIC'],
    highlights: [
      'Semua fitur BASIC + Maksimal 10 Akun Staf (lebih hemat dibanding BASIC + PO + Inventori + CRM eceran Rp185rb)',
      'Sudah termasuk Purchase Order (PO Supplier), Hutang Tempo & Cetak PDF PO',
      'Inventori Pro: Resep Bahan Baku, Satuan Bertingkat Dus/Pcs, Cek Fisik Stok & Prediksi Belanja',
      'Promo Diskon, Harga Grosir Bertingkat, Buku Piutang & Komisi Pegawai',
      'Pengawasan Selisih Shift Kasir + Biaya Operasional & Laporan Keuangan Harian',
    ],
    zeroAiTokenNote: '0 Biaya Token AI · Khusus Resto/Kedai cukup tambah Add-On QR Meja & KDS (+Rp45rb)',
  },
  {
    code: 'EXPERT',
    name: 'Paket EXPERT',
    tagline: 'Lebih hemat Rp16rb-Rp116rb dari eceran: Akuntansi Pro SAK EMKM, Pajak DJP 2026 & Coretax, plus 20 staf.',
    monthlyPrice: '279000.0000',
    annualMonthlyEquivalent: '237150.0000',
    maxBranches: 1,
    maxStaff: 20,
    includedAddOns: [
      'ADDON_NON_CASH_PAYMENT',
      'ADDON_THERMAL_RECEIPT',
      'ADDON_PRICING_SIMULATOR',
      'ADDON_PURCHASE_ORDER',
      'ADDON_INVENTORY_PRO',
      'ADDON_PROMO_CRM',
      'ADDON_ACCOUNTING_PRO',
      'ADDON_TAX_CORETAX',
    ],
    includedLegacyModules: ['POS_BASIC', 'ACCOUNTING_FULL', 'TAX_CORETAX'],
    highlights: [
      'Semua fitur PRO + Maksimal 20 Akun Staf (lebih hemat dibanding PRO + Akuntansi Pro + Pajak eceran Rp295rb)',
      'Akuntansi Double-Entry Lengkap (Neraca SAK EMKM, Arus Kas, Perubahan Ekuitas, Buku Besar & Rasio Keuangan)',
      'Penyusutan Aset Tetap Garis Lurus Otomatis & Potongan PPh 21/23/4(2) pada Biaya Operasional',
      'Pajak DJP 2026 & Coretax (Tracker Bebas Rp500 Juta PP 20/2026, NITKU 22-digit & Pajak Daerah Perda)',
      'PPN DPP Nilai Lain 11/12 (PMK 131/2024), PB1/PBJT Daerah, PPh 21 TER, PPh 23 (2%) & PPh 4(2) (10%)',
    ],
    zeroAiTokenNote: '0 Biaya Token AI · Fitur QR Meja/KDS & Multi-Cabang opsional sebagai Add-On agar lebih hemat',
  },
];

export const ADDON_DEFINITIONS: AddOnDefinition[] = [
  {
    code: 'ADDON_NON_CASH_PAYMENT',
    name: 'Pembayaran Non-Tunai (QRIS Dinamis, E-Wallet, VA & Layar Pelanggan)',
    shortLabel: 'Bayar Non-Tunai',
    description:
      'Terima QRIS Dinamis, GoPay, ShopeePay, DANA, OVO, Virtual Account & Transfer Bank via Midtrans + Layar Pelanggan kasir otomatis.',
    monthlyPrice: '25000.0000',
    includedInPlans: ['BASIC', 'PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_THERMAL_RECEIPT',
    name: 'Cetak Struk Thermal (58mm / 80mm)',
    shortLabel: 'Cetak Struk',
    description:
      'Aktifkan pencetakan struk belanja ke printer thermal Bluetooth/USB 58mm & 80mm beserta kustomisasi logo dan catatan kaki struk.',
    monthlyPrice: '15000.0000',
    includedInPlans: ['BASIC', 'PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_PRICING_SIMULATOR',
    name: 'Simulasi Harga Jual & Ubah Harga Massal',
    shortLabel: 'Simulasi Harga',
    description:
      'Hitung harga jual ideal dengan memperhitungkan modal (HPP), biaya operasional, potongan QRIS/e-wallet, pajak, titik impas (BEP), plus ubah harga jual massal per kategori.',
    monthlyPrice: '15000.0000',
    includedInPlans: ['BASIC', 'PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_PURCHASE_ORDER',
    name: 'Purchase Order (PO Supplier & Hutang Tempo)',
    shortLabel: 'PO Supplier',
    description:
      'Buat dokumen Purchase Order resmi ke supplier, cetak PDF PO, hitung ongkir masuk modal (landed cost), dan catat hutang tempo.',
    monthlyPrice: '25000.0000',
    includedInPlans: ['PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_INVENTORY_PRO',
    name: 'Inventori Pro (BOM, Multi-Satuan & Blind Opname)',
    shortLabel: 'Inventori Pro',
    description:
      'Resep BOM dapur otomatis, satuan bertingkat Dus/Pcs, Stock Opname Blind Count & Forecasting stok 0-Token.',
    monthlyPrice: '35000.0000',
    includedInPlans: ['PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_PROMO_CRM',
    name: 'Promo, Harga Grosir & Loyalty CRM',
    shortLabel: 'Promo & CRM',
    description:
      'Diskon %/Rp, Buy X Get Y, paket Combo, harga grosir otomatis per qty, buku piutang & database pelanggan loyal.',
    monthlyPrice: '30000.0000',
    includedInPlans: ['PRO', 'EXPERT'],
  },
  {
    code: 'ADDON_RESTO_QR_KDS',
    name: 'Khusus F&B: QR Meja Self-Order, KDS & Open/Split Bill',
    shortLabel: 'QR Meja & KDS',
    description:
      'Modul khusus Restoran & Kedai Makan: QR Meja Self-Order (Direct App GoPay/ShopeePay/DANA/OVO), Layar Dapur (KDS), Open/Split Bill, serta Pindah/Gabung Meja.',
    monthlyPrice: '45000.0000',
    unlocksLegacyModule: 'QR_TABLE_KITCHEN',
    includedInPlans: [],
  },
  {
    code: 'ADDON_WA_FONNTE',
    name: 'WhatsApp Gateway Otomatis (Fonnte)',
    shortLabel: 'WA Fonnte',
    description:
      'Kirim struk belanja, notifikasi pesanan, PO supplier & tagihan sewa kost langsung ke WhatsApp pelanggan secara otomatis melalui gateway Fonnte (0 token AI).',
    monthlyPrice: '66000.0000',
    includedInPlans: [],
  },
  {
    code: 'ADDON_ACCOUNTING_PRO',
    name: 'Akuntansi SAK EMKM/PSAK & Penyusutan Aset',
    shortLabel: 'Akuntansi Pro',
    description:
      'Laporan Neraca, Arus Kas, Perubahan Ekuitas, Rasio Keuangan, Buku Besar Immutable & Penyusutan Aset Tetap.',
    monthlyPrice: '75000.0000',
    unlocksLegacyModule: 'ACCOUNTING_FULL',
    includedInPlans: ['EXPERT'],
  },
  {
    code: 'ADDON_TAX_CORETAX',
    name: 'Pajak DJP 2026 & Kesiapan Coretax',
    shortLabel: 'Pajak Coretax',
    description:
      'Monitor batas bebas pajak Rp500 Juta (PP 20/2026), PPN 12% × DPP 11/12, PB1 10%, PPh 21/23/4(2) & NITKU 22-digit.',
    monthlyPrice: '45000.0000',
    unlocksLegacyModule: 'TAX_CORETAX',
    includedInPlans: ['EXPERT'],
  },
  {
    code: 'ADDON_EXTRA_BRANCH',
    name: 'Tambah Cabang / Gudang + Mutasi Stok 3-Tahap',
    shortLabel: 'Ekstra Cabang',
    description:
      'Tambah +1 Cabang/Gudang Pusat, Matrix Stok Multi-Cabang, Transfer Stok 3-Tahap (1108) & Laporan Konsolidasi.',
    monthlyPrice: '60000.0000',
    unlocksLegacyModule: 'MULTI_BRANCH',
    includedInPlans: [],
  },
  {
    code: 'ADDON_EXTRA_STAFF',
    name: 'Tambah +1 Slot Staf',
    shortLabel: '+1 Staf',
    description:
      'Perluas slot akun kasir, kapster, gudang, petugas opname, atau staf akuntansi dengan kontrol hak akses RBAC.',
    monthlyPrice: '10000.0000',
    includedInPlans: [],
  },
  {
    code: 'ADDON_LANDING_PAGE',
    name: 'Landing Page Usaha & Katalog Online',
    shortLabel: 'Landing Page Usaha',
    description:
      'Halaman website profil usaha & katalog online publik (/toko/nama-usaha, siap migrasi subdomain), adaptif sesuai jenis UMKM, termasuk bantuan kustomisasi awal gratis oleh Master Admin.',
    monthlyPrice: '25000.0000',
    badgeLabel: 'Gratis Bantuan Kustomisasi Admin',
    includedInPlans: [],
  },
  {
    code: 'ADDON_AI_ASSISTANT',
    name: 'Asisten Bisnis AI (Terpisah · Kuota 60/bln)',
    shortLabel: 'Asisten AI',
    description:
      'Tanya jawab analitik bisnis & pajak berbasis ringkasan teragregasi (cache 24 jam, batas keras 60 tanya/bulan). Tidak termasuk di paket inti.',
    monthlyPrice: '35000.0000',
    isSeparateAi: true,
    quotaLabel: 'Maks 60 pertanyaan / bulan per UMKM',
    includedInPlans: [],
  },
];

export const BASIC_UPSELL_THRESHOLD = new Decimal('90000');
export const PRO_UPSELL_THRESHOLD = new Decimal('169000');
export const EXPERT_UPSELL_THRESHOLD = new Decimal('270000');

export interface HybridPricingCalculation {
  planCode: SubscriptionPlanCode;
  billingCycle: BillingCycle;
  basePlanMonthly: string;
  paidAddOnsMonthly: string;
  effectiveMonthlySubtotal: string;
  billingSubtotal: string;
  annualDiscountAmount: string;
  dppNilaiLain: string; // PMK 131/2024: 11/12
  ppnAmount: string; // 12% x DPP = 11% effective
  grandTotal: string;
  smartUpsellRecommendation: string | null;
  billableAddOns: AddOnModuleCode[];
  includedAddOns: AddOnModuleCode[];
}

export function getHybridPlan(planCode: SubscriptionPlanCode): HybridPlanDefinition {
  return HYBRID_PLANS.find((p) => p.code === planCode) ?? HYBRID_PLANS[1];
}

export function getAddOnDefinition(code: AddOnModuleCode): AddOnDefinition {
  return ADDON_DEFINITIONS.find((a) => a.code === code) ?? ADDON_DEFINITIONS[0];
}

/**
 * Calculates exact Hybrid Subscription Pricing (Plan + Non-overlapping Add-Ons + Quantities)
 * with PMK 131/2024 PPN (12% x 11/12) and Smart Upsell Recommendations.
 */
export function calculateHybridPricing(params: {
  planCode: SubscriptionPlanCode;
  selectedAddOns: AddOnModuleCode[];
  billingCycle: BillingCycle;
  extraBranchQty?: number;
  extraStaffQty?: number;
}): HybridPricingCalculation {
  const plan = getHybridPlan(params.planCode);
  const basePlanMonthly = new Decimal(plan.monthlyPrice);
  const includedSet = new Set<AddOnModuleCode>(plan.includedAddOns);

  const uniqueAddOns = Array.from(new Set(params.selectedAddOns));
  const billableAddOns = uniqueAddOns.filter((code) => !includedSet.has(code));

  let paidAddOnsMonthly = new Decimal(0);
  let nonAiAddOnsMonthly = new Decimal(0);

  for (const code of billableAddOns) {
    const def = getAddOnDefinition(code);
    let qty = 1;
    if (code === 'ADDON_EXTRA_BRANCH') {
      qty = Math.max(1, params.extraBranchQty ?? 1);
    } else if (code === 'ADDON_EXTRA_STAFF') {
      qty = Math.max(1, params.extraStaffQty ?? 1);
    }
    const lineCost = new Decimal(def.monthlyPrice).times(qty);
    paidAddOnsMonthly = paidAddOnsMonthly.plus(lineCost);
    if (!def.isSeparateAi) {
      nonAiAddOnsMonthly = nonAiAddOnsMonthly.plus(lineCost);
    }
  }

  const rawMonthlyTotal = basePlanMonthly.plus(paidAddOnsMonthly);
  const grossForCycle =
    params.billingCycle === 'ANNUAL' ? rawMonthlyTotal.times(12) : rawMonthlyTotal;

  // 15% annual discount
  const annualDiscountAmount =
    params.billingCycle === 'ANNUAL'
      ? grossForCycle.times('0.15').toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : new Decimal(0);

  const billingSubtotal = grossForCycle.minus(annualDiscountAmount);
  const effectiveMonthlySubtotal =
    params.billingCycle === 'ANNUAL'
      ? billingSubtotal.div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      : billingSubtotal;

  // PMK 131/2024 PPN = 12% x (11/12 x Subtotal)
  const dppNilaiLain = billingSubtotal.times(11).div(12).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const ppnAmount = dppNilaiLain.times('0.12').toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const grandTotal = billingSubtotal.plus(ppnAmount);

  const planPlusNonAi = basePlanMonthly.plus(nonAiAddOnsMonthly);
  let smartUpsellRecommendation: string | null = null;
  if (params.planCode === 'LITE' && planPlusNonAi.gt(BASIC_UPSELL_THRESHOLD)) {
    smartUpsellRecommendation =
      'Lebih hemat pilih Paket BASIC Rp95.000/bln! Sudah langsung termasuk Pembayaran Non-Tunai, Cetak Struk Thermal, Simulasi Harga & 3 Akun Staf.';
  } else if (params.planCode === 'BASIC' && planPlusNonAi.gt(PRO_UPSELL_THRESHOLD)) {
    smartUpsellRecommendation =
      'Lebih hemat pilih Paket PRO Rp175.000/bln! Sudah mencakup PO Supplier, Inventori Pro, Promo/Harga Grosir/CRM, Pengawasan Shift Kasir & 10 Staf.';
  } else if (params.planCode === 'PRO' && planPlusNonAi.gt(EXPERT_UPSELL_THRESHOLD)) {
    smartUpsellRecommendation =
      'Lebih hemat pilih Paket EXPERT Rp279.000/bln! Sudah langsung mencakup Akuntansi Pro SAK EMKM, Pajak DJP 2026 & Coretax, serta 20 Staf.';
  }

  return {
    planCode: params.planCode,
    billingCycle: params.billingCycle,
    basePlanMonthly: basePlanMonthly.toFixed(4),
    paidAddOnsMonthly: paidAddOnsMonthly.toFixed(4),
    effectiveMonthlySubtotal: effectiveMonthlySubtotal.toFixed(4),
    billingSubtotal: billingSubtotal.toFixed(4),
    annualDiscountAmount: annualDiscountAmount.toFixed(4),
    dppNilaiLain: dppNilaiLain.toFixed(4),
    ppnAmount: ppnAmount.toFixed(4),
    grandTotal: grandTotal.toFixed(4),
    smartUpsellRecommendation,
    billableAddOns,
    includedAddOns: plan.includedAddOns,
  };
}

/**
 * Resolves effective active Add-Ons for a tenant based on its SubscriptionPlanCode + activeAddOns
 * (plus backward-compatible inference from legacy activeModules).
 */
export function resolveTenantEffectiveAddOns(
  tenant: Partial<Pick<Tenant, 'subscriptionPlan' | 'activeAddOns' | 'activeModules'>>
): Set<AddOnModuleCode> {
  const legacy = tenant.activeModules ?? [];
  const effective = new Set<AddOnModuleCode>(tenant.activeAddOns ?? []);
  const planCode: SubscriptionPlanCode =
    tenant.subscriptionPlan ??
    (legacy.includes('ACCOUNTING_FULL') && legacy.includes('TAX_CORETAX')
      ? 'EXPERT'
      : legacy.includes('QR_TABLE_KITCHEN')
      ? 'PRO'
      : 'BASIC');

  const plan = getHybridPlan(planCode);
  for (const mod of plan.includedAddOns) {
    effective.add(mod);
  }

  // Backward-compatible legacy module mapping
  if (legacy.includes('QR_TABLE_KITCHEN')) effective.add('ADDON_RESTO_QR_KDS');
  if (legacy.includes('ACCOUNTING_FULL')) effective.add('ADDON_ACCOUNTING_PRO');
  if (legacy.includes('TAX_CORETAX')) effective.add('ADDON_TAX_CORETAX');
  if (legacy.includes('MULTI_BRANCH')) effective.add('ADDON_EXTRA_BRANCH');

  return effective;
}

export function tenantHasAddOn(
  tenant: Partial<Pick<Tenant, 'subscriptionPlan' | 'activeAddOns' | 'activeModules'>>,
  code: AddOnModuleCode
): boolean {
  return resolveTenantEffectiveAddOns(tenant).has(code);
}

/**
 * Maps a Hybrid Plan + Add-Ons back to legacy FeatureModule['code'][] for backward compatibility.
 */
export function deriveLegacyModulesFromHybrid(
  planCode: SubscriptionPlanCode,
  addOns: AddOnModuleCode[]
): FeatureModule['code'][] {
  const plan = getHybridPlan(planCode);
  const set = new Set<FeatureModule['code']>(plan.includedLegacyModules);
  set.add('POS_BASIC');
  for (const code of addOns) {
    const def = getAddOnDefinition(code);
    if (def.unlocksLegacyModule) {
      set.add(def.unlocksLegacyModule);
    }
  }
  return Array.from(set);
}

/**
 * Enforces commercial plan entitlements strictly on both DEMO and REAL workspaces.
 * Specifically: if a tenant does NOT have ADDON_EXTRA_BRANCH (or legacy MULTI_BRANCH),
 * the workspace is strictly single-location (1 primary outlet, no multi-branch switcher,
 * and no inter-branch stock transfers).
 */
export function enforceWorkspacePlanEntitlements(
  workspace: TenantWorkspaceData
): TenantWorkspaceData {
  const allowMultiBranch = tenantHasAddOn(workspace.tenant, 'ADDON_EXTRA_BRANCH');
  if (allowMultiBranch) {
    return workspace;
  }

  const allBranches = workspace.branches ?? [];
  if (allBranches.length <= 1) {
    return {
      ...workspace,
      stockTransfers: [],
    };
  }

  const primaryBranch =
    allBranches.find((b) => b.isDefault) ??
    allBranches.find((b) => b.branchType === 'OUTLET') ??
    allBranches[0];

  const singleBranch = {
    ...primaryBranch,
    isDefault: true,
    name:
      primaryBranch.branchType === 'CENTRAL_WAREHOUSE'
        ? workspace.tenant.name
        : primaryBranch.name,
  };

  const primaryBranchStocks = (workspace.branchStocks ?? []).filter(
    (bs) => bs.branchId === singleBranch.id
  );

  return {
    ...workspace,
    branches: [singleBranch],
    branchStocks: primaryBranchStocks,
    stockTransfers: [],
  };
}
