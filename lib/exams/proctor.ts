import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { finalizeAttempt, OPEN_STATUSES } from "@/lib/exams/attempts";
import { resumedDeadline } from "@/lib/exams/timing";

/**
 * Invigilator actions on live attempts. Each one is recorded as a PROCTOR_*
 * event on the attempt's integrity log (and the route also writes ActivityLog).
 * The exam window learns of every change on its next sync (≤ 5 s).
 */

export type ProctorAction =
  | { kind: "extend"; minutes: number }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "unlock" }
  | { kind: "reset_device" }
  | { kind: "submit"; note?: string }
  | { kind: "terminate"; note: string };

async function openAttempt(attemptId: string) {
  const a = await prisma.examAttempt.findFirst({ where: { id: attemptId } });
  if (!a) throw new DomainError(404, "not_found", "Attempt not found.");
  if (!(OPEN_STATUSES as readonly string[]).includes(a.status)) {
    throw new DomainError(409, "not_live", "This attempt has already finished.");
  }
  return a;
}

async function log(tenantId: string, attemptId: string, type: string, actorId: string, detail: object = {}) {
  await prisma.examEvent.create({ data: { tenantId, attemptId, type, severity: 0, actorId, detailJson: detail } });
}

export async function applyProctorAction(attemptId: string, action: ProctorAction, actorId: string): Promise<void> {
  const a = await openAttempt(attemptId);
  const now = new Date();
  switch (action.kind) {
    case "extend": {
      const ms = Math.round(action.minutes * 60_000);
      await prisma.examAttempt.update({
        where: { id: a.id },
        data: { deadlineAt: new Date(a.deadlineAt.getTime() + ms), extraSec: { increment: Math.round(ms / 1000) } },
      });
      await log(a.tenantId, a.id, "PROCTOR_EXTEND", actorId, { minutes: action.minutes });
      return;
    }
    case "pause": {
      if (a.status === "PAUSED") return;
      await prisma.examAttempt.update({ where: { id: a.id }, data: { status: "PAUSED", pausedAt: now } });
      await log(a.tenantId, a.id, "PROCTOR_PAUSE", actorId);
      return;
    }
    case "resume": {
      if (a.status !== "PAUSED") return;
      await prisma.examAttempt.update({
        where: { id: a.id },
        data: { status: a.lockedAt ? "LOCKED" : "IN_PROGRESS", deadlineAt: resumedDeadline(a, now), pausedAt: null },
      });
      await log(a.tenantId, a.id, "PROCTOR_RESUME", actorId);
      return;
    }
    case "unlock": {
      if (a.status !== "LOCKED") return;
      await prisma.examAttempt.update({ where: { id: a.id }, data: { status: "IN_PROGRESS", lockedAt: null } });
      // Violations before this point no longer count toward the next lock.
      await log(a.tenantId, a.id, "PROCTOR_UNLOCK", actorId);
      return;
    }
    case "reset_device": {
      await prisma.examAttempt.update({ where: { id: a.id }, data: { deviceToken: null } });
      await log(a.tenantId, a.id, "PROCTOR_RESET_DEVICE", actorId);
      return;
    }
    case "submit": {
      await finalizeAttempt(a.id, "PROCTOR", { actorId, note: action.note });
      return;
    }
    case "terminate": {
      await finalizeAttempt(a.id, "PROCTOR", { terminate: true, actorId, note: action.note });
      return;
    }
  }
}

/** Freeze or unfreeze a whole sitting (a power cut in the hall, say). */
export async function setSittingPaused(sittingId: string, paused: boolean, actorId: string): Promise<number> {
  const sitting = await prisma.examSitting.findFirst({ where: { id: sittingId } });
  if (!sitting) throw new DomainError(404, "not_found", "Sitting not found.");
  const now = new Date();
  if (paused) {
    if (sitting.pausedAt) return 0;
    await prisma.examSitting.update({ where: { id: sitting.id }, data: { pausedAt: now } });
    return 1;
  }
  if (!sitting.pausedAt) return 0;
  const span = now.getTime() - sitting.pausedAt.getTime();
  const attempts = await prisma.examAttempt.findMany({
    where: { candidate: { sittingId: sitting.id }, status: { in: ["IN_PROGRESS", "LOCKED"] }, pausedAt: null },
    select: { id: true, deadlineAt: true, tenantId: true },
  });
  await prisma.$transaction([
    prisma.examSitting.update({ where: { id: sitting.id }, data: { pausedAt: null } }),
    ...attempts.map((a) =>
      prisma.examAttempt.update({ where: { id: a.id }, data: { deadlineAt: new Date(a.deadlineAt.getTime() + span) } })
    ),
    ...attempts.map((a) =>
      prisma.examEvent.create({
        data: { tenantId: a.tenantId, attemptId: a.id, type: "PROCTOR_SITTING_RESUME", severity: 0, actorId, detailJson: { pausedMs: span } },
      })
    ),
  ]);
  return attempts.length;
}

/** Messages to candidates: everyone, a sitting, or one candidate. */
export async function announce(input: {
  tenantId: string;
  examId: string;
  message: string;
  sittingId?: string | null;
  candidateId?: string | null;
  actorId: string;
}) {
  return prisma.examAnnouncement.create({
    data: {
      tenantId: input.tenantId,
      examId: input.examId,
      sittingId: input.sittingId ?? null,
      candidateId: input.candidateId ?? null,
      message: input.message.slice(0, 1000),
      createdById: input.actorId,
    },
  });
}
