"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/shell";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput } from "@/components/form-field";
import { apiGet } from "@/lib/client/api";
import type { KeyView } from "@/lib/developers/admin";
import { compact } from "./format";

type Point = { date: string; requests: number; errors: number };

const SERIES = "var(--chart-1)";
const GRID = "color-mix(in oklch, var(--muted-foreground) 22%, transparent)";
const H = 200;
const M = { top: 12, right: 12, bottom: 26, left: 44 };

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Clean ticks from 0 to a rounded max: 0 / 250 / 500 / 750 / 1,000. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 1000) / 1000);
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Which day indexes get an x-axis label: first, last, and evenly between, never crowded. */
function labelIndexes(n: number, plotW: number): Set<number> {
  const room = Math.max(2, Math.floor(plotW / 64));
  if (n <= room) return new Set(Array.from({ length: n }, (_, i) => i));
  const step = (n - 1) / (room - 1);
  return new Set(Array.from({ length: room }, (_, i) => Math.round(i * step)));
}

type Tip = { x: number; y: number; value: string; label: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[8px] border-2 border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: tip.x, top: tip.y - 8 }}
      role="status"
    >
      <div className="font-bold text-foreground">{tip.value}</div>
      <div className="font-medium text-muted-foreground">{tip.label}</div>
    </div>
  );
}

function Axes({ width, ticks, y, fmt, data, x, plotW }: { width: number; ticks: number[]; y: (v: number) => number; fmt: (v: number) => string; data: Point[]; x: (i: number) => number; plotW: number }) {
  const labels = labelIndexes(data.length, plotW);
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-[11px]">
            {fmt(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) =>
        labels.has(i) ? (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
            {dayLabel(d.date)}
          </text>
        ) : null
      )}
    </g>
  );
}

