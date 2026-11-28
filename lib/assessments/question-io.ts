import { createHash } from "node:crypto";
import { z } from "zod";
import { questionDifficultySchema, questionTypeSchema, type QuestionTypeValue } from "@/lib/schemas/question";
import { essayRubricSchema, parseRubric, type EssayRubric } from "@/lib/schemas/essay-grading";
import { validateAuthoring } from "@/lib/assessments/types";
import { DomainError } from "@/lib/api/errors";

/**
 * What a question write (create, patch, import) may carry, and how it becomes
 * columns. One place, so the bank editor, CSV/Aiken/GIFT import and the AI
 * generator all store questions the same way.
 */

export const mediaSchema = z.object({
  kind: z.enum(["image", "audio", "video"]),
  url: z.string().url().max(2000).refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "Media must be an https:// link."),
  maxPlays: z.number().int().min(1).max(10).nullable().optional(),
  alt: z.string().max(300).nullable().optional(),
});

export const questionWriteSchema = z.object({
  type: questionTypeSchema,
  prompt: z.string().min(1).max(5000),
  /** Shape depends on the type; checked by the registry. */
  options: z.unknown().optional(),
  answer: z.unknown().optional(),
  rubric: essayRubricSchema.nullable().optional(),
  points: z.number().int().min(0).max(1000).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
  hint: z.string().max(500).nullable().optional(),
  difficulty: questionDifficultySchema.nullable().optional(),
  explanation: z.string().max(4000).nullable().optional(),
  negativePoints: z.number().min(0).max(1000).nullable().optional(),
  partialCredit: z.boolean().optional(),
  media: mediaSchema.nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export type QuestionWrite = z.infer<typeof questionWriteSchema>;

/** Normalised prompt fingerprint for duplicate detection inside a bank. */
export function promptHashOf(prompt: string): string {
  const norm = prompt.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

/**
 * Validate a full question and turn it into column values. Throws a 400
 * DomainError naming what is wrong, in words an author can act on.
 */
export function questionColumns(input: {
  type: QuestionTypeValue;
  prompt: string;
  options: unknown;
  answer: unknown;
  rubric: EssayRubric | null | undefined;
}) {
  if (input.type === "ESSAY") {
    if (!input.rubric) throw new DomainError(400, "rubric_required", "Essay questions need a rubric.");
    return {
      type: input.type,
      prompt: input.prompt,
      optionsJson: [] as object,
      answerJson: [] as object,
      rubricJson: input.rubric as object,
      promptHash: promptHashOf(input.prompt),
    };
  }
  if (input.rubric) throw new DomainError(400, "rubric_not_allowed", "Only essay questions take a rubric.");
  const checked = validateAuthoring(input.type, {
    prompt: input.prompt,
    options: input.options ?? [],
    answer: input.answer ?? [],
  });
  if (!checked.ok) throw new DomainError(400, "invalid_question", checked.message);
  return {
    type: input.type,
    prompt: input.prompt,
    optionsJson: (checked.options ?? []) as object,
    answerJson: (checked.answer ?? []) as object,
    rubricJson: null,
    promptHash: promptHashOf(input.prompt),
  };
}

/** The editor's view of a stored question. */
export type StoredQuestion = {
  id: string;
  type: QuestionTypeValue;
  prompt: string;
  optionsJson: unknown;
  answerJson: unknown;
  rubricJson: unknown;
  points: number;
  hint: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | null;
  explanation: string | null;
  negativePoints: number | null;
  partialCredit: boolean;
  mediaJson: unknown;
  groupId: string | null;
  tags?: { tagId: string }[];
};

export function toEditorQuestion(q: StoredQuestion) {
  const media = mediaSchema.safeParse(q.mediaJson);
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    options: q.optionsJson,
    answer: q.answerJson,
    rubric: parseRubric(q.rubricJson),
    points: q.points,
    tagIds: (q.tags ?? []).map((t) => t.tagId),
    hint: q.hint,
    difficulty: q.difficulty,
    explanation: q.explanation,
    negativePoints: q.negativePoints,
    partialCredit: q.partialCredit,
    media: media.success
      ? { kind: media.data.kind, url: media.data.url, maxPlays: media.data.maxPlays ?? null, alt: media.data.alt ?? null }
      : null,
    groupId: q.groupId,
  };
}

/** A passage: a shared stimulus several questions in a bank are asked about. */
export const passageWriteSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  /** Plain text with $maths$; rendered as text, never as HTML. */
  stimulus: z.string().min(1).max(20000),
  media: mediaSchema.nullable().optional(),
});
