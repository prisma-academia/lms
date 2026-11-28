/**
 * Exam results analytics: descriptive statistics, classical item analysis,
 * an integrity summary and a shared-wrong-answer similarity screen.
 *
 * Pure — no Prisma, no I/O — so it can be checked with synthetic data
 * (`npm run verify:exam-analytics`). The loader in `results-data.ts` turns
 * database rows into `AnalyticsInput`.
 *
 * Conventions:
 *  - An item's "fraction" for an attempt is earned / max points, clamped to
 *    0..1 (negative marking can push earned below zero; that is a score
 *    policy, not a sign the item is harder). An unanswered item counts as 0.
 *    An item still waiting for a marker (earned = null) is left out of that
 *    item's statistics, never counted as 0.
 *  - Discrimination D compares the top and bottom 27% of candidates by total
 *    score. Point-biserial r is the CORRECTED item–total correlation: the
 *    item's own points are removed from the total first, so an item does not
 *    correlate with itself.
 */

export const CHOICE_TYPES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] as const;

export function isChoiceType(type: string): boolean {
  return (CHOICE_TYPES as readonly string[]).includes(type);
}

/* ───────────────────────────── input ───────────────────────────── */

export type AnalyticsItemInput = {
  key: string;
  questionId: string;
  sectionId: string;
  /** Display number (first paper position seen). */
  n: number;
  type: string;
  prompt: string;
  points: number;
  /** Choice items: option texts, in authored (original-key) order. */
  options?: string[] | null;
  /** Choice items: the correct option indexes. */
  correct?: number[] | null;
};

export type AnalyticsResponseInput = {
  /** Points earned (manual mark, else auto). NULL = waiting for a marker. */
  earned: number | null;
  /** Max points for this item on this attempt's paper. */
  max: number;
  answered: boolean;
  /** Choice items: picked option indexes (original keys). */
  picks?: number[] | null;
  timeSpentSec?: number;
};

export type AnalyticsAttemptInput = {
  id: string;
  label: string;
  candidateNo: string;
  scorePoints: number;
  maxPoints: number;
  scorePercent: number;
  passed: boolean | null;
  grade: string | null;
  /** False while marks are pending (the score is provisional). */
  graded: boolean;
  durationSec: number | null;
  sectionScores: Record<string, { earned: number; max: number }>;
  violationCount: number;
  wasLocked: boolean;
  offlineSubmitted: boolean;
  sebVerified: boolean;
  /** One entry per item ON THIS ATTEMPT'S PAPER, answered or not. */
  responses: Record<string, AnalyticsResponseInput>;
};

export type AnalyticsInput = {
  items: AnalyticsItemInput[];
  sections: { id: string; title: string }[];
  /** Grade bands, any order. */
  bands: { label: string; min: number }[];
  attempts: AnalyticsAttemptInput[];
  options?: {
    /** Skip the similarity screen above this many attempts. Default 500. */
    similarityMaxAttempts?: number;
    /** Pairs reported. Default 20. */
    similarityTop?: number;
    /** Minimum identical wrong answers before a pair is considered. Default 3. */
    similarityMinIdentical?: number;
    /** Responses an item needs before it is flagged. Default 5. */
    flagMinResponses?: number;
  };
};

/* ───────────────────────────── output ───────────────────────────── */

export type Summary = {
  count: number;
  mean: number | null;
  median: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
};

export type Bin = { from: number; to: number; count: number };

export type ItemFlag = "too_easy" | "too_hard" | "check_key" | "weak";

export type OptionStat = { index: number; text: string; count: number; correct: boolean };

