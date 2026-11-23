import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';
import {
  getOfflineSyncStatus,
  readOfflineQueue,
  subscribeOfflineQueue,
  subscribeOfflineSyncStatus,
  type OfflineQueuedTransaction,
  type OfflineSyncStatusSnapshot,
} from '../lib/offline/offline-queue';
import {
  listPendingWorkspaceSnapshots,
  subscribeOfflineSnapshots,
} from '../lib/offline/offline-store';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [queuedItems, setQueuedItems] = useState<OfflineQueuedTransaction[]>(() => readOfflineQueue());
  const [pendingSnapshotCount, setPendingSnapshotCount] = useState<number>(0);
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatusSnapshot>(() => getOfflineSyncStatus());

  useEffect(() => {
    let active = true;
    const refreshSnapshots = async () => {
      const snaps = await listPendingWorkspaceSnapshots();
      if (active) setPendingSnapshotCount(snaps.length);
    };
    void refreshSnapshots();
    const unsubQueue = subscribeOfflineQueue(() => {
      setQueuedItems(readOfflineQueue());
    });
    const unsubSnap = subscribeOfflineSnapshots(() => {
      void refreshSnapshots();
    });
    const unsubSync = subscribeOfflineSyncStatus((next) => {
      setSyncStatus(next);
    });
    return () => {
      active = false;
      unsubQueue();
      unsubSnap();
      unsubSync();
    };
  }, []);

  const triggerManualSync = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kasirakun-trigger-offline-sync'));
    }
  };

  const pendingTotal = Math.max(queuedItems.length, pendingSnapshotCount);

  if (!isOnline) {
    return (
      <div
        role="status"
        data-testid="offline-status-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-sm max-w-md"
      >
        <WifiOff className="h-4 w-4 shrink-0 text-amber-700" strokeWidth={1.75} />
        <span>
          Mode Offline aktif · Transaksi tunai tetap berjalan &amp; tersimpan aman di perangkat
          {pendingTotal > 0 ? ` (${pendingTotal} antrean lokal)` : ''}.
        </span>
      </div>
    );
  }

  if (syncStatus.state === 'SYNCING') {
    return (
      <div
        role="status"
        data-testid="offline-syncing-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 shadow-sm"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600 shrink-0" strokeWidth={1.75} />
        <span>
          Menyinkronkan {syncStatus.pendingCount || pendingTotal} data offline ke server...
        </span>
      </div>
    );
  }

  if (syncStatus.state === 'ERROR') {
    return (
      <div
        role="alert"
        data-testid="offline-sync-error-banner"
        className="fixed bottom-4 left-4 z-50 flex flex-wrap items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-900 shadow-sm max-w-md"
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={1.75} />
        <span>
          {syncStatus.lastError || 'Gagal menyinkronkan data offline.'}
        </span>
        <button
          type="button"
          onClick={triggerManualSync}
          className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-semibold transition-colors"
        >
          Coba Sinkronkan Lagi
        </button>
      </div>
    );
  }

  if (syncStatus.state === 'SYNCED' && syncStatus.syncedCount > 0) {
    return (
      <div
        role="status"
        data-testid="offline-synced-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-sm"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" strokeWidth={1.75} />
        <span>
          Koneksi aktif · {syncStatus.syncedCount} data offline berhasil tersinkron ke server.
        </span>
      </div>
    );
  }

  if (pendingTotal > 0) {
    return (
      <div
        role="status"
        data-testid="offline-pending-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-sm"
      >
        <RefreshCw className="h-3.5 w-3.5 text-amber-700 shrink-0" strokeWidth={1.75} />
        <span>{pendingTotal} data lokal menunggu sinkronisasi.</span>
        <button
          type="button"
          onClick={triggerManualSync}
          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors"
        >
          Sinkronkan
        </button>
      </div>
    );
  }

  return null;
};

