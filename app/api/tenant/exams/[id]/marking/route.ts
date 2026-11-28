import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { examOr404 } from "@/lib/exams/ops";
import { markingQueue } from "@/lib/exams/marking";

export const dynamic = "force-dynamic";

/**
 * The marking queue. `?questionId=` narrows to one question, `?blind=1` hides
 * names (Exam ID only), `?include=all` also returns answers already marked.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_GRADE.key);
    const { id } = await ctx.params;
    await examOr404(id, actor.tenantId);
    const sp = new URL(request.url).searchParams;
    return ok(
      await markingQueue(id, actor.tenantId, {
        questionId: sp.get("questionId") || null,
        blind: sp.get("blind") === "1",
        include: sp.get("include") === "all" ? "all" : "unmarked",
      })
    );
  } catch (e) {
    return handleError(e);
  }
}
