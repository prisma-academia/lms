import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { isResponseAnswered, questionType } from "@/lib/assessments/types";
import { parseRubric, type EssayRubric } from "@/lib/schemas/essay-grading";
import { parsePaper } from "@/lib/exams/paper";
import { FINISHED_STATUSES } from "@/lib/exams/ops";
import { parseAiSuggestion, uploadedAnswer, type AiSuggestion, type UploadedAnswer } from "@/lib/exams/review";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * The marking queue: answers in finished attempts that a person has to mark
 * (essays — with the AI's suggestion to confirm — uploads, recordings, code).
 * STAFF ONLY: carries rubrics and model answers.
 */

export type MarkingItem = {
  responseId: string;
  attemptId: string;
  questionId: string;
  type: QuestionTypeValue;
  /** NULL in blind marking. */
  fullName: string | null;
  candidateNo: string;
  maxPoints: number;
  manualPoints: number | null;
  feedback: string | null;
  markedAt: string | null;
  timeSpentSec: number;
  text: string | null;
  wordCount: number | null;
  file: UploadedAnswer | null;
  aiSuggestion: AiSuggestion | null;
  /** CODE: share of the marker's keywords found (a hint, never a mark). */
  keywordHint: { suggested: number; found: string[] } | null;
};

export type MarkingGroup = {
  questionId: string;
  type: QuestionTypeValue;
  typeLabel: string;
  prompt: string;
  points: number;
  rubric: EssayRubric | null;
  language: string | null;
  total: number;
  marked: number;
  withSuggestion: number;
};

export type MarkingQueue = {
  blind: boolean;
  groups: MarkingGroup[];
  items: MarkingItem[];
  totals: { total: number; marked: number; withSuggestion: number };
};

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Whether a question type is marked by a person (with or without an AI suggestion). */
export function isMarkedType(type: QuestionTypeValue): boolean {
  return questionType(type).grading !== "auto";
}

export async function markingQueue(
  examId: string,
  tenantId: string,
  opts: { questionId?: string | null; blind?: boolean; include?: "unmarked" | "all" } = {}
): Promise<MarkingQueue> {
  const attempts = await prisma.examAttempt.findMany({
    where: { examId, tenantId, status: { in: [...FINISHED_STATUSES] } },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true,
      paperJson: true,
      candidate: { select: { fullName: true, candidateNo: true } },
    },
  });
  const pointsByAttemptKey = new Map<string, number>();
  const ids = new Set<string>();
  for (const a of attempts) {
    try {
      for (const s of parsePaper(a.paperJson).sections) {
        for (const it of s.items) {
          pointsByAttemptKey.set(`${a.id}:${it.key}`, it.points);
          ids.add(it.questionId);
        }
      }
    } catch {
      // An unreadable paper has nothing to mark.
    }
  }
  const questions = await prisma.question.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, type: true, prompt: true, rubricJson: true, optionsJson: true },
  });
  const markable = questions.filter((q) => isMarkedType(q.type));
  const qById = new Map(markable.map((q) => [q.id, q]));
  const attemptById = new Map(attempts.map((a) => [a.id, a]));

  const responses = markable.length
    ? await prisma.examResponse.findMany({
        where: {
          tenantId,
          attemptId: { in: attempts.map((a) => a.id) },
          itemKey: { in: opts.questionId ? [opts.questionId] : markable.map((q) => q.id) },
        },
        select: {
          id: true,
          attemptId: true,
          itemKey: true,
          answerJson: true,
          manualPoints: true,
          maxPoints: true,
          feedback: true,
          markedAt: true,
          timeSpentSec: true,
          aiSuggestionJson: true,
          detailJson: true,
        },
      })
    : [];

  const all: MarkingItem[] = [];
  for (const r of responses) {
    const q = qById.get(r.itemKey);
    const a = attemptById.get(r.attemptId);
    if (!q || !a) continue;
    if (!isResponseAnswered(q.type, r.answerJson)) continue;
    const max = r.maxPoints ?? pointsByAttemptKey.get(`${a.id}:${r.itemKey}`) ?? 0;
    const text = typeof r.answerJson === "string" ? r.answerJson : null;
    const detail = r.detailJson && typeof r.detailJson === "object" ? (r.detailJson as Record<string, unknown>) : null;
    all.push({
      responseId: r.id,
      attemptId: a.id,
      questionId: q.id,
      type: q.type,
      fullName: opts.blind ? null : a.candidate.fullName,
      candidateNo: a.candidate.candidateNo,
      maxPoints: max,
      manualPoints: r.manualPoints,
      feedback: r.feedback,
      markedAt: r.markedAt?.toISOString() ?? null,
      timeSpentSec: r.timeSpentSec,
      text,
      wordCount: q.type === "ESSAY" && text !== null ? words(text) : null,
      file: q.type === "FILE_UPLOAD" || q.type === "AUDIO_RESPONSE" ? uploadedAnswer(examId, r.id, r.answerJson, tenantId) : null,
      aiSuggestion: parseAiSuggestion(r.aiSuggestionJson),
      keywordHint:
        q.type === "CODE" && detail && typeof detail.suggested === "number"
          ? { suggested: detail.suggested, found: Array.isArray(detail.found) ? detail.found.map(String) : [] }
          : null,
    });
  }

  const order = new Map(attempts.map((a, i) => [a.id, i]));
  all.sort((x, y) => (x.questionId === y.questionId ? (order.get(x.attemptId) ?? 0) - (order.get(y.attemptId) ?? 0) : x.questionId < y.questionId ? -1 : 1));

  const groups: MarkingGroup[] = markable
    .map((q) => {
      const mine = all.filter((i) => i.questionId === q.id);
      const view = (q.optionsJson ?? {}) as { language?: unknown };
      return {
        questionId: q.id,
        type: q.type,
        typeLabel: questionType(q.type).label,
        prompt: q.prompt,
        points: mine[0]?.maxPoints ?? 0,
        rubric: q.type === "ESSAY" ? parseRubric(q.rubricJson) : null,
        language: q.type === "CODE" && typeof view.language === "string" ? view.language : null,
        total: mine.length,
        marked: mine.filter((i) => i.manualPoints !== null).length,
        withSuggestion: mine.filter((i) => i.manualPoints === null && i.aiSuggestion).length,
      };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - b.marked - (a.total - a.marked) || a.prompt.localeCompare(b.prompt));

  const items = opts.include === "all" ? all : all.filter((i) => i.manualPoints === null);
  return {
    blind: !!opts.blind,
    groups,
    items,
    totals: {
      total: all.length,
      marked: all.filter((i) => i.manualPoints !== null).length,
      withSuggestion: all.filter((i) => i.manualPoints === null && i.aiSuggestion).length,
    },
  };
}

