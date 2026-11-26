import { findPageKind, type SitePageKind } from "@/lib/site/site-api";

/**
 * Page designs an academy has saved from its own pages.
 *
 * They live in the general `Template` table under one type, with the document
 * and the kind of page it was saved from in `contentJson`. Designs saved before
 * kinds existed have no kind and are ordinary pages.
 *
 * Client-safe: the gallery imports the type.
 */

export const SAVED_TEMPLATE_TYPE = "site_page";

export type SavedSiteTemplate = {
  id: string;
  name: string;
  kind: SitePageKind;
  htmlSource: string;
};

export function toSavedTemplate(row: { id: string; name: string; contentJson: unknown }): SavedSiteTemplate {
  const json =
    row.contentJson && typeof row.contentJson === "object" && !Array.isArray(row.contentJson)
      ? (row.contentJson as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    name: row.name,
    kind: findPageKind(typeof json.kind === "string" ? json.kind : null).kind,
    htmlSource: typeof json.htmlSource === "string" ? json.htmlSource : "",
  };
}
