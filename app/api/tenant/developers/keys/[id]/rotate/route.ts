import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { rotateKey } from "@/lib/developers/admin";

/** A replacement key with the same settings; the old key keeps working for 24 hours. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const { key, view, previous } = await rotateKey({ userId: actor.userId, tenantId: actor.tenantId, ...requestMeta(request) }, id);
    return ok({ key, apiKey: view, previous }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
