import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { generatedCourseSchema, type GeneratedQuestion } from "@/lib/schemas/course-builder";

const Body = z.object({ course: generatedCourseSchema });

/** Reject structurally-broken quiz questions before touching the database. */
function validateQuestion(q: GeneratedQuestion, where: string): void {
  const fail = (msg: string): never => {
    throw new DomainError(400, "invalid_quiz", `${where}: ${msg}`);
  };
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

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const { course: generated } = Body.parse(await request.json());

    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    // Validate quiz integrity up front so the transaction never partially fails on bad data.
    for (const group of generated.groups) {
      for (const lesson of group.lessons) {
        if (lesson.contentType !== "QUIZ") continue;
        if (!lesson.quiz)
          throw new DomainError(400, "invalid_quiz", `Quiz lesson "${lesson.title}" has no quiz.`);
        lesson.quiz.questions.forEach((q, i) => {
          // Normalize TRUE_FALSE options defensively before validation.
          if (q.type === "TRUE_FALSE") q.options = ["True", "False"];
          validateQuestion(q, `"${lesson.title}" question ${i + 1}`);
        });
      }
    }

    const hasQuizzes = generated.groups.some((g) => g.lessons.some((l) => l.contentType === "QUIZ"));
    const created = { groups: 0, lessons: 0, quizzes: 0, questions: 0 };

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
                tenantId: actor.tenantId,
                name: `${course.title} — AI generated ${new Date().toISOString().slice(0, 10)}`,
                description: "Questions created by the AI course builder.",
              },
            })
          : null;

        for (const group of generated.groups) {
          const lessonGroup = await tx.lessonGroup.create({
            data: {
              tenantId: actor.tenantId,
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
                  tenantId: actor.tenantId,
                  title: lesson.quiz.title,
                  description: lesson.quiz.description,
                  passingScore: lesson.quiz.passingScore,
                },
              });
              created.quizzes++;
              for (const [qIdx, q] of lesson.quiz.questions.entries()) {
                const isChoice = q.type !== "SHORT_ANSWER";
                const question = await tx.question.create({
                  data: {
                    tenantId: actor.tenantId,
                    bankId: bank.id,
                    type: q.type,
                    prompt: q.prompt,
                    optionsJson: isChoice ? q.options : [],
                    answerJson: isChoice ? q.correctOptionIndexes : q.acceptedAnswers,
                    points: q.points,
                  },
                });
                await tx.quizQuestion.create({
                  data: {
                    tenantId: actor.tenantId,
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
                tenantId: actor.tenantId,
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

    return ok({ created }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
