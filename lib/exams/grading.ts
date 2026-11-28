import { prisma } from "@/lib/db/client";
import { gradeQuestion, penaltyFor } from "@/lib/assessments/types";
import { parseRubric, rubricFraction } from "@/lib/schemas/essay-grading";
import { gradeEssays } from "@/lib/assessments/essay-grader";
import { logger } from "@/lib/logger";
import { parsePaper } from "@/lib/exams/paper";
import { bandFor, parseGradeBands } from "@/lib/exams/settings";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Scoring an exam attempt.
 *
 * Objective items are graded by the question-type registry (the same rules as
 * quizzes and the author's preview). Essays get an AI-suggested mark stored on
 * the response for a marker to confirm; uploads, recordings and code wait for
 * a marker. Until every such item has a confirmed mark the attempt stays
 * PENDING and its score is provisional.
 *
 * Re-running is always safe: it recomputes everything from the stored
 * responses, the current answer keys and any manual marks, so fixing a wrong
 * key and re-grading corrects every attempt.
 */

export type GradeOutcome = {
  scorePoints: number;
  maxPoints: number;
  scorePercent: number;
  passed: boolean;
  grade: string | null;
  pending: number;
};

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export async function gradeExamAttempt(attemptId: string, opts: { aiSuggest?: boolean } = {}): Promise<GradeOutcome> {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId },
    include: {
      exam: { select: { id: true, passMark: true, negativeMarking: true, gradeBandsJson: true, resultRelease: true, title: true } },
      responses: true,
    },
  });
  if (!attempt) throw new Error("Attempt not found.");
  const paper = parsePaper(attempt.paperJson);
  const ids = paper.sections.flatMap((s) => s.items.map((i) => i.questionId));
  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true, type: true, prompt: true, optionsJson: true, answerJson: true, rubricJson: true, partialCredit: true, negativePoints: true },
  });
  const qById = new Map(questions.map((q) => [q.id, q]));
  const rByKey = new Map(attempt.responses.map((r) => [r.itemKey, r]));

  // AI suggestions for essays that have none yet (or whose answer changed).
  if (opts.aiSuggest) {
    const essays = paper.sections
      .flatMap((s) => s.items)
      .map((it) => ({ it, q: qById.get(it.questionId), r: rByKey.get(it.key) }))
      .filter((x) => x.q?.type === "ESSAY" && typeof x.r?.answerJson === "string" && (x.r.answerJson as string).trim() && x.r.manualPoints == null && !x.r.aiSuggestionJson);
    const graded = essays.length
      ? await gradeEssays(
          essays.map((x) => ({
            questionId: x.q!.id,
            prompt: x.q!.prompt,
            rubric: parseRubric(x.q!.rubricJson)!,
            answer: x.r!.answerJson as string,
          })).filter((e) => e.rubric),
          `Exam: ${attempt.exam.title}`
        ).catch((e) => {
          logger.warn({ err: String(e), attemptId }, "exam_essay_ai_failed");
          return null;
        })
      : null;
    if (graded && graded.ok) {
      for (const x of essays) {
        const grade = graded.grades[x.q!.id];
        if (!grade) continue;
        const rubric = parseRubric(x.q!.rubricJson);
        const fraction = rubric ? rubricFraction(rubric, grade) : 0;
        const suggestion = { fraction, points: round(fraction * x.it.points), feedback: grade.feedback, criteria: grade.criteria, flags: grade.flags ?? [] };
        await prisma.examResponse.update({ where: { id: x.r!.id }, data: { aiSuggestionJson: suggestion as object } });
        x.r!.aiSuggestionJson = suggestion as Prisma.JsonValue;
      }
    }
  }

  let score = 0;
  let pending = 0;
  const sectionScores: Record<string, { earned: number; max: number }> = {};
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const s of paper.sections) {
    const sec = (sectionScores[s.id] = { earned: 0, max: 0 });
    for (const it of s.items) {
      const q = qById.get(it.questionId);
      if (!q) continue; // A deleted question is dropped from the total, not marked wrong.
      sec.max += it.points;
      const r = rByKey.get(it.key);
      const g = gradeQuestion(q, r?.answerJson);
      let auto: number | null = g.fraction === null ? null : g.fraction * it.points;
      if (auto !== null && g.answered && g.fraction === 0 && attempt.exam.negativeMarking != null) {
        auto = -penaltyFor(q, it.points, attempt.exam.negativeMarking);
      }
      const needsMark = g.fraction === null && g.answered && r?.manualPoints == null;
      if (needsMark) pending++;
      const earned = r?.manualPoints ?? auto ?? 0;
      sec.earned += earned;
      score += earned;
      if (r) {
        updates.push(
          prisma.examResponse.update({
            where: { id: r.id },
            data: {
              autoPoints: auto === null ? null : round(auto),
              maxPoints: it.points,
              detailJson: g.detail ? (g.detail as object) : Prisma.DbNull,
            },
          })
        );
      }
    }
  }
  const maxPoints = Object.values(sectionScores).reduce((n, s) => n + s.max, 0);
  const scorePoints = round(Math.max(0, score));
  const scorePercent = maxPoints > 0 ? round((scorePoints / maxPoints) * 100) : 0;
  const passed = scorePercent >= attempt.exam.passMark;
  const band = bandFor(scorePercent, parseGradeBands(attempt.exam.gradeBandsJson));
  const finished = attempt.status === "SUBMITTED" || attempt.status === "TERMINATED";

  updates.push(
    prisma.examAttempt.update({
      where: { id: attempt.id },
      data: {
        scorePoints,
        maxPoints,
        scorePercent,
        passed,
        grade: band?.label ?? null,
        sectionScoresJson: Object.fromEntries(Object.entries(sectionScores).map(([k, v]) => [k, { earned: round(v.earned), max: v.max }])) as object,
        gradingStatus: pending > 0 ? "PENDING" : "GRADED",
        gradedAt: pending > 0 ? null : new Date(),
        // Immediate release happens once a finished attempt has a final score.
        ...(finished && pending === 0 && attempt.exam.resultRelease === "IMMEDIATE" && !attempt.releasedAt ? { releasedAt: new Date() } : {}),
      },
    })
  );
  await prisma.$transaction(updates);
  return { scorePoints, maxPoints, scorePercent, passed, grade: band?.label ?? null, pending };
}
