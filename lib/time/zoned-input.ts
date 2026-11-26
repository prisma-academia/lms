/**
 * `<input type="datetime-local">` in a named time zone.
 *
 * That input speaks in wall-clock time with no zone attached ("2026-03-01T10:00").
 * Something has to decide WHOSE wall clock, and it has to be the same answer
 * when the value is filled in and when it is read back. Filling it from the
 * server's clock and reading it with the browser's — which is what `new Date()`
 * on each side does — moves an event by the difference between the two every
 * time it is saved.
 *
 * So both directions go through the academy's own time zone, by name. Pure and
 * isomorphic: the page uses it on the server to fill the field and the form
 * uses it in the browser to read it, and neither machine's local zone matters.
 */

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function partsIn(instant: Date, timeZone: string): Parts {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The value to put in a datetime-local field so it shows `instant` as it is in `timeZone`. */
export function toZonedInput(instant: Date | string | null | undefined, timeZone: string | null | undefined): string {
  if (!instant) return "";
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsIn(date, safeZone(timeZone));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The instant a datetime-local value names when it is read as wall-clock time
 * in `timeZone`. Null for an empty or malformed value.
 *
 * Found by correction rather than by table: take the wall time as if it were
 * UTC, see what the zone's clock shows at that instant, and shift by the
 * difference. A second pass settles the hour either side of a clock change. A
 * time that does not exist (the hour skipped in spring) lands on the instant
 * just after the gap, which is what a calendar would show.
 */
export function zonedInputToIso(local: string | null | undefined, timeZone: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? "");
  if (!match) return null;
  const zone = safeZone(timeZone);
  const wall = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  if (Number.isNaN(wall)) return null;

  let instant = wall;
  for (let pass = 0; pass < 2; pass++) {
    const p = partsIn(new Date(instant), zone);
    instant += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(instant).toISOString();
}
