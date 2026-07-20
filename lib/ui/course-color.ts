import type { IconName } from "@/components/icon";

/**
 * Deterministic per-course accent color + icon, keyed by course id.
 * Mirrors design.html's per-category coloring without needing a schema field.
 */

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const ICONS: IconName[] = ["flask", "code", "globe", "chart", "palette", "mic"];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function courseAccent(id: string): string {
  return PALETTE[hash(id) % PALETTE.length];
}

export function courseIcon(id: string): IconName {
  return ICONS[hash(id) % ICONS.length];
}
