import type { VariableDef } from "@/lib/site/variables";

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
 */
export const CERTIFICATE_VARIABLES: VariableDef[] = [
  {
    path: "clientName",
    kind: "scalar",
    label: "Learner's full name",
    sample: "Ada Lovelace",
  },
  {
    path: "courseTitle",
    kind: "scalar",
    label: "Course title (empty for a programme certificate)",
    sample: "Intro to Analytics",
  },
  {
    path: "programmeTitle",
    kind: "scalar",
    label: "Programme title (empty for a course certificate)",
    sample: "Data Foundations",
  },
  { path: "date", kind: "scalar", label: "Date the award was issued", sample: "1 January 2026" },
  {
    path: "serial",
    kind: "scalar",
    label: "Unique certificate serial",
    sample: "CERT-XXXXXXXXXX",
  },
  { path: "tenant.name", kind: "scalar", label: "Your organisation's name", sample: "Acme Academy" },
  {
    path: "tenant.logoUrl",
    kind: "scalar",
    label: "Your logo image URL",
    sample: "",
  },
  {
    path: "tenant.primaryColor",
    kind: "scalar",
    label: "Your brand colour",
    sample: "#0f172a",
  },
  {
    path: "accentColor",
    kind: "scalar",
    label: "This certificate's accent colour",
    sample: "#0f172a",
  },
];

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
    date: new Date(2026, 0, 1).toLocaleDateString(),
    serial: "CERT-XXXXXXXXXX",
    accentColor: overrides?.accentColor ?? "#0f172a",
    tenant: {
      name: overrides?.tenantName ?? "Your organisation",
      logoUrl: overrides?.logoUrl ?? "",
      primaryColor: overrides?.primaryColor ?? "#0f172a",
    },
  };
}
