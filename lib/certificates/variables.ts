// Relative, type-only: this module is imported by the certificate-designer
// agent, and Mastra code must not depend on tsconfig path aliases.
import type { VariableDef } from "../site/variables";

/**
 * A certificate variable: the site builder's definition, plus what an author —
 * or the AI designing a certificate — needs to know to use it well.
 */
export type CertificateVariableDef = VariableDef & {
  /** A certificate without this is not a certificate. */
  required?: boolean;
  /** How to use it, when that is not obvious from the name. */
  usage?: string;
  /**
   * What the editor's click-to-insert writes, when a bare `{{ path }}` would be
   * the wrong thing to drop into a document (a URL printed as text, a title
   * that is empty half the time).
   */
  snippet?: string;
};

const TITLE_SNIPPET = "{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}";
const LOGO_SNIPPET = '{{#if tenant.logoUrl}}<img src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}">{{/if}}';

/**
 * The `{{ }}` variables an HTML certificate can reference.
 *
 * Client-safe by construction — definitions and samples only, no resolution —
 * so the admin editor can offer autocomplete and render a live preview without
 * touching the database. This mirrors `lib/site/variables.ts`; the pair of
 * catalogs is what lets one editor component serve both surfaces.
 *
 * Kept deliberately small. A certificate is one award for one learner: there is
 * no list to loop over and no session to resolve, so everything here is a plain
 * scalar that is always present at render time.
 *
 * This list is also the single source for the AI designer's instructions
 * (`ai-guide.ts`) and for the check on what it produces (`ai.ts`): add a
 * variable here and the prompt, the validator and the editor's variable panel
 * all pick it up.
 */
export const CERTIFICATE_VARIABLES: CertificateVariableDef[] = [
  {
    path: "clientName",
    kind: "scalar",
    label: "Learner's full name",
    sample: "Ada Lovelace",
    required: true,
    usage: "The most prominent text on the certificate. Names vary a lot in length, so let it wrap.",
  },
  {
    path: "courseTitle",
    kind: "scalar",
    label: "Course title (empty for a programme certificate)",
    sample: "Intro to Analytics",
    usage: `Empty when the certificate is for a programme. Write ${TITLE_SNIPPET} to show whichever applies.`,
    snippet: TITLE_SNIPPET,
  },
  {
    path: "programmeTitle",
    kind: "scalar",
    label: "Programme title (empty for a course certificate)",
    sample: "Data Foundations",
    usage: "Empty when the certificate is for a single course. Pair it with courseTitle as shown there.",
    snippet: TITLE_SNIPPET,
  },
  {
    path: "date",
    kind: "scalar",
    label: "Date the award was issued",
    sample: "1 January 2026",
    usage: "Already formatted for display.",
  },
  {
    path: "serial",
    kind: "scalar",
    label: "Unique certificate serial",
    sample: "CERT-XXXXXXXXXX",
    usage: "Small, but always shown: it is how a certificate is checked.",
  },
  {
    path: "tenant.name",
    kind: "scalar",
    label: "Your organisation's name",
    sample: "Acme Academy",
  },
  {
    path: "tenant.logoUrl",
    kind: "scalar",
    label: "Your logo image URL",
    sample: "",
    usage: `Empty when no logo has been uploaded. Wrap the image: ${LOGO_SNIPPET}`,
    snippet: LOGO_SNIPPET,
  },
  {
    path: "tenant.primaryColor",
    kind: "scalar",
    label: "Your brand colour",
    sample: "#0f172a",
    usage: "A hex colour. Use it in CSS only.",
  },
  {
    path: "accentColor",
    kind: "scalar",
    label: "This certificate's accent colour",
    sample: "#0f172a",
    usage:
      "A hex colour chosen per certificate. Use it in CSS only, for rules, borders and bands — it can be light, so never rely on it alone for small text.",
  },
];

/**
 * The date shown in previews. A fixed string on purpose: previews are rendered
 * on the server and again in the browser, and a Date formatted in each would
 * come out in two different locales.
 */
export const SAMPLE_AWARD_DATE = "1 January 2026";

/** The variable every certificate must show. */
export const LEARNER_NAME_VARIABLE = "clientName";

/** Preview data for the admin editor, before any real award exists. */
export function certificateSampleContext(overrides?: {
  tenantName?: string;
  logoUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
}): Record<string, unknown> {
  return {
    clientName: "Ada Lovelace",
    courseTitle: "Intro to Analytics",
    programmeTitle: "",
    date: SAMPLE_AWARD_DATE,
    serial: "CERT-XXXXXXXXXX",
    accentColor: overrides?.accentColor ?? "#0f172a",
    tenant: {
      name: overrides?.tenantName ?? "Your organisation",
      logoUrl: overrides?.logoUrl ?? "",
      primaryColor: overrides?.primaryColor ?? "#0f172a",
    },
  };
}