/** Requests per day: columns, 4px rounded caps, square at the baseline. */
function RequestsChart({ data }: { data: Point[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const ticks = niceTicks(Math.max(...data.map((d) => d.requests), 0));
  const top = ticks[ticks.length - 1] || 1;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const x = (i: number) => M.left + band * i + band / 2;
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const total = data.reduce((s, d) => s + d.requests, 0);

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
      <svg width={width} height={H} role="img" aria-label={`Requests per day: ${total.toLocaleString()} in ${data.length} days.`}>
        <Axes width={width} ticks={ticks} y={y} fmt={compact} data={data} x={x} plotW={plotW} />
        {data.map((d, i) => {
          const h = Math.max(0, y(0) - y(d.requests));
          const r = Math.min(4, h, barW / 2);
          const x0 = x(i) - barW / 2;
          const yTop = y(0) - h;
          const show = () => setTip({ x: x(i), y: yTop, value: `${d.requests.toLocaleString()} requests`, label: dayLabel(d.date) });
          return (
            <g key={d.date}>
              {h > 0 ? (
                <path
                  d={`M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${y(0)} Z`}
                  fill={SERIES}
                />
              ) : null}
              {/* The hit target is the whole day band, not the (possibly tiny) bar. */}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${dayLabel(d.date)}: ${d.requests} requests`}
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
                className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
              />
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Error rate per day: a 2px line with a 10% wash; days with no traffic are gaps. */
function ErrorRateChart({ data }: { data: Point[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const rates = data.map((d) => (d.requests > 0 ? (d.errors / d.requests) * 100 : null));
  const ticks = niceTicks(Math.max(5, ...rates.map((r) => r ?? 0)));
  const top = ticks[ticks.length - 1] || 1;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i: number) => M.left + step * i;
  const y = (v: number) => M.top + plotH - (v / top) * plotH;

  // Split into runs of days that had traffic.
  const runs: number[][] = [];
  rates.forEach((r, i) => {
    if (r === null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  });

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const h = hover !== null ? rates[hover] : null;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label="Error rate per day, as a percentage of requests.">
        <Axes width={width} ticks={ticks} y={y} fmt={(v) => `${v}%`} data={data} x={x} plotW={plotW} />
        {runs.map((run) => {
          const line = run.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(rates[i]!)}`).join(" ");
          const area = `${line} L${x(run[run.length - 1])},${y(0)} L${x(run[0])},${y(0)} Z`;
          return (
            <g key={run[0]}>
              <path d={area} fill={SERIES} fillOpacity={0.1} />
              {run.length > 1 ? <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
              {run.length === 1 ? <circle cx={x(run[0])} cy={y(rates[run[0]]!)} r={4} fill={SERIES} stroke="var(--card)" strokeWidth={2} /> : null}
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />
            {h !== null ? <circle cx={x(hover)} cy={y(h)} r={5} fill={SERIES} stroke="var(--card)" strokeWidth={2} /> : null}
          </g>
        ) : null}
        <rect x={M.left - step / 2} y={M.top} width={plotW + step} height={plotH} fill="transparent" onPointerMove={onMove} />
      </svg>
      <Tooltip
        tip={
          hover !== null
            ? {
                x: x(hover),
                y: h !== null ? y(h) : y(0),
                value: h !== null ? `${h.toFixed(1)}% errors` : "No requests",
                label: `${dayLabel(data[hover].date)} · ${data[hover].errors} of ${data[hover].requests}`,
              }
            : null
        }
      />
    </div>
  );
}

export function UsageTab({ keys }: { keys: KeyView[] }) {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [keyId, setKeyId] = useState("");
  const [series, setSeries] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<{ days: number; series: Point[] }>(`/api/tenant/developers/usage?days=${days}${keyId ? `&keyId=${keyId}` : ""}`);
      if (cancelled) return;
      if (res.error || !res.data) return setError(res.error?.message ?? "Could not load usage.");
      setError(null);
      setSeries(res.data.series);
    })();
    return () => {
      cancelled = true;
    };
  }, [days, keyId]);

  const total = series?.reduce((s, d) => s + d.requests, 0) ?? 0;
  const errors = series?.reduce((s, d) => s + d.errors, 0) ?? 0;
  const busiest = series?.reduce<Point | null>((b, d) => (!b || d.requests > b.requests ? d : b), null);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters: one row, above every chart they control. */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold">Period</span>
            <Segmented
              ariaLabel="Period"
              value={days}
              onChange={setDays}
              options={[
                { value: "7", label: "7 days" },
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
            />
          </div>
          <FormField label="Key" htmlFor="usage-key" className="min-w-56">
            <SelectInput value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="All keys" options={keys.map((k) => ({ value: k.id, label: `${k.name} (${k.prefix})` }))} />
          </FormField>
          <Button type="button" variant="outline" onClick={() => setTable((t) => !t)} aria-pressed={table}>
            {table ? "Show charts" : "Show table"}
          </Button>
        </div>
      </Card>

      {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[13px] font-bold text-muted-foreground">Requests</div>
          <div className="mt-1 font-heading text-[30px] leading-none">{series ? compact(total) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] font-bold text-muted-foreground">Error rate</div>
          <div className="mt-1 font-heading text-[30px] leading-none">{series ? (total ? `${((errors / total) * 100).toFixed(1)}%` : "—") : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[13px] font-bold text-muted-foreground">Busiest day</div>
          <div className="mt-1 font-heading text-[30px] leading-none">{busiest && busiest.requests > 0 ? compact(busiest.requests) : "—"}</div>
          {busiest && busiest.requests > 0 ? <div className="mt-1 text-xs font-medium text-muted-foreground">{dayLabel(busiest.date)}</div> : null}
        </Card>
      </div>

      {series && table ? (
        <Card className="p-0">
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 border-b-2 border-border bg-card text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Day (UTC)</th>
                  <th className="px-4 py-2 text-right">Requests</th>
                  <th className="px-4 py-2 text-right">Errors (4xx/5xx)</th>
                  <th className="px-4 py-2 text-right">Error rate</th>
                </tr>
              </thead>
              <tbody className="num">
                {[...series].reverse().map((d) => (
                  <tr key={d.date} className="border-b border-border">
                    <td className="px-4 py-1.5">{d.date}</td>
                    <td className="px-4 py-1.5 text-right">{d.requests.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right">{d.errors.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right">{d.requests ? `${((d.errors / d.requests) * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : series ? (
        <>
          <Card>
            <h2 className="font-heading text-base">Requests per day</h2>
            <p className="mb-3 text-xs font-medium text-muted-foreground">Every authenticated request, by UTC day.</p>
            <RequestsChart data={series} />
          </Card>
          <Card>
            <h2 className="font-heading text-base">Error rate</h2>
            <p className="mb-3 text-xs font-medium text-muted-foreground">Share of requests answered 4xx or 5xx. Gaps are days with no requests.</p>
            <ErrorRateChart data={series} />
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm font-medium text-muted-foreground">Loading…</p>
        </Card>
      )}
    </div>
  );
}
