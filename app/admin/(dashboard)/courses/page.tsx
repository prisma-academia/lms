import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { CoursesTable } from "./courses-table";

export default async function CoursesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_COURSES_READ.key);
  const courses = await prisma.course.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      priceCents: true,
      currency: true,
      updatedAt: true,
      _count: { select: { lessons: true, enrollments: true } },
    },
  });
  const rows = courses.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    status: c.status,
    priceCents: c.priceCents,
    currency: c.currency,
    lessonCount: c._count.lessons,
    enrollmentCount: c._count.enrollments,
    updatedAt: c.updatedAt.toISOString(),
  }));
  return (
    <div>
      <DataTableToolbar title="Courses" createHref="/admin/courses/new" createLabel="New course" />
      <CoursesTable data={rows} />
    </div>
  );
}
