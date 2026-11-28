import { prisma } from "@/lib/db/client";
import { gradeQuestion, parseResponse, questionType } from "@/lib/assessments/types";
import { parsePaper, type Paper } from "@/lib/exams/paper";
import { parseGradeBands } from "@/lib/exams/settings";
import { examOr404, FINISHED_STATUSES } from "@/lib/exams/ops";
import {
  computeExamAnalytics,
  isChoiceType,
  type AnalyticsAttemptInput,
  type AnalyticsItemInput,
  type ExamAnalytics,
} from "@/lib/exams/analytics";

/**
 * Turning an exam's attempts into the results page (and its CSV): one row per
 * attempt, plus the analytics over every finished, scored attempt.
 */

export type ResultRow = {
  attemptId: string;
  candidateId: string;
  candidateNo: string;
  fullName: string;
  regNumber: string | null;
  email: string | null;
  sitting: string | null;
  attemptNo: number;
  status: string;
  submitReason: string | null;
  startedAt: string;
  submittedAt: string | null;
  minutes: number | null;
  scorePoints: number | null;
  maxPoints: number | null;
  scorePercent: number | null;
  grade: string | null;
  passed: boolean | null;
  gradingStatus: string | null;
  violations: number;
  releasedAt: string | null;
  sectionScores: Record<string, { earned: number; max: number }>;
};

function safePaper(json: unknown): Paper | null {
  try {
    return parsePaper(json);
  } catch {
    return null;
  }
}

async function loadAttempts(examId: string, tenantId: string, withResponses: boolean) {
  return prisma.examAttempt.findMany({
    where: { examId, tenantId },
    orderBy: [{ submittedAt: "asc" }, { startedAt: "asc" }],
    select: {
      id: true,
      candidateId: true,
      attemptNo: true,
      status: true,
      submitReason: true,
      startedAt: true,
      submittedAt: true,
      scorePoints: true,
      maxPoints: true,
      scorePercent: true,
      grade: true,
      passed: true,
      gradingStatus: true,
      violationCount: true,
      releasedAt: true,
      lockedAt: true,
      offlineSubmitted: true,
      sebVerified: true,
      sectionScoresJson: true,
      paperJson: true,
      candidate: {
        select: { fullName: true, candidateNo: true, regNumber: true, email: true, sitting: { select: { name: true } } },
      },
      ...(withResponses
        ? { responses: { select: { itemKey: true, answerJson: true, autoPoints: true, manualPoints: true, timeSpentSec: true } } }
        : {}),
    },
  });
}

type LoadedAttempt = Awaited<ReturnType<typeof loadAttempts>>[number] & {
  responses?: { itemKey: string; answerJson: unknown; autoPoints: number | null; manualPoints: number | null; timeSpentSec: number }[];
};

function toRow(a: LoadedAttempt): ResultRow {
  const minutes = a.submittedAt ? Math.round(((a.submittedAt.getTime() - a.startedAt.getTime()) / 60_000) * 10) / 10 : null;
  return {
    attemptId: a.id,
    candidateId: a.candidateId,
    candidateNo: a.candidate.candidateNo,
    fullName: a.candidate.fullName,
    regNumber: a.candidate.regNumber,
    email: a.candidate.email,
    sitting: a.candidate.sitting?.name ?? null,
    attemptNo: a.attemptNo,
    status: a.status,
    submitReason: a.submitReason,
    startedAt: a.startedAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null,
    minutes,
    scorePoints: a.scorePoints,
    maxPoints: a.maxPoints,
    scorePercent: a.scorePercent,
    grade: a.grade,
    passed: a.passed,
    gradingStatus: a.gradingStatus,
    violations: a.violationCount,
    releasedAt: a.releasedAt?.toISOString() ?? null,
    sectionScores: (a.sectionScoresJson ?? {}) as Record<string, { earned: number; max: number }>,
  };
}

/** Sections in paper order, across every attempt's paper (pools can differ). */
function sectionsOf(papers: (Paper | null)[]): { id: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const p of papers) for (const s of p?.sections ?? []) if (!seen.has(s.id)) seen.set(s.id, s.title);
  return [...seen].map(([id, title]) => ({ id, title }));
}

/** Rows only: what the CSV export needs. */
export async function loadResultRows(examId: string, tenantId: string) {
  const exam = await examOr404(examId, tenantId);
  const attempts = await loadAttempts(examId, tenantId, false);
  const papers = attempts.map((a) => safePaper(a.paperJson));
  return { exam, sections: sectionsOf(papers), rows: attempts.map((a) => toRow(a)) };
}

export type ResultsPayload = {
  exam: { id: string; title: string; passMark: number; resultRelease: string; durationMin: number; status: string };
  sections: { id: string; title: string }[];
  rows: ResultRow[];
  release: { unreleasedGraded: number; unreleasedPending: number; released: number };
  /** Finished but the score is not computed yet (grading runs just after submit). */
  scoring: number;
  analytics: ExamAnalytics;
};

