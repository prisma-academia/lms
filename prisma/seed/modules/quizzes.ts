import { DAY, type SeedContext } from "../index";
import { QUIZ_CATALOG } from "../components/catalogs/quizzes";
import { quizLesson } from "../components/factories/lesson";

export async function seedQuizzes(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;

  const bank = await prisma.questionBank.create({
    data: {
      tenantId,
      name: QUIZ_CATALOG.bankName,
      description: QUIZ_CATALOG.bankDescription,
    },
  });
  ctx.ids.questionBankId = bank.id;

  const questionIds: string[] = [];
  for (const q of QUIZ_CATALOG.questions) {
    const question = await prisma.question.create({
      data: {
        tenantId,
        bankId: bank.id,
        type: q.type,
        prompt: q.prompt,
        optionsJson: q.options as unknown as object,
        answerJson: (Array.isArray(q.answer) ? q.answer : [q.answer]) as unknown as object,
        points: q.points ?? 1,
      },
    });
    questionIds.push(question.id);
  }

  const quiz = await prisma.quiz.create({
    data: {
      tenantId,
      title: QUIZ_CATALOG.quizTitle,
      description: QUIZ_CATALOG.quizDescription,
      passingScore: 70,
      timeLimitMin: 15,
    },
  });
  ctx.ids.quizId = quiz.id;

  for (let i = 0; i < questionIds.length; i++) {
    await prisma.quizQuestion.create({
      data: {
        tenantId,
        quizId: quiz.id,
        questionId: questionIds[i],
        sortOrder: i,
      },
    });
  }

  const biology = ctx.ids.courseBySlug["biology-waec"];
  if (biology) {
    const ql = quizLesson("Cell structure quiz", quiz.id, biology.lessonIds.length);
    const lesson = await prisma.lesson.create({
      data: {
        tenantId,
        courseId: biology.courseId,
        title: ql.title,
        sortOrder: biology.lessonIds.length,
        contentType: "QUIZ",
        contentJson: { quizId: quiz.id } as object,
        durationMin: ql.durationMin,
      },
    });
    biology.lessonIds.push(lesson.id);
  }

  await prisma.quizAttempt.create({
    data: {
      tenantId,
      quizId: quiz.id,
      clientId,
      startedAt: new Date(now - 2 * DAY),
      submittedAt: new Date(now - 2 * DAY + 600_000),
      scorePercent: 83,
      passed: true,
      answersJson: {} as object,
    },
  });
}
