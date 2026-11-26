import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { CertificatesTable } from "./table";

export default async function CertificatesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
  const certs = await prisma.certificate.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      course: { select: { title: true } },
      programme: { select: { title: true } },
      _count: { select: { awards: true } },
    },
  });
  const rows = certs.map((c) => ({
    id: c.id,
    name: c.name,
    linkedTo: c.course
      ? `Course: ${c.course.title}`
      : c.programme
        ? `Programme: ${c.programme.title}`
        : "Awarded by hand",
    awards: c._count.awards,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Certificates"
        description="Design certificates and award them when a learner finishes a course or programme."
        createHref={canWrite ? "/admin/certificates/new" : undefined}
        createLabel="New certificate"
      />
      <CertificatesTable data={rows} canCreate={canWrite} />
    </div>
  );
}
