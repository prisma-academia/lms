import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { parseDesign } from "@/lib/certificates/design";
import { certificateBranding } from "@/lib/certificates/branding";
import { certificateContext, renderCertificateHtml } from "@/lib/certificates/render-html";
import { CertificateRender } from "@/components/certificate-render";
import { Icon } from "@/components/icon";
import { PrintButton } from "../print-button";

export default async function CertificateViewPage({ params }: { params: Promise<{ awardId: string }> }) {
  const actor = await requireClientPage();
  const { awardId } = await params;
  const award = await prisma.certificateAward.findFirst({
    where: { id: awardId, clientId: actor.clientId },
    include: {
      certificate: { include: { course: { select: { title: true } }, programme: { select: { title: true } } } },
      client: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!award) notFound();

  const design = parseDesign(award.certificate.contentJson);
  const clientName =
    `${award.client.firstName ?? ""} ${award.client.lastName ?? ""}`.trim() || award.client.email;
  const data = {
    clientName,
    courseTitle: award.certificate.course?.title ?? "",
    programmeTitle: award.certificate.programme?.title ?? "",
    date: award.issuedAt.toLocaleDateString(),
    serial: award.serial,
  };

  // Only an HTML certificate needs branding — a field-mode one draws itself from
  // `design` alone, so this page should not pay for a query it will not use.
  let html = null;
  if (design.mode === "html" && design.htmlSource.trim()) {
    const branding = await certificateBranding(award.certificate.tenantId);
    html = renderCertificateHtml(
      design,
      certificateContext({
        ...data,
        accentColor: design.accentColor,
        tenantName: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
      }),
      award.certificateId
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/certificates" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left" className="size-4" /> All certificates
        </Link>
        <PrintButton />
      </div>
      {html ? (
        <>
          {html.css ? <style dangerouslySetInnerHTML={{ __html: html.css }} /> : null}
          <div
            data-css-scope={html.scope}
            className="mx-auto max-w-4xl"
            dangerouslySetInnerHTML={{ __html: html.html }}
          />
        </>
      ) : (
        <CertificateRender design={design} data={data} />
      )}
    </div>
  );
}
