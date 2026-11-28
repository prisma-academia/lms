import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { FeeListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/fees — read-only. */
export const GET = apiRoute({ scope: "payments:read" }, async (ctx) => {
  const q = ctx.query(FeeListQuery);
  const rows = await prisma.fee.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "updatedAt"),
      ...(q.learner_id ? { clientId: q.learner_id } : {}),
      ...(q.group_id ? { clientGroupId: q.group_id } : {}),
    },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, out.fee);
});