export type ItemStats = {
  key: string;
  questionId: string;
  sectionId: string;
  n: number;
  type: string;
  prompt: string;
  points: number;
  /** Attempts whose paper had this item (scored, i.e. not pending). */
  responses: number;
  answered: number;
  omitted: number;
  pending: number;
  /** Facility: mean fraction of the points earned, 0..1. */
  p: number | null;
  /** Discrimination index, -1..1. */
  d: number | null;
  /** Corrected point-biserial (item–rest) correlation, -1..1. */
  r: number | null;
  meanPoints: number | null;
  avgTimeSec: number | null;
  /** Choice items only. */
  options: OptionStat[] | null;
  flags: ItemFlag[];
};

export type PersonRef = { attemptId: string; label: string; candidateNo: string };

export type SimilarityPair = {
  a: PersonRef;
  b: PersonRef;
  /** Choice items both got wrong with exactly the same answer. */
  identicalWrong: number;
  /** Choice items both got wrong (any answer). */
  jointlyWrong: number;
  /** identicalWrong / jointlyWrong. */
  share: number;
  /** Standard score of identicalWrong against every pair in the exam. */
  z: number | null;
};

export type SimilarityReport = {
  ran: boolean;
  reason: string | null;
  choiceItems: number;
  pairsCompared: number;
  meanIdentical: number;
  sdIdentical: number;
  pairs: SimilarityPair[];
};

export type IntegritySummary = {
  attempts: number;
  totalViolations: number;
  meanViolations: number | null;
  maxViolations: number;
  withViolations: number;
  distribution: { label: string; count: number }[];
  locked: number;
  offlineSubmitted: number;
  sebVerified: number;
  sebRate: number | null;
  topViolators: (PersonRef & { violations: number })[];
};

export type ExamAnalytics = {
  count: number;
  pending: number;
  score: Summary;
  passRate: number | null;
  passed: number;
  histogram: Bin[];
  grades: { label: string; count: number }[];
  sections: { id: string; title: string; meanPercent: number | null; meanEarned: number | null; max: number | null; count: number }[];
  time: { summary: Summary; bins: Bin[]; binMinutes: number };
  items: ItemStats[];
  integrity: IntegritySummary;
  similarity: SimilarityReport;
};

/* ───────────────────────────── basic statistics ───────────────────────────── */

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n − 1). 0 for a single value. */
export function sd(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  if (xs.length === 1) return 0;
  const m = mean(xs)!;
  let ss = 0;
  for (const x of xs) ss += (x - m) ** 2;
  return Math.sqrt(ss / (xs.length - 1));
}

export function summarize(xs: readonly number[]): Summary {
  if (xs.length === 0) return { count: 0, mean: null, median: null, sd: null, min: null, max: null };
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { count: xs.length, mean: mean(xs), median: median(xs), sd: sd(xs), min, max };
}

/** Pearson correlation. NULL when either variable has no variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n))!;
  const my = mean(ys.slice(0, n))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 1e-12 || syy <= 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Equal-width bins over [lo, hi]. A value equal to `hi` lands in the last bin;
 * values outside the range are clamped into the end bins.
 */
export function histogram(xs: readonly number[], bins: number, lo: number, hi: number): Bin[] {
  const width = (hi - lo) / bins;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  if (width <= 0) return out;
  for (const x of xs) {
    let i = Math.floor((x - lo) / width);
    if (i < 0) i = 0;
    if (i >= bins) i = bins - 1;
    out[i].count++;
  }
  return out;
}

function fractionOf(r: AnalyticsResponseInput): number | null {
  if (r.earned === null) return null;
  if (r.max <= 0) return null;
  return Math.min(1, Math.max(0, r.earned / r.max));
}

function round(n: number | null, dp = 4): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function roundSummary(s: Summary, dp = 2): Summary {
  return { count: s.count, mean: round(s.mean, dp), median: round(s.median, dp), sd: round(s.sd, dp), min: round(s.min, dp), max: round(s.max, dp) };
}

const ref = (a: AnalyticsAttemptInput): PersonRef => ({ attemptId: a.id, label: a.label, candidateNo: a.candidateNo });

/* ───────────────────────────── item analysis ───────────────────────────── */

