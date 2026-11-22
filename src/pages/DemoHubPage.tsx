import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Briefcase,
  Building2,
  CakeSlice,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  Coffee,
  Droplets,
  Factory,
  GraduationCap,
  Hammer,
  Home,
  LayoutGrid,
  Loader2,
  Lock,
  PawPrint,
  Play,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Sprout,
  Store,
  Trophy,
  UserPlus,
  UtensilsCrossed,
  Warehouse,
  WashingMachine,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  ADDON_DEFINITIONS,
  HYBRID_PLANS,
  calculateHybridPricing,
  getHybridPlan,
} from '../lib/saas/hybrid-pricing';
import { formatRupiah } from '../lib/pos/checkout-service';
import {
  ACTIVE_VERTICAL_DEFINITIONS,
  VERTICAL_GROUP_LABELS,
  type VerticalCategoryGroup,
} from '../lib/verticals/vertical-registry';
import { PackageComparisonModal } from '../components/PackageComparisonModal';
import type {
  AddOnModuleCode,
  BusinessVertical,
  SubscriptionPlanCode,
} from '../types/domain';

interface DemoVerticalCard {
  id: BusinessVertical;
  label: string;
  shortLabel: string;
  categoryGroup: VerticalCategoryGroup;
  demoBusinessName: string;
  summary: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  recommendedPlan: SubscriptionPlanCode;
  recommendedAddOns: AddOnModuleCode[];
}

