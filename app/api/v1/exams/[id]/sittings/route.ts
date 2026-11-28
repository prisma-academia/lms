import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import { ListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/exams/{id}/sittings */
export const GET = apiRoute<{ id: string }>({ scope: "exams:read" }, async (ctx) => {
  const q = ctx.query(ListQuery);
  const exam = await prisma.exam.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  const rows = await prisma.examSitting.findMany({
    where: { tenantId: ctx.tenantId, examId: exam.id, ...sinceFilter(q, "createdAt") },
    ...pageArgs(q, "createdAt"),
  });
  return page(rows, q, out.sitting);
});
