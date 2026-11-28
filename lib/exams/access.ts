import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { addCandidates } from "@/lib/exams/candidates";
import type { CandidateIdentity } from "@/lib/exams/candidate-auth";

/**
 * Which candidate row this identity sits an exam as, creating one for a
 * learner the exam admits automatically (enrolled on its course, or holding
 * the access code). One message for "no such exam" and "not for you", so the
 * reply never tells a stranger which exam ids exist.
 */
const NOT_AVAILABLE = "This exam is not available to you.";

export async function candidateFor(
  examId: string,
  identity: CandidateIdentity,
  opts: { accessCode?: string | null; create?: boolean } = {}
) {
  const exam = await prisma.exam.findFirst({ where: { id: examId, tenantId: identity.tenantId } });
  if (!exam || exam.status === "DRAFT" || exam.status === "ARCHIVED") throw new DomainError(404, "not_available", NOT_AVAILABLE);

  // Exam ID + PIN sessions open exactly one candidate of exactly one exam.
  if (identity.pin && identity.pin.examId === exam.id) {
    const c = await prisma.examCandidate.findFirst({ where: { id: identity.pin.candidateId, examId: exam.id }, include: { sitting: true } });
    if (c) return { exam, candidate: c };
  }
  if (!identity.clientId) throw new DomainError(404, "not_available", NOT_AVAILABLE);

  const existing = await prisma.examCandidate.findFirst({ where: { examId: exam.id, clientId: identity.clientId }, include: { sitting: true } });
  if (existing) return { exam, candidate: existing };

  let admitted = false;
  if (exam.accessMode === "ENROLLED" && exam.courseId) {
    admitted = !!(await prisma.enrollment.findFirst({ where: { clientId: identity.clientId, courseId: exam.courseId }, select: { id: true } }));
  } else if (exam.accessMode === "ACCESS_CODE" && exam.accessCode) {
    admitted = !!opts.accessCode && opts.accessCode.trim().toUpperCase() === exam.accessCode.trim().toUpperCase();
    if (!admitted && opts.accessCode) throw new DomainError(403, "bad_access_code", "That access code is not right.");
    if (!admitted) throw new DomainError(403, "access_code_required", "Enter the access code your teacher gave you.");
  }
  if (!admitted) throw new DomainError(404, "not_available", NOT_AVAILABLE);
  if (!opts.create) return { exam, candidate: null };

  const client = await prisma.client.findFirst({
    where: { id: identity.clientId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!client) throw new DomainError(404, "not_available", NOT_AVAILABLE);
  await addCandidates(exam.id, [
    { clientId: client.id, fullName: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || client.email, email: client.email },
  ]);
  const created = await prisma.examCandidate.findFirst({ where: { examId: exam.id, clientId: client.id }, include: { sitting: true } });
  return { exam, candidate: created };
}

/** Exams a learner can see on "My exams". */
export async function learnerExamList(clientId: string) {
  const [candidates, enrolments] = await Promise.all([
    prisma.examCandidate.findMany({
      where: { clientId, exam: { status: { in: ["PUBLISHED", "CLOSED"] } } },
      include: {
        exam: true,
        sitting: true,
        attempts: { orderBy: { attemptNo: "desc" }, take: 1 },
      },
    }),
    prisma.enrollment.findMany({ where: { clientId }, select: { courseId: true } }),
  ]);
  const have = new Set(candidates.map((c) => c.examId));
  const auto = await prisma.exam.findMany({
    where: {
      status: "PUBLISHED",
      accessMode: "ENROLLED",
      courseId: { in: enrolments.map((e) => e.courseId) },
      id: { notIn: [...have] },
    },
  });
  return { candidates, auto };
}
