import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { isResponseAnswered } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";
import { buildPaper, loadExamForPaper, PaperError, parsePaper } from "@/lib/exams/paper";
import { acceptsSave, computeDeadline, isPaused, remainingMs, windowState } from "@/lib/exams/timing";
import { parseSecurity } from "@/lib/exams/settings";
import { ipAllowed } from "@/lib/exams/ip";
import { Prisma } from "@/lib/generated/prisma/client";
import { getContext, runWithContext } from "@/lib/db/tenant-context";

/**
 * The life of an exam attempt: start (or resume), sync answers and integrity
 * events, and finish. Every rule that decides whether a candidate may do
 * something lives here, so the routes stay thin and the jobs reuse it.
 */

export const OPEN_STATUSES = ["IN_PROGRESS", "PAUSED", "LOCKED"] as const;

/* ───────────────────────────── integrity events ───────────────────────────── */

/**
 * What each event costs. The client says what happened; the SERVER decides
 * whether it counts as a violation, so a modified client cannot downgrade one.
 */
export const EVENT_SEVERITY: Record<string, 0 | 1 | 2> = {
  FULLSCREEN_EXIT: 2,
  TAB_HIDDEN: 2,
  WINDOW_BLUR: 2,
  COPY: 2,
  CUT: 2,
  PASTE: 2,
  CONTEXT_MENU: 1,
  KEY_BLOCKED: 1,
  PRINT_ATTEMPT: 2,
  MULTI_SCREEN: 2,
  DEVTOOLS_SUSPECTED: 1,
  AWAY_TIMEOUT: 2,
  DEVICE_MISMATCH: 1,
  IP_CHANGED: 1,
  SEB_MISSING: 1,
  OFFLINE: 0,
  ONLINE: 0,
  RESUMED: 0,
  STARTED: 0,
  FULLSCREEN_ENTER: 0,
  RETURNED: 0,
  SUBMITTED: 0,
};

/** Which security switch turns an event type into something that is counted. */
const EVENT_SWITCH: Record<string, keyof ReturnType<typeof parseSecurity>> = {
  FULLSCREEN_EXIT: "requireFullscreen",
  TAB_HIDDEN: "detectTabSwitch",
  WINDOW_BLUR: "detectTabSwitch",
  AWAY_TIMEOUT: "detectTabSwitch",
  COPY: "blockClipboard",
  CUT: "blockClipboard",
  PASTE: "blockClipboard",
  CONTEXT_MENU: "blockContextMenu",
  KEY_BLOCKED: "blockShortcuts",
  PRINT_ATTEMPT: "blockPrint",
  MULTI_SCREEN: "detectMultiScreen",
};

export function severityFor(type: string, security: ReturnType<typeof parseSecurity>): 0 | 1 | 2 {
  const base = EVENT_SEVERITY[type] ?? 0;
  const sw = EVENT_SWITCH[type];
  if (sw && security[sw] === false) return 0;
  return base;
}

/* ───────────────────────────── start / resume ───────────────────────────── */

export type StartInput = {
  examId: string;
  candidateId: string;
  deviceToken: string;
  ip: string | null;
  userAgent: string | null;
  sebVerified: boolean;
};

