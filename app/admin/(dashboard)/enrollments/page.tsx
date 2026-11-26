import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { EnrollmentsTable } from "./enrollments-table";
import { ManualEnroll } from "./manual-enroll";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function EnrollmentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ENROLLMENTS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
  const [enrollments, when] = await Promise.all([
    prisma.enrollment.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { enrolledAt: "desc" },
      take: 200,
      include: {
        course: { select: { id: true, title: true, slug: true } },
        client: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = enrollments.map((e) => ({
    id: e.id,
    courseId: e.course.id,
    courseTitle: e.course.title,
    courseSlug: e.course.slug,
    clientEmail: e.client.email,
    clientName: `${e.client.firstName ?? ""} ${e.client.lastName ?? ""}`.trim(),
    enrolledAt: e.enrolledAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
    // Formatted here, in the academy's locale and time zone: the table is a
    // Client Component, and a date formatted there renders twice, differently.
    enrolledLabel: formatDateTime(e.enrolledAt, when),
    completedLabel: e.completedAt ? formatDateTime(e.completedAt, when) : null,
    progressPercent: e.progressPercent,
  }));

  const [courses, clients] = canWrite
    ? await Promise.all([
        prisma.course.findMany({
          where: { tenantId: actor.tenantId, status: "PUBLISHED" },
          orderBy: { title: "asc" },
          take: 500,
          select: { id: true, title: true, visibility: true, priceCents: true },
        }),
        prisma.client.findMany({
          where: { tenantId: actor.tenantId },
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: { id: true, email: true, firstName: true, lastName: true },
        }),
      ])
    : [[], []];

  return (
    <div>
      <DataTableToolbar
        title="Enrollments"
        description="Who is taking which course, and how far they have got."
      />
      {canWrite ? (
        <ManualEnroll
          courses={courses.map((c) => ({
            value: c.id,
            label: `${c.title}${c.visibility === "PRIVATE" ? " (private)" : ""}${
              c.priceCents && c.priceCents > 0 ? " · paid" : ""
            }`,
          }))}
          clients={clients.map((c) => ({
            value: c.id,
            label: `${`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email} — ${c.email}`,
          }))}
        />
      ) : null}
      <EnrollmentsTable
        data={rows}
        linkToCourse={hasPermission(actor, PERMISSIONS.TENANT_COURSES_READ.key)}
        empty={
          <EmptyState icon="users" title="Nobody is enrolled yet">
            {canWrite
              ? "Enroll a learner with the form above, or publish a course and share its link so learners can join."
              : "Enrollments appear here as learners join courses."}
          </EmptyState>
        }
      />
    </div>
  );
}
