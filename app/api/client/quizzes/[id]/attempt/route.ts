import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { scoreAttempt, type Response, type ScorableQuestion } from "@/lib/assessments/scoring";
import { isUnlocked } from "@/lib/courses/gating";
import { collectEssays, gradeEssays } from "@/lib/assessments/essay-grader";
import { buildQuizContext } from "@/lib/assessments/lesson-context";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/auth/rate-limit";
import { parseRubric, type EssayGrade } from "@/lib/schemas/essay-grading";

/**
 * A quiz containing essays makes one LLM call on submit. 120s gives ~6x headroom
 * over a typical batched grade and matches the envelope of the other AI routes.
 */
export const maxDuration = 120;

/** DB-backed spend cap, because the Upstash limiter fails open when unconfigured. */
const MAX_GRADED_ATTEMPTS_PER_HOUR = 20;

const SubmitBody = z.object({
  answers: z.record(z.string(), z.union([z.array(z.number().int()), z.string()])),
});

/**
 * A learner may attempt a quiz only through a QUIZ lesson that is both in a
 * course they're enrolled in AND currently unlocked for them.
 *
 * The enrolment check alone is not enough: without the unlock check, a quizId
 * lifted from an earlier course (or guessed) would hand over the questions for
 * a lesson the learner hasn't reached yet — a side door around the gate in
 * app/api/client/courses/[slug]/learn/route.ts.
 */
async function ensureQuizReachable(clientId: string, quizId: string): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: { clientId },
    select: {
      id: true,
      courseId: true,
      lessonProgress: {
        where: { completedAt: { not: null } },
        select: { lessonId: true },
      },
    },
  });
  if (enrollments.length === 0) throw new DomainError(403, "not_enrolled", "Quiz not available.");

  const lessons = await prisma.lesson.findMany({
    where: { courseId: { in: enrollments.map((e) => e.courseId) } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, courseId: true, sortOrder: true, contentType: true, contentJson: true },
  });

  const byCourse = new Map<string, typeof lessons>();
  for (const lesson of lessons) {
    const list = byCourse.get(lesson.courseId) ?? [];
    list.push(lesson);
    byCourse.set(lesson.courseId, list);
  }

  for (const enrollment of enrollments) {
    const courseLessons = byCourse.get(enrollment.courseId) ?? [];
    const linked = courseLessons.find(
      (l) =>
        l.contentType === "QUIZ" &&
        (l.contentJson as { quizId?: unknown } | null)?.quizId === quizId
    );
    if (!linked) continue;

    const completed = new Set(enrollment.lessonProgress.map((p) => p.lessonId));
    // Reachable through any one enrolled course is enough.
    if (isUnlocked(courseLessons, completed, linked.id)) return;
  }

  throw new DomainError(403, "not_available", "Quiz not available.");
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

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    await ensureQuizReachable(actor.clientId, id);

    const quiz = await prisma.quiz.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          include: {
            question: {
              select: {
                id: true,
                type: true,
                prompt: true,
                optionsJson: true,
                rubricJson: true,
                points: true,
              },
            },
          },
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
        };
      }),
    };

    // Whether this learner has already cleared the completion bar for this quiz.
    const perfect = await prisma.quizAttempt.findFirst({
      where: {
        quizId: id,
        clientId: actor.clientId,
        submittedAt: { not: null },
        scorePercent: 100,
        gradingStatus: "GRADED",
      },
      select: { id: true },
    });

    return ok({ quiz: payload, alreadyPerfect: perfect != null });
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
    await ensureQuizReachable(actor.clientId, id);

    const quiz = await prisma.quiz.findFirst({
      where: { id, tenantId: actor.tenantId },
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

    const scorable = quiz.questions.map((qq) => ({
      id: qq.question.id,
      type: qq.question.type,
      answerJson: qq.question.answerJson,
      rubricJson: qq.question.rubricJson,
      points: qq.question.points,
      effectivePoints: qq.points ?? qq.question.points,
    })) as (ScorableQuestion & { effectivePoints: number })[];

    const answers = body.answers as Record<string, Response>;

    // Objectives are graded FIRST, before any LLM call, so a grader outage can
    // never turn a correct multiple-choice answer into a wrong one.
    const essays = collectEssays(
      quiz.questions.map((qq) => qq.question),
      body.answers
    );

    let essayGrades: Record<string, EssayGrade | null> | undefined;
    let gradingError: string | null = null;

    if (essays.length > 0) {
      await enforceRateLimit(RATE_PRESETS.ESSAY_GRADE, [actor.clientId]);
      await enforceAttemptBudget(actor.clientId);

      const context = await buildQuizContext(id);
      const graded = await gradeEssays(essays, context);
      if (graded.ok) essayGrades = graded.grades;
      else gradingError = graded.error;
    }

    const { scorePercent, perfect, perQuestion, results } = scoreAttempt(
      scorable,
      answers,
      essayGrades
    );

    // A failed grader must never be more permissive than a successful one.
    // The attempt is still recorded (never lose a learner's writing) but it is
    // PENDING, scoreless, and therefore unlocks nothing — so inducing a grader
    // failure is strictly worse for the learner than letting it succeed.
    const pending = gradingError != null;
    const passed = pending ? null : quiz.passingScore != null ? scorePercent >= quiz.passingScore : null;

    const attempt = await prisma.quizAttempt.create({
      data: {
        tenantId: actor.tenantId,
        quizId: id,
        clientId: actor.clientId,
        submittedAt: new Date(),
        scorePercent: pending ? null : scorePercent,
        passed,
        answersJson: body.answers as object,
        resultsJson: results as object,
        gradingStatus: pending ? "PENDING" : "GRADED",
        gradingError,
        gradedAt: pending ? null : new Date(),
      },
    });

    if (pending) {
      return ok({
        attempt: {
          id: attempt.id,
          scorePercent: null,
          passed: null,
          perfect: false,
          gradingStatus: "PENDING" as const,
        },
        results: null,
        incorrectCount: 0,
        essayFeedback: {},
      });
    }

    const incorrectCount = Object.values(perQuestion).filter((ok) => !ok).length;

    return ok({
      attempt: {
        id: attempt.id,
        scorePercent,
        passed,
        perfect,
        gradingStatus: "GRADED" as const,
      },
      // Retries are unlimited and completion requires 100%, so a per-question
      // right/wrong map on a failed attempt is a brute-force oracle: a few
      // retakes would reveal the whole answer key without teaching anything.
      // Once the learner is at 100% there is nothing left to leak.
      results: perfect ? perQuestion : null,
      incorrectCount,
      // Essay feedback IS shown on a failed attempt: it's formative rather than
      // an answer key, and it is the entire point of grading essays with AI.
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
