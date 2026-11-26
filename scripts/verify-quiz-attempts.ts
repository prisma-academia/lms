/**
 * Quiz attempts, end to end against the database.
 *
 * `verify:gating` checks the pass-mark rules as pure logic. This checks the
 * parts that only exist once there are rows: that the lesson gate's database
 * filter selects the attempts it should, that essay grading produces a stored
 * result, that an unchanged essay is not graded twice, that an instructor's
 * manual marks go through the same scoring, that the quiz's teaching material
 * can be found for the grader, and that a failed attempt's "read up" links
 * point only where this learner may go.
 *
 *   npx tsx scripts/verify-quiz-attempts.ts              # no model calls
 *   npx tsx scripts/verify-quiz-attempts.ts --ai         # also grades real essays
 *   npx tsx scripts/verify-quiz-attempts.ts --tenant <slug>
 *
 * Everything runs against a throwaway course, quiz and question bank inside a
 * real tenant and is deleted again in `finally`.
 */
import "dotenv/config";
import { prisma } from "../lib/db/client";
import { runWithContext } from "../lib/db/tenant-context";
import {
  evaluateAnswers,
  gradedAttemptData,
  learnerAttemptPayload,
  loadQuizForGrading,
  ungradedStatus,
  MAX_GRADING_ATTEMPTS,
} from "../lib/assessments/attempts";
import { gradeEssaysWith, type EssayToGrade } from "../lib/assessments/essay-grader";
import { buildQuizContext } from "../lib/assessments/lesson-context";
import { passingAttemptWhere } from "../lib/assessments/pass-mark";
import { findQuizCourse } from "../lib/assessments/quiz-access";
import { resolveQuestionSource, type QuestionSourceInput } from "../lib/assessments/question-source";
import { loadQuizSources } from "../lib/assessments/quiz-sources";
import type { EssayGradeMap } from "../lib/assessments/scoring";
import type { EssayRubric } from "../lib/schemas/essay-grading";

const args = process.argv.slice(2);
const runAi = args.includes("--ai");
const wantTenantSlug = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : null;

let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
}

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `got  ${a}\n      want ${e}`);
}

const RUBRIC: EssayRubric = {
  criteria: [
    { id: "names-two", label: "Names two functions", description: "Names two distinct functions of the cell membrane.", weight: 1 },
    { id: "explains", label: "Explains each", description: "Explains what each named function does for the cell.", weight: 1 },
  ],
  modelAnswer:
    "The membrane controls what enters and leaves the cell, and it holds the cell's contents together so the cell keeps its shape.",
  minWords: null,
  maxWords: null,
};

const LESSON_HTML =
  '<h2 id="what-the-membrane-does">What the membrane does</h2><p>The cell membrane is selectively permeable: it controls which substances enter and leave the cell. It also encloses the cytoplasm, holding the cell together.</p>';

const GOOD_ESSAY =
  "First, the cell membrane controls what goes in and out of the cell. It is selectively permeable, so it lets useful substances such as water and nutrients through while keeping harmful ones out. Second, it encloses the cytoplasm and holds the cell together, which gives the cell a boundary and keeps its contents from spilling out.";

