import type { FormatContext } from "@/lib/format";

/**
 * How the platform console shows dates and times.
 *
 * An academy has its own locale and time zone in its settings; the platform
 * console has no such thing — it looks across every academy at once. So it uses
 * one fixed clock, UTC, and says so on the pages where a time of day matters.
 * Fixed is the point: every operator, and the server that renders the page,
 * formats the same instant to the same string.
 */
export const PLATFORM_FORMAT: FormatContext = { locale: "en-GB", timeZone: "UTC" };

/** A whole-number amount with thousands separators, e.g. "1,250,000". */
export function formatWholeAmount(cents: number | null | undefined): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format((cents ?? 0) / 100);
}

/** An amount in its currency, e.g. "NGN 5,000.00" — spelled the same on every machine. */
export function formatPlatformMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(cents / 100);
  } catch {
    // A currency code Intl does not know must not take the page down.
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}
