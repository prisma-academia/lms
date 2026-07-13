/**
 * Assert demo tenant seed coverage. Exit 1 on failure.
 * Run: npm run db:seed:verify
 */
import "dotenv/config";
import { rawPrisma as prisma } from "../lib/db/raw-client";

const SLUG = "demo";

type Check = { label: string; actual: number; min: number };

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) {
    console.error("FAIL: demo tenant not found — run npm run db:seed:demo");
    process.exit(1);
  }

  const tid = tenant.id;

  const [
    courses,
    programmes,
    events,
    messages,
    notifications,
    certAwards,
    fees,
    resources,
    lessonGroups,
    quizLessons,
    videoLessons,
    questionBanks,
    clientGroups,
    userGroups,
    templates,
    activityLogs,
    paidCourses,
    coursePayments,
    platformPayments,
    subaccounts,
  ] = await Promise.all([
    prisma.course.count({ where: { tenantId: tid } }),
    prisma.programme.count({ where: { tenantId: tid } }),
    prisma.event.count({ where: { tenantId: tid } }),
    prisma.message.count({ where: { tenantId: tid } }),
    prisma.notification.count({ where: { tenantId: tid } }),
    prisma.certificateAward.count({ where: { tenantId: tid } }),
    prisma.fee.count({ where: { tenantId: tid } }),
    prisma.resource.count({ where: { tenantId: tid } }),
    prisma.lessonGroup.count({ where: { tenantId: tid } }),
    prisma.lesson.count({ where: { tenantId: tid, contentType: "QUIZ" } }),
    prisma.lesson.count({ where: { tenantId: tid, contentType: "VIDEO_URL" } }),
    prisma.questionBank.count({ where: { tenantId: tid } }),
    prisma.clientGroup.count({ where: { tenantId: tid } }),
    prisma.userGroup.count({ where: { tenantId: tid } }),
    prisma.template.count({ where: { tenantId: tid } }),
    prisma.activityLog.count({ where: { tenantId: tid } }),
    prisma.course.count({ where: { tenantId: tid, priceCents: { gt: 0 } } }),
    prisma.coursePayment.count({ where: { tenantId: tid, status: "SUCCESS" } }),
    prisma.platformPayment.count({ where: { tenantId: tid, status: "SUCCESS" } }),
    prisma.tenantSubaccount.count({ where: { tenantId: tid, courseSalesEnabled: true } }),
  ]);

  const checks: Check[] = [
    { label: "courses", actual: courses, min: 7 },
    { label: "programmes", actual: programmes, min: 2 },
    { label: "events", actual: events, min: 5 },
    { label: "messages", actual: messages, min: 2 },
    { label: "notifications", actual: notifications, min: 3 },
    { label: "certificate awards", actual: certAwards, min: 1 },
    { label: "fees", actual: fees, min: 2 },
    { label: "resources", actual: resources, min: 3 },
    { label: "lesson groups", actual: lessonGroups, min: 2 },
    { label: "quiz lessons", actual: quizLessons, min: 3 },
    { label: "video lessons", actual: videoLessons, min: 4 },
    { label: "question banks", actual: questionBanks, min: 3 },
    { label: "client groups", actual: clientGroups, min: 1 },
    { label: "user groups", actual: userGroups, min: 1 },
    { label: "templates", actual: templates, min: 1 },
    { label: "activity logs", actual: activityLogs, min: 5 },
    { label: "paid courses", actual: paidCourses, min: 2 },
    { label: "course payments (SUCCESS)", actual: coursePayments, min: 2 },
    { label: "platform payments (SUCCESS)", actual: platformPayments, min: 3 },
    { label: "active subaccount", actual: subaccounts, min: 1 },
  ];

  let failed = false;
  for (const c of checks) {
    const ok = c.actual >= c.min;
    console.log(`${ok ? "OK" : "FAIL"}  ${c.label}: ${c.actual} (min ${c.min})`);
    if (!ok) failed = true;
  }

  const settings = tenant.settingsJson as { currency?: string; locale?: string };
  if (settings.currency !== "NGN") {
    console.log("FAIL  tenant currency: expected NGN, got", settings.currency);
    failed = true;
  } else {
    console.log("OK  tenant currency: NGN");
  }

  if (tenant.subscriptionStatus !== "ACTIVE" || !tenant.subscriptionPlanId) {
    console.log(
      "FAIL  tenant subscription: expected ACTIVE with a plan, got",
      tenant.subscriptionStatus
    );
    failed = true;
  } else {
    console.log("OK  tenant subscription: ACTIVE");
  }

  if (failed) {
    console.error("\nDemo seed verification failed.");
    process.exit(1);
  }
  console.log("\nDemo seed verification passed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
