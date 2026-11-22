import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  type QueryConstraint,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sanitizeFirestorePayload } from '../lib/db/firestore-sync';

export interface UseFirestoreCollectionOptions<T> {
  enabled: boolean;
  collectionPath: string | null;
  constraints?: QueryConstraint[];
  mapDoc: (id: string, data: Record<string, unknown>) => T | null;
}

export interface UseFirestoreCollectionResult<T> {
  items: T[];
  loading: boolean;
  hasInitialSnapshot: boolean;
  upsertItem: (docId: string, record: Record<string, unknown>) => Promise<void>;
  deleteItem: (docId: string) => Promise<void>;
}

/**
 * Generic realtime Firestore collection hook powered by `onSnapshot`.
 * Connects directly to the provisioned Firestore database (`ai-studio-3d6caf02-26ac-4b3a-be9b-b8f886eb86aa`),
 * enforces structured error reporting via `handleFirestoreError`, and supports CRUD mutations.
 */
export function useFirestoreCollection<T>({
  enabled,
  collectionPath,
  constraints = [],
  mapDoc,
}: UseFirestoreCollectionOptions<T>): UseFirestoreCollectionResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasInitialSnapshot, setHasInitialSnapshot] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const constraintKey = constraints.length;

  useEffect(() => {
    if (!enabled || !collectionPath) {
      setItems([]);
      setLoading(false);
      setHasInitialSnapshot(false);
      knownIdsRef.current = new Set();
      return;
    }

    setLoading(true);
    setHasInitialSnapshot(false);
    const colRef = collection(db, collectionPath);
    const q = constraints.length > 0 ? query(colRef, ...constraints) : colRef;

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const mapped: T[] = [];
        const nextIds = new Set<string>();
        snapshot.forEach((docSnap) => {
          nextIds.add(docSnap.id);
          const parsed = mapDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
          if (parsed !== null) {
            mapped.push(parsed);
          }
        });
        knownIdsRef.current = nextIds;
        setItems(mapped);
        setLoading(false);
        setHasInitialSnapshot(true);
      },
      (error) => {
        setLoading(false);
        setHasInitialSnapshot(true);
        handleFirestoreError(error, OperationType.GET, collectionPath);
      }
    );

    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, collectionPath, constraintKey]);

  const upsertItem = useCallback(
    async (docId: string, record: Record<string, unknown>) => {
      if (!collectionPath) return;
      const targetPath = `${collectionPath}/${docId}`;
      try {
        const docRef = doc(db, collectionPath, docId);
        let existsAlready = knownIdsRef.current.has(docId);
        if (!existsAlready) {
          const snap = await getDoc(docRef);
          existsAlready = snap.exists();
          if (existsAlready) {
            knownIdsRef.current.add(docId);
          }
        }
        const cleanRecord = sanitizeFirestorePayload(record);
        await setDoc(
          docRef,
          {
            ...cleanRecord,
            ...(existsAlready ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        knownIdsRef.current.add(docId);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, targetPath);
      }
    },
    [collectionPath]
  );

  const deleteItem = useCallback(
    async (docId: string) => {
      if (!collectionPath) return;
      const targetPath = `${collectionPath}/${docId}`;
      try {
        await deleteDoc(doc(db, collectionPath, docId));
        knownIdsRef.current.delete(docId);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, targetPath);
      }
    },
    [collectionPath]
  );

  return { items, loading, hasInitialSnapshot, upsertItem, deleteItem };
}
