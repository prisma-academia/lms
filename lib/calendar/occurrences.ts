import { addDays, addWeeks, addMonths, isAfter, isBefore } from "date-fns";

export type EventLike = {
  id: string;
  title: string;
  type: string;
  startAt: Date;
  endAt: Date | null;
  recurrence: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  recurrenceUntil: Date | null;
};

export type Occurrence = { id: string; title: string; type: string; date: Date };

/**
 * Expand events (including simple recurrences) into dated occurrences that fall
 * within [rangeStart, rangeEnd]. Bounded to avoid runaway loops.
 */
export function expandOccurrences(events: EventLike[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    let cur = ev.startAt;
    const hardEnd = ev.recurrenceUntil ?? rangeEnd;
    let guard = 0;
    while (!isAfter(cur, rangeEnd) && !isAfter(cur, hardEnd) && guard < 500) {
      if (!isBefore(cur, rangeStart)) {
        out.push({ id: ev.id, title: ev.title, type: ev.type, date: cur });
      }
      if (ev.recurrence === "NONE") break;
      cur =
        ev.recurrence === "DAILY"
          ? addDays(cur, 1)
          : ev.recurrence === "WEEKLY"
            ? addWeeks(cur, 1)
            : addMonths(cur, 1);
      guard += 1;
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
