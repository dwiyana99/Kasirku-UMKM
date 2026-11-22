import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import {
  encryptSecret,
  decryptSecret,
  maskSecretKey,
} from './crypto';
import {
  getPaymentAdapter,
  signSimulatorWebhook,
} from './adapters';
import {
  computePaymentBreakdown,
  buildGatewayPaymentJournalLines,
  buildSettlementBatchJournalLines,
} from './fee-calculator';
import {
  DEFAULT_WA_MESSAGE_TEMPLATES,
  renderWaTemplate,
  normalizeWaPhone,
  buildWaMeUrl,
} from './wa-templates';
import {
  calculateHybridPricing,
  getHybridPlan,
  tenantHasAddOn,
} from '../saas/hybrid-pricing';

// =============================================================================
// 1. AES-256-GCM ENCRYPTION & MASKING
// =============================================================================
test('AES-256-GCM encryptSecret / decryptSecret round-trip and random IV', () => {
  const secret = 'SB-Mid-server-AbCdEf123456789a2b';
  const enc1 = encryptSecret(secret);
  const enc2 = encryptSecret(secret);

  assert.notEqual(enc1, secret);
  assert.notEqual(enc1, enc2, 'Each encryption must use a fresh random IV');
  assert.equal(decryptSecret(enc1), secret);
  assert.equal(decryptSecret(enc2), secret);
});

test('maskSecretKey hides middle secret material safely', () => {
  const masked = maskSecretKey('SB-Mid-server-AbCdEf123456789a2b');
  assert.ok(masked && masked.includes('****'));
  assert.ok(masked && masked.endsWith('9a2b'));
  assert.ok(masked && !masked.includes('AbCdEf123456'));
  assert.equal(maskSecretKey(''), null);
});

test('decryptSecret rejects tampered ciphertext / auth tag', () => {
  const enc = encryptSecret('DEV-Tripay-Secret-9988');
  const parts = enc.split(':');
  parts[2] = parts[2].slice(0, -4) + 'ffff';
  assert.throws(() => decryptSecret(parts.join(':')));
});

// =============================================================================
// 2. PAYMENT GATEWAY SIGNATURE VERIFICATION (MIDTRANS, DUITKU, TRIPAY, SIMULATOR)
// =============================================================================
test('Midtrans SHA-512 webhook signature accepts valid payload and rejects tampered gross_amount', () => {
  const midtrans = getPaymentAdapter('MIDTRANS');
  const serverKey = 'SB-Mid-server-TESTKEY99';
  const orderId = 'ORD-2026-001';
  const statusCode = '200';
  const grossAmount = '50000.00';
  const sig = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

  const valid = midtrans.verifyWebhook({
    headers: {},
    parsedBody: {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: grossAmount,
      signature_key: sig,
      transaction_status: 'settlement',
      transaction_id: 'mid-tx-123',
    },
    rawBody: '',
    credentials: { serverKey, environment: 'SANDBOX' },
  });
  assert.equal(valid.isValid, true);
  assert.equal(valid.isPaid, true);
  assert.equal(valid.orderNumber, orderId);

  const tampered = midtrans.verifyWebhook({
    headers: {},
    parsedBody: {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: '1000.00',
      signature_key: sig,
      transaction_status: 'settlement',
    },
    rawBody: '',
    credentials: { serverKey, environment: 'SANDBOX' },
  });
  assert.equal(tampered.isValid, false);
});

test('Duitku MD5 callback signature accepts valid payload and rejects tampered amount', () => {
  const duitku = getPaymentAdapter('DUITKU');
  const merchantCode = 'DS12345';
  const apiKey = 'DUITKU-SECRET-APIKEY';
  const merchantOrderId = 'INV-DK-002';
  const amount = '75000';
  const sig = crypto
    .createHash('md5')
    .update(`${merchantCode}${amount}${merchantOrderId}${apiKey}`)
    .digest('hex');

  const valid = duitku.verifyWebhook({
    headers: {},
    parsedBody: {
      merchantCode,
      amount,
      merchantOrderId,
      resultCode: '00',
      signature: sig,
      reference: 'DK-REF-001',
    },
    rawBody: '',
    credentials: { merchantCode, serverKey: apiKey, environment: 'SANDBOX' },
  });
  assert.equal(valid.isValid, true);
  assert.equal(valid.isPaid, true);

  const tampered = duitku.verifyWebhook({
    headers: {},
    parsedBody: {
      merchantCode,
      amount: '75001',
      merchantOrderId,
      resultCode: '00',
      signature: sig,
    },
    rawBody: '',
    credentials: { merchantCode, serverKey: apiKey, environment: 'SANDBOX' },
  });
  assert.equal(tampered.isValid, false);
});

