import { DomainError } from "@/lib/api/errors";
import { parseVideoUrl, VIDEO_URL_HELP } from "@/lib/media/video-embed";

/**
 * Server-side validation of a lesson's `contentJson`.
 *
 * The column is a free-form JSON blob and both lesson routes accept it as
 * `z.record(z.unknown())`, so nothing used to stop an author saving a video
 * lesson whose URL cannot play. That failure is invisible at save time and
 * expensive later: `requiredDwellSeconds` treats VIDEO_URL as timed media, so an
 * unplayable link produces a lesson that reports no progress and can never be
 * completed — and the learner, not the author, is the one who finds out.
 *
 * Validate at the boundary instead, where the author is still looking at the
 * field they got wrong.
 */
export function assertLessonContent(
  contentType: string,
  contentJson: Record<string, unknown> | undefined
): void {
  if (contentType !== "VIDEO_URL" || !contentJson) return;

  const url = contentJson.url;
  // An empty URL is allowed: the AI builder deliberately emits VIDEO_URL
  // lessons as placeholders for an admin to fill in later.
  if (url === undefined || url === null || (typeof url === "string" && !url.trim())) return;

  if (typeof url !== "string" || !parseVideoUrl(url)) {
    throw new DomainError(
      400,
      "bad_video_url",
      `That video link cannot be played. ${VIDEO_URL_HELP}`
    );
  }
}
