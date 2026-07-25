/**
 * End-to-end check of the AI course builder's apply path.
 *
 *   npx tsx scripts/verify-course-builder.ts            # no LLM calls
 *   npx tsx scripts/verify-course-builder.ts --ai       # also runs a real generation
 *   npx tsx scripts/verify-course-builder.ts --tenant <slug>
 *
 * Everything runs against a throwaway course inside a real tenant and is
 * deleted again in `finally`, so it is safe to run against a dev database.
 */
import "dotenv/config";
import { prisma } from "../lib/db/client";
import { runWithContext } from "../lib/db/tenant-context";
import { applyGeneratedCourse } from "../lib/courses/apply-generated-course";
import {
  courseTemplateSchema,
  generatedCourseSchema,
  type CourseBuilderInput,
  type GeneratedCourse,
} from "../lib/schemas/course-builder";

const args = process.argv.slice(2);
const runAi = args.includes("--ai");
const tenantSlugArg = args[args.indexOf("--tenant") + 1];
const wantTenantSlug = args.includes("--tenant") ? tenantSlugArg : null;

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
}
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `got ${a}\n      want ${e}`);
}

/** A course template that exercises every lesson type and question type. */
const TEMPLATE = {
  format: "lms-course",
  version: 1,
  courseSummary: "Verification fixture.",
  course: null,
  groups: [
    {
      title: "Module 1 — Basics",
      lessons: [
        { title: "Welcome", contentType: "TEXT", body: "Hello there.", durationMin: 5 },
        {
          title: "Core ideas",
          contentType: "HTML",
          // The <script> must not survive the sanitiser.
          html: "<h2>Ideas</h2><p>Body text.</p><script>alert(1)</script>",
        },
        {
          title: "Check yourself",
          contentType: "QUIZ",
          quiz: {
            title: "Module 1 quiz",
            description: null,
            passingScore: 70,
            questions: [
              { type: "SINGLE_CHOICE", prompt: "Pick A", options: ["A", "B"], correctOptionIndexes: [0] },
              // Deliberately wrong options: apply must normalise these.
              { type: "TRUE_FALSE", prompt: "The sky is blue", options: ["Yes", "No"], correctOptionIndexes: [0] },
              {
                type: "MULTIPLE_CHOICE",
                prompt: "Pick A and C",
                options: ["A", "B", "C"],
                correctOptionIndexes: [0, 2],
              },
              { type: "SHORT_ANSWER", prompt: "Capital of France?", acceptedAnswers: ["Paris"] },
            ],
          },
        },
      ],
    },
    {
      title: "Module 2 — Practice",
      lessons: [
        {
          title: "Recorded walkthrough",
          contentType: "VIDEO_URL",
          placeholderNote: "Attach the screencast once it is edited.",
        },
      ],
    },
  ],
};

async function runWorkflow(input: CourseBuilderInput): Promise<GeneratedCourse> {
  const { mastra } = await import("../src/mastra");
  const workflow = mastra.getWorkflow("courseBuilderWorkflow");
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  if (result.status !== "success") {
    const detail =
      result.status === "failed" && result.error instanceof Error
        ? result.error.message
        : `status "${result.status}"`;
    throw new Error(`Workflow did not succeed: ${detail}`);
  }
  return result.result.course;
}

