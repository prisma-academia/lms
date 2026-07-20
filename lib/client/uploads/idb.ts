"use client";

import type { PersistedSession } from "./types";

/**
 * Minimal IndexedDB wrapper for the upload session ledger.
 *
 * IndexedDB rather than localStorage: a record is written after every completed
 * part, and localStorage writes are synchronous on the main thread — that would
 * jank the UI during an upload. IDB is also structured-clone, which is what
 * makes storing a FileSystemFileHandle possible at all.
 *
 * Only the ledger is stored, never file bytes.
 */

const DB_NAME = "mt-uploads";
const DB_VERSION = 1;
const STORE = "sessions";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private browsing and disabled-storage modes both land here. Uploads still
    // work; they just cannot be resumed after a reload.
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    let req: IDBRequest<T>;
    try {
      req = fn(db.transaction(STORE, mode).objectStore(STORE));
    } catch {
      return resolve(null);
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function putSession(s: PersistedSession): Promise<void> {
  await tx("readwrite", (store) => store.put(s) as IDBRequest<IDBValidKey>);
}

export async function deleteSession(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function listSessions(): Promise<PersistedSession[]> {
  const all = await tx<PersistedSession[]>("readonly", (store) => store.getAll() as IDBRequest<PersistedSession[]>);
  return all ?? [];
}

/**
 * Drop records past the point where resuming is possible. The bucket's
 * AbortIncompleteMultipartUpload lifecycle rule kills the underlying S3 upload
 * after ~7 days, so an older record would only ever fail on resume.
 */
export async function pruneSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const now = Date.now();
  for (const s of await listSessions()) {
    if (now - s.updatedAt > maxAgeMs) await deleteSession(s.id);
  }
}
