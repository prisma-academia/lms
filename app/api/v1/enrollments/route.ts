import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { EnrollmentCreate, EnrollmentListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";
import { enrollLearner } from "@/lib/courses/enroll";

/** GET /api/v1/enrollments — `updated_since` filters on the enrolment time. */
export const GET = apiRoute({ scope: "enrollments:read" }, async (ctx) => {
  const q = ctx.query(EnrollmentListQuery);
  const rows = await prisma.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "enrolledAt"),
      ...(q.learner_id ? { clientId: q.learner_id } : {}),
      ...(q.course_id ? { courseId: q.course_id } : {}),
      ...(q.completed === "true" ? { completedAt: { not: null } } : q.completed === "false" ? { completedAt: null } : {}),
    },
    ...pageArgs(q, "enrolledAt"),
  });
  return page(rows, q, out.enrollment);
});

/**
 * POST /api/v1/enrollments — enrol a learner on a published course (any
 * visibility or price, as staff can). Idempotent: 201 when new, 200 when the
 * learner was already enrolled.
 */
export const POST = apiRoute({ scope: "enrollments:write" }, async (ctx) => {
  const body = ctx.json(EnrollmentCreate);
  const { enrollment, created } = await enrollLearner(ctx.tenantId, { clientId: body.learnerId, courseId: body.courseId });
  if (created) {
    await audit({ ...ctx.auditActor, action: "enrollment.create", targetType: "Enrollment", targetId: enrollment.id, after: { learnerId: body.learnerId, courseId: body.courseId } });
  }
  return { data: out.enrollment(enrollment), status: created ? 201 : 200 };
});
