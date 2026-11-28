/**
 * The exam clock. The SERVER's `deadlineAt` is the only truth: the candidate's
 * device just counts down to it (with an offset measured against server
 * time), so changing the device clock achieves nothing.
 *
 * Pure; shared by routes, jobs and tests.
 */

export type ClockExam = { durationMin: number; closesAt: Date | null; offlineGraceMin: number };
export type ClockCandidate = { extraTimePct: number };
export type ClockSitting = { endsAt: Date | null; pausedAt?: Date | null } | null;

export function scaledDurationMs(exam: { durationMin: number }, candidate: ClockCandidate): number {
  return Math.round(exam.durationMin * 60_000 * (1 + Math.max(0, candidate.extraTimePct) / 100));
}

/**
 * When an attempt started at `start` must end. Capped by the exam window and
 * the sitting's end — but a candidate with extra time keeps it past those caps
 * (the cap is stretched by the same percentage of the duration).
 */
export function computeDeadline(exam: ClockExam, candidate: ClockCandidate, sitting: ClockSitting, start: Date): Date {
  const duration = scaledDurationMs(exam, candidate);
  const extra = duration - exam.durationMin * 60_000;
  let end = start.getTime() + duration;
  const caps = [exam.closesAt, sitting?.endsAt ?? null].filter((d): d is Date => !!d);
  for (const cap of caps) end = Math.min(end, cap.getTime() + extra);
  return new Date(Math.max(end, start.getTime()));
}

export type ClockAttempt = {
  status: string;
  deadlineAt: Date;
  pausedAt: Date | null;
};

/** Milliseconds left. While paused the clock is frozen at the moment of pause. */
export function remainingMs(attempt: ClockAttempt, now: Date, sittingPausedAt?: Date | null): number {
  const frozenAt = attempt.pausedAt ?? sittingPausedAt ?? null;
  const at = frozenAt ? frozenAt.getTime() : now.getTime();
  return Math.max(0, attempt.deadlineAt.getTime() - at);
}

export function isPaused(attempt: ClockAttempt, sittingPausedAt?: Date | null): boolean {
  return attempt.status === "PAUSED" || !!attempt.pausedAt || !!sittingPausedAt;
}

/** After the deadline, how long answers saved while offline are still accepted. */
export function graceMs(exam: { offlineGraceMin: number }): number {
  return Math.max(0, exam.offlineGraceMin) * 60_000;
}

/** Whether a save arriving now may still be accepted. */
export function acceptsSave(
  attempt: ClockAttempt,
  exam: { offlineGraceMin: number },
  now: Date,
  opts: { wasOffline: boolean; sittingPausedAt?: Date | null }
): { ok: boolean; late: boolean } {
  if (isPaused(attempt, opts.sittingPausedAt)) return { ok: true, late: false };
  const left = attempt.deadlineAt.getTime() - now.getTime();
  // A few seconds of slack for the request in flight when time ran out.
  if (left > -15_000) return { ok: true, late: false };
  if (opts.wasOffline && -left <= graceMs(exam)) return { ok: true, late: true };
  return { ok: false, late: true };
}

/** Moving the deadline when a pause ends: the paused span is given back. */
export function resumedDeadline(attempt: { deadlineAt: Date; pausedAt: Date | null }, now: Date): Date {
  if (!attempt.pausedAt) return attempt.deadlineAt;
  return new Date(attempt.deadlineAt.getTime() + Math.max(0, now.getTime() - attempt.pausedAt.getTime()));
}

export type WindowState = "draft" | "upcoming" | "open" | "entry_closed" | "closed";

/** Can a NEW attempt start now? */
export function windowState(
  exam: { status: string; opensAt: Date | null; closesAt: Date | null; lateEntryMin: number | null },
  sitting: { startsAt: Date | null; endsAt: Date | null } | null,
  now: Date
): WindowState {
  if (exam.status === "DRAFT" || exam.status === "ARCHIVED") return "draft";
  if (exam.status === "CLOSED") return "closed";
  const start = sitting?.startsAt ?? exam.opensAt;
  const end = sitting?.endsAt ?? exam.closesAt;
  if (start && now < start) return "upcoming";
  if (end && now >= end) return "closed";
  if (start && exam.lateEntryMin != null && now.getTime() > start.getTime() + exam.lateEntryMin * 60_000) return "entry_closed";
  return "open";
}
