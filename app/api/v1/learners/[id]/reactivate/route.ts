import { apiRoute } from "@/lib/api/v1/route";
import * as out from "@/lib/api/v1/serialize";
import { setLearnerStatus } from "@/lib/api/v1/learners";

/** POST /api/v1/learners/{id}/reactivate */
export const POST = apiRoute<{ id: string }>({ scope: "learners:write" }, async (ctx) => {
  return { data: out.learner(await setLearnerStatus(ctx.tenantId, ctx.params.id, "ACTIVE", ctx.auditActor)) };
});
