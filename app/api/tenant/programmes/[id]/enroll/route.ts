import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { sendEmail } from "@/lib/email/send";
import { enrollmentConfirmationEmail } from "@/lib/email/templates";
import { loadTenantBrandingById } from "@/lib/email/branding";
import { logger } from "@/lib/logger";

const Body = z.object({ clientId: z.string().min(1) });

/**
 * Manually onboard a learner into a programme: enrolls them into every
 * published course in the programme. Works for private/paid programmes too
 * (staff-driven onboarding, no learner checkout).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
    const { id } = await ctx.params;
    const { clientId } = Body.parse(await request.json());
    const meta = requestMeta(request);

    const programme = await prisma.programme.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        courses: {
          include: { course: { select: { id: true, status: true } } },
        },
      },
    });
    if (!programme) throw new DomainError(404, "not_found", "Programme not found.");

    const client = await prisma.client.findFirst({ where: { id: clientId, tenantId: actor.tenantId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const courseIds = programme.courses
      .filter((pc) => pc.course.status === "PUBLISHED")
      .map((pc) => pc.courseId);
    if (courseIds.length === 0) {
      throw new DomainError(400, "no_courses", "This programme has no published courses to enroll in.");
    }

    let enrolled = 0;
    for (const courseId of courseIds) {
      await prisma.enrollment.upsert({
        where: { courseId_clientId: { courseId, clientId } },
        create: { tenantId: actor.tenantId, courseId, clientId },
        update: {},
      });
      enrolled += 1;
    }

    // Record programme-level membership too. Course enrollments alone cannot
    // express it, and library items assigned to a programme resolve through here.
    await prisma.programmeEnrollment.upsert({
      where: { programmeId_clientId: { programmeId: id, clientId } },
      create: { tenantId: actor.tenantId, programmeId: id, clientId },
      update: {},
    });

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "programme.manual_enroll",
      tenantId: actor.tenantId,
      targetType: "Programme",
      targetId: id,
      after: { clientId, courses: enrolled } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    // Confirmation email — best-effort.
    if (client.email) {
      try {
        const branding = await loadTenantBrandingById(actor.tenantId);
        await sendEmail({
          to: client.email,
          subject: `You're enrolled — ${programme.title}`,
          replyTo: branding.supportEmail,
          fromName: branding.name,
          html: enrollmentConfirmationEmail(branding, {
            name: `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() || null,
            itemName: programme.title,
            itemType: "programme",
            actionUrl: `${branding.appOrigin}/my-courses`,
          }),
        });
      } catch (err) {
        logger.error({ err, programmeId: id }, "enrollment_email_failed");
      }
    }
    return ok({ enrolledCourses: enrolled }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
