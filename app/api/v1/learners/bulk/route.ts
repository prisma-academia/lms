import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { LearnerBulk } from "@/lib/api/v1/schemas";
import { toFailure } from "@/lib/api/v1/pipeline";
import { upsertByExternalId, updateLearner } from "@/lib/api/v1/learners";
import { createLearner } from "@/lib/learners/create";

type Row = { index: number; status: "created" | "updated" | "skipped" | "error"; id: string | null; error: string | null };

/**
 * POST /api/v1/learners/bulk — up to 500 learners per call. Each row succeeds
 * or fails on its own; the response lists what happened to every index.
 * With `upsert: true`, rows match on externalId (then email) and are updated.
 */
export const POST = apiRoute({ scope: "learners:write" }, async (ctx) => {
  const body = ctx.json(LearnerBulk);
  const results: Row[] = new Array(body.learners.length);

  const one = async (index: number) => {
    const input = body.learners[index];
    try {
      if (body.upsert && input.externalId) {
        const { externalId, ...rest } = input;
        const r = await upsertByExternalId(ctx.tenantId, externalId, rest, ctx.auditActor);
        results[index] = { index, status: r.created ? "created" : "updated", id: r.learner.id, error: null };
        return;
      }
      if (body.upsert) {
        const existing = await prisma.client.findFirst({ where: { tenantId: ctx.tenantId, email: input.email.toLowerCase() }, select: { id: true } });
        if (existing) {
          await updateLearner(ctx.tenantId, existing.id, input, ctx.auditActor);
          results[index] = { index, status: "updated", id: existing.id, error: null };
          return;
        }
      }
      const learner = await createLearner(ctx.tenantId, input, ctx.auditActor);
      results[index] = { index, status: "created", id: learner.id, error: null };
    } catch (err) {
      const f = toFailure(err, ctx.requestId);
      results[index] = { index, status: f.code === "email_taken" && !body.upsert ? "skipped" : "error", id: null, error: f.message };
    }
  };

  // Ten at a time: quick enough for 500 rows, gentle enough on the pool.
  for (let i = 0; i < body.learners.length; i += 10) {
    await Promise.all(Array.from({ length: Math.min(10, body.learners.length - i) }, (_, j) => one(i + j)));
  }
  return {
    data: {
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      results,
    },
  };
});
