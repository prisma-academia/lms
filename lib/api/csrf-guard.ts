import { verifyCsrf, verifyCsrfValue } from "@/lib/auth/csrf";
import { DomainError } from "./errors";

export async function requireCsrf(request: Request): Promise<void> {
  const ok = await verifyCsrf(request);
  if (!ok) throw new DomainError(403, "csrf", "CSRF verification failed.");
}

/**
 * Accept the CSRF token from the request header OR from an already-parsed
 * body field. Only for endpoints that must work with `navigator.sendBeacon`,
 * which cannot set headers — see verifyCsrfValue.
 */
export async function requireCsrfHeaderOrBody(
  request: Request,
  bodyToken: string | undefined
): Promise<void> {
  if (await verifyCsrf(request)) return;
  if (bodyToken && (await verifyCsrfValue(bodyToken))) return;
  throw new DomainError(403, "csrf", "CSRF verification failed.");
}
