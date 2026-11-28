import { formatDateTime, type FormatContext } from "@/lib/format";

/**
 * Formatting for the exam-operations screens. These screens fetch their data
 * in the browser after mount, so formatting here never meets a server render;
 * the academy's locale and zone still come from the page as `fmt`.
 */

export type Fmt = { locale: string; timeZone: string };

export function when(iso: string | null | undefined, fmt: Fmt, fallback = "—"): string {
  return formatDateTime(iso ?? null, fmt as FormatContext, fallback);
}

export function timeOnly(iso: string | null | undefined, fmt: Fmt): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(fmt.locale || "en-GB", { timeStyle: "medium", timeZone: fmt.timeZone || "UTC" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 19);
  }
}

/** 1:05:09, or 4:09 under an hour. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "12 s ago", "4 min ago". */
export function ago(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export function pct(x: number | null | undefined, dp = 0): string {
  return x === null || x === undefined ? "—" : `${x.toFixed(dp)}%`;
}

export function num(x: number | null | undefined, dp = 2): string {
  if (x === null || x === undefined) return "—";
  return Number.isInteger(x) ? String(x) : x.toFixed(dp).replace(/\.?0+$/, "");
}

export function seconds(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}
