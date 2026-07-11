import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/auth/context";
import { COOKIE_NAMES } from "@/lib/auth/session";

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

export function proxy(request: NextRequest) {
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
  return handleTenant(request);
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
    if (hasSession && path === "/auth/login") {
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

function handleTenant(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;

  if (path === "/") {
    return NextResponse.rewrite(new URL(`/t${url.search}`, url));
  }

  const isAdmin = path === "/admin" || path.startsWith("/admin/");
  if (isAdmin) return handleAdmin(request);
  return handleClient(request);
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
    if (hasSession && path === "/admin/auth/login") {
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

function handleClient(request: NextRequest) {
  const url = request.nextUrl;
  const path = url.pathname;
  const hasSession = !!request.cookies.get(COOKIE_NAMES.client)?.value;

  if (inList(path, PUBLIC_CLIENT)) {
    if (hasSession && path === "/auth/login") {
      return NextResponse.redirect(new URL("/dashboard", url));
    }
    return NextResponse.rewrite(new URL(`/c${path}${url.search}`, url));
  }
  if (!hasSession) {
    const u = url.clone();
    u.pathname = "/auth/login";
    return NextResponse.redirect(u);
  }
  return NextResponse.rewrite(new URL(`/c${path}${url.search}`, url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
