/**
 * Simulator Payment Adapter (Demo & Testing Mode)
 * - Generates valid EMVCo Dynamic QRIS string with CRC-16, realistic Bank VA numbers,
 *   and simulated App-to-App deeplink URLs without needing live third-party credentials.
 * - Uses deterministic HMAC-SHA256 webhook signing so the Simulator runs through the
 *   exact same Universal Webhook + Idempotency + Double-Entry pipeline as live gateways!
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

const SIMULATOR_HMAC_SECRET = 'kasirakun-simulator-webhook-signing-key-v1';

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function generateDynamicEmvQris(params: {
  merchantName: string;
  amount: number;
  orderNumber: string;
}): string {
  const cleanName = params.merchantName
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, 24) || 'KASIRAKUN UMKM';
  const amountStr = String(Math.max(100, Math.round(params.amount)));
  const merchantAccount =
    tlv('00', 'ID.CO.QRIS.WWW') +
    tlv('01', '936009143000123456') +
    tlv('02', 'ID1020260001234') +
    tlv('03', 'UMI');

  const body =
    tlv('00', '01') +
    tlv('01', '12') + // 12 = Dynamic QRIS
    tlv('26', merchantAccount) +
    tlv('52', '5812') +
    tlv('53', '360') + // IDR
    tlv('54', amountStr) +
    tlv('58', 'ID') +
    tlv('59', cleanName) +
    tlv('60', 'JAKARTA') +
    tlv('62', tlv('01', params.orderNumber.slice(0, 20))) +
    '6304';

  return `${body}${crc16Ccitt(body)}`;
}

function generateVirtualAccountNumber(channelCode: string, orderNumber: string): string {
  const prefixMap: Record<string, string> = {
    VA_BCA: '390108',
    VA_MANDIRI: '890220',
    VA_BRI: '262150',
    VA_BNI: '880812',
    VA_BSI: '900145',
    VA_PERMATA: '856201',
  };
  const prefix = prefixMap[channelCode] || '880100';
  const numericHash = crypto
    .createHash('sha256')
    .update(orderNumber)
    .digest('hex')
    .replace(/[a-f]/g, (c) => String(c.charCodeAt(0) - 87))
    .slice(0, 10);
  return `${prefix}${numericHash}`;
}

export function signSimulatorWebhook(rawBody: string): string {
  return crypto
    .createHmac('sha256', SIMULATOR_HMAC_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');
}

export class SimulatorAdapter implements PaymentGatewayAdapter {
  readonly provider = 'SIMULATOR' as const;

  async createCharge(input: CreateChargeInput): Promise<CreateChargeOutput> {
    const amountInt = new Decimal(input.totalPayable)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    const gatewayRefId = `SIM-${input.channelCode}-${Date.now().toString(36).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (input.paymentCategory === 'VIRTUAL_ACCOUNT') {
      const vaNumber = generateVirtualAccountNumber(input.channelCode, input.orderNumber);
      return {
        provider: 'SIMULATOR',
        gatewayRefId,
        vaNumber,
        expiresAt,
        isLiveGatewayCall: false,
        instructions: `Transfer tepat sesuai nominal ke Virtual Account ${input.channelCode.replace('VA_', '')} (${vaNumber}). Mode Simulasi aktif.`,
      };
    }

    if (input.paymentCategory === 'EWALLET_DIRECT') {
      const schemeMap: Record<string, string> = {
        GOPAY: `gojek://gopay/merchanttransfer?ref=${encodeURIComponent(gatewayRefId)}&amount=${amountInt}&callback=${encodeURIComponent(input.returnUrl)}`,
        SHOPEEPAY: `shopeeid://main?ref=${encodeURIComponent(gatewayRefId)}&amount=${amountInt}&callback=${encodeURIComponent(input.returnUrl)}`,
        DANA: `https://link.dana.id/m/kasirakun?ref=${encodeURIComponent(gatewayRefId)}&amount=${amountInt}&callback=${encodeURIComponent(input.returnUrl)}`,
      };
      const isOvo = input.channelCode === 'OVO';
      return {
        provider: 'SIMULATOR',
        gatewayRefId,
        deeplinkUrl: isOvo ? null : schemeMap[input.channelCode] || input.returnUrl,
        expiresAt: isOvo
          ? new Date(Date.now() + 55 * 1000).toISOString()
          : expiresAt,
        isLiveGatewayCall: false,
        instructions: isOvo
          ? `Push notification simulasi terkirim ke OVO ${input.ovoPhoneNumber || '-'}. Selesaikan dalam 55 detik.`
          : `Klik tombol "Buka Aplikasi & Bayar Sekarang" untuk simulasi App-to-App ${input.channelCode}.`,
      };
    }

    const qrString = generateDynamicEmvQris({
      merchantName: input.tenantName,
      amount: amountInt,
      orderNumber: input.orderNumber,
    });

    return {
      provider: 'SIMULATOR',
      gatewayRefId,
      qrString,
      expiresAt,
      isLiveGatewayCall: false,
      instructions:
        'Scan QRIS Dinamis menggunakan GoPay, OVO, DANA, ShopeePay, BCA Mobile, Livin, BRImo, atau m-Banking lainnya.',
    };
  }

  verifyWebhook(args: {
    rawBody: string;
    parsedBody: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    credentials: DecryptedGatewayCredentials;
  }): WebhookVerificationResult {
    const rawSig =
      args.headers['x-simulator-signature'] ||
      args.headers['X-Simulator-Signature'] ||
      String(args.parsedBody.signature || '');
    const sig = Array.isArray(rawSig) ? rawSig[0] : rawSig;
    const expected = signSimulatorWebhook(args.rawBody);

    let isValid = false;
    try {
      isValid =
        sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      isValid = false;
    }

    const status = String(args.parsedBody.status || '').toUpperCase();
    const gatewayRefId = String(args.parsedBody.gatewayRefId || '');
    const orderNumber = String(args.parsedBody.orderNumber || '');

    return {
      isValid,
      isPaid: isValid && status === 'PAID',
      isExpiredOrFailed: isValid && (status === 'EXPIRED' || status === 'FAILED'),
      gatewayRefId: gatewayRefId || null,
      orderNumber: orderNumber || null,
      grossAmount:
        args.parsedBody.grossAmount !== undefined ? String(args.parsedBody.grossAmount) : null,
      reason: isValid ? status : 'Simulator HMAC-SHA256 signature mismatch',
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      ok: true,
      message: 'Mode Simulasi QRIS/E-Wallet/VA aktif — siap untuk demo & uji coba transaksi penuh.',
      mode: 'SIMULATOR',
    };
  }
}
