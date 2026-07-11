"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CalOccurrence = { id: string; dateISO: string; title: string; type: string };

const TYPE_COLOR: Record<string, string> = {
  LIVE_SESSION: "var(--blue)",
  DEADLINE: "var(--pink)",
  REMINDER: "var(--yellow)",
  ANNOUNCEMENT: "var(--green)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthParam(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/**
 * Renders a month grid with event occurrences. `basePath` is used to build
 * prev/next month links (?month=YYYY-MM). `eventHref` optionally links an event.
 */
export function MonthCalendar({
  year,
  month,
  occurrences,
  basePath,
  eventHref,
}: {
  year: number;
  month: number; // 0-11
  occurrences: CalOccurrence[];
  basePath: string;
  eventHref?: (id: string) => string;
}) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map<number, CalOccurrence[]>();
  for (const o of occurrences) {
    const d = new Date(o.dateISO);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      const arr = byDay.get(day) ?? [];
      arr.push(o);
      byDay.set(day, arr);
    }
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? monthParam(year - 1, 11) : monthParam(year, month - 1);
  const nextMonth = month === 11 ? monthParam(year + 1, 0) : monthParam(year, month + 1);

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-lg">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex gap-2">
          <Link href={`${basePath}?month=${prevMonth}`} className="rounded-[8px] border-2 border-ink px-2.5 py-1 text-sm font-bold">←</Link>
          <Link href={`${basePath}?month=${nextMonth}`} className="rounded-[8px] border-2 border-ink px-2.5 py-1 text-sm font-bold">→</Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-ink/50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div
            key={i}
            className={cn(
              "min-h-20 rounded-[8px] border-2 p-1 text-left align-top",
              d === null ? "border-transparent" : "border-ink/15 bg-paper",
              d !== null && isToday(d) && "border-ink bg-yellow/40"
            )}
          >
            {d !== null ? (
              <>
                <div className="num text-[11px] font-bold text-ink/60">{d}</div>
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {(byDay.get(d) ?? []).slice(0, 4).map((o, idx) => {
                    const chip = (
                      <span
                        className="block truncate rounded px-1 py-0.5 text-[10px] font-bold text-ink"
                        style={{ background: TYPE_COLOR[o.type] ?? "var(--card)" }}
                        title={o.title}
                      >
                        {o.title}
                      </span>
                    );
                    return eventHref ? (
                      <Link key={`${o.id}-${idx}`} href={eventHref(o.id)}>{chip}</Link>
                    ) : (
                      <div key={`${o.id}-${idx}`}>{chip}</div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
