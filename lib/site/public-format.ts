/**
 * Prices on public pages. Always formatted on the server with the academy's own
 * locale, so the string a visitor is sent is the string they see.
 */
export function formatPrice(
  cents: number | null | undefined,
  currency: string,
  locale?: string | null
): string {
  if (cents == null || cents <= 0) return "Free";
  const amount = cents / 100;
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    // ₦5,000 not ₦5,000.00 — but keep the pennies when there are some.
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  };
  // A stored locale or currency can be anything a person typed; a bad one must
  // not take a public page down with a RangeError.
  try {
    return new Intl.NumberFormat(locale || "en", options).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat("en", options).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString("en")}`;
    }
  }
}

export function isPaid(cents: number | null | undefined): boolean {
  return cents != null && cents > 0;
}

/** "1 lesson", "12 lessons". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "45 min", "2 hr", "2 hr 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}
