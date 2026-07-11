import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { CertificatesTable } from "./table";

export default async function CertificatesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
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
    linkedTo: c.course ? `Course: ${c.course.title}` : c.programme ? `Programme: ${c.programme.title}` : "Standalone",
    awards: c._count.awards,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Certificates"
        description="Design certificates and award them on course/programme completion."
        createHref="/admin/certificates/new"
        createLabel="New certificate"
      />
      <CertificatesTable data={rows} />
    </div>
  );
}
