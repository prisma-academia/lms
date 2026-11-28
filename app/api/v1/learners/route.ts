import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { LearnerCreate, LearnerListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";
import { createLearner } from "@/lib/learners/create";

/** GET /api/v1/learners */
export const GET = apiRoute({ scope: "learners:read" }, async (ctx) => {
  const q = ctx.query(LearnerListQuery);
  const rows = await prisma.client.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "createdAt"),
      ...(q.email ? { email: q.email.toLowerCase() } : {}),
      ...(q.external_id ? { externalId: q.external_id } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.group_id ? { groupMemberships: { some: { groupId: q.group_id } } } : {}),
    },
    ...pageArgs(q, "createdAt"),
  });
  return page(rows, q, out.learner);
});

/** POST /api/v1/learners */
export const POST = apiRoute({ scope: "learners:write" }, async (ctx) => {
  const body = ctx.json(LearnerCreate);
  const learner = await createLearner(ctx.tenantId, body, ctx.auditActor);
  return { data: out.learner(learner), status: 201 };
});
