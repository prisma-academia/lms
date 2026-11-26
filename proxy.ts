import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/auth/context";
import { COOKIE_NAMES } from "@/lib/auth/session";
import {
  NEXT_PARAM,
  RETURN_PATH_HEADER,
  SESSION_ENDED,
  SESSION_PARAM,
  safeNextPath,
} from "@/lib/auth/next-path";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_PARAM,
  normalizeReferralCode,
} from "@/lib/referrals/code-format";
import { publicItemExists } from "@/lib/site/public-catalog";
import { academyExists } from "@/lib/tenant/exists";
import { isProd } from "@/lib/env";

const PUBLIC_PLATFORM = [
  "/auth/login",
  "/auth/change-password",
  "/auth/forgot-password",
  "/auth/reset-password",
];
const PUBLIC_ADMIN = [
  "/admin/auth/login",
  "/admin/auth/change-password",
  "/admin/auth/forgot-password",
  "/admin/auth/reset-password",
];
const PUBLIC_CLIENT = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/change-password",
];

const APEX_MARKETING = ["/", "/pricing", "/how-it-works", "/register"];

function inList(path: string, list: string[]): boolean {
  return list.some((p) => path === p || path.startsWith(`${p}/`));
}

function isApexMarketing(path: string): boolean {
  if (path === "/") return true;
  return APEX_MARKETING.some((p) => p !== "/" && (path === p || path.startsWith(`${p}/`)));
}

function notFoundRewrite(url: { clone(): URL }): NextResponse {
  const u = url.clone();
  u.pathname = "/not-found";
  return NextResponse.rewrite(u, { status: 404 });
}

function isInternalPrefix(path: string): boolean {
  return (
    path === "/m" ||
    path.startsWith("/m/") ||
    path === "/t" ||
    path.startsWith("/t/") ||
    path.startsWith("/c/")
  );
}

export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const host = request.headers.get("host");
  const url = request.nextUrl;
  const path = url.pathname;

  if (path.startsWith("/api/")) return NextResponse.next();
  if (path.startsWith("/_next/") || path === "/favicon.ico") return NextResponse.next();
  // Maintenance screen must serve on any host without auth/rewrite so the
  // lifecycle redirect (PRD §13) does not loop back to a login redirect.
  if (path === "/maintenance") return NextResponse.next();

  if (isInternalPrefix(path)) {
    return notFoundRewrite(url);
  }

  const ctx = resolveHost(host);

  if (ctx.mode === "unknown") {
    const u = url.clone();
    u.pathname = "/unknown-tenant";
    return NextResponse.rewrite(u, { status: 404 });
  }

  if (ctx.mode === "apex") return handleApex(request);
  if (ctx.mode === "platform") return handlePlatform(request);
  return handleTenant(request, ctx.slug);
}

function handleApex(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;

  if (!isApexMarketing(path)) {
    return notFoundRewrite(url);
  }

  // Marketing is now a single landing page; legacy section routes redirect to
  // their in-page anchors.
  if (path === "/pricing" || path === "/how-it-works") {
    return NextResponse.redirect(new URL(`/#${path.slice(1)}`, url));
  }

  const internal = path === "/" ? "/m" : `/m${path}`;
  return NextResponse.rewrite(new URL(`${internal}${url.search}`, url));
}

