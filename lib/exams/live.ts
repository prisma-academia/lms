import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { parsePaper } from "@/lib/exams/paper";
import { isPaused, remainingMs } from "@/lib/exams/timing";
import { parseSecurity } from "@/lib/exams/settings";

/**
 * The invigilation room's snapshot: every candidate with their latest attempt,
 * polled every few seconds. A fixed handful of queries however many
 * candidates there are (no per-candidate lookups).
 */

/** A heartbeat older than this and the candidate shows as offline. */
export const ONLINE_WINDOW_MS = 20_000;

/** Paper sizes never change once drawn, so they are remembered per attempt. */
const totalItemsCache = new Map<string, number>();
const CACHE_LIMIT = 20_000;

async function totalItemsFor(attemptIds: string[]): Promise<Map<string, number>> {
  const missing = attemptIds.filter((id) => !totalItemsCache.has(id));
  if (missing.length) {
    const rows = await prisma.examAttempt.findMany({ where: { id: { in: missing } }, select: { id: true, paperJson: true } });
    if (totalItemsCache.size + rows.length > CACHE_LIMIT) totalItemsCache.clear();
    for (const r of rows) {
      let n = 0;
      try {
        n = parsePaper(r.paperJson).sections.reduce((m, s) => m + s.items.length, 0);
      } catch {
        n = 0;
      }
      totalItemsCache.set(r.id, n);
    }
  }
  return new Map(attemptIds.map((id) => [id, totalItemsCache.get(id) ?? 0]));
}

export type LiveState = "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "LOCKED" | "SUBMITTED" | "TERMINATED";

export type LiveEvent = { type: string; severity: number; at: string };

export type LiveCandidate = {
  candidateId: string;
  fullName: string;
  candidateNo: string;
  regNumber: string | null;
  candidateStatus: string;
  extraTimePct: number;
  sitting: { id: string; name: string; pausedAt: string | null } | null;
  state: LiveState;
  attempt: null | {
    id: string;
    attemptNo: number;
    status: string;
    answeredCount: number;
    totalItems: number;
    remainingMs: number;
    paused: boolean;
    online: boolean;
    lastSeen: string | null;
    violationCount: number;
    sebVerified: boolean;
    offlineSubmitted: boolean;
    startedAt: string;
    submittedAt: string | null;
    submitReason: string | null;
    deadlineAt: string;
    ip: string | null;
    events: LiveEvent[];
  };
};