async function main() {
  // A grader failure is classified and never thrown — and needs no database.
  const essay: EssayToGrade = { questionId: "q", prompt: "p", rubric: RUBRIC, answer: "a" };
  const noCredit = await gradeEssaysWith(
    () => {
      throw Object.assign(new Error("Your credit balance is too low"), { statusCode: 400 });
    },
    [essay],
    ""
  );
  eq(
    "a grader that cannot run reports why, and that retrying will not help",
    noCredit.ok ? "ok" : [noCredit.code, noCredit.retryable],
    ["credits", false]
  );
  const overloaded = await gradeEssaysWith(
    () => {
      throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
    },
    [essay],
    ""
  );
  eq(
    "an overloaded grader is worth retrying",
    overloaded.ok ? "ok" : [overloaded.code, overloaded.retryable],
    ["unavailable", true]
  );

  eq(
    "a retryable failure stays PENDING until the last allowed try, then goes to staff",
    [1, MAX_GRADING_ATTEMPTS - 1, MAX_GRADING_ATTEMPTS].map((n) => ungradedStatus({ retryable: true }, n)),
    ["PENDING", "PENDING", "FAILED"]
  );
  eq(
    "a failure that retrying cannot fix goes to staff at once",
    ungradedStatus({ retryable: false }, 1),
    "FAILED"
  );

  const tenant = wantTenantSlug
    ? await prisma.tenant.findFirst({ where: { slug: wantTenantSlug }, select: { id: true, slug: true } })
    : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true } });
  if (!tenant) throw new Error("No tenant found to run against.");
  console.log(`\nTenant: ${tenant.slug} (${tenant.id})\n`);

  await runWithContext({ mode: "tenant-admin", tenantId: tenant.id }, async () => {
    const client = await prisma.client.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!client) throw new Error("The tenant has no learner to attribute attempts to.");

    const stamp = Date.now();
    const t = tenant.id;
    const course = await prisma.course.create({
      data: { tenantId: t, title: `Quiz attempts verification ${stamp}`, slug: `quiz-attempts-verification-${stamp}`, status: "DRAFT" },
      select: { id: true },
    });
    const otherCourse = await prisma.course.create({
      data: { tenantId: t, title: `Quiz attempts verification B ${stamp}`, slug: `quiz-attempts-verification-b-${stamp}`, status: "DRAFT" },
      select: { id: true },
    });
    const bank = await prisma.questionBank.create({
      data: { tenantId: t, name: `Quiz attempts verification ${stamp}` },
      select: { id: true },
    });
    const quiz = await prisma.quiz.create({
      data: { tenantId: t, title: `Quiz attempts verification ${stamp}`, passingScore: 70 },
      select: { id: true },
    });

    try {
      const group = await prisma.lessonGroup.create({
        data: { tenantId: t, courseId: course.id, title: "Cells", sortOrder: 0 },
        select: { id: true },
      });
      const reading = await prisma.lesson.create({
        data: { tenantId: t, courseId: course.id, groupId: group.id, title: "The cell membrane", sortOrder: 0, contentType: "HTML", contentJson: { html: LESSON_HTML } },
        select: { id: true },
      });
      const quizLesson = await prisma.lesson.create({
        data: { tenantId: t, courseId: course.id, groupId: group.id, title: "Check", sortOrder: 1, contentType: "QUIZ", contentJson: { quizId: quiz.id } },
        select: { id: true },
      });

      const choice = await prisma.question.create({
        data: { tenantId: t, bankId: bank.id, type: "SINGLE_CHOICE", prompt: "Which structure controls what enters a cell?", optionsJson: ["Nucleus", "Cell membrane", "Ribosome"], answerJson: [1], points: 1, hint: "Think about the cell's boundary.", sourceLessonId: reading.id, sourceAnchor: "what-the-membrane-does", sourceExcerpt: "selectively permeable" },
        select: { id: true },
      });
      const essayQuestion = await prisma.question.create({
        data: { tenantId: t, bankId: bank.id, type: "ESSAY", prompt: "Describe two functions of the cell membrane and explain each.", optionsJson: [], answerJson: [], rubricJson: RUBRIC as object, points: 3 },
        select: { id: true },
      });
      await prisma.quizQuestion.createMany({
        data: [
          { tenantId: t, quizId: quiz.id, questionId: choice.id, sortOrder: 0 },
          { tenantId: t, quizId: quiz.id, questionId: essayQuestion.id, sortOrder: 1 },
        ],
      });

      /* ---- The teaching material a quiz tests ---- */

      const context = await buildQuizContext(quiz.id);
      check(
        "the quiz's lesson is found by a database filter on its quiz id",
        context.includes("selectively permeable"),
        `context was: ${JSON.stringify(context.slice(0, 160))}`
      );
      check(
        "…and is plain text, with the lesson title as a heading",
        context.startsWith("## The cell membrane") && !context.includes("<h2"),
        context.slice(0, 80)
      );
      eq(
        "a course that does not contain the quiz contributes no material",
        await buildQuizContext(quiz.id, { courseId: otherCourse.id }),
        ""
      );
      check(
        "naming the right course finds the same material",
        (await buildQuizContext(quiz.id, { courseId: course.id })) === context
      );

      const loaded = await loadQuizForGrading(quiz.id, t);
      if (!loaded) throw new Error("fixture quiz did not load");

      /* ---- Manual marking ---- */

      const mark = (first: number, second: number): EssayGradeMap => ({
        [essayQuestion.id]: {
          questionId: essayQuestion.id,
          criteria: [
            { id: "names-two", score01: first, comment: "Marked by your instructor." },
            { id: "explains", score01: second, comment: "Marked by your instructor." },
          ],
          feedback: "Marked by your instructor.",
          flags: [],
        },
      });
      const answers = { [choice.id]: [1], [essayQuestion.id]: GOOD_ESSAY };

      const full = await evaluateAnswers({ quiz: loaded, answers, clientId: client.id, manualGrades: mark(1, 1) });
      eq(
        "full marks by hand: 100%, passed, perfect, no model asked",
        full.graded ? [full.scorePercent, full.passed, full.perfect, full.usedAi] : "ungraded",
        [100, true, true, false]
      );

      const nearly = await evaluateAnswers({ quiz: loaded, answers, clientId: client.id, manualGrades: mark(1, 0.8) });
      eq(
        "one criterion 'mostly met': 93% — passes a 70% mark without being perfect",
        nearly.graded ? [nearly.scorePercent, nearly.passed, nearly.perfect] : "ungraded",
        [93, true, false]
      );

      const weak = await evaluateAnswers({
        quiz: loaded,
        answers: { [choice.id]: [0], [essayQuestion.id]: GOOD_ESSAY },
        clientId: client.id,
        manualGrades: mark(0.5, 0),
      });
      // 0 of 1 on the choice; the essay earns (0.5 + 0) / 2 of its 3 points = 0.75.
      // 0.75 of 4 points is 18.75%, shown as 19.
      eq(
        "a wrong choice and a weak essay: 19% — fails",
        weak.graded ? [weak.scorePercent, weak.passed] : "ungraded",
        [19, false]
      );

      /* ---- What the learner is told ---- */

      if (nearly.graded && weak.graded) {
        const passedPayload = learnerAttemptPayload("a1", nearly, "GRADED");
        eq("a passed attempt reveals which questions were right", passedPayload.results, {
          [choice.id]: true,
          [essayQuestion.id]: false,
        });
        const failedPayload = learnerAttemptPayload("a2", weak, "GRADED");
        eq(
          "a failed attempt reveals a count, not which questions",
          [failedPayload.results, failedPayload.incorrectCount, failedPayload.attempt.passMark],
          [null, 2, 70]
        );
        check(
          "essay feedback is included even on a failed attempt",
          failedPayload.essayFeedback[essayQuestion.id]?.criteria.length === 2
        );
        check(
          "the learner is never sent the answer key or the rubric's model answer",
          !JSON.stringify([passedPayload, failedPayload]).includes("holds the cell's contents together") &&
            !JSON.stringify([passedPayload, failedPayload]).includes("answerJson")
        );
      }

      /* ---- Hints and read-up links ---- */

      eq(
        "the quiz is loaded with its switches, hints and sources",
        [
          loaded.hintsEnabled,
          loaded.showReviewLinks,
          loaded.questions[0].question.hint,
          loaded.questions[0].question.sourceAnchor,
          loaded.questions[1].question.hint,
        ],
        [true, true, "Think about the cell's boundary.", "what-the-membrane-does", null]
      );

      // The course the learner reaches the quiz through decides which lessons a
      // review link may point into — so it has to be found the same way the
      // quiz itself is gated.
      eq("a learner who is not enrolled cannot reach the quiz", await findQuizCourse(client.id, quiz.id), null);
      const enrollment = await prisma.enrollment.create({
        data: { tenantId: t, courseId: course.id, clientId: client.id },
        select: { id: true },
      });
      eq(
        "enrolled, but with the lesson before it unfinished, the quiz is still locked",
        await findQuizCourse(client.id, quiz.id),
        null
      );
      await prisma.lessonProgress.create({
        data: { tenantId: t, enrollmentId: enrollment.id, lessonId: reading.id, completedAt: new Date() },
      });
      const reachable = await findQuizCourse(client.id, quiz.id);
      eq(
        "once that lesson is complete the quiz is reachable, through that course",
        [reachable?.courseId, reachable?.quizLessonId],
        [course.id, quizLesson.id]
      );

      if (nearly.graded && weak.graded && reachable) {
        const withLinks = learnerAttemptPayload("a3", weak, "GRADED", { quiz: loaded, course: reachable });
        eq("a failed attempt names the questions to review, each with its link or none", withLinks.review, [
          {
            questionId: choice.id,
            source: {
              lessonId: reading.id,
              lessonTitle: "The cell membrane",
              anchor: "what-the-membrane-does",
              heading: "What the membrane does",
              excerpt: "selectively permeable",
            },
          },
          { questionId: essayQuestion.id, source: null },
        ]);
        eq("…and still carries no right/wrong map", withLinks.results, null);
        check(
          "…nor anything about the answers themselves",
          !JSON.stringify(withLinks).includes("answerJson") &&
            !JSON.stringify(withLinks).includes("Ribosome") &&
            !JSON.stringify(withLinks).includes("holds the cell's contents together")
        );
        eq(
          "a passed attempt has no review list",
          learnerAttemptPayload("a4", nearly, "GRADED", { quiz: loaded, course: reachable }).review,
          null
        );
        eq(
          "a quiz with review links switched off sends no list",
          learnerAttemptPayload("a5", weak, "GRADED", { quiz: { ...loaded, showReviewLinks: false }, course: reachable }).review,
          null
        );
        eq(
          "with no course to link into, the questions are named but nothing is linked",
          learnerAttemptPayload("a6", weak, "GRADED", { quiz: loaded, course: null }).review?.map((r) => r.source),
          [null, null]
        );

        // The author moves the reading lesson to after the quiz. For a learner
        // who has not finished it, the link must go: it would be a way past the lock.
        const moved = {
          ...reachable,
          lessons: [...reachable.lessons].reverse(),
          completed: new Set<string>(),
        };
        eq(
          "a source lesson the learner has not unlocked is named but not linked",
          learnerAttemptPayload("a7", weak, "GRADED", { quiz: loaded, course: moved }).review?.map((r) => r.source),
          [null, null]
        );
      }

      // What an author may save as a question's source.
      const tryToSave = async (input: QuestionSourceInput) => {
        try {
          await resolveQuestionSource(t, input);
          return "accepted";
        } catch (e) {
          return (e as { code?: string }).code ?? "threw";
        }
      };
      eq(
        "a source is checked when it is saved: missing heading, quiz lesson, missing lesson",
        [
          await tryToSave({ lessonId: reading.id, anchor: "sec-not-in-the-lesson" }),
          await tryToSave({ lessonId: quizLesson.id }),
          await tryToSave({ lessonId: "no-such-lesson" }),
        ],
        ["invalid_source", "invalid_source", "invalid_source"]
      );
      eq(
        "a valid source is stored tidied; null clears it",
        [
          await resolveQuestionSource(t, { lessonId: reading.id, anchor: " what-the-membrane-does ", excerpt: "  selectively permeable " }),
          await resolveQuestionSource(t, { lessonId: reading.id }),
          await resolveQuestionSource(t, null),
        ],
        [
          { sourceLessonId: reading.id, sourceAnchor: "what-the-membrane-does", sourceExcerpt: "selectively permeable" },
          { sourceLessonId: reading.id, sourceAnchor: null, sourceExcerpt: null },
          { sourceLessonId: null, sourceAnchor: null, sourceExcerpt: null },
        ]
      );
      eq(
        "the quiz builder is offered the reading lessons of the quiz's own course, with their headings",
        (await loadQuizSources(t, quiz.id)).map((c) => [c.id, c.lessons.map((l) => [l.id, l.headings.map((h) => h.id)])]),
        [[course.id, [[reading.id, ["what-the-membrane-does"]]]]]
      );

      /* ---- The lesson gate, against real rows ---- */

      const gate = (passMark: number) =>
        prisma.quizAttempt.findFirst({
          where: { quizId: quiz.id, clientId: client.id, ...passingAttemptWhere(passMark) },
          select: { id: true, scorePercent: true },
        });

      eq("with no attempts, nothing passes the gate", await gate(70), null);

      const submittedAt = new Date();
      await prisma.quizAttempt.create({
        data: { tenantId: t, quizId: quiz.id, clientId: client.id, submittedAt, gradingStatus: "PENDING", gradingError: "unavailable: test", resultsJson: {} },
      });
      await prisma.quizAttempt.create({
        data: { tenantId: t, quizId: quiz.id, clientId: client.id, submittedAt, gradingStatus: "FAILED", gradingError: "credits: test", resultsJson: {} },
      });
      eq("attempts that were never graded unlock nothing, even at a pass mark of 0", await gate(0), null);

      // Graded before pass marks were enforced: `passed` was set from a mark
      // that gated nothing, and `passMarkApplied` is NULL.
      const legacy = await prisma.quizAttempt.create({
        data: { tenantId: t, quizId: quiz.id, clientId: client.id, submittedAt, scorePercent: 60, passed: true, gradingStatus: "GRADED", gradedAt: submittedAt, resultsJson: {} },
        select: { id: true },
      });
      eq("an old attempt at 60% does not pass a 70% mark on its old `passed` flag", await gate(70), null);
      eq("…but does pass once the mark is 60%", (await gate(60))?.id, legacy.id);

      if (nearly.graded) {
        const stored = await prisma.quizAttempt.create({
          data: { tenantId: t, quizId: quiz.id, clientId: client.id, submittedAt, answersJson: answers as object, ...gradedAttemptData(nearly) },
          select: { id: true, passMarkApplied: true, passed: true, gradingStatus: true },
        });
        eq(
          "a graded attempt records the pass mark it was held to",
          [stored.passMarkApplied, stored.passed, stored.gradingStatus],
          [70, true, "GRADED"]
        );
        eq("it passes at the mark in force (70%)", (await gate(70))?.id, stored.id);
        eq(
          "…and still counts after the author raises the mark to 95%, above its 93% score",
          (await gate(95))?.id,
          stored.id
        );
      }

      /* ---- Real essay grading ---- */

      if (runAi) {
        console.log("\nGrading a real essay through the application's own grader…");
        const started = Date.now();
        const graded = await evaluateAnswers({ quiz: loaded, answers, clientId: client.id, courseId: course.id });
        const took = ((Date.now() - started) / 1000).toFixed(1);
        check(
          `a good essay is graded by the model (${took}s)`,
          graded.graded,
          graded.graded ? "" : `${graded.error}`
        );
        if (graded.graded) {
          console.log(`      score ${graded.scorePercent}%, essay ${JSON.stringify(graded.results[essayQuestion.id].criteria?.map((c) => [c.id, c.score01]))}`);
          check("…the model was actually asked", graded.usedAi);
          check("…and a good answer passes the 70% mark", graded.passed, `${graded.scorePercent}%`);
          check("…with feedback for the learner", (graded.results[essayQuestion.id].feedback ?? "").length > 20);
          check("…and a key that lets the grade be reused", typeof graded.results[essayQuestion.id].gradeKey === "string");

          await prisma.quizAttempt.create({
            data: { tenantId: t, quizId: quiz.id, clientId: client.id, submittedAt: new Date(Date.now() + 1000), answersJson: answers as object, ...gradedAttemptData(graded) },
          });

          const again = await evaluateAnswers({
            quiz: loaded,
            // Same essay, different answer to the other question.
            answers: { [choice.id]: [0], [essayQuestion.id]: GOOD_ESSAY },
            clientId: client.id,
            courseId: course.id,
          });
          eq(
            "resubmitting the same essay keeps its grade and asks the model nothing",
            again.graded
              ? [again.usedAi, again.results[essayQuestion.id].earned === graded.results[essayQuestion.id].earned]
              : "ungraded",
            [false, true]
          );
        }
      } else {
        console.log("\n(skipped real essay grading — pass --ai to include it)");
      }

      /* ---- A source lesson that is deleted ---- */

      await prisma.lesson.delete({ where: { id: reading.id } });
      eq(
        "deleting a lesson removes the links into it, not the questions",
        await prisma.question.findUnique({ where: { id: choice.id }, select: { sourceLessonId: true, prompt: true } }),
        { sourceLessonId: null, prompt: "Which structure controls what enters a cell?" }
      );
    } finally {
      // Quiz first: its attempts and question links cascade with it.
      await prisma.quiz.delete({ where: { id: quiz.id } });
      await prisma.questionBank.delete({ where: { id: bank.id } });
      await prisma.course.delete({ where: { id: course.id } });
      await prisma.course.delete({ where: { id: otherCourse.id } });
      console.log("\nCleaned up the verification course, quiz and question bank.");
    }
  });

  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
}

main()
  .catch((e) => {
    console.error("\nVerification crashed:", e);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
