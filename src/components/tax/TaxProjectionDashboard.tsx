import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CalendarClock, Info, PiggyBank, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatRupiah } from '../../lib/pos/checkout-service';
import {
  buildTaxProjectionDashboard,
  computeMonthlyBaselineTurnover,
} from '../../lib/tax/tax-projection-engine';

function formatCompactRp(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
}

export function TaxProjectionDashboard() {
  const { activeWorkspace, regionalTaxRegistry } = useApp();
  const autoBaseline = useMemo(
    () => computeMonthlyBaselineTurnover(activeWorkspace),
    [activeWorkspace]
  );

  const [customMonthlyTurnover, setCustomMonthlyTurnover] = useState<string>('');
  const [monthlyGrowthPct, setMonthlyGrowthPct] = useState<number>(5);

  const effectiveTurnover =
    customMonthlyTurnover.trim() !== '' && Number(customMonthlyTurnover) >= 0
      ? customMonthlyTurnover
      : autoBaseline;

  const projection = useMemo(
    () =>
      buildTaxProjectionDashboard({
        tenant: activeWorkspace.tenant,
        monthlyTurnoverEstimate: effectiveTurnover,
        monthlyGrowthPct,
        monthsAhead: 6,
        regionalTaxRegistry,
      }),
    [activeWorkspace.tenant, effectiveTurnover, monthlyGrowthPct, regionalTaxRegistry]
  );

  if (!projection.isSupportedForEntity) {
    return (
      <section
        data-testid="tax-projection-unsupported"
        className="rounded-xl border border-stone-200 bg-white p-5 flex items-start gap-3"
      >
        <Info className="h-5 w-5 text-stone-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-stone-900">
            Proyeksi Estimasi Pajak Bulanan (PPh Final 0,5% / PPN) Tidak Berlaku
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed max-w-[65ch]">
            {projection.unsupportedReason}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="tax-projection-dashboard"
      className="rounded-xl border border-stone-200 bg-white overflow-hidden"
    >
      {/* Header & Interactive Simulator Inputs */}
      <div className="p-5 border-b border-stone-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
            <h2 className="text-base font-bold text-stone-900">
              Proyeksi Arus Kas &amp; Estimasi Pajak Terutang Bulanan (6 Bulan)
            </h2>
          </div>
          <p className="text-xs text-stone-500 max-w-[65ch]">
            Estimasi otomatis berdasarkan omzet berjalan, status PKP, batas bebas Rp500 juta WP OP (PP 20/2026), dan tarif PBJT daerah aktif agar Anda bisa menyisihkan dana pajak lebih awal.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="tax-proj-turnover"
              className="block text-[11px] font-semibold text-stone-600 mb-1"
            >
              Basis Omzet / Bulan (Rp)
            </label>
            <input
              id="tax-proj-turnover"
              type="number"
              min={0}
              step={500000}
              value={customMonthlyTurnover}
              onChange={(e) => setCustomMonthlyTurnover(e.target.value)}
              placeholder={String(Math.round(Number(autoBaseline)))}
              className="w-44 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs tabular-nums text-stone-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="tax-proj-growth"
              className="block text-[11px] font-semibold text-stone-600 mb-1"
            >
              Asumsi Kenaikan / Bln
            </label>
            <select
              id="tax-proj-growth"
              value={monthlyGrowthPct}
              onChange={(e) => setMonthlyGrowthPct(Number(e.target.value))}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 focus:border-emerald-600 focus:outline-none"
            >
              <option value={0}>Tetap (0%)</option>
              <option value={5}>Tumbuh +5% / bln</option>
              <option value={10}>Tumbuh +10% / bln</option>
              <option value={15}>Tumbuh +15% / bln</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cashflow Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stone-200 border-b border-stone-200">
        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Estimasi Pajak Bulan Ini
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-stone-900">
            {formatRupiah(projection.currentMonthTotalTax)}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Beban efektif {projection.effectiveTaxBurdenPct}% dari omzet
          </p>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <PiggyBank className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sisihkan per Hari
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700">
            {formatRupiah(projection.recommendedDailyReserve)}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Target tabungan kas pajak harian</p>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Proyeksi 6 Bulan
          </p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-stone-900">
            {formatRupiah(projection.sixMonthTotalTax)}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500">Akumulasi kas pajak 6 bulan depan</p>
        </div>

        <div className="bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            {activeWorkspace.tenant.taxEntity === 'WP_OP' && projection.isEligiblePphFinal05
              ? 'Sisa Kuota Bebas Rp500 Jt'
              : 'Komponen Pajak Aktif'}
          </p>
          {activeWorkspace.tenant.taxEntity === 'WP_OP' && projection.isEligiblePphFinal05 ? (
            <>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-stone-900">
                {formatRupiah(projection.remainingWpOpExemptQuota)}
              </p>
              <p className="mt-0.5 text-[11px] text-stone-500">Sebelum tarif 0,5% mulai berlaku</p>
            </>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {projection.isEligiblePphFinal05 && (
                <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  PPh Final 0,5%
                </span>
              )}
              {projection.appliesPpn11 && (
                <span className="rounded bg-stone-100 border border-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-800">
                  PPN 11%
                </span>
              )}
              {projection.appliesRegionalPbjt && (
                <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  PBJT {projection.regionalPbjtRatePct}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {projection.exceedsUmkm48BCap && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" strokeWidth={1.75} />
          <span>
            Proyeksi omzet kumulatif melewati Rp4,8 Miliar/tahun. Persiapkan pengukuhan PKP dan skema PPh umum tahun pajak berikutnya.
          </span>
        </div>
      )}

      {Number(projection.sixMonthTotalTax) === 0 && (
        <div className="px-5 py-3 bg-emerald-50/70 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-900">
          <span>
            Proyeksi omzet 6 bulan ke depan masih di bawah sisa kuota bebas pajak Rp500 juta (WP OP, PP 20/2026), sehingga estimasi PPh Final Rp0. Grafik menampilkan proyeksi omzet bulanan.
          </span>
          <button
            type="button"
            data-testid="tax-simulate-above-500m-btn"
            onClick={() => setCustomMonthlyTurnover('15000000')}
            className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            Simulasi Omzet Rp15 Jt/Bln
          </button>
        </div>
      )}

      {/* Visual Stacked Bar Chart (Recharts) */}
      <div className="p-5">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={projection.points}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: '#57534E' }}
                axisLine={{ stroke: '#E7E5E4' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `Rp${formatCompactRp(v)}`}
                tick={{ fontSize: 11, fill: '#57534E' }}
                axisLine={false}
                tickLine={false}
                width={68}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  formatRupiah(String(value ?? 0)),
                  String(name ?? ''),
                ]}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E7E5E4',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              {Number(projection.sixMonthTotalTax) === 0 ? (
                <Bar
                  dataKey="projectedTurnover"
                  name="Proyeksi Omzet Bulanan (Bebas PPh ≤ Rp500 Jt)"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                />
              ) : (
                <>
                  {projection.isEligiblePphFinal05 && (
                    <Bar
                      dataKey="pphFinalPayable"
                      name="PPh Final 0,5%"
                      stackId="tax"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                  {projection.appliesPpn11 && (
                    <Bar
                      dataKey="ppnPayable"
                      name="PPN 11% Efektif"
                      stackId="tax"
                      fill="#1C1917"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                  {projection.appliesRegionalPbjt && (
                    <Bar
                      dataKey="pbjtPayable"
                      name={`PBJT Daerah (${projection.regionalPbjtRatePct}%)`}
                      stackId="tax"
                      fill="#D97706"
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Compact Breakdown Table */}
        <div className="mt-4 overflow-x-auto border border-stone-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-[11px] font-semibold text-stone-500">
                <th className="px-3 py-2">Bulan</th>
                <th className="px-3 py-2 text-right">Proyeksi Omzet</th>
                {projection.isEligiblePphFinal05 && (
                  <th className="px-3 py-2 text-right">PPh Final 0,5%</th>
                )}
                {projection.appliesPpn11 && (
                  <th className="px-3 py-2 text-right">PPN 11%</th>
                )}
                {projection.appliesRegionalPbjt && (
                  <th className="px-3 py-2 text-right">PBJT Daerah</th>
                )}
                <th className="px-3 py-2 text-right">Total Pajak Disisihkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono tabular-nums">
              {projection.points.map((pt) => (
                <tr key={pt.monthLabel}>
                  <td className="px-3 py-2 font-sans font-semibold text-stone-800">
                    {pt.monthLabel}
                  </td>
                  <td className="px-3 py-2 text-right text-stone-700">
                    {formatRupiah(String(pt.projectedTurnover))}
                  </td>
                  {projection.isEligiblePphFinal05 && (
                    <td className="px-3 py-2 text-right text-emerald-700">
                      {formatRupiah(String(pt.pphFinalPayable))}
                    </td>
                  )}
                  {projection.appliesPpn11 && (
                    <td className="px-3 py-2 text-right text-stone-800">
                      {formatRupiah(String(pt.ppnPayable))}
                    </td>
                  )}
                  {projection.appliesRegionalPbjt && (
                    <td className="px-3 py-2 text-right text-amber-700">
                      {formatRupiah(String(pt.pbjtPayable))}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-bold text-stone-900">
                    {formatRupiah(String(pt.totalTaxPayable))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