function handlePlatform(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;
  const hasSession = !!request.cookies.get(COOKIE_NAMES.platform)?.value;

  if (path.startsWith("/admin") || path === "/t" || path.startsWith("/t/")) {
    return notFoundRewrite(url);
  }

  if (path === "/") {
    const u = url.clone();
    u.pathname = hasSession ? "/dashboard" : "/auth/login";
    return NextResponse.redirect(u);
  }
  if (inList(path, PUBLIC_PLATFORM)) {
    // A cookie that is present but no longer valid: the page that turned the
    // visitor away adds ?session=ended so they are not bounced straight back.
    if (hasSession && path === "/auth/login" && url.searchParams.get(SESSION_PARAM) !== SESSION_ENDED) {
      const u = url.clone();
      u.pathname = "/dashboard";
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  }
  if (!hasSession) {
    const u = url.clone();
    u.pathname = "/auth/login";
    return NextResponse.redirect(u);
  }
  return NextResponse.next();
}

const RESERVED_CLIENT_PREFIXES = [
  "/auth",
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

function isReservedClientPath(path: string): boolean {
  return RESERVED_CLIENT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

async function handleTenant(request: NextRequest, tenantSlug: string): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // A host that only LOOKS like an academy. Answered here, with a real 404,
  // because once a page starts rendering the status is already 200 — every
  // made-up subdomain used to look like a working site to a crawler. `null`
  // (could not tell) lets the request through, so a slow database never turns
  // real academies into "not found".
  if ((await academyExists(tenantSlug)) === false) {
    const u = request.nextUrl.clone();
    u.pathname = "/unknown-tenant";
    return NextResponse.rewrite(u, { status: 404 });
  }

  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  if (isAdmin) return handleAdmin(request);

  // Everything a visitor or a learner can reach. A shared link may carry a
  // staff member's `?ref=` code on any of it, so the code is remembered here,
  // once, whatever the response turns out to be (a page, a redirect, a 404).
  return rememberReferral(request, await routeTenantSite(request, tenantSlug));
}

async function routeTenantSite(request: NextRequest, tenantSlug: string): Promise<NextResponse> {
  const url = request.nextUrl;
  const path = url.pathname;

  if (path === "/") {
    return NextResponse.rewrite(new URL(`/t${url.search}`, url));
  }

  // Learner app routes (auth + dashboard)
  if (isReservedClientPath(path)) return handleClient(request, tenantSlug);

  // Public CMS page: /about → /t/p/about
  const slug = path.replace(/^\//, "").split("/")[0];
  if (slug && !slug.includes(".")) {
    return NextResponse.rewrite(new URL(`/t/p/${slug}${url.search}`, url));
  }

  return handleClient(request, tenantSlug);
}

/**
 * Remember which staff member's link brought this visitor.
 *
 * Only the shape of the code is checked here — the proxy runs on every request
 * and must not consult the database for this. Whether the code is real is
 * decided when it is used (lib/referrals/attribution.ts). HttpOnly: the page
 * has no business reading it, and nothing in the browser can rewrite it into
 * someone else's code. The `?ref=` stays in the address bar untouched; a
 * redirect that dropped it would break the link for the next person it is
 * forwarded to.
 */
function rememberReferral(request: NextRequest, response: NextResponse): NextResponse {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  const code = normalizeReferralCode(request.nextUrl.searchParams.get(REFERRAL_PARAM));
  if (!code) return response;
  response.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE,
  });
  return response;
}

/** `/courses/intro` or `/programmes/data` — exactly one segment after the section. */
const PUBLIC_DETAIL = /^\/(courses|programmes)\/([^/]+)\/?$/;

/**
 * Where a signed-out visitor goes on a learner path.
 *
 * The catalogue, a course and a programme each have a public page, so a shared
 * link shows the thing itself instead of a sign-in wall. Anything else in the
 * learner app still needs an account — but the visitor is sent to sign in
 * carrying the address they asked for, so they end up there afterwards.
 */
async function routeSignedOutVisitor(
  request: NextRequest,
  tenantSlug: string
): Promise<NextResponse> {
  const url = request.nextUrl;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

  if (path === "/courses" || path === "/programmes") {
    return NextResponse.rewrite(new URL(`/t${path}${url.search}`, url));
  }

  const detail = PUBLIC_DETAIL.exec(path);
  if (detail) {
    const kind = detail[1] === "courses" ? "course" : "programme";
    let slug: string | null;
    try {
      slug = decodeURIComponent(detail[2]);
    } catch {
      slug = null;
    }

    // Asked here rather than left to the page: once a page starts streaming its
    // status is already 200, and "not found" can then only be drawn, not sent.
    // A missing item, a draft and a private one get the identical response —
    // the same rewrite, the same status — so the reply never says which.
    const exists = slug ? await publicItemExists(tenantSlug, kind, slug) : false;
    if (exists === false) {
      const u = new URL("/t/unavailable", url);
      u.searchParams.set("from", path);
      return NextResponse.rewrite(u, { status: 404 });
    }
    // true, or null ("could not tell" — the page applies the same rule itself).
    return NextResponse.rewrite(new URL(`/t${path}${url.search}`, url));
  }

  const login = new URL("/auth/login", url);
  const next = returnPathOf(url);
  if (next) login.searchParams.set(NEXT_PARAM, next);
  return NextResponse.redirect(login);
}

/** The address being asked for, as somewhere to come back to after signing in. */
function returnPathOf(url: URL): string | null {
  // The referral code has just been put in a cookie; it does not need to ride
  // along in the return address as well.
  const back = new URLSearchParams(url.search);
  back.delete(REFERRAL_PARAM);
  const query = back.toString();
  return safeNextPath(`${url.pathname}${query ? `?${query}` : ""}`);
}

function handleAdmin(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;
  const hasSession = !!request.cookies.get(COOKIE_NAMES.tenant)?.value;

  if (path === "/admin" || path === "/admin/") {
    const u = url.clone();
    u.pathname = hasSession ? "/admin/dashboard" : "/admin/auth/login";
    return NextResponse.redirect(u);
  }
  if (inList(path, PUBLIC_ADMIN)) {
    if (hasSession && path === "/admin/auth/login" && url.searchParams.get(SESSION_PARAM) !== SESSION_ENDED) {
      const u = url.clone();
      u.pathname = "/admin/dashboard";
      return NextResponse.redirect(u);
    }
    return NextResponse.next();
  }
  if (!hasSession) {
    const u = url.clone();
    u.pathname = "/admin/auth/login";
    return NextResponse.redirect(u);
  }
  return NextResponse.next();
}

function handleClient(
  request: NextRequest,
  tenantSlug: string
): NextResponse | Promise<NextResponse> {
  const url = request.nextUrl;
  const path = url.pathname;
  const hasSession = !!request.cookies.get(COOKIE_NAMES.client)?.value;

  if (inList(path, PUBLIC_CLIENT)) {
    // A cookie being present is all the proxy can see. A page that found the
    // session behind it had ended sends the learner here with a marker; without
    // the exception they would be bounced straight back to that page, for ever.
    // The sign-in page checks the session properly and forwards anyone who
    // really is signed in.
    const sessionEnded = url.searchParams.get(SESSION_PARAM) === SESSION_ENDED;
    if (hasSession && path === "/auth/login" && !sessionEnded) {
      // Already signed in and following a "sign in to continue" link: skip the
      // form and go where the link was heading.
      const next = safeNextPath(url.searchParams.get(NEXT_PARAM));
      return NextResponse.redirect(new URL(next ?? "/dashboard", url));
    }
    return NextResponse.rewrite(new URL(`/c${path}${url.search}`, url));
  }
  if (!hasSession) return routeSignedOutVisitor(request, tenantSlug);

  // Tell the page what was asked for: it is rendered at the rewritten address,
  // and needs the real one if it has to send the learner to sign in again.
  // Set or removed on every request, so a browser cannot supply its own.
  const headers = new Headers(request.headers);
  const asked = returnPathOf(url);
  if (asked) headers.set(RETURN_PATH_HEADER, asked);
  else headers.delete(RETURN_PATH_HEADER);
  return NextResponse.rewrite(new URL(`/c${path}${url.search}`, url), { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
