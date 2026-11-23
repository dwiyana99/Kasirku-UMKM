import React, { useMemo, useState } from 'react';
import { Check, CheckCircle2, MessageSquarePlus, Send, Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useApp } from '../context/AppContext';
import {
  ADDON_DEFINITIONS,
  calculateHybridPricing,
  HYBRID_PLANS,
} from '../lib/saas/hybrid-pricing';
import { formatRupiah } from '../lib/pos/checkout-service';
import type {
  AddOnModuleCode,
  BillingCycle,
  SubscriptionPlanCode,
} from '../types/domain';

export function SubscriptionPlansPage() {
  const { activeWorkspace, switchHybridPlan } = useApp();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanCode>(
    activeWorkspace.tenant.subscriptionPlan ?? 'BASIC'
  );
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnModuleCode[]>(
    activeWorkspace.tenant.activeAddOns ?? []
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    activeWorkspace.tenant.billingCycle ?? 'MONTHLY'
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Custom Add-On / Special Feature Request State (strictly inside /billing)
  interface CustomAddOnRequestItem {
    id: string;
    featureName: string;
    details: string;
    contactWa: string;
    createdAt: string;
  }
  const CUSTOM_REQ_STORAGE_KEY = `kasirakun_custom_addon_req_${activeWorkspace.tenant.id}`;
  const [customReqName, setCustomReqName] = useState('');
  const [customReqDetails, setCustomReqDetails] = useState('');
  const [customReqWa, setCustomReqWa] = useState('');
  const [customReqSuccess, setCustomReqSuccess] = useState<string | null>(null);
  const [customRequests, setCustomRequests] = useState<CustomAddOnRequestItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_REQ_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage read error
    }
    return [];
  });

  const handleSubmitCustomAddOn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customReqName.trim() || !customReqDetails.trim()) return;
    const nextItem: CustomAddOnRequestItem = {
      id: `req-${Date.now()}`,
      featureName: customReqName.trim(),
      details: customReqDetails.trim(),
      contactWa: customReqWa.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextList = [nextItem, ...customRequests];
    setCustomRequests(nextList);
    try {
      window.localStorage.setItem(CUSTOM_REQ_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // ignore storage write error
    }
    setCustomReqName('');
    setCustomReqDetails('');
    setCustomReqWa('');
    setCustomReqSuccess(
      `Permintaan add-on "${nextItem.featureName}" berhasil dikirim ke tim KasirAkun.`
    );
    window.setTimeout(() => setCustomReqSuccess(null), 5000);
  };

  const pricing = useMemo(
    () =>
      calculateHybridPricing({
        planCode: selectedPlan,
        selectedAddOns,
        billingCycle,
      }),
    [selectedPlan, selectedAddOns, billingCycle]
  );

  const toggleAddOnSelection = (code: AddOnModuleCode) => {
    setSelectedAddOns((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
    setSavedNotice(null);
  };

  const handleApplyPlan = () => {
    switchHybridPlan(selectedPlan, selectedAddOns);
    setSavedNotice(
      `Langganan ${activeWorkspace.tenant.name} berhasil diperbarui ke Paket ${selectedPlan} (${selectedAddOns.length} add-on aktif).`
    );
  };

  const regularAddOns = ADDON_DEFINITIONS.filter((a) => !a.isSeparateAi);
  const aiAddOn = ADDON_DEFINITIONS.find((a) => a.isSeparateAi)!;

  return (
    <AppShell
      title="Paket Langganan Hybrid & Add-On Modular"
      subtitle="Mulai Rp49.000/bln dengan 0 biaya token AI di seluruh paket inti · Aktifkan fitur tambahan sesuai kebutuhan usaha"
    >
      <div className="space-y-6">
        {savedNotice && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {savedNotice}
            </span>
            <button
              type="button"
              onClick={() => setSavedNotice(null)}
              className="font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Billing Cycle Segmented Control */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">1. Pilih Paket Dasar (100% 0 Token AI)</h2>
            <p className="text-xs text-slate-500">
              Bayar tahunan hemat 15% (LITE hanya Rp41.650/bln, BASIC Rp85.000/bln).
            </p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setBillingCycle('MONTHLY')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                billingCycle === 'MONTHLY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('ANNUAL')}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                billingCycle === 'ANNUAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tahunan (Hemat 15%)
            </button>
          </div>
        </div>

        {/* 4 Core Plan Cards (LITE / BASIC / PRO / EXPERT) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {HYBRID_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.code;
            const displayPrice =
              billingCycle === 'ANNUAL' ? plan.annualMonthlyEquivalent : plan.monthlyPrice;
            return (
              <div
                key={plan.code}
                className={`rounded-2xl p-6 flex flex-col justify-between gap-5 transition-colors border ${
                  isSelected
                    ? 'bg-emerald-50/40 border-emerald-600 ring-1 ring-emerald-600'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-emerald-700">
                        {plan.badge ?? `Maks ${plan.maxStaff} Staf · ${plan.maxBranches} Cabang`}
                      </p>
                      <h3 className="text-lg font-bold text-slate-900 mt-0.5">{plan.name}</h3>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{plan.tagline}</p>
                  <div>
                    <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                      {formatRupiah(displayPrice)}
                      <span className="text-xs font-sans font-normal text-slate-500">/bulan</span>
                    </p>
                    <p className="text-[11px] font-medium text-emerald-700 mt-1">
                      {plan.zeroAiTokenNote}
                    </p>
                  </div>
                  <ul className="space-y-2 pt-3 border-t border-slate-100 text-xs text-slate-700">
                    {plan.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlan(plan.code);
                    setSavedNotice(null);
                  }}
                  className={`w-full py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isSelected ? 'Paket Terpilih' : `Pilih ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Modular Add-Ons + Live Invoice Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  2. Tambah Add-On Modular (Opsional)
                </h2>
                <p className="text-xs text-slate-500">
                  Add-On yang sudah tercakup di Paket {selectedPlan} otomatis gratis.
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {regularAddOns.map((addon) => {
                  const included = pricing.includedAddOns.includes(addon.code);
                  const checked = included || selectedAddOns.includes(addon.code);
                  return (
                    <label
                      key={addon.code}
                      className="py-3 flex items-start justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={included}
                          onChange={() => toggleAddOnSelection(addon.code)}
                          className="mt-1 rounded border-slate-300 text-emerald-600"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-slate-900">{addon.name}</p>
                            {addon.badgeLabel && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800">
                                {addon.badgeLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                            {addon.description}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-semibold tabular-nums whitespace-nowrap shrink-0 text-slate-800">
                        {included ? (
                          <span className="text-emerald-700 font-sans">Termasuk</span>
                        ) : (
                          `+${formatRupiah(addon.monthlyPrice)}/bln`
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Separate Highlighted AI Add-On Box */}
            <div className="bg-stone-900 text-white rounded-2xl p-6 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-emerald-400 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Add-On Terpisah · Tidak Termasuk di Paket LITE, BASIC, PRO, maupun EXPERT</span>
                  </p>
                  <h3 className="text-sm font-bold">{aiAddOn.name}</h3>
                  <p className="text-xs text-stone-300 leading-relaxed">{aiAddOn.description}</p>
                </div>
                <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAddOns.includes('ADDON_AI_ASSISTANT')}
                    onChange={() => toggleAddOnSelection('ADDON_AI_ASSISTANT')}
                    className="rounded border-stone-600 text-emerald-500"
                  />
                  <span className="text-xs font-mono font-bold text-emerald-300 whitespace-nowrap">
                    +{formatRupiah(aiAddOn.monthlyPrice)}/bln
                  </span>
                </label>
              </div>
            </div>

            {/* Request Custom Add-On / Fitur Khusus (Dedicated inside Paket & Add-On page) */}
            <section
              data-testid="custom-addon-request-section"
              className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-start gap-2.5">
                <MessageSquarePlus className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <h2 className="text-sm font-bold text-stone-900">
                    3. Request Add-On / Fitur Khusus
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                    Butuh fitur tambahan di luar daftar add-on di atas untuk usaha Anda? Kirimkan
                    kebutuhan spesifik Anda di sini agar tim kami dapat menyiapkan modul yang sesuai.
                  </p>
                </div>
              </div>

              {customReqSuccess && (
                <div
                  role="status"
                  data-testid="custom-addon-request-success"
                  className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
                  <span>{customReqSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSubmitCustomAddOn} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="custom-addon-name"
                      className="block text-xs font-medium text-stone-700 mb-1"
                    >
                      Nama Add-On / Fitur yang Dibutuhkan *
                    </label>
                    <input
                      id="custom-addon-name"
                      data-testid="custom-addon-name-input"
                      type="text"
                      required
                      value={customReqName}
                      onChange={(e) => setCustomReqName(e.target.value)}
                      placeholder="Contoh: Integrasi Timbangan Digital / Cetak Label Barcode"
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-addon-wa"
                      className="block text-xs font-medium text-stone-700 mb-1"
                    >
                      Nomor WhatsApp untuk Konfirmasi
                    </label>
                    <input
                      id="custom-addon-wa"
                      data-testid="custom-addon-wa-input"
                      type="tel"
                      value={customReqWa}
                      onChange={(e) => setCustomReqWa(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="w-full px-3 py-2 text-xs font-mono bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="custom-addon-details"
                    className="block text-xs font-medium text-stone-700 mb-1"
                  >
                    Penjelasan Singkat Kebutuhan Usaha *
                  </label>
                  <textarea
                    id="custom-addon-details"
                    data-testid="custom-addon-details-input"
                    required
                    rows={3}
                    value={customReqDetails}
                    onChange={(e) => setCustomReqDetails(e.target.value)}
                    placeholder="Ceritakan alur kerja atau fitur khusus yang ingin Anda tambahkan di usaha Anda..."
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="custom-addon-submit-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Kirim Request Add-On Khusus</span>
                  </button>
                </div>
              </form>

              {customRequests.length > 0 && (
                <div className="pt-3 border-t border-stone-100 space-y-2">
                  <p className="text-[11px] font-semibold text-stone-500">
                    Riwayat Request Add-On Khusus ({customRequests.length})
                  </p>
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                    {customRequests.slice(0, 5).map((req) => (
                      <div key={req.id} className="px-3.5 py-2.5 bg-stone-50/50 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-stone-900">{req.featureName}</p>
                          <span className="text-[11px] font-medium text-emerald-700 shrink-0">
                            Terkirim
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-600">{req.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Sticky Live Billing Calculator */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Ringkasan Tagihan Hybrid</h2>

            {pricing.smartUpsellRecommendation && (
              <div
                data-testid="billing-pro-upsell-alert"
                className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2"
              >
                <p className="text-xs font-bold text-emerald-900">
                  {pricing.smartUpsellRecommendation}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedPlan(selectedPlan === 'LITE' ? 'BASIC' : 'PRO')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  {selectedPlan === 'LITE'
                    ? 'Beralih ke Paket BASIC sekarang'
                    : 'Beralih ke Paket PRO sekarang'}
                </button>
              </div>
            )}

            <div className="space-y-2 text-xs border-t border-b border-slate-100 py-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Paket Dasar ({selectedPlan})</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatRupiah(pricing.basePlanMonthly)}/bln
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Add-On Tambahan ({pricing.billableAddOns.length} aktif)
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatRupiah(pricing.paidAddOnsMonthly)}/bln
                </span>
              </div>
              {billingCycle === 'ANNUAL' && (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon Tahunan (15%)</span>
                  <span className="font-mono font-semibold tabular-nums">
                    -{formatRupiah(pricing.annualDiscountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600">
                  Subtotal ({billingCycle === 'ANNUAL' ? '12 Bulan' : '1 Bulan'})
                </span>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatRupiah(pricing.billingSubtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>DPP Nilai Lain (11/12 · PMK 131/2024)</span>
                <span className="font-mono tabular-nums">{formatRupiah(pricing.dppNilaiLain)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>PPN 12% × DPP (Efektif 11%)</span>
                <span className="font-mono tabular-nums">{formatRupiah(pricing.ppnAmount)}</span>
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-slate-900">Total Tagihan</span>
              <span className="text-xl font-bold font-mono tabular-nums text-emerald-700">
                {formatRupiah(pricing.grandTotal)}
              </span>
            </div>

            <button
              type="button"
              data-testid="apply-hybrid-plan-btn"
              onClick={handleApplyPlan}
              className="w-full py-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              Terapkan Paket &amp; Add-On ke {activeWorkspace.tenant.name}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
