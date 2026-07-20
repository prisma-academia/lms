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
import { billingConfigured } from "@/lib/env";
import { paystackProvider } from "@/lib/billing/paystack";
import { flutterwaveProvider, flutterwaveReference } from "@/lib/billing/flutterwave";
import { billingReference } from "@/lib/billing/reference";

const EnrollBody = z.object({
  provider: z.enum(["paystack", "flutterwave"]).optional(),
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
    const body = EnrollBody.parse(await request.json().catch(() => ({})));

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
      await prisma.programmeEnrollment.upsert({
        where: { programmeId_clientId: { programmeId: programme.id, clientId: actor.clientId } },
        create: { tenantId: actor.tenantId, programmeId: programme.id, clientId: actor.clientId },
        update: {},
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

    // Paid programme — go through provider checkout.
    if (!billingConfigured()) {
      throw new DomainError(503, "billing_unconfigured", "Payments are not available.");
    }

    const subaccount = await prisma.tenantSubaccount.findUnique({
      where: { tenantId: actor.tenantId },
    });
    if (!subaccount?.courseSalesEnabled) {
      throw new DomainError(400, "sales_disabled", "Course sales are not enabled for this academy.");
    }

    const providerName =
      body.provider ?? (subaccount.defaultProvider === "FLUTTERWAVE" ? "flutterwave" : "paystack");
    const provider = providerName === "paystack" ? paystackProvider : flutterwaveProvider;

    if (providerName === "paystack" && (!subaccount.paystackSubaccountCode || subaccount.paystackStatus !== "ACTIVE")) {
      throw new DomainError(400, "subaccount_inactive", "Paystack payouts are not active.");
    }
    if (providerName === "flutterwave" && (!subaccount.flutterwaveSubaccountId || subaccount.flutterwaveStatus !== "ACTIVE")) {
      throw new DomainError(400, "subaccount_inactive", "Flutterwave payouts are not active.");
    }

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const reference =
      providerName === "flutterwave" ? flutterwaveReference("programme") : billingReference("programme");
    const platformFeeCents = Math.round((programme.priceCents * subaccount.platformCommissionPct) / 100);

    await prisma.programmePayment.create({
      data: {
        tenantId: actor.tenantId,
        programmeId: programme.id,
        clientId: actor.clientId,
        provider: providerName === "paystack" ? "PAYSTACK" : "FLUTTERWAVE",
        amountCents: programme.priceCents,
        currency: programme.currency,
        externalRef: reference,
        platformFeeCents,
        tenantPayoutCents: programme.priceCents - platformFeeCents,
      },
    });

    const host = request.headers.get("host") ?? "localhost:3000";
    const callbackUrl = `http://${host}/my-courses?checkout=done`;

    const checkout = await provider.initializeCheckout({
      email: client.email,
      amountCents: programme.priceCents,
      currency: programme.currency,
      reference,
      callbackUrl,
      metadata: {
        type: "programme_purchase",
        tenantId: actor.tenantId,
        programmeId: programme.id,
        clientId: actor.clientId,
      },
      subaccount: {
        paystackCode: subaccount.paystackSubaccountCode ?? undefined,
        flutterwaveId: subaccount.flutterwaveSubaccountId ?? undefined,
        platformFeeCents,
        commissionPct: subaccount.platformCommissionPct,
      },
    });

    return ok({ checkoutUrl: checkout.authorizationUrl, reference });
  } catch (e) {
    return handleError(e);
  }
}
