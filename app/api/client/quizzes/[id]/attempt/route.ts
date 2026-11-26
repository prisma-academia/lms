import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import type { Response } from "@/lib/assessments/scoring";
import { MAX_ESSAY_CHARS } from "@/lib/assessments/essay-grader";
import {
  evaluateAnswers,
  gradedAttemptData,
  learnerAttemptPayload,
  loadQuizForGrading,
  ungradedStatus,
} from "@/lib/assessments/attempts";
import { findQuizCourse, type QuizCourse } from "@/lib/assessments/quiz-access";
import { effectivePassMark, passingAttemptWhere } from "@/lib/assessments/pass-mark";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/auth/rate-limit";
import { parseRubric } from "@/lib/schemas/essay-grading";

/**
 * A quiz containing essays makes one LLM call on submit. 120s gives ample
 * headroom over a typical batched grade and matches the other AI routes.
 */
export const maxDuration = 120;

/** DB-backed spend cap, because the Upstash limiter fails open when unconfigured. */
const MAX_GRADED_ATTEMPTS_PER_HOUR = 20;

/**
 * How fast one quiz may be resubmitted.
 *
 * A failed attempt can say which questions were wrong. With unlimited instant
 * retakes that is a search procedure: change one answer, resubmit, watch the
 * list. A short cool-down keeps retakes unlimited while making that slower than
 * simply reading the lesson the review link points at.
 */
const MAX_ATTEMPTS_PER_QUIZ = 5;
const QUIZ_WINDOW_MS = 10 * 60 * 1000;

const SubmitBody = z.object({
  answers: z.record(
    z.string(),
    // Text answers are capped: an essay is sent to a model, and an unbounded
    // string is an unbounded bill. Far above any real answer.
    z.union([z.array(z.number().int()).max(50), z.string().max(MAX_ESSAY_CHARS)])
  ),
});

async function requireQuizCourse(clientId: string, quizId: string): Promise<QuizCourse> {
  const course = await findQuizCourse(clientId, quizId);
  // One message for "not enrolled", "no such quiz" and "locked": the difference
  // would tell a learner which quiz ids exist.
  if (!course) throw new DomainError(403, "not_available", "Quiz not available.");
  return course;
}

/**
 * Hard cap on AI-graded submissions per learner per hour.
 *
 * `enforceRateLimit` deliberately fails open when Upstash is unconfigured — the
 * right call for auth, the wrong one for spend, since an unconfigured Redis
 * would mean an unmetered LLM bill. These rows are written anyway, so counting
 * them costs one query.
 */
async function enforceAttemptBudget(clientId: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.quizAttempt.count({
    where: { clientId, startedAt: { gte: since } },
  });
  if (recent >= MAX_GRADED_ATTEMPTS_PER_HOUR) {
    throw new DomainError(
      429,
      "too_many_attempts",
      "You've submitted a lot of attempts in the last hour. Take a break and try again shortly."
    );
  }
}

async function enforceQuizCooldown(clientId: string, quizId: string): Promise<void> {
  const since = new Date(Date.now() - QUIZ_WINDOW_MS);
  const recent = await prisma.quizAttempt.count({
    where: { clientId, quizId, startedAt: { gte: since } },
  });
  if (recent >= MAX_ATTEMPTS_PER_QUIZ) {
    throw new DomainError(
      429,
      "quiz_cooldown",
      "You've tried this quiz several times in a row. Take a few minutes with the lessons it covers, then try again."
    );
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    await requireQuizCourse(actor.clientId, id);

    const quiz = await loadQuizForGrading(id, actor.tenantId);
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    const passMark = effectivePassMark(quiz.passingScore);

    // Fields are picked one by one: `quiz` carries the answer key and rubrics.
    const payload = {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      timeLimitMin: quiz.timeLimitMin,
      /** The mark this quiz is actually held to (an unset mark means 100). */
      passMark,
      questions: quiz.questions.map((qq) => {
        // Only the word bounds are exposed. Criteria and the model answer stay
        // server-side: handing a learner the rubric turns the essay into a
        // fill-in-the-blanks exercise.
        const rubric = qq.question.type === "ESSAY" ? parseRubric(qq.question.rubricJson) : null;
        return {
          id: qq.question.id,
          type: qq.question.type,
          prompt: qq.question.prompt,
          options: qq.question.optionsJson,
          points: qq.points ?? qq.question.points,
          minWords: rubric?.minWords ?? null,
          maxWords: rubric?.maxWords ?? null,
          // Sent only when the author allows hints on this quiz; the player
          // keeps it hidden until the learner asks.
          hint: quiz.hintsEnabled ? qq.question.hint?.trim() || null : null,
        };
      }),
    };

    const [passing, latest] = await Promise.all([
      // Whether this learner has already cleared the bar for this quiz.
      prisma.quizAttempt.findFirst({
        where: { quizId: id, clientId: actor.clientId, ...passingAttemptWhere(passMark) },
        select: { id: true },
      }),
      prisma.quizAttempt.findFirst({
        where: { quizId: id, clientId: actor.clientId, submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        select: { id: true, gradingStatus: true },
      }),
    ]);

    return ok({
      quiz: payload,
      alreadyPassed: passing != null,
      // An attempt still waiting on a grade. The result screen used to live only
      // in the browser, so a refresh lost it — and with it the only button that
      // could ask for the grade again.
      openAttempt:
        latest && latest.gradingStatus !== "GRADED"
          ? { id: latest.id, gradingStatus: latest.gradingStatus }
          : null,
    });
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
    const course = await requireQuizCourse(actor.clientId, id);

    const quiz = await loadQuizForGrading(id, actor.tenantId);
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    await enforceQuizCooldown(actor.clientId, id);

    const hasEssays = quiz.questions.some((qq) => qq.question.type === "ESSAY");
    if (hasEssays) {
      await enforceRateLimit(RATE_PRESETS.ESSAY_GRADE, [actor.clientId]);
      await enforceAttemptBudget(actor.clientId);
    }

    // Objectives are scored locally before any model is asked, so a grader
    // outage can never turn a correct multiple-choice answer into a wrong one.
    const evaluation = await evaluateAnswers({
      quiz,
      answers: body.answers as Record<string, Response>,
      clientId: actor.clientId,
      courseId: course.courseId,
    });

    // A failed grader must never be more permissive than a successful one. The
    // attempt is still recorded (never lose a learner's writing) but it is
    // scoreless and therefore unlocks nothing — so inducing a grader failure is
    // strictly worse for the learner than letting it succeed.
    const status = evaluation.graded ? "GRADED" : ungradedStatus(evaluation, 1);

    const attempt = await prisma.quizAttempt.create({
      data: {
        tenantId: actor.tenantId,
        quizId: id,
        clientId: actor.clientId,
        submittedAt: new Date(),
        answersJson: body.answers as object,
        gradingAttempts: hasEssays ? 1 : 0,
        ...(evaluation.graded
          ? gradedAttemptData(evaluation)
          : {
              scorePercent: null,
              passed: null,
              resultsJson: evaluation.results as object,
              gradingStatus: status,
              gradingError: evaluation.error,
              gradedAt: null,
            }),
      },
    });

    return ok(learnerAttemptPayload(attempt.id, evaluation, status, { quiz, course }));
  } catch (e) {
    return handleError(e);
  }
}