export function flagsFor(s: { responses: number; p: number | null; d: number | null; r: number | null }, minResponses = 5): ItemFlag[] {
  if (s.responses < minResponses) return [];
  const flags: ItemFlag[] = [];
  if (s.p !== null && s.p > 0.9) flags.push("too_easy");
  if (s.p !== null && s.p < 0.2) flags.push("too_hard");
  if ((s.d !== null && s.d < 0) || (s.r !== null && s.r < 0)) flags.push("check_key");
  else if (s.d !== null && s.d < 0.2) flags.push("weak");
  return flags;
}

/** Top and bottom 27% of attempts by total score. */
export function extremeGroups(attempts: readonly AnalyticsAttemptInput[]): { top: Set<string>; bottom: Set<string> } | null {
  if (attempts.length < 4) return null;
  const g = Math.max(1, Math.round(attempts.length * 0.27));
  // Ties broken by id so the split is deterministic.
  const sorted = [...attempts].sort((a, b) => b.scorePercent - a.scorePercent || (a.id < b.id ? -1 : 1));
  return {
    top: new Set(sorted.slice(0, g).map((a) => a.id)),
    bottom: new Set(sorted.slice(-g).map((a) => a.id)),
  };
}

function analyseItems(input: AnalyticsInput): ItemStats[] {
  const minResponses = input.options?.flagMinResponses ?? 5;
  const groups = extremeGroups(input.attempts);
  return input.items.map((item) => {
    const fr: number[] = [];
    const rest: number[] = [];
    const earned: number[] = [];
    const times: number[] = [];
    const top: number[] = [];
    const bottom: number[] = [];
    let answered = 0;
    let omitted = 0;
    let pending = 0;
    const choice = isChoiceType(item.type) && item.options ? item.options : null;
    const counts = choice ? new Array<number>(choice.length).fill(0) : null;

    for (const a of input.attempts) {
      const r = a.responses[item.key];
      if (!r) continue;
      if (r.answered) answered++;
      else omitted++;
      if (counts && r.picks) for (const k of r.picks) if (k >= 0 && k < counts.length) counts[k]++;
      if (r.answered && typeof r.timeSpentSec === "number" && r.timeSpentSec > 0) times.push(r.timeSpentSec);
      const f = fractionOf(r);
      if (f === null) {
        if (r.earned === null) pending++;
        continue;
      }
      fr.push(f);
      earned.push(r.earned ?? 0);
      const restMax = a.maxPoints - r.max;
      rest.push(restMax > 0 ? ((a.scorePoints - (r.earned ?? 0)) / restMax) * 100 : 0);
      if (groups?.top.has(a.id)) top.push(f);
      if (groups?.bottom.has(a.id)) bottom.push(f);
    }

    const p = mean(fr);
    const d = groups && top.length && bottom.length ? mean(top)! - mean(bottom)! : null;
    const r = pearson(fr, rest);
    const correct = new Set(item.correct ?? []);
    const stats = {
      key: item.key,
      questionId: item.questionId,
      sectionId: item.sectionId,
      n: item.n,
      type: item.type,
      prompt: item.prompt,
      points: item.points,
      responses: fr.length,
      answered,
      omitted,
      pending,
      p: round(p),
      d: round(d),
      r: round(r),
      meanPoints: round(mean(earned), 2),
      avgTimeSec: round(mean(times), 1),
      options: choice && counts ? choice.map((text, index) => ({ index, text, count: counts[index], correct: correct.has(index) })) : null,
      flags: [] as ItemFlag[],
    };
    stats.flags = flagsFor({ responses: stats.responses, p, d, r }, minResponses);
    return stats;
  });
}

/* ───────────────────────────── similarity ───────────────────────────── */

/**
 * Pairs of candidates who got the same choice items wrong IN THE SAME WAY far
 * more often than the exam's pairs do on average. A screen, not a verdict: a
 * popular distractor is shared honestly, and a pair the screen lists needs a
 * human look at seating, timing and the integrity log.
 */
