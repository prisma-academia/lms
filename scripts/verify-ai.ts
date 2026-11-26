/**
 * AI plumbing invariants, offline.
 *
 * Everything here runs with no provider key, no network and no database: the
 * model is replaced by a stub that returns canned replies (or canned failures).
 * What is under test is everything AROUND the model — which is where every one
 * of these features actually broke:
 *
 *  - is a missing key reported as "not configured", before anything is sent?
 *  - is a failed call classified by its real cause?
 *  - does one bad lesson, one bad question or one over-long comment cost only
 *    itself, instead of the whole course or the whole grading batch?
 *  - does the course-builder workflow assemble what succeeded and say what
 *    did not?
 *  - does a run stop in time for its request, and can the quizzes it had no
 *    time for be written afterwards without touching anything else?
 *
 *   npm run verify:ai
 *
 * A live generation against the real model is a separate check:
 *   npm run verify:course-builder -- --ai
 */
import { readFileSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core/mastra";
import { STORAGE_REVISION } from "../src/mastra/storage";
import { aiStatus, DEFAULT_AI_MODEL } from "../lib/ai/config";
import { AiError, classifyAiError, generateStructured, generateText, reviveAiError } from "../lib/ai/run";
import { extractLessonHtml, lessonHeadings, lessonPlain } from "../lib/ai/lesson-writer";
import { outlineFromTransport, quizFromTransport, type QuizTransport } from "../lib/schemas/course-builder-transport";
import {
  ESSAY_LEVEL_SCORE,
  essayGradeTransportSchema,
  gradeFromTransport,
  rubricFraction,
  type EssayRubric,
} from "../lib/schemas/essay-grading";
import { generatedCourseSchema, type CourseBuilderInput, type GeneratedCourse } from "../lib/schemas/course-builder";
import { BUILDER_FINISH_BY_MS, BUILDER_START_BY_MS, callTimeout } from "../lib/ai/course-builder-run";
import { writeMissingQuizzes } from "../lib/courses/missing-quizzes";
import { courseBuilderWorkflow, type CourseBuilderWarning } from "../src/mastra/workflows/course-builder-workflow";

let failed = 0;

// A script that stops early prints nothing and exits 0 — which reads as a pass.
// Anything other than reaching the last line is a failure.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.log("\nverify-ai ended before its last check — treat this as a FAILURE.");
    process.exitCode = 1;
  }
});

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

/* -------------------------------------------------------------------------- */
/* A model that says what it is told to                                        */
/* -------------------------------------------------------------------------- */

type StubReply = { text?: string; object?: unknown; finishReason?: string; error?: unknown };
type StubHandler = (prompt: string, options: Record<string, unknown>) => StubReply | Promise<StubReply>;

const calls: { prompt: string; options: Record<string, unknown> }[] = [];
let handler: StubHandler = () => ({ text: "" });

function stubAgent(id: string): Agent {
  const agent = new Agent({ id, name: id, instructions: "stub", model: DEFAULT_AI_MODEL });
  // Replace the one method that would reach a provider.
  (agent as unknown as { generate: unknown }).generate = async (
    messages: { content: string }[],
    options: Record<string, unknown>
  ) => {
    const prompt = messages[0].content;
    calls.push({ prompt, options });
    return handler(prompt, options);
  };
  return agent;
}

const builderAgent = stubAgent("course-builder-agent");

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "no error";
  } catch (e) {
    return e instanceof AiError ? e.code : `not an AiError: ${String(e)}`;
  }
}

const CALL = { maxOutputTokens: 100, timeoutMs: 5_000, maxRetries: 0 };

