import { prisma } from "@/lib/db/client";
import {
  scoreAttempt,
  type EssayGradeMap,
  type QuestionResult,
  type Response,
  type ScorableQuestion,
} from "@/lib/assessments/scoring";
import { collectEssays, gradeEssays, priorEssayGrades } from "@/lib/assessments/essay-grader";
import { buildQuizContext } from "@/lib/assessments/lesson-context";
import { attemptPasses, effectivePassMark } from "@/lib/assessments/pass-mark";
import { buildReview, type ReviewCourse, type ReviewItem } from "@/lib/assessments/review-links";
import type { GradingStatus } from "@/lib/generated/prisma/enums";

/**
 * Turning a learner's answers into a stored, gated result.
 *
 * Submitting, re-grading after a grader outage, and an instructor marking by
 * hand all end in the same place — score the attempt, decide pass or fail,
 * persist it — and used to each carry their own copy of that logic. They drift:
 * one copy learns about pass marks and another does not. Everything they share
 * lives here.
 */

/** After this many failed tries the attempt is handed to staff instead of retried. */
export const MAX_GRADING_ATTEMPTS = 3;

const QUIZ_GRADING_INCLUDE = {
  questions: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      question: {
        select: {
          id: true,
          type: true,
          prompt: true,
          optionsJson: true,
          // The answer key and rubric. Loaded for scoring; callers that build a
          // response for a learner must pick fields explicitly, never spread.
          answerJson: true,
          rubricJson: true,
          points: true,
          hint: true,
          sourceLessonId: true,
          sourceAnchor: true,
          sourceExcerpt: true,
        },
      },
    },
  },
};

export async function loadQuizForGrading(quizId: string, tenantId: string) {
  return prisma.quiz.findFirst({
    where: { id: quizId, tenantId },
    include: QUIZ_GRADING_INCLUDE,
  });
}

export type QuizForGrading = NonNullable<Awaited<ReturnType<typeof loadQuizForGrading>>>;

function scorableOf(quiz: QuizForGrading): (ScorableQuestion & { effectivePoints: number })[] {
  return quiz.questions.map((qq) => ({
    id: qq.question.id,
    type: qq.question.type,
    answerJson: qq.question.answerJson,
    rubricJson: qq.question.rubricJson,
    points: qq.question.points,
    effectivePoints: qq.points ?? qq.question.points,
  }));
}

export type Evaluation =
  | {
      graded: true;
      scorePercent: number;
      passMark: number;
      passed: boolean;
      /** Every point earned. Stricter than `passed` unless the pass mark is 100. */
      perfect: boolean;
      perQuestion: Record<string, boolean>;
      results: Record<string, QuestionResult>;
      /** True when a model was asked (as opposed to reused or manual grades). */
      usedAi: boolean;
    }
  | {
      graded: false;
      passMark: number;
      /** Diagnostic for staff and logs — never shown to the learner. */
      error: string;
      /** False when trying again cannot help (no key, no credit). */
      retryable: boolean;
      /** Objective questions only; essays unscored. Stored so staff can mark from it. */
      results: Record<string, QuestionResult>;
    };

/**
 * Score a set of answers.
 *
 * Objective questions are scored locally, always. Essays are graded by the
 * model unless `manualGrades` supplies them (an instructor marking by hand).
 * A grader failure is not an error here: it is a normal outcome the caller
 * records, and it must never be more permissive than a successful grade.
 */
export async function evaluateAnswers(input: {
  quiz: QuizForGrading;
  answers: Record<string, Response>;
  clientId: string;
  manualGrades?: EssayGradeMap;
  /** The course the quiz is being taken through, when known. */
  courseId?: string;
}): Promise<Evaluation> {
  const { quiz, answers, clientId } = input;
  const scorable = scorableOf(quiz);
  const passMark = effectivePassMark(quiz.passingScore);

  let essayGrades: EssayGradeMap | undefined = input.manualGrades;
  let essayGradeKeys: Record<string, string> | undefined;
  let usedAi = false;

  if (!input.manualGrades) {
    const essays = collectEssays(
      quiz.questions.map((qq) => qq.question),
      answers as Record<string, unknown>
    );

    if (essays.length > 0) {
      // An essay the learner did not change since their last graded attempt
      // keeps the grade it already has: same answer, same grade, no second call.
      const previous = await prisma.quizAttempt.findFirst({
        where: { quizId: quiz.id, clientId, gradingStatus: "GRADED" },
        orderBy: { submittedAt: "desc" },
        select: { resultsJson: true },
      });
      const prior = priorEssayGrades(previous?.resultsJson);

      const context = await buildQuizContext(quiz.id, { courseId: input.courseId });
      const graded = await gradeEssays(essays, context, prior);

      if (!graded.ok) {
        return {
          graded: false,
          passMark,
          error: graded.error,
          retryable: graded.retryable,
          results: scoreAttempt(scorable, answers).results,
        };
      }
      essayGrades = graded.grades;
      essayGradeKeys = graded.gradeKeys;
      usedAi = essays.some((e) => prior.get(e.questionId)?.gradeKey !== graded.gradeKeys[e.questionId]);
    }
  }

  const { scorePercent, perfect, perQuestion, results } = scoreAttempt(
    scorable,
    answers,
    essayGrades,
    essayGradeKeys
  );

  return {
    graded: true,
    scorePercent,
    passMark,
    passed: attemptPasses(scorePercent, passMark),
    perfect,
    perQuestion,
    results,
    usedAi,
  };
}

