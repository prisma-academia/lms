import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize lesson HTML for storage and rendering.
 * Applied both when persisting HTML lesson content (builder apply route)
 * and when rendering it to learners — never trust stored contentJson.html.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "style", "iframe", "form", "object", "embed"],
    FORBID_ATTR: ["style"],
    USE_PROFILES: { html: true },
  });
}
