import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { CreateCertificateForm } from "./create-form";

export default async function NewCertificatePage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
  const [courses, programmes] = await Promise.all([
    prisma.course.findMany({ where: { tenantId: actor.tenantId }, orderBy: { title: "asc" }, take: 500, select: { id: true, title: true } }),
    prisma.programme.findMany({ where: { tenantId: actor.tenantId }, orderBy: { title: "asc" }, take: 500, select: { id: true, title: true } }),
  ]);
  return (
    <div>
      <PageHeader title="New certificate" subtitle="Design it after creating. Linking to a course auto-awards on completion." />
      <Card>
        <CreateCertificateForm
          courses={courses.map((c) => ({ value: c.id, label: c.title }))}
          programmes={programmes.map((p) => ({ value: p.id, label: p.title }))}
        />
      </Card>
    </div>
  );
}