/**
 * The status an ungraded attempt should carry: still worth retrying, or handed
 * to staff. `attemptsSoFar` counts the try that just failed.
 */
export function ungradedStatus(evaluation: { retryable: boolean }, attemptsSoFar: number): GradingStatus {
  return evaluation.retryable && attemptsSoFar < MAX_GRADING_ATTEMPTS ? "PENDING" : "FAILED";
}

/** Column values for a graded outcome. */
export function gradedAttemptData(evaluation: Extract<Evaluation, { graded: true }>) {
  return {
    scorePercent: evaluation.scorePercent,
    passed: evaluation.passed,
    passMarkApplied: evaluation.passMark,
    resultsJson: evaluation.results as object,
    gradingStatus: "GRADED" as const,
    gradingError: null,
    gradedAt: new Date(),
  };
}

type EssayFeedback = Record<
  string,
  { feedback: string; criteria: NonNullable<QuestionResult["criteria"]> }
>;

export type LearnerAttemptPayload = {
  attempt: {
    id: string;
    scorePercent: number | null;
    passed: boolean | null;
    passMark: number;
    perfect: boolean;
    gradingStatus: GradingStatus;
  };
  /** Per-question right/wrong. Only once the learner has passed. */
  results: Record<string, boolean> | null;
  incorrectCount: number;
  essayFeedback: EssayFeedback;
  /**
   * On a failed attempt, the questions that were not fully correct and where to
   * read up on each. Null when the attempt passed, is ungraded, or the quiz has
   * review links switched off.
   */
  review: ReviewItem[] | null;
};

/** What the learner is told about an attempt. Never includes answers or rubrics. */
export function learnerAttemptPayload(
  attemptId: string,
  evaluation: Evaluation,
  status: GradingStatus,
  /** The quiz and the course it is being taken through; needed for review links. */
  context?: { quiz: QuizForGrading; course: ReviewCourse | null }
): LearnerAttemptPayload {
  if (!evaluation.graded) {
    return {
      attempt: {
        id: attemptId,
        scorePercent: null,
        passed: null,
        passMark: evaluation.passMark,
        perfect: false,
        gradingStatus: status,
      },
      results: null,
      incorrectCount: 0,
      essayFeedback: {},
      review: null,
    };
  }

  // Naming the questions that were wrong is what the author asked for when they
  // left review links on. It is a deliberate trade against the rule below (a
  // failed attempt gets no right/wrong map): it says WHICH, never how — not the
  // right option, not which chosen options were mistakes — and submissions are
  // throttled so it cannot be mined quickly.
  const review =
    !evaluation.passed && context?.quiz.showReviewLinks
      ? buildReview(
          context.quiz.questions.map((qq) => ({
            id: qq.question.id,
            sourceLessonId: qq.question.sourceLessonId,
            sourceAnchor: qq.question.sourceAnchor,
            sourceExcerpt: qq.question.sourceExcerpt,
          })),
          evaluation.perQuestion,
          context.course
        )
      : null;

  return {
    attempt: {
      id: attemptId,
      scorePercent: evaluation.scorePercent,
      passed: evaluation.passed,
      passMark: evaluation.passMark,
      perfect: evaluation.perfect,
      gradingStatus: "GRADED",
    },
    // Retakes are unlimited, so a right/wrong map on a FAILED attempt is an
    // answer key delivered a few guesses at a time. Once the learner has passed
    // there is nothing left for it to unlock.
    results: evaluation.passed ? evaluation.perQuestion : null,
    incorrectCount: Object.values(evaluation.perQuestion).filter((isCorrect) => !isCorrect).length,
    // Essay feedback IS shown on a failed attempt: it is formative, it names
    // gaps rather than answers, and it is the point of grading essays at all.
    essayFeedback: Object.fromEntries(
      Object.entries(evaluation.results)
        .filter(([, r]) => r.feedback != null || r.criteria != null)
        .map(([qid, r]) => [qid, { feedback: r.feedback ?? "", criteria: r.criteria ?? [] }])
    ),
    review,
  };
}
