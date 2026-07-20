import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  courseBuilderInputSchema,
  courseOutlineSchema,
  courseTemplateSchema,
  generatedCourseSchema,
  generatedGroupSchema,
  type CourseBuilderInput,
  type CourseOutline,
  type GeneratedCourse,
  type GeneratedGroup,
} from '../../../lib/schemas/course-builder';

function describeRequest(input: CourseBuilderInput): string {
  const lines = [
    `Topic: ${input.topic}`,
    input.audience ? `Audience: ${input.audience}` : null,
    input.structureHints ? `Structure hints: ${input.structureHints}` : null,
    input.allowPlaceholders
      ? 'Placeholders: VIDEO_URL/FILE placeholder lessons are allowed (title + placeholderNote only).'
      : 'Placeholders: do NOT generate VIDEO_URL or FILE lessons. Use TEXT, HTML and QUIZ only.',
  ].filter(Boolean);
  if (input.mode === 'adapt-json' && input.sourceJson) {
    lines.push(
      'Task mode: ADAPT the following JSON (a course export, syllabus dump, or partial structure — any shape) into a course. Preserve its structure, titles and content wherever present; map its content into the available lesson types; only invent what is genuinely missing.',
      `Source JSON:\n${input.sourceJson}`
    );
  } else if (input.sourceMaterial) {
    lines.push(`Source material to base the course on:\n${input.sourceMaterial}`);
  }
  return lines.join('\n\n');
}

/** Run tasks with a small concurrency cap to respect provider rate limits. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const outlineStepOutputSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema.nullable(),
  /** Set when the source JSON already matches the course template — no AI needed. */
  fastPathCourse: generatedCourseSchema.nullable(),
});

const generateOutline = createStep({
  id: 'generate-outline',
  description: 'Generates the course outline (groups + lesson titles/types/synopses) from the request',
  inputSchema: courseBuilderInputSchema,
  outputSchema: outlineStepOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const input = inputData;

    // Fast path: an exact course-template JSON import needs no AI at all.
    if (input.mode === 'adapt-json' && input.sourceJson) {
      try {
        const parsed = courseTemplateSchema.safeParse(JSON.parse(input.sourceJson));
        if (parsed.success) {
          return {
            input,
            outline: null,
            fastPathCourse: { courseSummary: parsed.data.courseSummary, groups: parsed.data.groups },
          };
        }
      } catch {
        // Not valid JSON at all — fall through to AI adaptation.
      }
    }

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) throw new Error('Course builder agent not found');

    const prompt = `Design the outline for a course.

${describeRequest(input)}

Produce only the outline: lesson groups (modules) in teaching order, and for each lesson its title,
contentType, a 1-3 sentence synopsis of what it must cover, and an estimated durationMin.
Do not write the lesson content yet.`;

    const result = await agent.generate([{ role: 'user', content: prompt }], {
      structuredOutput: { schema: courseOutlineSchema, errorStrategy: 'strict' },
    });
    if (!result.object) throw new Error('Outline generation returned no structured output');

    return { input, outline: courseOutlineSchema.parse(result.object), fastPathCourse: null };
  },
});

const generateLessonContent = createStep({
  id: 'generate-lesson-content',
  description: 'Generates full lesson content (text, HTML, quizzes) for each group in the outline',
  inputSchema: outlineStepOutputSchema,
  outputSchema: z.object({ course: generatedCourseSchema }),
  execute: async ({ inputData, mastra }) => {
    const { input, outline, fastPathCourse } = inputData;

    if (fastPathCourse) {
      return { course: generatedCourseSchema.parse(fastPathCourse) };
    }
    if (!outline) throw new Error('Outline not found');

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) throw new Error('Course builder agent not found');

    const outlineSummary = (o: CourseOutline) =>
      o.groups
        .map(
          (g, i) =>
            `${i + 1}. ${g.title}\n${g.lessons
              .map((l) => `   - [${l.contentType}] ${l.title}`)
              .join('\n')}`
        )
        .join('\n');

    const groups = await mapWithConcurrency(outline.groups, 2, async (group): Promise<GeneratedGroup> => {
      const prompt = `Write the full content for ONE module of a course.

${describeRequest(input)}

Full course outline (for context — write content ONLY for the module below):
${outlineSummary(outline)}

Module to write: "${group.title}"
Lessons to produce, in order:
${group.lessons
  .map(
    (l) =>
      `- [${l.contentType}] ${l.title}${l.durationMin ? ` (~${l.durationMin} min)` : ''}\n  Brief: ${l.synopsis}`
  )
  .join('\n')}

Keep the same lesson order, titles and content types. Fill in body (TEXT), html (HTML),
or quiz (QUIZ) as appropriate; VIDEO_URL/FILE lessons get only a placeholderNote.`;

      const result = await agent.generate([{ role: 'user', content: prompt }], {
        structuredOutput: { schema: generatedGroupSchema, errorStrategy: 'strict' },
      });
      if (!result.object) throw new Error(`Content generation failed for module "${group.title}"`);
      return generatedGroupSchema.parse(result.object);
    });

    const course: GeneratedCourse = generatedCourseSchema.parse({
      courseSummary: outline.courseSummary,
      groups,
    });
    return { course };
  },
});

const courseBuilderWorkflow = createWorkflow({
  id: 'course-builder-workflow',
  inputSchema: courseBuilderInputSchema,
  outputSchema: z.object({ course: generatedCourseSchema }),
})
  .then(generateOutline)
  .then(generateLessonContent);

courseBuilderWorkflow.commit();

export { courseBuilderWorkflow };
