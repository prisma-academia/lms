import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import type { EssayGradeMap, Response } from "@/lib/assessments/scoring";
import {
  evaluateAnswers,
  gradedAttemptData,
  loadQuizForGrading,
  ungradedStatus,
} from "@/lib/assessments/attempts";
import { ESSAY_LEVELS, ESSAY_LEVEL_SCORE, parseRubric } from "@/lib/schemas/essay-grading";

export const maxDuration = 120;

/**
 * An instructor marks a learner's essays, or asks the AI grader to try again.
 *
 * Essay grades come from a model, and a model can be unavailable — no key, no
 * credit, an outage. Before this route existed, an attempt in that state had no
 * way forward at all: the learner could only press "grade my answers" against
 * the same failure, and staff could read the error but not act on it. A learner
 * blocked from the rest of a course they paid for by a third party's downtime
 * is the failure this closes.
 *
 * It also lets an instructor overrule the model on an attempt it DID grade.
 */
const Body = z.union([
  z.object({ action: z.literal("retry_ai") }),
  z.object({
    grades: z.record(
      z.string(),
      z.object({
        criteria: z
          .array(
            z.object({
              id: z.string().min(1),
              // The same four-point scale the AI grader uses, so a manual mark
              // and an AI mark mean the same thing.
              level: z.enum(ESSAY_LEVELS),
              comment: z.string().max(600).optional(),
            })
          )
          .min(1),
        feedback: z.string().max(1500).optional(),
      })
    ),
  }),
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GRADES_WRITE.key);
    const { id: quizId, attemptId } = await ctx.params;
    const body = Body.parse(await request.json());

    const attempt = await prisma.quizAttempt.findFirst({
      where: { id: attemptId, quizId, tenantId: actor.tenantId },
      select: {
        id: true,
        clientId: true,
        gradingStatus: true,
        gradingAttempts: true,
        scorePercent: true,
        answersJson: true,
      },
    });
    if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");

    const quiz = await loadQuizForGrading(quizId, actor.tenantId);
    if (!quiz) throw new DomainError(404, "not_found", "Quiz not found.");

    const answers = (attempt.answersJson ?? {}) as Record<string, Response>;
    const meta = requestMeta(request);

    if ("action" in body) {
      if (attempt.gradingStatus === "GRADED") {
        throw new DomainError(409, "already_graded", "This attempt has already been graded.");
      }

      const evaluation = await evaluateAnswers({ quiz, answers, clientId: attempt.clientId });
      const tries = attempt.gradingAttempts + 1;

      if (!evaluation.graded) {
        const status = ungradedStatus(evaluation, tries);
        await prisma.quizAttempt.update({
          where: { id: attempt.id },
          data: { gradingError: evaluation.error, gradingAttempts: tries, gradingStatus: status },
        });
        throw new DomainError(
          503,
          "grading_unavailable",
          "The AI grader could not mark this attempt. You can mark it by hand instead."
        );
      }

      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { ...gradedAttemptData(evaluation), gradingAttempts: tries },
      });
      await audit({
        actorType: "TENANT_USER",
        actorId: actor.userId,
        action: "quiz.attempt_regraded",
        tenantId: actor.tenantId,
        targetType: "QuizAttempt",
        targetId: attempt.id,
        after: { scorePercent: evaluation.scorePercent, passed: evaluation.passed, by: "ai" },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return ok({ scorePercent: evaluation.scorePercent, passed: evaluation.passed });
    }

    // Manual marking. Every essay in the quiz must be marked on every one of
    // its criteria: a partly marked attempt would score the unmarked criteria
    // as zero without anyone having decided that.
    const manualGrades: EssayGradeMap = {};
    for (const qq of quiz.questions) {
      if (qq.question.type !== "ESSAY") continue;
      const rubric = parseRubric(qq.question.rubricJson);
      if (!rubric) continue;

      const supplied = body.grades[qq.question.id];
      if (!supplied) {
        throw new DomainError(400, "incomplete_marking", "Mark every written answer before saving.");
      }
      const byId = new Map(supplied.criteria.map((c) => [c.id, c] as const));
      const missing = rubric.criteria.filter((c) => !byId.has(c.id));
      if (missing.length > 0) {
        throw new DomainError(
          400,
          "incomplete_marking",
          `Choose a mark for every criterion (missing: ${missing.map((c) => c.label).join(", ")}).`
        );
      }

      manualGrades[qq.question.id] = {
        questionId: qq.question.id,
        // Only the rubric's own criteria, in the rubric's order: anything else
        // in the request is ignored rather than stored.
        criteria: rubric.criteria.map((c) => {
          const mark = byId.get(c.id)!;
          return {
            id: c.id,
            score01: ESSAY_LEVEL_SCORE[mark.level],
            comment: mark.comment?.trim() || "Marked by your instructor.",
          };
        }),
        feedback: supplied.feedback?.trim() || "Marked by your instructor.",
        flags: [],
      };
    }

    const evaluation = await evaluateAnswers({
      quiz,
      answers,
      clientId: attempt.clientId,
      manualGrades,
    });
    // With grades supplied there is no model call, so nothing can be ungraded.
    if (!evaluation.graded) throw new DomainError(500, "grading_failed", "Could not save the marks.");

    await prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { ...gradedAttemptData(evaluation), gradedByUserId: actor.userId },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "quiz.attempt_marked",
      tenantId: actor.tenantId,
      targetType: "QuizAttempt",
      targetId: attempt.id,
      before: { scorePercent: attempt.scorePercent, gradingStatus: attempt.gradingStatus },
      after: { scorePercent: evaluation.scorePercent, passed: evaluation.passed, by: "staff" },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ scorePercent: evaluation.scorePercent, passed: evaluation.passed });
  } catch (e) {
    return handleError(e);
  }
}