function getDemoVerticalIcon(id: BusinessVertical) {
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

const DEMO_VERTICAL_CARDS: DemoVerticalCard[] = ACTIVE_VERTICAL_DEFINITIONS.map((def) => ({
  id: def.id,
  label: def.label,
  shortLabel: def.shortLabel,
  categoryGroup: def.categoryGroup,
  demoBusinessName: def.demoBusinessName,
  summary: def.summary,
  icon: getDemoVerticalIcon(def.id),
  recommendedPlan: def.recommendedPlan,
  recommendedAddOns: def.recommendedAddOns,
}));

const DEMO_GROUP_TABS: Array<{ id: 'ALL' | VerticalCategoryGroup; label: string }> = [
  { id: 'ALL', label: `Semua (${DEMO_VERTICAL_CARDS.length})` },
  { id: 'RETAIL_DAGANG', label: VERTICAL_GROUP_LABELS.RETAIL_DAGANG },
  { id: 'KULINER_FNB', label: VERTICAL_GROUP_LABELS.KULINER_FNB },
  { id: 'JASA_PERAWATAN', label: VERTICAL_GROUP_LABELS.JASA_PERAWATAN },
  { id: 'RENTAL_PROPETI', label: VERTICAL_GROUP_LABELS.RENTAL_PROPETI },
  { id: 'PRODUKSI_AGRO', label: VERTICAL_GROUP_LABELS.PRODUKSI_AGRO },
];

export function DemoHubPage() {
  const {
    navigate,
    systemDemoConfig,
    enterInstantDemo,
    registerDemoTrialUser,
    submitDemoRequest,
  } = useApp();

  const effectiveMode =
    systemDemoConfig.globalDemoMode ?? systemDemoConfig.demoMode ?? 'PUBLIC_INSTANT';
  const requiresReg = Boolean(systemDemoConfig.requireRegistrationForDemo);
  const durationDays =
    systemDemoConfig.defaultDemoDurationDays ?? systemDemoConfig.defaultDurationDays ?? 7;

  const visibleVerticals = useMemo(
    () =>
      DEMO_VERTICAL_CARDS.filter(
        (card) => systemDemoConfig.demoVisibility?.[card.id] !== false
      ),
    [systemDemoConfig.demoVisibility]
  );

  // Registration Gate state (when Master Admin enables requireRegistrationForDemo)
  const [registeredTrial, setRegisteredTrial] = useState<{
    fullName: string;
    email: string;
    demoExpiresAt: string;
    durationDays: number;
  } | null>(null);
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regWa, setRegWa] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Interactive 2-Step Demo Configurator State
  const [activeGroup, setActiveGroup] = useState<'ALL' | VerticalCategoryGroup>('ALL');
  const [selectedVertical, setSelectedVertical] = useState<BusinessVertical>(
    visibleVerticals[0]?.id ?? 'WARUNG_SEMBAKO'
  );
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanCode>('LITE');
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnModuleCode[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const filteredVerticals = useMemo(
    () =>
      activeGroup === 'ALL'
        ? visibleVerticals
        : visibleVerticals.filter((v) => v.categoryGroup === activeGroup),
    [activeGroup, visibleVerticals]
  );

  // Appointment Request state (when Master Admin sets APPOINTMENT_APPROVAL)
  const [reqFullName, setReqFullName] = useState('');
  const [reqBizName, setReqBizName] = useState('');
  const [reqVertical, setReqVertical] = useState<BusinessVertical>('WARUNG_SEMBAKO');
  const [reqWa, setReqWa] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqBranches, setReqBranches] = useState('1');
  const [reqSchedule, setReqSchedule] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqResult, setReqResult] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const activePlanObj = getHybridPlan(selectedPlan);
  const activeVerticalObj =
    visibleVerticals.find((v) => v.id === selectedVertical) ?? visibleVerticals[0];

  const pricingPreview = useMemo(
    () =>
      calculateHybridPricing({
        planCode: selectedPlan,
        selectedAddOns,
        billingCycle: 'MONTHLY',
      }),
    [selectedPlan, selectedAddOns]
  );

  const handleSelectVertical = (card: DemoVerticalCard) => {
    setSelectedVertical(card.id);
    setSelectedPlan(card.recommendedPlan);
    setSelectedAddOns(card.recommendedAddOns);
    setLaunchError(null);
  };

  const handleSelectPlan = (planCode: SubscriptionPlanCode) => {
    setSelectedPlan(planCode);
    // When switching to LITE or BASIC, reset optional add-ons
    // so LITE starts ultra-simple (cash-only, no PO, no thermal receipt)
    // and BASIC starts strictly as a 1-location workspace unless user explicitly adds one.
    if (planCode === 'LITE' || planCode === 'BASIC') {
      setSelectedAddOns([]);
    }
    setLaunchError(null);
  };

  const toggleAddOn = (code: AddOnModuleCode) => {
    setSelectedAddOns((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const buildSubscribeUrl = () => {
    const params = new URLSearchParams({
      mode: 'real',
      from: 'demo',
      vertical: selectedVertical,
      plan: selectedPlan,
    });
    if (selectedAddOns.length > 0) {
      params.set('addons', selectedAddOns.join(','));
    }
    return `/onboarding?${params.toString()}`;
  };

  const handleRegisterDemoTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);
    const res = await registerDemoTrialUser({
      fullName: regFullName,
      email: regEmail,
      whatsappNumber: regWa,
      password: regPassword,
    });
    setRegLoading(false);
    if (!res.ok || !res.registrant) {
      setRegError(res.error || 'Gagal mendaftar akun demo.');
      return;
    }
    setRegisteredTrial({
      fullName: res.registrant.fullName,
      email: res.registrant.email,
      demoExpiresAt: res.registrant.demoExpiresAt,
      durationDays: res.registrant.durationDays,
    });
  };

  const handleLaunchConfiguredDemo = async () => {
    setLaunching(true);
    setLaunchError(null);
    const res = await enterInstantDemo(selectedVertical, {
      selectedPlan,
      selectedAddOns,
      registrantEmail: registeredTrial?.email,
    });
    setLaunching(false);
    if (!res.ok) {
      setLaunchError(res.error || 'Gagal membuka akun demo.');
    }
  };

  const handleSubmitAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqSubmitting(true);
    setReqResult(null);
    const res = await submitDemoRequest({
      fullName: reqFullName,
      businessName: reqBizName,
      vertical: reqVertical,
      whatsappNumber: reqWa,
      email: reqEmail,
      branchCount: Math.max(1, Number(reqBranches || 1)),
      preferredSchedule: reqSchedule,
      notes: reqNotes,
    });
    setReqSubmitting(false);
    if (res.ok) {
      setReqResult({
        type: 'success',
        text: 'Permintaan jadwal demo berhasil dikirim! Master Admin akan menyetujui dan mengirimkan Magic Link demo terisolasi via WhatsApp.',
      });
      setReqFullName('');
      setReqBizName('');
      setReqWa('');
      setReqEmail('');
      setReqSchedule('');
      setReqNotes('');
    } else {
      setReqResult({
        type: 'error',
        text: res.error || 'Mohon lengkapi semua kolom formulir dengan benar.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Clean 3-Zone Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 tracking-tight leading-none">
                KasirAkun <span className="text-emerald-600">UMKM</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">Pusat Uji Coba Demo &amp; Simulasi Paket</p>
            </div>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Beranda</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
            >
              Login
            </button>
            <button
              type="button"
              data-testid="demo-hub-goto-onboarding"
              onClick={() => navigate(buildSubscribeUrl())}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Berlangganan Akun Asli</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Hero Intro */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-200 pb-8">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Coba Gratis &amp; Simulasi Paket KasirAkun UMKM
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">
              Simulasikan Paket &amp; Coba Demo Real Sesuai Usaha Anda
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Pilih dari 22 jenis usaha UMKM terlebih dahulu, lalu pilih paket (LITE / BASIC / PRO /
              EXPERT) dan fitur tambahan yang ingin dicoba. Hak akses dan menu di dalam demo seperti
              kasir tunai saja, kirim WA gratis lewat wa.me, QRIS non-tunai, kontrak rental, hingga
              multi-cabang akan tampil 100% sesuai pilihan Anda.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Berminat Langsung Berlangganan?</p>
              <button
                type="button"
                onClick={() => navigate(buildSubscribeUrl())}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 mt-0.5"
              >
                <span>Daftar &amp; Beli Akun Usaha Asli</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* Branch 1: Master Admin locked to APPOINTMENT_APPROVAL */}
        {effectiveMode === 'APPOINTMENT_APPROVAL' ? (
          <section className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Ajukan Jadwal Demo Terpandu (Approval Admin)
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Master Admin saat ini mengaktifkan mode demo terjadwal. Isi data singkat berikut untuk
                  mendapatkan ruang demo terisolasi selama {durationDays} hari beserta Magic Link via WhatsApp.
                </p>
              </div>
            </div>

            {reqResult && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-start gap-2 ${
                  reqResult.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {reqResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{reqResult.text}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmitAppointment(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={reqFullName}
                    onChange={(e) => setReqFullName(e.target.value)}
                    placeholder="Budi Santoso"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Usaha *</label>
                  <input
                    type="text"
                    required
                    value={reqBizName}
                    onChange={(e) => setReqBizName(e.target.value)}
                    placeholder="Toko Makmur / Barbershop Kita"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis UMKM *</label>
                  <select
                    value={reqVertical}
                    onChange={(e) => setReqVertical(e.target.value as BusinessVertical)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {DEMO_VERTICAL_CARDS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Cabang</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={reqBranches}
                    onChange={(e) => setReqBranches(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    value={reqWa}
                    onChange={(e) => setReqWa(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    placeholder="owner@usaha.id"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jadwal Demo yang Diinginkan *
                </label>
                <input
                  type="text"
                  required
                  value={reqSchedule}
                  onChange={(e) => setReqSchedule(e.target.value)}
                  placeholder="Contoh: Besok 14:00 WIB"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kebutuhan Fitur (Opsional)</label>
                <textarea
                  rows={2}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Misal: multi-cabang, komisi kapster, stok opname, atau PPh Final UMKM..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={reqSubmitting}
                className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl"
              >
                {reqSubmitting ? 'Mengirim Permintaan...' : 'Ajukan Jadwal Demo Sekarang'}
              </button>
            </form>
          </section>
        ) : requiresReg && !registeredTrial ? (
          /* Branch 2: Master Admin activated requireRegistrationForDemo -> Must Register Trial Account First */
          <section className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Langkah Awal: Daftar Akun Demo Gratis ({durationDays} Hari)
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Sesuai kebijakan Master Admin, silakan buat akun uji coba gratis terlebih dahulu.
                  Setelah terdaftar, Anda bebas memilih jenis UMKM dan paket fitur yang ingin disimulasikan selama {durationDays} hari.
                </p>
              </div>
            </div>

            {regError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{regError}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleRegisterDemoTrial(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  data-testid="demo-reg-name"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="Nama Pemilik Usaha"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    data-testid="demo-reg-email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="nama@usaha.id"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">No. WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    data-testid="demo-reg-wa"
                    value={regWa}
                    onChange={(e) => setRegWa(e.target.value)}
                    placeholder="0812-xxxx-xxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi Akun Demo *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  data-testid="demo-reg-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <button
                type="submit"
                disabled={regLoading}
                data-testid="demo-reg-submit-btn"
                className="w-full py-3 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl flex items-center justify-center gap-2"
              >
                {regLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mendaftarkan Akun Demo...</span>
                  </>
                ) : (
                  <>
                    <span>Lanjut Pilih Jenis UMKM &amp; Fitur Demo</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </section>
        ) : (
          /* Branch 3: Interactive 2-Step Demo Configurator (Vertical -> Plan & Add-Ons -> Launch Real Demo) */
          <div className="space-y-8">
            {registeredTrial && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Akun Demo Trial aktif: <strong>{registeredTrial.fullName}</strong> ({registeredTrial.email}) ·
                    Berlaku {registeredTrial.durationDays} hari s.d.{' '}
                    <strong className="font-mono">{registeredTrial.demoExpiresAt.slice(0, 10)}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Step 1: Pilih Jenis UMKM */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                    Langkah 1 dari 2
                  </p>
                  <h2 className="text-lg font-bold text-slate-900">
                    Pilih Bidang UMKM yang Ingin Anda Coba ({visibleVerticals.length} Pilihan Aktif)
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DEMO_GROUP_TABS.map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      data-testid={`demo-group-filter-${grp.id}`}
                      onClick={() => setActiveGroup(grp.id)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        activeGroup === grp.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {grp.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredVerticals.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  <Lock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  Saat ini belum ada akun demo yang diaktifkan pada kategori ini.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {filteredVerticals.map((card) => {
                    const Icon = card.icon;
                    const active = selectedVertical === card.id;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        data-testid={`demo-select-vertical-${card.id}`}
                        onClick={() => handleSelectVertical(card)}
                        className={`text-left p-4 rounded-2xl border transition-all ${
                          active
                            ? 'bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-500/15 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          {active && (
                            <span className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Dipilih
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900">{card.label}</p>
                        <p className="text-[11px] font-medium text-emerald-700 mt-0.5">
                          Demo: {card.demoBusinessName}
                        </p>
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed">{card.summary}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step 2: Pilih Paket & Add-On yang Ingin Disimulasikan di Ruang Demo */}
            {visibleVerticals.length > 0 && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                          Langkah 2 dari 2
                        </p>
                        <h2 className="text-lg font-bold text-slate-900">
                          Pilih Paket &amp; Fitur Add-On untuk Ruang Demo Anda
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Menu dan hak akses di dalam akun demo akan mengikuti paket &amp; add-on
                          yang Anda centang di sini agar pengalaman uji coba benar-benar realistis.
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="demo-open-package-comparison-btn"
                        onClick={() => setCompareOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap shrink-0"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>Bandingkan Paket</span>
                      </button>
                    </div>

                    {/* 4 Core Plans (LITE / BASIC / PRO / EXPERT) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {HYBRID_PLANS.map((plan) => {
                        const active = selectedPlan === plan.code;
                        return (
                          <button
                            key={plan.code}
                            type="button"
                            data-testid={`demo-select-plan-${plan.code}`}
                            onClick={() => handleSelectPlan(plan.code)}
                            className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider">
                                  {plan.name}
                                </span>
                                {active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                              </div>
                              <p className="text-lg font-bold font-mono tabular-nums mt-1.5">
                                {formatRupiah(plan.monthlyPrice)}
                                <span
                                  className={`text-[11px] font-sans font-normal ${
                                    active ? 'text-slate-300' : 'text-slate-500'
                                  }`}
                                >
                                  /bln
                                </span>
                              </p>
                              <p
                                className={`text-[11px] mt-1.5 leading-relaxed ${
                                  active ? 'text-slate-300' : 'text-slate-500'
                                }`}
                              >
                                {plan.tagline}
                              </p>
                            </div>
                            <ul className="mt-3 pt-3 border-t border-current/10 space-y-1.5 text-[11px]">
                              {plan.highlights.slice(0, 3).map((hl) => (
                                <li key={hl} className="flex items-start gap-1.5">
                                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                  <span className={active ? 'text-slate-200' : 'text-slate-600'}>
                                    {hl}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </button>
                        );
                      })}
                    </div>

                    {/* Modular Add-On Checkboxes */}
                    <div className="pt-2 space-y-3">
                      <p className="text-xs font-bold text-slate-800">
                        Tambahkan Modul Add-On Opsional (Jika Ingin Diuji Coba)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ADDON_DEFINITIONS.filter(
                          (a) =>
                            a.code !== 'ADDON_EXTRA_STAFF' &&
                            (!a.isSeparateAi || systemDemoConfig.allowAiInDemo)
                        ).map((addon) => {
                          const includedInPlan = activePlanObj.includedAddOns.includes(addon.code);
                          const checked = includedInPlan || selectedAddOns.includes(addon.code);
                          return (
                            <label
                              key={addon.code}
                              className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                                includedInPlan
                                  ? 'bg-emerald-50/60 border-emerald-200 cursor-default'
                                  : checked
                                  ? 'bg-sky-50/70 border-sky-300 cursor-pointer'
                                  : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={includedInPlan}
                                onChange={() => toggleAddOn(addon.code)}
                                className="mt-0.5 rounded border-slate-300 text-emerald-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-900">
                                    {addon.shortLabel}
                                  </p>
                                  <span className="text-[11px] font-mono font-semibold text-emerald-700 whitespace-nowrap">
                                    {includedInPlan
                                      ? 'Termasuk Paket'
                                      : `+${formatRupiah(addon.monthlyPrice)}/bln`}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                  {addon.description}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sticky Launch Summary Card */}
                <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
                  <div>
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                      Ringkasan Sesi Demo
                    </p>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      {activeVerticalObj?.demoBusinessName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Kategori: {activeVerticalObj?.label}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Paket Simulasi</span>
                      <span className="font-bold text-slate-900">{activePlanObj.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Lokasi Usaha</span>
                      <span
                        data-testid="demo-summary-branch-mode"
                        className="font-semibold text-slate-800"
                      >
                        {selectedAddOns.includes('ADDON_EXTRA_BRANCH')
                          ? 'Multi-Cabang Aktif'
                          : '1 Lokasi (Tanpa Cabang)'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Add-On Tambahan</span>
                      <span className="font-semibold text-slate-800">
                        {pricingPreview.billableAddOns.length > 0
                          ? `${pricingPreview.billableAddOns.length} modul`
                          : 'Standar paket'}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-slate-600">Estimasi Jika Berlangganan</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        {formatRupiah(pricingPreview.effectiveMonthlySubtotal)}/bln
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      * Uji coba di ruang demo 100% GRATIS tanpa kartu kredit &amp; tanpa biaya token AI.
                    </p>
                  </div>

                  {launchError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{launchError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={launching}
                    data-testid="launch-configured-demo-btn"
                    onClick={() => void handleLaunchConfiguredDemo()}
                    className="w-full py-3 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl flex items-center justify-center gap-2 shadow-xs"
                  >
                    {launching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Menyiapkan Ruang Demo...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Masuk Akun Demo Sesuai Pilihan</span>
                      </>
                    )}
                  </button>

                  <div className="pt-4 border-t border-slate-200 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cocok dengan pilihan di atas?</span>
                    </p>
                    <button
                      type="button"
                      data-testid="demo-subscribe-real-btn"
                      onClick={() => navigate(buildSubscribeUrl())}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <span>Berlangganan Akun Asli Sesuai Pilihan Ini</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Data demo terisolasi penuh dari akun berbayar.</span>
                    </p>
                  </div>
                </aside>
              </section>
            )}
          </div>
        )}
      </main>

      <PackageComparisonModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}
