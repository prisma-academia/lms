import { apexHostname, env, platformHostname } from "@/lib/env";

export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "www",
  "app",
  "auth",
  "static",
  "assets",
  "mail",
  "platform",
  "_next",
]);

export type HostContext =
  | { mode: "apex"; slug: null }
  | { mode: "platform"; slug: null }
  | { mode: "tenant"; slug: string }
  | { mode: "unknown"; slug: string };

export function resolveHost(host: string | null | undefined): HostContext {
  if (!host) return { mode: "apex", slug: null };
  const hostname = host.split(":")[0].toLowerCase();
  const apex = apexHostname().toLowerCase();
  const platform = platformHostname().toLowerCase();

  if (hostname === apex) return { mode: "apex", slug: null };
  if (hostname === platform) return { mode: "platform", slug: null };
  if (!hostname.endsWith(`.${apex}`)) {
    return { mode: "apex", slug: null };
  }
  const sub = hostname.slice(0, -1 * (apex.length + 1));
  if (sub.length === 0) return { mode: "apex", slug: null };
  if (sub.includes(".")) return { mode: "unknown", slug: sub };
  if (sub === env.PLATFORM_SUBDOMAIN) return { mode: "platform", slug: null };
  if (RESERVED_SLUGS.has(sub)) return { mode: "apex", slug: null };
  return { mode: "tenant", slug: sub };
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  if (RESERVED_SLUGS.has(slug)) return false;
  return SLUG_REGEX.test(slug);
}
