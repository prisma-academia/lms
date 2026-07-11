import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const GradeBody = z.object({
  points: z.number().int().min(0),
  feedback: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GRADES_WRITE.key);
    const { id } = await ctx.params;
    const body = GradeBody.parse(await request.json());
    const meta = requestMeta(request);

    const submission = await prisma.submission.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { assignment: { select: { courseId: true, maxPoints: true } } },
    });
    if (!submission) throw new DomainError(404, "not_found", "Submission not found.");

    const maxPoints = submission.assignment.maxPoints;
    if (body.points > maxPoints) {
      throw new DomainError(400, "points_exceed_max", `Points cannot exceed ${maxPoints}.`);
    }

    const grade = await prisma.grade.upsert({
      where: { submissionId: id },
      create: {
        tenantId: actor.tenantId,
        submissionId: id,
        courseId: submission.assignment.courseId,
        clientId: submission.clientId,
        points: body.points,
        maxPoints,
        feedback: body.feedback ?? null,
        gradedById: actor.userId,
      },
      update: {
        points: body.points,
        maxPoints,
        feedback: body.feedback ?? null,
        gradedById: actor.userId,
        gradedAt: new Date(),
      },
    });

    await prisma.submission.update({
      where: { id },
      data: { status: "GRADED" },
    });

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "submission.grade",
      tenantId: actor.tenantId,
      targetType: "Submission",
      targetId: id,
      after: { points: grade.points, maxPoints } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ grade });
  } catch (e) {
    return handleError(e);
  }
}
