"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/client/api";
import { examStore, deviceToken, localId, type LocalAttempt, type LocalResponse } from "@/lib/client/exam/store";
import type { WindowPayload } from "@/lib/exams/candidate-view";
import { isResponseAnswered } from "@/lib/assessments/types";

/**
 * The exam window's engine: boot, answers, the clock, sync and submit.
 *
 * - Every answer is written to IndexedDB before anything else, then synced.
 *   The server keeps the newest revision of each answer, so resending is
 *   always safe and an offline spell loses nothing.
 * - The clock counts down to the SERVER deadline using a monotonic timer
 *   anchored at the last server reply — changing the device clock does nothing.
 * - A submit made offline is queued on the device and sent when the network
 *   returns; the server accepts it inside the exam's offline grace window.
 */

export type ConnState = "online" | "syncing" | "offline";
export type Phase = "booting" | "error" | "running" | "finished";
export type Announcement = { id: string; message: string; at: string };

type SyncReply = {
  serverNow: string;
  status: string;
  deadlineAt: string;
  paused: boolean;
  remainingMs: number;
  accepted: Record<string, number>;
  rejected: string[];
  violationCount: number;
  strikes: number;
  maxViolations: number;
  onMaxViolations: "WARN" | "LOCK" | "AUTO_SUBMIT";
  announcements: Announcement[];
  finished: boolean;
};

const SYNC_EVERY_MS = 5_000;
const CHANGE_DEBOUNCE_MS = 1_200;

