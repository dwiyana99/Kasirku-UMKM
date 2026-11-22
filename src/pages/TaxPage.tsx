import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Download, CheckCircle2, AlertTriangle, Calculator, Eye, FileText, Landmark } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ModuleGate } from '../components/ModuleGate';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { ReceiptPreviewModal } from '../components/ui/ModalShell';
import { useApp } from '../context/AppContext';
import { generateThreeTierFinancialReport } from '../lib/accounting/journal-engine';
import {
  calculateOrderTax,
  calculatePPhCompliance,
  validateCoretaxIds,
} from '../lib/tax/indonesia-tax-engine';
import { resolveEffectiveRegionalTax } from '../lib/tax/regional-tax-indonesia';
import { computeMonthlyTaxSimulation } from '../lib/analytics/dashboard-analytics';
import { formatRupiah } from '../lib/pos/checkout-service';
import type { InventoryMovement } from '../types/domain';

export function TaxPage() {
  const { activeWorkspace, updateTenantProfile, regionalTaxRegistry, navigate } = useApp();
  const { tenant } = activeWorkspace;
  const regionalTaxResolved = useMemo(
    () =>
      resolveEffectiveRegionalTax({
        vertical: tenant.vertical,
        regionalSettings: tenant.settings.regionalTax,
        registry: regionalTaxRegistry,
      }),
    [regionalTaxRegistry, tenant.settings.regionalTax, tenant.vertical]
  );

  const [simPrice, setSimPrice] = useState('1200000');
  const [simLuxury, setSimLuxury] = useState(false);
  const [simExempt, setSimExempt] = useState(false);
  const [simMonthlySalesOverride, setSimMonthlySalesOverride] = useState('');
  const [simAsPkp, setSimAsPkp] = useState<boolean>(tenant.isPkp);
  const [npwpDraft, setNpwpDraft] = useState(tenant.npwp16);
  const [nitkuDraft, setNitkuDraft] = useState(tenant.nitku22);
  const [savedNotice, setSavedNotice] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<{
    imageUrl: string;
    title: string;
    amountLabel?: string;
    receiptNumber?: string;
    supplierName?: string;
  } | null>(null);

  const productMap = useMemo(
    () => new Map(activeWorkspace.products.map((p) => [p.id, p])),
    [activeWorkspace.products]
  );

  const purchaseProofRows = useMemo(
    () => activeWorkspace.inventoryMovements.filter((m) => m.movementType === 'IN_PURCHASE'),
    [activeWorkspace.inventoryMovements]
  );

  const purchaseProofColumns: DataTableColumn<InventoryMovement>[] = [
    {
      key: 'date',
      header: 'Tanggal Pembelian',
      render: (mov) => {
        const dt = new Date(mov.createdAt);
        return (
          <span className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
            {Number.isNaN(dt.getTime())
              ? mov.createdAt
              : dt.toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
          </span>
        );
      },
    },
    {
      key: 'item',
      header: 'Barang & Supplier',
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        return (
          <div>
            <p className="font-semibold text-slate-900">{prod?.name ?? mov.productId}</p>
            <p className="text-[11px] text-slate-500">
              {mov.supplierName || 'Supplier Umum'}
              {mov.receiptNumber ? ` · No. Nota ${mov.receiptNumber}` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Nilai Pembelian',
      align: 'right',
      render: (mov) => {
        const total = new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0'));
        return (
          <span className="font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
            {formatRupiah(total)}
          </span>
        );
      },
    },
    {
      key: 'proof',
      header: 'Bukti Nota (Arsip Pajak)',
      align: 'right',
      render: (mov) => {
        const prod = productMap.get(mov.productId);
        if (mov.receiptImageUrl) {
          return (
            <button
              type="button"
              onClick={() =>
                setPreviewReceipt({
                  imageUrl: mov.receiptImageUrl!,
                  title: prod?.name ?? mov.productId,
                  amountLabel: `Nilai ${formatRupiah(
                    new Decimal(mov.qtyChange || '0').times(new Decimal(mov.unitCost || '0'))
                  )}`,
                  receiptNumber: mov.receiptNumber,
                  supplierName: mov.supplierName,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Lihat Nota</span>
            </button>
          );
        }
        return <span className="text-[11px] text-amber-700">Belum ada nota</span>;
      },
    },
  ];

  const report = useMemo(
    () =>
      generateThreeTierFinancialReport(
        activeWorkspace.accounts,
        activeWorkspace.journalEntries,
        activeWorkspace.orders,
        activeWorkspace.expenses,
        activeWorkspace.fixedAssets
      ),
    [activeWorkspace]
  );

  const pph = useMemo(
    () =>
      calculatePPhCompliance({
        vertical: tenant.vertical,
        taxEntity: tenant.taxEntity,
        priorCumulativeTurnover: tenant.cumulativeTurnoverPriorMonths,
        currentMonthTurnover: report.tier1.grossSales,
        currentMonthNetProfit: report.tier1.netProfit,
      }),
    [tenant, report.tier1.grossSales, report.tier1.netProfit]
  );

  const simPpn = useMemo(
    () =>
      calculateOrderTax({
        vertical: 'WARUNG_SEMBAKO',
        isPkp: true,
        items: [
          {
            lineSubtotal: /^\d+(\.\d+)?$/.test(simPrice) ? simPrice : '0',
            isLuxuryGoods: simLuxury,
            isTaxExempt: simExempt,
          },
        ],
        discountAmount: '0',
        serviceCharge: '0',
      }),
    [simPrice, simLuxury, simExempt]
  );

  const monthlyTaxSim = useMemo(
    () =>
      computeMonthlyTaxSimulation({
        vertical: tenant.vertical,
        taxEntity: tenant.taxEntity,
        isPkp: simAsPkp,
        priorCumulativeTurnover: tenant.cumulativeTurnoverPriorMonths,
        actualMonthlyGrossSales: report.tier1.grossSales,
        actualMonthlyNetProfit: report.tier1.netProfit,
        projectedMonthlySalesOverride: simMonthlySalesOverride,
      }),
    [tenant, simAsPkp, report.tier1.grossSales, report.tier1.netProfit, simMonthlySalesOverride]
  );

  const coretaxValidation = useMemo(
    () => validateCoretaxIds(npwpDraft, nitkuDraft),
    [npwpDraft, nitkuDraft]
  );

  // Extract tax liability ledger balances (2102 PPN, 2103 PB1, 2105 PPh Withholding)
  const getLedgerBalance = (code: string) => {
    const row = report.trialBalance.find((r) => r.code === code);
    return row ? row.endingBalance : '0.0000';
  };

  const handleExportCoretaxCsv = () => {
    const rows = [
      ['NPWP_16', 'NITKU_22', 'NAMA_USAHA', 'ENTITAS_PAJAK', 'REJIM_PAJAK', 'OMZET_KUMULATIF_YTD', 'OMZET_BULAN_INI', 'ESTIMASI_PPH'],
      [
        tenant.npwp16,
        tenant.nitku22,
        `"${tenant.name}"`,
        tenant.taxEntity,
        pph.regime,
        new Decimal(pph.cumulativeYtdTurnover).toFixed(0),
        new Decimal(report.tier1.grossSales).toFixed(0),
        new Decimal(pph.estimatedTaxPayable).toFixed(0),
      ],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coretax-umkm-${tenant.slug}-2026-11.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title="Pajak DJP & Kesiapan Coretax"
      subtitle="Kepatuhan PP No. 20 Tahun 2026, PMK 131/2024 (PPN 12% × 11/12), PB1 10%, dan pelaporan NIK/NITKU"
      primaryAction={
        <button
          type="button"
          onClick={handleExportCoretaxCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor Lampiran Coretax CSV</span>
        </button>
      }
    >
      <ModuleGate requiredModule="TAX_CORETAX" featureTitle="Kepatuhan Pajak DJP & Coretax">
      <div className="space-y-6">
        {/* Regional Tax (PBJT / UU HKPD) Card */}
        <section
          data-testid="regional-tax-summary-card"
          className="rounded-xl border border-stone-200 bg-white p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Landmark className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  Pajak Daerah Setempat (PBJT / UU HKPD) · {regionalTaxResolved.cityName}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
                  {regionalTaxResolved.explanation}
                </p>
                {regionalTaxResolved.regulationRef && (
                  <p className="mt-1 text-[11px] text-stone-500">
                    Dasar aturan: {regionalTaxResolved.regulationRef}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-right">
                <div className="text-[11px] text-stone-500">Tarif PBJT Aktif</div>
                <div className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                  {regionalTaxResolved.applies
                    ? `${(Number(regionalTaxResolved.rate) * 100).toFixed(1).replace(/\.0$/, '')}%`
                    : '0% (Bebas / Diabaikan)'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Ubah Domisili
              </button>
            </div>
          </div>
        </section>

        {/* Real-Time Monthly Tax Simulation Summary Widget */}
        <section
          data-testid="tax-simulation-summary-widget"
          className="bg-white border border-stone-200 rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                Simulasi Pajak Bulanan Real-Time · Basis Data Penjualan Aktif
              </p>
              <h2 className="text-base font-bold text-stone-900">
                Estimasi PPN (12% × DPP 11/12), PB1 &amp; PPh Bulanan
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="sim-monthly-sales"
                  className="text-xs font-medium text-stone-600 whitespace-nowrap"
                >
                  Proyeksi Omzet (Rp):
                </label>
                <input
                  id="sim-monthly-sales"
                  data-testid="tax-sim-projected-sales-input"
                  type="text"
                  inputMode="numeric"
                  value={simMonthlySalesOverride}
                  onChange={(e) => setSimMonthlySalesOverride(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={`Live: ${new Decimal(report.tier1.grossSales).toFixed(0)}`}
                  className="w-40 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
                />
                {simMonthlySalesOverride && (
                  <button
                    type="button"
                    onClick={() => setSimMonthlySalesOverride('')}
                    className="text-[11px] font-semibold text-stone-500 hover:text-stone-900 underline"
                  >
                    Pakai Data Live
                  </button>
                )}
              </div>
              {!monthlyTaxSim.isFnbRegionalPb1 && (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="tax-sim-pkp-toggle"
                    checked={simAsPkp}
                    onChange={(e) => setSimAsPkp(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>Simulasi PKP (PPN 11%)</span>
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">
                {monthlyTaxSim.isUsingProjection
                  ? 'Basis Omzet Proyeksi Bulanan'
                  : 'Omzet Penjualan Live Bulan Ini'}
              </p>
              <p className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1.5">
                {formatRupiah(monthlyTaxSim.basisSales)}
              </p>
              <p className="text-[11px] text-stone-500 mt-1">
                {monthlyTaxSim.isUsingProjection
                  ? 'Mode simulasi proyeksi manual'
                  : 'Dihitung otomatis dari transaksi lunas POS'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">
                {monthlyTaxSim.isFnbRegionalPb1
                  ? 'Estimasi Pajak Daerah PB1 (10%)'
                  : 'Estimasi PPN (12% × DPP 11/12)'}
              </p>
              <p
                data-testid="tax-sim-vat-value"
                className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1.5"
              >
                {formatRupiah(
                  monthlyTaxSim.isFnbRegionalPb1
                    ? monthlyTaxSim.estimatedMonthlyPb1
                    : monthlyTaxSim.estimatedMonthlyPpn
                )}
              </p>
              <p className="text-[11px] text-stone-500 mt-1">
                {monthlyTaxSim.isFnbRegionalPb1
                  ? 'Pajak Restoran/Kedai Daerah 10%'
                  : simAsPkp
                  ? `DPP Nilai Lain: ${formatRupiah(monthlyTaxSim.estimatedDppNilaiLain)}`
                  : 'Non-PKP (PPN Rp0)'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-stone-500">Estimasi PPh Bulanan</p>
              <p
                data-testid="tax-sim-pph-value"
                className="text-xl font-bold font-mono tabular-nums text-stone-900 mt-1.5"
              >
                {formatRupiah(monthlyTaxSim.estimatedMonthlyPph)}
              </p>
              <p className="text-[11px] text-stone-500 mt-1 truncate">
                {monthlyTaxSim.isExemptUnder500M
                  ? 'Bebas PPh (Omzet WP OP <= Rp500jt)'
                  : monthlyTaxSim.pphRegimeTitle}
              </p>
            </div>

            <div className="p-5 bg-emerald-50/40">
              <p className="text-xs font-semibold text-emerald-800">
                Total Estimasi Setoran Pajak
              </p>
              <p
                data-testid="tax-sim-total-value"
                className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5"
              >
                {formatRupiah(monthlyTaxSim.totalEstimatedMonthlyTax)}
              </p>
              <p className="text-[11px] text-stone-600 mt-1 font-mono tabular-nums">
                Tarif efektif {monthlyTaxSim.effectiveTaxRatePct}% dari omzet
              </p>
            </div>
          </div>
        </section>

        {/* PP 20/2026 Primary Compliance Card */}
        <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                Regulasi Aktif · {pph.regulationRef}
              </p>
              <h2 className="text-xl font-bold text-stone-900 mt-1">{pph.regimeTitle}</h2>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-500">Estimasi PPh Terutang Bulan Ini</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
                {formatRupiah(pph.estimatedTaxPayable)}
              </p>
            </div>
          </div>

          {/* Cumulative Rp500M Threshold Progress Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">
                Omzet Kumulatif Tahun Pajak Berjalan (YTD)
              </span>
              <span className="font-mono font-bold tabular-nums text-slate-900">
                {formatRupiah(pph.cumulativeYtdTurnover)} / Batas UMKM Rp4.800.000.000
              </span>
            </div>

            {tenant.taxEntity === 'WP_OP' && tenant.vertical !== 'FREELANCE' && (
              <>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pph.exemptProgressPct >= 95 ? 'bg-amber-500' : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(100, pph.exemptProgressPct)}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Batas Bebas PPh Final WP OP: <strong>Rp500.000.000</strong> ({pph.exemptProgressPct}%
                    terpakai)
                  </span>
                  <span className="font-mono tabular-nums">
                    Sisa Kuota Bebas: {formatRupiah(pph.exemptRemainingRp500M)}
                  </span>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 text-xs">
              <div>
                <p className="text-slate-500">Omzet Bulan Sebelumnya</p>
                <p className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                  {formatRupiah(tenant.cumulativeTurnoverPriorMonths)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Omzet Bulan Berjalan</p>
                <p className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                  {formatRupiah(report.tier1.grossSales)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Dasar Pengenaan Bulan Ini</p>
                <p className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                  {formatRupiah(pph.taxableTurnoverThisMonth)}
                </p>
              </div>
            </div>
          </div>

          <ul className="space-y-1.5 text-xs text-slate-600">
            {pph.complianceNotes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </section>

        {/* Ledger Tax Liabilities Strip */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Utang PPN Keluaran (Akun 2102)</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(getLedgerBalance('2102'))}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Status PKP: {tenant.isPkp ? 'Aktif (Wajib e-Faktur)' : 'Non-PKP'}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Utang Pajak Daerah PB1 10% (Akun 2103)</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(getLedgerBalance('2103'))}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pajak Restoran / Kedai (UU HKPD)</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs text-slate-500">Utang PPh 21 / 23 / 4(2) (Akun 2105)</p>
            <p className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(getLedgerBalance('2105'))}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pemotongan biaya sewa, jasa &amp; gaji</p>
          </div>
        </section>

        {/* PMK 131/2024 PPN Simulator + Coretax NIK/NITKU Identity */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-bold text-slate-900">
                Kalkulator PPN PMK 131/2024 (DPP Nilai Lain 11/12)
              </h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Untuk BKP/JKP non-mewah, tarif undang-undang 12% dikalikan DPP Nilai Lain sebesar
              11/12 dari Harga Jual sehingga tarif efektif tetap 11%.
            </p>

            <div>
              <label htmlFor="sim-harga" className="block text-xs font-medium text-slate-700 mb-1">
                Harga Jual (Rp)
              </label>
              <input
                id="sim-harga"
                type="number"
                min={0}
                value={simPrice}
                onChange={(e) => setSimPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simLuxury}
                  onChange={(e) => {
                    setSimLuxury(e.target.checked);
                    if (e.target.checked) setSimExempt(false);
                  }}
                />
                <span>Barang Mewah / PPnBM (12% penuh)</span>
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simExempt}
                  onChange={(e) => {
                    setSimExempt(e.target.checked);
                    if (e.target.checked) setSimLuxury(false);
                  }}
                />
                <span>Sembako Pokok Dibebaskan (PP 49/2022)</span>
              </label>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Harga Jual</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatRupiah(simPrice || '0')}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>DPP Nilai Lain (Coretax e-Faktur)</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatRupiah(simPpn.dppNilaiLain)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>{simPpn.effectiveRateLabel}</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {formatRupiah(simPpn.taxAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Coretax 16-Digit NPWP & 22-Digit NITKU */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateTenantProfile({ npwp16: npwpDraft, nitku22: nitkuDraft });
              setSavedNotice(true);
              window.setTimeout(() => setSavedNotice(false), 3000);
            }}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Identitas Coretax DJP (NPWP 16-Digit &amp; NITKU 22-Digit)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Digunakan untuk pemetaan cabang usaha dan lampiran SPT non-delta
              </p>
            </div>

            <div>
              <label htmlFor="coretax-npwp" className="block text-xs font-medium text-slate-700 mb-1">
                NIK / NPWP 16-Digit
              </label>
              <input
                id="coretax-npwp"
                type="text"
                maxLength={16}
                value={npwpDraft}
                onChange={(e) => setNpwpDraft(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
              <p className="text-[11px] mt-1 flex items-center gap-1">
                {coretaxValidation.npwpValid ? (
                  <span className="text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Format 16 digit valid
                  </span>
                ) : (
                  <span className="text-amber-700 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Wajib 16 digit angka (saat ini{' '}
                    {npwpDraft.length} digit)
                  </span>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="coretax-nitku" className="block text-xs font-medium text-slate-700 mb-1">
                NITKU 22-Digit (Nomor Identitas Tempat Kegiatan Usaha)
              </label>
              <input
                id="coretax-nitku"
                type="text"
                maxLength={22}
                value={nitkuDraft}
                onChange={(e) => setNitkuDraft(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
              <p className="text-[11px] mt-1 flex items-center gap-1">
                {coretaxValidation.nitkuValid ? (
                  <span className="text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Format 22 digit valid
                  </span>
                ) : (
                  <span className="text-amber-700 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Wajib 22 digit angka (saat ini{' '}
                    {nitkuDraft.length} digit)
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Simpan Identitas Coretax
              </button>
              {savedNotice && (
                <span className="text-xs font-medium text-emerald-700">Tersimpan</span>
              )}
            </div>
          </form>
        </section>
        {/* Purchase Receipts Tax Cross-Check Archive */}
        <section
          data-testid="tax-purchase-receipts-archive"
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Arsip Bukti Pembelian &amp; Nota Supplier (Cross-Check Pajak)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bukti transaksi pembelian/kulakan yang dilampirkan pegawai maupun pemilik untuk
                  verifikasi HPP dan kelengkapan dokumen pemeriksaan pajak.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono text-slate-600">
              {purchaseProofRows.filter((m) => Boolean(m.receiptImageUrl)).length} /{' '}
              {purchaseProofRows.length} nota terlampir
            </span>
          </div>

          <DataTable
            data={purchaseProofRows}
            columns={purchaseProofColumns}
            getRowKey={(m) => m.id}
            defaultPageSize={10}
            testId="tax-receipts-datatable"
            emptyState={
              <p className="text-sm text-slate-500">
                Belum ada riwayat pembelian stok. Unggah foto nota saat melakukan Kulakan / Restock
                agar otomatis terarsip di sini.
              </p>
            }
          />
        </section>
      </div>

      <ReceiptPreviewModal
        receipt={previewReceipt}
        onClose={() => setPreviewReceipt(null)}
      />
      </ModuleGate>
    </AppShell>
  );
}
