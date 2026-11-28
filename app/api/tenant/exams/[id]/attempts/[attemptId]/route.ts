import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { attemptReview } from "@/lib/exams/review";

export const dynamic = "force-dynamic";

/** One attempt for staff review: paper, answers, answer keys, marks and the integrity log. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; attemptId: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id, attemptId } = await ctx.params;
    return ok(await attemptReview(id, attemptId, actor.tenantId));
  } catch (e) {
    return handleError(e);
  }
}
