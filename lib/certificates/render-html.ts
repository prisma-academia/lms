import { renderTemplate, type VariableContext } from "@/lib/site/template";
import { sanitizeHtmlWithStyles, type ScopedHtml } from "@/lib/content/sanitize-html";
import type { CertificateDesign } from "./design";

/**
 * Render an HTML-mode certificate.
 *
 * The pipeline is the site builder's, in the same order, for the same reason:
 *
 *   htmlSource -> renderTemplate (escapes data) -> sanitizeHtmlWithStyles -> DOM
 *
 * Interpolating first is what makes it safe to substitute a learner's name into
 * markup: every value is HTML-escaped on the way in, so data can never become
 * tags. Sanitizing first would instead check URL schemes against the literal
 * `{{ tenant.logoUrl }}` and drop the templated `src`.
 *
 * `sanitizeHtmlWithStyles` rather than plain `sanitizeHtml`: a certificate is
 * a designed document that brings its own `<style>` — borders, print rules,
 * layout. The plain sanitizer drops `<style>` entirely, which is precisely how
 * a designed block ends up rendering as unstyled text. Scoping means those
 * rules also cannot escape into the page around them.
 *
 * Isomorphic: the admin's live preview and the learner's printable page both
 * call this, so what an author sees while editing is what gets printed.
 */
export function renderCertificateHtml(
  design: CertificateDesign,
  data: Record<string, unknown>,
  id: string
): ScopedHtml {
  const interpolated = renderTemplate(design.htmlSource, data as VariableContext);
  return sanitizeHtmlWithStyles(interpolated, id);
}

/**
 * Award data as a template context.
 *
 * Kept next to the renderer because the field names here are the contract the
 * variable catalog advertises — a rename in one without the other silently
 * blanks out every certificate that used it.
 */
export function certificateContext(input: {
  clientName: string;
  courseTitle: string;
  programmeTitle: string;
  date: string;
  serial: string;
  accentColor: string;
  tenantName: string;
  logoUrl: string | null;
  primaryColor: string;
}): Record<string, unknown> {
  return {
    clientName: input.clientName,
    courseTitle: input.courseTitle,
    programmeTitle: input.programmeTitle,
    date: input.date,
    serial: input.serial,
    accentColor: input.accentColor,
    tenant: {
      name: input.tenantName,
      logoUrl: input.logoUrl ?? "",
      primaryColor: input.primaryColor,
    },
  };
}
