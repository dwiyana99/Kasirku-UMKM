import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  evaluateIdleState,
  formatIdleTimeoutLabel,
  IDLE_TIMEOUT_WARNING_SECONDS,
  resolveEffectiveIdleTimeoutMinutes,
} from '../lib/auth/session-timeout';

/**
 * Live Idle Session Timeout Guard
 * - Master Admin: default 30 menit (dapat dikustom di Akun Master)
 * - Pemilik UMKM & Pegawai: default nonaktif (0), aktif bila dikustom oleh Pemilik atau Master Admin
 * - Menggunakan timestamp real-time sehingga tetap akurat walau tab browser sedang sleep/background
 */
export function IdleTimeoutGuard() {
  const { session, activeCustomer, activeWorkspace, logoutSession, navigate } = useApp();
  const lastActivityRef = useRef<number>(Date.now());
  const lastMoveTickRef = useRef<number>(0);
  const loggingOutRef = useRef<boolean>(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState<number | null>(null);

  const activeStaffRecord = useMemo(() => {
    if (session.role !== 'STAFF' || !session.staffId) return null;
    return (activeWorkspace.staffAccounts ?? []).find((s) => s.id === session.staffId) ?? null;
  }, [activeWorkspace.staffAccounts, session.role, session.staffId]);

  const effectiveTimeoutMinutes = useMemo(() => {
    return resolveEffectiveIdleTimeoutMinutes({
      role: session.role,
      sessionIdleTimeoutMinutes: session.idleTimeoutMinutes,
      masterIdleTimeoutMinutes:
        session.role === 'MASTER_ADMIN' ? session.idleTimeoutMinutes : undefined,
      customerIdleTimeoutMinutes:
        session.role === 'CUSTOMER'
          ? activeCustomer?.idleTimeoutMinutes ?? session.idleTimeoutMinutes
          : undefined,
      staffIdleTimeoutMinutes:
        session.role === 'STAFF'
          ? activeStaffRecord?.idleTimeoutMinutes ?? session.idleTimeoutMinutes
          : undefined,
    });
  }, [
    activeCustomer?.idleTimeoutMinutes,
    activeStaffRecord?.idleTimeoutMinutes,
    session.idleTimeoutMinutes,
    session.role,
  ]);

  // Reset activity timer whenever session identity or timeout changes
  useEffect(() => {
    lastActivityRef.current = Date.now();
    loggingOutRef.current = false;
    setWarningSecondsLeft(null);
  }, [session.role, session.email, effectiveTimeoutMinutes]);

  useEffect(() => {
    if (session.role === 'GUEST' || effectiveTimeoutMinutes <= 0) {
      setWarningSecondsLeft(null);
      return;
    }

    const triggerAutoLogout = () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      setWarningSecondsLeft(null);
      const targetUrl =
        session.role === 'MASTER_ADMIN'
          ? '/master/login?reason=idle_timeout'
          : '/login?reason=idle_timeout';
      void logoutSession().finally(() => {
        navigate(targetUrl);
      });
    };

    const recordActivity = () => {
      if (loggingOutRef.current) return;
      lastActivityRef.current = Date.now();
      setWarningSecondsLeft((prev) => (prev !== null ? null : prev));
    };

    const onMouseMove = () => {
      const now = Date.now();
      if (now - lastMoveTickRef.current < 5_000) return;
      lastMoveTickRef.current = now;
      recordActivity();
    };

    const evaluateNow = () => {
      if (loggingOutRef.current) return;
      const result = evaluateIdleState({
        nowMs: Date.now(),
        lastActivityMs: lastActivityRef.current,
        timeoutMinutes: effectiveTimeoutMinutes,
        warningWindowSeconds: IDLE_TIMEOUT_WARNING_SECONDS,
      });
      if (result.phase === 'EXPIRED') {
        triggerAutoLogout();
        return;
      }
      if (result.phase === 'WARNING') {
        setWarningSecondsLeft(result.remainingSeconds);
      } else {
        setWarningSecondsLeft((prev) => (prev !== null ? null : prev));
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        evaluateNow();
      }
    };

    window.addEventListener('pointerdown', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity, { passive: true });
    window.addEventListener('touchstart', recordActivity, { passive: true });
    window.addEventListener('scroll', recordActivity, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    const intervalId = window.setInterval(evaluateNow, 1_000);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
      window.removeEventListener('scroll', recordActivity);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [effectiveTimeoutMinutes, logoutSession, navigate, session.role]);

  if (warningSecondsLeft === null || session.role === 'GUEST' || effectiveTimeoutMinutes <= 0) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Peringatan batas waktu sesi tidak aktif"
      className="fixed bottom-4 right-4 z-[90] w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-amber-300 bg-white p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
          <ShieldAlert className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">
            Sesi akan berakhir dalam{' '}
            <span className="font-mono tabular-nums text-amber-700">{warningSecondsLeft} dtk</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            Tidak ada aktivitas terdeteksi (batas{' '}
            <span className="font-medium text-stone-800">
              {formatIdleTimeoutLabel(effectiveTimeoutMinutes)}
            </span>
            ). Klik Tetap Masuk untuk melanjutkan.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                lastActivityRef.current = Date.now();
                setWarningSecondsLeft(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
            >
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              Tetap Masuk
            </button>
            <button
              type="button"
              onClick={() => {
                const targetUrl =
                  session.role === 'MASTER_ADMIN'
                    ? '/master/login?reason=idle_timeout'
                    : '/login?reason=idle_timeout';
                setWarningSecondsLeft(null);
                void logoutSession().finally(() => navigate(targetUrl));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Keluar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
