import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { loadResults } from "@/lib/exams/results-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Results analytics and every attempt's row. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    return ok(await loadResults(id, actor.tenantId));
  } catch (e) {
    return handleError(e);
  }
}
