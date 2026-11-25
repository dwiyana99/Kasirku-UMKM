import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Briefcase,
  CakeSlice,
  Car,
  Check,
  CheckCircle2,
  Coffee,
  Droplets,
  Factory,
  GraduationCap,
  Hammer,
  Home,
  Landmark,
  LocateFixed,
  MapPin,
  Minus,
  PawPrint,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sprout,
  Store,
  Trash2,
  Trophy,
  UtensilsCrossed,
  Warehouse,
  WashingMachine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  ADDON_DEFINITIONS,
  HYBRID_PLANS,
  calculateHybridPricing,
  deriveLegacyModulesFromHybrid,
} from '../lib/saas/hybrid-pricing';
import {
  NON_CASH_PAYMENT_CHANNELS,
  getPaymentChannelMeta,
} from '../lib/pos/payment-verifier';
import { resolveOnboardingLifecycleStage } from '../lib/saas/subscription-lifecycle';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  VERTICAL_GROUP_LABELS,
  getVerticalMeta,
  type VerticalCategoryGroup,
} from '../lib/verticals/vertical-registry';
import {
  buildDefaultTenantRegionalTax,
  describeNationalAndRegionalTaxSummary,
  getVerticalPbjtCategory,
} from '../lib/tax/regional-tax-indonesia';
import {
  detectRegionFromCoordinates,
  detectRegionFromLocationText,
  lookupRegionalTaxRecommendations,
  type RegionalTaxModuleSuggestion,
} from '../lib/tax/regional-tax-lookup';
import type {
  AddOnModuleCode,
  BillingCycle,
  BusinessVertical,
  CustomFieldDefinition,
  PaymentMethod,
  SubscriptionInvoice,
  SubscriptionPlanCode,
  TaxEntityType,
} from '../types/domain';

type StepNumber = 1 | 2 | 3 | 4;

function getOnbVerticalIcon(id: BusinessVertical) {
  switch (id) {
    case 'WARUNG_SEMBAKO':
      return Store;
    case 'TOKO_RETAIL':
      return ShoppingBag;
    case 'TOKO_FASHION':
      return Shirt;
    case 'TOKO_BANGUNAN':
      return Hammer;
    case 'KEDAI_MAKAN':
      return Coffee;
    case 'RESTORAN':
      return UtensilsCrossed;
    case 'BAKERY_CATERING':
      return CakeSlice;
    case 'BARBERSHOP':
    case 'BARBERSHOP_SALON':
      return Scissors;
    case 'SALON_KECANTIKAN':
    case 'SPA_WELLNESS':
      return Sparkles;
    case 'LAUNDRY':
      return WashingMachine;
    case 'CUCI_KENDARAAN':
      return Droplets;
    case 'PET_SHOP':
      return PawPrint;
    case 'BIMBEL_KURSUS_GYM':
      return GraduationCap;
    case 'FREELANCE':
      return Briefcase;
    case 'RENTAL_KENDARAAN':
      return Car;
    case 'SEWA_LAPANGAN':
      return Trophy;
    case 'HOMESTAY_VILLA':
      return BedDouble;
    case 'KOST_KONTRAKAN':
      return Home;
    case 'SEWA_GARASI':
      return Warehouse;
    case 'MANUFAKTUR_KECIL':
      return Factory;
    case 'PETERNAKAN_PERTANIAN':
      return Sprout;
    default:
      return Store;
  }
}

const VERTICAL_OPTIONS = ACTIVE_VERTICAL_DEFINITIONS.map((def) => ({
  id: def.id,
  label: def.label,
  shortLabel: def.shortLabel,
  categoryGroup: def.categoryGroup,
  desc: def.summary,
  icon: getOnbVerticalIcon(def.id),
}));

const ONB_GROUP_TABS: Array<{ id: 'ALL' | VerticalCategoryGroup; label: string }> = [
  { id: 'ALL', label: `Semua (${VERTICAL_OPTIONS.length})` },
  { id: 'RETAIL_DAGANG', label: VERTICAL_GROUP_LABELS.RETAIL_DAGANG },
  { id: 'KULINER_FNB', label: VERTICAL_GROUP_LABELS.KULINER_FNB },
  { id: 'JASA_PERAWATAN', label: VERTICAL_GROUP_LABELS.JASA_PERAWATAN },
  { id: 'RENTAL_PROPETI', label: VERTICAL_GROUP_LABELS.RENTAL_PROPETI },
  { id: 'PRODUKSI_AGRO', label: VERTICAL_GROUP_LABELS.PRODUKSI_AGRO },
];

const VALID_PLAN_CODES: SubscriptionPlanCode[] = ['LITE', 'BASIC', 'PRO', 'EXPERT'];
const VALID_ADDON_CODES = new Set<string>(ADDON_DEFINITIONS.map((a) => a.code));

function parseInitialOnboardingQuery(): {
  vertical: BusinessVertical;
  planCode: SubscriptionPlanCode;
  addOns: AddOnModuleCode[];
  fromDemo: boolean;
} {
  if (typeof window === 'undefined') {
    return { vertical: 'WARUNG_SEMBAKO', planCode: 'PRO', addOns: [], fromDemo: false };
  }
  const params = new URLSearchParams(window.location.search);
  const rawPlan = (params.get('plan') || '').toUpperCase() as SubscriptionPlanCode;
  const planCode: SubscriptionPlanCode = VALID_PLAN_CODES.includes(rawPlan) ? rawPlan : 'PRO';

  const rawVertical = (params.get('vertical') || '').toUpperCase() as BusinessVertical;
  const validVerticals = new Set<string>(VERTICAL_OPTIONS.map((v) => v.id));
  const vertical: BusinessVertical = validVerticals.has(rawVertical)
    ? rawVertical
    : 'WARUNG_SEMBAKO';

  const rawAddons = (params.get('addons') || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VALID_ADDON_CODES.has(s)) as AddOnModuleCode[];

  const fromDemo = params.get('from') === 'demo';
  return { vertical, planCode, addOns: rawAddons, fromDemo };
}

