import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { ownsCandidate, requireCandidateIdentity } from "@/lib/exams/candidate-auth";
import { candidatePackage, parsePaper } from "@/lib/exams/paper";
import { answerKeyLines } from "@/lib/exams/answer-key";

/**
 * The candidate's result, only once released, and only as much as the exam's
 * review mode allows: nothing, the score, their marked answers, or answers
 * with the correct ones and explanations.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    const identity = await requireCandidateIdentity();
    const { attemptId } = await ctx.params;
    const attempt = await prisma.examAttempt.findFirst({
      where: { id: attemptId, tenantId: identity.tenantId },
      include: {
        candidate: { select: { id: true, clientId: true, examId: true, fullName: true, candidateNo: true } },
        exam: { select: { title: true, reviewMode: true, passMark: true, resultRelease: true } },
        responses: true,
      },
    });
    if (!attempt || !ownsCandidate(identity, attempt.candidate)) throw new DomainError(404, "not_found", "Attempt not found.");
    const base = {
      exam: { title: attempt.exam.title },
      candidate: { fullName: attempt.candidate.fullName, candidateNo: attempt.candidate.candidateNo },
      status: attempt.status,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submitReason: attempt.submitReason,
      answeredCount: attempt.answeredCount,
      released: !!attempt.releasedAt,
      releaseMode: attempt.exam.resultRelease,
    };
    if (!attempt.releasedAt || attempt.exam.reviewMode === "NONE") return ok({ ...base, score: null, review: null });

    const paper = parsePaper(attempt.paperJson);
    const score = {
      scorePoints: attempt.scorePoints,
      maxPoints: attempt.maxPoints,
      scorePercent: attempt.scorePercent,
      passed: attempt.passed,
      passMark: attempt.exam.passMark,
      grade: attempt.grade,
      sections: paper.sections.map((s) => {
        const sc = (attempt.sectionScoresJson as Record<string, { earned: number; max: number }> | null)?.[s.id];
        return { title: s.title, earned: sc?.earned ?? 0, max: sc?.max ?? 0 };
      }),
    };
    if (attempt.exam.reviewMode === "SCORE_ONLY") return ok({ ...base, score, review: null });

    const withKeys = attempt.exam.reviewMode === "ANSWERS_WITH_EXPLANATIONS";
    const pkg = await candidatePackage(paper, attempt.seed);
    const questions = withKeys
      ? await prisma.question.findMany({
          where: { id: { in: pkg.items.map((i) => i.key) } },
          select: { id: true, type: true, optionsJson: true, answerJson: true, explanation: true },
        })
      : [];
    const qById = new Map(questions.map((q) => [q.id, q]));
    const rByKey = new Map(attempt.responses.map((r) => [r.itemKey, r]));
    const review = pkg.items.map((it) => {
      const r = rByKey.get(it.key);
      const earned = r ? (r.manualPoints ?? r.autoPoints ?? 0) : 0;
      const q = qById.get(it.key);
      return {
        key: it.key,
        n: it.n,
        type: it.type,
        prompt: it.prompt,
        view: it.view,
        media: it.media,
        answer: r?.answerJson ?? null,
        earned,
        max: it.points,
        outcome: !r || r.answerJson == null ? "unanswered" : earned >= it.points ? "correct" : earned > 0 ? "partial" : "incorrect",
        feedback: r?.feedback ?? null,
        correct: q ? answerKeyLines(q).join("; ") || null : null,
        explanation: q?.explanation ?? null,
      };
    });
    return ok({ ...base, score, review });
  } catch (e) {
    return handleError(e);
  }
}
