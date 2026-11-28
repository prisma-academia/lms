import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import type { ProctorAction } from "@/lib/exams/proctor";

/**
 * Shared pieces of the exam-operations routes (invigilation, marking,
 * results): the exam lookup every route starts with, and the request shape of
 * an invigilator action.
 */

export async function examOr404(examId: string, tenantId: string) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, tenantId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      code: true,
      status: true,
      durationMin: true,
      passMark: true,
      resultRelease: true,
      gradeBandsJson: true,
      securityJson: true,
      closesAt: true,
    },
  });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  return exam;
}

export const PROCTOR_ACTIONS = ["extend", "pause", "resume", "unlock", "reset_device", "submit", "terminate"] as const;
export type ProctorActionName = (typeof PROCTOR_ACTIONS)[number];

export const proctorActionSchema = z
  .object({
    action: z.enum(PROCTOR_ACTIONS),
    minutes: z.number().int().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === "extend" && v.minutes === undefined) {
      ctx.addIssue({ code: "custom", path: ["minutes"], message: "Say how many minutes to add (1–120)." });
    }
    if (v.action === "terminate" && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Give a reason for ending the attempt." });
    }
  });
export type ProctorActionBody = z.infer<typeof proctorActionSchema>;

export function toProctorAction(body: ProctorActionBody): ProctorAction {
  switch (body.action) {
    case "extend":
      return { kind: "extend", minutes: body.minutes! };
    case "submit":
      return { kind: "submit", note: body.note };
    case "terminate":
      return { kind: "terminate", note: body.note! };
    default:
      return { kind: body.action };
  }
}

/** The attempt must belong to this exam (and academy) before anyone acts on it. */
export async function attemptOfExam(examId: string, attemptId: string, tenantId: string) {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, examId, tenantId },
    select: { id: true, status: true, candidateId: true, deadlineAt: true, pausedAt: true, lockedAt: true },
  });
  if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");
  return attempt;
}

/** Display names for staff ids (event actors, markers, announcement authors). */
export async function staffNames(ids: (string | null | undefined)[], tenantId: string): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const users = await prisma.tenantUser.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
}

export const FINISHED_STATUSES = ["SUBMITTED", "TERMINATED"] as const;

export function responseFileKeyOk(key: unknown, tenantId: string): key is string {
  return typeof key === "string" && key.startsWith(`tenants/${tenantId}/exams/responses/`) && !key.includes("..");
}
