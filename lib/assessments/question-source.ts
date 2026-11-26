import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { lessonHeadingsOf } from "@/lib/content/lesson-headings";

/**
 * Where a question's answer is taught, as an author sets it.
 *
 * `null` clears the source. `anchor` is a heading id inside the lesson; leave it
 * out to point at the lesson as a whole.
 */
export const questionSourceInput = z
  .object({
    lessonId: z.string().min(1),
    anchor: z.string().min(1).max(160).nullable().optional(),
    excerpt: z.string().max(400).nullable().optional(),
  })
  .nullable();

export type QuestionSourceInput = z.infer<typeof questionSourceInput>;

export type QuestionSourceColumns = {
  sourceLessonId: string | null;
  sourceAnchor: string | null;
  sourceExcerpt: string | null;
};

/**
 * Validate a source against the lesson it names and turn it into column values.
 *
 * Checked when it is saved, where the author can still fix it: a source that
 * names a lesson from another academy, a lesson with nothing to read, or a
 * heading that is not in the lesson would otherwise fail silently later, as a
 * review link that never appears.
 */
export async function resolveQuestionSource(
  tenantId: string,
  input: QuestionSourceInput
): Promise<QuestionSourceColumns> {
  if (input === null) return { sourceLessonId: null, sourceAnchor: null, sourceExcerpt: null };

  const lesson = await prisma.lesson.findFirst({
    where: { id: input.lessonId, tenantId },
    select: { id: true, contentType: true, contentJson: true },
  });
  if (!lesson) throw new DomainError(400, "invalid_source", "That lesson was not found.");
  if (lesson.contentType !== "TEXT" && lesson.contentType !== "HTML") {
    throw new DomainError(
      400,
      "invalid_source",
      "Only reading lessons can be linked to — choose a text lesson."
    );
  }

  const anchor = input.anchor?.trim() || null;
  if (anchor) {
    const known = lessonHeadingsOf(lesson.contentType, lesson.contentJson).some((h) => h.id === anchor);
    if (!known) {
      throw new DomainError(
        400,
        "invalid_source",
        "That heading is no longer in the lesson. Pick the heading again."
      );
    }
  }

  return {
    sourceLessonId: lesson.id,
    sourceAnchor: anchor,
    sourceExcerpt: input.excerpt?.trim() || null,
  };
}
