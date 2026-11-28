import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/exams/{id} — settings only; the paper and answer keys are never exposed. */
export const GET = apiRoute<{ id: string }>({ scope: "exams:read" }, async (ctx) => {
  const exam = await prisma.exam.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId } });
  if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
  return { data: out.exam(exam) };
});
