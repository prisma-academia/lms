import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { setSittingPaused } from "@/lib/exams/proctor";

const Body = z.object({ paused: z.boolean() });

/** Freeze or unfreeze every attempt in a sitting (a power cut in the hall). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; sittingId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
    const { id, sittingId } = await ctx.params;
    const body = Body.parse(await request.json());
    const sitting = await prisma.examSitting.findFirst({
      where: { id: sittingId, examId: id, tenantId: actor.tenantId },
      select: { id: true, name: true, pausedAt: true },
    });
    if (!sitting) throw new DomainError(404, "not_found", "Sitting not found.");
    const changed = await setSittingPaused(sitting.id, body.paused, actor.userId);
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: body.paused ? "exam.proctor.sitting_pause" : "exam.proctor.sitting_resume",
      tenantId: actor.tenantId,
      targetType: "ExamSitting",
      targetId: sitting.id,
      before: { pausedAt: sitting.pausedAt?.toISOString() ?? null },
      after: { examId: id, paused: body.paused, changed },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ sittingId: sitting.id, paused: body.paused, changed });
  } catch (e) {
    return handleError(e);
  }
}
