import { z } from "zod";

/**
 * Shared contract for the AI course builder and the course JSON template.
 *
 * The same document shape is:
 *  - produced by the Mastra course-builder workflow (AI generation / JSON adaptation),
 *  - produced by the course export route,
 *  - accepted by the course import flow in the builder tab,
 *  - consumed by the builder apply route.
 *
 * This file must stay dependency-free apart from zod: the Next.js app imports it
 * via `@/lib/schemas/course-builder` and Mastra code imports it RELATIVELY
 * (e.g. `../../../lib/schemas/course-builder`) so `mastra dev`/`mastra build`
 * bundling never depends on tsconfig path aliases.
 */

export const lessonContentTypeSchema = z.enum(["TEXT", "HTML", "VIDEO_URL", "FILE", "QUIZ"]);

export const generatedQuestionSchema = z.object({
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]),
  prompt: z.string().min(1),
  /** Option texts. TRUE_FALSE must be exactly ["True", "False"]; empty for SHORT_ANSWER. */
  options: z.array(z.string()).default([]),
  /** Indices into `options` for choice types; ignored for SHORT_ANSWER. */
  correctOptionIndexes: z.array(z.number().int().min(0)).default([]),
  /** Accepted answers for SHORT_ANSWER (matched case-insensitively). */
  acceptedAnswers: z.array(z.string()).default([]),
  points: z.number().int().min(1).default(1),
});

export const generatedQuizSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  /** Percent 0-100 required to pass; null = no pass mark. */
  passingScore: z.number().int().min(0).max(100).nullable().default(null),
  questions: z.array(generatedQuestionSchema).min(1).max(20),
});

export const generatedLessonSchema = z.object({
  title: z.string().min(1).max(200),
  contentType: lessonContentTypeSchema,
  /** Plain text / light markdown body for TEXT lessons. */
  body: z.string().nullable().default(null),
  /** HTML source for HTML lessons (semantic tags only; sanitized on write and render). */
  html: z.string().nullable().default(null),
  /** Full quiz definition for QUIZ lessons. */
  quiz: generatedQuizSchema.nullable().default(null),
  durationMin: z.number().int().min(1).nullable().default(null),
  /** For VIDEO_URL/FILE placeholders: what the admin should attach later. Never a real URL/key. */
  placeholderNote: z.string().nullable().default(null),
});

export const generatedGroupSchema = z.object({
  title: z.string().min(1).max(200),
  lessons: z.array(generatedLessonSchema).min(1),
});

/** Body of a generated/imported course structure (template minus the envelope). */
export const generatedCourseSchema = z.object({
  courseSummary: z.string().nullable().default(null),
  groups: z.array(generatedGroupSchema).min(1).max(15),
});

/**
 * The versioned course JSON template — export/import envelope.
 * Additive fields stay version 1; breaking shape changes bump `version`
 * (the import path then keeps a small upgrader per old version).
 */
export const courseTemplateSchema = generatedCourseSchema.extend({
  format: z.literal("lms-course"),
  version: z.literal(1),
  /** Course-level metadata: used when importing as a new course; ignored when applying into an existing one. */
  course: z
    .object({
      title: z.string().min(1),
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .nullable()
        .default(null),
      description: z.string().nullable().default(null),
      priceCents: z.number().int().min(0).nullable().default(null),
      currency: z.string().length(3).nullable().default(null),
    })
    .nullable()
    .default(null),
});

/** Step-1 outline: structure and lesson synopses only, no full content yet. */
export const courseOutlineSchema = z.object({
  courseSummary: z.string().nullable().default(null),
  groups: z
    .array(
      z.object({
        title: z.string().min(1),
        lessons: z
          .array(
            z.object({
              title: z.string().min(1),
              contentType: lessonContentTypeSchema,
              /** One-to-three-sentence brief of what this lesson should cover. */
              synopsis: z.string(),
              durationMin: z.number().int().min(1).nullable().default(null),
            })
          )
          .min(1),
      })
    )
    .min(1)
    .max(15),
});

export const courseBuilderInputSchema = z.object({
  mode: z.enum(["prompt", "adapt-json"]).default("prompt"),
  /** Topic / subject of the course (prompt mode). */
  topic: z.string().min(1),
  audience: z.string().nullable().default(null),
  structureHints: z.string().nullable().default(null),
  /** Pasted source material (syllabus, notes, article text…). */
  sourceMaterial: z.string().max(60_000).nullable().default(null),
  /** Raw JSON to adapt (adapt-json mode): a foreign export, partial template, etc. */
  sourceJson: z.string().max(200_000).nullable().default(null),
  /** Allow VIDEO_URL/FILE placeholder lessons (no assets are ever invented). */
  allowPlaceholders: z.boolean().default(false),
});

/** Input for single-lesson AI generation from the lesson add/edit form.
    Works for lessons that don't exist yet — the target is described by the body. */
export const lessonGenerateInputSchema = z.object({
  title: z.string().min(1).max(200),
  contentType: z.enum(["TEXT", "HTML"]),
  /** Optional admin guidance for what the lesson should emphasize. */
  instructions: z.string().max(4_000).nullable().default(null),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>;
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;
export type GeneratedGroup = z.infer<typeof generatedGroupSchema>;
export type GeneratedCourse = z.infer<typeof generatedCourseSchema>;
export type CourseTemplate = z.infer<typeof courseTemplateSchema>;
export type CourseOutline = z.infer<typeof courseOutlineSchema>;
export type CourseBuilderInput = z.infer<typeof courseBuilderInputSchema>;
export type LessonGenerateInput = z.infer<typeof lessonGenerateInputSchema>;
