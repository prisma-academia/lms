/**
 * The academy set-up wizard: its steps, and the one rule for "is this academy
 * set up?" that the wizard, the settings API and the page guard all share.
 *
 * No server-only imports — the wizard (a Client Component) reads this too.
 */

export const ONBOARDING_STEPS = [
  { key: "you", label: "Your details", optional: false },
  { key: "academy", label: "Academy details", optional: false },
  { key: "region", label: "Region", optional: false },
  { key: "brand", label: "Look and feel", optional: false },
  { key: "course", label: "First course", optional: true },
  { key: "payout", label: "Getting paid", optional: true },
  { key: "review", label: "Review and finish", optional: false },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export function isOnboardingStepKey(value: string): value is OnboardingStepKey {
  return ONBOARDING_STEPS.some((s) => s.key === value);
}

/**
 * What must exist before an academy can be marked as set up, phrased the way
 * the person filling the wizard in would recognise it.
 *
 * Time zone, language, currency and brand colour are not listed: the settings
 * schema always supplies a value for them, so "missing" cannot happen. They are
 * still asked for in the wizard, where the defaults are shown and can be changed.
 */
export function onboardingMissing(input: {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  academyName: string | null | undefined;
  companyEmail: string | null | undefined;
  country: string | null | undefined;
}): string[] {
  const missing: string[] = [];
  if (!input.firstName?.trim()) missing.push("your first name");
  if (!input.lastName?.trim()) missing.push("your last name");
  if (!input.academyName?.trim()) missing.push("the academy name");
  if (!input.companyEmail?.trim()) missing.push("the academy's contact email");
  if (!input.country?.trim()) missing.push("the academy's country");
  return missing;
}

/** "a", "a and b", "a, b and c". */
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
