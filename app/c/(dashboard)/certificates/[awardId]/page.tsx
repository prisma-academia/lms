import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { parseDesign } from "@/lib/certificates/design";
import { certificateBranding } from "@/lib/certificates/branding";
import { certificateContext, renderCertificateHtml } from "@/lib/certificates/render-html";
import { CertificateRender } from "@/components/certificate-render";
import { Icon } from "@/components/icon";
import { formatDate } from "@/lib/format";
import { tenantFormatContext } from "../../_lib/format-context";
import { PrintButton } from "../print-button";

/**
 * Printing: the certificate, alone, on one landscape sheet.
 *
 * The page lives inside the learner shell, and a browser prints everything on
 * the page — sidebar, tab bar and all. Three rules undo that:
 *
 *  1. Everything that is not the certificate, is not inside it and does not
 *     contain it is removed outright (`display: none`, so it leaves no blank
 *     space and no blank second page behind).
 *  2. The certificate's ancestors have to stay, so they are stripped back to
 *     plain boxes: no padding, borders, sticky positioning or fixed heights.
 *     That includes the page itself: the app gives <body> a minimum height of
 *     one screen, and a screen is not a sheet — on a tall window that minimum
 *     alone is enough to push out a blank second page.
 *  3. The certificate is kept narrow enough that its height fits the sheet —
 *     138vh is just under an A-series page's width-to-height ratio — and its
 *     colours are printed as designed.
 *
 * A browser too old for `:has()` skips rules 1 and 2 and prints the page as it
 * always did.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  html, body {
    display: block !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body *:not([data-certificate-sheet]):not([data-certificate-sheet] *):not(:has([data-certificate-sheet])) {
    display: none !important;
  }
  body *:has([data-certificate-sheet]) {
    display: block !important;
    position: static !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    background: none !important;
    overflow: visible !important;
    transform: none !important;
  }
  [data-certificate-sheet] {
    max-width: 138vh !important;
    margin: 0 auto !important;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}`;

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
    // The academy's own locale and time zone: a certificate must not carry a
    // different date depending on where the server that rendered it sits.
    date: formatDate(award.issuedAt, await tenantFormatContext(actor.tenantId)),
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
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/certificates"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] text-[13px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Icon name="arrow-left" className="size-4" aria-hidden /> All certificates
        </Link>
        <PrintButton />
      </div>
      <h1 className="sr-only">
        {award.certificate.name} — awarded to {clientName}
      </h1>
      <div data-certificate-sheet className="mx-auto max-w-4xl">
        {html ? (
          <>
            {html.css ? <style dangerouslySetInnerHTML={{ __html: html.css }} /> : null}
            <div data-css-scope={html.scope} dangerouslySetInnerHTML={{ __html: html.html }} />
          </>
        ) : (
          <CertificateRender design={design} data={data} />
        )}
      </div>
      <p className="mx-auto mt-4 max-w-4xl text-center text-[13px] font-medium text-muted-foreground print:hidden">
        Certificate no. <span className="num font-bold text-foreground">{award.serial}</span>
      </p>
    </div>
  );
}
