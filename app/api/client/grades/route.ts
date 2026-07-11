import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";

export async function GET() {
  try {
    const actor = await requireClientActor();

    const grades = await prisma.grade.findMany({
      where: { clientId: actor.clientId },
      orderBy: { gradedAt: "desc" },
      include: {
        submission: {
          include: {
            assignment: { select: { title: true, courseId: true } },
          },
        },
      },
    });

    // Per-course averages (percentage of points earned).
    const courseIds = Array.from(new Set(grades.map((g) => g.courseId)));
    const courses = courseIds.length
      ? await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    const byCourse = courseIds.map((courseId) => {
      const rows = grades.filter((g) => g.courseId === courseId);
      const totalPoints = rows.reduce((s, g) => s + g.points, 0);
      const totalMax = rows.reduce((s, g) => s + g.maxPoints, 0);
      const average = totalMax === 0 ? 0 : Math.round((totalPoints / totalMax) * 100);
      const course = courseMap.get(courseId);
      return {
        courseId,
        title: course?.title ?? "Course",
        slug: course?.slug ?? null,
        average,
        count: rows.length,
      };
    });

    const totalPoints = grades.reduce((s, g) => s + g.points, 0);
    const totalMax = grades.reduce((s, g) => s + g.maxPoints, 0);
    const overall = totalMax === 0 ? 0 : Math.round((totalPoints / totalMax) * 100);

    const items = grades.map((g) => ({
      id: g.id,
      points: g.points,
      maxPoints: g.maxPoints,
      percent: g.maxPoints === 0 ? 0 : Math.round((g.points / g.maxPoints) * 100),
      feedback: g.feedback,
      gradedAt: g.gradedAt,
      title: g.submission.assignment.title,
      courseId: g.courseId,
    }));

    return ok({ grades: items, byCourse, overall });
  } catch (e) {
    return handleError(e);
  }
}
