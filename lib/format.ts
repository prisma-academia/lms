/**
 * Dates as people read them.
 *
 * Two rules, both learned the hard way:
 *
 *  1. Always pass an explicit locale and time zone. `toLocaleString()` with no
 *     arguments formats in whatever the machine happens to be set to — the
 *     server's on the server, the visitor's in the browser. A component that
 *     renders in both places then produces two different strings, which React
 *     reports as a hydration mismatch and repaints.
 *
 *  2. Format on the server and pass the string down wherever a Client Component
 *     shows a date. Even with identical arguments, two JavaScript engines can
 *     disagree on a separator character; one formatted string cannot.
 *
 * The locale and time zone come from the academy's own settings
 * (`TenantSettings.locale` / `.timezone`), so everyone in an academy sees the
 * same clock.
 */

export type FormatContext = {
  /** BCP 47 tag, e.g. "en" or "en-NG". */
  locale?: string | null;
  /** IANA zone, e.g. "Africa/Lagos". */
  timeZone?: string | null;
};

const FALLBACK_LOCALE = "en-GB";
const FALLBACK_ZONE = "UTC";

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatter(ctx: FormatContext, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // A stored locale or zone can be anything a person typed. An invalid one must
  // not take the page down with a RangeError; fall back and keep rendering.
  try {
    return new Intl.DateTimeFormat(ctx.locale || FALLBACK_LOCALE, {
      ...options,
      timeZone: ctx.timeZone || FALLBACK_ZONE,
    });
  } catch {
    return new Intl.DateTimeFormat(FALLBACK_LOCALE, { ...options, timeZone: FALLBACK_ZONE });
  }
}

/**
 * An amount in its currency, as the academy writes money: "₦12,000.00".
 *
 * `cents` is the stored minor-unit amount (kobo, cents). Pass the academy's
 * locale — the same rule as dates: the machine's own locale must never decide
 * what a figure looks like. A locale or currency code Intl does not know (both
 * are values somebody typed into a settings form) falls back to a plain
 * "NGN 12000.00" rather than taking the page down with a RangeError.
 */
export function formatMoney(
  cents: number | null | undefined,
  currency: string,
  locale?: string | null
): string {
  const amount = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(locale || FALLBACK_LOCALE, { style: "currency", currency }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat(FALLBACK_LOCALE, { style: "currency", currency }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }
}

/** "24 Nov 2026" */
export function formatDate(
  value: Date | string | number | null | undefined,
  ctx: FormatContext = {},
  fallback = "—"
): string {
  const date = toDate(value);
  return date ? formatter(ctx, { dateStyle: "medium" }).format(date) : fallback;
}

/** "24 Nov 2026, 22:51" */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  ctx: FormatContext = {},
  fallback = "—"
): string {
  const date = toDate(value);
  return date ? formatter(ctx, { dateStyle: "medium", timeStyle: "short" }).format(date) : fallback;
}
