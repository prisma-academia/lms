import { rawPrisma } from "@/lib/db/raw-client";
import { hashOpaqueToken, newOpaqueToken } from "@/lib/auth/tokens";
import { platformHttpOrigin } from "@/lib/url/platform";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import type { SessionUserType } from "@/lib/generated/prisma/client";

/**
 * "Set your password" links.
 *
 * An invitation (or an administrator's reset) used to email a temporary
 * password: the person signed in with it and was then asked to type it again
 * as their "current password" before choosing a real one. Three things to get
 * wrong, and a password sitting in an inbox.
 *
 * Instead the email carries one button. Its link holds a single-use token that
 * identifies the account, so the page it opens only asks for a new password,
 * twice. Setting it signs the person in.
 *
 * The token is the same `PasswordResetToken` the forgot-password flow uses —
 * same hashing, same single use — with a longer life for invitations, which
 * are often opened days later.
 */

export const INVITE_LINK_DAYS = 7;
export const ADMIN_RESET_LINK_HOURS = 24;

const HOUR = 60 * 60 * 1000;

export type SetupKind = "invite" | "admin_reset";

/** Where the link lands, per kind of account. */
export const SETUP_PATH: Record<SessionUserType, string> = {
  PLATFORM: "/auth/setup",
  TENANT: "/admin/auth/setup",
  CLIENT: "/auth/setup",
};

export async function issueSetupLink(input: {
  userType: SessionUserType;
  userId: string;
  tenantId: string | null;
  /** Required for academy staff and learners. */
  tenantSlug: string | null;
  kind: SetupKind;
}): Promise<{ url: string; expiresAt: Date }> {
  const raw = newOpaqueToken();
  const life = input.kind === "invite" ? INVITE_LINK_DAYS * 24 * HOUR : ADMIN_RESET_LINK_HOURS * HOUR;
  const expiresAt = new Date(Date.now() + life);

  // One live link per account: a newer one replaces any that were never used.
  // The un-extended client: this runs from platform, academy and background
  // contexts alike, and the row is keyed by an unguessable hash, not a tenant.
  await rawPrisma.passwordResetToken.deleteMany({
    where: { userType: input.userType, userId: input.userId, consumedAt: null },
  });
  await rawPrisma.passwordResetToken.create({
    data: {
      tokenHash: hashOpaqueToken(raw),
      userType: input.userType,
      userId: input.userId,
      tenantId: input.tenantId,
      expiresAt,
    },
  });

  const origin =
    input.userType === "PLATFORM" ? platformHttpOrigin() : tenantHttpOrigin(input.tenantSlug ?? "");
  return { url: `${origin}${SETUP_PATH[input.userType]}?token=${encodeURIComponent(raw)}`, expiresAt };
}

export type SetupTokenInfo =
  | { ok: false; reason: "missing" | "invalid" | "expired" | "used" | "wrong_address" }
  | {
      ok: true;
      userType: SessionUserType;
      email: string;
      firstName: string | null;
      fullName: string | null;
      /** Null for platform accounts. */
      academyName: string | null;
      isOwner: boolean;
      /** True when the account has never been signed in to: an invitation rather than a reset. */
      firstTime: boolean;
    };

/**
 * Who a link is for — shown on the page so the person can see whose password
 * they are setting. Reads only; the token is consumed when the form is saved.
 *
 * `host` says where the page is being viewed: a link opened on the wrong
 * address (another academy, or the platform console) is refused rather than
 * described.
 */
export async function describeSetupToken(
  token: string | undefined,
  host: { mode: "platform" } | { mode: "tenant"; slug: string }
): Promise<SetupTokenInfo> {
  if (!token || token.length < 10) return { ok: false, reason: "missing" };
  const row = await rawPrisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.consumedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const name = (u: { firstName: string | null; lastName: string | null }) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

  if (row.userType === "PLATFORM") {
    if (host.mode !== "platform") return { ok: false, reason: "wrong_address" };
    const user = await rawPrisma.platformUser.findUnique({ where: { id: row.userId } });
    if (!user || user.status !== "ACTIVE") return { ok: false, reason: "invalid" };
    return {
      ok: true,
      userType: "PLATFORM",
      email: user.email,
      firstName: user.firstName ?? null,
      fullName: name(user),
      academyName: null,
      isOwner: false,
      firstTime: user.lastLoginAt == null,
    };
  }

  if (host.mode !== "tenant" || !row.tenantId) return { ok: false, reason: "wrong_address" };
  const tenant = await rawPrisma.tenant.findUnique({
    where: { id: row.tenantId },
    select: { id: true, slug: true, name: true, status: true },
  });
  if (!tenant || tenant.slug !== host.slug) return { ok: false, reason: "wrong_address" };
  if (tenant.status !== "ACTIVE") return { ok: false, reason: "invalid" };

  if (row.userType === "TENANT") {
    const user = await rawPrisma.tenantUser.findUnique({ where: { id: row.userId } });
    if (!user || user.tenantId !== tenant.id || user.status !== "ACTIVE") return { ok: false, reason: "invalid" };
    return {
      ok: true,
      userType: "TENANT",
      email: user.email,
      firstName: user.firstName ?? null,
      fullName: name(user),
      academyName: tenant.name,
      isOwner: user.isOwner,
      firstTime: user.lastLoginAt == null,
    };
  }

  const client = await rawPrisma.client.findUnique({ where: { id: row.userId } });
  if (!client || client.tenantId !== tenant.id || client.status !== "ACTIVE") return { ok: false, reason: "invalid" };
  return {
    ok: true,
    userType: "CLIENT",
    email: client.email,
    firstName: client.firstName ?? null,
    fullName: name(client),
    academyName: tenant.name,
    isOwner: false,
    firstTime: client.lastLoginAt == null,
  };
}
