/**
 * Where to send a learner after they sign in or sign up.
 *
 * A course link shared with someone who has no account has to survive the trip
 * through the sign-in screen: they arrive at /courses/x, are asked to sign in,
 * and should land back on /courses/x. The destination travels in a `?next=`
 * parameter, which makes it attacker-controlled input — a link that says
 * `?next=https://evil.test` must never turn this academy's sign-in page into a
 * redirect to someone else's.
 *
 * So `next` is not validated against a list of bad shapes; it is accepted only
 * if it is one of a short list of good ones: a path on this origin whose first
 * segment is part of the learner app. Everything else — other origins, the
 * staff admin, the API, the sign-in pages themselves — becomes `null`, and the
 * caller falls back to its normal destination.
 *
 * Pure and dependency-free: used by the proxy, route handlers, server pages and
 * the verification script alike.
 */

export const NEXT_PARAM = "next";

/** Longer than any real learner URL; short enough to keep junk out of logs. */
const MAX_LENGTH = 512;

/**
 * First path segments a learner can be returned to. Deliberately an allowlist:
 * `/admin`, `/api`, `/auth` and the site's own CMS pages are absent, so they are
 * refused without anyone having to remember to forbid them.
 */
export const LEARNER_RETURN_PREFIXES: readonly string[] = [
  "/dashboard",
  "/courses",
  "/programmes",
  "/library",
  "/certificates",
  "/profile",
  "/calendar",
  "/grades",
  "/notifications",
  "/my-courses",
  "/inbox",
  "/assignments",
];

/** A host that cannot exist, so a parsed URL keeping it proves the input was relative. */
const BASE = "http://next.invalid";

/**
 * Return `raw` as a safe same-origin learner path (`/path?query`), or `null`.
 *
 * The returned string is rebuilt from the parsed URL rather than echoed, so
 * what the caller redirects to is exactly what was checked.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null;

  // Exactly one leading slash. `//host` is a protocol-relative URL.
  if (raw[0] !== "/" || raw[1] === "/") return null;

  // Browsers read `\` as `/` in http URLs, which turns `/\host` into `//host`;
  // and URL parsers silently drop tabs and newlines, which turns `/\t/host`
  // into `//host`. Neither belongs in a path we were handed, so refuse both
  // outright instead of reasoning about what the parser will make of them.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  // The parser has already resolved `..` (plain or percent-encoded), so the
  // pathname here is the one the browser will actually request.
  const path = url.pathname;

  // An encoded slash or backslash keeps a path looking like one segment to this
  // check while a later decode splits it. Nothing in the learner app needs one.
  if (/%(?:2f|5c|00)/i.test(path)) return null;

  const first = `/${path.split("/")[1] ?? ""}`;
  if (!LEARNER_RETURN_PREFIXES.includes(first)) return null;

  return `${path}${url.search}`;
}

/** `/auth/login` or `/auth/register`, carrying `next` only when it is safe. */
export function authHref(page: "login" | "register", next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `/auth/${page}?${NEXT_PARAM}=${encodeURIComponent(safe)}` : `/auth/${page}`;
}

/**
 * Request header in which the proxy tells a learner page the address the
 * visitor asked for (a page is rendered at a rewritten, internal address and
 * cannot otherwise know). The proxy sets or removes it on every learner
 * request, so a value sent by a browser never reaches a page — and whatever
 * arrives is put through `safeNextPath` before use all the same.
 */
export const RETURN_PATH_HEADER = "x-mt-return-path";

/** `?session=ended`: the sign-in page was reached because a session stopped being valid. */
export const SESSION_PARAM = "session";
export const SESSION_ENDED = "ended";

/**
 * Where a learner page sends someone whose session cookie is still in the
 * browser but no longer valid (expired, revoked, or the account was removed).
 *
 * Two things the plain `/auth/login` got wrong for them. It forgot the page
 * they were on. And the proxy, which can only see THAT a session cookie
 * exists, read it as "already signed in" and sent them straight back to the
 * page that had just turned them away — round and round. The marker tells the
 * proxy to let the sign-in page through; that page checks the session properly
 * and still forwards anyone who really is signed in.
 */
export function sessionEndedHref(returnPath?: string | null): string {
  const params = new URLSearchParams();
  const safe = safeNextPath(returnPath);
  if (safe) params.set(NEXT_PARAM, safe);
  params.set(SESSION_PARAM, SESSION_ENDED);
  return `/auth/login?${params.toString()}`;
}
