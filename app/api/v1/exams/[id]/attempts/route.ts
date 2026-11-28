import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import { AttemptListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/exams/{id}/attempts — attempts with scores (released or not; see `releasedAt`). */
export const GET = apiRoute<{ id: string }>({ scope: "results:read" }, async (ctx) => {
  const q = ctx.query(AttemptListQuery);
  const exam = await prisma.exam.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const rows = await prisma.examAttempt.findMany({
    where: {
      tenantId: ctx.tenantId,
      examId: exam.id,
      ...sinceFilter(q, "createdAt"),
      ...(q.status ? { status: q.status } : {}),
      ...(q.released === "true" ? { releasedAt: { not: null } } : q.released === "false" ? { releasedAt: null } : {}),
    },
    include: { candidate: { select: { clientId: true, candidateNo: true, fullName: true } } },
    ...pageArgs(q, "createdAt"),
  });
  return page(rows, q, out.examAttempt);
});
