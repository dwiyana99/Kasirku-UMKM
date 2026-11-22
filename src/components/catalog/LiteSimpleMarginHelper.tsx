import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Check, Percent, Sparkles } from 'lucide-react';
import { computeSimpleMarginPrice } from '../../lib/catalog/pricing-simulator';
import { formatRupiah } from '../../lib/pos/checkout-service';

interface LiteSimpleMarginHelperProps {
  costPrice: string;
  onApplySellingPrice: (recommendedPrice: string) => void;
  onUpgradeAddOn?: () => void;
}

const QUICK_MARGINS = [10, 15, 20, 25, 30];

/**
 * Simple Margin % -> Recommended Selling Price helper specifically for Paket LITE.
 * No operational/tax/MDR complexity; user sets % margin from HPP and gets instant price
 * recommendation, while still being able to type Harga Jual manually above.
 */
export function LiteSimpleMarginHelper({
  costPrice,
  onApplySellingPrice,
}: LiteSimpleMarginHelperProps) {
  const [marginPct, setMarginPct] = useState<string>('15');
  const [roundingStep, setRoundingStep] = useState<0 | 100 | 500 | 1000>(500);
  const [appliedFlash, setAppliedFlash] = useState(false);

  const calc = useMemo(
    () => computeSimpleMarginPrice(costPrice, marginPct, roundingStep),
    [costPrice, marginPct, roundingStep]
  );

  const hasValidHpp = new Decimal(calc.costPrice).gt(0);

  const handleApply = () => {
    if (!hasValidHpp) return;
    onApplySellingPrice(new Decimal(calc.recommendedPrice).toFixed(0));
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 1800);
  };

  return (
    <div
      data-testid="lite-simple-margin-helper"
      className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-emerald-700" strokeWidth={1.75} />
          <h3 className="text-xs font-semibold text-stone-900">
            Rekomendasi Harga Jual dari Margin (%)
          </h3>
        </div>
        <span className="text-[11px] text-stone-500">
          Tetap bisa ketik manual di kolom Harga Jual di atas
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <label
            htmlFor="lite-margin-pct-input"
            className="block text-[11px] font-medium text-stone-700 mb-1"
          >
            Margin Keuntungan (%)
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="lite-margin-pct-input"
              data-testid="lite-margin-pct-input"
              type="number"
              min="0"
              max="500"
              step="1"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-sm font-mono tabular-nums bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
            />
            <span className="text-xs font-medium text-stone-600">% dari harga beli</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="lite-rounding-select"
            className="block text-[11px] font-medium text-stone-700 mb-1"
          >
            Pembulatan Harga
          </label>
          <select
            id="lite-rounding-select"
            value={roundingStep}
            onChange={(e) => setRoundingStep(Number(e.target.value) as 0 | 100 | 500 | 1000)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-emerald-600"
          >
            <option value={0}>Tanpa pembulatan</option>
            <option value={100}>Bulatkan ke Rp100</option>
            <option value={500}>Bulatkan ke Rp500</option>
            <option value={1000}>Bulatkan ke Rp1.000</option>
          </select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 bg-white border border-stone-200 rounded-lg px-3 py-2">
          <div>
            <p className="text-[10px] text-stone-500">Harga Rekomendasi</p>
            <p
              data-testid="lite-recommended-price"
              className="text-sm font-mono font-bold tabular-nums text-emerald-700"
            >
              {hasValidHpp ? formatRupiah(calc.recommendedPrice) : 'Isi Harga Beli'}
            </p>
            {hasValidHpp && (
              <p className="text-[10px] font-mono tabular-nums text-stone-500">
                Untung +{formatRupiah(calc.estimatedProfitPerUnit)}/unit
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!hasValidHpp}
            onClick={handleApply}
            data-testid="lite-apply-recommended-price-btn"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 rounded-lg whitespace-nowrap"
          >
            {appliedFlash ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{appliedFlash ? 'Dipakai' : 'Pakai'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-200/70">
        <span className="text-[11px] text-stone-500">Pilih cepat:</span>
        {QUICK_MARGINS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setMarginPct(String(pct))}
            className={`px-2 py-0.5 text-[11px] font-mono rounded-md border transition-colors ${
              marginPct === String(pct)
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
            }`}
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  );
}
