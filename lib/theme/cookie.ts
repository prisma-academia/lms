/**
 * Colour-mode preference. Shared by server and client — must not import
 * `next/headers` at module scope or it cannot be used in a client component.
 */

export type ThemeMode = "light" | "dark" | "system";

/** User's explicit choice. */
export const THEME_MODE_COOKIE = "mt-theme";
/**
 * What `system` resolved to on the client, written alongside the mode cookie.
 * The server prefers this so only a first-ever visit depends on the inline
 * anti-FOUC script.
 */
export const THEME_RESOLVED_COOKIE = "mt-theme-resolved";

export const THEME_MODE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function parseResolvedMode(
  value: string | undefined | null
): "light" | "dark" | null {
  return value === "light" || value === "dark" ? value : null;
}

/**
 * Cookie attributes for the client-side toggle.
 *
 * Deliberately NOT httpOnly (the toggle writes it directly, with no round trip)
 * and deliberately WITHOUT a `domain` — a host-only cookie is per-tenant by
 * construction. Do not copy the platform session cookie's `domain=<apex>`, or
 * one tenant's colour mode would leak across every other tenant subdomain.
 */
export function themeCookieAttributes(secure: boolean): string {
  return [
    "Path=/",
    `Max-Age=${THEME_MODE_MAX_AGE}`,
    "SameSite=Lax",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}
