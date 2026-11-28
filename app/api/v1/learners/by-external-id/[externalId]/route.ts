import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import { LearnerUpsert } from "@/lib/api/v1/schemas";
import * as out from "@/lib/api/v1/serialize";
import { upsertByExternalId } from "@/lib/api/v1/learners";

function externalIdOf(raw: string): string {
  const id = decodeURIComponent(raw).trim();
  if (!id || id.length > 200) throw new DomainError(400, "validation_error", "externalId must be 1–200 characters.");
  return id;
}

/** GET /api/v1/learners/by-external-id/{externalId} */
export const GET = apiRoute<{ externalId: string }>({ scope: "learners:read" }, async (ctx) => {
  const row = await prisma.client.findFirst({ where: { tenantId: ctx.tenantId, externalId: externalIdOf(ctx.params.externalId) } });
  if (!row) throw new DomainError(404, "not_found", "Learner not found.");
  return { data: out.learner(row) };
});

/**
 * PUT /api/v1/learners/by-external-id/{externalId} — create or update, keyed
 * on your system's id. 201 when created, 200 when updated.
 */
export const PUT = apiRoute<{ externalId: string }>({ scope: "learners:write" }, async (ctx) => {
  const body = ctx.json(LearnerUpsert);
  const { learner, created } = await upsertByExternalId(ctx.tenantId, externalIdOf(ctx.params.externalId), body, ctx.auditActor);
  return { data: out.learner(learner), status: created ? 201 : 200 };
});
