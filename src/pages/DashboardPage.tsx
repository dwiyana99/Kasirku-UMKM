import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Printer,
  QrCode,
  ChefHat,
  ShieldAlert,
  ShoppingBag,
  Sprout,
  BookOpen,
  Calculator,
  Package,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  TrendingUp,
  Bell,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ThermalReceiptModal } from '../components/ThermalReceiptModal';
import { D3RevenueTrendChart } from '../components/dashboard/D3RevenueTrendChart';
import { LowStockAlertWidget } from '../components/inventory/LowStockAlertWidget';
import { StockForecastingPanel } from '../components/inventory/StockForecastingPanel';
import { DailyClosingModal } from '../components/pos/DailyClosingModal';
import { useApp } from '../context/AppContext';
import { generateThreeTierFinancialReport } from '../lib/accounting/journal-engine';
import { calculatePPhCompliance } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import { detectAntiFraudAnomalies } from '../lib/pos/advanced-pos-engine';
import { canUsePricingSimulator } from '../lib/catalog/pricing-simulator';
import {
  computeDueReminders,
  computeProductPerformanceSummary,
} from '../lib/analytics/owner-insights-engine';
import { buildDailyRevenueSeries } from '../lib/analytics/dashboard-analytics';
import { downloadDashboardTrendPdf } from '../lib/pdf/tier1-report-pdf';
import { tenantHasAddOn } from '../lib/saas/hybrid-pricing';
import { getVerticalMeta, VERTICAL_LABELS_MAP } from '../lib/verticals/vertical-registry';
import type { Order } from '../types/domain';

const VERTICAL_FRIENDLY_LABELS = VERTICAL_LABELS_MAP;