async function main() {
  const tenant = wantTenantSlug
    ? await prisma.tenant.findFirst({ where: { slug: wantTenantSlug }, select: { id: true, slug: true } })
    : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true } });
  if (!tenant) throw new Error("No tenant found to run against.");
  console.log(`Tenant: ${tenant.slug} (${tenant.id})\n`);

  await runWithContext({ mode: "tenant-admin", tenantId: tenant.id }, async () => {
    const stamp = Date.now();
    const course = await prisma.course.create({
      data: {
        tenantId: tenant.id,
        title: `AI builder verification ${stamp}`,
        slug: `ai-builder-verification-${stamp}`,
        status: "DRAFT",
      },
      select: { id: true, title: true },
    });
    const bankIds: string[] = [];
    const quizIds: string[] = [];

    try {
      // --- 1. Template import goes through the workflow's no-AI fast path ---
      const fromWorkflow = await runWorkflow({
        mode: "adapt-json",
        topic: "Course from imported JSON",
        audience: null,
        structureHints: null,
        sourceMaterial: null,
        sourceJson: JSON.stringify(TEMPLATE),
        allowPlaceholders: true,
      });
      eq("workflow fast path returns the template's modules", fromWorkflow.groups.length, 2);
      eq(
        "workflow fast path preserves lesson titles",
        fromWorkflow.groups[0].lessons.map((l) => l.title),
        ["Welcome", "Core ideas", "Check yourself"]
      );
      check(
        "template fixture matches the shared course template schema",
        courseTemplateSchema.safeParse(TEMPLATE).success
      );

      // --- 2. Apply it ---
      const created = await applyGeneratedCourse({
        tenantId: tenant.id,
        courseId: course.id,
        courseTitle: course.title,
        generated: fromWorkflow,
      });
      eq("apply reports what it created", created, { groups: 2, lessons: 4, quizzes: 1, questions: 4 });

      const lessons = await prisma.lesson.findMany({
        where: { courseId: course.id },
        orderBy: { sortOrder: "asc" },
        select: { title: true, sortOrder: true, contentType: true, contentJson: true, groupId: true },
      });
      eq(
        "lessons land in outline order",
        lessons.map((l) => [l.sortOrder, l.title]),
        [
          [0, "Welcome"],
          [1, "Core ideas"],
          [2, "Check yourself"],
          [3, "Recorded walkthrough"],
        ]
      );
      check("every lesson is attached to a group", lessons.every((l) => l.groupId != null));

      const html = (lessons[1].contentJson as { html?: string }).html ?? "";
      check("HTML lesson keeps its markup", html.includes("<h2>Ideas</h2>"), html);
      check("HTML lesson is sanitised on write", !html.toLowerCase().includes("<script"), html);
      eq(
        "TEXT lesson keeps its body",
        (lessons[0].contentJson as { body?: string }).body,
        "Hello there."
      );
      eq("placeholder lesson stores no content", lessons[3].contentJson, {});

      const quizId = (lessons[2].contentJson as { quizId?: string }).quizId;
      check("quiz lesson points at a quiz", typeof quizId === "string" && quizId.length > 0);
      const quiz = await prisma.quiz.findFirst({
        where: { id: quizId },
        select: {
          id: true,
          title: true,
          passingScore: true,
          questions: {
            orderBy: { sortOrder: "asc" },
            select: { question: { select: { type: true, prompt: true, optionsJson: true, answerJson: true, bankId: true } } },
          },
        },
      });
      if (quiz) {
        quizIds.push(quiz.id);
        const first = quiz.questions[0]?.question;
        if (first) bankIds.push(first.bankId);
      }
      check("the quiz exists", !!quiz);
      eq("quiz keeps its pass mark", quiz?.passingScore, 70);
      eq("all questions are linked to the quiz, in order", quiz?.questions.length, 4);
      eq(
        "question types are preserved",
        quiz?.questions.map((q) => q.question.type),
        ["SINGLE_CHOICE", "TRUE_FALSE", "MULTIPLE_CHOICE", "SHORT_ANSWER"]
      );
      eq(
        "TRUE_FALSE options are normalised",
        quiz?.questions[1].question.optionsJson,
        ["True", "False"]
      );
      eq("choice answers store indexes", quiz?.questions[2].question.answerJson, [0, 2]);
      eq("short answers store accepted text", quiz?.questions[3].question.answerJson, ["Paris"]);
      eq("short answer carries no options", quiz?.questions[3].question.optionsJson, []);

      // --- 3. Applying again appends instead of overwriting ---
      const second = await applyGeneratedCourse({
        tenantId: tenant.id,
        courseId: course.id,
        courseTitle: course.title,
        generated: generatedCourseSchema.parse({
          courseSummary: null,
          groups: [{ title: "Module 3", lessons: [{ title: "Extra", contentType: "TEXT", body: "More." }] }],
        }),
      });
      eq("second apply adds one module", second, { groups: 1, lessons: 1, quizzes: 0, questions: 0 });
      const afterSecond = await prisma.lesson.findMany({
        where: { courseId: course.id },
        orderBy: { sortOrder: "asc" },
        select: { sortOrder: true },
      });
      eq(
        "appended lesson sorts after the existing ones",
        afterSecond.map((l) => l.sortOrder),
        [0, 1, 2, 3, 4]
      );
      const groups = await prisma.lessonGroup.findMany({
        where: { courseId: course.id },
        orderBy: { sortOrder: "asc" },
        select: { sortOrder: true, title: true },
      });
      eq(
        "appended module sorts after the existing ones",
        groups.map((g) => g.sortOrder),
        [0, 1, 2]
      );

      // --- 4. A broken quiz is rejected before anything is written ---
      const before = await prisma.lesson.count({ where: { courseId: course.id } });
      let rejected: string | null = null;
      try {
        await applyGeneratedCourse({
          tenantId: tenant.id,
          courseId: course.id,
          courseTitle: course.title,
          generated: generatedCourseSchema.parse({
            courseSummary: null,
            groups: [
              {
                title: "Bad module",
                lessons: [
                  {
                    title: "Bad quiz",
                    contentType: "QUIZ",
                    quiz: {
                      title: "Bad",
                      questions: [
                        { type: "SINGLE_CHOICE", prompt: "Out of range", options: ["A", "B"], correctOptionIndexes: [7] },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        });
      } catch (e) {
        rejected = e instanceof Error ? e.message : String(e);
      }
      check("an out-of-range correct answer is rejected", rejected !== null, "apply did not throw");
      check(
        "the rejection names the offending question",
        !!rejected && rejected.includes("out of range"),
        rejected ?? ""
      );
      eq("nothing was written by the rejected apply", await prisma.lesson.count({ where: { courseId: course.id } }), before);

      // --- 5. Optional: a real AI generation ---
      if (runAi) {
        console.log("\nGenerating a real course via the Mastra workflow (this takes a minute)…");
        const generated = await runWorkflow({
          mode: "prompt",
          topic: "Writing effective email subject lines",
          audience: "Complete beginners",
          structureHints: "Exactly 2 modules, 2 lessons per module, end each module with a quiz.",
          sourceMaterial: null,
          sourceJson: null,
          allowPlaceholders: false,
        });
        check("AI generation returns at least one module", generated.groups.length >= 1);
        check(
          "AI lessons carry real content",
          generated.groups.every((g) =>
            g.lessons.every((l) =>
              l.contentType === "QUIZ"
                ? (l.quiz?.questions.length ?? 0) > 0
                : ((l.body ?? "") + (l.html ?? "")).trim().length > 100
            )
          )
        );
        check(
          "AI produced no placeholder lessons when they were disallowed",
          generated.groups.every((g) =>
            g.lessons.every((l) => l.contentType !== "VIDEO_URL" && l.contentType !== "FILE")
          )
        );
        const aiCourse = await prisma.course.create({
          data: {
            tenantId: tenant.id,
            title: `AI builder verification AI ${stamp}`,
            slug: `ai-builder-verification-ai-${stamp}`,
            status: "DRAFT",
          },
          select: { id: true, title: true },
        });
        try {
          const aiCreated = await applyGeneratedCourse({
            tenantId: tenant.id,
            courseId: aiCourse.id,
            courseTitle: aiCourse.title,
            generated,
          });
          console.log(`      created ${JSON.stringify(aiCreated)}`);
          const expectedLessons = generated.groups.reduce((n, g) => n + g.lessons.length, 0);
          eq("AI apply writes every generated module", aiCreated.groups, generated.groups.length);
          eq("AI apply writes every generated lesson", aiCreated.lessons, expectedLessons);
          eq(
            "AI apply writes every lesson row",
            await prisma.lesson.count({ where: { courseId: aiCourse.id } }),
            expectedLessons
          );
          const aiQuizLessons = await prisma.lesson.findMany({
            where: { courseId: aiCourse.id, contentType: "QUIZ" },
            select: { contentJson: true },
          });
          const aiQuizIds = aiQuizLessons
            .map((l) => (l.contentJson as { quizId?: string }).quizId)
            .filter((id): id is string => !!id);
          quizIds.push(...aiQuizIds);
          eq("every AI quiz lesson links to a quiz", aiQuizIds.length, aiQuizLessons.length);
          const aiBanks = await prisma.questionBank.findMany({
            where: { name: { startsWith: aiCourse.title } },
            select: { id: true },
          });
          bankIds.push(...aiBanks.map((b) => b.id));
        } finally {
          await prisma.course.delete({ where: { id: aiCourse.id } });
        }
      }
    } finally {
      // Cascades take the lessons, groups, quiz questions and questions with them.
      if (quizIds.length) await prisma.quiz.deleteMany({ where: { id: { in: quizIds } } });
      if (bankIds.length) await prisma.questionBank.deleteMany({ where: { id: { in: bankIds } } });
      await prisma.course.delete({ where: { id: course.id } });
      console.log("\nCleaned up the verification course.");
    }
  });
}

main()
  .then(() => {
    console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\nVerification crashed:", e);
    process.exit(1);
  });