export function useExamEngine(examId: string) {
  const [phase, setPhase] = useState<Phase>("booting");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [payload, setPayload] = useState<WindowPayload | null>(null);
  const [responses, setResponses] = useState<Record<string, LocalResponse>>({});
  const [conn, setConn] = useState<ConnState>("online");
  const [status, setStatus] = useState<string>("IN_PROGRESS");
  const [paused, setPaused] = useState(false);
  const [strikes, setStrikes] = useState({ count: 0, max: 0, action: "LOCK" as SyncReply["onMaxViolations"] });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pendingSubmit, setPendingSubmit] = useState<LocalAttempt["pendingSubmit"]>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [usingLocalCopy, setUsingLocalCopy] = useState(false);

  const attemptRef = useRef<LocalAttempt | null>(null);
  const responsesRef = useRef<Record<string, LocalResponse>>({});
  const clockRef = useRef<{ server: number; perf: number; deadline: number; frozen: number | null }>({ server: 0, perf: 0, deadline: 0, frozen: null });
  const syncing = useRef(false);
  const wasOffline = useRef(false);
  const lastAnnouncementAt = useRef<string | undefined>(undefined);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(0);
  const nextAllowed = useRef(0);
  const device = useMemo(() => (typeof window === "undefined" ? "" : deviceToken()), []);

  const serverNow = useCallback(() => clockRef.current.server + (performance.now() - clockRef.current.perf), []);
  const remainingMs = useCallback(() => {
    const c = clockRef.current;
    if (c.frozen !== null) return c.frozen;
    return Math.max(0, c.deadline - serverNow());
  }, [serverNow]);

  function applyClock(serverIso: string, deadlineIso: string, frozen: number | null, perfMid: number) {
    clockRef.current = { server: Date.parse(serverIso), perf: perfMid, deadline: Date.parse(deadlineIso), frozen };
  }

  async function persistAttempt(patch: Partial<LocalAttempt>) {
    if (!attemptRef.current) return;
    attemptRef.current = { ...attemptRef.current, ...patch, savedAt: Date.now() };
    await examStore.putAttempt(attemptRef.current);
  }

  /* ───────────────────────────── boot ───────────────────────────── */

  const boot = useCallback(async () => {
    setPhase("booting");
    setError(null);
    const local = await examStore.getAttempt(examId);
    const t0 = performance.now();
    const res = await apiPost<WindowPayload>(`/api/exam/${examId}/start`, { deviceToken: device });
    const t1 = performance.now();

    if (res.data) {
      const p = res.data;
      const serverResponses = new Map(p.responses.map((r) => [r.key, r]));
      let localResponses: LocalResponse[] = [];
      if (local && local.attemptId === p.attemptId) {
        localResponses = await examStore.responses(p.attemptId);
      } else if (local) {
        await examStore.clearAttempt(examId, local.attemptId);
      }
      const merged: Record<string, LocalResponse> = {};
      for (const r of localResponses) merged[r.key] = r;
      for (const [key, s] of serverResponses) {
        const mine = merged[key];
        if (!mine || s.rev >= mine.rev) {
          merged[key] = {
            id: `${p.attemptId}:${key}`,
            attemptId: p.attemptId,
            key,
            answer: s.answer,
            flagged: s.flagged,
            rev: s.rev,
            ackedRev: s.rev,
            timeSpentSec: s.timeSpentSec,
            savedAt: new Date().toISOString(),
          };
        } else {
          merged[key] = { ...mine, ackedRev: Math.max(mine.ackedRev, s.rev) };
        }
      }
      await examStore.putResponses(Object.values(merged));
      const attempt: LocalAttempt = {
        examId,
        attemptId: p.attemptId,
        payload: p,
        lastServerNow: p.serverNow,
        lastDeadlineAt: p.deadlineAt,
        savedAt: Date.now(),
        pendingSubmit: local?.attemptId === p.attemptId ? local.pendingSubmit : null,
        finished: false,
        progress:
          local?.attemptId === p.attemptId
            ? local.progress
            : { sectionStartedAt: {}, lockedSections: [], visited: [], current: null },
      };
      attemptRef.current = attempt;
      await examStore.putAttempt(attempt);
      responsesRef.current = merged;
      setResponses(merged);
      setPayload(p);
      setStatus(p.status);
      setPaused(p.paused);
      setPendingSubmit(attempt.pendingSubmit);
      setStrikes((s) => ({ ...s, count: p.violationCount, max: p.exam.security.maxViolations, action: p.exam.security.onMaxViolations }));
      applyClock(p.serverNow, p.deadlineAt, p.paused ? p.remainingMs : null, (t0 + t1) / 2);
      setConn("online");
      setUsingLocalCopy(false);
      setPhase("running");
      return;
    }

    // No network: carry on from this device's copy if there is one.
    if (res.status === 0 && local && !local.finished) {
      const rs = await examStore.responses(local.attemptId);
      const map = Object.fromEntries(rs.map((r) => [r.key, r]));
      attemptRef.current = local;
      responsesRef.current = map;
      setResponses(map);
      setPayload(local.payload);
      setStatus(local.payload.status);
      setPendingSubmit(local.pendingSubmit);
      // Without a server reply the best estimate is the device clock against
      // the stored deadline; the next successful sync corrects it.
      clockRef.current = { server: Date.now(), perf: performance.now(), deadline: Date.parse(local.lastDeadlineAt), frozen: null };
      wasOffline.current = true;
      setConn("offline");
      setUsingLocalCopy(true);
      setPhase("running");
      return;
    }
    setError(res.error ?? { code: "offline", message: "Could not reach the exam server. Check the connection and try again." });
    setPhase("error");
  }, [examId, device]);

  /* ───────────────────────────── sync ───────────────────────────── */

  const sync = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const attempt = attemptRef.current;
      if (!attempt || syncing.current) return;
      if (!opts.force && Date.now() < nextAllowed.current) return;
      syncing.current = true;
      setConn((c) => (c === "offline" ? c : "syncing"));
      try {
        const dirty = Object.values(responsesRef.current).filter((r) => r.rev > r.ackedRev);
        const events = (await examStore.events(attempt.attemptId)).slice(0, 200);
        const t0 = performance.now();
        const res = await apiPost<SyncReply>(`/api/exam/attempts/${attempt.attemptId}/sync`, {
          deviceToken: device,
          responses: dirty.map((r) => ({
            key: r.key,
            answer: r.answer ?? null,
            flagged: r.flagged,
            timeSpentSec: Math.round(r.timeSpentSec),
            rev: r.rev,
            savedAt: r.savedAt,
          })),
          events: events.map((e) => ({ id: e.id, type: e.type, at: e.at, detail: e.detail })),
          wasOffline: wasOffline.current,
          since: lastAnnouncementAt.current,
          ...(attempt.pendingSubmit ? { submit: { reason: attempt.pendingSubmit.reason } } : {}),
        });
        const t1 = performance.now();
        if (!res.data) {
          if (res.status === 0 || (res.status ?? 0) >= 500) {
            wasOffline.current = true;
            setConn("offline");
            backoff.current = Math.min(6, backoff.current + 1);
            nextAllowed.current = Date.now() + Math.min(30_000, 1_000 * 2 ** backoff.current);
          } else if (res.error?.code === "other_device") {
            setError(res.error);
            setPhase("error");
          } else {
            setConn("online");
          }
          return;
        }
        backoff.current = 0;
        nextAllowed.current = 0;
        const d = res.data;
        // Confirm what the server accepted.
        const next = { ...responsesRef.current };
        const confirmed: LocalResponse[] = [];
        for (const [key, rev] of Object.entries(d.accepted)) {
          const r = next[key];
          if (r && rev >= r.ackedRev) {
            next[key] = { ...r, ackedRev: Math.min(r.rev, rev) };
            confirmed.push(next[key]);
          }
        }
        responsesRef.current = next;
        setResponses(next);
        await examStore.putResponses(confirmed);
        await examStore.deleteEvents(events.map((e) => e.id));
        wasOffline.current = false;

        applyClock(d.serverNow, d.deadlineAt, d.paused ? d.remainingMs : null, (t0 + t1) / 2);
        await persistAttempt({ lastServerNow: d.serverNow, lastDeadlineAt: d.deadlineAt });
        setStatus(d.status);
        setPaused(d.paused);
        setStrikes({ count: d.strikes, max: d.maxViolations, action: d.onMaxViolations });
        if (d.announcements.length) {
          lastAnnouncementAt.current = d.announcements[d.announcements.length - 1].at;
          setAnnouncements((prev) => [...prev, ...d.announcements.filter((a) => !prev.some((p) => p.id === a.id))]);
        }
        setLastSyncAt(Date.now());
        setConn("online");
        setUsingLocalCopy(false);
        if (d.finished) {
          await persistAttempt({ finished: true, pendingSubmit: null });
          setPendingSubmit(null);
          setPhase("finished");
          await examStore.clearAttempt(examId, attempt.attemptId);
        }
      } finally {
        syncing.current = false;
      }
    },
    [device, examId]
  );

  const scheduleSync = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void sync(), CHANGE_DEBOUNCE_MS);
  }, [sync]);

  /* ───────────────────────────── answering ───────────────────────────── */

  const write = useCallback(
    async (key: string, patch: Partial<Pick<LocalResponse, "answer" | "flagged" | "timeSpentSec">>) => {
      const attempt = attemptRef.current;
      if (!attempt) return;
      const prev = responsesRef.current[key];
      const r: LocalResponse = {
        id: `${attempt.attemptId}:${key}`,
        attemptId: attempt.attemptId,
        key,
        answer: prev?.answer ?? null,
        flagged: prev?.flagged ?? false,
        rev: (prev?.rev ?? 0) + 1,
        ackedRev: prev?.ackedRev ?? 0,
        timeSpentSec: prev?.timeSpentSec ?? 0,
        ...patch,
        savedAt: new Date().toISOString(),
      };
      responsesRef.current = { ...responsesRef.current, [key]: r };
      setResponses(responsesRef.current);
      await examStore.putResponse(r);
      scheduleSync();
    },
    [scheduleSync]
  );

  const setAnswer = useCallback((key: string, answer: unknown) => write(key, { answer }), [write]);
  const toggleFlag = useCallback((key: string) => write(key, { flagged: !responsesRef.current[key]?.flagged }), [write]);
  const addTime = useCallback(
    (key: string, seconds: number) => {
      if (seconds < 1) return;
      const prev = responsesRef.current[key];
      return write(key, { timeSpentSec: (prev?.timeSpentSec ?? 0) + seconds });
    },
    [write]
  );

  const logEvent = useCallback(
    async (type: string, detail?: Record<string, unknown>) => {
      const attempt = attemptRef.current;
      if (!attempt) return;
      await examStore.putEvent({ id: localId(), attemptId: attempt.attemptId, type, at: new Date().toISOString(), detail });
      scheduleSync();
    },
    [scheduleSync]
  );

  const submit = useCallback(
    async (reason: "MANUAL" | "TIME_UP" | "AWAY") => {
      if (!attemptRef.current || attemptRef.current.pendingSubmit) return;
      const pending = { reason, at: new Date().toISOString() };
      await persistAttempt({ pendingSubmit: pending });
      setPendingSubmit(pending);
      await sync({ force: true });
    },
    [sync]
  );

  const saveProgress = useCallback(async (progress: LocalAttempt["progress"]) => {
    await persistAttempt({ progress });
  }, []);

  /* ───────────────────────────── loops ───────────────────────────── */

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader sets state only after await, not synchronously
    void boot();
  }, [boot]);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => void sync(), SYNC_EVERY_MS);
    const online = () => {
      nextAllowed.current = 0;
      void sync({ force: true });
    };
    const offline = () => {
      wasOffline.current = true;
      setConn("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [phase, sync]);

  // Time up: submit on the device the moment the server clock says so.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      if (!paused && status === "IN_PROGRESS" && !attemptRef.current?.pendingSubmit && remainingMs() <= 0) {
        void submit("TIME_UP");
      }
    }, 500);
    return () => clearInterval(t);
  }, [phase, paused, status, remainingMs, submit]);

  const stats = useMemo(() => {
    const items = payload?.pkg.items ?? [];
    let answered = 0;
    let flagged = 0;
    for (const it of items) {
      const r = responses[it.key];
      if (r && isResponseAnswered(it.type, r.answer)) answered++;
      if (r?.flagged) flagged++;
    }
    const unsynced = Object.values(responses).filter((r) => r.rev > r.ackedRev).length;
    return { total: items.length, answered, flagged, unsynced };
  }, [payload, responses]);

  return {
    phase,
    error,
    payload,
    responses,
    conn,
    status,
    paused,
    strikes,
    announcements,
    dismissAnnouncement: (id: string) => setAnnouncements((prev) => prev.filter((a) => a.id !== id)),
    pendingSubmit,
    lastSyncAt,
    usingLocalCopy,
    stats,
    remainingMs,
    setAnswer,
    toggleFlag,
    addTime,
    logEvent,
    submit,
    sync,
    retry: boot,
    progress: () => attemptRef.current?.progress ?? { sectionStartedAt: {}, lockedSections: [], visited: [], current: null },
    saveProgress,
  };
}

export type ExamEngine = ReturnType<typeof useExamEngine>;
