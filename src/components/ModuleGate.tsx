import React from 'react';
import { Lock, Sparkles, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getModuleMetadata } from '../lib/saas/subscription-lifecycle';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { FeatureModule } from '../types/domain';

interface ModuleGateProps {
  requiredModule: FeatureModule['code'];
  featureTitle: string;
  children: React.ReactNode;
}

/**
 * Enforces subscription module access gating on protected operational routes.
 * Renders a clear upgrade/activation screen whenever the active tenant's plan
 * does not include `requiredModule`.
 */
export function ModuleGate({ requiredModule, featureTitle, children }: ModuleGateProps) {
  const { hasModule, activeWorkspace, toggleTenantModule, navigate } = useApp();

  if (hasModule(requiredModule)) {
    return <>{children}</>;
  }

  const mod = getModuleMetadata(requiredModule);

  return (
    <div
      data-testid={`module-gate-locked-${requiredModule}`}
      className="max-w-xl mx-auto my-8 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5"
    >
      <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
        <Lock className="w-6 h-6" />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
          Modul Tidak Aktif · {requiredModule}
        </p>
        <h2 className="text-xl font-bold text-slate-900">
          Fitur {featureTitle} Memerlukan Modul {mod.name}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Tenant aktif <strong className="text-slate-800">{activeWorkspace.tenant.name}</strong>{' '}
          saat ini belum mengaktifkan modul <strong className="text-slate-800">{mod.name}</strong>.{' '}
          {mod.description}
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between text-xs">
        <span className="text-slate-600">Biaya Tambahan Modul</span>
        <span className="font-mono font-bold text-slate-900 tabular-nums">
          {formatRupiah(mod.monthlyPrice)} / bulan
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => toggleTenantModule(requiredModule)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span>Aktifkan Modul Sekarang</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings/custom-fields')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Kelola di Pengaturan</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
