import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart3, FileDown } from 'lucide-react';
import { buildDailyRevenueSeries, type DailyRevenuePoint } from '../../lib/analytics/dashboard-analytics';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type { Order } from '../../types/domain';

interface D3RevenueTrendChartProps {
  orders: Order[];
  tenantName: string;
  onPrintReport?: () => void;
}

export function D3RevenueTrendChart({
  orders,
  tenantName,
  onPrintReport,
}: D3RevenueTrendChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartWidth, setChartWidth] = useState(760);
  const [hoveredPoint, setHoveredPoint] = useState<DailyRevenuePoint | null>(null);

  const series = useMemo(() => buildDailyRevenueSeries(orders), [orders]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.getBoundingClientRect().width));
      setChartWidth(next);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || series.points.length === 0) return;

    const width = chartWidth;
    const height = 248;
    const margin = { top: 18, right: 16, bottom: 30, left: 64 };
    const innerWidth = Math.max(120, width - margin.left - margin.right);
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxRevenue = d3.max(series.points, (d) => d.revenue) ?? 0;
    const yMax = maxRevenue > 0 ? maxRevenue * 1.18 : 100000;

    const xScale = d3
      .scaleBand<number>()
      .domain(series.points.map((d) => d.day))
      .range([0, innerWidth])
      .padding(0.28);

    const yScale = d3.scaleLinear().domain([0, yMax]).nice(4).range([innerHeight, 0]);

    // Horizontal hairline gridlines
    const yTicks = yScale.ticks(4);
    g.append('g')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#E7E5E4')
      .attr('stroke-dasharray', '2,2');

    // Y axis labels
    const formatCompactRp = (v: number) => {
      if (v >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(1)}jt`;
      if (v >= 1_000) return `Rp${Math.round(v / 1_000)}rb`;
      return `Rp${v}`;
    };

    g.append('g')
      .call(
        d3
          .axisLeft(yScale)
          .ticks(4)
          .tickSize(0)
          .tickFormat((d) => formatCompactRp(Number(d)))
      )
      .call((axis) => axis.select('.domain').remove())
      .selectAll('text')
      .attr('fill', '#78716C')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('dx', '-6');

    // X axis labels (every 3 days on small screens, every 2 days on wide screens)
    const tickStep = width < 520 ? 5 : 3;
    const xTickDays = series.points
      .filter((d) => d.day === 1 || d.day % tickStep === 0 || d.day === series.points.length)
      .map((d) => d.day);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .tickValues(xTickDays)
          .tickSize(0)
          .tickFormat((d) => String(d))
      )
      .call((axis) => axis.select('.domain').attr('stroke', '#E7E5E4'))
      .selectAll('text')
      .attr('fill', '#78716C')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('dy', '12');

    // Subtle area fill beneath trend line
    const areaGen = d3
      .area<DailyRevenuePoint>()
      .x((d) => (xScale(d.day) ?? 0) + xScale.bandwidth() / 2)
      .y0(innerHeight)
      .y1((d) => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(series.points)
      .attr('fill', '#ECFDF5')
      .attr('opacity', 0.75)
      .attr('d', areaGen);

    // Daily bars
    g.selectAll('rect.rev-bar')
      .data(series.points)
      .join('rect')
      .attr('class', 'rev-bar')
      .attr('x', (d) => xScale(d.day) ?? 0)
      .attr('y', (d) => yScale(d.revenue))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => Math.max(0, innerHeight - yScale(d.revenue)))
      .attr('rx', 3)
      .attr('fill', (d) => (d.revenue > 0 ? '#059669' : '#E7E5E4'))
      .attr('opacity', (d) => (d.revenue > 0 ? 0.85 : 0.45))
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredPoint(d))
      .on('mouseleave', () => setHoveredPoint(null));

    // Trend line over bars
    const lineGen = d3
      .line<DailyRevenuePoint>()
      .x((d) => (xScale(d.day) ?? 0) + xScale.bandwidth() / 2)
      .y((d) => yScale(d.revenue))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(series.points)
      .attr('fill', 'none')
      .attr('stroke', '#047857')
      .attr('stroke-width', 2)
      .attr('d', lineGen);

    // Data point dots on active revenue days
    g.selectAll('circle.rev-dot')
      .data(series.points.filter((d) => d.revenue > 0))
      .join('circle')
      .attr('class', 'rev-dot')
      .attr('cx', (d) => (xScale(d.day) ?? 0) + xScale.bandwidth() / 2)
      .attr('cy', (d) => yScale(d.revenue))
      .attr('r', 3.5)
      .attr('fill', '#FFFFFF')
      .attr('stroke', '#059669')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => setHoveredPoint(d))
      .on('mouseleave', () => setHoveredPoint(null));
  }, [series, chartWidth]);

  const activePoint = hoveredPoint ?? series.peakDay;

  return (
    <section
      data-testid="d3-revenue-trend-chart"
      className="bg-white border border-stone-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Grafik Penjualan Harian · {series.monthLabel}
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {series.peakDay
              ? `Penjualan tertinggi bulan ini pada ${series.peakDay.label} (${formatRupiah(series.peakDay.revenueDecimal)}), rata-rata ${formatRupiah(series.averageDailyRevenue)} per hari aktif. Arahkan kursor ke batang grafik untuk melihat detail tanggal.`
              : `Pantau naik-turun penjualan harian ${tenantName} sepanjang bulan ${series.monthLabel}.`}
          </p>
        </div>

        <div className="flex items-center gap-2 no-print shrink-0">
          {onPrintReport && (
            <button
              type="button"
              onClick={onPrintReport}
              data-testid="print-management-report-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-stone-800 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-700" strokeWidth={1.75} />
              <span>Unduh PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Hairline Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200 border-b border-stone-200 bg-stone-50/50">
        <div className="px-5 py-3">
          <p className="text-[11px] font-medium text-stone-500">
            Total Penjualan {series.monthLabel}
          </p>
          <p className="text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5">
            {formatRupiah(series.totalRevenue)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] font-medium text-stone-500">
            Rata-Rata per Hari Buka ({series.activeDaysCount} hari)
          </p>
          <p className="text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5">
            {formatRupiah(series.averageDailyRevenue)}
          </p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[11px] font-medium text-stone-500">
            {hoveredPoint ? `Penjualan Tanggal ${hoveredPoint.label}` : 'Hari Paling Ramai'}
          </p>
          {activePoint ? (
            <p className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {formatRupiah(activePoint.revenueDecimal)}{' '}
              <span className="text-[11px] font-sans font-medium text-stone-500">
                ({activePoint.label} · {activePoint.orderCount} nota)
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-stone-400 mt-0.5">Belum ada penjualan</p>
          )}
        </div>
      </div>

      <div ref={containerRef} className="p-4 sm:p-5">
        {series.totalOrders === 0 ? (
          <div className="py-10 text-center space-y-2">
            <BarChart3 className="w-7 h-7 text-stone-300 mx-auto" strokeWidth={1.75} />
            <p className="text-sm font-semibold text-stone-800">
              Belum ada penjualan tercatat pada bulan {series.monthLabel}
            </p>
            <p className="text-xs text-stone-500">
              Grafik penjualan harian akan muncul otomatis setelah kasir mencatat transaksi pertama.
            </p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            role="img"
            aria-label={`Grafik penjualan harian bulan ${series.monthLabel}`}
            className="w-full h-[248px] block overflow-visible"
          />
        )}
      </div>
    </section>
  );
}