test('Tripay HMAC-SHA256 webhook signature validates exact rawBody and rejects tampering', () => {
  const tripay = getPaymentAdapter('TRIPAY');
  const privateKey = 'tripay-private-key-abc';
  const payloadObj = {
    merchant_ref: 'INV-TP-003',
    reference: 'T000100001',
    status: 'PAID',
    total_amount: 120000,
    amount_received: 119160,
  };
  const rawBody = JSON.stringify(payloadObj);
  const sig = crypto.createHmac('sha256', privateKey).update(rawBody).digest('hex');

  const valid = tripay.verifyWebhook({
    headers: { 'x-callback-signature': sig },
    parsedBody: payloadObj,
    rawBody,
    credentials: { privateKey, environment: 'SANDBOX' },
  });
  assert.equal(valid.isValid, true);
  assert.equal(valid.isPaid, true);

  const tamperedBody = { ...payloadObj, total_amount: 100 };
  const tampered = tripay.verifyWebhook({
    headers: { 'x-callback-signature': sig },
    parsedBody: tamperedBody,
    rawBody: JSON.stringify(tamperedBody),
    credentials: { privateKey, environment: 'SANDBOX' },
  });
  assert.equal(tampered.isValid, false);
});

test('Simulator creates valid EMVCo QRIS + GoPay deeplink and verifies HMAC webhook', async () => {
  const simulator = getPaymentAdapter('SIMULATOR');

  const qrisRes = await simulator.createCharge({
    tenantId: 'tenant-1',
    tenantName: 'Warung Makmur',
    orderNumber: 'POS-101',
    paymentCategory: 'QRIS_DYNAMIC',
    channelCode: 'QRIS',
    checkoutMode: 'COUNTER_SCREEN',
    totalPayable: '45000.0000',
    customerName: 'Pelanggan Umum',
    callbackUrl: 'http://localhost:3000/api/webhooks/payment/simulator/tenant-1',
    returnUrl: 'http://localhost:3000',
    credentials: { environment: 'SANDBOX' },
  });
  assert.ok(qrisRes.qrString?.startsWith('000201010212'));
  assert.match(qrisRes.qrString ?? '', /6304[0-9A-F]{4}$/);

  const gopayRes = await simulator.createCharge({
    tenantId: 'tenant-1',
    tenantName: 'Resto Rasa Bali',
    orderNumber: 'POS-102',
    paymentCategory: 'EWALLET_DIRECT',
    channelCode: 'GOPAY',
    checkoutMode: 'MOBILE_SELF_ORDER',
    totalPayable: '60000.0000',
    customerName: 'Meja 03',
    callbackUrl: 'http://localhost:3000/api/webhooks/payment/simulator/tenant-1',
    returnUrl: 'http://localhost:3000/order/resto/meja3/status/ord-1',
    credentials: { environment: 'SANDBOX' },
  });
  assert.ok(
    gopayRes.deeplinkUrl?.includes('gojek://') || gopayRes.deeplinkUrl?.includes('gopay'),
    `Expected GoPay deeplink, got ${gopayRes.deeplinkUrl}`
  );

  const payload = {
    order_id: 'POS-101',
    gateway_ref_id: qrisRes.gatewayRefId,
    gross_amount: '45000.0000',
    status: 'PAID',
  };
  const rawBody = JSON.stringify(payload);
  const sig = signSimulatorWebhook(rawBody);

  const verified = simulator.verifyWebhook({
    headers: { 'x-simulator-signature': sig },
    parsedBody: payload,
    rawBody,
    credentials: { environment: 'SANDBOX' },
  });
  assert.equal(verified.isValid, true);
  assert.equal(verified.isPaid, true);

  const badSig = simulator.verifyWebhook({
    headers: { 'x-simulator-signature': 'deadbeef' },
    parsedBody: payload,
    rawBody,
    credentials: { environment: 'SANDBOX' },
  });
  assert.equal(badSig.isValid, false);
});

