/**
 * Plain-text extraction from `Lesson.contentJson`.
 *
 * Used for two things that must agree: the dwell budget in `content-gate.ts`
 * (which runs on both the client and the server) and the lesson context handed
 * to the essay grader. Deliberately regex-based rather than reusing
 * `lib/content/sanitize-html` — that pulls in a full HTML parser, which has no
 * business in a client bundle just to count words.
 */

/** Keys `contentJson` may carry a body under, in probe order. */
const BODY_KEYS = ["body", "html", "text", "content"] as const;

/** Crude tag strip. Good enough for word counts and LLM context; never for rendering. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The lesson's readable body as plain text, or "" when it has none. */
export function lessonPlainText(contentJson: unknown): string {
  if (contentJson == null || typeof contentJson !== "object") return "";
  const json = contentJson as Record<string, unknown>;
  for (const key of BODY_KEYS) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) {
      return key === "html" ? stripHtml(value) : value.trim();
    }
  }
  return "";
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
