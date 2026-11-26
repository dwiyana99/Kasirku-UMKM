/**
 * KasirAkun UMKM — Secure Password Recovery & Account Verification Engine
 *
 * Security properties:
 *  - Cryptographically random 6-digit numeric recovery code (`crypto.randomInt`)
 *  - Only stores SHA-256 salted hash of the code (never stores plaintext code in memory)
 *  - Strict 15-minute TTL, single-use invalidation on success, max 5 failed attempts
 *  - Rate-limited issuance (cooldown window) to prevent brute-force or WhatsApp spam
 */

import crypto from 'node:crypto';

export type RecoveryAccountRole = 'MASTER_ADMIN' | 'CUSTOMER';

export interface StoredRecoveryChallenge {
  challengeId: string;
  accountRole: RecoveryAccountRole;
  accountId: string;
  email: string;
  salt: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  issuedAtMs: number;
  expiresAtMs: number;
  used: boolean;
}

export interface IssuedRecoveryChallenge {
  challengeId: string;
  code: string;
  expiresAtIso: string;
  ttlMinutes: number;
}

export interface VerifyRecoveryResult {
  ok: boolean;
  error?: string;
  accountRole?: RecoveryAccountRole;
  accountId?: string;
  email?: string;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_COOLDOWN_MS = 30 * 1000;

function hashRecoveryCode(code: string, salt: string): string {
  return crypto
    .createHash('sha256')
    .update(`kasirakun:recovery:v1:${salt}:${code.trim()}`, 'utf8')
    .digest('hex');
}

export class PasswordRecoveryManager {
  private readonly challengesByEmail = new Map<string, StoredRecoveryChallenge>();
  private readonly ttlMs: number;
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;

  constructor(options?: { ttlMs?: number; maxAttempts?: number; cooldownMs?: number }) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, ch] of this.challengesByEmail.entries()) {
      if (ch.used || ch.expiresAtMs <= nowMs) {
        this.challengesByEmail.delete(key);
      }
    }
  }

  public issueChallenge(params: {
    accountRole: RecoveryAccountRole;
    accountId: string;
    email: string;
    nowMs?: number;
  }): { ok: true; issued: IssuedRecoveryChallenge } | { ok: false; retryAfterSec: number; error: string } {
    const nowMs = params.nowMs ?? Date.now();
    this.pruneExpired(nowMs);
    const key = `${params.accountRole}:${params.email.trim().toLowerCase()}`;

    const existing = this.challengesByEmail.get(key);
    if (existing && !existing.used && nowMs - existing.issuedAtMs < this.cooldownMs) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((this.cooldownMs - (nowMs - existing.issuedAtMs)) / 1000),
      );
      return {
        ok: false,
        retryAfterSec,
        error: `Tunggu ${retryAfterSec} detik sebelum meminta kode pemulihan baru.`,
      };
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const salt = crypto.randomBytes(16).toString('hex');
    const challengeId = `rec-${crypto.randomBytes(8).toString('hex')}`;
    const expiresAtMs = nowMs + this.ttlMs;

    this.challengesByEmail.set(key, {
      challengeId,
      accountRole: params.accountRole,
      accountId: params.accountId,
      email: params.email.trim().toLowerCase(),
      salt,
      codeHash: hashRecoveryCode(code, salt),
      attempts: 0,
      maxAttempts: this.maxAttempts,
      issuedAtMs: nowMs,
      expiresAtMs,
      used: false,
    });

    return {
      ok: true,
      issued: {
        challengeId,
        code,
        expiresAtIso: new Date(expiresAtMs).toISOString(),
        ttlMinutes: Math.round(this.ttlMs / 60000),
      },
    };
  }

  public verifyAndConsume(params: {
    accountRole: RecoveryAccountRole;
    email: string;
    code: string;
    nowMs?: number;
  }): VerifyRecoveryResult {
    const nowMs = params.nowMs ?? Date.now();
    const key = `${params.accountRole}:${params.email.trim().toLowerCase()}`;
    const challenge = this.challengesByEmail.get(key);

    if (!challenge || challenge.used) {
      return {
        ok: false,
        error: 'Kode pemulihan tidak ditemukan atau sudah pernah dipakai. Minta kode baru.',
      };
    }

    if (challenge.expiresAtMs <= nowMs) {
      this.challengesByEmail.delete(key);
      return {
        ok: false,
        error: 'Kode pemulihan sudah kedaluwarsa. Silakan minta kode baru.',
      };
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      this.challengesByEmail.delete(key);
      return {
        ok: false,
        error: 'Terlalu banyak percobaan salah. Silakan minta kode pemulihan baru.',
      };
    }

    const cleanedCode = params.code.trim().replace(/\s+/g, '');
    const actualHash = hashRecoveryCode(cleanedCode, challenge.salt);
    const a = Buffer.from(actualHash, 'hex');
    const b = Buffer.from(challenge.codeHash, 'hex');
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) {
      challenge.attempts += 1;
      const remaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
      if (remaining === 0) {
        this.challengesByEmail.delete(key);
        return {
          ok: false,
          error: 'Kode pemulihan salah dan batas percobaan habis. Silakan minta kode baru.',
        };
      }
      return {
        ok: false,
        error: `Kode pemulihan tidak cocok. Sisa ${remaining} percobaan.`,
      };
    }

    // Consume single-use token immediately
    challenge.used = true;
    this.challengesByEmail.delete(key);

    return {
      ok: true,
      accountRole: challenge.accountRole,
      accountId: challenge.accountId,
      email: challenge.email,
    };
  }
}
