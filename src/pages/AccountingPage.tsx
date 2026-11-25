import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  RotateCcw,
  Plus,
  CheckCircle2,
  Calculator,
  BookOpen,
  Receipt,
  Building,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ProfitLossTrendChart } from '../components/accounting/ProfitLossTrendChart';
import { Tier1SimpleFinancialReport } from '../components/accounting/Tier1SimpleFinancialReport';
import { useApp } from '../context/AppContext';
import { generateThreeTierFinancialReport } from '../lib/accounting/journal-engine';
import { calculateWithholdingTax } from '../lib/tax/indonesia-tax-engine';
import { formatRupiah } from '../lib/pos/checkout-service';
import { tenantHasAddOn } from '../lib/saas/hybrid-pricing';
import type { WithholdingTaxType } from '../types/domain';

type AccountingTab = 'REPORTS' | 'JOURNALS' | 'EXPENSES' | 'ASSETS';
type ReportTier = 'TIER_1' | 'TIER_2' | 'TIER_3';

export function AccountingPage() {
  const {
    activeWorkspace,
    recordOperationalExpense,
    runMonthlyDepreciation,
    reverseJournal,
    addFixedAsset,
  } = useApp();

  const hasAccountingPro = tenantHasAddOn(activeWorkspace.tenant, 'ADDON_ACCOUNTING_PRO');

  const [tab, setTab] = useState<AccountingTab>('REPORTS');
  const [tier, setTier] = useState<ReportTier>(hasAccountingPro ? 'TIER_2' : 'TIER_1');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Operational Expense Form State
  const expenseAccounts = activeWorkspace.accounts.filter(
    (a) => a.category === 'EXPENSE' && a.code.startsWith('6')
  );
  const paymentAccounts = activeWorkspace.accounts.filter(
    (a) => a.code === '1101' || a.code === '1102'
  );
  const [expAccountId, setExpAccountId] = useState(expenseAccounts[0]?.id ?? '');
  const [payAccountId, setPayAccountId] = useState(paymentAccounts[0]?.id ?? '');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expWhtType, setExpWhtType] = useState<WithholdingTaxType>('NONE');
  const [expCustomAttrs, setExpCustomAttrs] = useState<Record<string, string>>({});

  // Fixed Asset Form State
  const [assetCode, setAssetCode] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetDate, setAssetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assetCost, setAssetCost] = useState('');
  const [assetSalvage, setAssetSalvage] = useState('0');
  const [assetLife, setAssetLife] = useState('48');

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

  const whtPreview = useMemo(
    () => calculateWithholdingTax(expAmount || '0', expWhtType),
    [expAmount, expWhtType]
  );

  const expenseCustomFields = activeWorkspace.customFields.filter(
    (f) => f.targetEntity === 'expenses'
  );

  const showNotice = (msg: string) => {
    setBannerMsg(msg);
    window.setTimeout(() => setBannerMsg(null), 5000);
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDesc.trim() || !expAmount || Number(expAmount) <= 0) return;
    const chosenExpAcc = expenseAccounts.find((a) => a.id === expAccountId) ?? expenseAccounts[0];
    const chosenPayAcc = paymentAccounts.find((a) => a.id === payAccountId) ?? paymentAccounts[0];
    if (!chosenExpAcc || !chosenPayAcc) return;

    recordOperationalExpense({
      expenseAccountId: chosenExpAcc.id,
      paymentAccountId: chosenPayAcc.id,
      expenseDate: expDate,
      description: expDesc,
      amount: expAmount,
      withholdingTaxType: expWhtType,
      customAttributes: expCustomAttrs,
    });
    setExpDesc('');
    setExpAmount('');
    setExpWhtType('NONE');
    setExpCustomAttrs({});
    showNotice('Biaya operasional dan jurnal double-entry (beserta utang PPh jika ada) berhasil diposting.');
  };

  const handleAssetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetCode.trim() || !assetName.trim() || !assetCost || Number(assetCost) <= 0) return;
    addFixedAsset({
      assetCode: assetCode.trim().toUpperCase(),
      name: assetName.trim(),
      acquisitionDate: assetDate,
      acquisitionCost: new Decimal(assetCost).toFixed(4),
      salvageValue: new Decimal(assetSalvage || '0').toFixed(4),
      usefulLifeMonths: Math.max(1, parseInt(assetLife, 10) || 48),
      depreciationMethod: 'STRAIGHT_LINE',
    });
    setAssetCode('');
    setAssetName('');
    setAssetCost('');
    showNotice('Aset tetap baru berhasil didaftarkan ke buku aset.');
  };

  const handleBatchDepreciation = () => {
    const res = runMonthlyDepreciation();
    if (new Decimal(res.totalDepreciation).gt(0)) {
      showNotice(
        `Penyusutan garis lurus berhasil diposting untuk ${res.count} aset aktif senilai ${formatRupiah(res.totalDepreciation)}.`
      );
    } else {
      showNotice('Semua aset tetap sudah tersusutkan penuh.');
    }
  };

  if (!hasAccountingPro) {
    return (
      <AppShell
        title="Laporan Laba & Kas"
        subtitle="Pantau uang masuk, modal barang, biaya usaha, dan untung bersih dari harian hingga tahunan."
      >
        <Tier1SimpleFinancialReport />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Laporan Keuangan & Pembukuan"
      subtitle="Ringkasan laba rugi harian, catatan jurnal otomatis, biaya usaha, aset tetap, hingga laporan SAK EMKM / PSAK."
    >
      <div className="space-y-6">
        {bannerMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
            <span>{bannerMsg}</span>
          </div>
        )}

        {/* Section Tabs */}
        <div
          role="tablist"
          aria-label="Modul Akuntansi"
          className="inline-flex flex-wrap gap-1.5 p-1 bg-white border border-stone-200 rounded-xl"
        >
          {(
            [
              { id: 'REPORTS', label: 'Laporan 3-Tier', icon: BookOpen },
              {
                id: 'JOURNALS',
                label: `Jurnal Umum (${activeWorkspace.journalEntries.length})`,
                icon: Calculator,
              },
              {
                id: 'EXPENSES',
                label: `Biaya Operasional (${activeWorkspace.expenses.length})`,
                icon: Receipt,
              },
              {
                id: 'ASSETS',
                label: `Aset & Penyusutan (${activeWorkspace.fixedAssets.length})`,
                icon: Building,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: 3-TIER FINANCIAL REPORTS */}
        {tab === 'REPORTS' && (
          <div className="space-y-6">
            {/* Monthly Double-Entry Net Profit & Loss Trend (Recharts) */}
            <ProfitLossTrendChart
              journalEntries={activeWorkspace.journalEntries}
              accounts={activeWorkspace.accounts}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'TIER_1', label: 'Ringkas Harian' },
                    { id: 'TIER_2', label: 'Standar Usaha (SAK EMKM)' },
                    { id: 'TIER_3', label: 'Lengkap & Rasio (PSAK)' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTier(t.id)}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      tier === t.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-100 text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-stone-600 font-mono">
                Neraca:{' '}
                <span
                  className={
                    report.tier2.isEquationBalanced
                      ? 'text-emerald-700 font-semibold'
                      : 'text-rose-600 font-semibold'
                  }
                >
                  {report.tier2.isEquationBalanced
                    ? 'SEIMBANG (Aset = Liabilitas + Ekuitas)'
                    : `Selisih ${formatRupiah(report.tier2.equationDiff)}`}
                </span>
              </div>
            </div>

            {/* TIER 1: Simple Period Financial Report (Harian, Mingguan, Bulanan, Triwulan, YTD + Cetak) */}
            {tier === 'TIER_1' && <Tier1SimpleFinancialReport />}

            {/* TIER 2: SAK EMKM Balance Sheet & Accrual P&L */}
            {tier === 'TIER_2' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Laporan Posisi Keuangan (Neraca) */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Laporan Posisi Keuangan (Neraca · SAK EMKM)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Persamaan akuntansi: Aset = Liabilitas + Ekuitas
                    </p>
                  </div>

                  <div className="space-y-4 text-xs sm:text-sm">
                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Aset
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.assets.map((row) => (
                          <div key={row.code} className="py-2 flex justify-between gap-4">
                            <span className="text-slate-700">
                              <span className="font-mono text-xs text-slate-400 mr-2">
                                {row.code}
                              </span>
                              {row.name}
                            </span>
                            <span className="font-mono tabular-nums text-slate-900 shrink-0">
                              {formatRupiah(row.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                        <span>Total Aset</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(report.tier2.totalAssets)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Liabilitas
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.liabilities.length === 0 ? (
                          <p className="py-2 text-xs text-slate-400">Tidak ada saldo liabilitas.</p>
                        ) : (
                          report.tier2.liabilities.map((row) => (
                            <div key={row.code} className="py-2 flex justify-between gap-4">
                              <span className="text-slate-700">
                                <span className="font-mono text-xs text-slate-400 mr-2">
                                  {row.code}
                                </span>
                                {row.name}
                              </span>
                              <span className="font-mono tabular-nums text-slate-900 shrink-0">
                                {formatRupiah(row.amount)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between font-semibold text-slate-800">
                        <span>Total Liabilitas</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(report.tier2.totalLiabilities)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Ekuitas
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.equity.map((row) => (
                          <div key={row.code} className="py-2 flex justify-between gap-4">
                            <span className="text-slate-700">
                              <span className="font-mono text-xs text-slate-400 mr-2">
                                {row.code}
                              </span>
                              {row.name}
                            </span>
                            <span className="font-mono tabular-nums text-slate-900 shrink-0">
                              {formatRupiah(row.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                        <span>Total Liabilitas &amp; Ekuitas</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(
                            new Decimal(report.tier2.totalLiabilities).plus(
                              new Decimal(report.tier2.totalEquity)
                            )
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Laporan Laba Rugi (Akrual) */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Laporan Laba Rugi (Basis Akrual · SAK EMKM)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Catatan atas Laporan Keuangan: Persediaan perpetual &amp; depresiasi garis lurus
                    </p>
                  </div>

                  <div className="space-y-4 text-xs sm:text-sm">
                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Pendapatan Usaha
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.revenues.map((row) => (
                          <div key={row.code} className="py-2 flex justify-between gap-4">
                            <span className="text-slate-700">
                              <span className="font-mono text-xs text-slate-400 mr-2">
                                {row.code}
                              </span>
                              {row.name}
                            </span>
                            <span className="font-mono tabular-nums text-slate-900 shrink-0">
                              {formatRupiah(row.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between font-semibold">
                        <span>Total Pendapatan</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(report.tier2.totalRevenue)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Harga Pokok Penjualan (HPP)
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.cogs.length === 0 ? (
                          <p className="py-2 text-xs text-slate-400">Rp0 (Usaha jasa / belum ada HPP)</p>
                        ) : (
                          report.tier2.cogs.map((row) => (
                            <div key={row.code} className="py-2 flex justify-between gap-4">
                              <span className="text-slate-700">
                                <span className="font-mono text-xs text-slate-400 mr-2">
                                  {row.code}
                                </span>
                                {row.name}
                              </span>
                              <span className="font-mono tabular-nums text-slate-900 shrink-0">
                                ({formatRupiah(row.amount)})
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900 pb-2 border-b border-slate-200">
                        Beban Operasional
                      </p>
                      <div className="divide-y divide-slate-100">
                        {report.tier2.expenses.length === 0 ? (
                          <p className="py-2 text-xs text-slate-400">Belum ada beban operasional.</p>
                        ) : (
                          report.tier2.expenses.map((row) => (
                            <div key={row.code} className="py-2 flex justify-between gap-4">
                              <span className="text-slate-700">
                                <span className="font-mono text-xs text-slate-400 mr-2">
                                  {row.code}
                                </span>
                                {row.name}
                              </span>
                              <span className="font-mono tabular-nums text-slate-900 shrink-0">
                                ({formatRupiah(row.amount)})
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t-2 border-slate-900 flex justify-between text-base font-bold">
                      <span>Laba (Rugi) Bersih Periode Berjalan</span>
                      <span
                        className={`font-mono tabular-nums ${
                          new Decimal(report.tier2.netIncome).lt(0)
                            ? 'text-rose-600'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatRupiah(report.tier2.netIncome)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TIER 3: Expert PSAK Cash Flow, Ratios & Fiscal Reconciliation */}
            {tier === 'TIER_3' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Gross Profit Margin', value: `${report.tier3.ratios.grossProfitMarginPct}%` },
                    { label: 'Net Profit Margin', value: `${report.tier3.ratios.netProfitMarginPct}%` },
                    { label: 'Current Ratio', value: `${report.tier3.ratios.currentRatio}x` },
                    { label: 'Quick Ratio', value: `${report.tier3.ratios.quickRatio}x` },
                    { label: 'Inventory Turnover', value: `${report.tier3.ratios.inventoryTurnover}x` },
                    { label: 'Days Sales Inventory', value: `${report.tier3.ratios.daysSalesOfInventory} hari` },
                    { label: 'Return on Equity (ROE)', value: `${report.tier3.ratios.roePct}%` },
                    { label: 'Break-Even Revenue', value: formatRupiah(report.tier3.ratios.breakEvenRevenue) },
                  ].map((m) => (
                    <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
                      <p className="text-xs text-slate-500">{m.label}</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h2 className="text-base font-bold text-slate-900">
                      Laporan Arus Kas (PSAK · Aktivitas Operasi, Investasi, Pendanaan)
                    </h2>
                    <div className="divide-y divide-slate-100 text-sm">
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Arus Kas dari Aktivitas Operasi</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRupiah(report.tier3.cashFlowOperating)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Arus Kas dari Aktivitas Investasi (Capex)</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRupiah(report.tier3.cashFlowInvesting)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Arus Kas dari Aktivitas Pendanaan (Modal)</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRupiah(report.tier3.cashFlowFinancing)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between font-bold text-slate-900">
                        <span>Saldo Kas, Bank &amp; Piutang QRIS Akhir</span>
                        <span className="font-mono tabular-nums text-emerald-700">
                          {formatRupiah(report.tier3.endingCashBalance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h2 className="text-base font-bold text-slate-900">
                      Rekonsiliasi Fiskal (Komersial → Fiskal)
                    </h2>
                    <div className="divide-y divide-slate-100 text-sm">
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Laba (Rugi) Bersih Komersial</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {formatRupiah(report.tier3.fiscalReconciliation.commercialNetIncome)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Koreksi Fiskal Positif (Pasal 9 UU PPh)</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          +{formatRupiah(report.tier3.fiscalReconciliation.positiveFiscalCorrection)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between">
                        <span className="text-slate-600">Koreksi Fiskal Negatif</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          -{formatRupiah(report.tier3.fiscalReconciliation.negativeFiscalCorrection)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between font-bold text-slate-900">
                        <span>Penghasilan Neto Fiskal</span>
                        <span className="font-mono tabular-nums text-emerald-700">
                          {formatRupiah(report.tier3.fiscalReconciliation.fiscalNetIncome)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IMMUTABLE DOUBLE-ENTRY JOURNAL VIEWER */}
        {tab === 'JOURNALS' && (
          <div className="space-y-4">
            {activeWorkspace.journalEntries.map((je) => {
              const totalD = je.lines.reduce(
                (s, l) => s.plus(new Decimal(l.debit)),
                new Decimal(0)
              );
              const totalC = je.lines.reduce(
                (s, l) => s.plus(new Decimal(l.credit)),
                new Decimal(0)
              );
              return (
                <article
                  key={je.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        <span className="font-mono text-xs text-slate-500 mr-2">
                          {je.entryNumber}
                        </span>
                        {je.description}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Tanggal: {je.entryDate} · Modul: {je.sourceModule} · Status:{' '}
                        <span
                          className={
                            je.status === 'REVERSED'
                              ? 'text-amber-700 font-semibold'
                              : 'text-emerald-700 font-semibold'
                          }
                        >
                          {je.status}
                        </span>
                      </p>
                    </div>

                    {je.status === 'POSTED' && je.sourceModule !== 'REVERSAL' && (
                      <button
                        type="button"
                        onClick={() =>
                          reverseJournal(je.id, 'Koreksi pencatatan via Jurnal Pembalik')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Buat Jurnal Pembalik</span>
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="py-2.5 px-5">Akun CoA</th>
                          <th className="py-2.5 px-4">Keterangan</th>
                          <th className="py-2.5 px-4 text-right">Debit</th>
                          <th className="py-2.5 px-5 text-right">Kredit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {je.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-2.5 px-5 whitespace-nowrap">
                              <span className="font-mono text-xs text-slate-400 mr-2">
                                {line.accountCodeSnapshot}
                              </span>
                              <span className="text-slate-900 font-medium">
                                {line.accountNameSnapshot}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-500">
                              {line.memo || '-'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                              {new Decimal(line.debit).gt(0) ? formatRupiah(line.debit) : '-'}
                            </td>
                            <td className="py-2.5 px-5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                              {new Decimal(line.credit).gt(0) ? formatRupiah(line.credit) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50/70 border-t border-slate-200 font-semibold text-xs">
                          <td colSpan={2} className="py-2 px-5 text-slate-600">
                            Total Seimbang (Immutable Ledger)
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900">
                            {formatRupiah(totalD)}
                          </td>
                          <td className="py-2 px-5 text-right font-mono tabular-nums text-slate-900">
                            {formatRupiah(totalC)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* TAB 3: OPERATIONAL EXPENSES WITH PPH 21/23/4(2) WITHHOLDING */}
        {tab === 'EXPENSES' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleExpenseSubmit}
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-slate-900">Catat Biaya Operasional</h2>
                <p className="text-xs text-slate-500">
                  Otomatis menghitung pemotongan PPh 21 TER / PPh 23 (2%) / PPh 4(2) Sewa (10%)
                </p>
              </div>

              <div>
                <label htmlFor="exp-acc" className="block text-xs font-medium text-slate-700 mb-1">
                  Akun Beban
                </label>
                <select
                  id="exp-acc"
                  value={expAccountId}
                  onChange={(e) => setExpAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-pay" className="block text-xs font-medium text-slate-700 mb-1">
                    Sumber Pembayaran
                  </label>
                  <select
                    id="exp-pay"
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="exp-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="exp-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Keterangan Biaya
                </label>
                <input
                  id="exp-desc"
                  type="text"
                  required
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Contoh: Sewa Ruko Desember / Jasa Audit"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-amt" className="block text-xs font-medium text-slate-700 mb-1">
                    Nominal Bruto (Rp)
                  </label>
                  <input
                    id="exp-amt"
                    type="number"
                    min={1}
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="5000000"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="exp-wht" className="block text-xs font-medium text-slate-700 mb-1">
                    Pemotongan Pajak (PPh)
                  </label>
                  <select
                    id="exp-wht"
                    value={expWhtType}
                    onChange={(e) => setExpWhtType(e.target.value as WithholdingTaxType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="NONE">Tanpa Potongan PPh</option>
                    <option value="PPH_4_2_SEWA_10PCT">PPh 4(2) Sewa Bangunan (10%)</option>
                    <option value="PPH_23_2PCT">PPh 23 Jasa / Konsultan (2%)</option>
                    <option value="PPH_21_TER">PPh 21 TER Gaji (2,5%)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Custom Fields for Expenses */}
              {expenseCustomFields.map((cf) => (
                <div key={cf.id}>
                  <label
                    htmlFor={`exp-cf-${cf.fieldKey}`}
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {cf.fieldLabel}
                  </label>
                  <input
                    id={`exp-cf-${cf.fieldKey}`}
                    type={cf.fieldType === 'NUMBER' ? 'number' : cf.fieldType === 'DATE' ? 'date' : 'text'}
                    value={expCustomAttrs[cf.fieldKey] ?? ''}
                    onChange={(e) =>
                      setExpCustomAttrs((p) => ({ ...p, [cf.fieldKey]: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              ))}

              {Number(expAmount) > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>{whtPreview.rateLabel}</span>
                    <span className="font-mono tabular-nums text-amber-700">
                      {formatRupiah(whtPreview.withheldAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Kas/Bank Dibayar ke Vendor</span>
                    <span className="font-mono tabular-nums">
                      {formatRupiah(whtPreview.netCashOut)}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan &amp; Posting Jurnal Biaya</span>
              </button>
            </form>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">Riwayat Biaya Operasional</h2>
              </div>
              {activeWorkspace.expenses.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada biaya operasional tercatat pada periode ini.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                        <th className="py-3 px-5">Tanggal &amp; Keterangan</th>
                        <th className="py-3 px-4 text-right">Bruto</th>
                        <th className="py-3 px-5 text-right">PPh Dipotong</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeWorkspace.expenses.map((exp) => (
                        <tr key={exp.id}>
                          <td className="py-3 px-5">
                            <p className="font-medium text-slate-900">{exp.description}</p>
                            <p className="text-xs text-slate-500">
                              {exp.expenseDate} · {exp.withholdingTaxType}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                            {formatRupiah(exp.amount)}
                          </td>
                          <td className="py-3 px-5 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">
                            {formatRupiah(exp.withholdingTaxAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: FIXED ASSETS & 1-CLICK MONTHLY DEPRECIATION */}
        {tab === 'ASSETS' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Register Aset Tetap &amp; Penyusutan Garis Lurus
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  1-klik untuk memposting jurnal penyusutan bulanan (Dr 6106 Beban Penyusutan / Cr
                  1202 Akumulasi Penyusutan)
                </p>
              </div>
              <button
                type="button"
                onClick={handleBatchDepreciation}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Posting Penyusutan Bulanan (1-Klik)
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                        <th className="py-3 px-5">Aset</th>
                        <th className="py-3 px-4 text-right">Harga Perolehan</th>
                        <th className="py-3 px-4 text-right">Akum. Penyusutan</th>
                        <th className="py-3 px-5 text-right">Nilai Buku</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeWorkspace.fixedAssets.map((fa) => {
                        const bookVal = new Decimal(fa.acquisitionCost).minus(
                          new Decimal(fa.accumulatedDepreciation)
                        );
                        const monthly = new Decimal(fa.acquisitionCost)
                          .minus(new Decimal(fa.salvageValue))
                          .div(fa.usefulLifeMonths);
                        return (
                          <tr key={fa.id}>
                            <td className="py-3 px-5">
                              <p className="font-medium text-slate-900">{fa.name}</p>
                              <p className="text-xs text-slate-500">
                                <span className="font-mono">{fa.assetCode}</span> · Masa manfaat{' '}
                                {fa.usefulLifeMonths} bln · {formatRupiah(monthly)}/bln
                              </p>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                              {formatRupiah(fa.acquisitionCost)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700 whitespace-nowrap">
                              {formatRupiah(fa.accumulatedDepreciation)}
                            </td>
                            <td className="py-3 px-5 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                              {formatRupiah(bookVal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <form
                onSubmit={handleAssetSubmit}
                className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">Tambah Aset Tetap Baru</h3>
                <div>
                  <label htmlFor="fa-code" className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Aset
                  </label>
                  <input
                    id="fa-code"
                    type="text"
                    required
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value)}
                    placeholder="FA-003"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="fa-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Aset
                  </label>
                  <input
                    id="fa-name"
                    type="text"
                    required
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="Oven Konveksi Listrik"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="fa-date" className="block text-xs font-medium text-slate-700 mb-1">
                      Tgl Perolehan
                    </label>
                    <input
                      id="fa-date"
                      type="date"
                      required
                      value={assetDate}
                      onChange={(e) => setAssetDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="fa-life" className="block text-xs font-medium text-slate-700 mb-1">
                      Umur (Bulan)
                    </label>
                    <input
                      id="fa-life"
                      type="number"
                      min={1}
                      required
                      value={assetLife}
                      onChange={(e) => setAssetLife(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="fa-cost" className="block text-xs font-medium text-slate-700 mb-1">
                      Harga Perolehan
                    </label>
                    <input
                      id="fa-cost"
                      type="number"
                      min={1}
                      required
                      value={assetCost}
                      onChange={(e) => setAssetCost(e.target.value)}
                      placeholder="12000000"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="fa-salv" className="block text-xs font-medium text-slate-700 mb-1">
                      Nilai Sisa
                    </label>
                    <input
                      id="fa-salv"
                      type="number"
                      min={0}
                      value={assetSalvage}
                      onChange={(e) => setAssetSalvage(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Daftarkan Aset Tetap
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
