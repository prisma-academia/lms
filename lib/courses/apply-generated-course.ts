import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { GeneratedCourse, GeneratedQuestion } from "@/lib/schemas/course-builder";
import { isChoiceQuestion } from "@/lib/schemas/question";

/**
 * Writes a generated/imported course structure into an existing course.
 *
 * Lives here rather than in the route handler so the same code path can be
 * exercised without an HTTP session — see `scripts/verify-course-builder.ts`.
 */

export type ApplyCounts = {
  groups: number;
  lessons: number;
  quizzes: number;
  questions: number;
};

/** Reject structurally-broken quiz questions before touching the database. */
function validateQuestion(q: GeneratedQuestion, where: string, allowEssays: boolean): void {
  const fail = (msg: string): never => {
    throw new DomainError(400, "invalid_quiz", `${where}: ${msg}`);
  };
  if (q.type === "ESSAY") {
    // Defence in depth: the agent is instructed not to emit essays unless they
    // were permitted, but a model can ignore instructions and a validator can't.
    // An unreviewed AI rubric is a permanent progression gate, so this stays a
    // hard reject rather than a downgrade to another type.
    if (!allowEssays) fail("essay questions were not enabled for this generation");
    const criteria = q.rubric?.criteria ?? [];
    if (criteria.length === 0) fail("essay question needs at least one rubric criterion");
    if (criteria.some((c) => !c.label.trim())) fail("every rubric criterion needs a label");
    if (criteria.some((c) => !Number.isInteger(c.weight) || c.weight < 1))
      fail("every rubric criterion needs a weight of 1 or more");
    return;
  }
  if (q.type === "SHORT_ANSWER") {
    if (q.acceptedAnswers.filter((a) => a.trim()).length === 0)
      fail("short-answer question needs at least one accepted answer");
    return;
  }
  if (q.options.length < 2) fail("choice question needs at least 2 options");
  if (q.correctOptionIndexes.length === 0) fail("question has no correct answer");
  if (q.correctOptionIndexes.some((i) => i >= q.options.length))
    fail("correct answer index is out of range");
  if ((q.type === "SINGLE_CHOICE" || q.type === "TRUE_FALSE") && q.correctOptionIndexes.length !== 1)
    fail("single-choice question must have exactly one correct answer");
}

/**
 * Validates every quiz in the structure, normalising TRUE_FALSE options in
 * place. Runs before the transaction so bad data never half-writes.
 */
export function validateGeneratedCourse(
  generated: GeneratedCourse,
  opts: { allowEssays?: boolean } = {}
): void {
  const allowEssays = opts.allowEssays ?? false;
  for (const group of generated.groups) {
    for (const lesson of group.lessons) {
      if (lesson.contentType !== "QUIZ") continue;
      if (!lesson.quiz)
        throw new DomainError(400, "invalid_quiz", `Quiz lesson "${lesson.title}" has no quiz.`);
      lesson.quiz.questions.forEach((q, i) => {
        if (q.type === "TRUE_FALSE") q.options = ["True", "False"];
        validateQuestion(q, `"${lesson.title}" question ${i + 1}`, allowEssays);
      });
    }
  }
}

export async function applyGeneratedCourse({
  tenantId,
  courseId,
  courseTitle,
  generated,
  allowEssays = false,
}: {
  tenantId: string;
  courseId: string;
  /** Used to name the question bank the generated quizzes land in. */
  courseTitle: string;
  generated: GeneratedCourse;
  /**
   * Whether ESSAY questions were permitted for this generation. Defaults false
   * so an import that never opted in can't smuggle in an AI-authored rubric.
   */
  allowEssays?: boolean;
}): Promise<ApplyCounts> {
  validateGeneratedCourse(generated, { allowEssays });

  const hasQuizzes = generated.groups.some((g) => g.lessons.some((l) => l.contentType === "QUIZ"));
  const created: ApplyCounts = { groups: 0, lessons: 0, quizzes: 0, questions: 0 };

  await prisma.$transaction(
    async (tx) => {
      // Append semantics: new groups/lessons sort after everything that exists.
      const [maxGroup, maxLesson] = await Promise.all([
        tx.lessonGroup.aggregate({ where: { courseId }, _max: { sortOrder: true } }),
        tx.lesson.aggregate({ where: { courseId }, _max: { sortOrder: true } }),
      ]);
      let groupOrder = (maxGroup._max.sortOrder ?? -1) + 1;
      let lessonOrder = (maxLesson._max.sortOrder ?? -1) + 1;

      const bank = hasQuizzes
        ? await tx.questionBank.create({
            data: {
              tenantId,
              name: `${courseTitle} — AI generated ${new Date().toISOString().slice(0, 10)}`,
              description: "Questions created by the AI course builder.",
            },
          })
        : null;

      for (const group of generated.groups) {
        const lessonGroup = await tx.lessonGroup.create({
          data: {
            tenantId,
            courseId,
            title: group.title,
            sortOrder: groupOrder++,
          },
        });
        created.groups++;

        for (const lesson of group.lessons) {
          let contentJson: Record<string, unknown> = {};
          if (lesson.contentType === "TEXT") {
            contentJson = { body: lesson.body ?? "" };
          } else if (lesson.contentType === "HTML") {
            // Sanitize on write; the learner player sanitizes again on render.
            contentJson = { html: sanitizeHtml(lesson.html ?? "") };
          } else if (lesson.contentType === "QUIZ" && lesson.quiz && bank) {
            const quiz = await tx.quiz.create({
              data: {
                tenantId,
                title: lesson.quiz.title,
                description: lesson.quiz.description,
                passingScore: lesson.quiz.passingScore,
              },
            });
            created.quizzes++;
            for (const [qIdx, q] of lesson.quiz.questions.entries()) {
              // Explicit allowlist, not `!== "SHORT_ANSWER"`: ESSAY has neither
              // options nor correct indices, and the negated form would have
              // silently written its (empty) option indices as the answer key.
              const isChoice = isChoiceQuestion(q.type);
              const question = await tx.question.create({
                data: {
                  tenantId,
                  bankId: bank.id,
                  type: q.type,
                  prompt: q.prompt,
                  optionsJson: isChoice ? q.options : [],
                  answerJson: isChoice
                    ? q.correctOptionIndexes
                    : q.type === "SHORT_ANSWER"
                      ? q.acceptedAnswers
                      : [],
                  rubricJson: q.type === "ESSAY" ? (q.rubric as object) : undefined,
                  points: q.points,
                },
              });
              await tx.quizQuestion.create({
                data: {
                  tenantId,
                  quizId: quiz.id,
                  questionId: question.id,
                  sortOrder: qIdx,
                },
              });
              created.questions++;
            }
            contentJson = { quizId: quiz.id };
          }
          // VIDEO_URL / FILE placeholders keep an empty contentJson and no assetKey.

          await tx.lesson.create({
            data: {
              tenantId,
              courseId,
              groupId: lessonGroup.id,
              title: lesson.title,
              sortOrder: lessonOrder++,
              contentType: lesson.contentType,
              contentJson: contentJson as object,
              durationMin: lesson.durationMin,
            },
          });
          created.lessons++;
        }
      }
    },
    { timeout: 60_000 }
  );

  return created;
}