// =============================================================================
// 3. ANTI-TAX-INFLATION DOUBLE-ENTRY & DECIMAL-SAFE FEE BREAKDOWN
// =============================================================================
test('CUSTOMER feeBearer separates 2109 Titipan Biaya Admin PG so 4101 Omzet is never inflated', () => {
  const breakdown = computePaymentBreakdown({
    baseAmount: '110000',
    paymentCategory: 'VIRTUAL_ACCOUNT',
    feeBearer: 'CUSTOMER',
    vaFlatFee: '4250.0000',
  });
  assert.equal(new Decimal(breakdown.gatewayMdrFee).toFixed(0), '4250');
  assert.equal(new Decimal(breakdown.customerAdminFee).toFixed(0), '4250');
  assert.equal(new Decimal(breakdown.totalPayable).toFixed(0), '114250');
  assert.equal(new Decimal(breakdown.netSettlementAmount).toFixed(0), '110000');

  const journal = buildGatewayPaymentJournalLines({
    orderNumber: 'ORD-VA-101',
    subtotal: '100000.0000',
    taxAmount: '10000.0000',
    taxAccountCode: '2103',
    taxAccountName: 'Utang Pajak Daerah PB1 10%',
    customerAdminFee: breakdown.customerAdminFee,
    gatewayMdrFee: breakdown.gatewayMdrFee,
    totalPayable: breakdown.totalPayable,
    feeBearer: 'CUSTOMER',
    paymentCategory: 'VIRTUAL_ACCOUNT',
    totalCogs: '40000.0000',
  });

  assert.equal(journal.isBalanced, true);
  assert.equal(journal.totalDebit, journal.totalCredit);

  const revenueLine = journal.lines.find((l) => l.accountCode === '4101');
  const titipanLine = journal.lines.find((l) => l.accountCode === '2109');
  assert.equal(new Decimal(revenueLine!.credit).toFixed(0), '100000', '4101 Omzet must stay Rp100.000');
  assert.equal(new Decimal(titipanLine!.credit).toFixed(0), '4250', '2109 holds customer PG admin fee');
});

test('MERCHANT feeBearer posts 6105 Beban MDR PG and 1103 net receivables accurately', () => {
  const breakdown = computePaymentBreakdown({
    baseAmount: '100000',
    paymentCategory: 'QRIS_DYNAMIC',
    feeBearer: 'MERCHANT',
    qrisMdrPercent: '0.0070',
  });
  // QRIS MDR 0.7% of 100,000 = 700
  assert.equal(new Decimal(breakdown.gatewayMdrFee).toFixed(0), '700');
  assert.equal(new Decimal(breakdown.customerAdminFee).toFixed(0), '0');
  assert.equal(new Decimal(breakdown.totalPayable).toFixed(0), '100000');
  assert.equal(new Decimal(breakdown.netSettlementAmount).toFixed(0), '99300');

  const journal = buildGatewayPaymentJournalLines({
    orderNumber: 'ORD-QRIS-202',
    subtotal: '100000.0000',
    taxAmount: '0.0000',
    customerAdminFee: breakdown.customerAdminFee,
    gatewayMdrFee: breakdown.gatewayMdrFee,
    totalPayable: breakdown.totalPayable,
    feeBearer: 'MERCHANT',
    paymentCategory: 'QRIS_DYNAMIC',
    totalCogs: '60000.0000',
  });

  assert.equal(journal.isBalanced, true);
  const pgBalance = journal.lines.find((l) => l.accountCode === '1103');
  const pgFeeExpense = journal.lines.find((l) => l.accountCode === '6105');
  assert.equal(new Decimal(pgBalance!.debit).toFixed(0), '99300');
  assert.equal(new Decimal(pgFeeExpense!.debit).toFixed(0), '700');
});

test('H+1 Settlement batch journal transfers 1103 Saldo Payment Gateway to 1102 Bank', () => {
  const journal = buildSettlementBatchJournalLines({
    provider: 'MIDTRANS',
    settlementDate: '2026-11-20',
    totalNetReceived: '2500000.0000',
    destinationBankAccountName: 'Bank BCA Operasional',
  });
  assert.equal(journal.isBalanced, true);
  assert.equal(journal.lines[0].accountCode, '1102');
  assert.equal(journal.lines[1].accountCode, '1103');
  assert.equal(journal.totalDebit, '2500000.0000');
});

