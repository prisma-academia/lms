import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getSession, readSessionToken } from "@/lib/auth/session";
import { enterContext } from "@/lib/db/tenant-context";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { RETURN_PATH_HEADER, SESSION_ENDED, SESSION_PARAM, sessionEndedHref } from "@/lib/auth/next-path";
import {
  hasPermission,
  PERMISSIONS,
  type PermissionKey,
  type PlatformActor,
  type TenantActor,
  type ClientActor,
} from "@/lib/auth/permissions";

/**
 * Redirect-based page mirrors of the API guards in `lib/auth/guards.ts`.
 *
 * API guards throw `AuthError`; server components/layouts cannot surface that
 * as a useful response, so these validate the session the same way (revoked /
 * expired via `getSession`, user status, scope) and `redirect()` instead.
 * They bind the Prisma tenant context (`enterContext`) just like the API
 * guards, so callers can query immediately after. Fail-closed.
 */

/**
 * Where a staff or platform page sends someone whose session cookie is still
 * in the browser but no longer valid. The marker stops the proxy — which can
 * only see that a cookie exists — from sending them straight back to the page
 * that just turned them away. Same reasoning as `sessionEndedHref` for learners.
 */
const STAFF_ENDED = {
  platform: `/auth/login?${SESSION_PARAM}=${SESSION_ENDED}`,
  admin: `/admin/auth/login?${SESSION_PARAM}=${SESSION_ENDED}`,
} as const;

export async function requirePlatformPage(
  permission?: PermissionKey
): Promise<PlatformActor> {
  const session = await getSession(await readSessionToken("PLATFORM"));
  if (!session || session.userType !== "PLATFORM") redirect(STAFF_ENDED.platform);
  if (session.scope === "MUST_CHANGE_PASSWORD") {
    redirect("/auth/change-password");
  }
  enterContext({ mode: "platform", tenantId: null });
  const user = await prisma.platformUser.findUnique({
    where: { id: session.userId },
  });
  if (!user || user.status !== "ACTIVE") redirect(STAFF_ENDED.platform);

  const actor: PlatformActor = {
    kind: "platform",
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    permissions: new Set(user.permissions),
  };
  if (permission && !hasPermission(actor, permission)) redirect("/dashboard");
  return actor;
}

/** Being able to change academy settings is what makes the set-up wizard yours to finish. */
const SETTINGS_WRITE = PERMISSIONS.TENANT_SETTINGS_WRITE.key;

export async function requireTenantPage(
  permission?: PermissionKey,
  opts?: { skipOnboardingGate?: boolean }
): Promise<TenantActor> {
  const session = await getSession(await readSessionToken("TENANT"));
  if (!session || session.userType !== "TENANT" || !session.tenantId) {
    redirect(STAFF_ENDED.admin);
  }
  if (session.scope === "MUST_CHANGE_PASSWORD") {
    redirect("/admin/auth/change-password");
  }
  enterContext({ mode: "tenant-admin", tenantId: session.tenantId });
  const user = await prisma.tenantUser.findUnique({
    where: { id: session.userId },
  });
  if (!user || user.status !== "ACTIVE" || user.tenantId !== session.tenantId) {
    redirect(STAFF_ENDED.admin);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { status: true, settingsJson: true },
  });
  if (!tenant) redirect("/admin/auth/login");
  if (tenant.status !== "ACTIVE") redirect("/maintenance");

  // Onboarding gate. Must live in the guard (which every dashboard page calls)
  // rather than only the dashboard layout: a bare layout `redirect()` degrades
  // to a client-side loop once the child page has begun streaming its content.
  // Redirecting from the guard fires before the page renders, yielding a clean
  // HTTP redirect. `skipOnboardingGate` exempts the onboarding/setup routes
  // themselves so they don't redirect to their own destination.
  const actor: TenantActor = {
    kind: "tenant",
    userId: user.id,
    tenantId: user.tenantId,
    isOwner: user.isOwner,
    permissions: new Set(user.permissions),
  };

  // Who is sent to the wizard: anyone who can actually complete it — the owner,
  // and staff allowed to change academy settings. Staff who cannot (an
  // instructor invited before the owner finished) go straight to the dashboard:
  // sending them to a wizard they are not allowed to save would trap them.
  // An academy that finished or skipped set-up before this wizard existed has
  // `completedAt` already and is never sent back through it.
  if (!opts?.skipOnboardingGate && hasPermission(actor, SETTINGS_WRITE)) {
    const settings = parseTenantSettings(tenant.settingsJson);
    if (!settings.onboarding?.completedAt) redirect("/admin/onboarding");
  }

  if (permission && !hasPermission(actor, permission)) {
    redirect("/admin/dashboard");
  }
  return actor;
}

/**
 * The sign-in address for a learner this page has just turned away, carrying
 * the page they asked for so they land back on it. The proxy only lets a
 * request reach a learner page when a session cookie is present, so being
 * turned away here means the session behind that cookie has ended.
 */
async function clientSignInHref(): Promise<string> {
  let asked: string | null = null;
  try {
    asked = (await headers()).get(RETURN_PATH_HEADER);
  } catch {
    // Not in a request scope: sign in without a return address.
  }
  return sessionEndedHref(asked);
}

export async function requireClientPage(): Promise<ClientActor> {
  const session = await getSession(await readSessionToken("CLIENT"));
  if (!session || session.userType !== "CLIENT" || !session.tenantId) {
    redirect(await clientSignInHref());
  }
  if (session.scope === "MUST_CHANGE_PASSWORD") {
    redirect("/auth/change-password");
  }
  enterContext({ mode: "tenant-client", tenantId: session.tenantId });
  const client = await prisma.client.findUnique({
    where: { id: session.userId },
  });
  if (
    !client ||
    client.status !== "ACTIVE" ||
    client.tenantId !== session.tenantId
  ) {
    redirect(await clientSignInHref());
  }
  return { kind: "client", clientId: client.id, tenantId: client.tenantId };
}

const DASHBOARD_BY_AREA = {
  platform: { type: "PLATFORM", dest: "/dashboard" },
  admin: { type: "TENANT", dest: "/admin/dashboard" },
  client: { type: "CLIENT", dest: "/dashboard" },
} as const;

/**
 * Inverse guard for auth UIs (login / register / forgot / reset). If a valid
 * FULL-scope session exists, bounce to that area's dashboard. A
 * MUST_CHANGE_PASSWORD session is left alone so the user can still reach the
 * change-password page (which lives outside the guarded route group).
 */
export async function redirectIfAuthenticated(
  area: "platform" | "admin" | "client"
): Promise<void> {
  const { type, dest } = DASHBOARD_BY_AREA[area];
  const session = await getSession(await readSessionToken(type));
  if (!session) return;
  if (session.scope === "MUST_CHANGE_PASSWORD") return;
  redirect(dest);
}
