import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { CandidatesCreate, ListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";
import { addApiCandidates } from "@/lib/api/v1/candidates";

/** GET /api/v1/exams/{id}/candidates — PINs are never listed (only their hashes exist). */
export const GET = apiRoute<{ id: string }>({ scope: "exams:read" }, async (ctx) => {
  const q = ctx.query(ListQuery);
  const exam = await prisma.exam.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const rows = await prisma.examCandidate.findMany({
    where: { tenantId: ctx.tenantId, examId: exam.id, ...sinceFilter(q, "createdAt") },
    ...pageArgs(q, "createdAt"),
  });
  return page(rows, q, out.candidate);
});

/**
 * POST /api/v1/exams/{id}/candidates — up to 500. Each new candidate's Exam ID
 * and PIN come back in this response ONLY; store or print them now. Use an
 * Idempotency-Key: a retried request without one issues different PINs.
 */
export const POST = apiRoute<{ id: string }>({ scope: "exams:write" }, async (ctx) => {
  const body = ctx.json(CandidatesCreate);
  const issued = await addApiCandidates(ctx.tenantId, ctx.params.id, body.candidates, body.resetExistingPins);
  await audit({ ...ctx.auditActor, action: "exam.candidates_add", targetType: "Exam", targetId: ctx.params.id, after: { count: issued.length, created: issued.filter((c) => c.created).length } });
  return { data: issued, status: 201 };
});