export async function startOrResume(input: StartInput) {
  const now = new Date();
  const candidate = await prisma.examCandidate.findFirst({
    where: { id: input.candidateId, examId: input.examId },
    include: { sitting: true, exam: true },
  });
  if (!candidate) throw new DomainError(404, "not_found", "Exam not found.");
  const exam = candidate.exam;
  if (candidate.status !== "ACTIVE") throw new DomainError(403, "candidate_blocked", "You are not allowed to sit this exam. Speak to the invigilator.");

  const security = parseSecurity(exam.securityJson);
  const open = await prisma.examAttempt.findFirst({
    where: { candidateId: candidate.id, status: { in: [...OPEN_STATUSES] } },
    orderBy: { attemptNo: "desc" },
  });

  if (open) {
    if (security.singleDevice && open.deviceToken && open.deviceToken !== input.deviceToken) {
      await prisma.examEvent.create({
        data: { tenantId: open.tenantId, attemptId: open.id, type: "DEVICE_MISMATCH", severity: 1, detailJson: { ip: input.ip } },
      });
      throw new DomainError(
        409,
        "other_device",
        "This exam is already open on another device. Ask the invigilator to move it to this one."
      );
    }
    const ipChanged = !!open.ip && !!input.ip && open.ip !== input.ip;
    await prisma.$transaction([
      prisma.examAttempt.update({
        where: { id: open.id },
        data: { deviceToken: open.deviceToken ?? input.deviceToken, lastHeartbeatAt: now, ip: input.ip ?? open.ip, sebVerified: open.sebVerified || input.sebVerified },
      }),
      prisma.examEvent.create({
        data: {
          tenantId: open.tenantId,
          attemptId: open.id,
          type: ipChanged ? "IP_CHANGED" : "RESUMED",
          severity: ipChanged ? 1 : 0,
          detailJson: { ip: input.ip, previousIp: open.ip },
        },
      }),
    ]);
    return { attempt: { ...open, deviceToken: open.deviceToken ?? input.deviceToken }, resumed: true, exam, candidate };
  }

  // A paused room admits nobody new: their clock could not be held with the others'.
  if (candidate.sitting?.pausedAt) {
    throw new DomainError(409, "sitting_paused", "The exam room is paused by the invigilator. Wait for it to resume, then start.");
  }
  const state = windowState(exam, candidate.sitting, now);
  if (state === "draft") throw new DomainError(403, "not_published", "This exam is not open yet.");
  if (state === "upcoming") throw new DomainError(403, "upcoming", "This exam has not started yet.");
  if (state === "entry_closed") throw new DomainError(403, "entry_closed", "Entry to this exam has closed.");
  if (state === "closed") throw new DomainError(403, "closed", "This exam has closed.");

  const done = await prisma.examAttempt.findMany({
    where: { candidateId: candidate.id },
    select: { attemptNo: true, submittedAt: true },
    orderBy: { attemptNo: "desc" },
  });
  if (done.length >= exam.attemptsAllowed) {
    throw new DomainError(403, "no_attempts_left", exam.attemptsAllowed === 1 ? "You have already sat this exam." : "You have used all your attempts.");
  }
  const last = done[0]?.submittedAt;
  if (last && exam.cooldownMin && now.getTime() - last.getTime() < exam.cooldownMin * 60_000) {
    const mins = Math.ceil((exam.cooldownMin * 60_000 - (now.getTime() - last.getTime())) / 60_000);
    throw new DomainError(403, "cooldown", `You can try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
  if (security.enforceIpAllowlist && candidate.sitting && !ipAllowed(input.ip, candidate.sitting.ipAllowlist)) {
    throw new DomainError(403, "ip_not_allowed", "This exam can only be taken from the exam centre's network.");
  }

  const full = await loadExamForPaper(exam.id);
  if (!full) throw new DomainError(404, "not_found", "Exam not found.");
  const seed = randomInt(1, 2_147_483_646);
  let paper;
  try {
    paper = await buildPaper(full, seed);
  } catch (e) {
    if (e instanceof PaperError) throw new DomainError(409, "paper_unavailable", "This exam is not set up correctly yet. Please tell the invigilator.");
    throw e;
  }
  const deadlineAt = computeDeadline(exam, candidate, candidate.sitting, now);
  const attempt = await prisma.examAttempt.create({
    data: {
      tenantId: exam.tenantId,
      examId: exam.id,
      candidateId: candidate.id,
      attemptNo: (done[0]?.attemptNo ?? 0) + 1,
      seed,
      paperJson: paper as object,
      startedAt: now,
      deadlineAt,
      deviceToken: input.deviceToken,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
      sebVerified: input.sebVerified,
      lastHeartbeatAt: now,
      events: { create: { tenantId: exam.tenantId, type: "STARTED", severity: 0, detailJson: { ip: input.ip } } },
    },
  });
  void emitSafe(exam.tenantId, "exam.attempt.started", {
    attemptId: attempt.id,
    examId: exam.id,
    candidateId: candidate.id,
    candidateNo: candidate.candidateNo,
    learnerId: candidate.clientId,
    attemptNo: attempt.attemptNo,
    startedAt: attempt.startedAt.toISOString(),
    deadlineAt: attempt.deadlineAt.toISOString(),
  });
  return { attempt, resumed: false, exam, candidate };
}

/** A webhook that can never break the exam. */
function emitSafe(tenantId: string, type: string, data: Record<string, unknown>) {
  return import("@/lib/integrations/events").then(({ emitEvent }) => emitEvent(tenantId, type, data)).catch(() => undefined);
}

/* ───────────────────────────── sync ───────────────────────────── */

const MAX_ANSWER_BYTES = 25_000;

export const syncSchema = z.object({
  deviceToken: z.string().min(8).max(100),
  responses: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        answer: z.unknown(),
        flagged: z.boolean().default(false),
        timeSpentSec: z.number().int().min(0).max(86_400).default(0),
        rev: z.number().int().min(1).max(1_000_000),
        savedAt: z.string().datetime().optional(),
      })
    )
    .max(500)
    .default([]),
  events: z
    .array(
      z.object({
        id: z.string().min(4).max(60),
        type: z.string().min(2).max(40).regex(/^[A-Z_]+$/),
        at: z.string().datetime(),
        detail: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(200)
    .default([]),
  /** The device saw the network drop since the last sync. */
  wasOffline: z.boolean().default(false),
  /** Announcements newer than this are returned. */
  since: z.string().datetime().optional(),
  submit: z.object({ reason: z.enum(["MANUAL", "TIME_UP", "AWAY"]) }).optional(),
});
export type SyncInput = z.infer<typeof syncSchema>;

export async function applySync(attemptId: string, body: SyncInput) {
  const now = new Date();
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId },
    include: {
      exam: true,
      candidate: { include: { sitting: { select: { id: true, pausedAt: true } } } },
      responses: { select: { id: true, itemKey: true, rev: true } },
    },
  });
  if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");
  const security = parseSecurity(attempt.exam.securityJson);
  if (security.singleDevice && attempt.deviceToken && attempt.deviceToken !== body.deviceToken) {
    throw new DomainError(409, "other_device", "This exam is open on another device.");
  }

  const sittingPausedAt = attempt.candidate.sitting?.pausedAt ?? null;
  const finished = attempt.status === "SUBMITTED" || attempt.status === "TERMINATED";
  const paper = parsePaper(attempt.paperJson);
  const keys = new Map(paper.sections.flatMap((s) => s.items.map((i) => [i.key, i] as const)));
  const accepted: Record<string, number> = {};
  const rejected: string[] = [];
  let late = false;
  let wrote = false;

  // 1. Integrity events (always accepted, even after the end: they are the record).
  if (body.events.length) {
    const rows = body.events.map((e) => ({
      tenantId: attempt.tenantId,
      attemptId: attempt.id,
      type: e.type,
      severity: severityFor(e.type, security),
      clientEventId: e.id,
      clientAt: new Date(e.at),
      detailJson: (e.detail ?? {}) as object,
    }));
    await prisma.examEvent.createMany({ data: rows, skipDuplicates: true });
  }

  // 2. Answers, unless the attempt is over, locked or paused.
  const canWrite = !finished && attempt.status !== "LOCKED" && !isPaused(attempt, sittingPausedAt);
  const window = acceptsSave(attempt, attempt.exam, now, { wasOffline: body.wasOffline, sittingPausedAt });
  if (body.responses.length) {
    const existing = new Map(attempt.responses.map((r) => [r.itemKey, r]));
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const r of body.responses) {
      if (!keys.has(r.key)) continue;
      const prev = existing.get(r.key);
      if (prev && prev.rev >= r.rev) {
        accepted[r.key] = prev.rev;
        continue;
      }
      if (!canWrite || !window.ok) {
        rejected.push(r.key);
        continue;
      }
      const size = r.answer === undefined ? 0 : JSON.stringify(r.answer).length;
      if (size > MAX_ANSWER_BYTES) {
        rejected.push(r.key);
        continue;
      }
      if (!uploadKeyOk(r.answer, attempt.tenantId)) {
        rejected.push(r.key);
        continue;
      }
      if (window.late) late = true;
      const data = {
        answerJson: r.answer === undefined || r.answer === null ? Prisma.DbNull : (r.answer as object),
        flagged: r.flagged,
        timeSpentSec: r.timeSpentSec,
        rev: r.rev,
        clientSavedAt: r.savedAt ? new Date(r.savedAt) : now,
      };
      writes.push(
        prev
          ? prisma.examResponse.update({ where: { id: prev.id }, data })
          : prisma.examResponse.create({ data: { ...data, tenantId: attempt.tenantId, attemptId: attempt.id, itemKey: r.key } })
      );
      accepted[r.key] = r.rev;
    }
    if (writes.length) {
      await prisma.$transaction(writes);
      wrote = true;
    }
  }

  // 3. Counters and the strike policy.
  // Strikes count from the last invigilator unlock: an unlocked candidate is
  // not re-locked by the violations that locked them in the first place.
  // Independent reads run together: this is the hot path (every candidate,
  // every few seconds), so its latency is a handful of round trips, not ten.
  const [lastUnlock, violationCount, answeredCount] = await Promise.all([
    prisma.examEvent.findFirst({
      where: { attemptId: attempt.id, type: "PROCTOR_UNLOCK" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    body.events.length ? prisma.examEvent.count({ where: { attemptId: attempt.id, severity: 2 } }) : Promise.resolve(attempt.violationCount),
    wrote ? answeredCountOf(attempt.id, paper) : Promise.resolve(attempt.answeredCount),
  ]);
  const strikes = lastUnlock
    ? await prisma.examEvent.count({ where: { attemptId: attempt.id, severity: 2, createdAt: { gt: lastUnlock.createdAt } } })
    : violationCount;
  let status = attempt.status;
  let lockedAt = attempt.lockedAt;
  let autoSubmit: null | "MAX_VIOLATIONS" | "TIME_UP" = null;
  if (!finished && security.maxViolations > 0 && strikes >= security.maxViolations && violationCount > attempt.violationCount) {
    if (attempt.violationCount < violationCount) {
      void emitSafe(attempt.tenantId, "exam.integrity.flagged", {
        attemptId: attempt.id,
        examId: attempt.examId,
        candidateId: attempt.candidateId,
        candidateNo: attempt.candidate.candidateNo,
        violations: violationCount,
        action: security.onMaxViolations,
      });
    }
    if (security.onMaxViolations === "LOCK" && status !== "LOCKED") {
      status = "LOCKED";
      lockedAt = now;
    } else if (security.onMaxViolations === "AUTO_SUBMIT") {
      autoSubmit = "MAX_VIOLATIONS";
    }
  }
  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: {
      violationCount,
      answeredCount,
      lastHeartbeatAt: now,
      status,
      lockedAt,
      ...(late ? { offlineSubmitted: true } : {}),
    },
  });

  // 4. Finishing: asked by the candidate, by the clock, or by the strike policy.
  let finishedNow = false;
  if (!finished) {
    const timeUp = remainingMs(attempt, now, sittingPausedAt) <= 0 && !isPaused(attempt, sittingPausedAt);
    const reason = autoSubmit ?? (body.submit ? (body.submit.reason === "AWAY" ? "MAX_VIOLATIONS" : body.submit.reason) : null) ?? (timeUp && !window.ok ? "TIME_UP" : null);
    if (reason && (status !== "LOCKED" || reason === "MAX_VIOLATIONS" || reason === "TIME_UP")) {
      await finalizeAttempt(attempt.id, reason as "MANUAL" | "TIME_UP" | "MAX_VIOLATIONS");
      finishedNow = true;
    }
  }

  const announcementsQuery = prisma.examAnnouncement.findMany({
    where: {
      examId: attempt.examId,
      createdAt: { gt: body.since ? new Date(body.since) : attempt.startedAt },
      OR: [
        { sittingId: null, candidateId: null },
        { candidateId: attempt.candidateId },
        ...(attempt.candidate.sittingId ? [{ sittingId: attempt.candidate.sittingId, candidateId: null }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, message: true, createdAt: true },
  });

  // Re-read only when finishing changed the row; otherwise what we wrote is current.
  const [announcements, freshRow] = await Promise.all([
    announcementsQuery,
    finishedNow ? prisma.examAttempt.findFirst({ where: { id: attempt.id } }) : Promise.resolve(null),
  ]);
  const fresh = freshRow ?? { ...attempt, status, lockedAt };
  return {
    serverNow: now.toISOString(),
    status: fresh.status,
    deadlineAt: fresh.deadlineAt.toISOString(),
    paused: isPaused(fresh, sittingPausedAt),
    remainingMs: remainingMs(fresh, now, sittingPausedAt),
    accepted,
    rejected,
    violationCount,
    strikes,
    maxViolations: security.maxViolations,
    onMaxViolations: security.onMaxViolations,
    announcements: announcements.map((a) => ({ id: a.id, message: a.message, at: a.createdAt.toISOString() })),
    finished: finished || finishedNow,
  };
}

/** A FILE_UPLOAD / AUDIO answer may only point at this academy's exam-response uploads. */
function uploadKeyOk(answer: unknown, tenantId: string): boolean {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return true;
  const key = (answer as { key?: unknown }).key;
  if (key === undefined) return true;
  return typeof key === "string" && key.startsWith(`tenants/${tenantId}/exams/responses/`);
}

export async function answeredCountOf(attemptId: string, paper: ReturnType<typeof parsePaper>): Promise<number> {
  const ids = paper.sections.flatMap((s) => s.items.map((i) => i.questionId));
  const [responses, questions] = await Promise.all([
    prisma.examResponse.findMany({ where: { attemptId }, select: { itemKey: true, answerJson: true } }),
    prisma.question.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } }),
  ]);
  const typeOf = new Map(questions.map((q) => [q.id, q.type as QuestionTypeValue]));
  const keyToQ = new Map(paper.sections.flatMap((s) => s.items.map((i) => [i.key, i.questionId] as const)));
  return responses.filter((r) => {
    const t = typeOf.get(keyToQ.get(r.itemKey) ?? "");
    return t ? isResponseAnswered(t, r.answerJson) : false;
  }).length;
}

/* ───────────────────────────── finish ───────────────────────────── */

export async function finalizeAttempt(
  attemptId: string,
  reason: "MANUAL" | "TIME_UP" | "MAX_VIOLATIONS" | "PROCTOR" | "WINDOW_CLOSED",
  opts: { terminate?: boolean; actorId?: string | null; note?: string } = {}
) {
  const now = new Date();
  const res = await prisma.examAttempt.updateMany({
    where: { id: attemptId, status: { in: [...OPEN_STATUSES] } },
    data: {
      status: opts.terminate ? "TERMINATED" : "SUBMITTED",
      submittedAt: now,
      submitReason: reason,
      pausedAt: null,
    },
  });
  if (res.count !== 1) return false; // Already finished (a double submit, or the job got there first).
  const attempt = await prisma.examAttempt.findFirst({ where: { id: attemptId }, select: { tenantId: true } });
  await prisma.examEvent.create({
    data: {
      tenantId: attempt!.tenantId,
      attemptId,
      type: opts.terminate ? "PROCTOR_TERMINATE" : "SUBMITTED",
      severity: 0,
      actorId: opts.actorId ?? null,
      detailJson: { reason, ...(opts.note ? { note: opts.note } : {}) },
    },
  });
  // Webhook (lib/integrations/events.ts): never throws, runs after the response.
  await import("@/lib/integrations/events").then(({ emitEvent }) => emitEvent(attempt!.tenantId, "exam.attempt.submitted", { attemptId, reason, terminated: !!opts.terminate, submittedAt: now.toISOString() })).catch(() => undefined);
  // Grading (and the AI essay suggestions) runs after the response is sent.
  const { after } = await import("next/server");
  const { gradeExamAttempt } = await import("@/lib/exams/grading");
  const { onAttemptFinished } = await import("@/lib/exams/outcomes");
  // Keep the tenant binding for work that runs after the response.
  const ctx = getContext() ?? { mode: "tenant-client" as const, tenantId: attempt!.tenantId };
  const run = () => runWithContext(ctx, async () => {
    try {
      await gradeExamAttempt(attemptId, { aiSuggest: true });
      await onAttemptFinished(attemptId);
    } catch (e) {
      const { logger } = await import("@/lib/logger");
      logger.error({ err: String(e), attemptId }, "exam_grade_failed");
    }
  });
  try {
    after(run);
  } catch {
    // Outside a request (jobs, scripts): grade inline.
    await run();
  }
  return true;
}
