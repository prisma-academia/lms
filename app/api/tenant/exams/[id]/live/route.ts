import { AuthError, requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/auth/permissions";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { liveSnapshot } from "@/lib/exams/live";

export const dynamic = "force-dynamic";

/** The invigilation room's snapshot, polled every few seconds. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor();
    if (!hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key) && !hasPermission(actor, PERMISSIONS.TENANT_EXAMS_READ.key)) {
      throw new AuthError(403, "You do not have permission to watch this exam.");
    }
    const { id } = await ctx.params;
    return ok(await liveSnapshot(id, actor.tenantId));
  } catch (e) {
    return handleError(e);
  }
}
