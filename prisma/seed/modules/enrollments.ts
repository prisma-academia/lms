import { DAY, type SeedContext } from "../index";
import { enrolledCourses, lessonCount } from "../components/catalogs/courses";
import { completionDates, progressPercent } from "../components/factories/progress";
import { NG_LOCALE } from "../components/locale/ng";
import { billingReference } from "../../../lib/billing/reference";

const COMMISSION_PCT = 10;

export async function seedEnrollments(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;

  for (const c of enrolledCourses()) {
    const ref = ctx.ids.courseBySlug[c.slug];
    if (!ref) continue;

    const total = lessonCount(c);
    const doneCount = Math.min(c.completedLessons, total);
    const pct = progressPercent(doneCount, total);
    const isComplete = c.completed === true || doneCount >= total;

    // Paid courses get a completed CoursePayment linked to the enrollment.
    let paymentId: string | null = null;
    if (c.priceCents && c.priceCents > 0) {
      const platformFeeCents = Math.round((c.priceCents * COMMISSION_PCT) / 100);
      const payment = await prisma.coursePayment.create({
        data: {
          tenantId,
          courseId: ref.courseId,
          clientId,
          provider: "PAYSTACK",
          amountCents: c.priceCents,
          currency: NG_LOCALE.currency,
          status: "SUCCESS",
          externalRef: billingReference("course"),
          platformFeeCents,
          tenantPayoutCents: c.priceCents - platformFeeCents,
          completedAt: new Date(now - 20 * DAY),
          createdAt: new Date(now - 20 * DAY),
        },
      });
      paymentId = payment.id;
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        tenantId,
        courseId: ref.courseId,
        clientId,
        progressPercent: pct,
        completedAt: isComplete ? new Date(now - 5 * DAY) : null,
        paymentId,
      },
    });

    const dates = completionDates(now, doneCount);
    for (let i = 0; i < doneCount; i++) {
      await prisma.lessonProgress.create({
        data: {
          tenantId,
          enrollmentId: enrollment.id,
          lessonId: ref.lessonIds[i],
          completedAt: dates[i],
        },
      });
    }
  }
}
