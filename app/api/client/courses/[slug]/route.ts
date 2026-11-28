import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { requireActiveGateway, requireSaleSplit, startCheckout } from "@/lib/billing/providers";
import { checkoutReturnUrl } from "@/lib/billing/redirect";
import { billingReference } from "@/lib/billing/reference";
import { recordEnrollmentReferral } from "@/lib/referrals/attribution";
import { readReferralCookie } from "@/lib/referrals/cookie";
import { emitEvent } from "@/lib/integrations/events";

const EnrollBody = z.object({
  // Older pages let the learner pick a gateway. The platform chooses now
  // (lib/billing/providers.ts), so this is accepted and not read.
  provider: z.string().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    const course = await prisma.course.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
      include: {
        lessons: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, title: true, sortOrder: true, durationMin: true },
        },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
      // completedAt filter: row presence now means "opened", not "completed".
      include: { lessonProgress: { where: { completedAt: { not: null } } } },
    });

    // Private courses are only visible to already-enrolled learners.
    if (course.visibility === "PRIVATE" && !enrollment) {
      throw new DomainError(404, "not_found", "Course not found.");
    }

    return ok({ course, enrollment });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    EnrollBody.parse(await request.json().catch(() => ({})));

    const course = await prisma.course.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const existing = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
    });
    if (existing) return ok({ enrollment: existing, checkoutUrl: null });

    // Self-enrollment is only allowed for public courses; private courses
    // require staff to onboard the learner manually.
    if (course.visibility === "PRIVATE") {
      throw new DomainError(403, "private_course", "This course is not open for self-enrollment.");
    }

    if (course.priceCents == null || course.priceCents === 0) {
      const enrollment = await prisma.enrollment.create({
        data: { tenantId: actor.tenantId, courseId: course.id, clientId: actor.clientId },
      });
      // Credit whoever sent this learner, if anyone did. Never throws.
      await recordEnrollmentReferral({
        tenantId: actor.tenantId,
        clientId: actor.clientId,
        enrollmentId: enrollment.id,
        courseId: course.id,
        cookieCode: await readReferralCookie(),
      });
      // Webhook; never throws, runs after the response.
      await emitEvent(
        actor.tenantId,
        "enrollment.created",
        { enrollmentId: enrollment.id, learnerId: actor.clientId, courseId: course.id, enrolledAt: enrollment.enrolledAt.toISOString(), source: "self" },
        { learnerId: actor.clientId }
      );
      return ok({ enrollment, checkoutUrl: null }, undefined, 201);
    }

    // Paid course. Which gateway, and whether this academy can be paid through
    // it, are both decided in lib/billing/providers.ts.
    const gateway = requireActiveGateway();
    const subaccount = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    const split = requireSaleSplit(subaccount, gateway, course.priceCents);

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const reference = billingReference("course");

    // Written BEFORE the customer is sent to pay. This row is what a later
    // "payment succeeded" is checked against: it proves the reference is ours
    // and fixes the price, so neither can be supplied by whoever calls back.
    await prisma.coursePayment.create({
      data: {
        tenantId: actor.tenantId,
        courseId: course.id,
        clientId: actor.clientId,
        provider: gateway.name,
        amountCents: course.priceCents,
        currency: course.currency,
        externalRef: reference,
        platformFeeCents: split.platformFeeCents,
        tenantPayoutCents: course.priceCents - split.platformFeeCents,
      },
    });

    const checkout = await startCheckout(gateway, {
      email: client.email,
      customerName: [client.firstName, client.lastName].filter(Boolean).join(" ") || undefined,
      description: course.title,
      amountCents: course.priceCents,
      currency: course.currency,
      reference,
      callbackUrl: checkoutReturnUrl(request, "/my-courses", reference),
      metadata: {
        type: "course_purchase",
        tenantId: actor.tenantId,
        courseId: course.id,
        clientId: actor.clientId,
      },
      subaccount: split,
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
