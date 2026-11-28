import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { sendEmail } from "@/lib/email/send";
import { enrollmentConfirmationEmail } from "@/lib/email/templates";
import { loadTenantBrandingById } from "@/lib/email/branding";
import { logger } from "@/lib/logger";
import { emitEvent } from "@/lib/integrations/events";

/**
 * Staff (or API) enrolment of a learner on a course — the path shared by the
 * admin enrolments route and the Developer API.
 *
 * Any PUBLISHED course, including private and paid ones (comped / offline
 * payment). Idempotent: an existing enrolment is returned unchanged. The
 * confirmation email and `enrollment.created` happen on the first enrolment
 * only; the email is best-effort.
 */
export async function enrollLearner(tenantId: string, input: { clientId: string; courseId: string }) {
  const course = await prisma.course.findFirst({
    where: { id: input.courseId, tenantId, status: "PUBLISHED" },
  });
  if (!course) throw new DomainError(404, "not_found", "Course not found.");

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, tenantId },
  });
  if (!client) throw new DomainError(404, "not_found", "Learner not found.");

  const existing = await prisma.enrollment.findUnique({
    where: { courseId_clientId: { courseId: input.courseId, clientId: input.clientId } },
    select: { id: true },
  });
  const enrollment = await prisma.enrollment.upsert({
    where: { courseId_clientId: { courseId: input.courseId, clientId: input.clientId } },
    create: {
      tenantId,
      courseId: input.courseId,
      clientId: input.clientId,
    },
    update: {},
  });

  if (!existing) {
    if (client.email) {
      try {
        const branding = await loadTenantBrandingById(tenantId);
        await sendEmail({
          to: client.email,
          subject: `You're enrolled — ${course.title}`,
          replyTo: branding.supportEmail,
          fromName: branding.name,
          html: enrollmentConfirmationEmail(branding, {
            name: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || null,
            itemName: course.title,
            itemType: "course",
            actionUrl: `${branding.appOrigin}/my-courses`,
          }),
        });
      } catch (err) {
        logger.error({ err, courseId: input.courseId }, "enrollment_email_failed");
      }
    }
    await emitEvent(
      tenantId,
      "enrollment.created",
      { enrollmentId: enrollment.id, learnerId: client.id, courseId: course.id, enrolledAt: enrollment.enrolledAt.toISOString() },
      { learnerId: client.id }
    );
  }
  return { enrollment, created: !existing };
}
