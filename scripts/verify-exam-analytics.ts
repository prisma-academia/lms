/**
 * Exam analytics on synthetic data: descriptive statistics, item analysis
 * (facility, discrimination, point-biserial, distractors, flags), the
 * integrity summary and the similarity screen. Pure: no database, no network.
 *
 *   npm run verify:exam-analytics
 */
import {
  computeExamAnalytics,
  extremeGroups,
  flagsFor,
  histogram,
  mean,
  median,
  niceStep,
  pearson,
  sd,
  similarityScreen,
  summarize,
  type AnalyticsAttemptInput,
  type AnalyticsInput,
  type AnalyticsItemInput,
} from "../lib/exams/analytics";

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`✗ ${name}`, extra ?? "");
  }
}
const near = (a: number | null, b: number, eps = 1e-6) => a !== null && Math.abs(a - b) <= eps;

/** Deterministic 0..1 generator (LCG), so the fixtures never flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function basics() {
  check("mean", near(mean([1, 2, 3, 4]), 2.5));
  check("mean empty", mean([]) === null);
  check("median odd", median([5, 1, 3]) === 3);
  check("median even", median([4, 1, 3, 2]) === 2.5);
  check("sd sample", near(sd([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935, 1e-6), sd([2, 4, 4, 4, 5, 5, 7, 9]));
  check("sd single", sd([7]) === 0);
  const s = summarize([10, 20, 30]);
  check("summary min/max", s.min === 10 && s.max === 30 && s.count === 3);
  check("pearson perfect", near(pearson([1, 2, 3], [2, 4, 6]), 1));
  check("pearson inverse", near(pearson([1, 2, 3], [3, 2, 1]), -1));
  check("pearson no variance", pearson([1, 1, 1], [1, 2, 3]) === null);
  const h = histogram([0, 9.99, 10, 55, 100, 100, -5, 120], 10, 0, 100);
  check("histogram bins", h.length === 10 && h[0].from === 0 && h[9].to === 100);
  check("histogram first bucket", h[0].count === 3, h); // 0, 9.99, -5 (clamped)
  check("histogram 10 starts bucket 2", h[1].count === 1);
  check("histogram 100 in last bucket", h[9].count === 3, h); // 100, 100, 120 (clamped)
  check("histogram total", h.reduce((n, b) => n + b.count, 0) === 8);
  check("niceStep", niceStep(0) === 1 && niceStep(3) === 5 && niceStep(7) === 10 && niceStep(200) === 240);
  check("flags need responses", flagsFor({ responses: 2, p: 1, d: null, r: null }).length === 0);
  check("flag too easy", flagsFor({ responses: 10, p: 0.95, d: 0.3, r: 0.3 }).join() === "too_easy");
  check("flag too hard", flagsFor({ responses: 10, p: 0.1, d: 0.3, r: 0.3 }).join() === "too_hard");
  check("flag check key on negative r", flagsFor({ responses: 10, p: 0.5, d: 0.25, r: -0.1 }).join() === "check_key");
  check("flag weak", flagsFor({ responses: 10, p: 0.5, d: 0.1, r: 0.1 }).join() === "weak");
  check("flag none", flagsFor({ responses: 10, p: 0.5, d: 0.5, r: 0.4 }).length === 0);
}

/**
 * 40 candidates with ability 0..1 sit 12 four-option single-choice items.
 *   q0–q7  normal: right when ability > difficulty
 *   q8     everyone right (too easy)
 *   q9     nobody right (too hard)
 *   q10    mis-keyed: the weak get it "right"
 *   q11    essay worth 10, marked by staff; two still pending
 * Candidates c00 and c01 copied each other: identical wrong answers throughout.
 */
