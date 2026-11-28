"use client";

/**
 * The exam's local copy, in IndexedDB — so a dropped network, a crash or a
 * reload never loses an answer.
 *
 * Stores:
 *  - `attempts`  : one record per exam on this device: the attempt id, the
 *                  full candidate package and the clock as last seen.
 *  - `responses` : one record per question: the answer, flag, revision, and
 *                  `ackedRev` — the revision the server has confirmed.
 *  - `events`    : integrity events not yet confirmed by the server.
 *  - `notes`     : the candidate's scratchpad and highlights (never sent).
 *
 * Every write is awaited before the UI says "Saved on this device".
 * Fails soft (private browsing): the exam still runs, online only.
 */

import type { WindowPayload } from "@/lib/exams/candidate-view";

const DB_NAME = "mt-exam";
const DB_VERSION = 1;

export type LocalAttempt = {
  examId: string;
  attemptId: string;
  payload: WindowPayload;
  /** Server time minus local monotonic time at the last sync, for the clock. */
  lastServerNow: string;
  lastDeadlineAt: string;
  savedAt: number;
  /** A submit is waiting to be sent. */
  pendingSubmit: null | { reason: "MANUAL" | "TIME_UP" | "AWAY"; at: string };
  finished: boolean;
  /** Section timers and the furthest point reached (linear navigation). */
  progress: { sectionStartedAt: Record<string, number>; lockedSections: string[]; visited: string[]; current: string | null };
};

export type LocalResponse = {
  id: string; // `${attemptId}:${key}`
  attemptId: string;
  key: string;
  answer: unknown;
  flagged: boolean;
  rev: number;
  ackedRev: number;
  timeSpentSec: number;
  savedAt: string;
};

export type LocalEvent = {
  id: string;
  attemptId: string;
  type: string;
  at: string;
  detail?: Record<string, unknown>;
};

export type LocalNote = { id: string; attemptId: string; key: string; text: string; highlights: number[] };

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
      if (!db.objectStoreNames.contains("attempts")) db.createObjectStore("attempts", { keyPath: "examId" });
      if (!db.objectStoreNames.contains("responses")) {
        db.createObjectStore("responses", { keyPath: "id" }).createIndex("attemptId", "attemptId");
      }
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { keyPath: "id" }).createIndex("attemptId", "attemptId");
      }
      if (!db.objectStoreNames.contains("notes")) {
        db.createObjectStore("notes", { keyPath: "id" }).createIndex("attemptId", "attemptId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

export async function storageAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          let result: T | null = null;
          req.onsuccess = () => {
            result = req.result;
          };
          // Resolve on COMMIT, not on request success: "saved" must mean durable.
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

function byAttempt<T>(store: string, attemptId: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.index("attemptId").getAll(attemptId) as IDBRequest<T[]>).then((r) => r ?? []);
}

export const examStore = {
  getAttempt: (examId: string) => run<LocalAttempt>("attempts", "readonly", (s) => s.get(examId) as IDBRequest<LocalAttempt>),
  putAttempt: (a: LocalAttempt) => run("attempts", "readwrite", (s) => s.put(a)),
  deleteAttempt: (examId: string) => run("attempts", "readwrite", (s) => s.delete(examId) as unknown as IDBRequest<undefined>),

  responses: (attemptId: string) => byAttempt<LocalResponse>("responses", attemptId),
  putResponse: (r: LocalResponse) => run("responses", "readwrite", (s) => s.put(r)),
  async putResponses(rs: LocalResponse[]) {
    const db = await openDb();
    if (!db || rs.length === 0) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("responses", "readwrite");
      const st = tx.objectStore("responses");
      rs.forEach((r) => st.put(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  },

  events: (attemptId: string) => byAttempt<LocalEvent>("events", attemptId),
  putEvent: (e: LocalEvent) => run("events", "readwrite", (s) => s.put(e)),
  async deleteEvents(ids: string[]) {
    const db = await openDb();
    if (!db || ids.length === 0) return;
    await new Promise<void>((resolve) => {
      const tx = db.transaction("events", "readwrite");
      const st = tx.objectStore("events");
      ids.forEach((id) => st.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },

  notes: (attemptId: string) => byAttempt<LocalNote>("notes", attemptId),
  putNote: (n: LocalNote) => run("notes", "readwrite", (s) => s.put(n)),

  /** Forget everything for an attempt once the server has the final submit. */
  async clearAttempt(examId: string, attemptId: string) {
    const db = await openDb();
    if (!db) return;
    const [rs, es, ns] = await Promise.all([
      byAttempt<LocalResponse>("responses", attemptId),
      byAttempt<LocalEvent>("events", attemptId),
      byAttempt<LocalNote>("notes", attemptId),
    ]);
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["attempts", "responses", "events", "notes"], "readwrite");
      tx.objectStore("attempts").delete(examId);
      rs.forEach((r) => tx.objectStore("responses").delete(r.id));
      es.forEach((e) => tx.objectStore("events").delete(e.id));
      ns.forEach((n) => tx.objectStore("notes").delete(n.id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  },
};

/** A random id that survives without crypto.randomUUID (older browsers). */
export function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** This device's identity for the single-device rule. Kept in localStorage. */
export function deviceToken(): string {
  const KEY = "mt-exam-device";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = localId();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return localId();
  }
}
