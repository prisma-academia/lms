import { apiRoute } from "@/lib/api/v1/route";
import { LoginLinkCreate } from "@/lib/api/v1/schemas";
import { DomainError } from "@/lib/api/errors";
import { audit } from "@/lib/auth/audit";
import { findLearner } from "@/lib/api/v1/learners";
import { issueLoginLink } from "@/lib/auth/login-link";

/**
 * POST /api/v1/learners/{id}/login-link — a one-time sign-in URL (default 5
 * minutes). Redirect the learner's browser to it; it signs them in on the
 * academy site and lands them on `redirectPath` (default /dashboard).
 */
export const POST = apiRoute<{ id: string }>({ scope: "learners:write" }, async (ctx) => {
  const body = ctx.json(LoginLinkCreate);
  const learner = await findLearner(ctx.tenantId, ctx.params.id);
  if (learner.status !== "ACTIVE") throw new DomainError(409, "learner_suspended", "This learner is suspended.");
  const link = await issueLoginLink({
    tenantId: ctx.tenantId,
    tenantSlug: ctx.tenantSlug,
    clientId: learner.id,
    redirectPath: body.redirectPath ?? null,
    expiresInMinutes: body.expiresInMinutes,
    apiKeyId: ctx.key.keyId,
  });
  await audit({
    ...ctx.auditActor,
    action: "client.login_link_created",
    targetType: "Client",
    targetId: learner.id,
    after: { expiresAt: link.expiresAt.toISOString() },
  });
  return { data: { url: link.url, expiresAt: link.expiresAt.toISOString() }, status: 201 };
});
