import React, { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Clock,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { FeatureGuard } from '../components/FeatureGuard';
import { useApp } from '../context/AppContext';
import { generateThreeTierFinancialReport } from '../lib/accounting/journal-engine';
import { calculatePPhCompliance } from '../lib/tax/indonesia-tax-engine';
import { evaluateStockAlerts } from '../lib/inventory/stock-monitoring';
import { detectAntiFraudAnomalies } from '../lib/pos/advanced-pos-engine';

const QUICK_PROMPTS = [
  'Analisa margin laba kotor & 3 langkah praktis menaikkan profit bulan ini',
  'Cek stok kritis & susun strategi restok prioritas paling hemat kas',
  'Jelaskan ringkasan kewajiban pajak DJP 2026 & status batas bebas Rp500 Juta usaha saya',
];

export function AiAssistantPage() {
  const { activeWorkspace, hasAddOn, session } = useApp();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [quotaUsed, setQuotaUsed] = useState<number>(0);
  const [quotaLimit, setQuotaLimit] = useState<number>(60);

  const aiEnabled = hasAddOn('ADDON_AI_ASSISTANT');

  // Pre-aggregated lightweight numeric summary ONLY (never sends raw transaction tables!)
  const preAggregatedSummary = useMemo(() => {
    const report = generateThreeTierFinancialReport(
      activeWorkspace.accounts,
      activeWorkspace.journalEntries,
      activeWorkspace.orders,
      activeWorkspace.expenses,
      activeWorkspace.fixedAssets
    );
    const tax = calculatePPhCompliance({
      vertical: activeWorkspace.tenant.vertical,
      taxEntity: activeWorkspace.tenant.taxEntity,
      priorCumulativeTurnover: activeWorkspace.tenant.cumulativeTurnoverPriorMonths,
      currentMonthTurnover: report.tier1.grossSales,
      currentMonthNetProfit: report.tier1.netProfit,
    });
    const stockEval = evaluateStockAlerts(activeWorkspace.products);
    const fraudAlerts = detectAntiFraudAnomalies({
      orders: activeWorkspace.orders,
      shifts: activeWorkspace.cashierShifts ?? [],
      auditLogs: activeWorkspace.auditLogs ?? [],
    });

    const productSalesMap = new Map<string, { name: string; qty: Decimal; rev: Decimal }>();
    for (const order of activeWorkspace.orders) {
      if (order.paymentStatus !== 'PAID') continue;
      for (const item of order.items) {
        const cur = productSalesMap.get(item.productId) ?? {
          name: item.itemNameSnapshot,
          qty: new Decimal(0),
          rev: new Decimal(0),
        };
        cur.qty = cur.qty.plus(item.qty);
        cur.rev = cur.rev.plus(new Decimal(item.qty).times(item.unitPrice));
        productSalesMap.set(item.productId, cur);
      }
    }
    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.rev.comparedTo(a.rev))
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        qty: p.qty.toFixed(0),
        revenue: p.rev.toFixed(0),
      }));

    return {
      businessName: activeWorkspace.tenant.name,
      vertical: activeWorkspace.tenant.vertical,
      periodLabel: new Date().toISOString().slice(0, 7),
      omzetTotal: new Decimal(report.tier1.grossSales).toFixed(0),
      hppTotal: new Decimal(report.tier1.totalHpp).toFixed(0),
      grossProfit: new Decimal(report.tier1.grossProfit).toFixed(0),
      expenseTotal: new Decimal(report.tier1.operatingExpenses).toFixed(0),
      netProfit: new Decimal(report.tier1.netProfit).toFixed(0),
      estimatedTax: new Decimal(tax.estimatedTaxPayable).toFixed(0),
      taxRegime: tax.regimeTitle,
      topProducts,
      criticalStockItems: stockEval.alerts.slice(0, 5).map((a) => ({
        name: a.product.name,
        stockQty: new Decimal(a.currentStock).toFixed(0),
        minAlert: new Decimal(a.minStockAlert).toFixed(0),
      })),
      extraHighlights: [
        `Jumlah Cabang Aktif: ${(activeWorkspace.branches ?? []).length}`,
        `Peringatan Anti-Fraud: ${fraudAlerts.length}`,
      ],
    };
  }, [activeWorkspace]);

  useEffect(() => {
    if (!aiEnabled) return;
    let active = true;
    const headers: Record<string, string> = {};
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    fetch(`/api/ai-assistant/usage?tenantId=${encodeURIComponent(activeWorkspace.tenant.id)}`, {
      headers,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setQuotaUsed(Number(data.quotaUsed ?? data.used ?? 0));
        setQuotaLimit(Number(data.quotaLimit ?? data.limit ?? 60));
      })
      .catch(() => {
        // ignore passive usage load failure
      });
    return () => {
      active = false;
    };
  }, [aiEnabled, activeWorkspace.tenant.id, session?.token]);

  const askAssistant = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setCached(false);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.token) headers.Authorization = `Bearer ${session.token}`;
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: activeWorkspace.tenant.id,
          question: clean,
          summary: preAggregatedSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Permintaan Asisten AI gagal diproses.');
        return;
      }
      setAnswer(json.answer || 'Tidak ada jawaban dikembalikan.');
      setCached(Boolean(json.fromCache ?? json.cached));
      setModelUsed(json.modelUsed ?? json.model ?? null);
      if (typeof json.quotaUsed === 'number') setQuotaUsed(json.quotaUsed);
      if (typeof json.quotaLimit === 'number') setQuotaLimit(json.quotaLimit);
    } catch {
      setError('Gagal terhubung ke layanan Asisten AI. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const quotaPct = Math.min(100, Math.round((quotaUsed / Math.max(1, quotaLimit)) * 100));

  return (
    <AppShell
      title="Asisten Bisnis AI (Add-On Terpisah)"
      subtitle="Analitik keuangan & pajak DJP berbasis ringkasan angka teragregasi · Hemat biaya dengan cache 24 jam & kuota keras 60/bulan"
    >
      <FeatureGuard
        moduleCode="ADDON_AI_ASSISTANT"
        title="Asisten Bisnis AI (+Rp35.000/bulan · Terpisah dari Paket Inti)"
        description="Paket LITE, BASIC, PRO, dan EXPERT dirancang 100% bebas biaya token AI agar harga langganan tetap terjangkau mulai Rp49rb/bln. Aktifkan Add-On ini hanya jika Anda membutuhkan konsultasi AI."
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Quota & Privacy Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-900">
                Kuota Permintaan Bulan Ini ·{' '}
                <span className="font-mono tabular-nums text-emerald-700">
                  {quotaUsed} / {quotaLimit}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Pertanyaan identik dalam 24 jam disajikan dari cache otomatis (0 kuota terpakai).
              </p>
            </div>
            <div className="w-full sm:w-56 space-y-1">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    quotaPct >= 90 ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="text-[11px] font-mono text-right text-slate-500 tabular-nums">
                Sisa {Math.max(0, quotaLimit - quotaUsed)} pertanyaan
              </p>
            </div>
          </div>

          {/* Prompt Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-900">
                Tanya Analitik Usaha Anda ({activeWorkspace.tenant.name})
              </h2>
              <p className="text-xs text-slate-500">
                Hanya ringkasan angka agregat (omzet, HPP, laba, jumlah stok kritis, pajak) yang dikirim—tidak pernah mengirim detail data pribadi pelanggan.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setPrompt(qp);
                    void askAssistant(qp);
                  }}
                  className="text-left px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askAssistant(prompt);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Contoh: Bagaimana cara memperbaiki margin laba bulan ini?"
                className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim() || quotaUsed >= quotaLimit}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{loading ? 'Menganalisis...' : 'Kirim Pertanyaan'}</span>
              </button>
            </form>
          </div>

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Answer / Empty State */}
          {answer ? (
            <div
              data-testid="ai-assistant-response"
              className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Hasil Analisis Asisten Bisnis</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  {cached && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <Clock className="w-3 h-3" /> Dari Cache 24 Jam
                    </span>
                  )}
                  {modelUsed && <span className="font-mono">{modelUsed}</span>}
                </div>
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {answer}
              </div>
            </div>
          ) : (
            !loading && (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
                <Sparkles className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">Siap Membantu Analisis Usaha Anda</p>
                <p className="text-xs text-slate-500">
                  Pilih salah satu pertanyaan cepat di atas atau ketik pertanyaan keuangan/stok/pajak Anda.
                </p>
              </div>
            )
          )}
        </div>
      </FeatureGuard>
    </AppShell>
  );
}
