import type { z } from "zod";
import type { lessonContentTypeSchema } from "@/lib/schemas/course-builder";
import { lessonPlainText, wordCount } from "@/lib/courses/lesson-text";

/**
 * How long a learner must have had a lesson open before "Mark complete" is
 * allowed, and what "consumed the content" means per content type.
 *
 * WHAT IS AND ISN'T REAL — read before extending this:
 *
 * Scroll depth cannot be proven server-side. Neither can VIDEO_URL playback
 * (a raw <video src> writes no server record). Those gates exist to stop an
 * honest learner from clicking through, and nothing more. The only signals the
 * server actually verifies are: lesson ORDER (from the LessonProgress set),
 * DWELL (from `LessonProgress.startedAt`, written by a separate request), the
 * QUIZ 100% rule (from QuizAttempt rows), and FILE media progress (from
 * LibraryProgress, written by an independent endpoint).
 *
 * Therefore: do NOT add a `viewed: true` flag to the complete request. A
 * boolean the client sets is worth exactly nothing, and shipping one invites
 * the next reader to believe it means something.
 *
 * `requiredDwellSeconds` is imported by BOTH the client hook and the route
 * handler. Never reimplement it on one side — a button that enables and then
 * 409s is worse than a button that stays disabled.
 */

export type GateContentType = z.infer<typeof lessonContentTypeSchema>;

export type GateableLesson = {
  contentType: GateContentType;
  contentJson: unknown;
  durationMin: number | null;
};

/** Fraction of a media asset that counts as "watched to the end". */
export const MEDIA_COMPLETE_FRACTION = 0.95;

const MIN_DWELL_SECONDS = 15;
const MAX_TEXT_DWELL_SECONDS = 180;
const MAX_MEDIA_DWELL_SECONDS = 120;
/** ~240 wpm, a brisk but plausible reading pace. */
const WORDS_PER_SECOND = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function requiredDwellSeconds(lesson: GateableLesson): number {
  switch (lesson.contentType) {
    case "QUIZ":
      // Scoring 100% is the gate; a timer on top would only punish fast learners.
      return 0;
    case "TEXT":
    case "HTML": {
      const words = wordCount(lessonPlainText(lesson.contentJson));
      // Scaled, not flat: 20s on a 3000-word lesson is theatre, 60s on one
      // paragraph is punishment.
      return Math.round(clamp(words / WORDS_PER_SECOND, MIN_DWELL_SECONDS, MAX_TEXT_DWELL_SECONDS));
    }
    case "VIDEO_URL":
    case "FILE": {
      // The media-progress gate does the real work here; dwell is just a floor.
      const seconds = (lesson.durationMin ?? 0) * 60 * 0.5;
      return Math.round(clamp(seconds, MIN_DWELL_SECONDS, MAX_MEDIA_DWELL_SECONDS));
    }
    default:
      return MIN_DWELL_SECONDS;
  }
}

/** Whether a saved playback position counts as having reached the end. */
export function mediaWatched(
  positionSeconds: number,
  durationSeconds: number | null,
  completed: boolean
): boolean {
  if (completed) return true;
  if (!durationSeconds || durationSeconds <= 0) return false;
  return positionSeconds >= durationSeconds * MEDIA_COMPLETE_FRACTION;
}
