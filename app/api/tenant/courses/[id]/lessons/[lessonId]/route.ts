import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  contentType: z.enum(["TEXT", "HTML", "VIDEO_URL", "FILE", "QUIZ"]).optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  assetKey: z.string().max(300).nullable().optional(),
  durationMin: z.number().int().min(0).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; lessonId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId, lessonId } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, courseId, tenantId: actor.tenantId },
    });
    if (!lesson) throw new DomainError(404, "not_found", "Lesson not found.");

    if (body.groupId) {
      const group = await prisma.lessonGroup.findFirst({
        where: { id: body.groupId, courseId, tenantId: actor.tenantId },
      });
      if (!group) throw new DomainError(400, "invalid_group", "Lesson group not found in this course.");
    }

    const updated = await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...body,
        ...(body.contentJson ? { contentJson: body.contentJson as object } : {}),
      },
    });
    return ok({ lesson: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; lessonId: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId, lessonId } = await ctx.params;
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, courseId, tenantId: actor.tenantId },
    });
    if (!lesson) throw new DomainError(404, "not_found", "Lesson not found.");
    await prisma.lesson.delete({ where: { id: lessonId } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
