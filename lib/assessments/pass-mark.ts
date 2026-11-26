/**
 * The one definition of "passed a quiz".
 *
 * `Quiz.passingScore` was editable for a long time while lesson progression
 * ignored it: three separate checks each hard-coded 100%. An author who set
 * 70% saw 70% on the quiz form and learners saw "you need every answer
 * correct". This module is what those checks now share, so the number the
 * author sets is the number that gates.
 *
 * Pure — no database, no imports — so the gate's rules can be checked directly.
 */

/** What an unset pass mark means: every answer correct. */
export const DEFAULT_PASS_MARK = 100;

/**
 * The pass mark a quiz is actually held to.
 *
 * `null` means 100, not "no pass mark". That is how every quiz behaved before
 * pass marks were enforced, so quizzes that never set one keep gating exactly
 * as they did.
 */
export function effectivePassMark(passingScore: number | null | undefined): number {
  if (passingScore == null || !Number.isFinite(passingScore)) return DEFAULT_PASS_MARK;
  return Math.min(100, Math.max(0, Math.round(passingScore)));
}

/**
 * Compares the same whole-number percentage the learner is shown. `scoreAttempt`
 * only ever reports 100 when every point was earned (it clamps anything less to
 * 99), so a pass mark of 100 still means "all correct", never "rounds to 100".
 */
export function attemptPasses(scorePercent: number | null | undefined, passMark: number): boolean {
  return typeof scorePercent === "number" && scorePercent >= passMark;
}

/**
 * Database filter for "a graded attempt that satisfies the gate".
 *
 * Two ways to qualify:
 *
 *  - the score meets today's pass mark, or
 *  - the attempt was recorded as a pass under the mark in force when it was
 *    graded (`passMarkApplied` set). Completion is monotonic everywhere else in
 *    the app; without this, an author raising a pass mark from 70 to 90 would
 *    re-lock every learner who had passed at 80 but not yet clicked through.
 *
 * `passMarkApplied IS NOT NULL` matters: before pass marks were enforced
 * `passed` was computed from the stored mark and gated nothing, so an old
 * `passed = true` at 60% must not count. Old attempts qualify on score alone —
 * and any attempt that scored 100 passes every mark.
 *
 * Only GRADED attempts ever qualify. An attempt whose essay grading failed is
 * scoreless, so provoking a grader outage unlocks nothing.
 */
export function passingAttemptWhere(passMark: number) {
  return {
    submittedAt: { not: null },
    gradingStatus: "GRADED" as const,
    OR: [
      { scorePercent: { gte: passMark } },
      { passed: true, passMarkApplied: { not: null } },
    ],
  };
}

/** How the bar is described to a learner. */
export function passMarkLabel(passMark: number): string {
  return passMark >= 100 ? "every answer correct (100%)" : `${passMark}% or more`;
}
