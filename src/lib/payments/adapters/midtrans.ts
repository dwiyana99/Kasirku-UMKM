/**
 * Midtrans Core API Payment Adapter
 * - Supports Dynamic QRIS (qris), Direct GoPay App-to-App (gopay), ShopeePay (shopeepay),
 *   and Bank Virtual Accounts (BCA, BNI, BRI, Mandiri echannel, Permata).
 * - Webhook verification uses SHA-512(order_id + status_code + gross_amount + serverKey).
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

function getMidtransBaseUrl(env: 'SANDBOX' | 'PRODUCTION'): string {
  return env === 'PRODUCTION'
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';
}

export function verifyMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  signatureKey: string;
}): boolean {
  if (!params.serverKey || !params.signatureKey) return false;
  const payload = `${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`;
  const expected = crypto.createHash('sha512').update(payload, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected.toLowerCase(), 'utf8'),
      Buffer.from(params.signatureKey.toLowerCase(), 'utf8')
    );
  } catch {
    return false;
  }
}

export function buildMidtransChargePayload(input: CreateChargeInput): Record<string, unknown> {
  const amountInt = new Decimal(input.totalPayable).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const basePayload: Record<string, unknown> = {
    transaction_details: {
      order_id: input.orderNumber,
      gross_amount: amountInt,
    },
    customer_details: {
      first_name: input.customerName || 'Pelanggan KasirAkun',
      email: input.customerEmail || 'pelanggan@kasirakun.id',
      phone: input.customerPhone || '081200000000',
    },
  };

  if (input.paymentCategory === 'QRIS_DYNAMIC' || input.channelCode === 'QRIS') {
    return {
      ...basePayload,
      payment_type: 'qris',
      qris: { acquirer: 'gopay' },
    };
  }

  if (input.channelCode === 'GOPAY') {
    return {
      ...basePayload,
      payment_type: 'gopay',
      gopay: {
        enable_callback: true,
        callback_url: input.returnUrl,
      },
    };
  }

  if (input.channelCode === 'SHOPEEPAY') {
    return {
      ...basePayload,
      payment_type: 'shopeepay',
      shopeepay: {
        callback_url: input.returnUrl,
      },
    };
  }

  if (input.channelCode === 'VA_MANDIRI') {
    return {
      ...basePayload,
      payment_type: 'echannel',
      echannel: {
        bill_info1: `Pembayaran ${input.tenantName}`,
        bill_info2: input.orderNumber,
      },
    };
  }

  if (input.channelCode === 'VA_PERMATA') {
    return {
      ...basePayload,
      payment_type: 'permata',
    };
  }

  const bankMap: Record<string, string> = {
    VA_BCA: 'bca',
    VA_BRI: 'bri',
    VA_BNI: 'bni',
    VA_BSI: 'cimb',
  };
  const bank = bankMap[input.channelCode] || 'bca';

  return {
    ...basePayload,
    payment_type: 'bank_transfer',
    bank_transfer: { bank },
  };
}

export class MidtransAdapter implements PaymentGatewayAdapter {
  readonly provider = 'MIDTRANS' as const;

  async createCharge(input: CreateChargeInput): Promise<CreateChargeOutput> {
    const serverKey = input.credentials.serverKey?.trim();
    if (!serverKey) {
      throw new Error('Server Key Midtrans belum dikonfigurasi. Lengkapi di Pengaturan Pembayaran.');
    }

    const baseUrl = getMidtransBaseUrl(input.credentials.environment);
    const payload = buildMidtransChargePayload(input);
    const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

    const response = await fetch(`${baseUrl}/v2/charge`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'X-Override-Notification': input.callbackUrl,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || String(data.status_code || '').startsWith('4') || String(data.status_code || '').startsWith('5')) {
      throw new Error(
        `Midtrans gagal membuat tagihan: ${String(data.status_message || response.statusText)}`
      );
    }

    const actions = Array.isArray(data.actions)
      ? (data.actions as Array<{ name?: string; url?: string }>)
      : [];
    const qrAction = actions.find((a) => a.name === 'generate-qr-code' || a.name === 'generate-qr-code-v2');
    const deeplinkAction = actions.find((a) => a.name === 'deeplink-redirect');

    const vaNumbers = Array.isArray(data.va_numbers)
      ? (data.va_numbers as Array<{ bank?: string; va_number?: string }>)
      : [];
    const vaNumber =
      vaNumbers[0]?.va_number ||
      (typeof data.permata_va_number === 'string' ? data.permata_va_number : null) ||
      (typeof data.bill_key === 'string' ? `${String(data.biller_code || '')}${data.bill_key}` : null);

    return {
      provider: 'MIDTRANS',
      gatewayRefId: String(data.transaction_id || input.orderNumber),
      qrString: typeof data.qr_string === 'string' ? data.qr_string : null,
      qrImageUrl: qrAction?.url || null,
      vaNumber,
      deeplinkUrl: deeplinkAction?.url || null,
      expiresAt:
        typeof data.expiry_time === 'string'
          ? new Date(data.expiry_time).toISOString()
          : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      isLiveGatewayCall: true,
      instructions: 'Tagihan resmi Midtrans aktif. Status otomatis lunas via webhook.',
    };
  }

  verifyWebhook(args: {
    rawBody: string;
    parsedBody: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    credentials: DecryptedGatewayCredentials;
  }): WebhookVerificationResult {
    const orderId = String(args.parsedBody.order_id || '');
    const statusCode = String(args.parsedBody.status_code || '');
    const grossAmount = String(args.parsedBody.gross_amount || '');
    const signatureKey = String(args.parsedBody.signature_key || '');
    const txnStatus = String(args.parsedBody.transaction_status || '').toLowerCase();
    const fraudStatus = String(args.parsedBody.fraud_status || 'accept').toLowerCase();
    const gatewayRefId = String(args.parsedBody.transaction_id || orderId || '');

    const isValid = verifyMidtransSignature({
      orderId,
      statusCode,
      grossAmount,
      serverKey: args.credentials.serverKey || '',
      signatureKey,
    });

    const isPaid =
      isValid &&
      (txnStatus === 'settlement' || (txnStatus === 'capture' && fraudStatus === 'accept'));
    const isExpiredOrFailed =
      isValid && (txnStatus === 'expire' || txnStatus === 'cancel' || txnStatus === 'deny');

    return {
      isValid,
      isPaid,
      isExpiredOrFailed,
      gatewayRefId: gatewayRefId || null,
      orderNumber: orderId || null,
      grossAmount: grossAmount || null,
      reason: isValid ? txnStatus : 'Midtrans SHA-512 signature mismatch',
    };
  }

  async testConnection(credentials: DecryptedGatewayCredentials): Promise<ConnectionTestResult> {
    const serverKey = credentials.serverKey?.trim() || '';
    if (!serverKey) {
      return {
        ok: false,
        message: 'Server Key Midtrans belum diisi.',
        mode: 'FORMAT_VERIFIED',
      };
    }

    const expectedPrefix = credentials.environment === 'SANDBOX' ? 'SB-Mid-server-' : 'Mid-server-';
    if (!serverKey.startsWith(expectedPrefix) && !serverKey.startsWith('Mid-server-') && !serverKey.startsWith('SB-Mid-server-')) {
      return {
        ok: false,
        message: `Format Server Key tidak sesuai Midtrans (seharusnya diawali ${expectedPrefix}).`,
        mode: 'FORMAT_VERIFIED',
      };
    }

    // Attempt lightweight status check against Midtrans API; 404 (transaction not found) means auth succeeded!
    try {
      const baseUrl = getMidtransBaseUrl(credentials.environment);
      const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
      const res = await fetch(`${baseUrl}/v2/kasirakun-ping-check/status`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: authHeader },
      });
      if (res.status === 401) {
        return {
          ok: false,
          message: 'Server Key Midtrans ditolak (401 Unauthorized). Periksa kembali key Sandbox/Production Anda.',
          mode: 'LIVE_VERIFIED',
        };
      }
      return {
        ok: true,
        message: `Koneksi Midtrans (${credentials.environment}) berhasil terverifikasi!`,
        mode: 'LIVE_VERIFIED',
      };
    } catch {
      return {
        ok: true,
        message: `Format Server Key Midtrans (${credentials.environment}) valid dan terenkripsi AES-256-GCM.`,
        mode: 'FORMAT_VERIFIED',
      };
    }
  }
}
