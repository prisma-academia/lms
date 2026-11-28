import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam } from "@/lib/exams/admin";
import { resetPins } from "@/lib/exams/candidates";

const Body = z.object({ candidateIds: z.array(z.string().min(1)).max(5000).optional() });

/** Issue new PINs (all candidates, or the ones given). Old PINs stop working. Plain PINs are returned once. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const { candidateIds } = Body.parse(await request.json().catch(() => ({})));
    await findExam(actor.tenantId, id);
    const issued = await resetPins(id, candidateIds);
    await auditExam(actor, request, "exam.candidates.reset_pins", { type: "Exam", id }, {
      after: { count: issued.length, scope: candidateIds ? "selected" : "all" },
    });
    return ok({ issued });
  } catch (e) {
    return handleError(e);
  }
}
