import type { Agent } from "@mastra/core/agent";
import { AiError, generateText } from "./run";
import { htmlHeadings, sectionHeadings } from "../content/lesson-headings";

/**
 * Writes the content of ONE lesson.
 *
 * Shared by the course-builder workflow (one call per lesson) and the two
 * "write this lesson with AI" routes, so a lesson is generated the same way
 * wherever it is asked for. No path-alias imports: the workflow imports this
 * relatively.
 *
 * The reply is the lesson itself — raw HTML or plain text — not a JSON object
 * with the lesson inside it. Asking for JSON makes the model escape every quote
 * and line break in a few thousand characters of markup, and one slip there
 * loses the entire lesson. Plain text has no such failure.
 */

/** A lesson of several hundred words, plus headroom for the model's own reasoning. */
const LESSON_MAX_OUTPUT_TOKENS = 12_000;
export const LESSON_TIMEOUT_MS = 120_000;

export type LessonBrief = {
  /** Everything the writer should know about the course around this lesson. */
  courseContext: string;
  title: string;
  contentType: "TEXT" | "HTML";
  moduleTitle?: string | null;
  /** What the lesson must cover. */
  synopsis?: string | null;
  durationMin?: number | null;
  /** Free-form guidance from the course author. */
  instructions?: string | null;
  /** Less than the usual two minutes when a course-builder run is nearly out of time. */
  timeoutMs?: number;
};

export type WrittenLesson = { body: string | null; html: string | null };

export function lessonPrompt(brief: LessonBrief): string {
  const about = [
    `Lesson to write: "${brief.title}"${brief.moduleTitle ? ` (module: "${brief.moduleTitle}")` : ""}`,
    brief.synopsis ? `What it must cover: ${brief.synopsis}` : null,
    brief.durationMin ? `Target length: about ${brief.durationMin} minutes of study.` : null,
    brief.instructions ? `Instructions from the course author:\n${brief.instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const format =
    brief.contentType === "HTML"
      ? `Reply with the lesson's HTML and nothing else: no JSON, no Markdown code fence, no
commentary before or after it. Start with the first tag and end with the last one. Do not
include <html>, <head> or <body>, and do not repeat the lesson title as a heading — the
platform shows the title above the lesson. Start body headings at <h2>.

Apply the lesson design rules from your instructions: open with a .lesson-objectives block, then
choose the structure that fits this material rather than a shape you would use for any lesson.`
      : `Reply with the lesson text and nothing else: no JSON, no code fence, no commentary. Use
light Markdown only (## headings, **bold**, lists, > quotes). Do not repeat the lesson title.`;

  return `Write the full content for ONE lesson of a course.

${brief.courseContext}

${about}

${format}`;
}

/**
 * Recover the lesson from a reply that did not quite follow the format: a
 * Markdown fence around the HTML, or a sentence of preamble before it.
 */
export function extractLessonHtml(reply: string): string {
  let text = reply.trim();

  const fenced = /```(?:html)?\s*\n([\s\S]*?)\n```/i.exec(text);
  if (fenced) text = fenced[1].trim();
  else text = text.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Drop anything before the first tag and after the last one.
  const firstTag = text.indexOf("<");
  const lastTag = text.lastIndexOf(">");
  if (firstTag > 0 && lastTag > firstTag) text = text.slice(firstTag, lastTag + 1);

  // A full document was asked not to be sent; keep only what was inside <body>.
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(text);
  if (body) text = body[1].trim();

  return text.trim();
}

function extractLessonText(reply: string): string {
  return reply
    .trim()
    .replace(/^```(?:markdown|md|text)?\s*\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
}

/** Throws `AiError`; never returns an empty lesson. */
export async function writeLesson(agent: Agent, brief: LessonBrief): Promise<WrittenLesson> {
  const reply = await generateText(agent, lessonPrompt(brief), {
    maxOutputTokens: LESSON_MAX_OUTPUT_TOKENS,
    timeoutMs: brief.timeoutMs ?? LESSON_TIMEOUT_MS,
    maxRetries: 2,
  });

  if (brief.contentType === "HTML") {
    const html = extractLessonHtml(reply);
    if (!/<[a-z][\s\S]*>/i.test(html)) {
      throw new AiError("invalid_output", "The model did not return HTML for an HTML lesson.");
    }
    return { body: null, html };
  }

  const body = extractLessonText(reply);
  if (!body) throw new AiError("invalid_output", "The model returned an empty lesson.");
  return { body, html: null };
}

/**
 * Heading texts in a lesson's HTML, in order — what a quiz question can cite as
 * the place its answer is taught. Headings inside callouts ("Key points",
 * "By the end of this lesson") are left out: they are labels, not sections.
 */
export function lessonHeadings(html: string): string[] {
  return sectionHeadings(htmlHeadings(html)).map((heading) => heading.text);
}

/** Lesson content as plain text, for showing a quiz writer what was taught. */
export function lessonPlain(lesson: WrittenLesson): string {
  if (lesson.html) {
    return lesson.html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
      // Block boundaries become line breaks and cell boundaries spaces; inline
      // tags vanish without a gap, so `<strong>two</strong>.` stays `two.`.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|h[1-6]|div|section|aside|figure|figcaption|tr|dd|dt|blockquote|pre|summary)\s*>/gi, "\n")
      .replace(/<\/(td|th)\s*>/gi, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  return (lesson.body ?? "").trim();
}
