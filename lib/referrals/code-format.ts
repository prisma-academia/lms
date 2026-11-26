/**
 * The shape of a staff referral code, and nothing else.
 *
 * Pure and dependency-free on purpose: the proxy imports this to decide whether
 * a `?ref=` value is worth remembering, and the proxy must not pull in the
 * database to do it. Whether a code actually belongs to someone is checked
 * later, at the moment it is used (see attribution.ts).
 */

/** Query parameter a shared link carries: `/courses/intro?ref=ADA7K3M`. */
export const REFERRAL_PARAM = "ref";

/** Where the code is remembered between the visit and the sign-up. */
export const REFERRAL_COOKIE = "__mt-ref";

/** 30 days: long enough for "I'll sign up at the weekend", short enough to stay honest. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const CODE = /^[A-Z0-9]{4,16}$/;

/**
 * Tidy a code someone typed, pasted or followed a link with, or return `null`
 * when it cannot be a code. Case, spaces and hyphens are forgiven because
 * people read codes aloud and type them from a phone screen.
 */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length > 64) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]+/g, "");
  return CODE.test(cleaned) ? cleaned : null;
}

/**
 * Characters a generated code is drawn from. No I, L, O, 0 or 1: a code is
 * typed by hand from a message or a slide, and those five are where it goes
 * wrong.
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const NAME_LETTERS = 3;
const RANDOM_LETTERS = 4;

function randomIndexes(count: number, modulo: number): number[] {
  // Rejection sampling, so every character is equally likely.
  const limit = 256 - (256 % modulo);
  const out: number[] = [];
  while (out.length < count) {
    const bytes = new Uint8Array(count * 2);
    globalThis.crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit && out.length < count) out.push(byte % modulo);
    }
  }
  return out;
}

function randomLetters(count: number): string {
  return randomIndexes(count, CODE_ALPHABET.length)
    .map((i) => CODE_ALPHABET[i])
    .join("");
}

/**
 * A new code: up to three letters of the staff member's name so they recognise
 * it as theirs, then random characters. Name letters outside the alphabet are
 * skipped rather than kept, so the whole code obeys the no-ambiguity rule.
 */
export function generateReferralCode(name?: string | null): string {
  const fromName = (name ?? "")
    .normalize("NFKD")
    .toUpperCase()
    .split("")
    .filter((ch) => /[A-Z]/.test(ch) && CODE_ALPHABET.includes(ch))
    .slice(0, NAME_LETTERS)
    .join("");
  return fromName + randomLetters(NAME_LETTERS + RANDOM_LETTERS - fromName.length);
}

/** Add (or replace) the referral code on a link. Relative and absolute URLs both work. */
export function withReferralCode(url: string, code: string | null | undefined): string {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return url;
  const [beforeHash, hash = ""] = url.split("#", 2);
  const [path, query = ""] = beforeHash.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(REFERRAL_PARAM, normalized);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}
