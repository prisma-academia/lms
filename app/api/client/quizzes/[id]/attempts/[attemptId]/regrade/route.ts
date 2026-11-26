import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import type { Response } from "@/lib/assessments/scoring";
import {
  evaluateAnswers,
  gradedAttemptData,
  learnerAttemptPayload,
  loadQuizForGrading,
  ungradedStatus,
} from "@/lib/assessments/attempts";
import { findQuizCourse } from "@/lib/assessments/quiz-access";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/auth/rate-limit";

export const maxDuration = 120;

/**
 * Retry AI grading for an attempt whose grader call failed.
 *
 * This is the recovery path for the one genuinely unfair failure mode in the
 * whole feature: a learner wrote a good answer, the model was unavailable, and
 * a gate now stands between them and the rest of the course. Their answers were
 * saved on submit, so re-grading costs them nothing but the wait.
 *
 * Idempotent and narrow by design: only PENDING attempts, only the owner's own,
 * and rate-limited like the original submission. A GRADED attempt is never
 * re-scored — that would let a learner reroll a bad grade. A FAILED attempt has
 * been handed to staff and is not retried from here: the same request has
 * already failed several times, or cannot succeed until an operator acts.
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
      select: { id: true, gradingStatus: true, gradingAttempts: true, answersJson: true },
    });
    if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");
    if (attempt.gradingStatus === "GRADED") {
      throw new DomainError(409, "not_pending", "This attempt has already been graded.");
    }
    if (attempt.gradingStatus === "FAILED") {
      throw new DomainError(
        409,
        "awaiting_staff",
        "Your answers have been passed to your instructor to mark. You don't need to do anything."
      );
    }

    await enforceRateLimit(RATE_PRESETS.ESSAY_GRADE, [actor.clientId]);

    const quiz = await loadQuizForGrading(quizId, actor.tenantId);
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    // Null if the quiz is no longer reachable (the course changed since the
    // attempt was made). Re-grading still goes ahead — the learner's answers are
    // already saved — it just has no course to draw context or links from.
    const course = await findQuizCourse(actor.clientId, quizId);

    const evaluation = await evaluateAnswers({
      quiz,
      answers: (attempt.answersJson ?? {}) as Record<string, Response>,
      clientId: actor.clientId,
      courseId: course?.courseId,
    });

    const tries = attempt.gradingAttempts + 1;

    if (!evaluation.graded) {
      const status = ungradedStatus(evaluation, tries);
      // Record the newest reason so staff can see a pattern.
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { gradingError: evaluation.error, gradingAttempts: tries, gradingStatus: status },
      });
      // Not an error response: the learner's screen needs the new status to
      // know whether to offer another retry or say it is with their instructor.
      return ok(learnerAttemptPayload(attempt.id, evaluation, status, { quiz, course }));
    }

    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      // answersJson is untouched: the learner's submission is immutable, and
      // only the grader's output is rewritten.
      data: { ...gradedAttemptData(evaluation), gradingAttempts: tries },
    });

    return ok(learnerAttemptPayload(attempt.id, evaluation, "GRADED", { quiz, course }));
  } catch (e) {
    return handleError(e);
  }
}