export type LiveSnapshot = {
  serverNow: string;
  exam: { id: string; title: string; status: string; durationMin: number; maxViolations: number; onMaxViolations: string };
  sittings: { id: string; name: string; pausedAt: string | null; startsAt: string | null; endsAt: string | null; venue: string | null }[];
  summary: {
    candidates: number;
    notStarted: number;
    inProgress: number;
    paused: number;
    locked: number;
    submitted: number;
    online: number;
    offline: number;
    flagged: number;
  };
  candidates: LiveCandidate[];
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function liveSnapshot(examId: string, tenantId: string): Promise<LiveSnapshot> {
  const now = new Date();
  const exam = await prisma.exam.findFirst({
    where: { id: examId, tenantId },
    select: {
      id: true,
      title: true,
      status: true,
      durationMin: true,
      securityJson: true,
      sittings: {
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, pausedAt: true, startsAt: true, endsAt: true, venue: true },
      },
    },
  });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const security = parseSecurity(exam.securityJson);
  const sittingById = new Map(exam.sittings.map((s) => [s.id, s]));

  const [candidates, attempts] = await Promise.all([
    prisma.examCandidate.findMany({
      where: { examId, tenantId },
      orderBy: [{ fullName: "asc" }],
      select: { id: true, fullName: true, candidateNo: true, regNumber: true, status: true, sittingId: true, extraTimePct: true },
    }),
    // The latest attempt per candidate.
    prisma.examAttempt.findMany({
      where: { examId, tenantId },
      distinct: ["candidateId"],
      orderBy: [{ candidateId: "asc" }, { attemptNo: "desc" }],
      select: {
        id: true,
        candidateId: true,
        attemptNo: true,
        status: true,
        answeredCount: true,
        deadlineAt: true,
        pausedAt: true,
        lastHeartbeatAt: true,
        violationCount: true,
        sebVerified: true,
        offlineSubmitted: true,
        startedAt: true,
        submittedAt: true,
        submitReason: true,
        ip: true,
      },
    }),
  ]);
  const attemptIds = attempts.map((a) => a.id);
  const [totals, events] = await Promise.all([
    totalItemsFor(attemptIds),
    attemptIds.length
      ? // Newest first, capped: enough for "the last three" of every tile.
        prisma.examEvent.findMany({
          where: { attemptId: { in: attemptIds }, tenantId },
          orderBy: { createdAt: "desc" },
          take: Math.min(6000, attemptIds.length * 12),
          select: { attemptId: true, type: true, severity: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const eventsBy = new Map<string, LiveEvent[]>();
  for (const e of events) {
    const list = eventsBy.get(e.attemptId) ?? [];
    if (list.length < 3) list.push({ type: e.type, severity: e.severity, at: e.createdAt.toISOString() });
    eventsBy.set(e.attemptId, list);
  }
  const attemptBy = new Map(attempts.map((a) => [a.candidateId, a]));

  const summary = { candidates: candidates.length, notStarted: 0, inProgress: 0, paused: 0, locked: 0, submitted: 0, online: 0, offline: 0, flagged: 0 };
  const rows: LiveCandidate[] = candidates.map((c) => {
    const sitting = c.sittingId ? sittingById.get(c.sittingId) ?? null : null;
    const a = attemptBy.get(c.id);
    if (!a) {
      summary.notStarted++;
      return {
        candidateId: c.id,
        fullName: c.fullName,
        candidateNo: c.candidateNo,
        regNumber: c.regNumber,
        candidateStatus: c.status,
        extraTimePct: c.extraTimePct,
        sitting: sitting ? { id: sitting.id, name: sitting.name, pausedAt: iso(sitting.pausedAt) } : null,
        state: "NOT_STARTED",
        attempt: null,
      };
    }
    const open = a.status === "IN_PROGRESS" || a.status === "PAUSED" || a.status === "LOCKED";
    const sittingPausedAt = sitting?.pausedAt ?? null;
    const paused = open && isPaused(a, sittingPausedAt);
    const online = open && !!a.lastHeartbeatAt && now.getTime() - a.lastHeartbeatAt.getTime() <= ONLINE_WINDOW_MS;
    let state: LiveState = a.status as LiveState;
    if (open && a.status === "IN_PROGRESS" && paused) state = "PAUSED";
    if (state === "IN_PROGRESS") summary.inProgress++;
    else if (state === "PAUSED") summary.paused++;
    else if (state === "LOCKED") summary.locked++;
    else summary.submitted++;
    if (open) {
      if (online) summary.online++;
      else summary.offline++;
    }
    if (a.violationCount > 0) summary.flagged++;
    return {
      candidateId: c.id,
      fullName: c.fullName,
      candidateNo: c.candidateNo,
      regNumber: c.regNumber,
      candidateStatus: c.status,
      extraTimePct: c.extraTimePct,
      sitting: sitting ? { id: sitting.id, name: sitting.name, pausedAt: iso(sitting.pausedAt) } : null,
      state,
      attempt: {
        id: a.id,
        attemptNo: a.attemptNo,
        status: a.status,
        answeredCount: a.answeredCount,
        totalItems: totals.get(a.id) ?? 0,
        remainingMs: open ? remainingMs(a, now, sittingPausedAt) : 0,
        paused,
        online,
        lastSeen: iso(a.lastHeartbeatAt),
        violationCount: a.violationCount,
        sebVerified: a.sebVerified,
        offlineSubmitted: a.offlineSubmitted,
        startedAt: a.startedAt.toISOString(),
        submittedAt: iso(a.submittedAt),
        submitReason: a.submitReason,
        deadlineAt: a.deadlineAt.toISOString(),
        ip: a.ip,
        events: eventsBy.get(a.id) ?? [],
      },
    };
  });

  return {
    serverNow: now.toISOString(),
    exam: {
      id: exam.id,
      title: exam.title,
      status: exam.status,
      durationMin: exam.durationMin,
      maxViolations: security.maxViolations,
      onMaxViolations: security.onMaxViolations,
    },
    sittings: exam.sittings.map((s) => ({
      id: s.id,
      name: s.name,
      pausedAt: iso(s.pausedAt),
      startsAt: iso(s.startsAt),
      endsAt: iso(s.endsAt),
      venue: s.venue,
    })),
    summary,
    candidates: rows,
  };
}
