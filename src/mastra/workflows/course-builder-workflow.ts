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
    input.allowEssays
      ? 'Essays: ESSAY questions are allowed. Each needs 2-4 objectively checkable weighted rubric criteria and a concise model answer.'
      : 'Essays: do NOT generate ESSAY questions. Use SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE and SHORT_ANSWER only.',
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

function outlineSummary(o: CourseOutline): string {
  return o.groups
    .map(
      (g, i) =>
        `${i + 1}. ${g.title}\n${g.lessons
          .map((l) => `   - [${l.contentType}] ${l.title}`)
          .join('\n')}`
    )
    .join('\n');
}

const outlineGroupSchema = courseOutlineSchema.shape.groups.element;

const outlineStepOutputSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema.nullable(),
  /** Set when the source JSON already matches the course template — no AI needed. */
  fastPathCourse: generatedCourseSchema.nullable(),
});

/** One module job for the foreach step (progress events come from Mastra). */
const moduleJobSchema = z.object({
  input: courseBuilderInputSchema,
  outline: courseOutlineSchema,
  group: outlineGroupSchema,
});

const generateOutline = createStep({
  id: 'generate-outline',
  description: 'Generates the course outline (groups + lesson titles/types/synopses) from the request',
  inputSchema: courseBuilderInputSchema,
  outputSchema: outlineStepOutputSchema,
  execute: async ({ inputData, mastra, writer }) => {
    const input = inputData;

    await writer.write({ phase: 'outline', label: 'Designing outline…' });

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

const generateModule = createStep({
  id: 'generate-module',
  description: 'Generates full lesson content for one module from the outline',
  inputSchema: moduleJobSchema,
  outputSchema: generatedGroupSchema,
  execute: async ({ inputData, mastra }) => {
    const { input, outline, group } = inputData;

    const agent = mastra?.getAgent('courseBuilderAgent');
    if (!agent) throw new Error('Course builder agent not found');

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
  },
});

const assembleCourse = createStep({
  id: 'assemble-course',
  description: 'Assembles generated modules into a course, or returns the fast-path template',
  inputSchema: z.array(generatedGroupSchema),
  outputSchema: z.object({ course: generatedCourseSchema }),
  execute: async ({ inputData, getStepResult }) => {
    const outlineResult = getStepResult(generateOutline) as z.infer<typeof outlineStepOutputSchema>;

    if (outlineResult.fastPathCourse) {
      return { course: generatedCourseSchema.parse(outlineResult.fastPathCourse) };
    }

    const outline = outlineResult.outline;
    if (!outline) throw new Error('Outline not found');

    const groups = inputData as GeneratedGroup[];
    if (groups.length === 0) throw new Error('No modules were generated');

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
  .map(async ({ inputData }) => {
    const { input, outline, fastPathCourse } = inputData as z.infer<typeof outlineStepOutputSchema>;
    // Fast path: empty foreach list; assemble reads fastPathCourse from outline step.
    if (fastPathCourse) return [];
    if (!outline) throw new Error('Outline not found');
    return outline.groups.map((group) => ({ input, outline, group }));
  })
  .foreach(generateModule, { concurrency: 2 })
  .then(assembleCourse);

courseBuilderWorkflow.commit();

export { courseBuilderWorkflow };
