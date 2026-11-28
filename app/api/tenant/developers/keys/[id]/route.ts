import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { revokeKey } from "@/lib/developers/admin";

/** Revoke a key, immediately. Keys are never deleted, so their logs keep a name. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const { id } = await ctx.params;
    const view = await revokeKey({ userId: actor.userId, tenantId: actor.tenantId, ...requestMeta(request) }, id);
    return ok({ apiKey: view });
  } catch (e) {
    return handleError(e);
  }
}
