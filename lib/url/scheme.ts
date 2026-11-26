import { env } from "@/lib/env";

/**
 * The scheme for links the app writes itself — sign-in links in emails, the
 * fallback origin for page metadata — where there is no request to read it
 * from. A production deployment is always served over HTTPS; a local dev host
 * (`localhost:3000`, `demo.localhost:3000`) is plain HTTP.
 *
 * Where a request exists, prefer its `x-forwarded-proto` (see
 * `requestOrigin` in lib/site/metadata.ts and lib/billing/redirect.ts).
 */
export function appScheme(): "http" | "https" {
  return env.NODE_ENV === "production" ? "https" : "http";
}