function fixture(): AnalyticsInput {
  const items: AnalyticsItemInput[] = [];
  for (let j = 0; j < 11; j++) {
    items.push({
      key: `q${j}`,
      questionId: `q${j}`,
      sectionId: j < 6 ? "s1" : "s2",
      n: j + 1,
      type: "SINGLE_CHOICE",
      prompt: `Question ${j + 1}`,
      points: 1,
      options: ["A", "B", "C", "D"],
      correct: [0],
    });
  }
  items.push({ key: "q11", questionId: "q11", sectionId: "s2", n: 12, type: "ESSAY", prompt: "Essay", points: 10, options: null, correct: null });

  const rand = rng(42);
  const attempts: AnalyticsAttemptInput[] = [];
  const copied: number[] = [];
  for (let i = 0; i < 40; i++) {
    const ability = i / 39;
    const responses: AnalyticsAttemptInput["responses"] = {};
    let earned = 0;
    const sec: Record<string, { earned: number; max: number }> = { s1: { earned: 0, max: 6 }, s2: { earned: 0, max: 15 } };
    for (let j = 0; j < 11; j++) {
      const difficulty = 0.1 + (j / 8) * 0.8;
      let right: boolean;
      if (j === 8) right = true;
      else if (j === 9) right = false;
      else if (j === 10) right = ability < 0.5;
      else right = ability > difficulty;
      let pick = 0;
      if (!right) {
        if (i <= 1) {
          // The copying pair: the same wrong answer, chosen once.
          if (i === 0) copied[j] = 1 + Math.floor(rand() * 3);
          pick = copied[j];
        } else pick = 1 + Math.floor(rand() * 3);
      }
      const omit = !right && i === 39 && j === 9; // one omission
      const pts = omit ? 0 : right ? 1 : 0;
      responses[`q${j}`] = { earned: pts, max: 1, answered: !omit, picks: omit ? null : [pick], timeSpentSec: 30 + j };
      earned += pts;
      sec[j < 6 ? "s1" : "s2"].earned += pts;
    }
    const pending = i === 5 || i === 6;
    const essay = pending ? null : Math.round(ability * 10 * 2) / 2;
    responses.q11 = { earned: essay, max: 10, answered: true, picks: null, timeSpentSec: 600 };
    earned += essay ?? 0;
    sec.s2.earned += essay ?? 0;
    const pct = (earned / 21) * 100;
    attempts.push({
      id: `a${String(i).padStart(2, "0")}`,
      label: `Candidate ${i}`,
      candidateNo: `C${String(i).padStart(2, "0")}`,
      scorePoints: earned,
      maxPoints: 21,
      scorePercent: Math.round(pct * 100) / 100,
      passed: pct >= 50,
      grade: pct >= 70 ? "A" : pct >= 50 ? "C" : "F",
      graded: !pending,
      durationSec: 600 + i * 30,
      sectionScores: sec,
      violationCount: i % 7 === 0 ? 4 : i % 5 === 0 ? 1 : 0,
      wasLocked: i === 14,
      offlineSubmitted: i === 3,
      sebVerified: i % 2 === 0,
      responses,
    });
  }
  return {
    items,
    sections: [
      { id: "s1", title: "Part A" },
      { id: "s2", title: "Part B" },
    ],
    bands: [
      { label: "F", min: 0 },
      { label: "A", min: 70 },
      { label: "C", min: 50 },
    ],
    attempts,
  };
}

