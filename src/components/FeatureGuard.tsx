import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  calculateHybridPricing,
  getAddOnDefinition,
} from '../lib/saas/hybrid-pricing';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { AddOnModuleCode } from '../types/domain';

export interface FeatureGuardProps {
  moduleCode: AddOnModuleCode;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Modular Hybrid Subscription Feature Guard.
 * Unlocks children immediately when the active tenant's Plan or Add-Ons cover `moduleCode`.
 * When locked, displays a clean preview card with 1-click Add-On activation and
 * Smart PRO Upsell recommendation whenever BASIC + Add-Ons > Rp190.000/bln.
 */
export function FeatureGuard({
  moduleCode,
  title,
  description,
  children,
}: FeatureGuardProps) {
  const {
    activeWorkspace,
    hasAddOn,
    activateAddOn,
    switchHybridPlan,
    navigate,
  } = useApp();
  const [activatedMsg, setActivatedMsg] = useState<string | null>(null);

  const unlocked = hasAddOn(moduleCode);
  const addOnDef = useMemo(() => getAddOnDefinition(moduleCode), [moduleCode]);

  const currentPlan = activeWorkspace.tenant.subscriptionPlan ?? 'BASIC';
  const currentAddOns = activeWorkspace.tenant.activeAddOns ?? [];

  const simulatedPricing = useMemo(
    () =>
      calculateHybridPricing({
        planCode: currentPlan,
        selectedAddOns: Array.from(new Set([...currentAddOns, moduleCode])),
        billingCycle: activeWorkspace.tenant.billingCycle ?? 'MONTHLY',
      }),
    [currentPlan, currentAddOns, moduleCode, activeWorkspace.tenant.billingCycle]
  );

  if (unlocked) {
    return <>{children}</>;
  }

  const handleActivate = () => {
    activateAddOn(moduleCode);
    setActivatedMsg(`${addOnDef.name} berhasil diaktifkan untuk ${activeWorkspace.tenant.name}.`);
  };

  const handleUpgradeToPro = () => {
    switchHybridPlan('PRO', currentAddOns);
    setActivatedMsg('Berhasil beralih ke Paket PRO Rp199.000/bln.');
  };

  return (
    <div
      data-testid={`feature-guard-locked-${moduleCode}`}
      className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto my-6 space-y-6"
    >
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
          {addOnDef.isSeparateAi ? (
            <Sparkles className="w-5 h-5 text-emerald-700" />
          ) : (
            <Lock className="w-5 h-5 text-slate-700" />
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-medium text-slate-500">
            {addOnDef.isSeparateAi
              ? 'Add-On AI Terpisah · 0 Token AI di Paket Inti'
              : `Add-On Modular · Paket Aktif: ${currentPlan}`}
          </p>
          <h2 className="text-lg font-bold text-slate-900 leading-snug">
            {title ?? addOnDef.name}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {description ?? addOnDef.description}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
        <div>
          <p className="text-xs text-slate-500">Biaya Add-On Bulanan</p>
          <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            +{formatRupiah(addOnDef.monthlyPrice)}
            <span className="text-xs font-sans font-normal text-slate-500">/bulan</span>
          </p>
          {addOnDef.quotaLabel && (
            <p className="text-xs text-slate-500 mt-1">{addOnDef.quotaLabel}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500">Termasuk Otomatis di Paket</p>
          <p className="text-sm font-semibold text-slate-800 mt-1">
            {addOnDef.includedInPlans.length > 0
              ? addOnDef.includedInPlans.map((p) => `Paket ${p}`).join(' / ')
              : addOnDef.isSeparateAi
              ? 'Terpisah dari BASIC, PRO & EXPERT'
              : 'Add-On Fleksibel (Semua Paket)'}
          </p>
        </div>
      </div>

      {simulatedPricing.smartUpsellRecommendation && !addOnDef.isSeparateAi && (
        <div
          data-testid="feature-guard-pro-upsell"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-emerald-900">
              Rekomendasi Hemat Paket PRO
            </p>
            <p className="text-xs text-emerald-800 leading-relaxed">
              {simulatedPricing.smartUpsellRecommendation}
            </p>
          </div>
          <button
            type="button"
            onClick={handleUpgradeToPro}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Pilih PRO Rp199rb/bln
          </button>
        </div>
      )}

      {activatedMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{activatedMsg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => navigate('/billing')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
        >
          <span>Bandingkan Semua Paket &amp; Simulasi Harga</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          data-testid={`activate-addon-btn-${moduleCode}`}
          onClick={handleActivate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <span>
            Aktifkan Add-On (+{formatRupiah(addOnDef.monthlyPrice)}/bln)
          </span>
        </button>
      </div>
    </div>
  );
}
