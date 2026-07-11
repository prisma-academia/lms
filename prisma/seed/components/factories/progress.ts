import { DAY } from "../../index";

export function progressPercent(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

/** Spread lesson completions across recent days for streak/chart realism. */
export function completionDates(now: number, doneCount: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < doneCount; i++) {
    const daysAgo = doneCount - 1 - i;
    dates.push(new Date(now - daysAgo * DAY));
  }
  return dates;
}