// =============================================================================
// 4. CUSTOM WA TEMPLATES & WA.ME URL BUILDER
// =============================================================================
test('Default WA templates include 4 Indonesian presets and anti-OTP/PIN safety notice', () => {
  assert.equal(DEFAULT_WA_MESSAGE_TEMPLATES.length, 4);
  const combined = DEFAULT_WA_MESSAGE_TEMPLATES.map((t) => t.bodyTemplate).join('\n');
  assert.ok(combined.includes('OTP') && combined.includes('PIN'));
});

test('renderWaTemplate replaces placeholders and buildWaMeUrl formats Indonesian phone', () => {
  const rendered = renderWaTemplate(
    'Halo {{nama_pemilik}} dari {{nama_usaha}}, akun {{provider}} siap: {{link_daftar_provider}}',
    {
      nama_pemilik: 'Pak Budi',
      nama_usaha: 'Warung Makmur',
      provider: 'Midtrans',
      link_daftar_provider: 'https://dashboard.midtrans.com/register',
    }
  );
  assert.equal(
    rendered,
    'Halo Pak Budi dari Warung Makmur, akun Midtrans siap: https://dashboard.midtrans.com/register'
  );
  assert.equal(normalizeWaPhone('0812-3456-7890'), '6281234567890');
  const url = buildWaMeUrl('0812-3456-7890', rendered);
  assert.ok(url.startsWith('https://wa.me/6281234567890?text='));
});

// =============================================================================
// 5. PAKET LITE (Rp49.000/bln) + MODULAR ADD-ONS (PO, STRUK, NON-TUNAI)
// =============================================================================
test('Paket LITE costs Rp49.000/bln with 0 included add-ons and gates Non-Cash, Thermal, PO', () => {
  const lite = getHybridPlan('LITE');
  assert.equal(lite.monthlyPrice, '49000.0000');
  assert.equal(lite.includedAddOns.length, 0);

  const liteTenant = { subscriptionPlan: 'LITE' as const, activeAddOns: [] };
  assert.equal(tenantHasAddOn(liteTenant, 'ADDON_NON_CASH_PAYMENT'), false);
  assert.equal(tenantHasAddOn(liteTenant, 'ADDON_THERMAL_RECEIPT'), false);
  assert.equal(tenantHasAddOn(liteTenant, 'ADDON_PURCHASE_ORDER'), false);

  const liteWithQris = {
    subscriptionPlan: 'LITE' as const,
    activeAddOns: ['ADDON_NON_CASH_PAYMENT' as const],
  };
  assert.equal(tenantHasAddOn(liteWithQris, 'ADDON_NON_CASH_PAYMENT'), true);
  assert.equal(tenantHasAddOn(liteWithQris, 'ADDON_PURCHASE_ORDER'), false);

  const basicTenant = { subscriptionPlan: 'BASIC' as const, activeAddOns: [] };
  assert.equal(tenantHasAddOn(basicTenant, 'ADDON_NON_CASH_PAYMENT'), true);
  assert.equal(tenantHasAddOn(basicTenant, 'ADDON_THERMAL_RECEIPT'), true);
  assert.equal(tenantHasAddOn(basicTenant, 'ADDON_PURCHASE_ORDER'), false);

  const proTenant = { subscriptionPlan: 'PRO' as const, activeAddOns: [] };
  assert.equal(tenantHasAddOn(proTenant, 'ADDON_PURCHASE_ORDER'), true);
});

test('Paket LITE with 3 modular add-ons triggers smart upsell to Paket BASIC', () => {
  const pricing = calculateHybridPricing({
    planCode: 'LITE',
    selectedAddOns: [
      'ADDON_NON_CASH_PAYMENT', // 25k
      'ADDON_THERMAL_RECEIPT', // 15k
      'ADDON_PURCHASE_ORDER', // 20k
    ],
    billingCycle: 'MONTHLY',
  });
  // 49k + 60k = 109k > 100k BASIC
  assert.equal(new Decimal(pricing.effectiveMonthlySubtotal).toFixed(0), '109000');
  assert.ok(pricing.smartUpsellRecommendation?.includes('BASIC'));
});
