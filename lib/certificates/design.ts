import { z } from "zod";

/**
 * Same bound as `htmlSourceSchema` in `lib/site/source.ts`, declared here rather
 * than imported: that module pulls in `sanitizeSiteDocument`, and this one is
 * imported by the client editor and `certificate-render.tsx`. Importing it would
 * drag the whole HTML parser into the browser bundle to enforce a number.
 */
const htmlSourceSchema = z.string().max(200_000);

/**
 * A certificate's design, stored in `Certificate.contentJson`.
 *
 * Two modes, because two different people need this:
 *
 *  - `fields` — the original five-input form. Fine for a certificate that is
 *    a title, a name and a line of text, and it is what every existing
 *    certificate uses, so it stays the default and keeps rendering unchanged.
 *  - `html` — the whole document authored as HTML, the way site pages are.
 *    A real certificate is a designed artifact: seals, signature lines, a
 *    two-column footer, print rules. None of that fits five text inputs.
 *
 * `htmlSource` is stored **raw** and sanitized on every read, exactly as
 * `SitePage.htmlSource` is — see the reasoning in `lib/site/source.ts`. Storing
 * the sanitizer's output would re-serialize the author's markup and hand back a
 * document they did not write.
 */
export const certificateDesignSchema = z.object({
  mode: z.enum(["fields", "html"]).default("fields"),
  title: z.string().max(120).default("Certificate of Completion"),
  subtitle: z.string().max(200).default("This is proudly presented to"),
  bodyText: z
    .string()
    .max(1000)
    .default("for successfully completing {{courseTitle}} on {{date}}."),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0f172a"),
  footerText: z.string().max(200).default("Certificate no. {{serial}}"),
  /** The whole certificate as one HTML document. Only used when mode is "html". */
  htmlSource: htmlSourceSchema.default(""),
});

export type CertificateDesign = z.infer<typeof certificateDesignSchema>;

export function parseDesign(json: unknown): CertificateDesign {
  const result = certificateDesignSchema.safeParse(
    json && typeof json === "object" ? json : {}
  );
  return result.success ? result.data : certificateDesignSchema.parse({});
}

/**
 * Replace `{{placeholders}}` in a single field-mode string.
 *
 * DELIBERATELY NOT ESCAPED, and therefore safe only where it is used: inside a
 * React text node, which escapes for us. Never route this through
 * `dangerouslySetInnerHTML` — HTML-mode certificates go through
 * `renderCertificateHtml`, which uses the site engine's escaping renderer.
 */
export function fillTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => data[key] ?? "");
}