function scenario() {
  const input = fixture();
  const a = computeExamAnalytics(input);

  check("count", a.count === 40);
  check("pending", a.pending === 2);
  check("histogram sums to count", a.histogram.reduce((n, b) => n + b.count, 0) === 40);
  check("pass rate in 0..1", a.passRate !== null && a.passRate > 0 && a.passRate < 1, a.passRate);
  check("passed count matches", a.passed === input.attempts.filter((x) => x.passed).length);
  check("grade bands highest first", a.grades.map((g) => g.label).join() === "A,C,F", a.grades);
  check("grade counts sum", a.grades.reduce((n, g) => n + g.count, 0) === 40);
  check("two sections", a.sections.length === 2 && a.sections[0].title === "Part A");
  check("section mean in range", a.sections.every((s) => s.meanPercent !== null && s.meanPercent >= 0 && s.meanPercent <= 100));
  check("time bins", a.time.bins.length === 10 && a.time.bins.reduce((n, b) => n + b.count, 0) === 40, a.time);
  check("time binMinutes covers longest", a.time.binMinutes * 10 >= 600 / 60 + (39 * 30) / 60, a.time.binMinutes);
  check("score mean matches", near(a.score.mean, Math.round(mean(input.attempts.map((x) => x.scorePercent))! * 100) / 100, 0.01));

  const byKey = new Map(a.items.map((i) => [i.key, i]));
  const good = byKey.get("q3")!;
  check("good item discriminates", good.d !== null && good.d > 0.5, good);
  check("good item r positive", good.r !== null && good.r > 0.3, good);
  check("good item not flagged", good.flags.length === 0, good.flags);
  const easy = byKey.get("q8")!;
  check("easy p = 1", easy.p === 1, easy);
  check("easy flagged", easy.flags.includes("too_easy"), easy.flags);
  check("easy r null (no variance)", easy.r === null);
  const hard = byKey.get("q9")!;
  check("hard p = 0", hard.p === 0);
  check("hard flagged", hard.flags.includes("too_hard"), hard.flags);
  check("hard one omitted", hard.omitted === 1 && hard.answered === 39, hard);
  const miskey = byKey.get("q10")!;
  check("miskeyed D negative", miskey.d !== null && miskey.d < 0, miskey);
  check("miskeyed r negative", miskey.r !== null && miskey.r < 0, miskey);
  check("miskeyed flagged check_key", miskey.flags.includes("check_key"), miskey.flags);

  const opts = good.options!;
  check("options listed", opts.length === 4);
  check("correct option marked", opts[0].correct && !opts[1].correct);
  check("option counts sum to answered", opts.reduce((n, o) => n + o.count, 0) === good.answered);
  check("avg time", good.avgTimeSec === 33);

  const essay = byKey.get("q11")!;
  check("essay pending excluded", essay.pending === 2 && essay.responses === 38, essay);
  check("essay no options", essay.options === null);
  check("essay discriminates", essay.d !== null && essay.d > 0.5);

  const g = extremeGroups(input.attempts)!;
  check("27% groups", g.top.size === 11 && g.bottom.size === 11);
  check("groups disjoint", [...g.top].every((id) => !g.bottom.has(id)));

  // Integrity.
  check("integrity attempts", a.integrity.attempts === 40);
  check("integrity locked", a.integrity.locked === 1);
  check("integrity offline", a.integrity.offlineSubmitted === 1);
  check("integrity seb rate", a.integrity.sebRate === 0.5);
  check("integrity distribution sums", a.integrity.distribution.reduce((n, b) => n + b.count, 0) === 40);
  check("integrity top violator", a.integrity.topViolators[0]?.violations === 4);

  // Similarity: the copying pair surfaces first.
  const sim = a.similarity;
  check("similarity ran", sim.ran && sim.choiceItems === 11 && sim.pairsCompared === 780, sim);
  const first = sim.pairs[0];
  check(
    "copying pair is top",
    !!first && [first.a.attemptId, first.b.attemptId].sort().join() === "a00,a01",
    sim.pairs.slice(0, 3)
  );
  check("copying pair share is 1", first?.share === 1, first);
  check("copying pair z high", (first?.z ?? 0) >= 2, first);
  check("at most 20 pairs", sim.pairs.length <= 20);

  // Similarity limits.
  const tooMany = similarityScreen({ ...input, options: { similarityMaxAttempts: 10 } });
  check("similarity skipped above limit", !tooMany.ran && tooMany.pairs.length === 0 && !!tooMany.reason);
  const none = similarityScreen({ ...input, attempts: input.attempts.slice(0, 1) });
  check("similarity needs two", !none.ran);

  // Empty exam: no attempts yet.
  const empty = computeExamAnalytics({ ...input, attempts: [] });
  check("empty count", empty.count === 0 && empty.score.mean === null && empty.passRate === null);
  check("empty items", empty.items.every((i) => i.p === null && i.flags.length === 0));
  check("empty histogram zeros", empty.histogram.every((b) => b.count === 0));
}

async function main() {
  basics();
  scenario();
  console.log(`${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
