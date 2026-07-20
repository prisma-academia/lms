import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).optional(),
  contentType: z.enum(["TEXT", "HTML", "VIDEO_URL", "FILE", "QUIZ"]).optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  assetKey: z.string().max(300).nullable().optional(),
  durationMin: z.number().int().min(0).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_READ.key);
    const { id: courseId } = await ctx.params;
    const lessons = await prisma.lesson.findMany({
      where: { courseId, tenantId: actor.tenantId },
      orderBy: { sortOrder: "asc" },
    });
    return ok({ lessons });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = CreateBody.parse(await request.json());

    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    if (body.groupId) {
      const group = await prisma.lessonGroup.findFirst({
        where: { id: body.groupId, courseId, tenantId: actor.tenantId },
      });
      if (!group) throw new DomainError(400, "invalid_group", "Lesson group not found in this course.");
    }

    const maxOrder = await prisma.lesson.aggregate({
      where: { courseId },
      _max: { sortOrder: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        tenantId: actor.tenantId,
        title: body.title,
        sortOrder: body.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        contentType: body.contentType ?? "TEXT",
        contentJson: (body.contentJson ?? {}) as object,
        assetKey: body.assetKey ?? null,
        durationMin: body.durationMin ?? null,
        groupId: body.groupId ?? null,
      },
    });
    return ok({ lesson }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
