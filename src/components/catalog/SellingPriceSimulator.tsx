/**
 * Simulasi Harga Jual & Cek Anti-Rugi (0 Token AI · Decimal.js)
 * Tersedia untuk Paket BASIC, PRO & EXPERT (di atas Paket LITE).
 * Membantu pemilik UMKM menentukan harga jual dari % HPP / Harga Beli
 * atau Target Untung Bersih dengan memperhitungkan biaya operasional,
 * kemasan, potongan non-tunai (QRIS/e-wallet), dan pajak agar tidak rugi.
 */

import React, { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import {
  canUsePricingSimulator,
  simulateSellingPrice,
  type PricingStrategyMode,
} from '../../lib/catalog/pricing-simulator';
import { formatRupiah } from '../../lib/pos/checkout-service';
import type { AddOnModuleCode, BusinessVertical, SubscriptionPlanCode } from '../../types/domain';

interface SellingPriceSimulatorProps {
  planCode?: SubscriptionPlanCode;
  activeAddOns?: AddOnModuleCode[];
  vertical?: BusinessVertical;
  isPkp?: boolean;
  costPrice: string;
  currentSellingPrice: string;
  onApplySellingPrice: (recommendedPrice: string) => void;
  onUpgradePlan?: () => void;
  /** Optional: allow editing modal/HPP directly when used as a standalone simulator drawer */
  allowEditCostPrice?: boolean;
  onCostPriceChange?: (nextCost: string) => void;
}

const PRESET_MARKUPS = [15, 25, 35, 50];

export function SellingPriceSimulator({
  planCode,
  activeAddOns,
  vertical,
  isPkp = false,
  costPrice,
  currentSellingPrice,
  onApplySellingPrice,
  onUpgradePlan,
  allowEditCostPrice = false,
  onCostPriceChange,
}: SellingPriceSimulatorProps) {
  const isUnlocked = canUsePricingSimulator(planCode, activeAddOns);

  const defaultTaxPct = useMemo(() => {
    if (vertical === 'KEDAI_MAKAN' || vertical === 'RESTORAN') return '0.5';
    if (isPkp) return '11';
    return '0.5';
  }, [vertical, isPkp]);

  const [mode, setMode] = useState<PricingStrategyMode>('MARKUP_PCT');
  const [percentageValue, setPercentageValue] = useState<string>('30');
  const [operationalCostPct, setOperationalCostPct] = useState<string>('10');
  const [extraFixedCost, setExtraFixedCost] = useState<string>('0');
  const [paymentFeePct, setPaymentFeePct] = useState<string>('0.7');
  const [taxRatePct, setTaxRatePct] = useState<string>(defaultTaxPct);
  const [roundingStep, setRoundingStep] = useState<0 | 100 | 500 | 1000>(500);
  const [showCostDetails, setShowCostDetails] = useState<boolean>(true);

  const result = useMemo(
    () =>
      simulateSellingPrice({
        costPrice,
        mode,
        percentageValue,
        manualSellingPrice: currentSellingPrice,
        operationalCostPct,
        extraFixedCost,
        paymentFeePct,
        taxRatePct,
        roundingStep,
      }),
    [
      costPrice,
      mode,
      percentageValue,
      currentSellingPrice,
      operationalCostPct,
      extraFixedCost,
      paymentFeePct,
      taxRatePct,
      roundingStep,
    ]
  );

  // Plan LITE Lock Notice (Calm, non-pushy)
  if (!isUnlocked) {
    return (
      <div
        data-testid="pricing-simulator-lite-lock"
        className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-stone-900">
              Simulasi Harga Jual &amp; Cek Anti-Rugi (Tersedia mulai Paket BASIC)
            </p>
            <p className="text-[11px] text-stone-600 leading-relaxed max-w-[60ch]">
              Hitung otomatis harga jual dari persentase modal beli (HPP), biaya operasional,
              potongan QRIS, dan pajak agar jualan tidak rugi. Tersedia di Paket BASIC ke atas.
            </p>
          </div>
        </div>
        {onUpgradePlan && (
          <button
            type="button"
            onClick={onUpgradePlan}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap shrink-0 transition-colors"
          >
            Lihat Paket BASIC
          </button>
        )}
      </div>
    );
  }

  const recommendedInt = new Decimal(result.recommendedSellingPrice || '0').toFixed(0);
  const netProfitNum = new Decimal(result.netProfitPerUnit || '0').toNumber();

  return (
    <div
      data-testid="selling-price-simulator"
      className="bg-stone-50 border border-stone-200 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-emerald-700 shrink-0" strokeWidth={1.75} />
          <div>
            <h4 className="text-xs font-bold text-stone-900">
              Simulasi Harga Jual &amp; Cek Untung Bersih (Anti-Rugi)
            </h4>
            <p className="text-[11px] text-stone-500">
              Uji dulu harga jual Anda agar biaya operasional, kemasan, potongan QRIS, dan pajak
              tidak bikin minus.
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="inline-flex items-center bg-stone-100 border border-stone-200 rounded-lg p-0.5 text-[11px] font-semibold">
          {(
            [
              { id: 'MARKUP_PCT', label: '% dari HPP' },
              { id: 'TARGET_NET_MARGIN_PCT', label: 'Target Untung Bersih %' },
              { id: 'MANUAL', label: 'Cek Harga Manual' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`pricing-sim-mode-${tab.id}`}
              onClick={() => setMode(tab.id)}
              className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                mode === tab.id
                  ? 'bg-white text-emerald-800 border border-stone-200'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Optional standalone HPP input */}
        {allowEditCostPrice && onCostPriceChange && (
          <div>
            <label
              htmlFor="sim-standalone-hpp"
              className="block text-[11px] font-semibold text-stone-700 mb-1"
            >
              Harga Beli / Modal Barang (HPP) per Unit (Rp)
            </label>
            <input
              id="sim-standalone-hpp"
              type="number"
              min="0"
              data-testid="pricing-sim-hpp-input"
              value={costPrice}
              onChange={(e) => onCostPriceChange(e.target.value)}
              placeholder="Contoh: 20000"
              className="w-full px-3 py-2 text-sm font-mono bg-white border border-stone-300 rounded-lg text-stone-900"
            />
          </div>
        )}

        {/* Primary Percentage Control (Markup or Target Net Margin) */}
        {mode !== 'MANUAL' ? (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label
                htmlFor="sim-pct-input"
                className="block text-[11px] font-semibold text-stone-700 mb-1"
              >
                {mode === 'MARKUP_PCT'
                  ? 'Persentase Kenaikan dari Harga Beli / HPP (%)'
                  : 'Target Untung Bersih yang Diinginkan (%)'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="sim-pct-input"
                  type="number"
                  min="0"
                  max="500"
                  step="0.5"
                  data-testid="pricing-sim-pct-input"
                  value={percentageValue}
                  onChange={(e) => setPercentageValue(e.target.value)}
                  className="w-28 px-3 py-1.5 text-sm font-mono bg-white border border-stone-300 rounded-lg text-stone-900"
                />
                <div className="flex flex-wrap items-center gap-1">
                  {PRESET_MARKUPS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPercentageValue(String(pct))}
                      className={`px-2 py-1 text-[11px] font-mono font-semibold rounded border transition-colors ${
                        percentageValue === String(pct)
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sm:col-span-6">
              <label
                htmlFor="sim-rounding-select"
                className="block text-[11px] font-semibold text-stone-700 mb-1"
              >
                Pembulatan Harga Ramah Pembeli
              </label>
              <select
                id="sim-rounding-select"
                value={roundingStep}
                onChange={(e) => setRoundingStep(Number(e.target.value) as 0 | 100 | 500 | 1000)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-stone-900"
              >
                <option value={0}>Pas sesuai hitungan (tanpa dibulatkan)</option>
                <option value={100}>Bulatkan ke atas kelipatan Rp100</option>
                <option value={500}>Bulatkan ke atas kelipatan Rp500 (Disarankan)</option>
                <option value={1000}>Bulatkan ke atas kelipatan Rp1.000</option>
              </select>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-600 bg-white border border-stone-200 rounded-lg px-3 py-2">
            Mode ini menguji <strong>Harga Jual</strong> yang Anda isi di kolom atas (
            <span className="font-mono font-semibold text-stone-900">
              {formatRupiah(currentSellingPrice || '0')}
            </span>
            ) terhadap seluruh biaya usaha di bawah.
          </p>
        )}

        {/* Cost Assumptions Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-stone-700">
              Perkiraan Biaya Usaha &amp; Pajak (Agar Untung Tidak Salah Hitung)
            </span>
            <button
              type="button"
              onClick={() => setShowCostDetails((v) => !v)}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
            >
              {showCostDetails ? 'Sembunyikan rincian biaya' : 'Ubah biaya operasional/pajak'}
            </button>
          </div>

          {showCostDetails && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label
                  htmlFor="sim-op-pct"
                  className="block text-[11px] text-stone-600 mb-1"
                >
                  Biaya Operasional (%)
                </label>
                <input
                  id="sim-op-pct"
                  type="number"
                  min="0"
                  max="70"
                  step="0.5"
                  data-testid="pricing-sim-op-pct"
                  value={operationalCostPct}
                  onChange={(e) => setOperationalCostPct(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-lg text-stone-900"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">Listrik, sewa, gaji</p>
              </div>

              <div>
                <label
                  htmlFor="sim-extra-fixed"
                  className="block text-[11px] text-stone-600 mb-1"
                >
                  Kemasan / Plastik (Rp)
                </label>
                <input
                  id="sim-extra-fixed"
                  type="number"
                  min="0"
                  step="100"
                  data-testid="pricing-sim-extra-fixed"
                  value={extraFixedCost}
                  onChange={(e) => setExtraFixedCost(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-lg text-stone-900"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">Biaya tetap per unit</p>
              </div>

              <div>
                <label
                  htmlFor="sim-pay-fee"
                  className="block text-[11px] text-stone-600 mb-1"
                >
                  Potongan QRIS / MDR (%)
                </label>
                <input
                  id="sim-pay-fee"
                  type="number"
                  min="0"
                  max="15"
                  step="0.1"
                  data-testid="pricing-sim-pay-fee"
                  value={paymentFeePct}
                  onChange={(e) => setPaymentFeePct(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-lg text-stone-900"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">0% jika tunai/pembeli</p>
              </div>

              <div>
                <label
                  htmlFor="sim-tax-pct"
                  className="block text-[11px] text-stone-600 mb-1"
                >
                  Perkiraan Pajak (%)
                </label>
                <input
                  id="sim-tax-pct"
                  type="number"
                  min="0"
                  max="25"
                  step="0.1"
                  data-testid="pricing-sim-tax-pct"
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-stone-200 rounded-lg text-stone-900"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">0.5% UMKM / 11% PKP</p>
              </div>
            </div>
          )}
        </div>

        {/* Result Box */}
        {result.errorMessage ? (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" strokeWidth={1.75} />
            <span>{result.errorMessage}</span>
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            {/* Health Banner */}
            <div
              data-testid="pricing-sim-health-banner"
              className={`px-4 py-2.5 border-b flex items-start gap-2 text-xs ${
                result.healthStatus === 'LOSS'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : result.healthStatus === 'THIN'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              {result.healthStatus === 'LOSS' ? (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" strokeWidth={1.75} />
              ) : result.healthStatus === 'THIN' ? (
                <AlertTriangle
                  className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
                  strokeWidth={1.75}
                />
              ) : (
                <CheckCircle2
                  className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5"
                  strokeWidth={1.75}
                />
              )}
              <div>
                <p className="font-bold">{result.healthLabel}</p>
                <p className="text-[11px] opacity-90 leading-relaxed">{result.healthAdvice}</p>
              </div>
            </div>

            {/* Primary Numbers Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-stone-200">
              <div className="p-3.5">
                <p className="text-[11px] text-stone-500">Harga Jual Hasil Simulasi</p>
                <p
                  data-testid="pricing-sim-recommended-price"
                  className="text-lg font-bold font-mono tabular-nums text-stone-900 mt-0.5"
                >
                  {formatRupiah(result.recommendedSellingPrice)}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Naik {result.effectiveMarkupPct}% dari modal beli
                </p>
              </div>

              <div className="p-3.5">
                <p className="text-[11px] text-stone-500">Batas Harga Impas (Minimal)</p>
                <p
                  data-testid="pricing-sim-bep-price"
                  className="text-lg font-bold font-mono tabular-nums text-stone-800 mt-0.5"
                >
                  {formatRupiah(result.breakEvenPrice)}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Jangan jual di bawah angka ini
                </p>
              </div>

              <div className="p-3.5">
                <p className="text-[11px] text-stone-500">Untung Bersih per Unit</p>
                <p
                  data-testid="pricing-sim-net-profit"
                  className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                    netProfitNum < 0
                      ? 'text-rose-700'
                      : result.healthStatus === 'THIN'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {formatRupiah(result.netProfitPerUnit)}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Margin bersih {result.netMarginPct}% dari harga jual
                </p>
              </div>
            </div>

            {/* Complete Transparent Cost Breakdown */}
            <div className="px-4 py-3 bg-stone-50/70 border-t border-stone-200 space-y-2 text-xs">
              <p className="text-[11px] font-semibold text-stone-700">
                Rincian Perhitungan Lengkap per 1 Unit
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                <div className="flex items-center justify-between text-stone-600">
                  <span>Modal Beli / HPP</span>
                  <span className="font-mono tabular-nums text-stone-900">
                    {formatRupiah(result.hppAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600">
                  <span>Kemasan / Biaya Tetap</span>
                  <span className="font-mono tabular-nums text-stone-900">
                    {formatRupiah(result.extraFixedCostAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600">
                  <span>Beban Operasional ({operationalCostPct || 0}%)</span>
                  <span className="font-mono tabular-nums text-stone-900">
                    {formatRupiah(result.operationalAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600">
                  <span>Potongan QRIS / Non-Tunai ({paymentFeePct || 0}%)</span>
                  <span className="font-mono tabular-nums text-stone-900">
                    {formatRupiah(result.paymentFeeAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600">
                  <span>Perkiraan Pajak ({taxRatePct || 0}%)</span>
                  <span className="font-mono tabular-nums text-stone-900">
                    {formatRupiah(result.taxAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between font-semibold text-stone-900">
                  <span>Total Semua Biaya per Unit</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(result.totalCostPerUnit)}
                  </span>
                </div>
              </div>

              {/* Monthly Profit Projection */}
              {result.canCalculate && result.monthlyProjections.length > 0 && (
                <div className="pt-2 mt-2 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600">
                  <span>Perkiraan untung bersih jika laku per bulan:</span>
                  <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                    {result.monthlyProjections.map((proj) => (
                      <span key={proj.unitsPerMonth}>
                        {proj.unitsPerMonth} pcs:{' '}
                        <strong
                          className={
                            new Decimal(proj.estimatedNetProfit).lt(0)
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }
                        >
                          {formatRupiah(proj.estimatedNetProfit)}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            {mode !== 'MANUAL' && result.canCalculate && (
              <div className="px-4 py-3 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-stone-500">
                  Cocok dengan hasil hitungan di atas? Klik untuk langsung mengisi kolom Harga Jual.
                </p>
                <button
                  type="button"
                  data-testid="pricing-sim-apply-btn"
                  onClick={() => onApplySellingPrice(recommendedInt)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Pakai Harga {formatRupiah(recommendedInt)}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
