/**
 * Payment Gateway Adapter Pattern Types (Midtrans, Duitku, Tripay, Simulator)
 */

import type {
  GatewayEnvironment,
  PaymentCategory,
  PaymentCheckoutMode,
  PaymentGatewayProvider,
} from '../../../types/domain';

export interface DecryptedGatewayCredentials {
  environment: GatewayEnvironment;
  merchantCode?: string | null;
  serverKey?: string | null;
  clientKey?: string | null;
  privateKey?: string | null;
}

export interface CreateChargeInput {
  tenantId: string;
  tenantName: string;
  orderNumber: string;
  paymentCategory: PaymentCategory;
  channelCode: string; // QRIS | GOPAY | SHOPEEPAY | DANA | OVO | VA_BCA | VA_BRI | VA_MANDIRI | VA_BNI | VA_BSI | VA_PERMATA
  checkoutMode: PaymentCheckoutMode;
  totalPayable: string; // Decimal string e.g. '50350.0000'
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  ovoPhoneNumber?: string;
  callbackUrl: string;
  returnUrl: string;
  credentials: DecryptedGatewayCredentials;
}

export interface CreateChargeOutput {
  provider: PaymentGatewayProvider;
  gatewayRefId: string;
  qrString?: string | null;
  qrImageUrl?: string | null;
  vaNumber?: string | null;
  deeplinkUrl?: string | null;
  expiresAt: string;
  isLiveGatewayCall: boolean;
  instructions: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  isPaid: boolean;
  isExpiredOrFailed: boolean;
  gatewayRefId: string | null;
  orderNumber: string | null;
  grossAmount?: string | null;
  reason?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  mode: 'LIVE_VERIFIED' | 'FORMAT_VERIFIED' | 'SIMULATOR';
}

export interface PaymentGatewayAdapter {
  readonly provider: PaymentGatewayProvider;
  createCharge(input: CreateChargeInput): Promise<CreateChargeOutput>;
  verifyWebhook(args: {
    rawBody: string;
    parsedBody: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    credentials: DecryptedGatewayCredentials;
  }): WebhookVerificationResult;
  testConnection(credentials: DecryptedGatewayCredentials): Promise<ConnectionTestResult>;
}
