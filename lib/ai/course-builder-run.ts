import type { CourseBuilderInput } from "../schemas/course-builder";

/**
 * What every model call made for one course-builder request has in common: how
 * the author's request is described to the model, and how much time is left.
 *
 * Shared by the workflow (src/mastra/workflows/course-builder-workflow.ts) and
 * by "generate the missing quizzes" (lib/courses/missing-quizzes.ts), so a quiz
 * written afterwards is asked for in the same words as one written during the
 * run. No path-alias imports: the workflow imports this relatively.
 */

/** Pasted source text is repeated in every lesson call; keep that bounded. */
const SOURCE_CHARS_PER_CALL = 40_000;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[…truncated]` : text;
}

/** The request, as the model should read it. `full` is for the outline call only. */
export function describeCourseRequest(input: CourseBuilderInput, opts: { full: boolean }): string {
  const sourceLimit = opts.full ? Number.POSITIVE_INFINITY : SOURCE_CHARS_PER_CALL;
  const lines = [
    `Topic: ${input.topic}`,
    input.audience ? `Audience: ${input.audience}` : null,
    input.structureHints ? `Structure hints: ${input.structureHints}` : null,
    input.allowPlaceholders
      ? "Placeholders: VIDEO_URL/FILE placeholder lessons are allowed (title + a note on what to attach)."
      : "Placeholders: do NOT plan VIDEO_URL or FILE lessons. Use TEXT, HTML and QUIZ only.",
    input.allowEssays
      ? "Essays: ESSAY questions are allowed. Each needs 2-4 objectively checkable weighted rubric criteria and a concise model answer."
      : "Essays: do NOT write ESSAY questions. Use SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE and SHORT_ANSWER only.",
  ].filter(Boolean);

  if (input.mode === "adapt-json" && input.sourceJson) {
    lines.push(
      "Task mode: ADAPT the following JSON (a course export, syllabus dump, or partial structure — any shape) into a course. Preserve its structure, titles and content wherever present; map its content into the available lesson types; only invent what is genuinely missing.",
      `Source JSON:\n${clip(input.sourceJson, sourceLimit)}`
    );
  } else if (input.sourceMaterial) {
    lines.push(`Source material to base the course on:\n${clip(input.sourceMaterial, sourceLimit)}`);
  }
  return lines.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Time                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Both builder routes declare `maxDuration = 300`: at 300 seconds the platform
 * may end the request, and a request ended there returns NOTHING — every lesson
 * already written is lost with it. So the run keeps two limits of its own,
 * measured from when it started:
 *
 *  - START_BY: no model call is started after this. Work not started by then
 *    is reported as skipped (and a skipped quiz can be generated afterwards).
 *  - FINISH_BY: no model call runs past this. A call started close to START_BY
 *    is given only the time that is left, rather than its usual two minutes.
 *
 * That leaves 15 seconds between the last call ending and the route's limit,
 * for assembling the course and sending it — neither involves the model.
 *
 * START_BY was 230s with no FINISH_BY, which was both too cautious and not
 * safe: a call started at 229s kept its full 120s timeout and could run to
 * 349s. It is as late as it usefully can be now. A call started later than
 * this would have under 35 seconds, which is not enough to write a lesson, so
 * raising it further would only spend calls that are then cut off.
 */
export const BUILDER_START_BY_MS = 250_000;
export const BUILDER_FINISH_BY_MS = 285_000;

export const OUT_OF_TIME = "Skipped: the generation ran out of time before this was started.";

/** Epoch ms after which no new model call is started, for a run starting now. */
export function builderDeadline(now: number = Date.now()): number {
  return now + BUILDER_START_BY_MS;
}

/**
 * The timeout to give a model call started now, or null when it is too late to
 * start one. `deadlineAt` is the run's `builderDeadline()`.
 */
export function callTimeout(deadlineAt: number, usualMs: number, now: number = Date.now()): number | null {
  if (now > deadlineAt) return null;
  const finishBy = deadlineAt + (BUILDER_FINISH_BY_MS - BUILDER_START_BY_MS);
  return Math.min(usualMs, finishBy - now);
}
