import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

/**
 * Self-enroll into a public programme. Free programmes enroll the learner into
 * every published course. Paid programmes require staff onboarding (bundle
 * checkout is handled outside self-service).
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { slug } = await ctx.params;

    const programme = await prisma.programme.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED", visibility: "PUBLIC" },
      include: { courses: { include: { course: { select: { id: true, status: true } } } } },
    });
    if (!programme) throw new DomainError(404, "not_found", "Programme not found.");

    if (programme.priceCents != null && programme.priceCents > 0) {
      throw new DomainError(
        403,
        "paid_programme",
        "This programme is paid — please contact the academy to enroll."
      );
    }

    const courseIds = programme.courses
      .filter((pc) => pc.course.status === "PUBLISHED")
      .map((pc) => pc.courseId);
    if (courseIds.length === 0) {
      throw new DomainError(400, "no_courses", "This programme has no available courses yet.");
    }

    let enrolled = 0;
    for (const courseId of courseIds) {
      await prisma.enrollment.upsert({
        where: { courseId_clientId: { courseId, clientId: actor.clientId } },
        create: { tenantId: actor.tenantId, courseId, clientId: actor.clientId },
        update: {},
      });
      enrolled += 1;
    }

    return ok({ enrolledCourses: enrolled }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
