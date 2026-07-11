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
      select: { courseId: true },
    });
    const enrolledSet = new Set(enrollments.map((e) => e.courseId));

    const programmes = await prisma.programme.findMany({
      where: { tenantId: actor.tenantId, status: "PUBLISHED", visibility: "PUBLIC" },
      orderBy: { publishedAt: "desc" },
      include: {
        courses: { select: { courseId: true, course: { select: { status: true } } } },
      },
    });

    const rows = programmes.map((p) => {
      const publishedCourseIds = p.courses
        .filter((pc) => pc.course.status === "PUBLISHED")
        .map((pc) => pc.courseId);
      const enrolledCourses = publishedCourseIds.filter((id) => enrolledSet.has(id)).length;
      return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        thumbnailUrl: p.thumbnailKey && s3Configured() ? publicUrlForKey(p.thumbnailKey) : null,
        totalCourses: publishedCourseIds.length,
        enrolledCourses,
      };
    });

    return ok({ programmes: rows });
  } catch (e) {
    return handleError(e);
  }
}
