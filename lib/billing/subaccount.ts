import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { createPaystackSubaccount } from "./paystack";
import { createFlutterwaveSubaccount } from "./flutterwave";

export async function provisionTenantSubaccounts(tenantId: string) {
  const row = await prisma.tenantSubaccount.findUnique({ where: { tenantId } });
  if (!row) throw new Error("Subaccount record not found.");

  const commission = row.platformCommissionPct ?? env.PLATFORM_COMMISSION_PCT;
  let paystackCode = row.paystackSubaccountCode;
  let flutterwaveId = row.flutterwaveSubaccountId;
  let paystackStatus = row.paystackStatus;
  let flutterwaveStatus = row.flutterwaveStatus;
  let accountName = row.settlementAccountName;

  try {
    if (!paystackCode) {
      const ps = await createPaystackSubaccount({
        businessName: row.businessName,
        settlementBankCode: row.settlementBankCode,
        accountNumber: row.settlementAccountNumber,
        percentageCharge: commission,
        primaryContactEmail: row.businessEmail ?? undefined,
      });
      paystackCode = ps.subaccount_code;
      paystackStatus = ps.active ? "ACTIVE" : "PENDING";
      accountName = accountName ?? ps.account_name;
    }
  } catch {
    paystackStatus = "FAILED";
  }

  try {
    if (!flutterwaveId) {
      const fw = await createFlutterwaveSubaccount({
        businessName: row.businessName,
        businessEmail: row.businessEmail ?? undefined,
        businessMobile: row.businessPhone ?? undefined,
        settlementBankCode: row.settlementBankCode,
        accountNumber: row.settlementAccountNumber,
        splitValue: commission,
      });
      flutterwaveId = fw.subaccount_id;
      flutterwaveStatus = "ACTIVE";
      accountName = accountName ?? fw.full_name;
    }
  } catch {
    flutterwaveStatus = "FAILED";
  }

  const courseSalesEnabled = paystackStatus === "ACTIVE" || flutterwaveStatus === "ACTIVE";

  return prisma.tenantSubaccount.update({
    where: { tenantId },
    data: {
      paystackSubaccountCode: paystackCode,
      paystackStatus,
      paystackProvisionedAt: paystackCode ? new Date() : undefined,
      flutterwaveSubaccountId: flutterwaveId,
      flutterwaveStatus,
      flutterwaveProvisionedAt: flutterwaveId ? new Date() : undefined,
      settlementAccountName: accountName,
      courseSalesEnabled,
    },
  });
}

export async function activateSubscription(tenantId: string, planId: string, provider: "PAYSTACK" | "FLUTTERWAVE") {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found.");
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + 1);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      subscriptionPlanId: planId,
      subscriptionEndsAt: endsAt,
      storageQuotaBytes: plan.storageQuotaBytes,
      billingProvider: provider,
      status: "ACTIVE",
    },
  });
}

export async function completeCoursePurchase(input: {
  tenantId: string;
  courseId: string;
  clientId: string;
  reference: string;
  amountCents: number;
  currency: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  platformFeeCents?: number;
  tenantPayoutCents?: number;
  providerData?: object;
}) {
  const existing = await prisma.coursePayment.findUnique({ where: { externalRef: input.reference } });
  if (existing?.status === "SUCCESS") {
    const enrollment = await prisma.enrollment.findFirst({
      where: { courseId: input.courseId, clientId: input.clientId },
    });
    return { payment: existing, enrollment };
  }

  const payment = await prisma.coursePayment.upsert({
    where: { externalRef: input.reference },
    create: {
      tenantId: input.tenantId,
      courseId: input.courseId,
      clientId: input.clientId,
      provider: input.provider,
      amountCents: input.amountCents,
      currency: input.currency,
      status: "SUCCESS",
      externalRef: input.reference,
      platformFeeCents: input.platformFeeCents ?? null,
      tenantPayoutCents: input.tenantPayoutCents ?? null,
      providerData: input.providerData as object,
      completedAt: new Date(),
    },
    update: {
      status: "SUCCESS",
      completedAt: new Date(),
      platformFeeCents: input.platformFeeCents ?? null,
      tenantPayoutCents: input.tenantPayoutCents ?? null,
    },
  });

  const enrollment = await prisma.enrollment.upsert({
    where: { courseId_clientId: { courseId: input.courseId, clientId: input.clientId } },
    create: {
      tenantId: input.tenantId,
      courseId: input.courseId,
      clientId: input.clientId,
      paymentId: payment.id,
    },
    update: { paymentId: payment.id },
  });

  return { payment, enrollment };
}

