import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { awardCourseCompletion } from "@/lib/certificates/award";

const CompleteBody = z.object({
  lessonId: z.string().min(1),
});

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await requireClientActor();
    const { slug } = await ctx.params;

    const course = await prisma.course.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
      include: { lessons: { orderBy: { sortOrder: "asc" } } },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
      include: { lessonProgress: true },
    });
    if (!enrollment) throw new DomainError(403, "not_enrolled", "You are not enrolled in this course.");

    const completed = new Set(enrollment.lessonProgress.map((p) => p.lessonId));
    const lessons = course.lessons.map((l) => ({
      ...l,
      assetUrl: l.assetKey && s3Configured() ? publicUrlForKey(l.assetKey) : null,
      completed: completed.has(l.id),
    }));

    return ok({ course: { id: course.id, title: course.title, slug: course.slug }, enrollment, lessons });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    const { lessonId } = CompleteBody.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
      include: { lessons: true },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
    });
    if (!enrollment) throw new DomainError(403, "not_enrolled", "You are not enrolled in this course.");

    const lesson = course.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new DomainError(404, "not_found", "Lesson not found.");

    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: { enrollmentId: enrollment.id, lessonId, tenantId: actor.tenantId },
      update: {},
    });

    const completedCount = await prisma.lessonProgress.count({ where: { enrollmentId: enrollment.id } });
    const total = course.lessons.length;
    const progressPercent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
    const completedAt = progressPercent >= 100 ? new Date() : null;

    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { progressPercent, completedAt: completedAt ?? enrollment.completedAt },
    });

    // On first completion, auto-issue any certificates linked to this course.
    if (progressPercent >= 100) {
      await awardCourseCompletion(actor.tenantId, course.id, actor.clientId);
    }

    return ok({ enrollment: updated });
  } catch (e) {
    return handleError(e);
  }
}
