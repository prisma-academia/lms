import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { releaseResults } from "@/lib/exams/outcomes";
import { examOr404 } from "@/lib/exams/ops";

export const maxDuration = 300;

const Body = z.object({ attemptIds: z.array(z.string().min(1)).min(1).max(5000).optional() });

/** Release results: every finished, fully marked attempt, or the ones named. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_GRADE.key);
    const { id } = await ctx.params;
    const body = Body.parse(await request.json().catch(() => ({})));
    await examOr404(id, actor.tenantId);
    const released = await releaseResults(id, { attemptIds: body.attemptIds });
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "exam.results.released",
      tenantId: actor.tenantId,
      targetType: "Exam",
      targetId: id,
      after: { released, attemptIds: body.attemptIds ?? "all" },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ released });
  } catch (e) {
    return handleError(e);
  }
}