export function similarityScreen(input: AnalyticsInput): SimilarityReport {
  const max = input.options?.similarityMaxAttempts ?? 500;
  const top = input.options?.similarityTop ?? 20;
  const minIdentical = input.options?.similarityMinIdentical ?? 3;
  const choiceKeys = input.items.filter((i) => isChoiceType(i.type)).map((i) => i.key);
  const empty = (reason: string | null): SimilarityReport => ({
    ran: reason === null,
    reason,
    choiceItems: choiceKeys.length,
    pairsCompared: 0,
    meanIdentical: 0,
    sdIdentical: 0,
    pairs: [],
  });
  const n = input.attempts.length;
  if (n < 2) return empty("At least two finished attempts are needed.");
  if (n > max) return empty(`Skipped: more than ${max} attempts.`);
  if (choiceKeys.length === 0) return empty("The exam has no choice questions to compare.");

  // Per attempt: item key → signature of the wrong answer given.
  const wrong: Map<string, string>[] = input.attempts.map((a) => {
    const m = new Map<string, string>();
    for (const key of choiceKeys) {
      const r = a.responses[key];
      if (!r || !r.answered || !r.picks?.length) continue;
      const f = fractionOf(r);
      if (f === null || f >= 1) continue;
      m.set(key, [...r.picks].sort((x, y) => x - y).join(","));
    }
    return m;
  });

  // Inverted index: (item, wrong answer) → attempts that gave it.
  const groups = new Map<string, number[]>();
  wrong.forEach((m, i) => {
    for (const [key, sig] of m) {
      const g = `${key}\u0000${sig}`;
      const list = groups.get(g);
      if (list) list.push(i);
      else groups.set(g, [i]);
    }
  });
  const identical = new Map<number, number>();
  for (const list of groups.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const id = list[x] * n + list[y];
        identical.set(id, (identical.get(id) ?? 0) + 1);
      }
    }
  }

  const pairsTotal = (n * (n - 1)) / 2;
  let sum = 0;
  let sumSq = 0;
  for (const c of identical.values()) {
    sum += c;
    sumSq += c * c;
  }
  const m = sum / pairsTotal;
  const variance = Math.max(0, sumSq / pairsTotal - m * m);
  const s = Math.sqrt(variance);

  const pairs: SimilarityPair[] = [];
  for (const [id, count] of identical) {
    if (count < minIdentical) continue;
    const i = Math.floor(id / n);
    const j = id % n;
    let joint = 0;
    const [small, big] = wrong[i].size <= wrong[j].size ? [wrong[i], wrong[j]] : [wrong[j], wrong[i]];
    for (const key of small.keys()) if (big.has(key)) joint++;
    const share = joint > 0 ? count / joint : 0;
    const z = s > 0 ? (count - m) / s : null;
    // Unusual: well above the exam's pairs, or nearly every shared mistake identical.
    const unusual = (z !== null && z >= 2) || (share >= 0.6 && count >= 5);
    if (!unusual) continue;
    pairs.push({
      a: ref(input.attempts[i]),
      b: ref(input.attempts[j]),
      identicalWrong: count,
      jointlyWrong: joint,
      share: round(share)!,
      z: round(z, 2),
    });
  }
  pairs.sort((p, q) => q.identicalWrong - p.identicalWrong || q.share - p.share);
  return {
    ran: true,
    reason: null,
    choiceItems: choiceKeys.length,
    pairsCompared: pairsTotal,
    meanIdentical: round(m, 3)!,
    sdIdentical: round(s, 3)!,
    pairs: pairs.slice(0, top),
  };
}

/* ───────────────────────────── integrity ───────────────────────────── */

