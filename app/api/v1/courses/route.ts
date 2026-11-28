import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { CourseListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/courses */
export const GET = apiRoute({ scope: "courses:read" }, async (ctx) => {
  const q = ctx.query(CourseListQuery);
  const rows = await prisma.course.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "updatedAt"),
      ...(q.status ? { status: q.status } : {}),
      ...(q.external_id ? { externalId: q.external_id } : {}),
    },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, out.course);
});
