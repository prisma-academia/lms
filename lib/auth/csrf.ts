import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { isProd } from "@/lib/env";

const COOKIE_NAME = "mt-csrf";
const HEADER_NAME = "x-csrf-token";

export async function issueCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return token;
}

export async function readCsrfCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value ?? null;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = await readCsrfCookie();
  if (existing) return existing;
  return issueCsrfToken();
}

export async function verifyCsrf(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(HEADER_NAME);
  if (!headerToken) return false;
  return verifyCsrfValue(headerToken);
}

/**
 * Compare an explicitly supplied token against the cookie.
 *
 * Exists for `navigator.sendBeacon`, which cannot set request headers — the
 * only way to deliver a token on page unload is in the body. The double-submit
 * property is unchanged: a cross-origin attacker still cannot read the cookie,
 * so it can no more forge the body token than the header one.
 */
export async function verifyCsrfValue(token: string): Promise<boolean> {
  const cookieToken = await readCsrfCookie();
  if (!cookieToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const CSRF_HEADER = HEADER_NAME;
export const CSRF_COOKIE = COOKIE_NAME;
