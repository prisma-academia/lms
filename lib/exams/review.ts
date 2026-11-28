import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { gradeQuestion, isResponseAnswered, questionType } from "@/lib/assessments/types";
import { parseRubric, type EssayRubric } from "@/lib/schemas/essay-grading";
import { candidatePackage, parsePaper } from "@/lib/exams/paper";
import { remainingMs } from "@/lib/exams/timing";
import { answerKeyLines } from "@/lib/exams/answer-key";
import { responseFileKeyOk, staffNames } from "@/lib/exams/ops";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * One attempt as staff review it: every question as the candidate saw it,
 * their answer, the answer key, the marks and the integrity log. STAFF ONLY —
 * this carries answer keys, rubrics and explanations.
 */

export const aiSuggestionSchema = z.object({
  fraction: z.number().catch(0),
  points: z.number().catch(0),
  feedback: z.string().catch(""),
  criteria: z
    .array(z.object({ id: z.string(), score01: z.number().catch(0), comment: z.string().catch("") }))
    .catch([]),
  flags: z.array(z.string()).catch([]),
});
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;

export function parseAiSuggestion(json: unknown): AiSuggestion | null {
  if (!json || typeof json !== "object") return null;
  const r = aiSuggestionSchema.safeParse(json);
  return r.success ? r.data : null;
}

export type ItemVerdict = "correct" | "incorrect" | "partial" | "needs_marking" | "unanswered" | "removed";

export type UploadedAnswer = { name: string; size: number; type: string; url: string; durationSec: number | null };

export type ReviewItem = {
  key: string;
  n: number;
  questionId: string;
  type: QuestionTypeValue | null;
  typeLabel: string;
  grading: "auto" | "ai" | "manual" | null;
  prompt: string;
  view: unknown;
  media: unknown;
  points: number;
  answerKey: string[];
  explanation: string | null;
  rubric: EssayRubric | null;
  response: null | {
    id: string;
    answer: unknown;
    flagged: boolean;
    timeSpentSec: number;
    autoPoints: number | null;
    manualPoints: number | null;
    feedback: string | null;
    detail: unknown;
    aiSuggestion: AiSuggestion | null;
    markedAt: string | null;
    markedBy: string | null;
    file: UploadedAnswer | null;
  };
  earned: number | null;
  verdict: ItemVerdict;
};

export type AttemptReview = Awaited<ReturnType<typeof attemptReview>>;

export function fileUrl(examId: string, responseId: string) {
  return `/api/tenant/exams/${examId}/responses/${responseId}/file`;
}

/** An upload answer's metadata with the staff download link (never the raw key). */
export function uploadedAnswer(examId: string, responseId: string, answer: unknown, tenantId: string): UploadedAnswer | null {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const a = answer as Record<string, unknown>;
  if (!responseFileKeyOk(a.key, tenantId)) return null;
  return {
    name: typeof a.name === "string" ? a.name : "Answer file",
    size: typeof a.size === "number" ? a.size : 0,
    type: typeof a.type === "string" ? a.type : "application/octet-stream",
    url: fileUrl(examId, responseId),
    durationSec: typeof a.durationSec === "number" ? a.durationSec : null,
  };
}

