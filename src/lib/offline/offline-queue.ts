/**
 * Offline Order Queue (Zero AI Tokens, Pure localStorage + CustomEvent)
 * Stores POS / QR Self-Order metadata alongside IndexedDB full workspace snapshots
 * and exposes real sync lifecycle events (NEVER clears queue until server HTTP 200 OK).
 */

export interface OfflineQueuedTransaction {
  id: string;
  source: 'POS_CASHIER' | 'QR_SELF_ORDER';
  tenantId: string;
  orderNumber: string;
  summary: string;
  grandTotal: string;
  queuedAt: string;
}

export interface OfflineSyncStatusSnapshot {
  state: 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';
  syncedCount: number;
  pendingCount?: number;
  lastError: string | null;
  updatedAt: string;
}

const OFFLINE_QUEUE_KEY = 'kasirakun_offline_tx_queue_v1';
const OFFLINE_QUEUE_EVENT = 'kasirakun-offline-queue-updated';
const OFFLINE_SYNC_STATUS_EVENT = 'kasirakun-offline-sync-status';

let currentSyncStatus: OfflineSyncStatusSnapshot = {
  state: 'IDLE',
  syncedCount: 0,
  lastError: null,
  updatedAt: new Date(0).toISOString(),
};

export function readOfflineQueue(): OfflineQueuedTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueuedTransaction[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineTransaction(
  item: Omit<OfflineQueuedTransaction, 'id' | 'queuedAt'>
): OfflineQueuedTransaction {
  const entry: OfflineQueuedTransaction = {
    ...item,
    id: `off-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    queuedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    const existing = readOfflineQueue();
    const deduped = existing.filter(
      (x) => !(x.tenantId === entry.tenantId && x.orderNumber === entry.orderNumber)
    );
    window.localStorage.setItem(
      OFFLINE_QUEUE_KEY,
      JSON.stringify([entry, ...deduped].slice(0, 100))
    );
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  }
  return entry;
}

export function removeOfflineTransactionsForTenant(tenantId: string): number {
  if (typeof window === 'undefined') return 0;
  const existing = readOfflineQueue();
  const remaining = existing.filter((x) => x.tenantId !== tenantId);
  const removedCount = existing.length - remaining.length;
  if (remaining.length === 0) {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } else {
    window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  }
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  return removedCount;
}

export function clearOfflineQueue(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(OFFLINE_QUEUE_KEY);
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  }
}

export function getOfflineSyncStatus(): OfflineSyncStatusSnapshot {
  return currentSyncStatus;
}

export function publishOfflineSyncStatus(next: Omit<OfflineSyncStatusSnapshot, 'updatedAt'>): void {
  currentSyncStatus = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_STATUS_EVENT, { detail: currentSyncStatus }));
  }
}

export function subscribeOfflineQueue(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(OFFLINE_QUEUE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(OFFLINE_QUEUE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function subscribeOfflineSyncStatus(
  callback: (snapshot: OfflineSyncStatusSnapshot) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback(currentSyncStatus);
  window.addEventListener(OFFLINE_SYNC_STATUS_EVENT, handler);
  return () => window.removeEventListener(OFFLINE_SYNC_STATUS_EVENT, handler);
}
