import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { scoreAttempt, type Response, type ScorableQuestion } from "@/lib/assessments/scoring";
import { collectEssays, gradeEssays } from "@/lib/assessments/essay-grader";
import { buildQuizContext } from "@/lib/assessments/lesson-context";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/auth/rate-limit";

export const maxDuration = 120;

/**
 * Retry AI grading for an attempt whose grader call failed.
 *
 * This is the recovery path for the one genuinely unfair failure mode in the
 * whole feature: a learner wrote a good answer, the LLM was down, and a 100%
 * gate now stands between them and the rest of the course. Their answers were
 * saved on submit, so re-grading costs them nothing but the wait.
 *
 * Idempotent and narrow by design: only PENDING attempts, only the owner's own,
 * and rate-limited like the original submission. A GRADED attempt is never
 * re-scored — that would let a learner reroll a bad grade.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { id: quizId, attemptId } = await ctx.params;

    const attempt = await prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId, clientId: actor.clientId },
      select: { id: true, gradingStatus: true, answersJson: true },
    });
    if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");
    if (attempt.gradingStatus !== "PENDING") {
      throw new DomainError(409, "not_pending", "This attempt has already been graded.");
    }

    await enforceRateLimit(RATE_PRESETS.ESSAY_GRADE, [actor.clientId]);

    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId, tenantId: actor.tenantId },
      include: {
        questions: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                prompt: true,
                answerJson: true,
                rubricJson: true,
                points: true,
              },
            },
          },
        },
      },
    });
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    const answers = (attempt.answersJson ?? {}) as Record<string, Response>;
    const essays = collectEssays(
      quiz.questions.map((qq) => qq.question),
      answers as Record<string, unknown>
    );

    const graded = await gradeEssays(essays, await buildQuizContext(quizId));
    if (!graded.ok) {
      // Still pending. Record the newest reason so support can see a pattern.
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { gradingError: graded.error },
      });
      throw new DomainError(
        503,
        "grading_unavailable",
        "Grading is still unavailable. Your answers are saved — please try again shortly."
      );
    }

    const scorable = quiz.questions.map((qq) => ({
      id: qq.question.id,
      type: qq.question.type,
      answerJson: qq.question.answerJson,
      rubricJson: qq.question.rubricJson,
      points: qq.question.points,
      effectivePoints: qq.points ?? qq.question.points,
    })) as (ScorableQuestion & { effectivePoints: number })[];

    const { scorePercent, perfect, perQuestion, results } = scoreAttempt(
      scorable,
      answers,
      graded.grades
    );
    const passed = quiz.passingScore != null ? scorePercent >= quiz.passingScore : null;

    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: {
        scorePercent,
        passed,
        // answersJson is untouched: the learner's submission is immutable, and
        // only the grader's output is rewritten.
        resultsJson: results as object,
        gradingStatus: "GRADED",
        gradingError: null,
        gradedAt: new Date(),
      },
    });

    return ok({
      attempt: { id: attempt.id, scorePercent, passed, perfect, gradingStatus: "GRADED" as const },
      results: perfect ? perQuestion : null,
      incorrectCount: Object.values(perQuestion).filter((isOk) => !isOk).length,
      essayFeedback: Object.fromEntries(
        Object.entries(results)
          .filter(([, r]) => r.feedback != null || r.criteria != null)
          .map(([qid, r]) => [qid, { feedback: r.feedback ?? "", criteria: r.criteria ?? [] }])
      ),
    });
  } catch (e) {
    return handleError(e);
  }
}
