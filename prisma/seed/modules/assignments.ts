import { DAY, type SeedContext } from "../index";
import { ASSIGNMENT_CATALOG } from "../components/catalogs/assignments";

export async function seedAssignments(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;
  const instructorId = ctx.ids.instructorId;

  for (const a of ASSIGNMENT_CATALOG) {
    const course = ctx.ids.courseBySlug[a.courseSlug];
    if (!course) continue;

    const assignment = await prisma.assignment.create({
      data: {
        tenantId,
        courseId: course.courseId,
        title: a.title,
        description: a.description,
        type: a.type,
        maxPoints: 100,
        dueAt: new Date(now + a.dueInDays * DAY),
        publishedAt: new Date(now - 10 * DAY),
      },
    });

    if (a.submit) {
      const submission = await prisma.submission.create({
        data: {
          tenantId,
          assignmentId: assignment.id,
          clientId,
          status: a.submit.grade != null ? "GRADED" : "SUBMITTED",
          textBody: a.submit.text,
          submittedAt: new Date(now - 6 * DAY),
        },
      });
      if (a.submit.grade != null) {
        await prisma.grade.create({
          data: {
            tenantId,
            submissionId: submission.id,
            courseId: course.courseId,
            clientId,
            points: a.submit.grade,
            maxPoints: 100,
            feedback: "Strong work — clear, well-structured, and relevant to the Nigerian context.",
            gradedById: instructorId,
            gradedAt: new Date(now - 4 * DAY),
          },
        });
      }
    }
  }
}
