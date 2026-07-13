import { DAY, type SeedContext } from "../index";
import { QUIZ_CATALOG, type QuestionSeed } from "../components/catalogs/quizzes";

/**
 * Convert a question's human-readable answer into the stored `answerJson`:
 * option INDICES for choice questions (what `lib/assessments/scoring.ts`
 * compares against), or the accepted string(s) for SHORT_ANSWER.
 */
function toAnswerJson(q: QuestionSeed): (number | string)[] {
  if (q.type === "SHORT_ANSWER") {
    return Array.isArray(q.answer) ? q.answer : [q.answer];
  }
  const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
  return answers.map((a) => q.options.indexOf(a)).filter((i) => i >= 0);
}

export async function seedQuizzes(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;

  for (const spec of QUIZ_CATALOG) {
    const course = ctx.ids.courseBySlug[spec.courseSlug];
    if (!course) continue;

    const bank = await prisma.questionBank.create({
      data: { tenantId, name: spec.bankName, description: spec.bankDescription },
    });

    const questionIds: string[] = [];
    for (const q of spec.questions) {
      const question = await prisma.question.create({
        data: {
          tenantId,
          bankId: bank.id,
          type: q.type,
          prompt: q.prompt,
          optionsJson: q.options as unknown as object,
          answerJson: toAnswerJson(q) as unknown as object,
          points: q.points ?? 1,
        },
      });
      questionIds.push(question.id);
    }

    const quiz = await prisma.quiz.create({
      data: {
        tenantId,
        title: spec.quizTitle,
        description: spec.quizDescription,
        passingScore: spec.passingScore,
        timeLimitMin: spec.timeLimitMin,
      },
    });

    for (let i = 0; i < questionIds.length; i++) {
      await prisma.quizQuestion.create({
        data: { tenantId, quizId: quiz.id, questionId: questionIds[i], sortOrder: i },
      });
    }

    // Attach a QUIZ lesson to the target course (appended after its lessons).
    const lesson = await prisma.lesson.create({
      data: {
        tenantId,
        courseId: course.courseId,
        title: spec.lessonTitle,
        sortOrder: course.lessonIds.length,
        contentType: "QUIZ",
        contentJson: { quizId: quiz.id } as object,
        durationMin: 10 + (course.lessonIds.length % 5),
      },
    });
    course.lessonIds.push(lesson.id);

    // Seed a completed attempt for the demo student.
    await prisma.quizAttempt.create({
      data: {
        tenantId,
        quizId: quiz.id,
        clientId,
        startedAt: new Date(now - 2 * DAY),
        submittedAt: new Date(now - 2 * DAY + 600_000),
        scorePercent: spec.attempt.scorePercent,
        passed: spec.attempt.passed,
        answersJson: {} as object,
      },
    });

    // Track the first quiz/bank for any downstream references.
    ctx.ids.questionBankId ??= bank.id;
    ctx.ids.quizId ??= quiz.id;
  }
}
