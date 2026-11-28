import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { ProgrammeListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/programmes */
export const GET = apiRoute({ scope: "courses:read" }, async (ctx) => {
  const q = ctx.query(ProgrammeListQuery);
  const rows = await prisma.programme.findMany({
    where: { tenantId: ctx.tenantId, ...sinceFilter(q, "updatedAt"), ...(q.status ? { status: q.status } : {}) },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, (p) => out.programme(p));
});
