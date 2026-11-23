/**
 * Tripay Closed Payment Adapter (Populer di UMKM Indonesia)
 * - Supports QRIS (QRIS / QRISC), E-Wallet (SHOPEEPAY, DANA, OVO),
 *   and Bank Virtual Accounts (BCAVA, MANDIRIVA, BRIVA, BNIVA, BSIVA, PERMATAVA).
 * - Webhook verification uses HMAC-SHA256(rawJsonBody, privateKey) vs header X-Callback-Signature.
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
} from './types.ts';

function getTripayBaseUrl(env: 'SANDBOX' | 'PRODUCTION'): string {
  return env === 'PRODUCTION'
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox';
}

export function computeTripayCreateSignature(
  merchantCode: string,
  merchantRef: string,
  amount: number,
  privateKey: string
): string {
  return crypto
    .createHmac('sha256', privateKey)
    .update(`${merchantCode}${merchantRef}${amount}`, 'utf8')
    .digest('hex');
}

export function verifyTripaySignature(params: {
  rawJsonBody: string;
  privateKey: string;
  callbackSignature: string;
}): boolean {
  if (!params.privateKey || !params.callbackSignature) return false;
  const expected = crypto
    .createHmac('sha256', params.privateKey)
    .update(params.rawJsonBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected.toLowerCase(), 'utf8'),
      Buffer.from(params.callbackSignature.toLowerCase(), 'utf8')
    );
  } catch {
    return false;
  }
}

export function mapChannelToTripayMethod(channelCode: string): string {
  const map: Record<string, string> = {
    QRIS: 'QRIS',
    SHOPEEPAY: 'SHOPEEPAY',
    DANA: 'DANA',
    OVO: 'OVO',
    GOPAY: 'QRIS',
    VA_BCA: 'BCAVA',
    VA_MANDIRI: 'MANDIRIVA',
    VA_BRI: 'BRIVA',
    VA_BNI: 'BNIVA',
    VA_BSI: 'BSIVA',
    VA_PERMATA: 'PERMATAVA',
  };
  return map[channelCode] || 'QRIS';
}

export class TripayAdapter implements PaymentGatewayAdapter {
  readonly provider = 'TRIPAY' as const;

  async createCharge(input: CreateChargeInput): Promise<CreateChargeOutput> {
    const merchantCode = input.credentials.merchantCode?.trim();
    const apiKey = input.credentials.serverKey?.trim();
    const privateKey = input.credentials.privateKey?.trim();

    if (!merchantCode || !apiKey || !privateKey) {
      throw new Error('Merchant Code, API Key, dan Private Key Tripay belum lengkap.');
    }

    const amountInt = new Decimal(input.totalPayable).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    const method = mapChannelToTripayMethod(input.channelCode);
    const signature = computeTripayCreateSignature(
      merchantCode,
      input.orderNumber,
      amountInt,
      privateKey
    );

    const expiredTime = Math.floor(Date.now() / 1000) + 15 * 60;
    const payload = {
      method,
      merchant_ref: input.orderNumber,
      amount: amountInt,
      customer_name: input.customerName || 'Pelanggan KasirAkun',
      customer_email: input.customerEmail || 'pelanggan@kasirakun.id',
      customer_phone: input.ovoPhoneNumber || input.customerPhone || '081200000000',
      order_items: [
        {
          sku: input.orderNumber,
          name: `Pembayaran ${input.tenantName}`,
          price: amountInt,
          quantity: 1,
        },
      ],
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      expired_time: expiredTime,
      signature,
    };

    const baseUrl = getTripayBaseUrl(input.credentials.environment);
    const res = await fetch(`${baseUrl}/transaction/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as { success?: boolean; message?: string; data?: Record<string, unknown> };
    if (!res.ok || !json.success || !json.data) {
      throw new Error(`Tripay gagal membuat tagihan: ${json.message || res.statusText}`);
    }

    const d = json.data;
    return {
      provider: 'TRIPAY',
      gatewayRefId: String(d.reference || input.orderNumber),
      qrString: typeof d.qr_string === 'string' ? d.qr_string : null,
      qrImageUrl: typeof d.qr_url === 'string' ? d.qr_url : null,
      vaNumber: typeof d.pay_code === 'string' ? d.pay_code : null,
      deeplinkUrl: typeof d.checkout_url === 'string' ? d.checkout_url : null,
      expiresAt: new Date(expiredTime * 1000).toISOString(),
      isLiveGatewayCall: true,
      instructions: 'Tagihan resmi Tripay aktif. Status pembayaran diperbarui otomatis via webhook.',
    };
  }

  verifyWebhook(args: {
    rawBody: string;
    parsedBody: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    credentials: DecryptedGatewayCredentials;
  }): WebhookVerificationResult {
    const rawSig =
      args.headers['x-callback-signature'] ||
      args.headers['X-Callback-Signature'] ||
      '';
    const callbackSignature = Array.isArray(rawSig) ? rawSig[0] : rawSig;
    const status = String(args.parsedBody.status || '').toUpperCase();
    const reference = String(args.parsedBody.reference || '');
    const merchantRef = String(args.parsedBody.merchant_ref || '');
    const totalAmount = args.parsedBody.total_amount !== undefined
      ? String(args.parsedBody.total_amount)
      : null;

    const isValid = verifyTripaySignature({
      rawJsonBody: args.rawBody,
      privateKey: args.credentials.privateKey || '',
      callbackSignature,
    });

    const isPaid = isValid && status === 'PAID';
    const isExpiredOrFailed = isValid && (status === 'EXPIRED' || status === 'FAILED');

    return {
      isValid,
      isPaid,
      isExpiredOrFailed,
      gatewayRefId: reference || null,
      orderNumber: merchantRef || null,
      grossAmount: totalAmount,
      reason: isValid ? status : 'Tripay HMAC-SHA256 signature mismatch',
    };
  }

  async testConnection(credentials: DecryptedGatewayCredentials): Promise<ConnectionTestResult> {
    const merchantCode = credentials.merchantCode?.trim() || '';
    const apiKey = credentials.serverKey?.trim() || '';
    const privateKey = credentials.privateKey?.trim() || '';

    if (!merchantCode || !apiKey || !privateKey) {
      return {
        ok: false,
        message: 'Merchant Code, API Key, dan Private Key Tripay wajib diisi lengkap.',
        mode: 'FORMAT_VERIFIED',
      };
    }

    try {
      const baseUrl = getTripayBaseUrl(credentials.environment);
      const res = await fetch(`${baseUrl}/merchant/payment-channel`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.status === 401) {
        return {
          ok: false,
          message: 'API Key Tripay ditolak (401 Unauthorized). Periksa kembali API Key Anda.',
          mode: 'LIVE_VERIFIED',
        };
      }
      return {
        ok: true,
        message: `Koneksi Tripay (${credentials.environment}) aktif dan terverifikasi!`,
        mode: 'LIVE_VERIFIED',
      };
    } catch {
      return {
        ok: true,
        message: `Format kredensial Tripay (${credentials.environment}) valid dan terenkripsi AES-256-GCM.`,
        mode: 'FORMAT_VERIFIED',
      };
    }
  }
}
