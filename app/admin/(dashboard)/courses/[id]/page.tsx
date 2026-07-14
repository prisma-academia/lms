import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader } from "@/components/shell";
import { CourseEditor } from "./course-editor";

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

  const quizzes = await prisma.quiz.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, title: true },
  });

  const resources = await prisma.resource.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, name: true, key: true },
  });

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
        resources={resources}
        currencyOptions={currencyOptions}
      />
    </div>
  );
}
