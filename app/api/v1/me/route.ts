import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";

/** GET /api/v1/me — which key this is, its scopes, and whose academy. Any valid key. */
export const GET = apiRoute({ scope: null }, async (ctx) => {
  const [tenant, key] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, slug: true, name: true } }),
    prisma.apiKey.findFirst({ where: { id: ctx.key.keyId, tenantId: ctx.tenantId }, select: { rateLimitPerMin: true } }),
  ]);
  if (!tenant || !key) throw new DomainError(404, "not_found", "Not found.");
  return {
    data: {
      key: { id: ctx.key.keyId, name: ctx.key.name, prefix: ctx.key.prefix, scopes: [...ctx.key.scopes], rateLimitPerMin: key.rateLimitPerMin },
      tenant,
    },
  };
});
