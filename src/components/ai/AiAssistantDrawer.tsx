import React, { useMemo, useState } from 'react';
import { Lock, Send, Sparkles, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tenantHasAddOn } from '../../lib/saas/hybrid-pricing';
import { formatRupiah } from '../../lib/pos/checkout-service';
import { generateThreeTierFinancialReport } from '../../lib/accounting/journal-engine';

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
}

const QUICK_PROMPTS = [
  'Ringkas performa omzet dan laba bersih bulan ini',
  'Barang apa saja yang stoknya mulai menipis?',
  'Berapa estimasi pajak UMKM saya bulan ini?',
];

export function AiAssistantDrawer({ open, onClose }: AiAssistantDrawerProps) {
  const { activeWorkspace, session, navigate } = useApp();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: 'assistant',
      text: 'Halo, saya Asisten AI KasirAkun. Tanyakan ringkasan omzet, stok menipis, margin produk, atau estimasi pajak UMKM Anda.',
    },
  ]);

  const hasAiAddOn = useMemo(
    () => tenantHasAddOn(activeWorkspace.tenant, 'ADDON_AI_ASSISTANT'),
    [activeWorkspace.tenant]
  );

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

  if (!open) return null;

  const sendQuestion = async (questionText: string) => {
    const q = questionText.trim();
    if (!q || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          tenantId: activeWorkspace.tenant.id,
          question: q,
          contextSummary: {
            businessName: activeWorkspace.tenant.name,
            vertical: activeWorkspace.tenant.vertical,
            grossSales: report.tier1.grossSales,
            netProfit: report.tier1.netProfit,
            totalOrders: activeWorkspace.orders.length,
            lowStockCount: activeWorkspace.products.filter(
              (p) => Number(p.stockQty) <= Number(p.minStockAlert || 0)
            ).length,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Layanan Asisten AI sedang sibuk.');
      }
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer || data.reply || 'Analisis selesai.' },
      ]);
    } catch {
      // Deterministic local summary fallback when server analytics endpoint is unavailable
      const lowStock = activeWorkspace.products.filter(
        (p) => Number(p.stockQty) <= Number(p.minStockAlert || 0)
      );
      const fallbackText =
        `Ringkasan langsung untuk ${activeWorkspace.tenant.name}: ` +
        `Omzet tercatat ${formatRupiah(report.tier1.grossSales)} dari ${activeWorkspace.orders.length} transaksi, ` +
        `dengan laba bersih ${formatRupiah(report.tier1.netProfit)}. ` +
        (lowStock.length > 0
          ? `Terdapat ${lowStock.length} item dengan stok mendekati batas minimum (${lowStock
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')}).`
          : 'Seluruh stok produk saat ini berada di atas batas minimum.');
      setMessages((prev) => [...prev, { role: 'assistant', text: fallbackText }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="ai-assistant-drawer"
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Asisten AI KasirAkun"
    >
      <div className="fixed inset-0 bg-stone-900/35" onClick={onClose} />
      <aside className="relative w-full max-w-md bg-white border-l border-stone-200 h-full flex flex-col z-10">
        {/* Drawer Header */}
        <div className="h-16 px-5 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-stone-900 truncate">Asisten AI Bisnis</h2>
              <p className="text-[11px] text-stone-500 truncate">
                Add-On Opsional · Kuota 60x/bulan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel Asisten AI"
            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {!hasAiAddOn ? (
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-stone-100 border border-stone-200 text-stone-600 flex items-center justify-center">
              <Lock className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-base font-bold text-stone-900">
                Add-On Asisten AI Belum Aktif
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Aktifkan add-on Asisten AI (+Rp35.000/bln) untuk tanya jawab performa usaha,
                prediksi restock otomatis, dan scan struk kulakan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/subscription');
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Lihat Add-On di Langganan
            </button>
          </div>
        ) : (
          <>
            {/* Quick Prompts */}
            <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/70 space-y-2 shrink-0">
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Pertanyaan Cepat
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendQuestion(prompt)}
                    className="text-left text-[11px] font-medium text-stone-700 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-800 border border-stone-200'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs bg-stone-100 text-stone-500 border border-stone-200 animate-pulse">
                  Menganalisis data pembukuan...
                </div>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendQuestion(input);
              }}
              className="p-4 border-t border-stone-200 flex items-center gap-2 shrink-0 bg-white"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanya tentang omzet, stok, atau pajak..."
                className="flex-1 px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex items-center justify-center p-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-200 disabled:text-stone-400 rounded-lg transition-colors"
                aria-label="Kirim pertanyaan"
              >
                <Send className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