export async function attemptReview(examId: string, attemptId: string, tenantId: string) {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, examId, tenantId },
    include: {
      exam: { select: { id: true, title: true, passMark: true, resultRelease: true } },
      candidate: {
        select: {
          id: true,
          fullName: true,
          candidateNo: true,
          regNumber: true,
          email: true,
          extraTimePct: true,
          clientId: true,
          sitting: { select: { id: true, name: true, pausedAt: true, venue: true } },
        },
      },
      responses: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!attempt) throw new DomainError(404, "not_found", "Attempt not found.");

  const paper = parsePaper(attempt.paperJson);
  const ids = paper.sections.flatMap((s) => s.items.map((i) => i.questionId));
  const [pkg, questions, actors] = await Promise.all([
    candidatePackage(paper, attempt.seed),
    prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, prompt: true, optionsJson: true, answerJson: true, rubricJson: true, explanation: true, partialCredit: true },
    }),
    staffNames([...attempt.events.map((e) => e.actorId), ...attempt.responses.map((r) => r.markedById)], tenantId),
  ]);
  const qById = new Map(questions.map((q) => [q.id, q]));
  const viewByKey = new Map(pkg.items.map((i) => [i.key, i]));
  const rByKey = new Map(attempt.responses.map((r) => [r.itemKey, r]));

  let n = 0;
  const sections = paper.sections.map((s) => ({
    id: s.id,
    title: s.title,
    instructions: s.instructions,
    items: s.items.map((it): ReviewItem => {
      const q = qById.get(it.questionId);
      const pkgItem = viewByKey.get(it.key);
      const r = rByKey.get(it.key) ?? null;
      if (!q) {
        return {
          key: it.key,
          n: 0,
          questionId: it.questionId,
          type: null,
          typeLabel: "Removed question",
          grading: null,
          prompt: "This question was deleted after the paper was drawn. It is left out of the score.",
          view: null,
          media: null,
          points: it.points,
          answerKey: [],
          explanation: null,
          rubric: null,
          response: null,
          earned: null,
          verdict: "removed",
        };
      }
      n++;
      const def = questionType(q.type);
      const answered = isResponseAnswered(q.type, r?.answerJson);
      let earned: number | null = r?.manualPoints ?? r?.autoPoints ?? null;
      if (earned === null && def.grading === "auto") {
        const g = gradeQuestion(q, r?.answerJson);
        earned = g.fraction === null ? null : g.fraction * it.points;
      }
      if (earned === null && !answered) earned = 0;
      let verdict: ItemVerdict;
      if (!answered) verdict = "unanswered";
      else if (earned === null || (def.grading !== "auto" && r?.manualPoints == null)) verdict = "needs_marking";
      else if (earned >= it.points - 1e-9) verdict = "correct";
      else if (earned <= 0) verdict = "incorrect";
      else verdict = "partial";
      return {
        key: it.key,
        n,
        questionId: q.id,
        type: q.type,
        typeLabel: def.label,
        grading: def.grading,
        prompt: q.prompt,
        view: pkgItem?.view ?? null,
        media: pkgItem?.media ?? null,
        points: it.points,
        answerKey: answerKeyLines(q),
        explanation: q.explanation,
        rubric: q.type === "ESSAY" ? parseRubric(q.rubricJson) : null,
        response: r
          ? {
              id: r.id,
              answer: r.answerJson,
              flagged: r.flagged,
              timeSpentSec: r.timeSpentSec,
              autoPoints: r.autoPoints,
              manualPoints: r.manualPoints,
              feedback: r.feedback,
              detail: r.detailJson,
              aiSuggestion: parseAiSuggestion(r.aiSuggestionJson),
              markedAt: r.markedAt?.toISOString() ?? null,
              markedBy: r.markedById ? actors.get(r.markedById) ?? "Staff" : null,
              file: q.type === "FILE_UPLOAD" || q.type === "AUDIO_RESPONSE" ? uploadedAnswer(examId, r.id, r.answerJson, tenantId) : null,
            }
          : null,
        earned: earned === null ? null : Math.round(earned * 100) / 100,
        verdict,
      };
    }),
  }));

  const sittingPausedAt = attempt.candidate.sitting?.pausedAt ?? null;
  const open = attempt.status === "IN_PROGRESS" || attempt.status === "PAUSED" || attempt.status === "LOCKED";
  return {
    exam: attempt.exam,
    candidate: {
      id: attempt.candidate.id,
      fullName: attempt.candidate.fullName,
      candidateNo: attempt.candidate.candidateNo,
      regNumber: attempt.candidate.regNumber,
      email: attempt.candidate.email,
      extraTimePct: attempt.candidate.extraTimePct,
      hasAccount: !!attempt.candidate.clientId,
      sitting: attempt.candidate.sitting
        ? { id: attempt.candidate.sitting.id, name: attempt.candidate.sitting.name, venue: attempt.candidate.sitting.venue }
        : null,
    },
    attempt: {
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      open,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      submitReason: attempt.submitReason,
      remainingMs: open ? remainingMs(attempt, new Date(), sittingPausedAt) : 0,
      pausedAt: attempt.pausedAt?.toISOString() ?? null,
      lockedAt: attempt.lockedAt?.toISOString() ?? null,
      extraSec: attempt.extraSec,
      ip: attempt.ip,
      userAgent: attempt.userAgent,
      deviceBound: !!attempt.deviceToken,
      sebVerified: attempt.sebVerified,
      lastHeartbeatAt: attempt.lastHeartbeatAt?.toISOString() ?? null,
      offlineSubmitted: attempt.offlineSubmitted,
      violationCount: attempt.violationCount,
      answeredCount: attempt.answeredCount,
      scorePoints: attempt.scorePoints,
      maxPoints: attempt.maxPoints ?? paper.totalPoints,
      scorePercent: attempt.scorePercent,
      passed: attempt.passed,
      grade: attempt.grade,
      gradingStatus: attempt.gradingStatus,
      gradedAt: attempt.gradedAt?.toISOString() ?? null,
      releasedAt: attempt.releasedAt?.toISOString() ?? null,
      sectionScores: (attempt.sectionScoresJson ?? null) as Record<string, { earned: number; max: number }> | null,
    },
    sections,
    events: attempt.events.map((e) => ({
      id: e.id,
      type: e.type,
      severity: e.severity,
      at: e.createdAt.toISOString(),
      clientAt: e.clientAt?.toISOString() ?? null,
      actor: e.actorId ? actors.get(e.actorId) ?? "Staff" : null,
      detail: e.detailJson,
    })),
  };
}
