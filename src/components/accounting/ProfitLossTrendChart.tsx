import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { buildMonthlyProfitLossSeries } from '../../lib/analytics/dashboard-analytics';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type { Account, JournalEntry } from '../../types/domain';

interface ProfitLossTrendChartProps {
  journalEntries: JournalEntry[];
  accounts: Account[];
}

function formatAxisCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}Rp${Math.round(abs / 1_000)}rb`;
  return `${sign}Rp${abs}`;
}

export function ProfitLossTrendChart({
  journalEntries,
  accounts,
}: ProfitLossTrendChartProps) {
  const data = useMemo(
    () => buildMonthlyProfitLossSeries(journalEntries, accounts),
    [journalEntries, accounts]
  );

  const latest = data[data.length - 1] ?? null;

  return (
    <section
      data-testid="recharts-pl-trend-chart"
      className="bg-white border border-stone-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-stone-900">
            Grafik Penjualan, Modal &amp; Untung Bersih Bulanan
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Bandingkan uang masuk dari penjualan dengan total modal barang serta biaya usaha tiap
            bulan.
          </p>
        </div>
        {latest && (
          <div className="text-left sm:text-right">
            <p className="text-[11px] text-stone-500">Untung Bersih {latest.monthLabel}</p>
            <p
              className={`text-base font-bold font-mono tabular-nums ${
                latest.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatRupiah(latest.netProfitDecimal)}
            </p>
          </div>
        )}
      </div>

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 border-b border-stone-200 bg-stone-50/50">
          <div className="px-5 py-3">
            <p className="text-[11px] font-medium text-stone-500">
              Uang Masuk ({latest.monthLabel})
            </p>
            <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {formatRupiah(latest.revenueDecimal)}
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[11px] font-medium text-stone-500">Modal &amp; Biaya Usaha</p>
            <p className="text-sm font-bold font-mono tabular-nums text-stone-800 mt-0.5">
              {formatRupiah(latest.expensesDecimal)}
            </p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[11px] font-medium text-stone-500">Sisa Untung Bersih</p>
            <p
              className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                latest.netProfit >= 0 ? 'text-stone-900' : 'text-rose-700'
              }`}
            >
              {formatRupiah(latest.netProfitDecimal)}
            </p>
          </div>
        </div>
      )}

      <div className="p-5">
        {data.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <TrendingUp className="w-7 h-7 text-stone-300 mx-auto" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-stone-800">
              Belum ada catatan penjualan atau pengeluaran
            </p>
            <p className="text-xs text-stone-500">
              Catat transaksi kasir atau biaya harian untuk melihat grafik untung-rugi bulanan
              secara otomatis.
            </p>
          </div>
        ) : (
          <div className="w-full h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 16, left: 10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: '#57534E', fontSize: 12 }}
                  axisLine={{ stroke: '#E7E5E4' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisCompact}
                  tick={{ fill: '#78716C', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatRupiah(String(value ?? 0)),
                    String(name ?? ''),
                  ]}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E7E5E4',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#1C1917',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar
                  dataKey="revenue"
                  name="Penjualan"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
                <Bar
                  dataKey="expenses"
                  name="Modal & Biaya"
                  fill="#A8A29E"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="Untung Bersih"
                  stroke="#1C1917"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#FFFFFF', stroke: '#1C1917', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
