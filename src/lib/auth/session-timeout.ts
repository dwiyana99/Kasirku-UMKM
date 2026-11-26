/**
 * KasirAkun UMKM — Pure Idle Session Timeout Engine
 *
 * Default Policy:
 * - Master Admin: 30 menit otomatis logout jika tidak ada aktivitas
 * - Pemilik UMKM (Real / Simulasi / Demo): Nonaktif (0) secara bawaan, bisa dikustom oleh Pemilik atau Master Admin
 * - Pegawai / Sub-User UMKM: Nonaktif (0) secara bawaan, bisa dikustom oleh Pemilik UMKM atau Master Admin
 */

export const DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_USER_IDLE_TIMEOUT_MINUTES = 0;
export const DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES = 0;
export const MIN_ACTIVE_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_IDLE_TIMEOUT_MINUTES = 1440; // 24 jam
export const IDLE_TIMEOUT_WARNING_SECONDS = 60;

export interface IdleTimeoutPreset {
  minutes: number;
  label: string;
}

export const IDLE_TIMEOUT_PRESETS: IdleTimeoutPreset[] = [
  { minutes: 0, label: 'Nonaktif (Tetap Masuk)' },
  { minutes: 15, label: '15 menit' },
  { minutes: 30, label: '30 menit' },
  { minutes: 60, label: '1 jam (60 menit)' },
  { minutes: 120, label: '2 jam (120 menit)' },
  { minutes: 240, label: '4 jam (240 menit)' },
];

export type SessionRoleForTimeout = 'GUEST' | 'MASTER_ADMIN' | 'CUSTOMER' | 'STAFF';

/**
 * Normalizes any numeric/string timeout input into either 0 (disabled) or a safe clamped minute value [5..1440].
 */
export function normalizeIdleTimeoutMinutes(
  raw: unknown,
  fallback: number = DEFAULT_USER_IDLE_TIMEOUT_MINUTES,
): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback)
      ? fallback <= 0
        ? 0
        : Math.min(MAX_IDLE_TIMEOUT_MINUTES, Math.max(MIN_ACTIVE_IDLE_TIMEOUT_MINUTES, Math.round(fallback)))
      : 0;

  if (raw === undefined || raw === null || raw === '') {
    return safeFallback;
  }

  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }

  const rounded = Math.round(parsed);
  if (rounded <= 0) {
    return 0;
  }
  return Math.min(MAX_IDLE_TIMEOUT_MINUTES, Math.max(MIN_ACTIVE_IDLE_TIMEOUT_MINUTES, rounded));
}

export function getDefaultIdleTimeoutForRole(role: SessionRoleForTimeout): number {
  if (role === 'MASTER_ADMIN') return DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES;
  if (role === 'STAFF') return DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES;
  if (role === 'CUSTOMER') return DEFAULT_USER_IDLE_TIMEOUT_MINUTES;
  return 0;
}

export function resolveEffectiveIdleTimeoutMinutes(params: {
  role: SessionRoleForTimeout;
  sessionIdleTimeoutMinutes?: number | null;
  masterIdleTimeoutMinutes?: number | null;
  customerIdleTimeoutMinutes?: number | null;
  staffIdleTimeoutMinutes?: number | null;
}): number {
  if (params.role === 'GUEST') return 0;

  if (params.role === 'MASTER_ADMIN') {
    const candidate =
      params.masterIdleTimeoutMinutes !== undefined && params.masterIdleTimeoutMinutes !== null
        ? params.masterIdleTimeoutMinutes
        : params.sessionIdleTimeoutMinutes;
    return normalizeIdleTimeoutMinutes(candidate, DEFAULT_MASTER_IDLE_TIMEOUT_MINUTES);
  }

  if (params.role === 'STAFF') {
    const candidate =
      params.staffIdleTimeoutMinutes !== undefined && params.staffIdleTimeoutMinutes !== null
        ? params.staffIdleTimeoutMinutes
        : params.sessionIdleTimeoutMinutes;
    return normalizeIdleTimeoutMinutes(candidate, DEFAULT_STAFF_IDLE_TIMEOUT_MINUTES);
  }

  const candidate =
    params.customerIdleTimeoutMinutes !== undefined && params.customerIdleTimeoutMinutes !== null
      ? params.customerIdleTimeoutMinutes
      : params.sessionIdleTimeoutMinutes;
  return normalizeIdleTimeoutMinutes(candidate, DEFAULT_USER_IDLE_TIMEOUT_MINUTES);
}

export type IdlePhase = 'DISABLED' | 'ACTIVE' | 'WARNING' | 'EXPIRED';

export interface IdleEvaluationResult {
  phase: IdlePhase;
  timeoutMinutes: number;
  elapsedMs: number;
  remainingMs: number;
  remainingSeconds: number;
}

export function evaluateIdleState(params: {
  nowMs: number;
  lastActivityMs: number;
  timeoutMinutes: number;
  warningWindowSeconds?: number;
}): IdleEvaluationResult {
  const timeoutMinutes = normalizeIdleTimeoutMinutes(params.timeoutMinutes, 0);
  if (timeoutMinutes <= 0) {
    return {
      phase: 'DISABLED',
      timeoutMinutes: 0,
      elapsedMs: 0,
      remainingMs: Number.POSITIVE_INFINITY,
      remainingSeconds: Number.POSITIVE_INFINITY,
    };
  }

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningWindowMs = Math.max(
    10_000,
    Math.min(timeoutMs / 2, (params.warningWindowSeconds ?? IDLE_TIMEOUT_WARNING_SECONDS) * 1000),
  );
  const elapsedMs = Math.max(0, params.nowMs - params.lastActivityMs);
  const remainingMs = Math.max(0, timeoutMs - elapsedMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  if (remainingMs <= 0) {
    return {
      phase: 'EXPIRED',
      timeoutMinutes,
      elapsedMs,
      remainingMs: 0,
      remainingSeconds: 0,
    };
  }

  if (remainingMs <= warningWindowMs) {
    return {
      phase: 'WARNING',
      timeoutMinutes,
      elapsedMs,
      remainingMs,
      remainingSeconds,
    };
  }

  return {
    phase: 'ACTIVE',
    timeoutMinutes,
    elapsedMs,
    remainingMs,
    remainingSeconds,
  };
}

export function formatIdleTimeoutLabel(minutes?: number | null): string {
  const normalized = normalizeIdleTimeoutMinutes(minutes, 0);
  if (normalized <= 0) return 'Nonaktif';
  if (normalized < 60) return `${normalized} menit`;
  const hours = Math.floor(normalized / 60);
  const rem = normalized % 60;
  if (rem === 0) return `${hours} jam`;
  return `${hours} jam ${rem} mnt`;
}
