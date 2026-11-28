import { prisma } from "@/lib/db/client";
import { rawPrisma } from "@/lib/db/raw-client";
import { hashOpaqueToken, newOpaqueToken } from "@/lib/auth/tokens";
import { safeNextPath } from "@/lib/auth/next-path";
import { tenantHttpOrigin } from "@/lib/url/tenant";

/**
 * One-time magic sign-in links for learners, minted through the Developer API
 * (`POST /v1/learners/{id}/login-link`) so a school portal can drop a learner
 * straight into the academy.
 *
 * Deliberately NOT the PasswordResetToken: a reset token lets its holder set
 * a password, which a sign-in link must never do. Single use, a few minutes'
 * life, only the sha256 stored, and only redeemable on the academy's own host.
 */

export const LOGIN_LINK_PATH = "/api/auth/login-link";

export async function issueLoginLink(input: {
  tenantId: string;
  tenantSlug: string;
  clientId: string;
  redirectPath?: string | null;
  expiresInMinutes: number;
  apiKeyId?: string | null;
}): Promise<{ url: string; expiresAt: Date }> {
  const raw = newOpaqueToken();
  const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
  await prisma.loginLinkToken.create({
    data: {
      tenantId: input.tenantId,
      clientId: input.clientId,
      tokenHash: hashOpaqueToken(raw),
      redirectPath: safeNextPath(input.redirectPath ?? null),
      apiKeyId: input.apiKeyId ?? null,
      expiresAt,
    },
  });
  return { url: `${tenantHttpOrigin(input.tenantSlug)}${LOGIN_LINK_PATH}?token=${encodeURIComponent(raw)}`, expiresAt };
}

export type ConsumeResult =
  | { ok: true; tenantId: string; clientId: string; redirectPath: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" | "wrong_host" };

/**
 * Redeem a link: the token must exist, be unexpired and unused, and belong to
 * the academy whose host the request arrived on. Consumption is atomic, so two
 * clicks racing sign in at most once.
 */
export async function consumeLoginLink(token: string, hostTenantId: string, ip: string | null): Promise<ConsumeResult> {
  if (!token || token.length > 200) return { ok: false, reason: "invalid" };
  // Keyed by an unguessable hash, before any tenant context: the raw client.
  const row = await rawPrisma.loginLinkToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.tenantId !== hostTenantId) return { ok: false, reason: "wrong_host" };
  if (row.consumedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  const claimed = await rawPrisma.loginLinkToken.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date(), consumedIp: ip },
  });
  if (claimed.count !== 1) return { ok: false, reason: "used" };
  return { ok: true, tenantId: row.tenantId, clientId: row.clientId, redirectPath: row.redirectPath };
}