export async function loadResults(examId: string, tenantId: string): Promise<ResultsPayload> {
  const exam = await examOr404(examId, tenantId);
  const attempts = (await loadAttempts(examId, tenantId, true)) as LoadedAttempt[];
  const papers = attempts.map((a) => safePaper(a.paperJson));
  const sections = sectionsOf(papers);

  const finished = attempts
    .map((a, i) => ({ a, paper: papers[i] }))
    .filter((x) => (FINISHED_STATUSES as readonly string[]).includes(x.a.status));
  const scored = finished.filter((x) => x.a.scorePercent !== null && x.paper);

  const qIds = new Set<string>();
  for (const x of scored) for (const s of x.paper!.sections) for (const it of s.items) qIds.add(it.questionId);
  const [questions, unlocked] = await Promise.all([
    prisma.question.findMany({
      where: { id: { in: [...qIds] } },
      select: { id: true, type: true, prompt: true, optionsJson: true, answerJson: true, partialCredit: true },
    }),
    scored.length
      ? prisma.examEvent.findMany({
          where: { tenantId, attemptId: { in: scored.map((x) => x.a.id) }, type: "PROCTOR_UNLOCK" },
          distinct: ["attemptId"],
          select: { attemptId: true },
        })
      : Promise.resolve([] as { attemptId: string }[]),
  ]);
  const qById = new Map(questions.map((q) => [q.id, q]));
  const everUnlocked = new Set(unlocked.map((e) => e.attemptId));

  // The item list: every question that appeared on a scored paper.
  const items = new Map<string, AnalyticsItemInput>();
  for (const x of scored) {
    let n = 0;
    for (const s of x.paper!.sections) {
      for (const it of s.items) {
        const q = qById.get(it.questionId);
        if (!q) continue;
        n++;
        if (items.has(it.key)) continue;
        const choice = isChoiceType(q.type);
        const def = questionType(q.type);
        items.set(it.key, {
          key: it.key,
          questionId: q.id,
          sectionId: s.id,
          n,
          type: q.type,
          prompt: q.prompt,
          points: it.points,
          options: choice ? (def.options.parse(q.optionsJson) as string[]) : null,
          correct: choice ? (def.answer.parse(q.answerJson) as number[]) : null,
        });
      }
    }
  }

  const analyticsAttempts: AnalyticsAttemptInput[] = scored.map(({ a, paper }) => {
    const rByKey = new Map((a.responses ?? []).map((r) => [r.itemKey, r]));
    const responses: AnalyticsAttemptInput["responses"] = {};
    for (const s of paper!.sections) {
      for (const it of s.items) {
        const q = qById.get(it.questionId);
        if (!q) continue;
        const r = rByKey.get(it.key);
        const g = gradeQuestion(q, r?.answerJson);
        let earned: number | null;
        if (r?.manualPoints != null) earned = r.manualPoints;
        else if (r?.autoPoints != null) earned = r.autoPoints;
        else if (g.fraction !== null) earned = g.fraction * it.points;
        else earned = g.answered ? null : 0;
        const picks = isChoiceType(q.type) ? ((parseResponse(q.type, r?.answerJson) as number[] | undefined) ?? null) : null;
        responses[it.key] = { earned, max: it.points, answered: g.answered, picks, timeSpentSec: r?.timeSpentSec ?? 0 };
      }
    }
    return {
      id: a.id,
      label: a.candidate.fullName,
      candidateNo: a.candidate.candidateNo,
      scorePoints: a.scorePoints ?? 0,
      maxPoints: a.maxPoints ?? paper!.totalPoints,
      scorePercent: a.scorePercent ?? 0,
      passed: a.passed,
      grade: a.grade,
      graded: a.gradingStatus === "GRADED",
      durationSec: a.submittedAt ? Math.max(0, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)) : null,
      sectionScores: (a.sectionScoresJson ?? {}) as Record<string, { earned: number; max: number }>,
      violationCount: a.violationCount,
      wasLocked: !!a.lockedAt || a.submitReason === "MAX_VIOLATIONS" || everUnlocked.has(a.id),
      offlineSubmitted: a.offlineSubmitted,
      sebVerified: a.sebVerified,
      responses,
    };
  });

  const analytics = computeExamAnalytics({
    items: [...items.values()].sort((x, y) => x.n - y.n),
    sections,
    bands: parseGradeBands(exam.gradeBandsJson),
    attempts: analyticsAttempts,
  });

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      passMark: exam.passMark,
      resultRelease: exam.resultRelease,
      durationMin: exam.durationMin,
      status: exam.status,
    },
    sections,
    rows: attempts.map((a) => toRow(a)),
    release: {
      unreleasedGraded: finished.filter((x) => x.a.gradingStatus === "GRADED" && !x.a.releasedAt).length,
      unreleasedPending: finished.filter((x) => x.a.gradingStatus !== "GRADED" && !x.a.releasedAt).length,
      released: finished.filter((x) => !!x.a.releasedAt).length,
    },
    scoring: finished.length - scored.length,
    analytics,
  };
}

/* ───────────────────────────── CSV ───────────────────────────── */

/** One CSV cell. Leading = + - @ are neutralised so a spreadsheet never runs a name as a formula. */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function resultsCsv(sections: { id: string; title: string }[], rows: ResultRow[]): string {
  const header = [
    "candidateNo",
    "fullName",
    "regNumber",
    "email",
    "sitting",
    "attempt",
    "status",
    "submitReason",
    "startedAt",
    "submittedAt",
    "minutesTaken",
    "score",
    "max",
    "percent",
    "grade",
    "passed",
    "violations",
    "released",
    ...sections.map((s) => `section: ${s.title}`),
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.candidateNo,
        r.fullName,
        r.regNumber,
        r.email,
        r.sitting,
        r.attemptNo,
        r.status,
        r.submitReason,
        r.startedAt,
        r.submittedAt,
        r.minutes,
        r.scorePoints,
        r.maxPoints,
        r.scorePercent,
        r.grade,
        r.passed === null ? "" : r.passed ? "yes" : "no",
        r.violations,
        r.releasedAt ? "yes" : "no",
        ...sections.map((s) => {
          const sc = r.sectionScores[s.id];
          return sc ? `${sc.earned}/${sc.max}` : "";
        }),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  // BOM so Excel opens UTF-8 names correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
