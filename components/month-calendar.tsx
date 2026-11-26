import Link from "next/link";
import { cn } from "@/lib/utils";

export type CalOccurrence = { id: string; dateISO: string; title: string; type: string };

const TYPE_COLOR: Record<string, string> = {
  LIVE_SESSION: "var(--chart-1)",
  DEADLINE: "var(--chart-2)",
  REMINDER: "var(--chart-3)",
  ANNOUNCEMENT: "var(--chart-4)",
};

const TYPE_LABEL: Record<string, string> = {
  LIVE_SESSION: "Live session",
  DEADLINE: "Deadline",
  REMINDER: "Reminder",
  ANNOUNCEMENT: "Announcement",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

type Local = { year: number; month: number; day: number; time: string };

/**
 * Which calendar day (and what time) an instant is, in `timeZone`.
 *
 * With no zone given this falls back to the machine's own, which is what this
 * component always did; callers that know the academy's zone should pass it, so
 * an 00:30 session lands on the right day wherever the page is rendered.
 */
function localParts(iso: string, timeZone: string | undefined, locale: string | undefined): Local | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const read = (zone: string | undefined) => {
    const parts: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: zone,
    }).formatToParts(date)) {
      parts[part.type] = part.value;
    }
    const time = new Intl.DateTimeFormat(locale || "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
    }).format(date);
    return { year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day), time };
  };
  try {
    return read(timeZone);
  } catch {
    // A zone or locale someone mistyped in settings must not take the page down.
    return read(undefined);
  }
}

const NAV_LINK =
  "flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border-2 border-border bg-card px-3 text-sm font-bold shadow-sm outline-none [touch-action:manipulation] hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none";

/**
 * A month of events: a grid where there is room for one, and the same events as
 * a dated list underneath on a phone, where a seven-column grid leaves each day
 * too narrow to read a title in.
 *
 * A Server Component: it has nothing to press but links, so it ships no script
 * and cannot disagree with itself between the server and the browser about what
 * day it is. `basePath` builds the month links (`?month=YYYY-MM`);
 * `eventHrefPrefix` optionally makes each event a link.
 */
