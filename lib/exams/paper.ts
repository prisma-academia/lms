import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { candidateView, hashSeed, seededRng, shuffle } from "@/lib/assessments/types";
import { parseRubric } from "@/lib/schemas/essay-grading";
import { mediaSchema } from "@/lib/assessments/question-io";
import { parsePools, type PoolRule } from "@/lib/exams/settings";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * Drawing and serving an exam paper.
 *
 * A paper is fixed when the candidate starts: which questions (random pools
 * are drawn here), in what order, worth how much. It is stored on the attempt
 * (`paperJson`) and never contains an answer key. Option order is not stored:
 * it is derived from the attempt seed and the question id every time, so it
 * is the same on every device and every reload.
 */

export const paperSchema = z.object({
  version: z.literal(1),
  shuffleOptions: z.boolean(),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      instructions: z.string().nullable(),
      timeLimitMin: z.number().int().nullable(),
      items: z.array(z.object({ key: z.string(), questionId: z.string(), points: z.number() })),
    })
  ),
  totalPoints: z.number(),
});
export type Paper = z.infer<typeof paperSchema>;

export function parsePaper(json: unknown): Paper {
  return paperSchema.parse(json);
}

export async function loadExamForPaper(examId: string) {
  return prisma.exam.findFirst({
    where: { id: examId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" }, include: { question: { select: { id: true, points: true } } } } },
      },
    },
  });
}

type ExamForPaper = NonNullable<Awaited<ReturnType<typeof loadExamForPaper>>>;

/** Questions a pool rule can draw from, in a stable order. */
export async function poolCandidates(rule: PoolRule, exclude: Set<string>) {
  const rows = await prisma.question.findMany({
    where: {
      bankId: rule.bankId,
      ...(rule.difficulty ? { difficulty: rule.difficulty } : {}),
      ...(rule.types.length ? { type: { in: rule.types as QuestionTypeValue[] } } : {}),
      ...(rule.tagIds.length ? { tags: { some: { tagId: { in: rule.tagIds } } } } : {}),
    },
    select: { id: true, points: true },
    orderBy: { id: "asc" },
  });
  return rows.filter((r) => !exclude.has(r.id));
}

/** How many questions each pool rule can actually supply (for the builder's warnings). */
export async function poolAvailability(rules: PoolRule[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of rules) out[r.id] = (await poolCandidates(r, new Set())).length;
  return out;
}

export class PaperError extends Error {}

/** Draw the paper for one attempt. Deterministic for a given seed and exam state. */
export async function buildPaper(exam: ExamForPaper, seed: number): Promise<Paper> {
  const rng = seededRng(seed);
  const used = new Set<string>();
  // Fixed questions are reserved first so a pool never repeats one.
  for (const s of exam.sections) for (const it of s.items) used.add(it.questionId);

  const sections: Paper["sections"] = [];
  for (const s of exam.sections) {
    let items = s.items.map((it) => ({
      key: it.questionId,
      questionId: it.questionId,
      points: it.points ?? it.question.points,
    }));
    for (const rule of parsePools(s.poolsJson)) {
      const pool = await poolCandidates(rule, used);
      if (pool.length < rule.count) {
        throw new PaperError(`Section "${s.title}" needs ${rule.count} questions from a pool that has ${pool.length}.`);
      }
      const drawn = shuffle(pool, rng).slice(0, rule.count);
      drawn.forEach((q) => used.add(q.id));
      items.push(...drawn.map((q) => ({ key: q.id, questionId: q.id, points: rule.points ?? q.points })));
    }
    if (s.shuffle && exam.shuffleQuestions) items = shuffle(items, rng);
    sections.push({ id: s.id, title: s.title, instructions: s.instructions, timeLimitMin: s.timeLimitMin, items });
  }
  const totalPoints = sections.reduce((n, s) => n + s.items.reduce((m, it) => m + it.points, 0), 0);
  if (totalPoints === 0 && sections.every((s) => s.items.length === 0)) throw new PaperError("The exam has no questions.");
  return { version: 1, shuffleOptions: exam.shuffleOptions, sections, totalPoints };
}

/* ───────────────────────────── the candidate package ───────────────────────────── */

export type PackageItem = {
  key: string;
  n: number;
  sectionId: string;
  type: QuestionTypeValue;
  prompt: string;
  view: unknown;
  media: z.infer<typeof mediaSchema> | null;
  points: number;
  groupId: string | null;
  timeLimitSec: number | null;
};

export type ExamPackage = {
  sections: { id: string; title: string; instructions: string | null; timeLimitMin: number | null; itemKeys: string[] }[];
  items: PackageItem[];
  groups: { id: string; title: string | null; stimulus: string; media: z.infer<typeof mediaSchema> | null }[];
  totalPoints: number;
  /** Media URLs the exam window caches for offline use. */
  assets: string[];
};

/**
 * Everything the exam window needs to run with no network: every question in
 * its candidate-safe form, passages and the media list. Never an answer key,
 * rubric or explanation.
 */
export async function candidatePackage(paper: Paper, seed: number): Promise<ExamPackage> {
  const ids = paper.sections.flatMap((s) => s.items.map((i) => i.questionId));
  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      type: true,
      prompt: true,
      optionsJson: true,
      answerJson: true,
      rubricJson: true,
      mediaJson: true,
      groupId: true,
      timeLimitSec: true,
      group: { select: { id: true, title: true, stimulusHtml: true, mediaJson: true } },
    },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const items: PackageItem[] = [];
  const groups = new Map<string, ExamPackage["groups"][number]>();
  const assets = new Set<string>();
  let n = 0;
  for (const s of paper.sections) {
    for (const it of s.items) {
      const q = byId.get(it.questionId);
      if (!q) continue; // Deleted since the paper was drawn; graded as unanswerable (excluded).
      n++;
      let view = candidateView(q, paper.shuffleOptions ? hashSeed(seed) : null) as Record<string, unknown>;
      if (q.type === "ESSAY") {
        const rubric = parseRubric(q.rubricJson);
        view = { ...view, minWords: rubric?.minWords ?? null, maxWords: rubric?.maxWords ?? null };
      }
      if (q.type === "HOTSPOT" && typeof view.imageUrl === "string") assets.add(view.imageUrl);
      const media = mediaSchema.safeParse(q.mediaJson);
      if (media.success) assets.add(media.data.url);
      if (q.group) {
        const gm = mediaSchema.safeParse(q.group.mediaJson);
        if (gm.success) assets.add(gm.data.url);
        groups.set(q.group.id, { id: q.group.id, title: q.group.title, stimulus: q.group.stimulusHtml, media: gm.success ? gm.data : null });
      }
      items.push({
        key: it.key,
        n,
        sectionId: s.id,
        type: q.type,
        prompt: q.prompt,
        view,
        media: media.success ? media.data : null,
        points: it.points,
        groupId: q.groupId,
        timeLimitSec: q.timeLimitSec,
      });
    }
  }
  return {
    sections: paper.sections.map((s) => ({
      id: s.id,
      title: s.title,
      instructions: s.instructions,
      timeLimitMin: s.timeLimitMin,
      itemKeys: s.items.filter((i) => byId.has(i.questionId)).map((i) => i.key),
    })),
    items,
    groups: [...groups.values()],
    totalPoints: paper.totalPoints,
    assets: [...assets],
  };
}
