import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { generateStructured } from "./run";
import type { ImportedQuestion } from "../assessments/import-formats";

/**
 * The AI question generator for question banks. The model answers in one flat,
 * forgiving transport shape (easy for any model to fill); this module turns
 * each item into the registry's stored shape. The caller validates every
 * result with the registry and the author accepts or rejects each one.
 *
 * Relative imports only, like the other lib/ai modules.
 */

export const GENERATABLE_TYPES = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "NUMERIC",
  "FILL_BLANKS",
  "MATCHING",
  "ORDERING",
  "ESSAY",
] as const;
export type GeneratableType = (typeof GENERATABLE_TYPES)[number];

const transportItem = z.object({
  type: z.enum(GENERATABLE_TYPES),
  prompt: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  /** Choice types: the options. ORDERING: the items in the CORRECT order. */
  options: z.array(z.string()).default([]),
  /** Choice types: zero-based indexes of the correct options. */
  correct: z.array(z.number().int()).default([]),
  /** SHORT_ANSWER: accepted answers. FILL_BLANKS: one accepted answer per blank, in order. */
  accepted: z.array(z.string()).default([]),
  /** NUMERIC only. */
  numericValue: z.number().nullable().default(null),
  numericTolerance: z.number().nullable().default(null),
  numericUnit: z.string().nullable().default(null),
  /** MATCHING only: pairs, same length, left[i] matches right[i]. */
  left: z.array(z.string()).default([]),
  right: z.array(z.string()).default([]),
  /** ESSAY only: what a full-marks answer must do, one criterion each. */
  rubricCriteria: z.array(z.string()).default([]),
  modelAnswer: z.string().nullable().default(null),
  explanation: z.string().default(""),
});

export const questionBatchSchema = z.object({ questions: z.array(transportItem) });
type TransportItem = z.infer<typeof transportItem>;

export type GenerateBrief = {
  /** Either a topic description, or source text the questions must come from. */
  topic: string | null;
  sourceText: string | null;
  sourceLabel: string | null;
  count: number;
  types: GeneratableType[];
  difficulty: "EASY" | "MEDIUM" | "HARD" | "MIXED";
  level: string | null;
  audience: string | null;
  instructions: string | null;
};

const TYPE_RULES: Record<GeneratableType, string> = {
  SINGLE_CHOICE: "options: 4 options; correct: [index of the one correct option].",
  MULTIPLE_CHOICE: 'options: 4-6 options; correct: indexes of ALL correct options (2 or more). Prompt says "Select all that apply".',
  TRUE_FALSE: 'options: ["True","False"]; correct: [0] if true, [1] if false. Prompt is a statement.',
  SHORT_ANSWER: "accepted: 1-4 short accepted answers (a word or short phrase, with common variants).",
  NUMERIC: "numericValue: the answer; numericTolerance: allowed ± error (0 if exact); numericUnit: unit or null.",
  FILL_BLANKS:
    "prompt contains the gaps written as [[1]], [[2]] … (1 to 4 gaps); accepted: the correct word for each gap in order.",
  MATCHING: "left and right: 3-6 pairs, left[i] matches right[i].",
  ORDERING: "options: 3-7 items written in the CORRECT order (they are shuffled for candidates).",
  ESSAY: "rubricCriteria: 2-4 criteria a full answer must meet; modelAnswer: a short exemplary answer.",
};

const MAX_SOURCE = 24_000;

export function generatePrompt(b: GenerateBrief): string {
  const source = b.sourceText
    ? `Write the questions ONLY from this source material${b.sourceLabel ? ` (${b.sourceLabel})` : ""}:\n<<<SOURCE\n${b.sourceText.slice(0, MAX_SOURCE)}\nSOURCE>>>`
    : `Topic: ${b.topic}`;
  return `Write exactly ${b.count} questions for a question bank.

${source}

${b.audience ? `Candidates: ${b.audience}\n` : ""}Difficulty: ${b.difficulty === "MIXED" ? "a spread — about a third easy, half medium, the rest hard" : b.difficulty.toLowerCase()}
${b.level ? `Cognitive level: ${b.level}\n` : ""}Question types to use (mix them, roughly evenly): ${b.types.join(", ")}
${b.instructions ? `Author's extra instructions: ${b.instructions}\n` : ""}
Field rules per type (leave every other field empty / null):
${b.types.map((t) => `- ${t}: ${TYPE_RULES[t]}`).join("\n")}

Every question: set difficulty, and a short explanation of the correct answer.`;
}

function toImported(item: TransportItem): ImportedQuestion | null {
  const base = {
    prompt: item.prompt.trim(),
    difficulty: item.difficulty,
    explanation: item.explanation.trim() || null,
    points: item.type === "ESSAY" ? 5 : 1,
  };
  if (!base.prompt) return null;
  switch (item.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
      return { ...base, type: item.type, options: item.options, answer: [...new Set(item.correct)].sort((a, b) => a - b), partialCredit: item.type === "MULTIPLE_CHOICE" };
    case "TRUE_FALSE":
      return { ...base, type: item.type, options: ["True", "False"], answer: [item.correct[0] === 1 ? 1 : 0] };
    case "SHORT_ANSWER":
      return { ...base, type: item.type, options: { caseSensitive: false, mode: "exact", maxLength: 300 }, answer: item.accepted };
    case "NUMERIC":
      if (item.numericValue === null) return null;
      return {
        ...base,
        type: item.type,
        options: { unit: item.numericUnit, decimals: null },
        answer: { value: item.numericValue, tolerance: Math.abs(item.numericTolerance ?? 0), mode: "abs" },
      };
    case "FILL_BLANKS": {
      const ids = [...item.prompt.matchAll(/\[\[([a-zA-Z0-9_-]{1,12})\]\]/g)].map((m) => m[1]);
      return {
        ...base,
        type: item.type,
        options: { blanks: ids.map((id) => ({ id, choices: null })), caseSensitive: false },
        answer: Object.fromEntries(ids.map((id, i) => [id, item.accepted[i] ? [item.accepted[i]] : []])),
        partialCredit: true,
      };
    }
    case "MATCHING":
      return {
        ...base,
        type: item.type,
        options: { left: item.left, right: item.right, shuffleLeft: false },
        answer: item.left.map((_, i) => i),
        partialCredit: true,
      };
    case "ORDERING":
      return { ...base, type: item.type, options: { items: item.options }, answer: {}, partialCredit: true };
    case "ESSAY":
      return {
        ...base,
        type: item.type,
        rubric: {
          criteria: (item.rubricCriteria.length ? item.rubricCriteria : ["Answers the question fully and accurately"])
            .slice(0, 8)
            .map((label, i) => ({ id: `c_${i + 1}`, label: label.slice(0, 120), description: "", weight: 1 })),
          modelAnswer: item.modelAnswer,
          minWords: null,
          maxWords: null,
        },
      };
  }
}

export async function generateQuestions(agent: Agent, brief: GenerateBrief): Promise<ImportedQuestion[]> {
  const raw = await generateStructured(agent, generatePrompt(brief), {
    schema: questionBatchSchema,
    maxOutputTokens: Math.min(16_000, 1_200 + brief.count * 450),
    timeoutMs: 150_000,
    maxRetries: 1,
  });
  return raw.questions.map(toImported).filter((q): q is ImportedQuestion => q !== null);
}
