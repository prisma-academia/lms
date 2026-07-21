import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader } from "@/components/shell";
import { CourseEditor } from "./course-editor";
import type { CourseAnalytics } from "./course-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weekly enrollment counts over the trailing 13 weeks (oldest first). */
function bucketWeekly(dates: Date[], now: Date): CourseAnalytics["weeklyEnrollments"] {
  const weeks = 13;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS);
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(start.getTime() + i * 7 * DAY_MS).toISOString(),
    count: 0,
  }));
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - start.getTime()) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks) buckets[idx].count += 1;
  }
  return buckets;
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const [quizzes, libraryItems, enrollAgg, completions, newLast30Days, lessonStats, recentEnrollments] =
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
        where: { tenantId: actor.tenantId, lesson: { courseId: id } },
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
    ]);

  const analytics: CourseAnalytics = {
    totalEnrollments: enrollAgg._count,
    completions,
    avgProgress: Math.round(enrollAgg._avg.progressPercent ?? 0),
    newLast30Days,
    lessonStats: lessonStats.map((s) => ({ lessonId: s.lessonId, completions: s._count })),
    weeklyEnrollments: bucketWeekly(recentEnrollments.map((e) => e.enrolledAt), now),
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
    lessons: course.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      sortOrder: l.sortOrder,
      contentType: l.contentType,
      contentJson: l.contentJson as Record<string, unknown>,
      assetKey: l.assetKey,
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
      <PageHeader title={course.title} backHref="/admin/courses" backLabel="Courses" />
      <CourseEditor
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
