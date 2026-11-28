/**
 * iCalendar (RFC 5545) writer for the private calendar feeds. Pure — no
 * database, no clock except what the caller passes — so the verification
 * script can pin its output byte for byte.
 *
 * What it gets right that a string template does not:
 *  - lines end in CRLF;
 *  - content lines are folded at 75 OCTETS (not characters), never inside a
 *    multi-byte UTF-8 sequence, continuation lines starting with one space;
 *  - TEXT values escape backslash, semicolon, comma and newlines;
 *  - every date-time is written in UTC ("…Z"), so no VTIMEZONE is needed.
 */

export type IcsFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type IcsEvent = {
  /** Globally unique and stable across refreshes: "<id>@<host>". */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** When set, the event repeats: RRULE:FREQ=…[;UNTIL=…]. */
  repeat?: { freq: IcsFrequency; until?: Date | null } | null;
  /** Last change; DTSTAMP is the time the feed was generated. */
  lastModified?: Date | null;
  categories?: string[];
};

export type IcsCalendar = {
  /** PRODID, e.g. "-//Prisma LMS//Calendar feed//EN". */
  prodId: string;
  name: string;
  description?: string | null;
  /** DTSTAMP for every event (the moment the feed was generated). */
  generatedAt: Date;
  events: IcsEvent[];
};

const CRLF = "\r\n";

/** 20261128T093000Z */
export function formatUtc(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold one content line (RFC 5545 §3.1): no physical line longer than 75
 * octets excluding the CRLF; a continuation line begins with a single space,
 * which counts toward its 75. Splits only between whole UTF-8 characters.
 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = Buffer.byteLength(ch, "utf8");
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = " ";
      currentBytes = 1;
      limit = 75;
    }
    current += ch;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join(CRLF);
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function textProp(name: string, value: string): string {
  return prop(name, escapeText(value));
}

/** A URI value is not TEXT: it is not escaped, but control characters are dropped. */
function uriValue(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x1f && code !== 0x7f) out += ch;
  }
  return out;
}

export function rrule(repeat: { freq: IcsFrequency; until?: Date | null }): string {
  return `FREQ=${repeat.freq}${repeat.until ? `;UNTIL=${formatUtc(repeat.until)}` : ""}`;
}

export function buildIcs(cal: IcsCalendar): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    prop("PRODID", cal.prodId),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    textProp("X-WR-CALNAME", cal.name),
  ];
  if (cal.description) lines.push(textProp("X-WR-CALDESC", cal.description));
  // Ask subscribing clients to refresh hourly (Google ignores it; Apple and
  // Outlook honour one or the other).
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H");

  const stamp = formatUtc(cal.generatedAt);
  for (const ev of cal.events) {
    const end = ev.end.getTime() > ev.start.getTime() ? ev.end : new Date(ev.start.getTime() + 30 * 60_000);
    lines.push("BEGIN:VEVENT");
    lines.push(prop("UID", ev.uid));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${formatUtc(ev.start)}`);
    lines.push(`DTEND:${formatUtc(end)}`);
    if (ev.repeat) lines.push(`RRULE:${rrule(ev.repeat)}`);
    lines.push(textProp("SUMMARY", ev.summary));
    if (ev.description) lines.push(textProp("DESCRIPTION", ev.description));
    if (ev.location) lines.push(textProp("LOCATION", ev.location));
    if (ev.url) lines.push(prop("URL", uriValue(ev.url)));
    if (ev.categories && ev.categories.length > 0) {
      lines.push(prop("CATEGORIES", ev.categories.map(escapeText).join(",")));
    }
    if (ev.lastModified) lines.push(`LAST-MODIFIED:${formatUtc(ev.lastModified)}`);
    lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}
