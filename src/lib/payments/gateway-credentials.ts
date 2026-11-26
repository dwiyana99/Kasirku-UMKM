/**
 * Gateway Credential Resolution Helper
 * Resolves decrypted per-tenant credentials first, and gracefully falls back
 * to Vercel/server platform environment variables (`MIDTRANS_*`, `DUITKU_*`, `TRIPAY_*`)
 * when a tenant uses the platform default gateway or runs on ephemeral serverless containers.
 */

import { decryptSecret } from './crypto.ts';
import type { DecryptedGatewayCredentials } from './adapters/index.ts';
import type { PaymentGatewayProvider, TenantPaymentConfig } from '../../types/domain.ts';

function safeDecrypt(encrypted: string | null | undefined): string {
  if (!encrypted) return '';
  try {
    return decryptSecret(encrypted).trim();
  } catch {
    return '';
  }
}

export function resolveEffectiveGatewayCredentials(
  config: Pick<
    TenantPaymentConfig,
    | 'provider'
    | 'environment'
    | 'merchantCode'
    | 'encryptedServerKey'
    | 'encryptedClientKey'
    | 'encryptedPrivateKey'
  >,
  env: NodeJS.ProcessEnv = process.env,
  providerOverride?: PaymentGatewayProvider,
): DecryptedGatewayCredentials {
  const provider = providerOverride ?? config.provider;

  const tenantServerKey = safeDecrypt(config.encryptedServerKey);
  const tenantClientKey = safeDecrypt(config.encryptedClientKey);
  const tenantPrivateKey = safeDecrypt(config.encryptedPrivateKey);
  const tenantMerchantCode = (config.merchantCode || '').trim();

  let serverKey = tenantServerKey;
  let clientKey = tenantClientKey;
  let privateKey = tenantPrivateKey;
  let merchantCode = tenantMerchantCode;
  let environment = config.environment;

  if (provider === 'MIDTRANS') {
    const envServer = (env.MIDTRANS_SERVER_KEY || '').trim();
    const envClient = (env.MIDTRANS_CLIENT_KEY || '').trim();
    if (!serverKey && envServer) {
      serverKey = envServer;
      // Auto-infer Sandbox vs Production when falling back to platform Midtrans key
      if (envServer.startsWith('SB-Mid-')) {
        environment = 'SANDBOX';
      } else if (envServer.startsWith('Mid-')) {
        environment = 'PRODUCTION';
      }
    }
    if (!clientKey && envClient) {
      clientKey = envClient;
    }
  } else if (provider === 'DUITKU') {
    const envMerchant = (env.DUITKU_MERCHANT_CODE || '').trim();
    const envApiKey = (env.DUITKU_API_KEY || '').trim();
    if (!merchantCode && envMerchant) {
      merchantCode = envMerchant;
    }
    if (!serverKey && envApiKey) {
      serverKey = envApiKey;
    }
  } else if (provider === 'TRIPAY') {
    const envMerchant = (env.TRIPAY_MERCHANT_CODE || '').trim();
    const envApiKey = (env.TRIPAY_API_KEY || '').trim();
    const envPrivateKey = (env.TRIPAY_PRIVATE_KEY || '').trim();
    if (!merchantCode && envMerchant) {
      merchantCode = envMerchant;
    }
    if (!serverKey && envApiKey) {
      serverKey = envApiKey;
      if (envApiKey.startsWith('DEV-')) {
        environment = 'SANDBOX';
      } else if (envApiKey.startsWith('PROD-')) {
        environment = 'PRODUCTION';
      }
    }
    if (!privateKey && envPrivateKey) {
      privateKey = envPrivateKey;
    }
  }

  return {
    environment,
    merchantCode: merchantCode || null,
    serverKey: serverKey || null,
    clientKey: clientKey || null,
    privateKey: privateKey || null,
  };
}

export function hasRequiredGatewayCredentials(
  provider: PaymentGatewayProvider,
  creds: DecryptedGatewayCredentials,
): boolean {
  if (provider === 'SIMULATOR' || provider === 'MANUAL_ONLY') return true;
  if (provider === 'MIDTRANS') return Boolean(creds.serverKey);
  if (provider === 'DUITKU') return Boolean(creds.merchantCode && creds.serverKey);
  if (provider === 'TRIPAY') {
    return Boolean(creds.merchantCode && creds.serverKey && creds.privateKey);
  }
  return false;
}
