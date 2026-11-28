import { z } from "zod";
import { headers } from "next/headers";
import { resolveHost } from "@/lib/auth/context";
import { prisma } from "@/lib/db/client";
import {
  hashPassword,
  verifyPassword,
  validatePolicy,
  assertNotReused,
  recordPassword,
} from "@/lib/auth/password";
import {
  createSession,
  getSession,
  readSessionToken,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { audit, requestMeta } from "@/lib/auth/audit";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/auth/rate-limit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { enterContext } from "@/lib/db/tenant-context";
import { clientProfileIncomplete } from "@/lib/auth/client-profile";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  /** Which sign-in the form belongs to. Sent by every form; optional for older callers. */
  surface: z.enum(["platform", "tenant_admin", "tenant_client"]).optional(),
});

/**
 * The session whose password is being changed.
 *
 * A browser can hold more than one session at a time. On an academy's address
 * a staff session and a learner session sit side by side, and in production
 * the platform console's cookie is set for the whole domain, so it arrives on
 * every academy address too. Taking "the first session that is valid" — which
 * this route used to do, platform first — checked the typed password against
 * the wrong account: an academy owner changing their password in a browser
 * where a platform administrator was signed in was told "Current password
 * incorrect", every time.
 *
 * So the address decides, and on an academy address the form says which of
 * the two it is. Without that hint, the session that is being made to change
 * its password is the one meant.
 */
async function sessionForRequest(surface: z.infer<typeof Body>["surface"]) {
  const ctx = resolveHost((await headers()).get("host"));

  if (ctx.mode === "platform") {
    return getSession(await readSessionToken("PLATFORM"));
  }
  if (ctx.mode !== "tenant") return null;

  const staff = await getSession(await readSessionToken("TENANT"));
  const learner = await getSession(await readSessionToken("CLIENT"));
  if (surface === "tenant_admin") return staff;
  if (surface === "tenant_client") return learner;
  return [staff, learner].find((s) => s?.scope === "MUST_CHANGE_PASSWORD") ?? staff ?? learner;
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const { currentPassword, newPassword, surface } = Body.parse(await request.json());
    const meta = requestMeta(request);

    const session = await sessionForRequest(surface);
    if (!session) throw new DomainError(401, "unauthorized", "Authentication required.");

    await enforceRateLimit(RATE_PRESETS.CHANGE_PASSWORD, [meta.ip, session.userId]);

    enterContext({
      mode:
        session.userType === "PLATFORM"
          ? "platform"
          : session.userType === "TENANT"
            ? "tenant-admin"
            : "tenant-client",
      tenantId: session.tenantId,
    });

    const policy = validatePolicy(newPassword);
    if (!policy.ok) throw new DomainError(400, "weak_password", policy.reason);

    if (session.userType === "PLATFORM") {
      const user = await prisma.platformUser.findUnique({ where: { id: session.userId } });
      if (!user) throw new DomainError(401, "unauthorized", "User not found.");
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new DomainError(401, "invalid_credentials", "Current password incorrect.");
      }
      const reuse = await assertNotReused("PLATFORM", user.id, newPassword);
      if (!reuse.ok) throw new DomainError(400, "password_reused", "Cannot reuse a recent password.");

      const newHash = await hashPassword(newPassword);
      await prisma.platformUser.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });
      await recordPassword("PLATFORM", user.id, newHash);
      await revokeAllSessionsForUser("PLATFORM", user.id);
      await createSession({
        userId: user.id,
        userType: "PLATFORM",
        tenantId: null,
        scope: "FULL",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await audit({
        actorType: "PLATFORM_USER",
        actorId: user.id,
        action: "auth.change_password",
        tenantId: null,
        targetType: "PlatformUser",
        targetId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return ok({ redirect: "/dashboard" });
    }

    if (session.userType === "TENANT") {
      const user = await prisma.tenantUser.findUnique({ where: { id: session.userId } });
      if (!user) throw new DomainError(401, "unauthorized", "User not found.");
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new DomainError(401, "invalid_credentials", "Current password incorrect.");
      }
      const reuse = await assertNotReused("TENANT", user.id, newPassword);
      if (!reuse.ok) throw new DomainError(400, "password_reused", "Cannot reuse a recent password.");

      const newHash = await hashPassword(newPassword);
      await prisma.tenantUser.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });
      await recordPassword("TENANT", user.id, newHash);
      await revokeAllSessionsForUser("TENANT", user.id);
      await createSession({
        userId: user.id,
        userType: "TENANT",
        tenantId: user.tenantId,
        scope: "FULL",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await audit({
        actorType: "TENANT_USER",
        actorId: user.id,
        action: "auth.change_password",
        tenantId: user.tenantId,
        targetType: "TenantUser",
        targetId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return ok({ redirect: "/admin/dashboard" });
    }

    if (session.userType === "CLIENT") {
      const user = await prisma.client.findUnique({ where: { id: session.userId } });
      if (!user || !user.passwordHash) throw new DomainError(401, "unauthorized", "User not found.");
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new DomainError(401, "invalid_credentials", "Current password incorrect.");
      }
      const reuse = await assertNotReused("CLIENT", user.id, newPassword);
      if (!reuse.ok) throw new DomainError(400, "password_reused", "Cannot reuse a recent password.");

      const newHash = await hashPassword(newPassword);
      await prisma.client.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });
      await recordPassword("CLIENT", user.id, newHash);
      await revokeAllSessionsForUser("CLIENT", user.id);
      await createSession({
        userId: user.id,
        userType: "CLIENT",
        tenantId: user.tenantId,
        scope: "FULL",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await audit({
        actorType: "CLIENT",
        actorId: user.id,
        action: "auth.change_password",
        tenantId: user.tenantId,
        targetType: "Client",
        targetId: user.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      const profileIncomplete = clientProfileIncomplete(user.profileJson);
      return ok({ redirect: profileIncomplete ? "/profile" : "/dashboard" });
    }

    throw new DomainError(400, "not_supported", "Unsupported session type.");
  } catch (e) {
    return handleError(e);
  }
}
