"use client";

import { eventLabel, SEVERITY_LABEL } from "@/lib/exams/event-labels";
import { cn } from "@/lib/utils";
import { timeOnly, when, type Fmt } from "./format";

export type TimelineEvent = {
  id?: string;
  type: string;
  severity: number;
  at: string;
  actor?: string | null;
  detail?: unknown;
};

const DOT: Record<number, string> = {
  0: "bg-muted",
  1: "bg-warning",
  2: "bg-destructive",
};

function noteOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d.note === "string" && d.note) bits.push(`“${d.note}”`);
  if (typeof d.ip === "string" && d.ip) bits.push(`IP ${d.ip}`);
  if (typeof d.pausedMs === "number") bits.push(`paused ${Math.round(d.pausedMs / 60000)} min`);
  if (typeof d.awaySec === "number") bits.push(`away ${d.awaySec} s`);
  return bits.length ? bits.join(" · ") : null;
}

/** Every integrity event of an attempt, oldest first, with what it cost. */
export function EventTimeline({ events, fmt, compact = false }: { events: TimelineEvent[]; fmt: Fmt; compact?: boolean }) {
  if (!events.length) return <p className="text-sm font-medium text-muted-foreground">No events recorded yet.</p>;
  const days = events.map((e) => when(e.at, fmt).split(",")[0]);
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => {
        const day = days[i];
        const showDay = !compact && (i === 0 || day !== days[i - 1]);
        const note = noteOf(e.detail);
        return (
          <li key={e.id ?? `${e.type}-${e.at}-${i}`} className="flex flex-col">
            {showDay ? <span className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground first:mt-0">{day}</span> : null}
            <div className="flex gap-3 py-1.5">
              <span className="flex flex-col items-center pt-1.5" aria-hidden>
                <span className={cn("size-2.5 rounded-full border-2 border-border", DOT[e.severity] ?? DOT[0])} />
                {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border/50" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("text-[13.5px] font-bold", e.severity === 2 && "text-destructive")}>{eventLabel(e.type, e.detail)}</span>
                  {e.severity > 0 ? (
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">{SEVERITY_LABEL[e.severity]}</span>
                  ) : null}
                </div>
                <div className="text-[12px] font-medium text-muted-foreground">
                  <time dateTime={e.at}>{timeOnly(e.at, fmt)}</time>
                  {e.actor ? ` · by ${e.actor}` : ""}
                  {note ? ` · ${note}` : ""}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
