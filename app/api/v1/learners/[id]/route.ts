import { apiRoute } from "@/lib/api/v1/route";
import { LearnerPatch } from "@/lib/api/v1/schemas";
import * as out from "@/lib/api/v1/serialize";
import { findLearner, updateLearner } from "@/lib/api/v1/learners";

/** GET /api/v1/learners/{id} */
export const GET = apiRoute<{ id: string }>({ scope: "learners:read" }, async (ctx) => {
  return { data: out.learner(await findLearner(ctx.tenantId, ctx.params.id)) };
});

/** PATCH /api/v1/learners/{id} */
export const PATCH = apiRoute<{ id: string }>({ scope: "learners:write" }, async (ctx) => {
  const patch = ctx.json(LearnerPatch);
  const { learner } = await updateLearner(ctx.tenantId, ctx.params.id, patch, ctx.auditActor);
  return { data: out.learner(learner) };
});
