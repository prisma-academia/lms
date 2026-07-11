import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { scoreAttempt, type Response, type ScorableQuestion } from "@/lib/assessments/scoring";

const SubmitBody = z.object({
  answers: z.record(z.string(), z.union([z.array(z.number().int()), z.string()])),
});

/** The client may attempt a quiz only if enrolled in a course whose QUIZ lesson links it. */
async function ensureLinkedAndEnrolled(clientId: string, quizId: string): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({ where: { clientId }, select: { courseId: true } });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) throw new DomainError(403, "not_enrolled", "Quiz not available.");
  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: courseIds }, contentType: "QUIZ" },
    select: { contentJson: true },
  });
  const linked = lessons.some((l) => (l.contentJson as { quizId?: string } | null)?.quizId === quizId);
  if (!linked) throw new DomainError(403, "not_available", "Quiz not available.");
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    await ensureLinkedAndEnrolled(actor.clientId, id);

    const quiz = await prisma.quiz.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          include: { question: { select: { id: true, type: true, prompt: true, optionsJson: true, points: true } } },
        },
      },
    });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    // Strip correct answers before sending to the learner.
    const payload = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      timeLimitMin: quiz.timeLimitMin,
      passingScore: quiz.passingScore,
      questions: quiz.questions.map((qq) => ({
        id: qq.question.id,
        type: qq.question.type,
        prompt: qq.question.prompt,
        options: qq.question.optionsJson,
        points: qq.points ?? qq.question.points,
      })),
    };
    return ok({ quiz: payload });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    const body = SubmitBody.parse(await request.json());
    await ensureLinkedAndEnrolled(actor.clientId, id);

    const quiz = await prisma.quiz.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: { include: { question: { select: { id: true, type: true, answerJson: true, points: true } } } },
      },
    });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    const scorable = quiz.questions.map((qq) => ({
      id: qq.question.id,
      type: qq.question.type,
      answerJson: qq.question.answerJson,
      points: qq.question.points,
      effectivePoints: qq.points ?? qq.question.points,
    })) as (ScorableQuestion & { effectivePoints: number })[];

    const answers = body.answers as Record<string, Response>;
    const { scorePercent, perQuestion } = scoreAttempt(scorable, answers);
    const passed = quiz.passingScore != null ? scorePercent >= quiz.passingScore : null;

    const attempt = await prisma.quizAttempt.create({
      data: {
        tenantId: actor.tenantId,
        quizId: id,
        clientId: actor.clientId,
        submittedAt: new Date(),
        scorePercent,
        passed,
        answersJson: body.answers as object,
      },
    });

    return ok({
      attempt: { id: attempt.id, scorePercent, passed },
      results: perQuestion,
    });
  } catch (e) {
    return handleError(e);
  }
}
