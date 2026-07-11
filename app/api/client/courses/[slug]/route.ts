import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { billingConfigured, env } from "@/lib/env";
import { paystackProvider } from "@/lib/billing/paystack";
import { flutterwaveProvider, flutterwaveReference } from "@/lib/billing/flutterwave";
import { billingReference } from "@/lib/billing/reference";

const EnrollBody = z.object({
  provider: z.enum(["paystack", "flutterwave"]).optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const actor = await requireClientActor();
    const { slug } = await ctx.params;
    const course = await prisma.course.findFirst({
      where: { tenantId: actor.tenantId, slug, status: "PUBLISHED" },
      include: {
        lessons: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, sortOrder: true, durationMin: true } },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_clientId: { courseId: course.id, clientId: actor.clientId } },
      include: { lessonProgress: true },
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
    const body = EnrollBody.parse(await request.json().catch(() => ({})));

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
      return ok({ enrollment, checkoutUrl: null }, undefined, 201);
    }

    if (!billingConfigured()) {
      throw new DomainError(503, "billing_unconfigured", "Payments are not available.");
    }

    const subaccount = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    if (!subaccount?.courseSalesEnabled) {
      throw new DomainError(400, "sales_disabled", "Course sales are not enabled for this academy.");
    }

    const providerName = body.provider ?? (subaccount.defaultProvider === "FLUTTERWAVE" ? "flutterwave" : "paystack");
    const provider = providerName === "paystack" ? paystackProvider : flutterwaveProvider;

    if (providerName === "paystack" && (!subaccount.paystackSubaccountCode || subaccount.paystackStatus !== "ACTIVE")) {
      throw new DomainError(400, "subaccount_inactive", "Paystack payouts are not active.");
    }
    if (providerName === "flutterwave" && (!subaccount.flutterwaveSubaccountId || subaccount.flutterwaveStatus !== "ACTIVE")) {
      throw new DomainError(400, "subaccount_inactive", "Flutterwave payouts are not active.");
    }

    const client = await prisma.client.findUnique({ where: { id: actor.clientId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const reference = providerName === "flutterwave" ? flutterwaveReference("course") : billingReference("course");
    const platformFeeCents = Math.round((course.priceCents * subaccount.platformCommissionPct) / 100);

    await prisma.coursePayment.create({
      data: {
        tenantId: actor.tenantId,
        courseId: course.id,
        clientId: actor.clientId,
        provider: providerName === "paystack" ? "PAYSTACK" : "FLUTTERWAVE",
        amountCents: course.priceCents,
        currency: course.currency,
        externalRef: reference,
        platformFeeCents,
        tenantPayoutCents: course.priceCents - platformFeeCents,
      },
    });

    const host = request.headers.get("host") ?? "localhost:3000";
    const callbackUrl = `http://${host}/my-courses?checkout=done`;

    const checkout = await provider.initializeCheckout({
      email: client.email,
      amountCents: course.priceCents,
      currency: course.currency,
      reference,
      callbackUrl,
      metadata: {
        type: "course_purchase",
        tenantId: actor.tenantId,
        courseId: course.id,
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
