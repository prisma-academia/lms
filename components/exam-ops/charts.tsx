"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The small, single-series charts of the results page, in plain HTML/CSS.
 *
 * One hue per chart (the title names the series, so there is no legend box),
 * columns capped at 24px with a 4px rounded data end and a square baseline,
 * hairline solid gridlines, a tooltip on hover AND keyboard focus, and a
 * table view so no value depends on hovering. Text always wears text tokens.
 */

export const SERIES = "var(--chart-1)";

export type Datum = { label: string; value: number; detail?: string };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

function TableView({ caption, data, valueLabel, format }: { caption: string; data: Datum[]; valueLabel: string; format: (v: number) => string }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-[8px] px-1 text-[12.5px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-ring">
        Show as a table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b-2 border-border">
              <th scope="col" className="py-1.5 pr-3 font-bold">
                Group
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-border/40">
                <td className="py-1.5 pr-3">{d.label}</td>
                <td className="py-1.5 text-right tabular-nums">{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Vertical columns along a category axis (histograms, distributions). */
export function ColumnChart({
  title,
  data,
  height = 180,
  valueLabel = "Count",
  format = (v) => String(v),
  color = SERIES,
  xCaption,
}: {
  title: string;
  data: Datum[];
  height?: number;
  valueLabel?: string;
  format?: (v: number) => string;
  color?: string;
  xCaption?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const id = useId();
  return (
    <figure aria-labelledby={`${id}-t`} className="m-0">
      <figcaption id={`${id}-t`} className="sr-only">
        {title}
      </figcaption>
      <div className="flex gap-2">
        {/* y axis ticks */}
        <div className="relative w-8 shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground" style={{ height }} aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((_, i) => (
              <div
                key={i}
                aria-hidden
                className="absolute inset-x-0 border-t border-border/30"
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" role="list" aria-label={title}>
              {data.map((d, i) => {
                const h = max > 0 ? (d.value / max) * 100 : 0;
                const on = active === i;
                return (
                  <div
                    key={d.label}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail}` : ""}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((x) => (x === i ? null : x))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((x) => (x === i ? null : x))}
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center rounded-[4px] outline-none focus-visible:outline-[3px] focus-visible:outline-ring"
                  >
                    {/* Direct label on the peak only. */}
                    {i === peak && d.value > 0 && !on ? (
                      <span className="absolute -translate-y-full pb-0.5 text-[11px] font-bold tabular-nums text-foreground" style={{ bottom: `${h}%` }} aria-hidden>
                        {format(d.value)}
                      </span>
                    ) : null}
                    <div
                      className={cn("w-full max-w-6 rounded-t-[4px] transition-[filter]", on && "brightness-110")}
                      style={{ height: `${h}%`, minHeight: d.value > 0 ? 2 : 0, background: color, outline: on ? "2px solid var(--foreground)" : undefined }}
                    />
                    {on ? (
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-[8px] border-2 border-border bg-popover px-2.5 py-1.5 text-left text-popover-foreground shadow-md"
                      >
                        <div className="text-[14px] font-bold tabular-nums">{format(d.value)}</div>
                        <div className="text-[11.5px] font-medium text-muted-foreground">{d.label}</div>
                        {d.detail ? <div className="text-[11.5px] text-muted-foreground">{d.detail}</div> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1 flex gap-[2px] border-t border-border/60 pt-1" aria-hidden>
            {data.map((d, i) => (
              <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[10.5px] font-medium tabular-nums text-muted-foreground">
                {data.length > 12 && i % 2 ? "" : d.label}
              </span>
            ))}
          </div>
          {xCaption ? <p className="mt-1 text-center text-[11.5px] font-medium text-muted-foreground">{xCaption}</p> : null}
        </div>
      </div>
      <TableView caption={title} data={data} valueLabel={valueLabel} format={format} />
    </figure>
  );
}

/** Horizontal bars with the value at the tip (grade bands, sections, distractors). */
export function BarList({
  title,
  data,
  max,
  format = (v) => String(v),
  valueLabel = "Value",
  color = SERIES,
  colorFor,
  marker,
  table = true,
}: {
  title: string;
  data: Datum[];
  /** Scale end; defaults to the largest value. */
  max?: number;
  format?: (v: number) => string;
  valueLabel?: string;
  color?: string;
  colorFor?: (d: Datum, i: number) => string;
  /** Extra content after the label (a "correct" badge, say). */
  marker?: (d: Datum, i: number) => ReactNode;
  table?: boolean;
}) {
  const scale = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="flex flex-col gap-2" aria-label={title}>
        {data.map((d, i) => {
          const w = scale > 0 ? Math.max(0, Math.min(100, (d.value / scale) * 100)) : 0;
          return (
            <li key={`${d.label}-${i}`} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,12rem)_1fr_auto]" title={d.detail}>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
                <span className="truncate">{d.label}</span>
                {marker?.(d, i)}
              </span>
              <span className="relative h-4 rounded-r-[4px]" aria-hidden>
                <span className="absolute inset-y-0 left-0 border-l border-border/60" />
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${w}%`, minWidth: d.value > 0 ? 2 : 0, background: colorFor ? colorFor(d, i) : color }}
                />
              </span>
              <span className="min-w-12 text-right text-[13px] font-bold tabular-nums">
                {format(d.value)}
                <span className="sr-only">{d.detail ? `, ${d.detail}` : ""}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {table ? <TableView caption={title} data={data} valueLabel={valueLabel} format={format} /> : null}
    </figure>
  );
}
