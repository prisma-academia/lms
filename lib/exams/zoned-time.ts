/**
 * `<input type="datetime-local">` values in the ACADEMY's time zone.
 *
 * A datetime-local input has no zone. Reading it in the browser's zone would
 * make an exam window depend on whichever laptop the author happened to use,
 * and render differently on the server than in the browser. These convert
 * between an instant (ISO) and "YYYY-MM-DDTHH:mm" in one named IANA zone, so
 * both sides agree and everyone in the academy sees the same clock.
 *
 * Pure; safe in Client Components.
 */

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function partsIn(ms: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function offsetAt(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → "2026-11-28T09:00" in the zone. Empty for null/invalid. */
export function toZonedInput(iso: string | null | undefined, timeZone: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = partsIn(ms, safeZone(timeZone));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "2026-11-28T09:00" in the zone → ISO instant. NULL for empty/invalid. */
export function fromZonedInput(local: string, timeZone: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!m) return null;
  const zone = safeZone(timeZone);
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let ms = guess - offsetAt(guess, zone);
  // Across a DST change the offset at the answer can differ from the guess's.
  const second = offsetAt(ms, zone);
  if (guess - second !== ms) ms = guess - second;
  return new Date(ms).toISOString();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "28 Nov 2026, 09:00" in the zone. Built by hand rather than with
 * `toLocaleString`, whose output differs between Node's and the browser's ICU
 * and would make the server and client render different text.
 */
export function formatZoned(iso: string | null | undefined, timeZone: string | null | undefined, fallback = "—"): string {
  const v = toZonedInput(iso, timeZone);
  if (!v) return fallback;
  const [date, time] = v.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}, ${time}`;
}
