import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const SubmitBody = z.object({
  textBody: z.string().max(20000).nullable().optional(),
  linkUrl: z.string().url().max(2000).nullable().optional(),
  fileKey: z.string().max(300).nullable().optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    const body = SubmitBody.parse(await request.json());

    const assignment = await prisma.assignment.findFirst({
      where: { id, NOT: { publishedAt: null } },
    });
    if (!assignment) throw new DomainError(404, "not_found", "Assignment not found.");

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        courseId_clientId: {
          courseId: assignment.courseId,
          clientId: actor.clientId,
        },
      },
    });
    if (!enrollment) {
      throw new DomainError(403, "not_enrolled", "You are not enrolled in this course.");
    }

    const hasContent =
      (body.textBody && body.textBody.trim()) ||
      (body.linkUrl && body.linkUrl.trim()) ||
      (body.fileKey && body.fileKey.trim());
    if (!hasContent) {
      throw new DomainError(400, "empty_submission", "Add your work before submitting.");
    }

    const submission = await prisma.submission.upsert({
      where: {
        assignmentId_clientId: { assignmentId: id, clientId: actor.clientId },
      },
      create: {
        tenantId: actor.tenantId,
        assignmentId: id,
        clientId: actor.clientId,
        status: "SUBMITTED",
        textBody: body.textBody ?? null,
        linkUrl: body.linkUrl ?? null,
        fileKey: body.fileKey ?? null,
      },
      update: {
        status: "SUBMITTED",
        textBody: body.textBody ?? null,
        linkUrl: body.linkUrl ?? null,
        fileKey: body.fileKey ?? null,
        submittedAt: new Date(),
      },
    });

    return ok({ submission });
  } catch (e) {
    return handleError(e);
  }
}