export function integritySummary(attempts: readonly AnalyticsAttemptInput[]): IntegritySummary {
  const v = attempts.map((a) => a.violationCount);
  const buckets: { label: string; test: (x: number) => boolean }[] = [
    { label: "0", test: (x) => x === 0 },
    { label: "1–2", test: (x) => x >= 1 && x <= 2 },
    { label: "3–5", test: (x) => x >= 3 && x <= 5 },
    { label: "6–10", test: (x) => x >= 6 && x <= 10 },
    { label: "11+", test: (x) => x > 10 },
  ];
  const seb = attempts.filter((a) => a.sebVerified).length;
  return {
    attempts: attempts.length,
    totalViolations: v.reduce((n, x) => n + x, 0),
    meanViolations: round(mean(v), 2),
    maxViolations: v.length ? Math.max(...v) : 0,
    withViolations: v.filter((x) => x > 0).length,
    distribution: buckets.map((b) => ({ label: b.label, count: v.filter(b.test).length })),
    locked: attempts.filter((a) => a.wasLocked).length,
    offlineSubmitted: attempts.filter((a) => a.offlineSubmitted).length,
    sebVerified: seb,
    sebRate: attempts.length ? round(seb / attempts.length) : null,
    topViolators: [...attempts]
      .filter((a) => a.violationCount > 0)
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, 10)
      .map((a) => ({ ...ref(a), violations: a.violationCount })),
  };
}

/* ───────────────────────────── everything ───────────────────────────── */

/** A "nice" bin width in minutes so the time axis reads 0, 5, 10… */
export function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  for (const step of [2, 5, 10, 15, 20, 30, 60, 90, 120]) if (raw <= step) return step;
  return Math.ceil(raw / 60) * 60;
}

export function computeExamAnalytics(input: AnalyticsInput): ExamAnalytics {
  const { attempts } = input;
  const percents = attempts.map((a) => a.scorePercent);
  const passed = attempts.filter((a) => a.passed === true).length;

  const bands = [...input.bands].sort((a, b) => b.min - a.min);
  const gradeCounts = new Map<string, number>();
  for (const a of attempts) {
    const k = a.grade ?? "";
    gradeCounts.set(k, (gradeCounts.get(k) ?? 0) + 1);
  }
  const grades = bands.map((b) => ({ label: b.label, count: gradeCounts.get(b.label) ?? 0 }));
  const known = new Set(bands.map((b) => b.label));
  for (const [label, count] of gradeCounts) {
    if (label && !known.has(label)) grades.push({ label, count });
  }
  if (gradeCounts.get("")) grades.push({ label: "No grade", count: gradeCounts.get("")! });

  const sections = input.sections.map((s) => {
    const rows = attempts.map((a) => a.sectionScores[s.id]).filter((x): x is { earned: number; max: number } => !!x && x.max > 0);
    return {
      id: s.id,
      title: s.title,
      count: rows.length,
      meanPercent: round(mean(rows.map((x) => (Math.max(0, x.earned) / x.max) * 100)), 2),
      meanEarned: round(mean(rows.map((x) => x.earned)), 2),
      max: rows.length ? Math.max(...rows.map((x) => x.max)) : null,
    };
  });

  const minutes = attempts.map((a) => a.durationSec).filter((x): x is number => x !== null && x >= 0).map((x) => x / 60);
  const longest = minutes.length ? Math.max(...minutes) : 0;
  const binMinutes = niceStep(Math.ceil(longest / 10));
  const timeBins = histogram(minutes, 10, 0, binMinutes * 10);

  return {
    count: attempts.length,
    pending: attempts.filter((a) => !a.graded).length,
    score: roundSummary(summarize(percents)),
    passRate: attempts.length ? round(passed / attempts.length) : null,
    passed,
    histogram: histogram(percents.map((p) => Math.max(0, Math.min(100, p))), 10, 0, 100),
    grades,
    sections,
    time: { summary: roundSummary(summarize(minutes), 1), bins: timeBins, binMinutes },
    items: analyseItems(input),
    integrity: integritySummary(attempts),
    similarity: similarityScreen(input),
  };
}
