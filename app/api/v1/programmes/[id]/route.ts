import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/programmes/{id} — with its courses in order. */
export const GET = apiRoute<{ id: string }>({ scope: "courses:read" }, async (ctx) => {
  const p = await prisma.programme.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId } });
  if (!p) throw new DomainError(404, "not_found", "Programme not found.");
  const courses = await prisma.programmeCourse.findMany({
    where: { tenantId: ctx.tenantId, programmeId: p.id },
    orderBy: { sortOrder: "asc" },
    select: { courseId: true, required: true, sortOrder: true, groupLabel: true },
  });
  return { data: out.programme(p, courses) };
});
