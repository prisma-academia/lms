import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { sendEmail } from "@/lib/email/send";
import { enrollmentConfirmationEmail } from "@/lib/email/templates";
import { loadTenantBrandingById } from "@/lib/email/branding";
import { logger } from "@/lib/logger";
import { requireActiveGateway, requireSaleSplit, startCheckout } from "@/lib/billing/providers";
import { checkoutReturnUrl } from "@/lib/billing/redirect";
import { billingReference } from "@/lib/billing/reference";
import { recordEnrollmentReferral } from "@/lib/referrals/attribution";
import { readReferralCookie } from "@/lib/referrals/cookie";

const EnrollBody = z.object({
  // Older pages let the learner pick a gateway. The platform chooses now
  // (lib/billing/providers.ts), so this is accepted and not read.
  provider: z.string().optional(),
});

/**
 * Self-enroll into a public programme. Free programmes enroll the learner into
 * every published course immediately. Paid programmes go through provider
 * checkout (split to the tenant subaccount); on success the webhook / callback
 * enrolls every published course in the bundle.
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    EnrollBody.parse(await request.json().catch(() => ({})));

    const programme = await prisma.programme.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED", visibility: "PUBLIC" },
      include: { courses: { include: { course: { select: { id: true, status: true } } } } },
    });
    if (!programme) throw new DomainError(404, "not_found", "Programme not found.");

    const courseIds = programme.courses
      .filter((pc) => pc.course.status === "PUBLISHED")
      .map((pc) => pc.courseId);
    if (courseIds.length === 0) {
      throw new DomainError(400, "no_courses", "This programme has no available courses yet.");
    }

    // Free programme — enroll into every published course immediately.
    if (programme.priceCents == null || programme.priceCents === 0) {
      let enrolled = 0;
      for (const courseId of courseIds) {
        await prisma.enrollment.upsert({
          where: { courseId_clientId: { courseId, clientId: actor.clientId } },
          create: { tenantId: actor.tenantId, courseId, clientId: actor.clientId },
          update: {},
        });
        enrolled += 1;
      }
      // Programme-level membership. Course enrollments alone cannot express it,
      // and library items assigned to a programme resolve through here.
      const membership = await prisma.programmeEnrollment.upsert({
        where: { programmeId_clientId: { programmeId: programme.id, clientId: actor.clientId } },
        create: { tenantId: actor.tenantId, programmeId: programme.id, clientId: actor.clientId },
        update: {},
        // `tenantId` is here for the tenant-scope guard, which checks the row
        // an upsert returns; selecting only `id` made it throw after the write.
        select: { id: true, tenantId: true },
      });
      // Credit whoever sent this learner, if anyone did. Never throws, and a
      // repeat enrolment records nothing new.
      await recordEnrollmentReferral({
        tenantId: actor.tenantId,
        clientId: actor.clientId,
        enrollmentId: membership.id,
        programmeId: programme.id,
        cookieCode: await readReferralCookie(),
      });
      // Enrollment confirmation — best-effort.
      try {
        const [branding, learner] = await Promise.all([
          loadTenantBrandingById(actor.tenantId),
          prisma.client.findUnique({
            where: { id: actor.clientId },
            select: { email: true, firstName: true, lastName: true },
          }),
        ]);
        if (learner?.email) {
          await sendEmail({
            to: learner.email,
            subject: `You're enrolled — ${programme.title}`,
            replyTo: branding.supportEmail,
            fromName: branding.name,
            html: enrollmentConfirmationEmail(branding, {
              name: `${learner.firstName ?? ""} ${learner.lastName ?? ""}`.trim() || null,
              itemName: programme.title,
              itemType: "programme",
              actionUrl: `${branding.appOrigin}/my-courses`,
            }),
          });
        }
      } catch (err) {
        logger.error({ err, programmeId: programme.id }, "enrollment_email_failed");
      }
      return ok({ enrolledCourses: enrolled, checkoutUrl: null }, undefined, 201);
    }

    // Paid programme. Which gateway, and whether this academy can be paid
    // through it, are both decided in lib/billing/providers.ts.
    const gateway = requireActiveGateway();
    const subaccount = await prisma.tenantSubaccount.findUnique({
      where: { tenantId: actor.tenantId },
    });
    const split = requireSaleSplit(subaccount, gateway, programme.priceCents);

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const reference = billingReference("programme");

    // Written before the customer is sent to pay: the row a later "payment
    // succeeded" is checked against, for both the reference and the price.
    await prisma.programmePayment.create({
      data: {
        tenantId: actor.tenantId,
        programmeId: programme.id,
        clientId: actor.clientId,
        provider: gateway.name,
        amountCents: programme.priceCents,
        currency: programme.currency,
        externalRef: reference,
        platformFeeCents: split.platformFeeCents,
        tenantPayoutCents: programme.priceCents - split.platformFeeCents,
      },
    });

    const checkout = await startCheckout(gateway, {
      email: client.email,
      customerName: [client.firstName, client.lastName].filter(Boolean).join(" ") || undefined,
      description: programme.title,
      amountCents: programme.priceCents,
      currency: programme.currency,
      reference,
      callbackUrl: checkoutReturnUrl(request, "/my-courses", reference),
      metadata: {
        type: "programme_purchase",
        tenantId: actor.tenantId,
        programmeId: programme.id,
        clientId: actor.clientId,
      },
      subaccount: split,
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
