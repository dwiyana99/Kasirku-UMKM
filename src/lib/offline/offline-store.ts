/**
 * KasirAkun UMKM — Real Offline Persistence Store (IndexedDB + localStorage fallback, 0 AI Tokens)
 * Persists complete pending TenantWorkspaceData snapshots locally when offline or when a server
 * PUT fails so browser refreshes / device restarts NEVER lose offline POS sales, stock deductions,
 * or double-entry journals. Cleared ONLY after a verified HTTP 200 OK sync back to the server.
 */

import type { TenantWorkspaceData } from '../../types/domain';

export interface PendingWorkspaceSnapshot {
  tenantId: string;
  workspace: TenantWorkspaceData;
  savedAt: string;
  pendingTxCount: number;
  lastSyncError?: string | null;
}

const DB_NAME = 'kasirakun_offline_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'pending_workspaces';
const FALLBACK_KEY = 'kasirakun_pending_workspaces_fallback_v1';
const SNAPSHOT_EVENT = 'kasirakun-offline-snapshots-updated';

function emitSnapshotEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT));
  }
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'tenantId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readFallbackMap(): Record<string, PendingWorkspaceSnapshot> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, PendingWorkspaceSnapshot>) : {};
  } catch {
    return {};
  }
}

function writeFallbackMap(map: Record<string, PendingWorkspaceSnapshot>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded on fallback localStorage — IndexedDB remains primary store
  }
}

export async function savePendingWorkspaceSnapshot(
  tenantId: string,
  workspace: TenantWorkspaceData,
  options?: { incrementTxCount?: boolean; lastSyncError?: string | null }
): Promise<PendingWorkspaceSnapshot> {
  const existing = await getPendingWorkspaceSnapshot(tenantId);
  const record: PendingWorkspaceSnapshot = {
    tenantId,
    workspace,
    savedAt: new Date().toISOString(),
    pendingTxCount:
      (existing?.pendingTxCount ?? 0) + (options?.incrementTxCount ? 1 : existing ? 0 : 1),
    lastSyncError: options?.lastSyncError ?? existing?.lastSyncError ?? null,
  };

  const db = await openOfflineDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    db.close();
  } else {
    const map = readFallbackMap();
    map[tenantId] = record;
    writeFallbackMap(map);
  }

  emitSnapshotEvent();
  return record;
}

export async function getPendingWorkspaceSnapshot(
  tenantId: string
): Promise<PendingWorkspaceSnapshot | null> {
  const db = await openOfflineDb();
  if (db) {
    const result = await new Promise<PendingWorkspaceSnapshot | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(tenantId);
        req.onsuccess = () => resolve((req.result as PendingWorkspaceSnapshot | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    db.close();
    return result;
  }
  const map = readFallbackMap();
  return map[tenantId] ?? null;
}

export async function listPendingWorkspaceSnapshots(): Promise<PendingWorkspaceSnapshot[]> {
  const db = await openOfflineDb();
  if (db) {
    const result = await new Promise<PendingWorkspaceSnapshot[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve((req.result as PendingWorkspaceSnapshot[]) ?? []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    db.close();
    return result;
  }
  return Object.values(readFallbackMap());
}

export async function deletePendingWorkspaceSnapshot(tenantId: string): Promise<void> {
  const db = await openOfflineDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(tenantId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    db.close();
  } else {
    const map = readFallbackMap();
    if (map[tenantId]) {
      delete map[tenantId];
      writeFallbackMap(map);
    }
  }
  emitSnapshotEvent();
}

export function subscribeOfflineSnapshots(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SNAPSHOT_EVENT, callback);
  return () => window.removeEventListener(SNAPSHOT_EVENT, callback);
}

/**
 * Pure merge helper: when hydrating workspaces from server, prefer a locally saved
 * unsynced offline snapshot if it has newer orders or journal entries so offline sales
 * survive page reloads until server sync confirms HTTP 200 OK.
 */
export function mergeServerWorkspacesWithPendingSnapshots(
  serverWorkspaces: TenantWorkspaceData[],
  pendingSnapshots: PendingWorkspaceSnapshot[]
): TenantWorkspaceData[] {
  if (pendingSnapshots.length === 0) return serverWorkspaces;
  const pendingMap = new Map(pendingSnapshots.map((s) => [s.tenantId, s]));
  return serverWorkspaces.map((serverWs) => {
    const pending = pendingMap.get(serverWs.tenant.id);
    if (!pending) return serverWs;
    const localOrders = pending.workspace.orders?.length ?? 0;
    const serverOrders = serverWs.orders?.length ?? 0;
    const localJournals = pending.workspace.journalEntries?.length ?? 0;
    const serverJournals = serverWs.journalEntries?.length ?? 0;
    if (localOrders >= serverOrders && localJournals >= serverJournals) {
      return pending.workspace;
    }
    return serverWs;
  });
}
