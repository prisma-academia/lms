"use client";

import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/client/api";
import { putPart } from "./xhr-part";
import { isRetryableStatus, delayFor, sleep, MAX_ATTEMPTS } from "./backoff";
import { putSession, deleteSession, listSessions, pruneSessions } from "./idb";
import type {
  PartState,
  PersistedSession,
  UploadMeta,
  UploadSnapshot,
  UploadTask,
  FileFingerprint,
} from "./types";

/**
 * Resumable upload manager.
 *
 * Concurrency uses two limits. The global part cap matters more than the
 * per-file one: six files each running four parts saturates the uplink and
 * makes every file crawl, so parts are pulled round-robin across active files
 * and every file visibly progresses.
 */
const MAX_ACTIVE_FILES = 3;
const MAX_ACTIVE_PARTS = 4;
/** Presign several parts per round trip rather than one at a time. */
const PRESIGN_WINDOW = 8;

const EMPTY_META: UploadMeta = {
  name: "",
  folderId: null,
  tagIds: [],
  isPublic: false,
  isFree: true,
  priceCents: null,
  currency: null,
};

function fingerprint(file: File): FileFingerprint {
  return { name: file.name, size: file.size, lastModified: file.lastModified, type: file.type };
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `u_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export class UploadManager {
  private tasks = new Map<string, UploadTask>();
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private presignCache = new Map<string, { url: string; expiresAt: number }>();
  private activeParts = 0;
  private pumping = false;
  private snapshot: UploadSnapshot = {
    tasks: [], totalBytes: 0, sentBytes: 0, activeCount: 0, doneCount: 0, rate: 0,
  };
  private dirty = false;
  private rafHandle: number | null = null;
  private rateWindow: { t: number; bytes: number }[] = [];
  private itemListeners = new Set<(itemId: string) => void>();

  /**
   * Notified after an item is committed, so the library view can refresh.
   * A subscription rather than an assignable property: assigning to a field on
   * a shared object from inside an effect is exactly the mutation the React
   * Compiler refuses to reason about.
   */
  onItemCreated = (fn: (itemId: string) => void): (() => void) => {
    this.itemListeners.add(fn);
    return () => this.itemListeners.delete(fn);
  };

  // --- store plumbing -------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): UploadSnapshot => this.snapshot;

  /**
   * Progress events fire ~50x/second per part. Rebuilding the snapshot on every
   * one would thrash React, so notifications are coalesced to one frame.
   */
  private notify(immediate = false): void {
    if (immediate) {
      this.rebuild();
      return;
    }
    this.dirty = true;
    if (this.rafHandle != null) return;
    const schedule = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (f: () => void) => setTimeout(f, 16);
    this.rafHandle = schedule(() => {
      this.rafHandle = null;
      if (this.dirty) this.rebuild();
    }) as unknown as number;
  }

  private rebuild(): void {
    this.dirty = false;
    const tasks = [...this.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
    let totalBytes = 0;
    let sentBytes = 0;
    let activeCount = 0;
    let doneCount = 0;
    for (const t of tasks) {
      totalBytes += t.fingerprint.size;
      for (const p of t.parts) sentBytes += p.status === "done" ? p.size : p.sent;
      if (t.status === "uploading" || t.status === "creating" || t.status === "completing") activeCount++;
      if (t.status === "done") doneCount++;
    }
    const now = Date.now();
    this.rateWindow.push({ t: now, bytes: sentBytes });
    this.rateWindow = this.rateWindow.filter((s) => now - s.t < 5000);
    const first = this.rateWindow[0];
    const rate =
      first && now > first.t ? Math.max(0, ((sentBytes - first.bytes) * 1000) / (now - first.t)) : 0;

    this.snapshot = { tasks, totalBytes, sentBytes, activeCount, doneCount, rate };
    for (const fn of this.listeners) fn();
  }

  private update(id: string, patch: Partial<UploadTask>): void {
    const t = this.tasks.get(id);
    if (!t) return;
    this.tasks.set(id, { ...t, ...patch });
  }

  // --- persistence ----------------------------------------------------------

  private async persist(task: UploadTask, handle?: FileSystemFileHandle): Promise<void> {
    const record: PersistedSession = {
      id: task.id,
      sessionId: task.sessionId,
      key: task.key,
      fingerprint: task.fingerprint,
      partSize: task.partSize,
      totalParts: task.parts.length,
      completedParts: task.parts
        .filter((p) => p.status === "done" && p.etag)
        .map((p) => ({ n: p.n, etag: p.etag!, size: p.size })),
      meta: task.meta,
      ...(handle ? { handle } : {}),
      createdAt: task.createdAt,
      updatedAt: Date.now(),
    };
    await putSession(record);
  }

  // --- public API -----------------------------------------------------------

  /**
   * Restore sessions from a previous page load. Nothing starts automatically:
   * silently consuming a user's uplink on page load is hostile, and on browsers
   * without File System Access the file must be re-picked anyway.
   */
  async restore(): Promise<void> {
    await pruneSessions();
    const [local, live] = await Promise.all([
      listSessions(),
      apiGet<{ id: string }[]>("/api/tenant/library/uploads"),
    ]);
    // The server is the authority on which sessions still exist.
    const liveIds = new Set((live.data ?? []).map((s) => s.id));

    for (const rec of local) {
      if (!rec.sessionId || !liveIds.has(rec.sessionId)) {
        await deleteSession(rec.id);
        continue;
      }
      const parts: PartState[] = Array.from({ length: rec.totalParts }, (_, i) => {
        const done = rec.completedParts.find((p) => p.n === i + 1);
        return done
          ? { n: i + 1, size: done.size, sent: done.size, etag: done.etag, status: "done" as const, attempt: 0 }
          : { n: i + 1, size: 0, sent: 0, status: "pending" as const, attempt: 0 };
      });
      let file: File | null = null;
      // Chromium: a stored handle can be reattached without a file picker, but
      // only if permission is still granted. We never prompt here — that
      // requires a user gesture and belongs on the Resume button.
      if (rec.handle) {
        try {
          const perm = await rec.handle.queryPermission?.({ mode: "read" });
          if (perm === "granted") file = await rec.handle.getFile();
        } catch {
          file = null;
        }
      }
      this.tasks.set(rec.id, {
        id: rec.id,
        sessionId: rec.sessionId,
        key: rec.key,
        file,
        fingerprint: rec.fingerprint,
        partSize: rec.partSize,
        parts,
        status: file ? "paused" : "needs-file",
        meta: rec.meta,
        createdAt: rec.createdAt,
        rate: 0,
      });
    }
    this.notify(true);
  }

  add(files: File[], meta?: Partial<UploadMeta>, handles?: (FileSystemFileHandle | undefined)[]): string[] {
    const ids: string[] = [];
    files.forEach((file, i) => {
      const id = uid();
      const task: UploadTask = {
        id,
        sessionId: null,
        key: null,
        file,
        fingerprint: fingerprint(file),
        partSize: 0,
        parts: [],
        status: "queued",
        meta: {
          ...EMPTY_META,
          ...meta,
          name: meta?.name ?? file.name.replace(/\.[^.]+$/, ""),
        },
        createdAt: Date.now() + i,
        rate: 0,
      };
      this.tasks.set(id, task);
      void this.persist(task, handles?.[i]);
      ids.push(id);
    });
    this.notify(true);
    void this.pump();
    return ids;
  }

  /** Reattach a re-picked file to a restored session. */
  reattach(id: string, file: File): { ok: boolean; error?: string } {
    const t = this.tasks.get(id);
    if (!t) return { ok: false, error: "That upload is no longer in the queue." };
    if (file.name !== t.fingerprint.name || file.size !== t.fingerprint.size) {
      return {
        ok: false,
        error: `That looks like a different file. Expected "${t.fingerprint.name}" at the same size.`,
      };
    }
    this.update(id, { file, status: "paused" });
    this.notify(true);
    return { ok: true };
  }

  /** True when the file was modified since it was first picked — resume may corrupt it. */
  isStale(id: string, file: File): boolean {
    const t = this.tasks.get(id);
    return !!t && file.lastModified !== t.fingerprint.lastModified;
  }

  setMeta(id: string, patch: Partial<UploadMeta>): void {
    const t = this.tasks.get(id);
    if (!t) return;
    this.update(id, { meta: { ...t.meta, ...patch } });
    const next = this.tasks.get(id);
    if (next) void this.persist(next);
    this.notify(true);
  }

  setMetaForAll(patch: Partial<UploadMeta>): void {
    for (const t of this.tasks.values()) {
      if (t.status === "done" || t.status === "aborted") continue;
      this.update(t.id, { meta: { ...t.meta, ...patch } });
    }
    this.notify(true);
  }

  start(id: string): void {
    const t = this.tasks.get(id);
    if (!t || !t.file) return;
    if (t.status === "done" || t.status === "uploading") return;
    this.update(id, { status: t.sessionId ? "uploading" : "queued", error: undefined });
    this.notify(true);
    void this.pump();
  }

  pause(id: string): void {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    const t = this.tasks.get(id);
    if (!t) return;
    // Parts mid-flight are discarded, not resumed byte-wise: S3 has no partial
    // part. They restart from zero on resume.
    this.update(id, {
      status: "paused",
      parts: t.parts.map((p) => (p.status === "active" ? { ...p, status: "pending", sent: 0 } : p)),
    });
    this.notify(true);
  }

  pauseAll(): void {
    for (const t of this.tasks.values()) {
      if (t.status === "uploading") this.pause(t.id);
    }
  }

  resumeAll(): void {
    for (const t of this.tasks.values()) {
      if (t.status === "paused" || t.status === "error") this.start(t.id);
    }
  }

  async cancel(id: string): Promise<void> {
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.sessionId) {
      await apiDelete(`/api/tenant/library/uploads/${t.sessionId}`);
    }
    await deleteSession(id);
    this.tasks.delete(id);
    this.notify(true);
  }

  /** Drop finished rows from the queue view; does not touch the uploaded files. */
  clearFinished(): void {
    for (const t of this.tasks.values()) {
      if (t.status === "done" || t.status === "aborted") {
        void deleteSession(t.id);
        this.tasks.delete(t.id);
      }
    }
    this.notify(true);
  }

  hasActive(): boolean {
    for (const t of this.tasks.values()) {
      if (t.status === "uploading" || t.status === "creating" || t.status === "completing") return true;
    }
    return false;
  }

  // --- engine ---------------------------------------------------------------

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      // Loop until no further work can be scheduled.
      for (;;) {
        const startable = [...this.tasks.values()].filter(
          (t) => t.status === "queued" && t.file
        );
        const running = [...this.tasks.values()].filter(
          (t) => t.status === "uploading" || t.status === "creating"
        );
        if (running.length < MAX_ACTIVE_FILES && startable.length > 0) {
          const next = startable[0];
          void this.runTask(next.id);
          // Give runTask a tick to flip status so it is counted next round.
          await sleep(0);
          continue;
        }
        break;
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || !task.file) return;

    const controller = new AbortController();
    this.controllers.set(id, controller);

    try {
      // --- create session (unless resuming) ---
      if (!task.sessionId) {
        this.update(id, { status: "creating" });
        this.notify(true);
        const res = await apiPost<{
          session: { id: string; key: string; partSizeBytes: number; totalParts: number };
        }>("/api/tenant/library/uploads", {
          filename: task.file.name,
          contentType: task.file.type || "application/octet-stream",
          totalBytes: task.file.size,
          folderId: task.meta.folderId,
          title: task.meta.title,
          description: task.meta.description,
        });
        if (res.error || !res.data) {
          this.fail(id, res.error?.message ?? "Could not start the upload.", (res.status ?? 0) === 0);
          return;
        }
        const s = res.data.session;
        const parts: PartState[] = Array.from({ length: s.totalParts }, (_, i) => {
          const start = i * s.partSizeBytes;
          const end = Math.min(task.file!.size, start + s.partSizeBytes);
          return { n: i + 1, size: end - start, sent: 0, status: "pending" as const, attempt: 0 };
        });
        this.update(id, { sessionId: s.id, key: s.key, partSize: s.partSizeBytes, parts, status: "uploading" });
        const withSession = this.tasks.get(id)!;
        await this.persist(withSession);
      } else {
        // Resuming: recompute part sizes from the reattached file.
        const t = this.tasks.get(id)!;
        this.update(id, {
          status: "uploading",
          parts: t.parts.map((p) => {
            if (p.status === "done") return p;
            const start = (p.n - 1) * t.partSize;
            const end = Math.min(task.file!.size, start + t.partSize);
            return { ...p, size: end - start, sent: 0, status: "pending" as const };
          }),
        });
      }
      this.notify(true);

      // --- upload parts ---
      await this.uploadParts(id, controller.signal);

      const after = this.tasks.get(id);
      if (!after || after.status !== "uploading") return; // paused/cancelled
      if (after.parts.some((p) => p.status !== "done")) return; // errored out

      // --- complete ---
      this.update(id, { status: "completing" });
      this.notify(true);
      await this.complete(id);
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      this.fail(id, e instanceof Error ? e.message : "Upload failed.", true);
    } finally {
      this.controllers.delete(id);
      void this.pump();
    }
  }

  private async uploadParts(id: string, signal: AbortSignal): Promise<void> {
    for (;;) {
      const task = this.tasks.get(id);
      if (!task || task.status !== "uploading" || signal.aborted) return;

      const pending = task.parts.filter((p) => p.status === "pending");
      const active = task.parts.filter((p) => p.status === "active").length;
      if (pending.length === 0) {
        if (active === 0) return;
        await sleep(50);
        continue;
      }
      if (this.activeParts >= MAX_ACTIVE_PARTS || active >= MAX_ACTIVE_PARTS) {
        await sleep(50);
        continue;
      }

      const part = pending[0];
      this.activeParts++;
      this.setPart(id, part.n, { status: "active", sent: 0 });
      void this.uploadOnePart(id, part.n, signal)
        .catch(() => {})
        .finally(() => {
          this.activeParts--;
        });
      await sleep(0);
    }
  }

  private async uploadOnePart(id: string, partNumber: number, signal: AbortSignal): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || !task.file || !task.sessionId) return;

    const part = task.parts.find((p) => p.n === partNumber);
    if (!part) return;

    const start = (partNumber - 1) * task.partSize;
    const blob = task.file.slice(start, start + part.size);

    for (let attempt = part.attempt; attempt < MAX_ATTEMPTS; attempt++) {
      if (signal.aborted) return;
      const url = await this.presignPart(task.sessionId, partNumber, attempt > 0);
      if (!url) {
        this.setPart(id, partNumber, { status: "pending", attempt: attempt + 1 });
        await sleep(delayFor(attempt), signal).catch(() => {});
        continue;
      }

      const res = await putPart({
        url,
        body: blob,
        signal,
        onProgress: (sent) => {
          this.setPart(id, partNumber, { sent });
          this.notify();
        },
      });

      if (res.ok) {
        this.setPart(id, partNumber, { status: "done", sent: part.size, etag: res.etag });
        await apiPut(`/api/tenant/library/uploads/${task.sessionId}/parts`, {
          partNumber,
          etag: res.etag,
          sizeBytes: part.size,
        });
        const t = this.tasks.get(id);
        if (t) await this.persist(t);
        this.notify(true);
        return;
      }

      if (res.status === -2) return; // aborted by pause/cancel

      // A 403 from S3 means the presigned URL expired. Re-presigning fixes it
      // immediately, so it must not consume the retry budget — otherwise a slow
      // upload burns all five attempts on clock drift alone.
      if (res.status === 403) {
        this.presignCache.delete(`${task.sessionId}:${partNumber}`);
        continue;
      }

      // A missing ETag is a bucket misconfiguration; retrying cannot fix it.
      if (res.status === -1) {
        this.setPart(id, partNumber, { status: "error" });
        this.fail(id, res.message, false);
        return;
      }

      if (!isRetryableStatus(res.status) || attempt === MAX_ATTEMPTS - 1) {
        this.setPart(id, partNumber, { status: "error" });
        this.fail(id, res.message, isRetryableStatus(res.status));
        return;
      }

      this.setPart(id, partNumber, { status: "pending", sent: 0, attempt: attempt + 1 });
      await sleep(delayFor(attempt), signal).catch(() => {});
    }
  }

  private async presignPart(sessionId: string, partNumber: number, force: boolean): Promise<string | null> {
    const cacheKey = `${sessionId}:${partNumber}`;
    const hit = this.presignCache.get(cacheKey);
    // 30s of headroom so a URL cannot expire mid-flight.
    if (!force && hit && hit.expiresAt - 30_000 > Date.now()) return hit.url;

    // Presign a window around this part so one round trip serves several.
    const window: number[] = [];
    for (let n = partNumber; n < partNumber + PRESIGN_WINDOW; n++) window.push(n);

    const res = await apiPost<{ parts: { partNumber: number; url: string }[]; expiresInSeconds: number }>(
      `/api/tenant/library/uploads/${sessionId}/parts`,
      { partNumbers: window }
    );
    if (res.error || !res.data) return null;
    const expiresAt = Date.now() + res.data.expiresInSeconds * 1000;
    for (const p of res.data.parts) {
      this.presignCache.set(`${sessionId}:${p.partNumber}`, { url: p.url, expiresAt });
    }
    return this.presignCache.get(cacheKey)?.url ?? null;
  }

  private async complete(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || !task.sessionId) return;
    const res = await apiPost<{ item: { id: string } }>(
      `/api/tenant/library/uploads/${task.sessionId}/complete`,
      {
        name: task.meta.name || task.fingerprint.name,
        title: task.meta.title,
        description: task.meta.description,
        folderId: task.meta.folderId,
        tagIds: task.meta.tagIds,
        isPublic: task.meta.isPublic,
        isFree: task.meta.isFree,
        priceCents: task.meta.priceCents,
        currency: task.meta.currency,
      }
    );
    if (res.error || !res.data) {
      this.fail(id, res.error?.message ?? "Could not finish the upload.", (res.status ?? 0) >= 500);
      return;
    }
    this.update(id, { status: "done", itemId: res.data.item.id });
    await deleteSession(id);
    this.notify(true);
    for (const fn of this.itemListeners) fn(res.data.item.id);
  }

  private setPart(id: string, n: number, patch: Partial<PartState>): void {
    const t = this.tasks.get(id);
    if (!t) return;
    this.update(id, { parts: t.parts.map((p) => (p.n === n ? { ...p, ...patch } : p)) });
  }

  private fail(id: string, message: string, retryable: boolean): void {
    this.update(id, { status: "error", error: { message, retryable } });
    this.notify(true);
  }
}

let singleton: UploadManager | null = null;

/** One manager per tab: uploads must survive route changes. */
export function getUploadManager(): UploadManager {
  if (!singleton) singleton = new UploadManager();
  return singleton;
}
