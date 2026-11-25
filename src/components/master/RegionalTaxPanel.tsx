import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { RegionalTaxRule } from '../../types/domain';
import { formatRupiah } from '../../lib/pos/checkout-service';

interface DraftRegionForm {
  regionCode: string;
  province: string;
  cityName: string;
  pbjtFoodBeverageRate: string; // percent string e.g. '10'
  pbjtHotelVillaRate: string;
  pbjtSpaEntertainmentRate: string;
  pbjtParkingRate: string;
  pbjtSportsRate: string;
  umkmExemptMonthlyThreshold: string;
  regulationRef: string;
  notes: string;
}

function toPercentStr(decimalRate: string): string {
  const num = Number(decimalRate || '0') * 100;
  return Number.isFinite(num) ? String(Number(num.toFixed(2))) : '0';
}

function fromPercentStr(percentStr: string): string {
  const num = Number(percentStr || '0');
  if (!Number.isFinite(num) || num < 0) return '0.0000';
  return (num / 100).toFixed(4);
}

export function RegionalTaxPanel() {
  const {
    regionalTaxRegistry,
    updateRegionalTaxRule,
    syncLatestRegionalTaxes,
    workspaces,
  } = useApp();

  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('ALL');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<DraftRegionForm | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);

  const provinces = useMemo(() => {
    const set = new Set(
      regionalTaxRegistry
        .filter((r) => r.regionCode !== 'ID-NONE')
        .map((r) => r.province)
    );
    return Array.from(set).sort();
  }, [regionalTaxRegistry]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regionalTaxRegistry.filter((r) => {
      if (provinceFilter !== 'ALL' && r.province !== provinceFilter) return false;
      if (!q) return true;
      return (
        r.cityName.toLowerCase().includes(q) ||
        r.province.toLowerCase().includes(q) ||
        r.regionCode.toLowerCase().includes(q) ||
        r.perdaReference.toLowerCase().includes(q)
      );
    });
  }, [provinceFilter, regionalTaxRegistry, search]);

  const tenantCountsByRegion = useMemo(() => {
    const map = new Map<string, number>();
    for (const ws of workspaces) {
      const code = ws.tenant.settings.regionalTax?.regionCode;
      if (code) {
        map.set(code, (map.get(code) ?? 0) + 1);
      }
    }
    return map;
  }, [workspaces]);

  const handleSyncLatest = () => {
    const res = syncLatestRegionalTaxes();
    setFeedback(
      `Sinkronisasi selesai: ${res.addedCount} wilayah baru ditambahkan, ${res.updatedCount} wilayah diperbarui, dan ${res.syncedTenants} tenant aktif ikut tersinkron otomatis.`
    );
  };

  const openEditModal = (rule: RegionalTaxRule) => {
    setIsNewMode(false);
    setEditingRule({
      regionCode: rule.regionCode,
      province: rule.province,
      cityName: rule.cityName,
      pbjtFoodBeverageRate: toPercentStr(rule.pbjtFoodBeverageRate),
      pbjtHotelVillaRate: toPercentStr(rule.pbjtHospitalityRate),
      pbjtSpaEntertainmentRate: toPercentStr(rule.pbjtEntertainmentSpaRate),
      pbjtParkingRate: toPercentStr(rule.pbjtParkingRate),
      pbjtSportsRate: toPercentStr(rule.pbjtSportsRate),
      umkmExemptMonthlyThreshold: String(Math.round(Number(rule.umkmExemptMonthlyThreshold || '0'))),
      regulationRef: rule.perdaReference,
      notes: rule.notes ?? '',
    });
  };

  const openAddModal = () => {
    setIsNewMode(true);
    setEditingRule({
      regionCode: `ID-${String(regionalTaxRegistry.length + 1).padStart(3, '0')}`,
      province: '',
      cityName: '',
      pbjtFoodBeverageRate: '10',
      pbjtHotelVillaRate: '10',
      pbjtSpaEntertainmentRate: '25',
      pbjtParkingRate: '10',
      pbjtSportsRate: '0',
      umkmExemptMonthlyThreshold: '5000000',
      regulationRef: 'Perda PDRD Kabupaten/Kota (UU HKPD)',
      notes: '',
    });
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (!editingRule.regionCode.trim() || !editingRule.cityName.trim() || !editingRule.province.trim()) {
      return;
    }
    const nextRule: RegionalTaxRule = {
      regionCode: editingRule.regionCode.trim().toUpperCase(),
      province: editingRule.province.trim(),
      cityName: editingRule.cityName.trim(),
      pbjtFoodBeverageRate: fromPercentStr(editingRule.pbjtFoodBeverageRate),
      pbjtHospitalityRate: fromPercentStr(editingRule.pbjtHotelVillaRate),
      pbjtEntertainmentSpaRate: fromPercentStr(editingRule.pbjtSpaEntertainmentRate),
      pbjtParkingRate: fromPercentStr(editingRule.pbjtParkingRate),
      pbjtSportsRate: fromPercentStr(editingRule.pbjtSportsRate),
      umkmExemptMonthlyThreshold: `${Math.max(0, Number(editingRule.umkmExemptMonthlyThreshold || '0'))}.0000`,
      perdaReference: editingRule.regulationRef.trim() || 'UU HKPD No. 1/2022',
      notes: editingRule.notes.trim() || '',
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    updateRegionalTaxRule(nextRule);
    setFeedback(
      `Tarif Pajak Daerah ${nextRule.cityName} (${nextRule.regionCode}) berhasil disimpan dan otomatis tersinkron ke semua usaha di wilayah tersebut.`
    );
    setEditingRule(null);
  };

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-stone-900">
              <Landmark className="h-5 w-5 text-emerald-700" strokeWidth={1.75} />
              <h2 className="text-lg font-bold tracking-[-0.02em]">
                Database Pajak Daerah Indonesia (PBJT / UU HKPD)
              </h2>
            </div>
            <p className="mt-1 max-w-[68ch] text-sm text-stone-600">
              Kelola tarif PBJT Makanan/Minuman, Perhotelan/Homestay/Villa, SPA/Hiburan, Parkir/Garasi, dan Olahraga/Lapangan untuk 38+ kota/kabupaten. Setiap perubahan tarif langsung tersinkron otomatis ke tenant yang berdomisili di kota terkait.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSyncLatest}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              Import & Sinkronkan Tarif Terbaru (38+ Wilayah)
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Tambah Wilayah Baru
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={1.75} />
              {feedback}
            </span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
              strokeWidth={1.75}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama kota, kabupaten, provinsi, atau nomor Perda..."
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>
          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
          >
            <option value="ALL">Semua Provinsi ({regionalTaxRegistry.length} wilayah)</option>
            {provinces.map((prov) => (
              <option key={prov} value={prov}>
                {prov}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">Kota / Kabupaten</th>
                <th className="px-3 py-3 text-right">PBJT Makan</th>
                <th className="px-3 py-3 text-right">PBJT Hotel/Villa</th>
                <th className="px-3 py-3 text-right">PBJT SPA</th>
                <th className="px-3 py-3 text-right">PBJT Parkir</th>
                <th className="px-3 py-3 text-right">PBJT Olahraga</th>
                <th className="px-3 py-3 text-right">Batas UMKM/Bln</th>
                <th className="px-3 py-3 text-center">Tenant</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredRules.map((rule) => {
                const usedCount = tenantCountsByRegion.get(rule.regionCode) ?? 0;
                return (
                  <tr key={rule.regionCode} className="hover:bg-stone-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-900">{rule.cityName}</div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        <span className="font-mono text-[11px] text-stone-600">{rule.regionCode}</span>
                        {' · '}
                        {rule.province}
                      </div>
                      <div className="mt-0.5 text-[11px] text-stone-400">{rule.perdaReference}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-stone-800">
                      {toPercentStr(rule.pbjtFoodBeverageRate)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-stone-800">
                      {toPercentStr(rule.pbjtHospitalityRate)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-amber-700">
                      {toPercentStr(rule.pbjtEntertainmentSpaRate)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-stone-800">
                      {toPercentStr(rule.pbjtParkingRate)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold tabular-nums text-stone-800">
                      {toPercentStr(rule.pbjtSportsRate)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-stone-600">
                      {Number(rule.umkmExemptMonthlyThreshold) > 0
                        ? formatRupiah(rule.umkmExemptMonthlyThreshold)
                        : 'Bebas / 0'}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-xs tabular-nums text-stone-700">
                      {usedCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditModal(rule)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Ubah
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Add Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
          <form
            onSubmit={handleSaveRule}
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                {isNewMode ? 'Tambah Wilayah Pajak Daerah' : `Ubah Tarif: ${editingRule.cityName}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Kode Wilayah
                </label>
                <input
                  type="text"
                  required
                  disabled={!isNewMode}
                  value={editingRule.regionCode}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, regionCode: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-900 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Provinsi
                </label>
                <input
                  type="text"
                  required
                  value={editingRule.province}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, province: e.target.value })
                  }
                  placeholder="Contoh: Jawa Barat"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Nama Kota / Kabupaten
                </label>
                <input
                  type="text"
                  required
                  value={editingRule.cityName}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, cityName: e.target.value })
                  }
                  placeholder="Contoh: Kota Depok"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  PBJT Makanan & Minuman (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingRule.pbjtFoodBeverageRate}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, pbjtFoodBeverageRate: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  PBJT Hotel / Homestay / Villa (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingRule.pbjtHotelVillaRate}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, pbjtHotelVillaRate: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  PBJT SPA & Hiburan (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingRule.pbjtSpaEntertainmentRate}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, pbjtSpaEntertainmentRate: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  PBJT Parkir / Garasi (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingRule.pbjtParkingRate}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, pbjtParkingRate: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  PBJT Olahraga / Lapangan (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={editingRule.pbjtSportsRate}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, pbjtSportsRate: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Batas Omzet Bebas PBJT / Bulan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={editingRule.umkmExemptMonthlyThreshold}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      umkmExemptMonthlyThreshold: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm tabular-nums text-stone-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-700">
                  Dasar Hukum / Perda
                </label>
                <input
                  type="text"
                  value={editingRule.regulationRef}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, regulationRef: e.target.value })
                  }
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-stone-200 pt-4">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Simpan & Sinkronkan Tenant
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
