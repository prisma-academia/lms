import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { parseDesign } from "@/lib/certificates/design";
import { PageHeader } from "@/components/shell";
import { CertificateEditor, type AwardRow } from "./certificate-editor";

function clientLabel(c: { email: string; firstName: string | null; lastName: string | null }): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email;
}

export default async function CertificateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
  const { id } = await params;
  const cert = await prisma.certificate.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      course: { select: { title: true } },
      programme: { select: { title: true } },
      awards: {
        orderBy: { issuedAt: "desc" },
        include: { client: { select: { email: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!cert) notFound();

  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
  const clients = canWrite
    ? await prisma.client.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];

  const awards: AwardRow[] = cert.awards.map((a) => ({
    id: a.id,
    serial: a.serial,
    client: clientLabel(a.client),
    issuedAt: a.issuedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title={cert.name}
        subtitle={
          cert.course ? `Course: ${cert.course.title}` : cert.programme ? `Programme: ${cert.programme.title}` : "Standalone"
        }
      />
      <CertificateEditor
        id={cert.id}
        name={cert.name}
        design={parseDesign(cert.contentJson)}
        awards={awards}
        clients={clients.map((c) => ({ value: c.id, label: `${clientLabel(c)} — ${c.email}` }))}
        canWrite={canWrite}
      />
    </div>
  );
}