async function main() {
  /* ------------------------------------------------------------------------ */
  /* Configuration                                                             */
  /* ------------------------------------------------------------------------ */

  delete process.env.AI_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  check("no key: reported as not configured, naming the variable to set", aiStatus(), {
    configured: false,
    model: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    keyEnvVar: "ANTHROPIC_API_KEY",
  });

  calls.length = 0;
  check(
    "no key: a call fails as not_configured",
    await codeOf(() => generateText(builderAgent, "hello", CALL)),
    "not_configured"
  );
  check("no key: nothing was sent to the model", calls.length, 0);

  process.env.AI_MODEL = "openrouter/anthropic/claude-sonnet-5";
  // Mastra's tables are only (re)initialised when this marker changes, so it
  // has to move whenever the packages that define those tables do.
  const installed = (name: string) =>
    (JSON.parse(readFileSync(`node_modules/@mastra/${name}/package.json`, "utf8")) as { version: string }).version;
  check(
    "the storage revision names the installed @mastra/core and @mastra/pg — bump STORAGE_REVISION in src/mastra/storage.ts after upgrading them",
    STORAGE_REVISION,
    `core-${installed("core")}+pg-${installed("pg")}`
  );

  check("AI_MODEL switches the provider and the key that is required", aiStatus().keyEnvVar, "OPENROUTER_API_KEY");
  process.env.AI_MODEL = "not-a-model-id";
  check("a malformed AI_MODEL falls back to the default", aiStatus().model, "anthropic/claude-sonnet-5");
  delete process.env.AI_MODEL;

  // From here on a key "exists". The stub never uses it.
  process.env.ANTHROPIC_API_KEY = "stub-key-not-real";
  check("with a key: configured", aiStatus().configured, true);

  /* ------------------------------------------------------------------------ */
  /* Failure classification                                                    */
  /* ------------------------------------------------------------------------ */

  const classified = (error: unknown) => classifyAiError(error).code;
  check("401 is an auth failure", classified({ statusCode: 401, message: "invalid x-api-key" }), "auth");
  check(
    "a 400 about credit balance is a credits failure, not a generic rejection",
    classified({ statusCode: 400, message: "Your credit balance is too low to access the Anthropic API." }),
    "credits"
  );
  check("402 is a credits failure", classified({ statusCode: 402, message: "Payment Required" }), "credits");
  check("429 is rate limiting", classified({ statusCode: 429, message: "Too many requests" }), "rate_limited");
  check("529 is the provider being unavailable", classified({ statusCode: 529, message: "Overloaded" }), "unavailable");
  check("a plain 400 is a rejected request", classified({ statusCode: 400, message: "max_tokens too large" }), "rejected");
  check(
    "the framework's missing-key error is not_configured",
    classified(new Error("Could not find API key process.env.ANTHROPIC_API_KEY for model id anthropic/claude-sonnet-5")),
    "not_configured"
  );
  check(
    "a provider error nested under `cause` is still found",
    classified(Object.assign(new Error("generation failed"), { cause: { statusCode: 401, message: "unauthorized" } })),
    "auth"
  );
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  check("an expired deadline is a timeout", classified(timeout), "timeout");
  check("an unrecognised failure is unknown, not misfiled", classified(new Error("something odd")), "unknown");
  check(
    "user messages never carry provider detail",
    classifyAiError({ statusCode: 401, message: "invalid x-api-key sk-ant-SECRET" }).userMessage.includes("SECRET"),
    false
  );

  // A workflow returns a failed step's error as a plain object, not an Error.
  check(
    "a serialized error (plain object, as a workflow returns it) keeps its cause",
    reviveAiError({ message: "credits: balance too low", name: "AiError", code: "credits", detail: "balance too low" }).code,
    "credits"
  );
  check(
    "…even when only the message survived",
    reviveAiError({ message: "timeout: took too long", name: "Error" }).code,
    "timeout"
  );
  check("…and a bare string is classified too", reviveAiError("auth: bad key").code, "auth");
  check(
    "an ordinary sentence that merely starts with a word and a colon is not mistaken for a code",
    reviveAiError("Workflow ended with status \"suspended\".").code,
    "unknown"
  );

  /* ------------------------------------------------------------------------ */
  /* The call helpers                                                          */
  /* ------------------------------------------------------------------------ */

  handler = () => ({ text: "", error: { statusCode: 401, message: "invalid x-api-key" } });
  check(
    "a call that RESOLVES with an error is still a failure (it used to read as 'no result')",
    await codeOf(() => generateText(builderAgent, "x", CALL)),
    "auth"
  );

  handler = () => ({ text: "half a less", finishReason: "length" });
  check(
    "a reply cut off at the token limit is truncated, not accepted",
    await codeOf(() => generateText(builderAgent, "x", CALL)),
    "truncated"
  );

  handler = () => ({ text: "   " });
  check("an empty reply is invalid output", await codeOf(() => generateText(builderAgent, "x", CALL)), "invalid_output");

  // When our own deadline fires, the framework resolves with nothing at all —
  // no text, no object, no error. That must read as a timeout.
  handler = (_prompt, options) =>
    new Promise<StubReply>((resolve) => {
      // Polled on an ordinary timer rather than the signal's own event: the
      // timer behind `AbortSignal.timeout` does not keep Node alive, so with no
      // real network request pending the process would simply exit here.
      const poll = setInterval(() => {
        if ((options.abortSignal as AbortSignal).aborted) {
          clearInterval(poll);
          resolve({});
        }
      }, 5);
    });
  check(
    "a call cut off by its deadline is a timeout, not 'unexpected format'",
    await codeOf(() => generateText(builderAgent, "x", { maxOutputTokens: 100, timeoutMs: 40 })),
    "timeout"
  );
  check(
    "…for structured calls too",
    await codeOf(() =>
      generateStructured(builderAgent, "x", { maxOutputTokens: 100, timeoutMs: 40, schema: essayGradeTransportSchema })
    ),
    "timeout"
  );

  calls.length = 0;
  handler = () => ({ text: "ok" });
  await generateText(builderAgent, "x", { maxOutputTokens: 1234, timeoutMs: 5_000 });
  const sent = calls[0].options.modelSettings as Record<string, unknown>;
  check("every call sets an output-token limit", sent.maxOutputTokens, 1234);
  check(
    "no sampling parameter is sent (the model rejects them; the framework drops them silently)",
    ["temperature", "topP", "topK"].some((key) => key in sent),
    false
  );
  check("every call has a deadline", calls[0].options.abortSignal instanceof AbortSignal, true);

  handler = () => ({ object: { grades: "not an array" } });
  check(
    "structured output that does not match the schema is invalid output",
    await codeOf(() => generateStructured(builderAgent, "x", { ...CALL, schema: essayGradeTransportSchema })),
    "invalid_output"
  );

  calls.length = 0;
  handler = (_prompt, options) => {
    const structured = options.structuredOutput as { jsonPromptInjection?: boolean };
    if (!structured.jsonPromptInjection) {
      throw Object.assign(new Error("output_config.format: schema is not supported"), { statusCode: 400 });
    }
    return { object: { grades: [] } };
  };
  check(
    "a provider that rejects the schema format gets one retry with the schema in the prompt",
    await generateStructured(builderAgent, "x", { ...CALL, schema: essayGradeTransportSchema }),
    { grades: [] }
  );
  check("…and that is exactly two calls", calls.length, 2);

  /* ------------------------------------------------------------------------ */
  /* Essay grades                                                              */
  /* ------------------------------------------------------------------------ */

  const rubric: EssayRubric = {
    criteria: [
      { id: "names-phases", label: "Names the phases", description: "", weight: 1 },
      { id: "explains-why", label: "Explains why", description: "", weight: 3 },
    ],
    modelAnswer: null,
    minWords: null,
    maxWords: null,
  };

  check("the top level is worth exactly full credit", ESSAY_LEVEL_SCORE.full, 1);

  const longComment = "x".repeat(900);
  const grade = gradeFromTransport({
    questionId: " q1 ",
    criteria: [
      { id: "names-phases", level: "full", comment: longComment },
      { id: "explains-why", level: "partial", comment: "" },
      { id: " ", level: "full", comment: "no id" },
    ],
    feedback: "f".repeat(2000),
    flags: ["too_short", "too_short"],
  });
  check("an over-long comment is trimmed, not a failed grade", grade?.criteria[0].comment.length, 600);
  check("an empty comment gets a placeholder", grade?.criteria[1].comment, "No comment.");
  check("a criterion with no id is dropped", grade?.criteria.length, 2);
  check("over-long feedback is trimmed", grade?.feedback.length, 1500);
  check("flags are de-duplicated", grade?.flags, ["too_short"]);
  check("the question id is trimmed", grade?.questionId, "q1");
  check(
    "levels fold into the weighted score: full on weight 1, partial on weight 3",
    rubricFraction(rubric, grade),
    (1 * 1 + 0.5 * 3) / 4
  );
  check(
    "a grade with no usable criteria is no grade at all",
    gradeFromTransport({ questionId: "q1", criteria: [], feedback: "", flags: [] }),
    null
  );

  /* ------------------------------------------------------------------------ */
  /* Lesson replies                                                            */
  /* ------------------------------------------------------------------------ */

  check(
    "a Markdown fence around the HTML is removed",
    extractLessonHtml("```html\n<h2>Intro</h2>\n<p>Body</p>\n```"),
    "<h2>Intro</h2>\n<p>Body</p>"
  );
  check(
    "a sentence of preamble before the HTML is removed",
    extractLessonHtml("Here is the lesson:\n\n<h2>Intro</h2><p>Body</p>\n\nLet me know if you need changes."),
    "<h2>Intro</h2><p>Body</p>"
  );
  check(
    "a full document is reduced to its body",
    extractLessonHtml("<html><head><title>x</title></head><body><h2>Intro</h2></body></html>"),
    "<h2>Intro</h2>"
  );
  check(
    "headings a quiz may cite are read from the lesson, tags stripped",
    lessonHeadings('<h2 class="x">Why <em>lead time</em> matters</h2><p>…</p><h3>Safety &amp; stock</h3><h1>ignored</h1>'),
    ["Why lead time matters", "Safety & stock"]
  );
  check(
    "lesson text for the quiz writer has no markup",
    lessonPlain({
      body: null,
      html: "<h2>A</h2><p>One <strong>two</strong>.</p><ul><li>x</li></ul><table><tr><td>a</td><td>b</td></tr></table>",
    }),
    "A\nOne two.\nx\na b"
  );

  /* ------------------------------------------------------------------------ */
  /* Outline and quiz normalisation                                            */
  /* ------------------------------------------------------------------------ */

  const outline = outlineFromTransport(
    {
      courseSummary: "  ",
      groups: [
        {
          title: " Basics ",
          lessons: [
            { title: "What it is", contentType: "HTML", synopsis: "s", durationMin: 0 },
            { title: "   ", contentType: "HTML", synopsis: "", durationMin: 5 },
            { title: "Watch this", contentType: "VIDEO_URL", synopsis: "a demo", durationMin: 4.6 },
          ],
        },
        { title: "Empty module", lessons: [] },
      ],
    },
    { allowPlaceholders: false }
  );
  check("outline: untitled lessons, disallowed placeholders and empty modules are dropped", outline, {
    courseSummary: null,
    groups: [
      { title: "Basics", lessons: [{ title: "What it is", contentType: "HTML", synopsis: "s", durationMin: null }] },
    ],
  });
  check(
    "outline: nothing usable is reported as such",
    outlineFromTransport({ courseSummary: "", groups: [{ title: "x", lessons: [] }] }, { allowPlaceholders: true }),
    null
  );
  check(
    "outline: more than 15 modules is trimmed, not rejected",
    outlineFromTransport(
      {
        courseSummary: "",
        groups: Array.from({ length: 20 }, (_, i) => ({
          title: `M${i}`,
          lessons: [{ title: `L${i}`, contentType: "HTML" as const, synopsis: "", durationMin: 3 }],
        })),
      },
      { allowPlaceholders: false }
    )?.groups.length,
    15
  );

  const question = (over: Partial<QuizTransport["questions"][number]>): QuizTransport["questions"][number] => ({
    type: "SINGLE_CHOICE",
    prompt: "What is the reorder point?",
    options: ["Lead-time demand plus safety stock", "The warehouse capacity", "Last month's sales"],
    correctOptionIndexes: [0],
    acceptedAnswers: [],
    points: 1,
    hint: "Think about what must still be on the shelf while the next delivery is on its way.",
    sourceLessonTitle: "What it is",
    sourceHeading: "The formula",
    sourceQuote: "lead-time demand plus safety stock",
    rubric: null,
    ...over,
  });

  const quiz = quizFromTransport(
    {
      title: "",
      description: "",
      questions: [
        question({}),
        question({ prompt: "Out of range", correctOptionIndexes: [7] }),
        question({ prompt: "Two answers on single choice", correctOptionIndexes: [0, 1] }),
        question({ prompt: "Leaky hint", hint: "It is the lead-time demand plus safety stock." }),
        question({ type: "TRUE_FALSE", prompt: "TF", options: ["Yes", "No"], correctOptionIndexes: [1], hint: "True or false?" }),
        question({ type: "SHORT_ANSWER", prompt: "SA", options: [], correctOptionIndexes: [], acceptedAnswers: [" EOQ ", "EOQ", ""] }),
        question({ type: "SHORT_ANSWER", prompt: "SA none", options: [], correctOptionIndexes: [], acceptedAnswers: [] }),
        question({ type: "ESSAY", prompt: "Essay", options: [], correctOptionIndexes: [], rubric: { criteria: [{ label: "x", description: "", weight: 1 }], modelAnswer: "", minWords: 0, maxWords: 0 } }),
        question({ prompt: "No source", sourceLessonTitle: "", sourceHeading: "ignored", points: 2.6 }),
      ],
    },
    { allowEssays: false, passMark: 70, fallbackTitle: "Module check" }
  );

  check("quiz: an empty title falls back to the lesson's", quiz?.title, "Module check");
  check("quiz: the pass mark is the author's, not the model's", quiz?.passingScore, 70);
  check(
    "quiz: broken questions are dropped individually (bad index, two answers on single choice, no accepted answer, essay not allowed)",
    quiz?.questions.map((q) => q.prompt),
    ["What is the reorder point?", "Leaky hint", "TF", "SA", "No source"]
  );
  check("quiz: a hint that states the answer is removed", quiz?.questions[1].hint, null);
  check("quiz: a fair hint is kept", quiz?.questions[0].hint?.startsWith("Think about"), true);
  check("quiz: true/false options are normalised", quiz?.questions[2].options, ["True", "False"]);
  check("quiz: accepted answers are trimmed and de-duplicated", quiz?.questions[3].acceptedAnswers, ["EOQ"]);
  check("quiz: the source of a question is carried through", quiz?.questions[0].source, {
    lessonTitle: "What it is",
    heading: "The formula",
    quote: "lead-time demand plus safety stock",
  });
  check("quiz: no lesson title means no source", quiz?.questions[4].source, null);
  check("quiz: points are whole numbers", quiz?.questions[4].points, 3);
  check(
    "quiz: essays are kept when allowed, with unique criterion ids",
    quizFromTransport(
      {
        title: "Q",
        description: "",
        questions: [
          question({}),
          question({
            type: "ESSAY",
            prompt: "Essay",
            options: [],
            correctOptionIndexes: [],
            rubric: {
              criteria: [
                { label: "Names the phases", description: "", weight: 2.2 },
                { label: "Names the phases", description: "", weight: 0 },
              ],
              modelAnswer: " A model answer ",
              minWords: 50,
              maxWords: 20,
            },
          }),
        ],
      },
      { allowEssays: true, passMark: null, fallbackTitle: "Q" }
    )?.questions[1].rubric,
    {
      criteria: [
        { id: "names-the-phases", label: "Names the phases", description: "", weight: 2 },
        { id: "names-the-phases-2", label: "Names the phases", description: "", weight: 1 },
      ],
      modelAnswer: "A model answer",
      minWords: 50,
      maxWords: null,
    }
  );
  check(
    "quiz: nothing usable is reported as such",
    quizFromTransport({ title: "Q", description: "", questions: [question({ correctOptionIndexes: [] })] }, { allowEssays: false, passMark: null, fallbackTitle: "Q" }),
    null
  );

  /* ------------------------------------------------------------------------ */
  /* The course-builder workflow, end to end                                   */
  /* ------------------------------------------------------------------------ */

  const mastra = new Mastra({
    agents: { courseBuilderAgent: builderAgent },
    workflows: { courseBuilderWorkflow },
    logger: false,
  });

  const input: CourseBuilderInput = {
    mode: "prompt",
    topic: "Inventory basics",
    audience: "Beginners",
    structureHints: null,
    sourceMaterial: null,
    sourceJson: null,
    allowPlaceholders: true,
    allowEssays: false,
    quizPassMark: 80,
  };

  const outlineReply = {
    courseSummary: "A short course.",
    groups: [
      {
        title: "Reordering",
        lessons: [
          { title: "Reorder points", contentType: "HTML", synopsis: "the formula", durationMin: 6 },
          { title: "Safety stock", contentType: "HTML", synopsis: "buffers", durationMin: 5 },
          { title: "Check: reordering", contentType: "QUIZ", synopsis: "checks the module", durationMin: 5 },
        ],
      },
      {
        title: "Counting",
        lessons: [
          { title: "Cycle counts", contentType: "HTML", synopsis: "counting", durationMin: 4 },
          { title: "Warehouse walkthrough", contentType: "VIDEO_URL", synopsis: "A 3-minute walkthrough video.", durationMin: 3 },
          { title: "Check: counting", contentType: "QUIZ", synopsis: "checks the module", durationMin: 5 },
        ],
      },
    ],
  };

  type Result = { course: GeneratedCourse; warnings: CourseBuilderWarning[] };

  async function runBuilder(next: StubHandler, runInput: CourseBuilderInput = input) {
    calls.length = 0;
    handler = next;
    const run = await mastra.getWorkflow("courseBuilderWorkflow").createRun();
    const result = await run.start({ inputData: runInput });
    return {
      status: result.status,
      output: result.status === "success" ? (result.result as Result) : null,
      // Recovered the same way the HTTP route does it.
      cause: result.status === "failed" ? reviveAiError(result.error).code : null,
    };
  }

  /** Which kind of call a prompt is, from how the workflow words it. */
  const kindOf = (prompt: string) =>
    prompt.startsWith("Design the outline")
      ? "outline"
      : prompt.startsWith("Write ONE quiz")
        ? "quiz"
        : "lesson";
  const lessonTitleOf = (prompt: string) => /Lesson to write: "([^"]+)"/.exec(prompt)?.[1] ?? "";

  const happy: StubHandler = (prompt) => {
    const kind = kindOf(prompt);
    if (kind === "outline") return { object: outlineReply };
    if (kind === "lesson") {
      const title = lessonTitleOf(prompt);
      if (title === "Safety stock") throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
      return { text: `\`\`\`html\n<h2>About ${title}</h2><p>Body of ${title}.</p>\n\`\`\`` };
    }
    return {
      object: {
        title: "",
        description: "Checks the module.",
        questions: [question({ sourceLessonTitle: "Reorder points", sourceHeading: "About Reorder points" })],
      },
    };
  };

  const built = await runBuilder(happy);
  check("workflow: a run with one failed lesson still succeeds", built.status, "success");

  const groups = built.output?.course.groups ?? [];
  check(
    "workflow: the course keeps the outline's shape",
    groups.map((g) => `${g.title}: ${g.lessons.map((l) => `${l.contentType}:${l.title}`).join(", ")}`),
    [
      "Reordering: HTML:Reorder points, HTML:Safety stock, QUIZ:Check: reordering",
      "Counting: HTML:Cycle counts, VIDEO_URL:Warehouse walkthrough, QUIZ:Check: counting",
    ]
  );
  check(
    "workflow: a written lesson is the model's HTML with the code fence removed",
    groups[0]?.lessons[0].html,
    "<h2>About Reorder points</h2><p>Body of Reorder points.</p>"
  );
  check("workflow: the failed lesson stays in place, empty", groups[0]?.lessons[1].html, null);
  check(
    "workflow: …and says why, in words for the author",
    groups[0]?.lessons[1].placeholderNote,
    "Not written yet — The AI service is temporarily unavailable. Please try again shortly."
  );
  check("workflow: the failure is reported as a warning", built.output?.warnings, [
    {
      kind: "lesson",
      module: "Reordering",
      title: "Safety stock",
      reason: "The AI service is temporarily unavailable. Please try again shortly.",
    },
  ]);
  check(
    "workflow: a placeholder lesson needs no model call and carries its brief",
    groups[1]?.lessons[1].placeholderNote,
    "A 3-minute walkthrough video."
  );
  check("workflow: the quiz takes the author's pass mark", groups[0]?.lessons[2].quiz?.passingScore, 80);
  check("workflow: quiz questions keep where they came from", groups[0]?.lessons[2].quiz?.questions[0].source, {
    lessonTitle: "Reorder points",
    heading: "About Reorder points",
    quote: "lead-time demand plus safety stock",
  });

  const quizPrompts = calls.filter((c) => kindOf(c.prompt) === "quiz").map((c) => c.prompt);
  check("workflow: one model call per quiz", quizPrompts.length, 2);
  const reorderingQuiz = quizPrompts.find((p) => p.includes('Module: "Reordering"')) ?? "";
  check(
    "workflow: the quiz writer is shown the lesson as it was actually written, headings included",
    [reorderingQuiz.includes("### Lesson: Reorder points"), reorderingQuiz.includes("- About Reorder points"), reorderingQuiz.includes("Body of Reorder points.")],
    [true, true, true]
  );
  check(
    "workflow: …and is not shown a lesson that failed, nor another module's",
    [reorderingQuiz.includes("### Lesson: Safety stock"), reorderingQuiz.includes("Cycle counts")],
    [false, false]
  );
  check(
    "workflow: one model call per lesson that has content (placeholders and quizzes excluded)",
    calls.filter((c) => kindOf(c.prompt) === "lesson").map((c) => lessonTitleOf(c.prompt)).sort(),
    ["Cycle counts", "Reorder points", "Safety stock"]
  );

  // A module whose lessons all failed has nothing for its quiz to ask about.
  const oneModuleDown = await runBuilder((prompt) => {
    const kind = kindOf(prompt);
    if (kind === "outline") return { object: outlineReply };
    if (kind === "lesson") {
      if (prompt.includes('(module: "Counting")')) return { text: "", finishReason: "length" };
      return { text: `<h2>${lessonTitleOf(prompt)}</h2><p>Body.</p>` };
    }
    return { object: { title: "Q", description: "", questions: [question({})] } };
  });
  check("workflow: a module with no written lessons loses its quiz, and the run still succeeds", oneModuleDown.status, "success");
  check(
    "workflow: …the empty lesson and the dropped quiz are both reported",
    oneModuleDown.output?.warnings.map((w) => `${w.kind}:${w.title}:${w.reason}`),
    [
      "lesson:Cycle counts:The AI response was cut off before it finished. Try a narrower request.",
      "quiz:Check: counting:The lessons this quiz would test could not be written.",
    ]
  );
  check(
    "workflow: …no model call is spent on a quiz with nothing to ask about",
    calls.filter((c) => kindOf(c.prompt) === "quiz").length,
    1
  );
  check(
    "workflow: …and the quiz lesson is left out rather than applied without a quiz",
    oneModuleDown.output?.course.groups[1]?.lessons.map((l) => l.contentType),
    ["HTML", "VIDEO_URL"]
  );

  // Nothing at all could be written: that is an error, with the real cause.
  const allDown = await runBuilder((prompt) => {
    if (kindOf(prompt) === "outline") return { object: outlineReply };
    throw Object.assign(new Error("Your credit balance is too low"), { statusCode: 400 });
  });
  check("workflow: when no lesson can be written the run fails", allDown.status, "failed");
  check("workflow: …and the failure names the real cause", allDown.cause, "credits");

  const outlineDown = await runBuilder(() => {
    throw Object.assign(new Error("invalid x-api-key"), { statusCode: 401 });
  });
  check("workflow: a failed outline fails the run with its cause", [outlineDown.status, outlineDown.cause], ["failed", "auth"]);

  // An exact template import must work with no model at all.
  const template = {
    format: "lms-course",
    version: 1,
    courseSummary: "Imported.",
    course: null,
    groups: [
      {
        title: "Imported module",
        lessons: [{ title: "Imported lesson", contentType: "TEXT", body: "Hello.", html: null, quiz: null, durationMin: 3, placeholderNote: null }],
      },
    ],
  };
  delete process.env.ANTHROPIC_API_KEY;
  const imported = await runBuilder(
    () => {
      throw new Error("the model must not be called for a template import");
    },
    { ...input, mode: "adapt-json", sourceJson: JSON.stringify(template) }
  );
  check("workflow: a template import succeeds with no key and no model call", [imported.status, calls.length], ["success", 0]);
  check("workflow: …and returns the imported structure", imported.output?.course.groups[0]?.lessons[0].body, "Hello.");

  /* ------------------------------------------------------------------------ */
  /* Time: a run has to fit inside the request that carries it                 */
  /* ------------------------------------------------------------------------ */

  const routeLimits = ["generate", "quizzes"].map((name) => {
    const source = readFileSync(`app/api/tenant/courses/[id]/builder/${name}/route.ts`, "utf8");
    return Number(/export const maxDuration = (\d+);/.exec(source)?.[1]);
  });
  check("time: both builder routes allow 300 seconds", routeLimits, [300, 300]);
  check(
    "time: the last model call ends at least 10 seconds before a route's limit — raise maxDuration before raising these",
    BUILDER_START_BY_MS < BUILDER_FINISH_BY_MS && BUILDER_FINISH_BY_MS <= Math.min(...routeLimits) * 1000 - 10_000,
    true
  );
  const runStart = 1_700_000_000_000;
  const runDeadline = runStart + BUILDER_START_BY_MS;
  check("time: a call started early keeps its usual two minutes", callTimeout(runDeadline, 120_000, runStart), 120_000);
  check(
    "time: a call started late is given only what is left of the run",
    callTimeout(runDeadline, 120_000, runDeadline - 5_000),
    5_000 + (BUILDER_FINISH_BY_MS - BUILDER_START_BY_MS)
  );
  check("time: after the deadline no call is started", callTimeout(runDeadline, 120_000, runDeadline + 1), null);
  check(
    "time: the latest possible call, running to its timeout, still ends when the run must",
    BUILDER_START_BY_MS + (callTimeout(runDeadline, 120_000, runDeadline) ?? Number.NaN),
    BUILDER_FINISH_BY_MS
  );

  /* ------------------------------------------------------------------------ */
  /* Generating only the quizzes a run left out                                */
  /* ------------------------------------------------------------------------ */

  process.env.ANTHROPIC_API_KEY = "stub-key-not-real";

  const htmlLesson = (title: string, html: string | null): GeneratedCourse["groups"][number]["lessons"][number] => ({
    title,
    contentType: "HTML",
    body: null,
    html,
    quiz: null,
    durationMin: 5,
    placeholderNote: html ? null : "Not written yet — Skipped: the generation ran out of time before this was started.",
  });

  // What a run that ran out of time hands back: lessons written (one of them
  // not), a module with nothing written at all, and every quiz left out.
  const timedOutDraft: GeneratedCourse = {
    courseSummary: "A short course.",
    groups: [
      {
        title: "Reordering",
        lessons: [
          htmlLesson("Reorder points", "<h2>About Reorder points</h2><p>Body of Reorder points.</p>"),
          htmlLesson("Safety stock", null),
        ],
      },
      {
        title: "Counting",
        lessons: [
          htmlLesson("Cycle counts", "<h2>How to count</h2><p>Count a few bins every day.</p>"),
          { title: "Warehouse walkthrough", contentType: "VIDEO_URL", body: null, html: null, quiz: null, durationMin: 3, placeholderNote: "A 3-minute walkthrough video." },
        ],
      },
      { title: "Receiving", lessons: [htmlLesson("Goods in", null)] },
    ],
  };
  const draftBefore = JSON.stringify(timedOutDraft);

  const leftOut = [
    { module: "Reordering", title: "Check: reordering" },
    { module: "Counting", title: "Check: counting" },
    { module: "Receiving", title: "Check: receiving" },
    { module: "Dispatch", title: "Check: dispatch" },
    // The same quiz, asked for twice.
    { module: " reordering", title: "CHECK: REORDERING" },
  ];
  const builderRequest: CourseBuilderInput = { ...input, sourceMaterial: "SOURCE-TEXT-THE-LESSONS-WERE-WRITTEN-FROM" };
  const moduleOf = (prompt: string) => /Module: "([^"]+)"/.exec(prompt)?.[1] ?? "";
  const quizReply = (prompt: string): StubReply => ({
    object: {
      title: "",
      description: "Checks the module.",
      questions: [
        question(
          moduleOf(prompt) === "Reordering"
            ? { sourceLessonTitle: "Reorder points", sourceHeading: "About Reorder points" }
            : { sourceLessonTitle: "Cycle counts", sourceHeading: "How to count", sourceQuote: "a few bins every day" }
        ),
      ],
    },
  });

  calls.length = 0;
  handler = (prompt) => {
    if (moduleOf(prompt) === "Counting") throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
    return quizReply(prompt);
  };
  const quizProgress: string[] = [];
  const firstPass = await writeMissingQuizzes(builderAgent, {
    course: timedOutDraft,
    missing: leftOut,
    request: builderRequest,
    onProgress: ({ completed, total }) => quizProgress.push(`${completed}/${total}`),
  });
  const shapeOf = (course: GeneratedCourse) =>
    course.groups.map((g) => `${g.title}: ${g.lessons.map((l) => `${l.contentType}:${l.title}`).join(", ")}`);

  check(
    "missing quizzes: one model call per quiz that has lessons to ask about — none for a module with nothing written, a module that is gone, or the same quiz twice",
    calls.map((c) => `${kindOf(c.prompt)}:${moduleOf(c.prompt)}`).sort(),
    ["quiz:Counting", "quiz:Reordering"]
  );
  check("missing quizzes: the quiz that could be written is added at the end of its module, and nothing else moves", shapeOf(firstPass.course), [
    "Reordering: HTML:Reorder points, HTML:Safety stock, QUIZ:Check: reordering",
    "Counting: HTML:Cycle counts, VIDEO_URL:Warehouse walkthrough",
    "Receiving: HTML:Goods in",
  ]);
  check("missing quizzes: the draft that was sent in is not changed", JSON.stringify(timedOutDraft), draftBefore);
  check("missing quizzes: one was written", firstPass.written, 1);

  const addedQuiz = firstPass.course.groups[0]?.lessons[2].quiz;
  check("missing quizzes: the quiz takes the author's pass mark", addedQuiz?.passingScore, 80);
  check("missing quizzes: its title falls back to the quiz lesson's", addedQuiz?.title, "Check: reordering");
  check("missing quizzes: questions keep where they came from, for the apply step to turn into a lesson link", addedQuiz?.questions[0].source, {
    lessonTitle: "Reorder points",
    heading: "About Reorder points",
    quote: "lead-time demand plus safety stock",
  });
  check("missing quizzes: a fair hint is kept", addedQuiz?.questions[0].hint?.startsWith("Think about"), true);
  check(
    "missing quizzes: the result is a draft the apply route accepts",
    generatedCourseSchema.safeParse(firstPass.course).success,
    true
  );

  const reorderingPrompt = calls.find((c) => moduleOf(c.prompt) === "Reordering")?.prompt ?? "";
  check(
    "missing quizzes: the prompt is the workflow's — the module's written lessons with their headings, and the quiz's own title",
    [
      reorderingPrompt.startsWith("Write ONE quiz for a course module."),
      reorderingPrompt.includes("Topic: Inventory basics"),
      reorderingPrompt.includes('Quiz lesson title: "Check: reordering"'),
      reorderingPrompt.includes("### Lesson: Reorder points"),
      reorderingPrompt.includes("- About Reorder points"),
      reorderingPrompt.includes("Body of Reorder points."),
    ],
    [true, true, true, true, true, true]
  );
  check(
    "missing quizzes: …not a lesson that was never written, another module's lesson, or the source text the lessons were written from",
    [
      reorderingPrompt.includes("### Lesson: Safety stock"),
      reorderingPrompt.includes("Cycle counts"),
      reorderingPrompt.includes("SOURCE-TEXT"),
    ],
    [false, false, false]
  );
  check(
    "missing quizzes: each quiz still missing is reported once, with its own reason",
    firstPass.warnings.map((w) => `${w.kind}:${w.module}:${w.title}:${w.reason}`),
    [
      "quiz:Counting:Check: counting:The AI service is temporarily unavailable. Please try again shortly.",
      "quiz:Receiving:Check: receiving:The lessons this quiz would test could not be written.",
      "quiz:Dispatch:Check: dispatch:Its module is no longer in the draft. It may have been renamed or removed.",
    ]
  );
  check("missing quizzes: progress is reported once per quiz", quizProgress, ["1/4", "2/4", "3/4", "4/4"]);

  // Asked again, with the model healthy: only what is still missing is written.
  calls.length = 0;
  handler = quizReply;
  const secondPass = await writeMissingQuizzes(builderAgent, {
    course: firstPass.course,
    missing: [leftOut[0], leftOut[1]],
    request: builderRequest,
  });
  check(
    "missing quizzes: a quiz already in the draft is not written a second time",
    calls.map((c) => moduleOf(c.prompt)),
    ["Counting"]
  );
  check("missing quizzes: …and the draft ends up with exactly one of each", [secondPass.written, secondPass.warnings.length, ...shapeOf(secondPass.course)], [
    1,
    0,
    "Reordering: HTML:Reorder points, HTML:Safety stock, QUIZ:Check: reordering",
    "Counting: HTML:Cycle counts, VIDEO_URL:Warehouse walkthrough, QUIZ:Check: counting",
    "Receiving: HTML:Goods in",
  ]);
  check(
    "missing quizzes: a question's source names a lesson of its own module",
    secondPass.course.groups[1]?.lessons[2].quiz?.questions[0].source?.lessonTitle,
    "Cycle counts"
  );

  // A reply with nothing usable in it costs that quiz, and says so.
  calls.length = 0;
  handler = () => ({
    object: { title: "Q", description: "", questions: [question({ type: "ESSAY", options: [], correctOptionIndexes: [] })] },
  });
  const unusable = await writeMissingQuizzes(builderAgent, {
    course: timedOutDraft,
    missing: [leftOut[0]],
    request: builderRequest,
  });
  check(
    "missing quizzes: an essay nobody asked for is not accepted as a quiz",
    [unusable.written, unusable.warnings[0]?.reason, shapeOf(unusable.course)[0]],
    [0, "The quiz had no usable questions.", "Reordering: HTML:Reorder points, HTML:Safety stock"]
  );

  // Out of time before it started: nothing is sent, and the cause is a timeout.
  calls.length = 0;
  handler = () => {
    throw new Error("no call may be started after the deadline");
  };
  const tooLate = await writeMissingQuizzes(builderAgent, {
    course: timedOutDraft,
    missing: [leftOut[0], leftOut[1]],
    request: builderRequest,
    deadlineAt: Date.now() - 1,
  });
  check(
    "missing quizzes: past the deadline no call is started, and the cause is reported as a timeout",
    [calls.length, tooLate.written, tooLate.firstErrorCode, tooLate.warnings.map((w) => w.reason)],
    [
      0,
      0,
      "timeout",
      [
        "Skipped: the generation ran out of time before this was started.",
        "Skipped: the generation ran out of time before this was started.",
      ],
    ]
  );

  finished = true;
  console.log(failed === 0 ? "\nAll AI checks passed." : `\n${failed} AI check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-ai crashed:", e);
  process.exit(1);
});