export function DashboardPage() {
  const { activeWorkspace, activeBranchId, navigate, markReceiptPrinted } = useApp();
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [pdfDownloadNotice, setPdfDownloadNotice] = useState<string | null>(null);

  const branches = activeWorkspace.branches ?? [];
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  const filteredOrders = useMemo(
    () =>
      activeBranchId === 'ALL'
        ? activeWorkspace.orders
        : activeWorkspace.orders.filter((o) => !o.branchId || o.branchId === activeBranchId),
    [activeWorkspace.orders, activeBranchId]
  );

  const filteredJournals = useMemo(
    () =>
      activeBranchId === 'ALL'
        ? activeWorkspace.journalEntries
        : activeWorkspace.journalEntries.filter(
            (j) => !j.branchId || j.branchId === activeBranchId
          ),
    [activeWorkspace.journalEntries, activeBranchId]
  );

  const filteredExpenses = useMemo(
    () =>
      activeBranchId === 'ALL'
        ? activeWorkspace.expenses
        : activeWorkspace.expenses.filter((e) => !e.branchId || e.branchId === activeBranchId),
    [activeWorkspace.expenses, activeBranchId]
  );

  const report = useMemo(
    () =>
      generateThreeTierFinancialReport(
        activeWorkspace.accounts,
        filteredJournals,
        filteredOrders,
        filteredExpenses,
        activeWorkspace.fixedAssets
      ),
    [activeWorkspace.accounts, filteredJournals, filteredOrders, filteredExpenses, activeWorkspace.fixedAssets]
  );

  const taxSummary = useMemo(
    () =>
      calculatePPhCompliance({
        vertical: activeWorkspace.tenant.vertical,
        taxEntity: activeWorkspace.tenant.taxEntity,
        priorCumulativeTurnover: activeWorkspace.tenant.cumulativeTurnoverPriorMonths,
        currentMonthTurnover: report.tier1.grossSales,
        currentMonthNetProfit: report.tier1.netProfit,
      }),
    [activeWorkspace.tenant, report.tier1.grossSales, report.tier1.netProfit]
  );

  const antiFraudAlerts = useMemo(
    () =>
      detectAntiFraudAnomalies({
        orders: filteredOrders,
        shifts: activeWorkspace.cashierShifts ?? [],
        auditLogs: activeWorkspace.auditLogs ?? [],
      }),
    [filteredOrders, activeWorkspace.cashierShifts, activeWorkspace.auditLogs]
  );

  const kostSummary = useMemo(() => {
    if (activeWorkspace.tenant.vertical !== 'KOST_KONTRAKAN') return null;
    const rooms = activeWorkspace.boardingRooms ?? [];
    const occupied = rooms.filter((r) => r.status === 'OCCUPIED').length;
    const depositTotal = (activeWorkspace.boardingTenants ?? [])
      .filter((t) => t.isActive)
      .reduce((s, t) => s.plus(new Decimal(t.depositAmount || '0')), new Decimal(0));
    const unpaid = (activeWorkspace.boardingInvoices ?? []).filter((i) => i.paymentStatus !== 'PAID').length;
    return { total: rooms.length, occupied, depositTotal: depositTotal.toFixed(4), unpaid };
  }, [activeWorkspace]);

  const agroSummary = useMemo(() => {
    if (activeWorkspace.tenant.vertical !== 'PETERNAKAN_PERTANIAN') return null;
    const batches = activeWorkspace.agroBatches ?? [];
    const activeCount = batches.filter((b) => b.status === 'ACTIVE').length;
    const wipTotal = batches
      .filter((b) => b.status === 'ACTIVE')
      .reduce((s, b) => s.plus(new Decimal(b.accumulatedCost || '0')), new Decimal(0));
    return { total: batches.length, activeCount, wipTotal: wipTotal.toFixed(4) };
  }, [activeWorkspace]);

  const lowStockCount = useMemo(() => {
    return activeWorkspace.products.filter(
      (p) =>
        p.itemType !== 'SERVICE_FREELANCE' &&
        new Decimal(p.stockQty || '0').lte(new Decimal(p.minStockAlert || '5'))
    ).length;
  }, [activeWorkspace.products]);

  const activeKitchenOrders = useMemo(
    () =>
      filteredOrders.filter(
        (o) => o.paymentStatus === 'PAID' && o.kitchenStatus !== 'SERVED'
      ),
    [filteredOrders]
  );

  const firstTable = activeWorkspace.tables[0];
  const branchSubtitle =
    branches.length > 1
      ? activeBranch
        ? `Cabang: ${activeBranch.name}`
        : `Gabungan ${branches.length} Cabang`
      : null;

  const friendlyVertical =
    VERTICAL_FRIENDLY_LABELS[activeWorkspace.tenant.vertical] ??
    activeWorkspace.tenant.vertical.replace(/_/g, ' ');
  const friendlyTaxEntity =
    activeWorkspace.tenant.taxEntity === 'WP_OP' ? 'Usaha Perorangan' : 'Badan Usaha (PT/CV)';
  const canSimulatePricing = canUsePricingSimulator(
    activeWorkspace.tenant.subscriptionPlan,
    activeWorkspace.tenant.activeAddOns
  );
  const hasThermalReceipt = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_THERMAL_RECEIPT');
  const activeVerticalMeta = getVerticalMeta(activeWorkspace.tenant.vertical);
  const supportsProductPerf =
    activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO' ||
    activeWorkspace.tenant.vertical === 'TOKO_RETAIL' ||
    activeWorkspace.tenant.vertical === 'TOKO_FASHION' ||
    activeWorkspace.tenant.vertical === 'TOKO_BANGUNAN' ||
    activeWorkspace.tenant.vertical === 'KEDAI_MAKAN' ||
    activeWorkspace.tenant.vertical === 'RESTORAN' ||
    activeWorkspace.tenant.vertical === 'BAKERY_CATERING' ||
    activeWorkspace.tenant.vertical === 'BARBERSHOP' ||
    activeWorkspace.tenant.vertical === 'SALON_KECANTIKAN' ||
    activeWorkspace.tenant.vertical === 'SPA_WELLNESS' ||
    activeWorkspace.tenant.vertical === 'BARBERSHOP_SALON' ||
    activeWorkspace.tenant.vertical === 'PET_SHOP' ||
    activeWorkspace.tenant.vertical === 'MANUFAKTUR_KECIL';

  const productPerf = useMemo(
    () =>
      supportsProductPerf
        ? computeProductPerformanceSummary(activeWorkspace.products, filteredOrders)
        : null,
    [supportsProductPerf, activeWorkspace.products, filteredOrders]
  );

  const dueReminders = useMemo(
    () => computeDueReminders(activeWorkspace),
    [activeWorkspace]
  );

  const handlePrintManagementReport = () => {
    const series = buildDailyRevenueSeries(filteredOrders);
    const fileName = downloadDashboardTrendPdf({
      tenantName: activeWorkspace.tenant.name,
      monthLabel: series.monthLabel,
      points: series.points,
      totalRevenue: series.totalRevenue,
      totalOrders: series.totalOrders,
    });
    setPdfDownloadNotice(`Laporan penjualan PDF berhasil diunduh (${fileName}).`);
    window.setTimeout(() => setPdfDownloadNotice(null), 4500);
  };

  const primaryCta =
    activeWorkspace.tenant.vertical === 'KOST_KONTRAKAN' ? (
      <button
        type="button"
        onClick={() => navigate('/kost')}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
      >
        <BedDouble className="w-4 h-4" strokeWidth={1.75} />
        <span>Kamar &amp; Tagihan Kost</span>
      </button>
    ) : activeWorkspace.tenant.vertical === 'PETERNAKAN_PERTANIAN' ? (
      <button
        type="button"
        onClick={() => navigate('/agro')}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
      >
        <Sprout className="w-4 h-4" strokeWidth={1.75} />
        <span>Siklus Ternak &amp; Panen</span>
      </button>
    ) : activeVerticalMeta.dedicatedRoute === '/operations' ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/operations')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
          <span>{activeVerticalMeta.dedicatedMenuLabel || 'Operasional Usaha'}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/pos')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg transition-colors whitespace-nowrap"
        >
          <ShoppingBag className="w-4 h-4" strokeWidth={1.75} />
          <span>Kasir</span>
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="dashboard-daily-closing-btn"
          onClick={() => setClosingModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <ClipboardCheck className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          <span>Tutup Kasir</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/pos')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
        >
          <ShoppingBag className="w-4 h-4" strokeWidth={1.75} />
          <span>Buka Kasir</span>
        </button>
      </div>
    );

  return (
    <AppShell
      title="Ringkasan Usaha"
      subtitle={`${friendlyVertical} · ${friendlyTaxEntity} · ${activeWorkspace.tenant.isPkp ? 'PKP' : 'Non-PKP'}${branchSubtitle ? ` · ${branchSubtitle}` : ''}`}
      primaryAction={primaryCta}
    >
      <div className="space-y-6">
        {pdfDownloadNotice && (
          <div
            role="status"
            data-testid="dashboard-pdf-status"
            className="flex items-center justify-between gap-2 px-4 py-3 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl"
          >
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
              <span>{pdfDownloadNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setPdfDownloadNotice(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Peringatan Pemeriksaan Kasir (0-Token, tampil hanya jika ada selisih/anomali) */}
        {antiFraudAlerts.length > 0 && (
          <section
            data-testid="anti-fraud-alert-widget"
            aria-label="Peringatan Pemeriksaan Kasir"
            className="bg-rose-50 border border-rose-200 rounded-xl p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900">
                <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0" strokeWidth={1.75} />
                <div>
                  <h2 className="text-sm font-bold">
                    Perlu Diperiksa di Kasir
                  </h2>
                  <p className="text-xs text-rose-700">
                    Ada {antiFraudAlerts.length} catatan selisih kas atau pembatalan yang sebaiknya Anda cek.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/pos')}
                className="text-xs font-semibold text-rose-800 hover:text-rose-950 underline whitespace-nowrap"
              >
                Cek Shift Kasir
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {antiFraudAlerts.map((al, idx) => (
                <div
                  key={`${al.code}-${idx}`}
                  className="bg-white border border-rose-200 rounded-lg p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" strokeWidth={1.75} />
                      <span>{al.title}</span>
                    </p>
                    <p className="text-xs text-stone-600 leading-relaxed">{al.detail}</p>
                  </div>
                  <span className="text-xs font-mono font-bold tabular-nums text-rose-700 shrink-0">
                    {al.metricValue}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Vertical-Adaptive Highlight Strip for Kost & Agro */}
        {kostSummary && (
          <section className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-stone-500">Kamar Terisi</p>
                <p className="text-lg font-bold font-mono tabular-nums text-stone-900">
                  {kostSummary.occupied} / {kostSummary.total} Kamar
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Uang Jaminan / Deposit Penghuni</p>
                <p className="text-lg font-bold font-mono tabular-nums text-stone-900">
                  {formatRupiah(kostSummary.depositTotal)}
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Tagihan Belum Dibayar</p>
                <p className="text-lg font-bold font-mono tabular-nums text-amber-700">
                  {kostSummary.unpaid} Tagihan
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/kost')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg"
            >
              <span>Kelola Kamar &amp; Tagihan</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </section>
        )}

        {agroSummary && (
          <section className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-stone-500">Siklus Ternak / Lahan Aktif</p>
                <p className="text-lg font-bold font-mono tabular-nums text-stone-900">
                  {agroSummary.activeCount} Aktif ({agroSummary.total} Total)
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Modal Siklus Berjalan</p>
                <p className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                  {formatRupiah(agroSummary.wipTotal)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/agro')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg"
            >
              <span>Catat Pakan / Pupuk &amp; Panen</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </section>
        )}

        {/* Printable Management Executive Report Container */}
        <div id="management-report-printable" className="space-y-6">
          {/* Print-only Management Report Header */}
          <div className="hidden print:block border-b border-stone-300 pb-3 mb-4">
            <h1 className="text-lg font-bold text-stone-900">
              Laporan Ringkasan Usaha · {activeWorkspace.tenant.name}
            </h1>
            <p className="text-xs text-stone-600">
              Dicetak pada {new Date().toLocaleString('id-ID')} · {friendlyVertical} ·{' '}
              {branchSubtitle || 'Outlet Utama'}
            </p>
          </div>

          {/* Unified Hairline-Divided 4-Column KPI Strip (Warm Stone) */}
          <section
            aria-label="Ringkasan Keuangan"
            className="bg-white border border-stone-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200"
          >
            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">Total Penjualan</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatRupiah(report.tier1.grossSales)}
              </p>
              <p className="text-xs text-stone-500 mt-2">
                {filteredOrders.filter((o) => o.paymentStatus === 'PAID').length} transaksi lunas
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">Untung Bersih</p>
              <p
                className={`text-2xl font-bold font-mono tabular-nums mt-1.5 ${
                  new Decimal(report.tier1.netProfit).lt(0) ? 'text-rose-600' : 'text-emerald-700'
                }`}
              >
                {formatRupiah(report.tier1.netProfit)}
              </p>
              <p className="text-xs text-stone-500 mt-2">
                Margin kotor {report.tier3.ratios.grossProfitMarginPct}% · Modal barang{' '}
                {formatRupiah(report.tier1.totalHpp)}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">Saldo Uang &amp; Rekening</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatRupiah(report.tier3.endingCashBalance)}
              </p>
              <p className="text-xs text-stone-500 mt-2">
                {report.tier2.isEquationBalanced ? 'Catatan keuangan seimbang' : 'Perlu cek catatan'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">Perkiraan Pajak Bulan Ini</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatRupiah(taxSummary.estimatedTaxPayable)}
              </p>
              <p className="text-xs text-stone-500 mt-2 truncate">{taxSummary.regimeTitle}</p>
            </div>
          </section>

          {/* 0-Token Catatan Cepat Pemilik (Ringkas, Adaptif per Jenis UMKM) */}
          <section
            data-testid="owner-quick-insights"
            aria-label="Catatan Cepat Pemilik"
            className="bg-stone-50 border border-stone-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-stone-700">
              {activeWorkspace.tenant.vertical !== 'KOST_KONTRAKAN' &&
                activeWorkspace.tenant.vertical !== 'PETERNAKAN_PERTANIAN' &&
                activeWorkspace.tenant.vertical !== 'FREELANCE' && (
                  <span className="inline-flex items-center gap-1.5">
                    {lowStockCount > 0 ? (
                      <>
                        <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
                        <span>
                          <strong className="text-stone-900">{lowStockCount} barang</strong> stoknya
                          mulai menipis dan siap dibelanjakan.
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                        <span>Semua stok barang saat ini masih aman.</span>
                      </>
                    )}
                  </span>
                )}

              {kostSummary && (
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                  <span>
                    {kostSummary.unpaid > 0
                      ? `Ada ${kostSummary.unpaid} tagihan sewa kamar yang belum dibayar.`
                      : 'Semua tagihan sewa kamar bulan ini sudah lunas.'}
                  </span>
                </span>
              )}

              {agroSummary && (
                <span className="inline-flex items-center gap-1.5">
                  <Sprout className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                  <span>
                    Ada {agroSummary.activeCount} siklus berjalan. Catat pakan atau pupuk setiap
                    kali keluar agar modal panen akurat.
                  </span>
                </span>
              )}

              {activeWorkspace.tenant.vertical === 'FREELANCE' && (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={1.75} />
                  <span>
                    Catat setiap pembayaran klien agar potongan pajak dan laporan penghasilan rapi.
                  </span>
                </span>
              )}
              {dueReminders.map((rem) => (
                <button
                  key={rem.id}
                  type="button"
                  onClick={() => navigate(rem.route)}
                  className="inline-flex items-center gap-1.5 text-left text-amber-800 hover:text-amber-950 font-medium"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
                  <span>{rem.title}</span>
                  <span className="underline">{rem.ctaLabel}</span>
                </button>
              ))}
            </div>

            {canSimulatePricing &&
              activeWorkspace.tenant.vertical !== 'KOST_KONTRAKAN' && (
                <button
                  type="button"
                  data-testid="dashboard-pricing-sim-link"
                  onClick={() => navigate('/catalog/products')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Calculator className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Simulasi Harga Jual</span>
                </button>
              )}
          </section>

          {/* Ringkasan Produk Terlaris, Paling Untung & Stok Mengendap (0-Token, Adaptif Produk/F&B/Salon) */}
          {productPerf &&
            (productPerf.topSelling.length > 0 ||
              productPerf.topProfitable.length > 0 ||
              productPerf.slowMoving.length > 0) && (
              <section
                data-testid="product-performance-widget"
                aria-label="Produk Terlaris, Paling Untung & Stok Mengendap"
                className="bg-white border border-stone-200 rounded-xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-stone-200"
              >
                <div className="p-5 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                    <h3 className="text-xs font-semibold text-stone-900">Paling Laris Terjual</h3>
                  </div>
                  {productPerf.topSelling.length === 0 ? (
                    <p className="text-xs text-stone-500">Belum ada penjualan tercatat.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {productPerf.topSelling.map((item) => (
                        <li key={item.productId} className="flex items-center justify-between gap-2">
                          <span className="text-stone-700 truncate">{item.name}</span>
                          <span className="font-mono font-semibold tabular-nums text-stone-900 shrink-0">
                            {Number(item.qtySold)} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-5 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                    <h3 className="text-xs font-semibold text-stone-900">Penyumbang Untung Terbesar</h3>
                  </div>
                  {productPerf.topProfitable.length === 0 ? (
                    <p className="text-xs text-stone-500">Belum ada margin penjualan tercatat.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {productPerf.topProfitable.map((item) => (
                        <li key={item.productId} className="flex items-center justify-between gap-2">
                          <span className="text-stone-700 truncate">{item.name}</span>
                          <span className="font-mono font-semibold tabular-nums text-emerald-700 shrink-0">
                            +{formatRupiah(item.grossProfit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-5 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
                    <h3 className="text-xs font-semibold text-stone-900">Stok Mengendap (Belum Laku)</h3>
                  </div>
                  {productPerf.slowMoving.length === 0 ? (
                    <p className="text-xs text-stone-500">
                      Bagus, semua barang yang ada stoknya bergerak terjual.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {productPerf.slowMoving.slice(0, 3).map((item) => (
                        <li key={item.productId} className="flex items-center justify-between gap-2">
                          <span className="text-stone-700 truncate">{item.name}</span>
                          <span className="font-mono tabular-nums text-amber-700 shrink-0">
                            {Number(item.stockQty)} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

          {/* Daily Revenue Trend Chart + Print Report Button */}
          <D3RevenueTrendChart
            orders={filteredOrders}
            tenantName={activeWorkspace.tenant.name}
            onPrintReport={handlePrintManagementReport}
          />
        </div>

        {/* Tax Compliance Progress + Quick Operational Actions */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Status Pajak Usaha · {taxSummary.regimeTitle}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">{taxSummary.regulationRef}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/tax')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>Detail Pajak</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>

            {activeWorkspace.tenant.taxEntity === 'WP_OP' &&
              activeWorkspace.tenant.vertical !== 'FREELANCE' && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-600">
                      Total Omzet Tahun Ini dibanding Batas Bebas Pajak Rp500 Juta
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-stone-900">
                      {formatRupiah(taxSummary.cumulativeYtdTurnover)} / Rp500.000.000
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        taxSummary.exemptProgressPct >= 95 ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, taxSummary.exemptProgressPct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-500">
                    Sisa batas omzet bebas pajak: {formatRupiah(taxSummary.exemptRemainingRp500M)} (
                    {taxSummary.exemptProgressPct}% terpakai)
                  </p>
                </div>
              )}

            <ul className="space-y-1.5 pt-1 text-xs text-stone-600">
              {taxSummary.complianceNotes.map((note) => (
                <li key={note} className="leading-relaxed">
                  · {note}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-stone-900">Aksi Cepat</h2>
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/pos')}
                className="flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                  <div>
                    <p className="text-sm font-medium text-stone-900">Buka Kasir</p>
                    <p className="text-xs text-stone-500">
                      {activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO'
                        ? 'Catat jualan harian dan cetak struk bila perlu'
                        : 'Catat transaksi pelanggan dan potong stok otomatis'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
              </button>

              {firstTable && (
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/order/${activeWorkspace.tenant.slug}/${firstTable.qrToken}`)
                  }
                  className="flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <QrCode className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        Coba Pesan dari Meja (Meja {firstTable.tableNumber})
                      </p>
                      <p className="text-xs text-stone-500">
                        Pelanggan pesan lewat QR meja dan bayar langsung
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                </button>
              )}

              {(activeWorkspace.tenant.vertical === 'RESTORAN' ||
                activeWorkspace.tenant.vertical === 'KEDAI_MAKAN') && (
                <button
                  type="button"
                  onClick={() => navigate('/kitchen')}
                  className="flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChefHat className="w-4 h-4 text-amber-600" strokeWidth={1.75} />
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        Layar Dapur ({activeKitchenOrders.length} pesanan aktif)
                      </p>
                      <p className="text-xs text-stone-500">Pantau antrean masak per meja</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate('/accounting')}
                className="flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-stone-700" strokeWidth={1.75} />
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      Laporan Keuangan &amp; Laba Rugi
                    </p>
                    <p className="text-xs text-stone-500">
                      Lihat untung rugi, arus uang, dan catatan biaya usaha
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-400" strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </section>

        {/* Proactive Low-Stock Monitoring & Quick Restock Widget */}
        <LowStockAlertWidget />

        {/* Zero-AI-Token Shopping Note (LITE/BASIC) or PO Generator (PRO/EXPERT) */}
        {(activeWorkspace.tenant.vertical === 'WARUNG_SEMBAKO' ||
          activeWorkspace.tenant.vertical === 'TOKO_RETAIL') && (
          <StockForecastingPanel compact />
        )}

        {/* Recent Orders Table */}
        <section className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-stone-900">Transaksi Terbaru</h2>
              <p className="text-xs text-stone-500">
                Setiap transaksi lunas otomatis masuk ke laporan keuangan dan mengurangi stok barang
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Riwayat Lengkap</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>

          {activeWorkspace.orders.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-stone-600">
                Belum ada transaksi tercatat pada periode ini.
              </p>
              <button
                type="button"
                onClick={() => navigate('/pos')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Catat Transaksi Pertama
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
                    <th className="py-3 px-6">No. Nota</th>
                    <th className="py-3 px-4">Pelanggan</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Modal Barang</th>
                    <th className="py-3 px-6 text-right">Struk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {activeWorkspace.orders.slice(0, 8).map((order) => (
                    <tr key={order.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-6 font-mono text-xs text-stone-900 whitespace-nowrap">
                        {order.orderNumber}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-stone-900">{order.customerName}</p>
                        <p className="text-xs text-stone-500">
                          {order.orderSource === 'QR_SELF_ORDER'
                            ? `Pesan QR · Meja ${order.tableNumber || '-'}`
                            : order.orderSource === 'FREELANCE_INVOICE'
                            ? 'Tagihan Jasa'
                            : 'Kasir'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            order.paymentStatus === 'PAID'
                              ? 'text-emerald-700 font-medium'
                              : 'text-amber-700 font-medium'
                          }
                        >
                          {order.paymentStatus === 'PAID' ? 'Lunas' : 'Menunggu Bayar'}
                        </span>
                        <span className="text-stone-400 mx-1.5">·</span>
                        <span className="text-stone-600">{order.kitchenStatus}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium tabular-nums text-stone-900 whitespace-nowrap">
                        {formatRupiah(order.grandTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-stone-500 whitespace-nowrap">
                        {formatRupiah(order.totalCogs)}
                      </td>
                      <td className="py-3 px-6 text-right">
                        {hasThermalReceipt ? (
                          <button
                            type="button"
                            onClick={() => setReceiptOrder(order)}
                            aria-label={`Lihat Struk ${order.orderNumber}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-700 border border-stone-200 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
                            <span>Struk</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => navigate('/transactions')}
                            className="text-xs font-medium text-emerald-700 hover:underline whitespace-nowrap"
                          >
                            Detail
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {receiptOrder && (
        <ThermalReceiptModal
          order={receiptOrder}
          tenant={activeWorkspace.tenant}
          onClose={() => setReceiptOrder(null)}
          onPrinted={() => markReceiptPrinted(activeWorkspace.tenant.id, receiptOrder.id)}
        />
      )}

      <DailyClosingModal
        open={closingModalOpen}
        onClose={() => setClosingModalOpen(false)}
      />
    </AppShell>
  );
}
