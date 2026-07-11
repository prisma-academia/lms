import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";

export async function GET() {
  try {
    const actor = await requireClientActor();

    const enrollments = await prisma.enrollment.findMany({
      where: { clientId: actor.clientId },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (courseIds.length === 0) return ok({ assignments: [] });

    const rows = await prisma.assignment.findMany({
      where: { courseId: { in: courseIds }, NOT: { publishedAt: null } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        course: { select: { id: true, title: true, slug: true } },
        submissions: {
          where: { clientId: actor.clientId },
          include: { grade: true },
        },
      },
    });

    const assignments = rows.map((a) => {
      const { submissions, ...rest } = a;
      return { ...rest, submission: submissions[0] ?? null };
    });

    return ok({ assignments });
  } catch (e) {
    return handleError(e);
  }
}
