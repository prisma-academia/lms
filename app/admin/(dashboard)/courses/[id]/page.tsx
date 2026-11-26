import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader } from "@/components/shell";
import { ShareDialog } from "@/components/share/share-dialog";
import { requestOrigin } from "@/lib/site/metadata";
import { getReferralCode } from "@/lib/referrals/codes";
import { formatDate, formatDateTime, type FormatContext } from "@/lib/format";
import { CourseEditor } from "./course-editor";
import type { CourseAnalytics } from "./course-types";
import { tenantFormatContext } from "@/lib/tenant/format-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weekly enrollment counts over the trailing 13 weeks (oldest first). */
function bucketWeekly(
  dates: Date[],
  now: Date,
  when: FormatContext
): CourseAnalytics["weeklyEnrollments"] {
  const weeks = 13;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(start.getTime() + i * 7 * DAY_MS);
    return { weekStart: weekStart.toISOString(), weekLabel: formatDate(weekStart, when), count: 0 };
  });
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - start.getTime()) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks) buckets[idx].count += 1;
  }
  return buckets;
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: initialTab } = await searchParams;
  const actor = await requireTenantPage(PERMISSIONS.TENANT_COURSES_READ.key);
  const course = await prisma.course.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      lessons: { orderBy: { sortOrder: "asc" } },
      lessonGroups: { orderBy: { sortOrder: "asc" } },
      _count: { select: { enrollments: true } },
    },
  });
  if (!course) notFound();

  const canReadEnrollments = hasPermission(actor, PERMISSIONS.TENANT_ENROLLMENTS_READ.key);
  const canManageEnrollments = hasPermission(actor, PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
  const now = new Date();

  const [quizzes, libraryItems, enrollAgg, completions, newLast30Days, lessonStats, recentEnrollments, when] =
    await Promise.all([
      prisma.quiz.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, title: true },
      }),
      prisma.libraryItem.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { id: true, name: true, key: true },
      }),
      prisma.enrollment.aggregate({
        where: { courseId: id, tenantId: actor.tenantId },
        _count: true,
        _avg: { progressPercent: true },
      }),
      prisma.enrollment.count({
        where: { courseId: id, tenantId: actor.tenantId, completedAt: { not: null } },
      }),
      prisma.enrollment.count({
        where: {
          courseId: id,
          tenantId: actor.tenantId,
          enrolledAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
        },
      }),
      prisma.lessonProgress.groupBy({
        by: ["lessonId"],
        // completedAt filter: row presence now means "opened" — without this the
        // per-lesson completion analytics would report every view as a finish.
        where: {
          tenantId: actor.tenantId,
          lesson: { courseId: id },
          completedAt: { not: null },
        },
        _count: true,
      }),
      prisma.enrollment.findMany({
        where: {
          courseId: id,
          tenantId: actor.tenantId,
          enrolledAt: { gte: new Date(now.getTime() - 91 * DAY_MS) },
        },
        select: { enrolledAt: true },
      }),
      tenantFormatContext(actor.tenantId),
    ]);

  // Every date on this page is formatted here, once, in the academy's own
  // locale and time zone, and handed to the (client-side) tabs as text.

  const analytics: CourseAnalytics = {
    totalEnrollments: enrollAgg._count,
    completions,
    avgProgress: Math.round(enrollAgg._avg.progressPercent ?? 0),
    newLast30Days,
    lessonStats: lessonStats.map((s) => ({ lessonId: s.lessonId, completions: s._count })),
    weeklyEnrollments: bucketWeekly(recentEnrollments.map((e) => e.enrolledAt), now, when),
  };

  const [enrollmentRows, clients] = canReadEnrollments
    ? await Promise.all([
        prisma.enrollment.findMany({
          where: { courseId: id, tenantId: actor.tenantId },
          orderBy: { enrolledAt: "desc" },
          include: { client: { select: { email: true, firstName: true, lastName: true } } },
        }),
        canManageEnrollments
          ? prisma.client.findMany({
              where: { tenantId: actor.tenantId },
              orderBy: { createdAt: "desc" },
              take: 500,
              select: { id: true, email: true, firstName: true, lastName: true },
            })
          : Promise.resolve([]),
      ])
    : [null, []];

  const currencyOptions = getCurrencyOptions();

  // The public address of this course, and the code this staff member's shared
  // links should carry (if they have made one).
  const [origin, myReferralCode] = await Promise.all([
    requestOrigin(),
    getReferralCode(actor.tenantId, actor.userId),
  ]);
  const isPublic = course.status === "PUBLISHED" && course.visibility === "PUBLIC";

  const initial = {
    id: course.id,
    title: course.title,
    slug: course.slug,
    description: course.description ?? "",
    status: course.status,
    visibility: course.visibility,
    priceCents: course.priceCents,
    currency: course.currency,
    enrollmentCount: course._count.enrollments,
    publishedAt: course.publishedAt?.toISOString() ?? null,
    publishedLabel: course.publishedAt ? formatDateTime(course.publishedAt, when) : null,
    lessons: course.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      sortOrder: l.sortOrder,
      contentType: l.contentType,
      contentJson: l.contentJson as Record<string, unknown>,
      assetKey: l.assetKey,
      libraryItemId: l.libraryItemId,
      durationMin: l.durationMin,
      groupId: l.groupId,
    })),
    lessonGroups: course.lessonGroups.map((g) => ({
      id: g.id,
      title: g.title,
      parentId: g.parentId,
      sortOrder: g.sortOrder,
    })),
  };

  return (
    <div>
      <PageHeader
        title={course.title}
        backHref="/admin/courses"
        backLabel="Courses"
        action={
          <ShareDialog
            url={new URL(`/courses/${course.slug}`, origin).toString()}
            title={course.title}
            referral={{ code: myReferralCode?.code ?? null, active: myReferralCode?.active ?? true }}
            notice={
              isPublic
                ? null
                : course.status !== "PUBLISHED"
                  ? "This course is not published yet. Until it is, the link shows visitors a “page not found”."
                  : "This course is private. The link only works for learners who have been given access and are signed in."
            }
          />
        }
      />
      <CourseEditor
        initialTab={initialTab}
        initial={initial}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key)}
        quizzes={quizzes}
        libraryItems={libraryItems}
        currencyOptions={currencyOptions}
        analytics={analytics}
        enrollments={
          enrollmentRows
            ? enrollmentRows.map((e) => ({
                id: e.id,
                clientId: e.clientId,
                clientEmail: e.client.email,
                clientName: `${e.client.firstName ?? ""} ${e.client.lastName ?? ""}`.trim(),
                enrolledAt: e.enrolledAt.toISOString(),
                completedAt: e.completedAt?.toISOString() ?? null,
                enrolledLabel: formatDateTime(e.enrolledAt, when),
                completedLabel: e.completedAt ? formatDateTime(e.completedAt, when) : null,
                progressPercent: e.progressPercent,
              }))
            : null
        }
        clients={clients.map((c) => ({
          id: c.id,
          email: c.email,
          name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        }))}
        canManageEnrollments={canManageEnrollments}
      />
    </div>
  );
}
