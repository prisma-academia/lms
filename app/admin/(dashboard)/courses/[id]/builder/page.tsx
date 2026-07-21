import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { BuilderStudio } from "./builder-studio";

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireTenantPage(PERMISSIONS.TENANT_COURSES_READ.key);
  if (!hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key)) notFound();

  const course = await prisma.course.findFirst({
    where: { id, tenantId: actor.tenantId },
    select: { id: true, title: true, _count: { select: { lessons: true } } },
  });
  if (!course) notFound();

  return (
    <div>
      <PageHeader
        title="AI course builder"
        backHref={`/admin/courses/${course.id}`}
        backLabel={course.title}
      />
      <BuilderStudio
        courseId={course.id}
        courseTitle={course.title}
        existingLessonCount={course._count.lessons}
      />
    </div>
  );
}