export function MonthCalendar({
  year,
  month,
  occurrences,
  basePath,
  eventHrefPrefix,
  timeZone,
  locale,
}: {
  year: number;
  month: number; // 0-11
  occurrences: CalOccurrence[];
  basePath: string;
  eventHrefPrefix?: string;
  /** IANA zone the days are counted in, e.g. the academy's. Defaults to the machine's. */
  timeZone?: string;
  /** BCP 47 tag for times in the list. */
  locale?: string;
}) {
  // Day 1's weekday and the month's length are properties of the calendar, not
  // of any time zone: read them in UTC so the grid is the same everywhere.
  const startWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const inMonth = occurrences
    .map((o) => ({ ...o, local: localParts(o.dateISO, timeZone, locale) }))
    .filter((o): o is CalOccurrence & { local: Local } => o.local != null && o.local.year === year && o.local.month === month)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const byDay = new Map<number, typeof inMonth>();
  for (const o of inMonth) {
    const arr = byDay.get(o.local.day) ?? [];
    arr.push(o);
    byDay.set(o.local.day, arr);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? monthParam(year - 1, 11) : monthParam(year, month - 1);
  const nextMonth = month === 11 ? monthParam(year + 1, 0) : monthParam(year, month + 1);
  const prevLabel = month === 0 ? `${MONTHS[11]} ${year - 1}` : `${MONTHS[month - 1]} ${year}`;
  const nextLabel = month === 11 ? `${MONTHS[0]} ${year + 1}` : `${MONTHS[month + 1]} ${year}`;

  const today = localParts(new Date().toISOString(), timeZone, locale);
  const isToday = (d: number) => today != null && today.year === year && today.month === month && today.day === d;
  const viewingThisMonth = today != null && today.year === year && today.month === month;

  const weekdayOf = (day: number) => new Date(Date.UTC(year, month, day)).getUTCDay();

  return (
    <div className="rounded-[14px] border-2 border-border bg-card p-3 shadow-md sm:p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg">
          {MONTHS[month]} {year}
        </h2>
        <nav aria-label="Change month" className="flex items-center gap-2">
          {!viewingThisMonth ? (
            <Link href={basePath} className={NAV_LINK}>
              Today
            </Link>
          ) : null}
          <Link href={`${basePath}?month=${prevMonth}`} aria-label={`Previous month, ${prevLabel}`} className={NAV_LINK}>
            <span aria-hidden>←</span>
          </Link>
          <Link href={`${basePath}?month=${nextMonth}`} aria-label={`Next month, ${nextLabel}`} className={NAV_LINK}>
            <span aria-hidden>→</span>
          </Link>
        </nav>
      </div>

      {/* The grid is a picture of the month. Its events are listed again below
          for phones, so on a small screen each day shows only how many there are. */}
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const events = d === null ? [] : (byDay.get(d) ?? []);
          return (
            <div
              key={i}
              className={cn(
                "min-h-12 min-w-0 rounded-[8px] border-2 p-1 text-left sm:min-h-20",
                d === null ? "border-transparent" : "border-border bg-background",
                d !== null && isToday(d) && "border-foreground bg-primary/20"
              )}
            >
              {d !== null ? (
                <>
                  <div className="num text-[11px] font-bold text-muted-foreground">
                    <span className="sr-only">{WEEKDAYS_LONG[weekdayOf(d)]} </span>
                    {d}
                    {isToday(d) ? <span className="sr-only"> (today)</span> : null}
                  </div>
                  {/* Phones: a count, never a row of unreadable chips. */}
                  {events.length > 0 ? (
                    <div className="mt-0.5 flex items-center gap-0.5 sm:hidden">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full border border-border"
                        style={{ background: TYPE_COLOR[events[0].type] ?? "var(--primary)" }}
                      />
                      <span className="num text-[10px] font-bold text-foreground">
                        {events.length}
                        <span className="sr-only"> {events.length === 1 ? "event" : "events"}</span>
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-0.5 hidden flex-col gap-0.5 sm:flex">
                    {events.slice(0, 4).map((o, idx) => {
                      const chip = (
                        <span
                          className="block truncate rounded px-1 py-0.5 text-[10px] font-bold text-foreground"
                          style={{ background: TYPE_COLOR[o.type] ?? "var(--card)" }}
                          title={o.title}
                        >
                          {o.title}
                        </span>
                      );
                      return eventHrefPrefix ? (
                        <Link
                          key={`${o.id}-${idx}`}
                          href={`${eventHrefPrefix}/${o.id}`}
                          className="rounded outline-none focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                          {chip}
                        </Link>
                      ) : (
                        <div key={`${o.id}-${idx}`}>{chip}</div>
                      );
                    })}
                    {events.length > 4 ? (
                      <span className="num px-1 text-[10px] font-bold text-muted-foreground">
                        +{events.length - 4} more
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* The month as a list: the readable version on a phone. */}
      <section aria-label={`Events in ${MONTHS[month]} ${year}`} className="mt-4 border-t-2 border-dashed border-border pt-3 sm:hidden">
        {inMonth.length === 0 ? (
          <p className="py-2 text-sm font-medium text-muted-foreground">Nothing is scheduled this month.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {inMonth.map((o, idx) => {
              const row = (
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="num flex size-11 shrink-0 flex-col items-center justify-center rounded-[10px] border-2 border-border leading-none text-foreground"
                    style={{ background: TYPE_COLOR[o.type] ?? "var(--muted)" }}
                  >
                    <span className="text-[15px] font-bold">{o.local.day}</span>
                    <span className="mt-0.5 text-[9px] font-bold">{WEEKDAYS[weekdayOf(o.local.day)]}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold text-foreground">{o.title}</span>
                    <span className="num block text-[12px] font-medium text-muted-foreground">
                      <span className="sr-only">
                        {WEEKDAYS_LONG[weekdayOf(o.local.day)]} {o.local.day} {MONTHS[month]},{" "}
                      </span>
                      {TYPE_LABEL[o.type] ?? "Event"} · {o.local.time}
                    </span>
                  </span>
                </span>
              );
              return (
                <li key={`${o.id}-${idx}`}>
                  {eventHrefPrefix ? (
                    <Link
                      href={`${eventHrefPrefix}/${o.id}`}
                      className="block rounded-[10px] p-1 outline-none hover:bg-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="p-1">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* What the colours mean — colour is never the only way to tell. */}
      <ul className="mt-4 hidden flex-wrap gap-x-4 gap-y-1 border-t-2 border-dashed border-border pt-3 text-[12px] font-medium text-muted-foreground sm:flex">
        {Object.keys(TYPE_LABEL).map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[3px] border border-border" style={{ background: TYPE_COLOR[type] }} />
            {TYPE_LABEL[type]}
          </li>
        ))}
      </ul>
    </div>
  );
}
