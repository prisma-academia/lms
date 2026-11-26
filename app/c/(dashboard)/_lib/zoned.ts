/**
 * Calendar days in the academy's time zone.
 *
 * "Due today", a study streak and "this week" are all questions about calendar
 * days, and a day is only defined in a time zone. Asked of a bare `Date` they
 * are answered in the machine's zone — usually UTC on a server — which puts a
 * 00:30 deadline in Lagos on the previous day and breaks a streak at 1 a.m.
 *
 * Everything here turns an instant into "which day is that, in this zone" and
 * then works in whole day numbers, so no arithmetic ever crosses a zone or a
 * daylight-saving boundary. Pure: safe on the server and in the browser.
 */

export const DAY_MS = 86_400_000;

export type ZonedParts = {
  year: number;
  /** 0–11, like `Date#getMonth`. */
  month: number;
  day: number;
  /** 0–23. */
  hour: number;
  /** 0 = Sunday, like `Date#getDay`. */
  weekday: number;
  /**
   * The calendar day as a whole number of days since 1970-01-01. Two instants
   * on the same local day share it; tomorrow's is one more.
   */
  dayNumber: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    };
    try {
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    } catch {
      // A stored zone can be anything a person typed; an invalid one must not
      // take the page down. UTC is wrong by a few hours, not broken.
      formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function zonedParts(value: Date | string | number, timeZone: string): ZonedParts {
  const date = value instanceof Date ? value : new Date(value);
  const read: Record<string, number> = {};
  for (const part of partsFormatter(timeZone || "UTC").formatToParts(date)) {
    if (part.type !== "literal") read[part.type] = Number(part.value);
  }
  const year = read.year;
  const month = read.month - 1;
  const day = read.day;
  const dayNumber = Math.round(Date.UTC(year, month, day) / DAY_MS);
  return {
    year,
    month,
    day,
    hour: read.hour % 24,
    weekday: new Date(dayNumber * DAY_MS).getUTCDay(),
    dayNumber,
  };
}

/** Whole days from `from` to `to` on the calendar: 0 = same day, 1 = tomorrow, -1 = yesterday. */
export function daysBetween(from: Date | string | number, to: Date | string | number, timeZone: string): number {
  return zonedParts(to, timeZone).dayNumber - zonedParts(from, timeZone).dayNumber;
}

/** Weekday (0 = Sunday) of a day number. */
export function weekdayOf(dayNumber: number): number {
  return new Date(dayNumber * DAY_MS).getUTCDay();
}

export type DueTone = "overdue" | "urgent" | "soon" | "later";

/**
 * How a deadline reads from today. The tone is a hint for colour only — the
 * words always say the same thing on their own.
 */
export function dueLabel(daysAway: number): { text: string; tone: DueTone } {
  if (daysAway < 0) return { text: "Past due", tone: "overdue" };
  if (daysAway === 0) return { text: "Due today", tone: "urgent" };
  if (daysAway === 1) return { text: "Due tomorrow", tone: "urgent" };
  return { text: `Due in ${daysAway} days`, tone: daysAway <= 4 ? "soon" : "later" };
}

/** Text colour for a due label, as a token. Never the only signal. */
export const DUE_TONE_COLOR: Record<DueTone, string> = {
  overdue: "var(--muted-foreground)",
  urgent: "var(--destructive)",
  soon: "var(--foreground)",
  later: "var(--muted-foreground)",
};
