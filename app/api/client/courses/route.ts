import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

export async function GET() {
  try {
    const actor = await requireClientActor();

    const enrollments = await prisma.enrollment.findMany({
      where: { clientId: actor.clientId },
      select: { courseId: true, progressPercent: true, completedAt: true },
    });
    const enrolled = new Map(enrollments.map((e) => [e.courseId, e]));

    // Catalog shows PUBLIC published courses, plus any course the learner is
    // already enrolled in (e.g. privately onboarded), so their courses persist.
    const courses = await prisma.course.findMany({
      where: {
        tenantId: actor.tenantId,
        status: "PUBLISHED",
        OR: [
          { visibility: "PUBLIC" },
          ...(enrolled.size > 0 ? [{ id: { in: [...enrolled.keys()] } }] : []),
        ],
      },
      orderBy: { publishedAt: "desc" },
      include: { _count: { select: { lessons: true } } },
    });

    const rows = courses.map((c) => ({
      ...c,
      thumbnailUrl: c.thumbnailKey && s3Configured() ? publicUrlForKey(c.thumbnailKey) : null,
      lessonCount: c._count.lessons,
      enrollment: enrolled.get(c.id) ?? null,
    }));

    return ok({ courses: rows });
  } catch (e) {
    return handleError(e);
  }
}