/**
 * Fulfill a library item purchase: mark the payment successful and mint the
 * entitlement. Idempotent — a replayed webhook upserts the same row.
 */
export async function completeLibraryPurchase(input: {
  tenantId: string;
  itemId: string;
  clientId: string;
  reference: string;
  amountCents: number;
  currency: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  platformFeeCents?: number;
  tenantPayoutCents?: number;
  providerData?: object;
}) {
  const existing = await prisma.libraryPayment.findUnique({ where: { externalRef: input.reference } });

  const payment =
    existing?.status === "SUCCESS"
      ? existing
      : await prisma.libraryPayment.upsert({
          where: { externalRef: input.reference },
          create: {
            tenantId: input.tenantId,
            itemId: input.itemId,
            clientId: input.clientId,
            provider: input.provider,
            amountCents: input.amountCents,
            currency: input.currency,
            status: "SUCCESS",
            externalRef: input.reference,
            platformFeeCents: input.platformFeeCents ?? null,
            tenantPayoutCents: input.tenantPayoutCents ?? null,
            providerData: input.providerData as object,
            completedAt: new Date(),
          },
          update: {
            status: "SUCCESS",
            completedAt: new Date(),
            platformFeeCents: input.platformFeeCents ?? null,
            tenantPayoutCents: input.tenantPayoutCents ?? null,
          },
        });

  const entitlement = await prisma.libraryEntitlement.upsert({
    where: { itemId_clientId: { itemId: input.itemId, clientId: input.clientId } },
    create: {
      tenantId: input.tenantId,
      itemId: input.itemId,
      clientId: input.clientId,
      source: "PURCHASE",
      paymentId: payment.id,
    },
    update: { paymentId: payment.id },
  });

  return { payment, entitlement };
}

export async function completeProgrammePurchase(input: {
  tenantId: string;
  programmeId: string;
  clientId: string;
  reference: string;
  amountCents: number;
  currency: string;
  provider: "PAYSTACK" | "FLUTTERWAVE";
  platformFeeCents?: number;
  tenantPayoutCents?: number;
  providerData?: object;
}) {
  const existing = await prisma.programmePayment.findUnique({ where: { externalRef: input.reference } });

  const payment =
    existing?.status === "SUCCESS"
      ? existing
      : await prisma.programmePayment.upsert({
          where: { externalRef: input.reference },
          create: {
            tenantId: input.tenantId,
            programmeId: input.programmeId,
            clientId: input.clientId,
            provider: input.provider,
            amountCents: input.amountCents,
            currency: input.currency,
            status: "SUCCESS",
            externalRef: input.reference,
            platformFeeCents: input.platformFeeCents ?? null,
            tenantPayoutCents: input.tenantPayoutCents ?? null,
            providerData: input.providerData as object,
            completedAt: new Date(),
          },
          update: {
            status: "SUCCESS",
            completedAt: new Date(),
            platformFeeCents: input.platformFeeCents ?? null,
            tenantPayoutCents: input.tenantPayoutCents ?? null,
          },
        });

  // Enroll the learner into every published course in the programme.
  const links = await prisma.programmeCourse.findMany({
    where: { programmeId: input.programmeId },
    include: { course: { select: { id: true, status: true } } },
  });
  let enrolled = 0;
  for (const link of links) {
    if (link.course.status !== "PUBLISHED") continue;
    await prisma.enrollment.upsert({
      where: { courseId_clientId: { courseId: link.courseId, clientId: input.clientId } },
      create: { tenantId: input.tenantId, courseId: link.courseId, clientId: input.clientId },
      update: {},
    });
    enrolled += 1;
  }

  // Programme-level membership, linked to the payment that bought it. Course
  // enrollments alone cannot express this, and library items assigned to a
  // programme resolve their audience through here.
  await prisma.programmeEnrollment.upsert({
    where: { programmeId_clientId: { programmeId: input.programmeId, clientId: input.clientId } },
    create: {
      tenantId: input.tenantId,
      programmeId: input.programmeId,
      clientId: input.clientId,
      paymentId: payment.id,
    },
    update: { paymentId: payment.id },
  });

  return { payment, enrolled };
}