/** A response of this exam that a person may mark, with what the mark is out of. */
export async function markableResponse(examId: string, responseId: string, tenantId: string) {
  const r = await prisma.examResponse.findFirst({
    where: { id: responseId, tenantId, attempt: { examId } },
    select: {
      id: true,
      attemptId: true,
      itemKey: true,
      answerJson: true,
      manualPoints: true,
      maxPoints: true,
      feedback: true,
      aiSuggestionJson: true,
      attempt: { select: { status: true, paperJson: true } },
    },
  });
  if (!r) throw new DomainError(404, "not_found", "Answer not found.");
  if (!(FINISHED_STATUSES as readonly string[]).includes(r.attempt.status)) {
    throw new DomainError(409, "not_finished", "This attempt is still in progress. Mark it once it has been submitted.");
  }
  const q = await prisma.question.findFirst({ where: { id: r.itemKey }, select: { id: true, type: true } });
  if (!q || !isMarkedType(q.type)) throw new DomainError(409, "not_markable", "This question is marked automatically.");
  let max = r.maxPoints;
  if (max == null) {
    const paper = parsePaper(r.attempt.paperJson);
    max = paper.sections.flatMap((s) => s.items).find((i) => i.key === r.itemKey)?.points ?? 0;
  }
  return { ...r, type: q.type, max };
}

/** Points rounded to the nearest half and kept inside 0..max. */
export function clampMark(points: number, max: number): number {
  const half = Math.round(points * 2) / 2;
  return Math.min(Math.max(0, half), Math.max(0, max));
}
