import { cache } from "react";
import {
  getContext,
  BOOTSTRAP_TENANT_COOKIE,
  peekArmedBootstrapTenant,
  type RequestContext,
} from "@/lib/db/tenant-context";
import { rawPrisma } from "@/lib/db/raw-client";
import { resolveHost } from "@/lib/auth/context";

/**
 * Resolve the tenant-scoping context for the Prisma guard extension.
 *
 * Priority:
 *  1. Explicit ALS context (`runWithContext`) — when it propagates.
 *  2. Armed bootstrap slot — tenant creation before a session exists.
 *  3. Bootstrap tenant cookie — same flows; backup when slot is unavailable.
 *  4. Active session cookie (platform / tenant / client).
 *  5. Host subdomain → tenant (pre-session flows: login, register, forgot).
 *
 * `AsyncLocalStorage.enterWith` is unreliable across Next's async boundaries,
 * so steps 2–4 derive context from request-scoped `cookies()` / `headers()`,
 * which ARE reliable in the App Router. Internal lookups use the un-extended
 * `rawPrisma` (Session/Tenant are global, so no scoping and no recursion).
 */

// Stable cookie names (kept local to avoid importing session.ts, which would
// create an import cycle through lib/db/client).
const COOKIE = {
  platform: "__mt-platform-session",
  tenant: "__mt-tenant-session",
  client: "__mt-client-session",
} as const;

async function fromBootstrapCookie(): Promise<RequestContext | null> {
  let jar: { get(name: string): { value: string } | undefined };
  try {
    const { cookies } = await import("next/headers");
    jar = await cookies();
  } catch {
    return null;
  }

  const tenantId = jar.get(BOOTSTRAP_TENANT_COOKIE)?.value;
  if (!tenantId) return null;

  const tenant = await rawPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) return null;
  return { mode: "tenant-admin", tenantId: tenant.id };
}

async function fromSession(): Promise<RequestContext | null> {
  let jar: { get(name: string): { value: string } | undefined };
  try {
    const { cookies } = await import("next/headers");
    jar = await cookies();
  } catch {
    return null; // not in a request scope
  }

  const platformToken = jar.get(COOKIE.platform)?.value;
  const tenantToken = jar.get(COOKIE.tenant)?.value;
  const clientToken = jar.get(COOKIE.client)?.value;
  const token = platformToken ?? tenantToken ?? clientToken;
  if (!token) return null;

  const s = await rawPrisma.session.findUnique({ where: { id: token } });
  if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now()) return null;

  if (s.userType === "PLATFORM") return { mode: "platform", tenantId: null };
  if (s.userType === "TENANT") {
    return { mode: "tenant-admin", tenantId: s.tenantId };
  }
  return { mode: "tenant-client", tenantId: s.tenantId };
}

async function fromHost(): Promise<RequestContext | null> {
  let host: string | null;
  try {
    const { headers } = await import("next/headers");
    host = (await headers()).get("host");
  } catch {
    return null;
  }
  const h = resolveHost(host);
  if (h.mode === "platform") return { mode: "platform", tenantId: null };
  if (h.mode === "tenant") {
    const tenant = await rawPrisma.tenant.findUnique({
      where: { slug: h.slug },
      select: { id: true },
    });
    if (tenant) return { mode: "tenant-admin", tenantId: tenant.id };
  }
  return null;
}

const resolveCached = cache(
  async (): Promise<RequestContext | null> => {
    return (await fromSession()) ?? (await fromHost());
  }
);

export async function resolveRequestContext(): Promise<RequestContext | null> {
  const explicit = getContext();
  if (explicit) return explicit;
  const armed = peekArmedBootstrapTenant();
  if (armed) return { mode: "tenant-admin", tenantId: armed };
  const bootstrap = await fromBootstrapCookie();
  if (bootstrap) return bootstrap;
  return resolveCached();
}
