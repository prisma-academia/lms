import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { EnrollmentsTable } from "./enrollments-table";
import { ManualEnroll } from "./manual-enroll";

export default async function EnrollmentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ENROLLMENTS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { enrolledAt: "desc" },
    take: 200,
    include: {
      course: { select: { title: true, slug: true } },
      client: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  const rows = enrollments.map((e) => ({
    id: e.id,
    courseTitle: e.course.title,
    courseSlug: e.course.slug,
    clientEmail: e.client.email,
    clientName: `${e.client.firstName ?? ""} ${e.client.lastName ?? ""}`.trim() || "—",
    enrolledAt: e.enrolledAt.toISOString(),
    completedAt: e.completedAt?.toISOString() ?? null,
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
      <DataTableToolbar title="Enrollments" />
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
      <EnrollmentsTable data={rows} />
    </div>
  );
}
