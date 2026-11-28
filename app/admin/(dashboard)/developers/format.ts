/** Short, locale-aware date-time for the developer portal ("28 Nov 2026, 14:05"). */
export function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Pretty-print a JSON string; leave anything else as it came. */
export function pretty(text: string | null): string {
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function compact(n: number): string {
  if (n < 10_000) return n.toLocaleString();
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
