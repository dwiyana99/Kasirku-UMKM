import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  canUsePricingSimulator,
  computeSimpleMarginPrice,
  simulateSellingPrice,
} from './pricing-simulator';

test('Pricing simulator plan gating: locked on LITE unless ADDON_PRICING_SIMULATOR active, unlocked on BASIC/PRO/EXPERT', () => {
  assert.equal(canUsePricingSimulator('LITE'), false);
  assert.equal(canUsePricingSimulator('LITE', []), false);
  assert.equal(canUsePricingSimulator('LITE', ['ADDON_PRICING_SIMULATOR']), true);
  assert.equal(canUsePricingSimulator('BASIC'), true);
  assert.equal(canUsePricingSimulator('PRO'), true);
  assert.equal(canUsePricingSimulator('EXPERT'), true);
});

test('LITE simple margin price recommendation computes exact HPP + Margin % with optional rounding', () => {
  const exact = computeSimpleMarginPrice(10000, 20, 0);
  assert.equal(new Decimal(exact.recommendedPrice).toNumber(), 12000);
  assert.equal(new Decimal(exact.estimatedProfitPerUnit).toNumber(), 2000);

  const rounded = computeSimpleMarginPrice(12300, 15, 500);
  // 12300 * 1.15 = 14145 -> ceil to 500 = 14500
  assert.equal(new Decimal(rounded.recommendedPrice).toNumber(), 14500);
  assert.equal(new Decimal(rounded.estimatedProfitPerUnit).toNumber(), 2200);
});

test('Markup mode detects hidden loss when markup % is lower than operational + tax + MDR costs', () => {
  // HPP Rp10.000, Markup 10% -> Price Rp11.000
  // Operational 12% + QRIS 0.7% + Tax 0.5% = 13.2% of Rp11.000 = Rp1.452
  // Total cost = Rp11.452 -> Net profit = -Rp452 (LOSS!)
  const res = simulateSellingPrice({
    costPrice: 10000,
    mode: 'MARKUP_PCT',
    percentageValue: 10,
    operationalCostPct: 12,
    paymentFeePct: 0.7,
    taxRatePct: 0.5,
    roundingStep: 0,
  });

  assert.equal(res.canCalculate, true);
  assert.equal(new Decimal(res.recommendedSellingPrice).toNumber(), 11000);
  assert.equal(res.healthStatus, 'LOSS');
  assert.ok(new Decimal(res.netProfitPerUnit).lt(0));
  // BEP = 10000 / (1 - 0.132) = 11520.73 -> ceil 11521
  assert.equal(new Decimal(res.breakEvenPrice).toNumber(), 11521);
});

test('Target Net Margin mode computes exact safe selling price above BEP with rounding', () => {
  // HPP Rp20.000 + kemasan Rp500 = Rp20.500
  // Operational 10% + QRIS 0.7% + Tax 0.5% = 11.2%
  // Target net margin = 20% -> denominator = 1 - 0.312 = 0.688
  // Raw price = 20500 / 0.688 = 29796.51 -> rounded to Rp500 = Rp30.000
  const res = simulateSellingPrice({
    costPrice: 20000,
    extraFixedCost: 500,
    mode: 'TARGET_NET_MARGIN_PCT',
    percentageValue: 20,
    operationalCostPct: 10,
    paymentFeePct: 0.7,
    taxRatePct: 0.5,
    roundingStep: 500,
  });

  assert.equal(res.canCalculate, true);
  assert.equal(new Decimal(res.recommendedSellingPrice).toNumber(), 30000);
  assert.equal(res.healthStatus, 'HEALTHY');
  assert.ok(new Decimal(res.netMarginPct).gte(20));
  assert.equal(res.monthlyProjections.length, 3);
  assert.equal(res.monthlyProjections[2].unitsPerMonth, 100);
});

test('Manual selling price mode flags THIN margin when net profit is between 0% and 5%', () => {
  const res = simulateSellingPrice({
    costPrice: 10000,
    mode: 'MANUAL',
    manualSellingPrice: 11500,
    operationalCostPct: 10,
    paymentFeePct: 0,
    taxRatePct: 0.5,
  });

  assert.equal(res.healthStatus, 'THIN');
  assert.ok(new Decimal(res.netProfitPerUnit).gt(0));
  assert.ok(new Decimal(res.netMarginPct).lt(5));
});
