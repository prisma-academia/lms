/**
 * Lesson-gating and scoring invariants.
 *
 * These functions decide whether a learner can progress and whether a
 * certificate gets issued, so a wrong answer here is either a learner locked
 * out of a course they paid for, or a credential handed to someone who didn't
 * earn it. Pure logic only — no database, so this runs in a second.
 *
 *   npm run verify:gating
 */
import { orderLessons, frontierIndex, isUnlocked, frontierLesson } from "../lib/courses/gating";
import { requiredDwellSeconds, mediaWatched } from "../lib/courses/content-gate";
import { scoreAttempt, gradeObjective, type ScorableQuestion } from "../lib/assessments/scoring";
import { rubricFraction, type EssayRubric, type EssayGrade } from "../lib/schemas/essay-grading";

let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                    */
/* -------------------------------------------------------------------------- */

// sortOrder is not unique, so the id tiebreak is what keeps the client and the
// server agreeing about which lesson is "N". Disagreement = a permanent lock.
check(
  "orderLessons breaks sortOrder ties by id",
  orderLessons([
    { id: "b", sortOrder: 0 },
    { id: "a", sortOrder: 0 },
    { id: "c", sortOrder: -1 },
  ]).map((l) => l.id),
  ["c", "a", "b"]
);

/* -------------------------------------------------------------------------- */
/* Unlock predicate                                                            */
/* -------------------------------------------------------------------------- */

const lessons = [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }, { id: "l5" }];

check("nothing completed: only the first lesson is unlocked", [
  isUnlocked(lessons, new Set(), "l1"),
  isUnlocked(lessons, new Set(), "l2"),
], [true, false]);

check(
  "completing in order advances the frontier by one",
  isUnlocked(lessons, new Set(["l1"]), "l2"),
  true
);

check("the frontier never skips ahead", isUnlocked(lessons, new Set(["l1"]), "l3"), false);

// The reason no backfill or migration of LessonProgress was needed: a learner
// who clicked around under the old ungated player keeps everything they
// finished, and legacy rows can only loosen the gate, never contradict it.
const legacy = new Set(["l1", "l3", "l5"]);
check(
  "legacy out-of-order progress unlocks up to the first gap, no further",
  [
    isUnlocked(lessons, legacy, "l2"),
    isUnlocked(lessons, legacy, "l3"),
    isUnlocked(lessons, legacy, "l4"),
  ],
  [true, true, false]
);

check("frontierIndex is the first incomplete lesson", frontierIndex(lessons, legacy), 1);

check(
  "a fully completed course reports the last lesson, not undefined",
  frontierLesson(lessons, new Set(["l1", "l2", "l3", "l4", "l5"]))?.id,
  "l5"
);

check("an unknown lesson id is never unlocked", isUnlocked(lessons, legacy, "nope"), false);

/* -------------------------------------------------------------------------- */
/* Dwell budget                                                                */
/* -------------------------------------------------------------------------- */

// Imported by BOTH the client hook and the route handler. If these drift, the
// button enables and then the request 409s.
check(
  "QUIZ needs no dwell — the 100% rule is its gate",
  requiredDwellSeconds({ contentType: "QUIZ", contentJson: { quizId: "q1" }, durationMin: null }),
  0
);

check(
  "a one-line lesson clamps to the 15s floor, not a punitive minute",
  requiredDwellSeconds({ contentType: "TEXT", contentJson: { body: "Hello there." }, durationMin: null }),
  15
);

check(
  "a long lesson scales with word count (~240wpm)",
  requiredDwellSeconds({
    contentType: "TEXT",
    contentJson: { body: "word ".repeat(400) },
    durationMin: null,
  }),
  100
);

check(
  "dwell clamps at 180s however long the lesson is",
  requiredDwellSeconds({
    contentType: "TEXT",
    contentJson: { body: "word ".repeat(50_000) },
    durationMin: null,
  }),
  180
);

check(
  "HTML is measured on its text, not its markup",
  requiredDwellSeconds({
    contentType: "HTML",
    contentJson: { html: `<p>${"word ".repeat(400)}</p>` },
    durationMin: null,
  }),
  100
);

check(
  "video dwell is a floor under the real media gate",
  requiredDwellSeconds({ contentType: "VIDEO_URL", contentJson: { url: "x" }, durationMin: 10 }),
  120
);

/* -------------------------------------------------------------------------- */
/* Media progress                                                              */
/* -------------------------------------------------------------------------- */

check("95% of the way through counts as watched", mediaWatched(95, 100, false), true);
check("94% does not", mediaWatched(94, 100, false), false);
check("an explicit completed flag wins", mediaWatched(0, 100, true), true);
check("unknown duration cannot satisfy the gate", mediaWatched(999, null, false), false);

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

