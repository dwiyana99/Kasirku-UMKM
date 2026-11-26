/**
 * AES-256-GCM Encryption Helper for Tenant Payment Gateway Credentials
 * Server-side only (uses Node.js built-in crypto module).
 * Never return plaintext keys to the frontend — always return maskSecretKey().
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit recommended IV for GCM

const DEFAULT_DEV_KEY = crypto
  .createHash('sha256')
  .update('kasirakun-umkm-default-dev-aes256-key-replace-in-production', 'utf8')
  .digest();

function deriveEncryptionKey(): Buffer {
  const explicitSecret =
    process.env.PAYMENT_KEY_ENCRYPTION_SECRET ||
    process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.APP_ENCRYPTION_KEY ||
    '';

  if (explicitSecret.trim()) {
    // If 64 hex chars (32 bytes), use directly; otherwise derive 32 bytes via SHA-256
    if (/^[0-9a-fA-F]{64}$/.test(explicitSecret.trim())) {
      return Buffer.from(explicitSecret.trim(), 'hex');
    }
    return crypto.createHash('sha256').update(explicitSecret, 'utf8').digest();
  }

  const betterAuthSecret = (process.env.BETTER_AUTH_SECRET || '').trim();
  if (betterAuthSecret && !betterAuthSecret.includes('REPLACE_WITH_')) {
    return crypto
      .createHmac('sha256', betterAuthSecret)
      .update('kasirakun:payment-aes256:v1', 'utf8')
      .digest();
  }

  return DEFAULT_DEV_KEY;
}

function decryptWithKey(payload: string, key: Buffer): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Format enkripsi kunci payment gateway tidak valid.');
  }
  const [, ivB64, authTagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(cipherB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypts a plaintext secret string using AES-256-GCM.
 * Format: `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>`
 */
export function encryptSecret(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) return '';
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a string encrypted by encryptSecret().
 */
export function decryptSecret(payload: string | null | undefined): string {
  if (!payload || !payload.trim()) return '';
  return decryptWithKey(payload, deriveEncryptionKey());
}

/**
 * Decrypts a vault secret with fallback to the pre-BETTER_AUTH_SECRET default key
 * so secrets encrypted before BETTER_AUTH_SECRET was loaded never appear missing.
 */
export function decryptSecretWithFallback(payload: string | null | undefined): {
  plaintext: string;
  usedFallbackKey: boolean;
} {
  if (!payload || !payload.trim()) {
    return { plaintext: '', usedFallbackKey: false };
  }
  const primaryKey = deriveEncryptionKey();
  try {
    return { plaintext: decryptWithKey(payload, primaryKey), usedFallbackKey: false };
  } catch (err) {
    if (!primaryKey.equals(DEFAULT_DEV_KEY)) {
      return { plaintext: decryptWithKey(payload, DEFAULT_DEV_KEY), usedFallbackKey: true };
    }
    throw err;
  }
}

/**
 * Produces a safe masked preview of a secret API key for UI display.
 * Examples:
 *  - "SB-Mid-server-123456789a2b" -> "SB-Mid-server-****9a2b"
 *  - "Mid-server-abcdef9a2b"      -> "Mid-server-****9a2b"
 *  - "DEV-abc123456789xyz"        -> "DEV-****9xyz"
 *  - "short"                      -> "****"
 */
export function maskSecretKey(plaintext: string | null | undefined): string | null {
  if (!plaintext || !plaintext.trim()) return null;
  const s = plaintext.trim();
  if (s.length <= 6) {
    return '****';
  }
  const tail = s.slice(-4);
  const knownPrefixMatch = s.match(/^(SB-Mid-server-|SB-Mid-client-|Mid-server-|Mid-client-|DEV-|PROD-)/i);
  if (knownPrefixMatch) {
    return `${knownPrefixMatch[1]}****${tail}`;
  }
  if (s.length >= 12) {
    return `${s.slice(0, 4)}****${tail}`;
  }
  return `****${tail}`;
}
