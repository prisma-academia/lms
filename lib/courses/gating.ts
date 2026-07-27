/**
 * Sequential lesson gating.
 *
 * A lesson is unlocked once every lesson before it in course order is complete.
 * Completion is read as a SET, never as a count or a high-water mark — that is
 * what makes this safe to switch on for existing enrollments without any
 * backfill: a learner who completed lessons {1, 3, 5} out of order under the
 * old ungated player sees 2 unlocked (1 is done) and 4 locked (3 is done but 2
 * is not). Legacy rows can only ever loosen the gate, never contradict it, and
 * nobody who legitimately finished a course gets retro-locked.
 *
 * Pure and Prisma-free so both route handlers and client components can use it.
 */

export type OrderableLesson = { id: string; sortOrder: number };

/**
 * Course order. `Lesson.sortOrder` is NOT unique (it defaults to 0), so the id
 * tiebreak is load-bearing: if the client and the server disagree about which
 * lesson is "N", a lesson can end up permanently locked. Mirrors the Prisma
 * `orderBy: [{ sortOrder: "asc" }, { id: "asc" }]` used on every learner read.
 */
export function orderLessons<T extends OrderableLesson>(lessons: readonly T[]): T[] {
  return [...lessons].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Index of the first lesson with no completion — the learner's frontier.
 * Everything at an index <= this is unlocked. Returns `lessons.length` when the
 * whole course is done.
 */
export function frontierIndex(
  ordered: readonly { id: string }[],
  completed: ReadonlySet<string>
): number {
  const i = ordered.findIndex((l) => !completed.has(l.id));
  return i === -1 ? ordered.length : i;
}

/** Whether `lessonId` may be opened/completed given what the learner has finished. */
export function isUnlocked(
  ordered: readonly { id: string }[],
  completed: ReadonlySet<string>,
  lessonId: string
): boolean {
  const index = ordered.findIndex((l) => l.id === lessonId);
  if (index === -1) return false;
  // An already-completed lesson is ALWAYS accessible, even when it sits past the
  // frontier. Under the old ungated player a learner could finish lessons out of
  // order, so {1,3,5} done leaves 3 and 5 beyond the frontier at 2 — and locking
  // those would retro-take work they had already done and redact content they had
  // already read. Completion only ever adds access.
  if (completed.has(lessonId)) return true;
  return index <= frontierIndex(ordered, completed);
}

/** The lesson a learner should land on: their frontier, or the last one if done. */
export function frontierLesson<T extends { id: string }>(
  ordered: readonly T[],
  completed: ReadonlySet<string>
): T | null {
  if (ordered.length === 0) return null;
  const i = frontierIndex(ordered, completed);
  return ordered[i] ?? ordered[ordered.length - 1] ?? null;
}