export function OnboardingPage() {
  const { navigate, completeCustomerOnboarding, regionalTaxRegistry, oauthPendingUser } = useApp();

  const initialQuery = useMemo(() => parseInitialOnboardingQuery(), []);
  const isOAuthSource = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('source') === 'oauth';
  }, []);
  const [step, setStep] = useState<StepNumber>(1);
  const [verticalGroupFilter, setVerticalGroupFilter] = useState<'ALL' | VerticalCategoryGroup>(
    'ALL'
  );

  // Step 1: Real Hybrid Package (LITE Rp49k / BASIC Rp100k / PRO Rp199k / EXPERT Rp349k) & Modular Add-Ons
  const [vertical, setVertical] = useState<BusinessVertical>(initialQuery.vertical);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [planCode, setPlanCode] = useState<SubscriptionPlanCode>(initialQuery.planCode);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnModuleCode[]>(initialQuery.addOns);
  const [extraBranchQty, setExtraBranchQty] = useState<number>(1);
  const [extraStaffQty, setExtraStaffQty] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('QRIS_DYNAMIC');

  // Step 2: Payment Checkout & Auto-Verification
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);
  const [qrisString, setQrisString] = useState('');
  const [vaNumber, setVaNumber] = useState('');
  const [simWebhookBody, setSimWebhookBody] = useState<Record<string, unknown> | null>(null);
  const [simSignature, setSimSignature] = useState('');

  // Step 3: User Account & Business Profile
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [passwordDemo, setPasswordDemo] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [taxEntity, setTaxEntity] = useState<TaxEntityType>('WP_OP');
  const [regionCode, setRegionCode] = useState<string>('ID-NONE');
  const [applyRegionalTax, setApplyRegionalTax] = useState<boolean>(false);
  const [customTaxName, setCustomTaxName] = useState<string>('');
  const [customRegionalRatePct, setCustomRegionalRatePct] = useState<string>('');
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>('');
  const [locationLookupNotice, setLocationLookupNotice] = useState<string>('');
  const [appliedSuggestionId, setAppliedSuggestionId] = useState<string | null>(null);
  const [gpsDetecting, setGpsDetecting] = useState<boolean>(false);
  const [isPkp, setIsPkp] = useState(false);
  const [npwp16, setNpwp16] = useState('');
  const [address, setAddress] = useState('');
  const [initialCapital, setInitialCapital] = useState('25000000');
  const [step3Error, setStep3Error] = useState('');

  useEffect(() => {
    if (!oauthPendingUser) return;
    setEmail((prev) => prev || oauthPendingUser.email);
    setFullName((prev) => prev || oauthPendingUser.fullName);
  }, [oauthPendingUser]);

  const regionalTaxLookup = useMemo(
    () =>
      lookupRegionalTaxRecommendations({
        vertical,
        regionCode,
        taxEntity,
        isPkp,
        registry: regionalTaxRegistry,
      }),
    [vertical, regionCode, taxEntity, isPkp, regionalTaxRegistry]
  );

  const handleApplyLocationQuery = (query: string) => {
    setLocationSearchQuery(query);
    if (query.trim().length < 3) {
      setLocationLookupNotice('');
      return;
    }
    const detected = detectRegionFromLocationText(query, regionalTaxRegistry);
    if (detected) {
      setRegionCode(detected.region.regionCode);
      const pbjtCat = getVerticalPbjtCategory(vertical);
      setApplyRegionalTax(detected.region.regionCode !== 'ID-NONE' && pbjtCat !== 'NONE');
      setLocationLookupNotice(
        `Lokasi terdeteksi: ${detected.region.cityName} (${detected.region.province}) berdasarkan "${detected.matchedKeyword}".`
      );
    } else {
      setLocationLookupNotice(
        'Kota/kecamatan belum cocok otomatis. Silakan pilih kabupaten/kota terdekat di daftar domisili.'
      );
    }
  };

  const handleDetectGpsLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationLookupNotice('Browser tidak mendukung GPS otomatis. Ketik nama kota atau kecamatan Anda.');
      return;
    }
    setGpsDetecting(true);
    setLocationLookupNotice('Mendeteksi koordinat lokasi usaha...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsDetecting(false);
        const match = detectRegionFromCoordinates(
          pos.coords.latitude,
          pos.coords.longitude,
          regionalTaxRegistry
        );
        if (match) {
          setRegionCode(match.region.regionCode);
          const pbjtCat = getVerticalPbjtCategory(vertical);
          setApplyRegionalTax(match.region.regionCode !== 'ID-NONE' && pbjtCat !== 'NONE');
          setLocationLookupNotice(
            `GPS berhasil mendeteksi wilayah terdekat: ${match.region.cityName} (${match.region.province}, ~${match.distanceKm} km).`
          );
        } else {
          setLocationLookupNotice('Wilayah terdekat tidak ditemukan. Silakan pilih manual di daftar domisili.');
        }
      },
      () => {
        setGpsDetecting(false);
        setLocationLookupNotice(
          'Izin GPS ditolak atau tidak tersedia. Ketik nama kota/kecamatan Anda pada kolom pencarian lokasi.'
        );
      },
      { timeout: 6000 }
    );
  };

  const handleApplyTaxSuggestion = (s: RegionalTaxModuleSuggestion) => {
    setApplyRegionalTax(s.presetConfig.applyRegionalTax);
    setCustomTaxName(s.presetConfig.customTaxName ?? '');
    if (s.presetConfig.customRateOverride) {
      const pct = Number(s.presetConfig.customRateOverride) * 100;
      setCustomRegionalRatePct(Number.isFinite(pct) ? String(pct) : '');
    } else {
      setCustomRegionalRatePct('');
    }
    setAppliedSuggestionId(s.id);
  };

  const filteredVerticalOptions = useMemo(
    () =>
      verticalGroupFilter === 'ALL'
        ? VERTICAL_OPTIONS
        : VERTICAL_OPTIONS.filter((v) => v.categoryGroup === verticalGroupFilter),
    [verticalGroupFilter]
  );

  // Step 4: Store Operational Settings, QR Tables, Custom Fields & Receipt Settings
  const [tableCount, setTableCount] = useState('6');
  const [thermalPaperWidth, setThermalPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [autoPrintQrOrders, setAutoPrintQrOrders] = useState(true);
  const [receiptFooter, setReceiptFooter] = useState('Terima kasih atas kunjungan Anda!');
  const [customFields, setCustomFields] = useState<
    Array<Omit<CustomFieldDefinition, 'id' | 'tenantId'>>
  >([
    {
      targetEntity: 'orders',
      fieldKey: 'catatan_pelanggan',
      fieldLabel: 'Catatan Khusus Pesanan',
      fieldType: 'TEXT',
      options: [],
      isRequired: false,
    },
  ]);
  const [newCfLabel, setNewCfLabel] = useState('');
  const [newCfEntity, setNewCfEntity] = useState<'products' | 'orders' | 'expenses'>('products');
  const [finishError, setFinishError] = useState('');

  const pricing = useMemo(
    () =>
      calculateHybridPricing({
        planCode,
        selectedAddOns,
        billingCycle,
        extraBranchQty,
        extraStaffQty,
      }),
    [planCode, selectedAddOns, billingCycle, extraBranchQty, extraStaffQty]
  );

  const selectedLegacyModules = useMemo(
    () => deriveLegacyModulesFromHybrid(planCode, selectedAddOns),
    [planCode, selectedAddOns]
  );

  const toggleAddOn = (code: AddOnModuleCode) => {
    setSelectedAddOns((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  };

  const handleSelectVertical = (v: BusinessVertical) => {
    setVertical(v);
  };

  const handleProceedToPayment = async () => {
    setPaymentError('');
    setCheckoutLoading(true);
    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: email.trim() || 'calon.user@umkm.id',
          billingCycle,
          planCode,
          selectedAddOns,
          extraBranchQty,
          extraStaffQty,
          selectedModules: selectedLegacyModules,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || 'Gagal membuat tagihan paket.');
        return;
      }
      setInvoice(data.invoice);
      setQrisString(data.qrisString);
      setVaNumber(data.virtualAccountNumber);
      setSimWebhookBody(data.simulationWebhookBody);
      setSimSignature(data.simulationSignature);
      setStep(2);
    } catch {
      setPaymentError('Tidak dapat terhubung ke server pembayaran.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleVerifyPaymentWebhook = async () => {
    if (!invoice || !simWebhookBody || !simSignature) return;
    setPaymentError('');
    setVerifyingPayment(true);
    try {
      const res = await fetch('/api/webhooks/subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-qris-signature': simSignature,
        },
        body: JSON.stringify(simWebhookBody),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setPaymentError(data.error || 'Verifikasi pembayaran gagal.');
        return;
      }
      setInvoice(data.invoice);
    } catch {
      setPaymentError('Gagal memverifikasi webhook pembayaran.');
    } finally {
      setVerifyingPayment(false);
    }
  };

  const fillDemoAccountProfile = () => {
    const suffix = Math.floor(10 + Math.random() * 89);
    const meta = getVerticalMeta(vertical);
    setFullName('Andi Wijaya');
    setEmail(`andi.wijaya${suffix}@usaha.id`);
    setPasswordDemo('Usaha2026!');
    setPhone('0812-8899-4411');
    setBusinessName(meta.demoBusinessName);
    setTaxEntity('WP_OP');
    setRegionCode(meta.demoRegionCode || 'ID-NONE');
    setApplyRegionalTax(
      Boolean(meta.demoRegionCode && meta.demoRegionCode !== 'ID-NONE') &&
        getVerticalPbjtCategory(vertical) !== 'NONE'
    );
    setIsPkp(false);
    setNpwp16('3174081905910002');
    setAddress('Jl. Tebet Barat Raya No. 18, Jakarta Selatan');
    setInitialCapital('25000000');
    setStep3Error('');
  };

  const handleContinueToCustomization = (e: React.FormEvent) => {
    e.preventDefault();
    setStep3Error('');
    const isUsingOAuthIdentity = Boolean(oauthPendingUser || isOAuthSource);
    if (!fullName.trim() || !email.trim() || !businessName.trim()) {
      setStep3Error('Nama lengkap, email, dan nama usaha wajib diisi.');
      return;
    }
    if (!isUsingOAuthIdentity && !passwordDemo.trim()) {
      setStep3Error('Kata sandi login wajib diisi (minimal 6 karakter).');
      return;
    }
    if (passwordDemo.trim() && passwordDemo.trim().length < 6) {
      setStep3Error('Kata sandi minimal 6 karakter.');
      return;
    }
    setReceiptFooter(`Terima kasih telah berkunjung ke ${businessName.trim()}!`);
    setStep(4);
  };

  const handleAddCustomField = () => {
    if (!newCfLabel.trim()) return;
    const key = newCfLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (!key) return;
    setCustomFields((prev) => [
      ...prev,
      {
        targetEntity: newCfEntity,
        fieldKey: key,
        fieldLabel: newCfLabel.trim(),
        fieldType: 'TEXT',
        options: [],
        isRequired: false,
      },
    ]);
    setNewCfLabel('');
  };

  const parsedCustomRegionalRateDecimal = useMemo(() => {
    const num = Number(customRegionalRatePct.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0 || num > 100) return null;
    return (num / 100).toFixed(4);
  }, [customRegionalRatePct]);

  const taxPreview = useMemo(() => {
    const baseRegional = buildDefaultTenantRegionalTax(vertical, regionCode, regionalTaxRegistry);
    const hasCustomLevy = regionCode !== 'ID-NONE' && parsedCustomRegionalRateDecimal !== null;
    const draftRegional = {
      ...baseRegional,
      applyRegionalTax: regionCode !== 'ID-NONE' && (applyRegionalTax || hasCustomLevy),
      customTaxName: customTaxName.trim() || null,
      customRateOverride: parsedCustomRegionalRateDecimal,
    };
    return describeNationalAndRegionalTaxSummary({
      vertical,
      taxEntity,
      isPkp,
      regionalTax: draftRegional,
      registry: regionalTaxRegistry,
    });
  }, [
    applyRegionalTax,
    customTaxName,
    isPkp,
    parsedCustomRegionalRateDecimal,
    regionCode,
    regionalTaxRegistry,
    taxEntity,
    vertical,
  ]);

  const postOnboardingRoute = useMemo(() => {
    if (vertical === 'KOST_KONTRAKAN') return '/kost';
    if (vertical === 'PETERNAKAN_PERTANIAN') return '/agro';
    if (
      vertical === 'RENTAL_KENDARAAN' ||
      vertical === 'HOMESTAY_VILLA' ||
      vertical === 'SEWA_GARASI' ||
      vertical === 'BIMBEL_KURSUS_GYM' ||
      vertical === 'SEWA_LAPANGAN' ||
      vertical === 'LAUNDRY'
    ) {
      return '/operations';
    }
    return '/catalog';
  }, [vertical]);

  const handleCompleteOnboarding = async () => {
    setFinishError('');
    if (!invoice || invoice.paymentStatus !== 'VERIFIED_PAID') {
      setFinishError('Pembayaran belum terverifikasi lunas.');
      return;
    }
    const baseRegional = buildDefaultTenantRegionalTax(vertical, regionCode, regionalTaxRegistry);
    const hasCustomLevy = regionCode !== 'ID-NONE' && parsedCustomRegionalRateDecimal !== null;
    const regionalTax = {
      ...baseRegional,
      applyRegionalTax: regionCode !== 'ID-NONE' && (applyRegionalTax || hasCustomLevy),
      customTaxName: customTaxName.trim() || null,
      customRateOverride: parsedCustomRegionalRateDecimal,
    };
    try {
      await completeCustomerOnboarding({
        invoice,
        fullName,
        email,
        passwordDemo,
        phone,
        businessName,
        vertical,
        taxEntity,
        isPkp,
        npwp16,
        nitku22: `${(npwp16.trim() || '3174010000000001').slice(0, 16)}000001`,
        address,
        receiptFooter,
        thermalPaperWidth,
        autoPrintQrOrders: isFnb ? autoPrintQrOrders : false,
        tableCount: isFnb ? Number(tableCount) || 4 : 0,
        initialCapital,
        menuDrafts: [],
        customFields,
        regionalTax,
        businessWhatsappNumber: phone.trim() || undefined,
      });
      navigate(postOnboardingRoute);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Gagal menyelesaikan setup akun.');
    }
  };

  const isFnb = vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN';

  const stepsMeta: Array<{ num: StepNumber; label: string }> = [
    { num: 1, label: 'Pilih Paket' },
    { num: 2, label: 'Bayar & Verifikasi' },
    { num: 3, label: 'Buat Akun User' },
    { num: 4, label: 'Pengaturan Toko & Siap Pakai' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Beranda</span>
        </button>
        <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
          Pembelian Paket &amp; Daftar Akun Usaha Asli
        </span>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="text-xs sm:text-sm font-medium text-slate-600 hover:text-emerald-700 whitespace-nowrap"
        >
          Sudah Punya Akun? Login
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* 4-Step Progress Stepper */}
        <nav aria-label="Tahapan Pendaftaran" className="bg-white border border-slate-200 rounded-2xl p-4">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stepsMeta.map((s) => {
              const done = step > s.num || (s.num === 2 && invoice?.paymentStatus === 'VERIFIED_PAID' && step > 2);
              const current = step === s.num;
              return (
                <li
                  key={s.num}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${
                    current
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                      : done
                      ? 'border-slate-200 bg-slate-50 text-slate-800'
                      : 'border-transparent text-slate-400'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      done
                        ? 'bg-emerald-600 text-white'
                        : current
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : s.num}
                  </span>
                  <span className="text-xs font-semibold leading-tight">{s.label}</span>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Status Siklus Langganan:{' '}
              <strong className="font-mono text-slate-800">
                {resolveOnboardingLifecycleStage({
                  step,
                  invoiceStatus: invoice?.paymentStatus ?? null,
                })}
              </strong>
            </span>
            <span>
              Paket aktif:{' '}
              <span className="font-mono font-semibold text-emerald-700">
                {planCode}
                {pricing.billableAddOns.length > 0
                  ? ` + ${pricing.billableAddOns.length} Add-On`
                  : ''}
              </span>
            </span>
          </div>
        </nav>

        {/* STEP 1: PACKAGE, VERTICAL & MODULAR ADD-ON SELECTION */}
        {step === 1 && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-8 space-y-6">
              {/* Demo-to-Real Upgrade Banner */}
              {initialQuery.fromDemo && (
                <div
                  data-testid="onb-from-demo-banner"
                  className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-3"
                >
                  <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">
                      Melanjutkan Pilihan dari Akun Demo ke Akun Usaha Asli
                    </p>
                    <p className="text-emerald-900/80 mt-0.5">
                      Jenis usaha dan paket yang Anda uji coba di demo sudah otomatis dipilih di
                      bawah. Anda tetap bebas mengubahnya sebelum membayar.
                    </p>
                  </div>
                </div>
              )}

              {/* Vertical Selector (All 22 UMKM Verticals) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    1. Pembelian Paket &amp; Pendaftaran Akun Usaha Asli
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Pilih 1 dari 22 jenis usaha UMKM, pastikan paket berlangganan (LITE / BASIC /
                    PRO / EXPERT) dan fitur tambahan sesuai kebutuhan, lalu lanjutkan ke pembayaran.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {ONB_GROUP_TABS.map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setVerticalGroupFilter(grp.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        verticalGroupFilter === grp.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {grp.label}
                    </button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {filteredVerticalOptions.map((v) => {
                    const Icon = v.icon;
                    const active = vertical === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-testid={`onb-vertical-${v.id}`}
                        onClick={() => handleSelectVertical(v.id)}
                        className={`text-left p-4 rounded-xl border transition-colors ${
                          active
                            ? 'border-emerald-600 bg-emerald-50/60'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              active ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          />
                          <span className="text-sm font-semibold text-slate-900">{v.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{v.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Core Hybrid Plans Selector (Real Pricing — Zero Rp0!) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Pilih Paket Inti &amp; Penjelasan Fitur Lengkap
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Seluruh paket inti 100% bebas biaya token AI.
                    </p>
                  </div>
                  <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start">
                    <button
                      type="button"
                      onClick={() => setBillingCycle('MONTHLY')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        billingCycle === 'MONTHLY'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Bulanan
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle('ANNUAL')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        billingCycle === 'ANNUAL'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      Tahunan (Hemat 15%)
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {HYBRID_PLANS.map((plan) => {
                    const active = planCode === plan.code;
                    const priceShown =
                      billingCycle === 'ANNUAL' ? plan.annualMonthlyEquivalent : plan.monthlyPrice;
                    return (
                      <button
                        key={plan.code}
                        type="button"
                        data-testid={`onb-plan-${plan.code}`}
                        onClick={() => setPlanCode(plan.code)}
                        className={`w-full text-left p-5 rounded-xl border transition-all space-y-3 ${
                          active
                            ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 ${
                                active
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {active && <Check className="w-3 h-3" />}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  {plan.name}
                                </span>
                                {plan.badge && (
                                  <span className="text-[11px] font-semibold text-emerald-700">
                                    · {plan.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600">{plan.tagline}</p>
                            </div>
                          </div>
                          <div className="sm:text-right pl-7 sm:pl-0">
                            <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                              {formatRupiah(priceShown)}
                            </span>
                            <span className="text-xs text-slate-500">/bln</span>
                          </div>
                        </div>

                        <ul className="pl-7 grid sm:grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/70">
                          {plan.highlights.map((h) => (
                            <li
                              key={h}
                              className="flex items-start gap-1.5 text-[11px] text-slate-700 leading-snug"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modular Add-On Selector */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Tambah Add-On Modular (Opsional)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih modul tambahan di luar Paket {planCode} (misal: QR Meja &amp; KDS khusus
                    Resto/Kedai, Ekstra Cabang, +Staf, atau Asisten AI terpisah).
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  {ADDON_DEFINITIONS.map((addon) => {
                    const included = pricing.includedAddOns.includes(addon.code);
                    const checked = included || selectedAddOns.includes(addon.code);
                    return (
                      <div
                        key={addon.code}
                        data-testid={`onb-addon-${addon.code}`}
                        className={`p-4 rounded-xl border transition-colors ${
                          included
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : checked
                            ? addon.isSeparateAi
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 border-slate-900'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={included}
                            onChange={() => toggleAddOn(addon.code)}
                            className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-bold ${
                                  checked && addon.isSeparateAi ? 'text-white' : 'text-slate-900'
                                }`}
                              >
                                {addon.shortLabel}
                              </span>
                              <span
                                className={`text-xs font-mono font-bold tabular-nums whitespace-nowrap ${
                                  included
                                    ? 'text-emerald-700'
                                    : checked && addon.isSeparateAi
                                    ? 'text-emerald-400'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {included
                                  ? 'Termasuk'
                                  : `+${formatRupiah(addon.monthlyPrice)}/bln`}
                              </span>
                            </div>
                            <p
                              className={`text-[11px] mt-1 leading-snug ${
                                checked && addon.isSeparateAi ? 'text-slate-300' : 'text-slate-600'
                              }`}
                            >
                              {addon.description}
                            </p>
                          </div>
                        </label>

                        {addon.code === 'ADDON_EXTRA_BRANCH' && checked && !included && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs">
                            <span className="text-slate-600">Jumlah Cabang Ekstra</span>
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setExtraBranchQty((q) => Math.max(1, q - 1))}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 bg-white"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center font-mono font-bold">
                                {extraBranchQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => setExtraBranchQty((q) => Math.min(20, q + 1))}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 bg-white"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {addon.code === 'ADDON_EXTRA_STAFF' && checked && !included && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between text-xs">
                            <span className="text-slate-600">Jumlah Slot Staf</span>
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setExtraStaffQty((q) => Math.max(1, q - 1))}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 bg-white"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center font-mono font-bold">
                                {extraStaffQty}
                              </span>
                              <button
                                type="button"
                                onClick={() => setExtraStaffQty((q) => Math.min(50, q + 1))}
                                className="w-6 h-6 flex items-center justify-center rounded border border-slate-300 bg-white"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Right Sticky Invoice Preview */}
            <aside
              data-testid="onb-pricing-summary"
              className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Ringkasan Tagihan Paket</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Harga real sesuai paket terpilih · termasuk perhitungan PPN PMK 131/2024.
                </p>
              </div>

              {pricing.smartUpsellRecommendation && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-[11px] text-amber-950 space-y-1.5">
                  <p className="font-bold">Saran Paket Lebih Hemat</p>
                  <p className="leading-snug">{pricing.smartUpsellRecommendation}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setPlanCode(
                        planCode === 'LITE' ? 'BASIC' : planCode === 'BASIC' ? 'PRO' : 'EXPERT'
                      )
                    }
                    className="font-semibold underline text-amber-900"
                  >
                    {planCode === 'LITE'
                      ? 'Pindah ke Paket BASIC (Rp95.000/bln) →'
                      : planCode === 'BASIC'
                      ? 'Pindah ke Paket PRO (Rp175.000/bln) →'
                      : 'Pindah ke Paket EXPERT (Rp279.000/bln) →'}
                  </button>
                </div>
              )}

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Paket Inti ({planCode})</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatRupiah(pricing.basePlanMonthly)}/bln
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Add-On Berbayar ({pricing.billableAddOns.length} modul)</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatRupiah(pricing.paidAddOnsMonthly)}/bln
                  </span>
                </div>
                {billingCycle === 'ANNUAL' && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Diskon Tahunan (15%)</span>
                    <span className="font-mono tabular-nums">
                      -{formatRupiah(pricing.annualDiscountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-100">
                  <span>Subtotal {billingCycle === 'ANNUAL' ? '(12 Bulan)' : '(1 Bulan)'}</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatRupiah(pricing.billingSubtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>DPP Nilai Lain (11/12)</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(pricing.dppNilaiLain)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>PPN 12% × DPP (Efektif 11%)</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatRupiah(pricing.ppnAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-3 border-t border-slate-200">
                  <span className="text-sm font-bold text-slate-900">Total Bayar</span>
                  <span
                    data-testid="onb-grand-total"
                    className="text-xl font-bold font-mono text-emerald-700 tabular-nums"
                  >
                    {formatRupiah(pricing.grandTotal)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">
                  Metode Pembayaran (Verifikasi Otomatis · 0 Token AI)
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {NON_CASH_PAYMENT_CHANNELS.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      data-testid={`onb-pay-${ch.id}`}
                      onClick={() => setPaymentMethod(ch.id)}
                      className={`py-2 px-2.5 text-[11px] font-semibold rounded-lg border text-center truncate transition-colors ${
                        paymentMethod === ch.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {ch.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {paymentError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {paymentError}
                </p>
              )}

              <button
                type="button"
                data-testid="onb-proceed-payment-btn"
                disabled={checkoutLoading}
                onClick={() => void handleProceedToPayment()}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-60"
              >
                <span>{checkoutLoading ? 'Membuat Tagihan...' : 'Lanjut ke Pembayaran'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </aside>
          </div>
        )}

        {/* STEP 2: PAYMENT & HMAC WEBHOOK VERIFICATION */}
        {step === 2 && invoice && (
          <section className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                  Invoice {invoice.invoiceNumber}
                </p>
                <h1 className="text-xl font-bold text-slate-900 mt-1">
                  2. Pembayaran &amp; Verifikasi Paket
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Setelah pembayaran terverifikasi otomatis, Anda langsung diarahkan ke pembuatan
                  akun &amp; kustomisasi menu.
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-md border whitespace-nowrap ${
                  invoice.paymentStatus === 'VERIFIED_PAID'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {invoice.paymentStatus === 'VERIFIED_PAID' ? 'TERVERIFIKASI LUNAS' : 'MENUNGGU BAYAR'}
              </span>
            </div>

            {invoice.paymentStatus === 'VERIFIED_PAID' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-base font-bold text-emerald-950">
                      Pembayaran Berhasil Diverifikasi (HMAC-SHA256)
                    </h2>
                    <p className="text-xs text-emerald-900/80 mt-1">
                      Paket {invoice.selectedModules.length} modul telah aktif. Silakan lanjutkan
                      membuat akun login &amp; profil usaha UMKM Anda.
                    </p>
                  </div>
                </div>
                <div className="bg-white/80 rounded-xl p-4 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Referensi Gateway</span>
                    <span className="text-slate-900 font-semibold truncate">
                      {invoice.gatewayRefId}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Total Terbayar (termasuk PPN)</span>
                    <span className="text-emerald-700 font-bold tabular-nums">
                      {formatRupiah(invoice.grandTotal)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                >
                  <span>Lanjut Buat Akun User &amp; Profil Usaha</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center space-y-4">
                  <p className="text-xs font-medium text-slate-500">
                    Total Tagihan · {getPaymentChannelMeta(paymentMethod).label}
                  </p>
                  <p className="text-3xl font-bold font-mono tabular-nums text-slate-900">
                    {formatRupiah(invoice.grandTotal)}
                  </p>

                  {paymentMethod === 'QRIS_DYNAMIC' || paymentMethod.startsWith('EWALLET_') ? (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl">
                      <QRCodeSVG value={qrisString || invoice.invoiceNumber} size={184} />
                    </div>
                  ) : (
                    <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-4 space-y-1">
                      <p className="text-xs text-slate-500">
                        {paymentMethod === 'VIRTUAL_ACCOUNT'
                          ? 'Nomor Virtual Account (BCA / Mandiri / BRI / BNI)'
                          : 'Rekening Transfer Bank (Cek Mutasi Otomatis)'}
                      </p>
                      <p className="text-lg font-bold font-mono tracking-wider text-slate-900 break-all">
                        {vaNumber}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 max-w-sm">
                    Klik tombol di bawah untuk memverifikasi callback payment gateway bertanda tangan
                    HMAC-SHA256 secara otomatis (0 Token AI).
                  </p>
                </div>

                {paymentError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {paymentError}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="py-2.5 px-4 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
                  >
                    Ubah Paket
                  </button>
                  <button
                    type="button"
                    disabled={verifyingPayment}
                    onClick={() => void handleVerifyPaymentWebhook()}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>
                      {verifyingPayment
                        ? 'Memverifikasi Pembayaran...'
                        : 'Simulasikan & Verifikasi Pembayaran Lunas'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* STEP 3: CREATE USER ACCOUNT & UMKM PROFILE */}
        {step === 3 && (
          <section className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  3. Buat Akun User &amp; Profil Usaha UMKM
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Akun ini otomatis terdaftar di Konsol Master dan terhubung dengan 29 akun CoA
                  SAK EMKM.
                </p>
              </div>
              <button
                type="button"
                onClick={fillDemoAccountProfile}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Isi Contoh Data Demo</span>
              </button>
            </div>

            <form onSubmit={handleContinueToCustomization} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onb-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Lengkap Pemilik *
                  </label>
                  <input
                    id="onb-fullname"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Contoh: Andi Wijaya"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="onb-phone" className="block text-xs font-medium text-slate-700 mb-1">
                    No. WhatsApp / HP
                  </label>
                  <input
                    id="onb-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="onb-email" className="block text-xs font-medium text-slate-700 mb-1">
                    Email Login Akun *
                  </label>
                  <input
                    id="onb-email"
                    type="email"
                    required
                    readOnly={Boolean(oauthPendingUser)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@usahaku.id"
                    className={`w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg ${
                      oauthPendingUser ? 'bg-slate-100 text-slate-600' : 'bg-white'
                    }`}
                  />
                  {oauthPendingUser && (
                    <p className="text-[11px] text-emerald-700 mt-1">
                      Terhubung otomatis dengan akun Google: {oauthPendingUser.email}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="onb-password" className="block text-xs font-medium text-slate-700 mb-1">
                    {oauthPendingUser || isOAuthSource
                      ? 'Kata Sandi Cadangan (Opsional)'
                      : 'Kata Sandi Login *'}
                  </label>
                  <input
                    id="onb-password"
                    type="password"
                    required={!oauthPendingUser && !isOAuthSource}
                    minLength={6}
                    value={passwordDemo}
                    onChange={(e) => setPasswordDemo(e.target.value)}
                    placeholder={
                      oauthPendingUser || isOAuthSource
                        ? 'Opsional (sudah masuk dengan Google)'
                        : 'Minimal 6 karakter'
                    }
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="onb-bizname" className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Usaha / Toko / Restoran *
                  </label>
                  <input
                    id="onb-bizname"
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Contoh: Kedai Kopi & Toast Kita"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="onb-taxentity" className="block text-xs font-medium text-slate-700 mb-1">
                    Entitas Pajak (PP No. 20 Tahun 2026)
                  </label>
                  <select
                    id="onb-taxentity"
                    value={taxEntity}
                    onChange={(e) => setTaxEntity(e.target.value as TaxEntityType)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="WP_OP">WP Orang Pribadi (Bebas Rp500 Juta/thn)</option>
                    <option value="PT_PERORANGAN">PT Perorangan (0,5% selamanya ≤ Rp4,8M)</option>
                    <option value="CV_FIRMA">CV / Firma (Tarif Umum)</option>
                    <option value="PT_BIASA">PT Biasa (Pasal 17 / 31E)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="onb-capital" className="block text-xs font-medium text-slate-700 mb-1">
                    Modal Awal Kas &amp; Bank (Rp, Jurnal Pembuka)
                  </label>
                  <input
                    id="onb-capital"
                    type="number"
                    min={1000000}
                    step={500000}
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="onb-npwp" className="block text-xs font-medium text-slate-700 mb-1">
                    NIK / NPWP 16-Digit (Coretax)
                  </label>
                  <input
                    id="onb-npwp"
                    type="text"
                    maxLength={16}
                    value={npwp16}
                    onChange={(e) => setNpwp16(e.target.value.replace(/\D/g, ''))}
                    placeholder="3174081905910002"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="onb-region" className="block text-xs font-medium text-slate-700 mb-1">
                    Domisili Usaha / Pajak Daerah (PBJT UU HKPD)
                  </label>
                  <select
                    id="onb-region"
                    value={regionCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setRegionCode(code);
                      const pbjtCat = getVerticalPbjtCategory(vertical);
                      setApplyRegionalTax(code !== 'ID-NONE' && pbjtCat !== 'NONE');
                    }}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {regionalTaxRegistry.map((r) => (
                      <option key={r.regionCode} value={r.regionCode}>
                        {r.regionCode === 'ID-NONE'
                          ? 'Bebas / Tanpa Pajak Daerah (0%)'
                          : `${r.cityName} (${r.province})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="onb-address" className="block text-xs font-medium text-slate-700 mb-1">
                    Alamat Usaha (Tampil di Struk)
                  </label>
                  <input
                    id="onb-address"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Jl. Kemang Raya No. 10, Jakarta"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                {/* Layanan Deteksi Lokasi & Rekomendasi Pajak Daerah Otomatis */}
                <div
                  data-testid="onb-regional-tax-lookup"
                  className="sm:col-span-2 rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
                      <div>
                        <p className="text-xs font-bold text-stone-900">
                          Deteksi Lokasi &amp; Rekomendasi Pajak Daerah (Perda / UU HKPD)
                        </p>
                        <p className="text-[11px] text-stone-500">
                          Ketik nama kota, kabupaten, atau kecamatan usaha Anda, atau klik Deteksi GPS agar sistem menyarankan modul pajak daerah dan pengecualian UMKM yang tepat.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="onb-gps-detect-btn"
                      disabled={gpsDetecting}
                      onClick={handleDetectGpsLocation}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      <LocateFixed className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>{gpsDetecting ? 'Mendeteksi...' : 'Deteksi Lokasi GPS'}</span>
                    </button>
                  </div>

                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      strokeWidth={1.75}
                    />
                    <input
                      type="text"
                      data-testid="onb-location-lookup-input"
                      value={locationSearchQuery}
                      onChange={(e) => handleApplyLocationQuery(e.target.value)}
                      placeholder="Ketik area usaha: misal Canggu, Tebet, Dago, Sleman, BSD, Malang..."
                      className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  {locationLookupNotice && (
                    <p
                      data-testid="onb-location-lookup-notice"
                      className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5"
                    >
                      {locationLookupNotice}
                    </p>
                  )}

                  {/* Rekomendasi Modul Pajak Daerah & Pengecualian UMKM */}
                  <div data-testid="onb-regional-tax-suggestions" className="space-y-2">
                    <p className="text-[11px] font-semibold text-stone-700">
                      Pajak Nasional: {regionalTaxLookup.nationalSummary.label} · Wilayah:{' '}
                      {regionalTaxLookup.region.cityName}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      {regionalTaxLookup.suggestions.map((sug) => {
                        const isApplied = appliedSuggestionId === sug.id;
                        return (
                          <div
                            key={sug.id}
                            data-testid={`onb-tax-suggestion-${sug.id}`}
                            className={`rounded-lg border p-3 bg-white flex flex-col justify-between gap-2.5 ${
                              isApplied
                                ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                                : 'border-stone-200'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-bold text-stone-900 leading-snug">
                                  {sug.title}
                                </p>
                                <span
                                  className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                    sug.badge === 'Pengecualian UMKM' || sug.badge === 'Disarankan'
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {sug.ratePercentLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-600 leading-relaxed">
                                {sug.summary}
                              </p>
                              <p className="text-[10px] text-stone-500">
                                {sug.accountingImpact}
                              </p>
                            </div>
                            <button
                              type="button"
                              data-testid={`onb-apply-tax-suggestion-${sug.id}`}
                              onClick={() => handleApplyTaxSuggestion(sug)}
                              className={`w-full py-1.5 px-2.5 text-[11px] font-semibold rounded-md transition-colors ${
                                isApplied
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-stone-900 hover:bg-stone-800 text-white'
                              }`}
                            >
                              {isApplied
                                ? 'Diterapkan ke Mesin Akuntansi'
                                : 'Terapkan ke Akuntansi Otomatis'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div
                  data-testid="onb-regional-tax-preview"
                  className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center gap-2 font-semibold text-emerald-950">
                    <Landmark className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
                    <span>Pratinjau Pajak Otomatis (Nasional DJP 2026 &amp; Perda Daerah)</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5 text-[11px]">
                    <div className="rounded-lg bg-white/90 border border-emerald-200/80 p-2.5 space-y-0.5">
                      <p className="font-semibold text-stone-900">
                        Pajak Nasional: {taxPreview.nationalLabel}
                      </p>
                      <p className="text-stone-600 leading-relaxed">{taxPreview.nationalDetail}</p>
                    </div>
                    <div className="rounded-lg bg-white/90 border border-emerald-200/80 p-2.5 space-y-0.5">
                      <p className="font-semibold text-stone-900">
                        Pajak Daerah ({taxPreview.regionalResolution.regionName}):{' '}
                        <span className="font-mono tabular-nums text-emerald-700">
                          {taxPreview.regionalResolution.ratePercentLabel}
                        </span>
                      </p>
                      <p className="text-stone-700 font-medium">
                        {taxPreview.regionalResolution.taxLabel}
                      </p>
                      <p className="text-stone-500 leading-relaxed">
                        {taxPreview.regionalResolution.perdaReference} · Batas bebas UMKM:{' '}
                        <span className="font-mono tabular-nums">
                          {taxPreview.monthlyThresholdRupiah}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {regionCode !== 'ID-NONE' && getVerticalPbjtCategory(vertical) !== 'NONE' && (
                  <label className="sm:col-span-2 inline-flex items-start gap-2 text-xs text-slate-700 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <input
                      type="checkbox"
                      checked={applyRegionalTax}
                      onChange={(e) => setApplyRegionalTax(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600"
                    />
                    <span>
                      Terapkan tarif Pajak Daerah (PBJT) sesuai domisili yang dipilih. Hapus
                      centang jika usaha Anda di bawah batas omzet wajib pajak daerah / dikecualikan
                      UMKM.
                    </span>
                  </label>
                )}

                {regionCode !== 'ID-NONE' && (
                  <div
                    data-testid="onb-custom-regional-tax"
                    className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        Pajak / Retribusi Daerah Tambahan Khusus Perda Setempat (Opsional)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Isi jika jenis usaha Anda dikenakan pungutan Perda di luar pajak nasional/restoran (misal: PBJT Kost &gt;10 kamar, Retribusi Parkir/Kebersihan, atau tarif Perda khusus kota Anda).
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="onb-custom-tax-name" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Nama Pungutan Daerah (Opsional)
                        </label>
                        <input
                          id="onb-custom-tax-name"
                          type="text"
                          value={customTaxName}
                          onChange={(e) => setCustomTaxName(e.target.value)}
                          placeholder="Contoh: PBJT Kost (>10 Kamar) / Retribusi Daerah"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="onb-custom-tax-rate" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Tarif Tambahan Daerah (%)
                        </label>
                        <input
                          id="onb-custom-tax-rate"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={customRegionalRatePct}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCustomRegionalRatePct(v);
                            if (Number(v) > 0) setApplyRegionalTax(true);
                          }}
                          placeholder="0 (kosongkan jika mengikuti standar Perda)"
                          className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPkp}
                    onChange={(e) => setIsPkp(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Usaha saya sudah berstatus PKP (Pungut PPN 12% × DPP Nilai Lain 11/12)</span>
                </label>
              </div>

              {step3Error && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {step3Error}
                </p>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
                >
                  <span>Lanjut Pengaturan Operasional Toko</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </section>
        )}

        {/* STEP 4: OPERATIONAL SETTINGS, QR TABLES & CUSTOM FIELDS (EMPTY CLEAN STORE) */}
        {step === 4 && (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    4. Pengaturan Operasional Toko &amp; Kesiapan Buku Besar
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Konfigurasi awal untuk{' '}
                    <span className="font-semibold text-slate-800">{businessName}</span>. Toko baru
                    dimulai dari katalog kosong (0 produk/menu) agar data usaha Anda bersih.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0">
                  <Store className="w-3.5 h-3.5" />
                  <span>0 Produk Awal · Katalog Bersih</span>
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 space-y-1.5">
                <p className="font-semibold text-slate-900">
                  Alur pengisian barang &amp; menu setelah setup selesai:
                </p>
                <p className="leading-relaxed">
                  {vertical === 'WARUNG_SEMBAKO'
                    ? 'Setelah masuk ke menu Katalog & Inventori, Anda dapat langsung mengatur Kategori/Jenis/Merek/Ukuran/Satuan, mencatat pembelian stok barang + foto nota, lalu mulai jualan di Kasir POS.'
                    : isFnb
                    ? 'Setelah masuk ke menu Katalog & Inventori, Anda dapat langsung menginput Bahan Mentah, meracik Resep BOM, lalu membuat Menu Jual beserta upload foto menu masing-masing.'
                    : 'Setelah masuk ke menu Katalog & Inventori, Anda dapat langsung menambahkan paket layanan & tarif jasa Anda dari awal.'}
                </p>
              </div>
            </section>

            {/* Tables, Custom Fields & Receipt Settings */}
            <div className="grid md:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">
                  {isFnb
                    ? 'Pengaturan Operasional, Meja QR & Struk'
                    : 'Pengaturan Operasional & Struk Pembayaran'}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {isFnb && (
                    <div>
                      <label htmlFor="onb-tables" className="block text-xs font-medium text-slate-700 mb-1">
                        Jumlah Meja QR
                      </label>
                      <input
                        id="onb-tables"
                        type="number"
                        min={1}
                        max={30}
                        value={tableCount}
                        onChange={(e) => setTableCount(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                  )}
                  <div className={isFnb ? '' : 'col-span-2'}>
                    <label htmlFor="onb-paper" className="block text-xs font-medium text-slate-700 mb-1">
                      Kertas Thermal
                    </label>
                    <select
                      id="onb-paper"
                      value={thermalPaperWidth}
                      onChange={(e) => setThermalPaperWidth(e.target.value as '58mm' | '80mm')}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="80mm">80mm (Standar)</option>
                      <option value="58mm">58mm (Ringkas)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="onb-footer" className="block text-xs font-medium text-slate-700 mb-1">
                    Pesan Footer Struk
                  </label>
                  <input
                    id="onb-footer"
                    type="text"
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                {isFnb && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPrintQrOrders}
                      onChange={(e) => setAutoPrintQrOrders(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>Aktifkan Auto-Print saat pesanan QR Meja lunas</span>
                  </label>
                )}
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Custom Field Tambahan (Tanpa Ubah Database)
                </h2>
                <div className="flex gap-2">
                  <select
                    aria-label="Target Entitas Custom Field"
                    value={newCfEntity}
                    onChange={(e) =>
                      setNewCfEntity(e.target.value as 'products' | 'orders' | 'expenses')
                    }
                    className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="products">Produk</option>
                    <option value="orders">Pesanan</option>
                    <option value="expenses">Biaya</option>
                  </select>
                  <input
                    type="text"
                    value={newCfLabel}
                    onChange={(e) => setNewCfLabel(e.target.value)}
                    placeholder="Contoh: Level Gula / No BPOM"
                    className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Tambah
                  </button>
                </div>
                <div className="space-y-1.5">
                  {customFields.map((cf, idx) => (
                    <div
                      key={`${cf.fieldKey}-${idx}`}
                      className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                    >
                      <span>
                        <span className="font-semibold text-slate-900">{cf.fieldLabel}</span>{' '}
                        <span className="text-slate-500">({cf.targetEntity})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomFields((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {finishError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
                {finishError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-emerald-200 rounded-2xl p-5">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Semua Siap! Akun &amp; Buku Besar SAK EMKM Siap Diaktifkan
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {postOnboardingRoute === '/kost'
                    ? 'Anda langsung diarahkan ke Kelola Kost & Kontrakan untuk menambahkan daftar kamar dan penghuni pertama.'
                    : postOnboardingRoute === '/agro'
                    ? 'Anda langsung diarahkan ke Operasional Peternakan & Pertanian untuk mencatat kandang/lahan pertama.'
                    : postOnboardingRoute === '/operations'
                    ? 'Anda langsung diarahkan ke ruang Operasional Utama sesuai jenis usaha Anda.'
                    : 'Toko dimulai dengan katalog kosong (0 item). Anda langsung diarahkan ke Katalog & Inventori untuk mulai mengisi barang/menu.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCompleteOnboarding}
                data-testid="complete-onboarding-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {postOnboardingRoute === '/kost'
                    ? 'Selesaikan Setup & Buka Kelola Kost'
                    : postOnboardingRoute === '/agro'
                    ? 'Selesaikan Setup & Buka Operasional Agro'
                    : postOnboardingRoute === '/operations'
                    ? 'Selesaikan Setup & Buka Operasional Usaha'
                    : 'Selesaikan Setup & Buka Katalog Toko'}
                </span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
