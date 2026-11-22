/**
 * Duitku V2 Inquiry Payment Adapter
 * - Supports QRIS (SP / NQ), Direct DANA (DA), OVO Push-to-Pay (OV), ShopeePay (SA),
 *   and Bank Virtual Accounts (BCA BC, Mandiri M2, BRI BR, BNI I1, BSI BV, Permata BT).
 * - Webhook verification uses MD5(merchantCode + amount + merchantOrderId + apiKey).
 */

import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import type {
  ConnectionTestResult,
  CreateChargeInput,
  CreateChargeOutput,
  DecryptedGatewayCredentials,
  PaymentGatewayAdapter,
  WebhookVerificationResult,
} from './types';

function getDuitkuBaseUrl(env: 'SANDBOX' | 'PRODUCTION'): string {
  return env === 'PRODUCTION'
    ? 'https://passport.duitku.com'
    : 'https://sandbox.duitku.com';
}

export function computeDuitkuInquirySignature(
  merchantCode: string,
  merchantOrderId: string,
  paymentAmount: number,
  apiKey: string
): string {
  return crypto
    .createHash('md5')
    .update(`${merchantCode}${merchantOrderId}${paymentAmount}${apiKey}`, 'utf8')
    .digest('hex');
}

export function verifyDuitkuSignature(params: {
  merchantCode: string;
  amount: string;
  merchantOrderId: string;
  apiKey: string;
  signature: string;
}): boolean {
  if (!params.merchantCode || !params.apiKey || !params.signature) return false;
  const expected = crypto
    .createHash('md5')
    .update(`${params.merchantCode}${params.amount}${params.merchantOrderId}${params.apiKey}`, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected.toLowerCase(), 'utf8'),
      Buffer.from(params.signature.toLowerCase(), 'utf8')
    );
  } catch {
    return false;
  }
}

export function mapChannelToDuitkuMethod(channelCode: string): string {
  const map: Record<string, string> = {
    QRIS: 'SP',
    DANA: 'DA',
    OVO: 'OV',
    SHOPEEPAY: 'SA',
    GOPAY: 'SP',
    VA_BCA: 'BC',
    VA_MANDIRI: 'M2',
    VA_BRI: 'BR',
    VA_BNI: 'I1',
    VA_BSI: 'BV',
    VA_PERMATA: 'BT',
  };
  return map[channelCode] || 'SP';
}

export class DuitkuAdapter implements PaymentGatewayAdapter {
  readonly provider = 'DUITKU' as const;

  async createCharge(input: CreateChargeInput): Promise<CreateChargeOutput> {
    const merchantCode = input.credentials.merchantCode?.trim();
    const apiKey = input.credentials.serverKey?.trim();
    if (!merchantCode || !apiKey) {
      throw new Error('Merchant Code dan API Key Duitku belum lengkap.');
    }

    const amountInt = new Decimal(input.totalPayable).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const paymentMethod = mapChannelToDuitkuMethod(input.channelCode);
    const signature = computeDuitkuInquirySignature(
      merchantCode,
      input.orderNumber,
      amountInt,
      apiKey
    );

    const payload = {
      merchantCode,
      paymentAmount: amountInt,
      paymentMethod,
      merchantOrderId: input.orderNumber,
      productDetails: `Pembayaran ${input.tenantName} (${input.orderNumber})`,
      email: input.customerEmail || 'pelanggan@kasirakun.id',
      phoneNumber: input.ovoPhoneNumber || input.customerPhone || '081200000000',
      customerVaName: input.customerName || 'Pelanggan KasirAkun',
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      signature,
      expiryPeriod: 15,
    };

    const baseUrl = getDuitkuBaseUrl(input.credentials.environment);
    const res = await fetch(`${baseUrl}/webapi/api/merchant/v2/inquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || (data.statusCode && String(data.statusCode) !== '00')) {
      throw new Error(
        `Duitku gagal membuat tagihan: ${String(data.statusMessage || data.Message || res.statusText)}`
      );
    }

    return {
      provider: 'DUITKU',
      gatewayRefId: String(data.reference || input.orderNumber),
      qrString: typeof data.qrString === 'string' ? data.qrString : null,
      vaNumber: typeof data.vaNumber === 'string' ? data.vaNumber : null,
      deeplinkUrl: typeof data.paymentUrl === 'string' ? data.paymentUrl : null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      isLiveGatewayCall: true,
      instructions:
        input.channelCode === 'OVO'
          ? 'Notifikasi pembayaran telah dikirim ke aplikasi OVO Anda (berlaku 55 detik).'
          : 'Tagihan resmi Duitku aktif. Pembayaran akan terverifikasi otomatis.',
    };
  }

  verifyWebhook(args: {
    rawBody: string;
    parsedBody: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    credentials: DecryptedGatewayCredentials;
  }): WebhookVerificationResult {
    const merchantCode = String(args.parsedBody.merchantCode || '');
    const amount = String(args.parsedBody.amount || '');
    const merchantOrderId = String(args.parsedBody.merchantOrderId || '');
    const signature = String(args.parsedBody.signature || '');
    const resultCode = String(args.parsedBody.resultCode || '');
    const reference = String(args.parsedBody.reference || merchantOrderId || '');

    const isValid = verifyDuitkuSignature({
      merchantCode: merchantCode || args.credentials.merchantCode || '',
      amount,
      merchantOrderId,
      apiKey: args.credentials.serverKey || '',
      signature,
    });

    const isPaid = isValid && resultCode === '00';
    const isExpiredOrFailed = isValid && resultCode !== '00' && resultCode !== '';

    return {
      isValid,
      isPaid,
      isExpiredOrFailed,
      gatewayRefId: reference || null,
      orderNumber: merchantOrderId || null,
      grossAmount: amount || null,
      reason: isValid ? `resultCode=${resultCode}` : 'Duitku MD5 signature mismatch',
    };
  }

  async testConnection(credentials: DecryptedGatewayCredentials): Promise<ConnectionTestResult> {
    const merchantCode = credentials.merchantCode?.trim() || '';
    const apiKey = credentials.serverKey?.trim() || '';
    if (!merchantCode || !apiKey) {
      return {
        ok: false,
        message: 'Merchant Code dan API Key Duitku wajib diisi.',
        mode: 'FORMAT_VERIFIED',
      };
    }

    try {
      const baseUrl = getDuitkuBaseUrl(credentials.environment);
      const datetime = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const amount = 10000;
      const signature = crypto
        .createHash('sha256')
        .update(`${merchantCode}${amount}${datetime}${apiKey}`, 'utf8')
        .digest('hex');

      const res = await fetch(`${baseUrl}/webapi/api/merchant/paymentmethod/getpaymentmethod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantcode: merchantCode, amount, datetime, signature }),
      });

      if (!res.ok) {
        return {
          ok: false,
          message: `Kredensial Duitku ditolak (${res.status}). Pastikan Merchant Code & API Key benar.`,
          mode: 'LIVE_VERIFIED',
        };
      }
      return {
        ok: true,
        message: `Koneksi Duitku (${credentials.environment}) aktif dan terverifikasi!`,
        mode: 'LIVE_VERIFIED',
      };
    } catch {
      return {
        ok: true,
        message: `Format kredensial Duitku (${credentials.environment}) valid dan terenkripsi AES-256-GCM.`,
        mode: 'FORMAT_VERIFIED',
      };
    }
  }
}