const mcq = (id: string, answer: number[]): ScorableQuestion & { effectivePoints: number } => ({
  id,
  type: "SINGLE_CHOICE",
  answerJson: answer,
  points: 1,
  effectivePoints: 1,
});

check(
  "all correct scores 100 and sets perfect",
  (() => {
    const r = scoreAttempt([mcq("a", [0]), mcq("b", [1])], { a: [0], b: [1] });
    return [r.scorePercent, r.perfect];
  })(),
  [100, true]
);

check(
  "one wrong answer is not perfect",
  (() => {
    const r = scoreAttempt([mcq("a", [0]), mcq("b", [1])], { a: [0], b: [0] });
    return [r.scorePercent, r.perfect];
  })(),
  [50, false]
);

check(
  "an unanswered question scores zero rather than throwing",
  scoreAttempt([mcq("a", [0])], {}).scorePercent,
  0
);

// THE ROUNDING GUARD. Without it, 0.997 rounds to 100 and unlocks the lesson.
const rubric: EssayRubric = {
  criteria: [
    { id: "c1", label: "Names the three phases", description: "", weight: 1 },
    { id: "c2", label: "Explains why it fails", description: "", weight: 1 },
  ],
  modelAnswer: null,
  minWords: null,
  maxWords: null,
};

const essayQ = (id: string, points: number): ScorableQuestion & { effectivePoints: number } => ({
  id,
  type: "ESSAY",
  answerJson: [],
  rubricJson: rubric,
  points,
  effectivePoints: points,
});

const nearPerfect: EssayGrade = {
  questionId: "e1",
  criteria: [
    { id: "c1", score01: 1, comment: "ok" },
    { id: "c2", score01: 0.99, comment: "nearly" },
  ],
  feedback: "Close.",
  flags: [],
};

check(
  "a 99.x% attempt is clamped to 99, never rounded up into a pass",
  (() => {
    const r = scoreAttempt(
      [mcq("a", [0]), mcq("b", [0]), mcq("c", [0]), mcq("d", [0]), essayQ("e1", 1)],
      { a: [0], b: [0], c: [0], d: [0], e1: "an answer" },
      { e1: nearPerfect }
    );
    return [r.scorePercent, r.perfect];
  })(),
  [99, false]
);

check(
  "a genuinely complete essay does reach 100",
  (() => {
    const r = scoreAttempt([essayQ("e1", 1)], { e1: "an answer" }, {
      e1: {
        ...nearPerfect,
        criteria: [
          { id: "c1", score01: 1, comment: "ok" },
          { id: "c2", score01: 1, comment: "ok" },
        ],
      },
    });
    return [r.scorePercent, r.perfect];
  })(),
  [100, true]
);

// Fail-closed: a grader that dies, skips a question, or returns junk must never
// be able to hand out a pass. Completion requires 100%.
check(
  "a missing essay grade scores zero, not full marks",
  scoreAttempt([essayQ("e1", 1)], { e1: "an answer" }, {}).scorePercent,
  0
);

check(
  "an essay with no rubric scores zero rather than passing by default",
  scoreAttempt(
    [{ id: "e1", type: "ESSAY", answerJson: [], rubricJson: null, points: 1, effectivePoints: 1 }],
    { e1: "an answer" }
  ).scorePercent,
  0
);

check(
  "gradeObjective returns null for ESSAY so callers can't silently treat it as wrong",
  gradeObjective({ id: "e", type: "ESSAY", answerJson: [], points: 1 }, "text"),
  null
);

/* -------------------------------------------------------------------------- */
/* Rubric folding                                                              */
/* -------------------------------------------------------------------------- */

check(
  "criteria the grader omitted score zero",
  rubricFraction(rubric, {
    questionId: "e1",
    criteria: [{ id: "c1", score01: 1, comment: "ok" }],
    feedback: "x",
    flags: [],
  }),
  0.5
);

check(
  "criteria the grader invented are discarded",
  rubricFraction(rubric, {
    questionId: "e1",
    criteria: [
      { id: "c1", score01: 1, comment: "ok" },
      { id: "c2", score01: 1, comment: "ok" },
      { id: "made-up", score01: 1, comment: "not in the rubric" },
    ],
    feedback: "x",
    flags: [],
  }),
  1
);

check("a null grade scores zero", rubricFraction(rubric, null), 0);

check(
  "weights are relative, not required to sum to 100",
  rubricFraction(
    {
      ...rubric,
      criteria: [
        { id: "c1", label: "a", description: "", weight: 3 },
        { id: "c2", label: "b", description: "", weight: 1 },
      ],
    },
    {
      questionId: "e1",
      criteria: [
        { id: "c1", score01: 1, comment: "" },
        { id: "c2", score01: 0, comment: "" },
      ],
      feedback: "x",
      flags: [],
    }
  ),
  0.75
);

console.log(failed === 0 ? "\nAll gating checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
