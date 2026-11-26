import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { aiStatus } from "@/lib/ai/config";
import { formatDate } from "@/lib/format";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { parseDesign } from "@/lib/certificates/design";
import { certificateBranding } from "@/lib/certificates/branding";
import { renderCertificatePreview } from "@/lib/certificates/render-html";
import { CERTIFICATE_TEMPLATES } from "@/lib/certificates/templates";
import { certificateSampleContext } from "@/lib/certificates/variables";
import { PageHeader } from "@/components/shell";
import { CertificateEditor, type AwardRow } from "./certificate-editor";
import type { GalleryTemplate } from "./template-gallery";

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

  // The preview shows the author their real logo and colours, not placeholders.
  const [branding, tenant] = await Promise.all([
    certificateBranding(actor.tenantId),
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { settingsJson: true } }),
  ]);
  const settings = parseTenantSettings(tenant?.settingsJson);
  const design = parseDesign(cert.contentJson);

  // Dates are formatted here, once, in the academy's own locale and time zone.
  // The editor is a Client Component: formatting there would run on the server
  // and again in the browser, in two different locales.
  const awards: AwardRow[] = cert.awards.map((a) => ({
    id: a.id,
    serial: a.serial,
    client: clientLabel(a.client),
    issuedLabel: formatDate(a.issuedAt, { locale: settings.locale, timeZone: settings.timezone }),
  }));

  // The built-in designs, rendered here through the same interpolate-then-
  // sanitize pipeline a learner's certificate goes through. Doing it on the
  // server keeps the sanitizer out of the editor's bundle, and means a
  // thumbnail is the design itself rather than a picture of it.
  const sample = certificateSampleContext({
    tenantName: branding.name,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    accentColor: design.accentColor,
  });
  const templates: GalleryTemplate[] = CERTIFICATE_TEMPLATES.map((template) => {
    const html = template.html();
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      html,
      preview: renderCertificatePreview(html, sample, `cert-design-${template.id}`),
    };
  });

  return (
    <div>
      <PageHeader
        title={cert.name}
        subtitle={
          cert.course ? `Course: ${cert.course.title}` : cert.programme ? `Programme: ${cert.programme.title}` : "Standalone"
        }
        backHref="/admin/certificates"
        backLabel="Certificates"
      />
      <CertificateEditor
        id={cert.id}
        name={cert.name}
        design={design}
        awards={awards}
        clients={clients.map((c) => ({ value: c.id, label: `${clientLabel(c)} — ${c.email}` }))}
        canWrite={canWrite}
        branding={branding}
        templates={templates}
        // Only whether AI can run — never which key or model.
        aiReady={aiStatus().configured}
      />
    </div>
  );
}
