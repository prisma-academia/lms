import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { applyProctorAction } from "@/lib/exams/proctor";
import { PROCTOR_ACTIONS, proctorActionSchema, toProctorAction } from "@/lib/exams/ops";

export const maxDuration = 120;

const Body = z.object({
  attemptIds: z.array(z.string().min(1)).min(1).max(1000),
  action: z.enum(PROCTOR_ACTIONS),
  minutes: z.number().int().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * The same invigilator action on many attempts. Each attempt is tried on its
 * own: one that has already finished is reported, not allowed to stop the rest.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
    const { id } = await ctx.params;
    const raw = Body.parse(await request.json());
    const body = proctorActionSchema.parse({ action: raw.action, minutes: raw.minutes, note: raw.note });
    const ids = [...new Set(raw.attemptIds)];
    const owned = await prisma.examAttempt.findMany({
      where: { id: { in: ids }, examId: id, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (owned.length === 0) throw new DomainError(404, "not_found", "None of those attempts belong to this exam.");
    const action = toProctorAction(body);
    const done: string[] = [];
    const failed: { attemptId: string; message: string }[] = [];
    for (const a of owned) {
      try {
        await applyProctorAction(a.id, action, actor.userId);
        done.push(a.id);
      } catch (e) {
        failed.push({ attemptId: a.id, message: e instanceof DomainError ? e.message : "Could not apply the action." });
      }
    }
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: `exam.proctor.${body.action}`,
      tenantId: actor.tenantId,
      targetType: "Exam",
      targetId: id,
      after: { bulk: true, attemptIds: done, failed: failed.length, ...(body.minutes ? { minutes: body.minutes } : {}), ...(body.note ? { note: body.note } : {}) },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ applied: done.length, skipped: ids.length - owned.length, failed });
  } catch (e) {
    return handleError(e);
  }
}
