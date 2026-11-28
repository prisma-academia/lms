import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { resolveHost } from "@/lib/auth/context";
import { runWithContext } from "@/lib/db/tenant-context";
import { createSession } from "@/lib/auth/session";
import { audit, requestMeta } from "@/lib/auth/audit";
import { createLearner } from "@/lib/learners/create";
import { DomainError } from "@/lib/api/errors";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { logger } from "@/lib/logger";
import { SSO_COOKIE, SSO_COOKIE_PATH, finishSso, openFlow } from "@/lib/integrations/sso";
import { ssoLoginPath } from "@/lib/integrations/sso-urls";

/**
 * GET /api/sso/callback — the identity provider sends the browser back here
 * (the redirect URI each academy registers: https://<slug>.<domain>/api/sso/callback).
 *
 * 1. The sealed flow cookie must exist, be unexpired, belong to this host's
 *    academy, and its state must match.
 * 2. Code → tokens at the token endpoint (PKCE verifier + client secret);
 *    the ID token's claims are validated (lib/integrations/oidc.ts).
 * 3. The person is found by their linked identity, else by email; learners
 *    may be created on first sign-in when the connection allows it. Staff
 *    must already exist. Suspended people and academies are refused.
 * 4. A session is created exactly as a password sign-in would, and audited.
 */

const USER_FACING: Record<string, string> = {
  state_mismatch: "expired",
  domain_not_allowed: "domain_not_allowed",
  email_unverified: "email_unverified",
  no_email: "no_email",
};

export async function GET(request: Request) {
  const host = resolveHost(request.headers.get("host"));
  if (host.mode !== "tenant") return new NextResponse("Not found", { status: 404 });
  const origin = tenantHttpOrigin(host.slug);
  const url = new URL(request.url);
  const meta = requestMeta(request);
  const jar = await cookies();
  const flow = openFlow(jar.get(SSO_COOKIE)?.value);
  jar.set(SSO_COOKIE, "", { path: SSO_COOKIE_PATH, maxAge: 0 });

  const audience = flow?.a ?? "learner";
  const go = (path: string) => NextResponse.redirect(`${origin}${path}`, 303);
  const fail = (reason: string) => go(ssoLoginPath(audience, reason));

  if (!flow) return fail("expired");
  const tenant = await prisma.tenant.findUnique({ where: { slug: host.slug }, select: { id: true, slug: true, status: true } });
  if (!tenant || tenant.id !== flow.t) return fail("expired");
  if (tenant.status !== "ACTIVE") return fail("unavailable");

  const idpError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (idpError || !code) return fail(idpError === "access_denied" ? "denied" : "error");

  return runWithContext({ mode: audience === "staff" ? "tenant-admin" : "tenant-client", tenantId: tenant.id }, async () => {
    const recordFailure = async (reason: string, extra: Record<string, unknown> = {}) => {
      await audit({
        actorType: "SYSTEM",
        actorId: null,
        action: "auth.sso_login_failed",
        tenantId: tenant.id,
        targetType: "TenantIntegration",
        targetId: flow.i,
        after: { reason, audience, ...extra } as object,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }).catch(() => undefined);
    };

    try {
      const row = await prisma.tenantIntegration.findFirst({ where: { id: flow.i, tenantId: tenant.id } });
      if (!row || row.status === "DISABLED") return fail("unavailable");

      const outcome = await finishSso(row, flow, { code, state, slug: tenant.slug });
      if (!outcome.ok) {
        await recordFailure(outcome.reason, outcome.detail ? { detail: outcome.detail.slice(0, 300) } : {});
        return fail(USER_FACING[outcome.reason] ?? "error");
      }
      const { identity, settings } = outcome;
      // A generic provider must vouch for the address before it is matched
      // to an account; Google always does, Entra addresses are directory-issued.
      if (row.provider === "oidc_generic" && identity.emailVerified !== true) {
        await recordFailure("email_unverified", { email: identity.email });
        return fail("email_unverified");
      }

      const userType = audience === "staff" ? "TENANT" : "CLIENT";
      const link = await prisma.ssoIdentity.findFirst({
        where: { tenantId: tenant.id, integrationId: row.id, userType, subject: identity.subject },
      });

      if (audience === "staff") {
        let user = link?.userId ? await prisma.tenantUser.findFirst({ where: { id: link.userId, tenantId: tenant.id } }) : null;
        if (!user) user = await prisma.tenantUser.findFirst({ where: { tenantId: tenant.id, email: { equals: identity.email, mode: "insensitive" } } });
        if (!user) {
          await recordFailure("no_account", { email: identity.email });
          return fail("no_account");
        }
        if (user.status !== "ACTIVE") {
          await recordFailure("suspended", { email: identity.email });
          return fail("suspended");
        }
        await saveLink(tenant.id, row.id, userType, identity.subject, identity.email, { userId: user.id }, link?.id);
        await prisma.tenantUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await createSession({ userId: user.id, userType: "TENANT", tenantId: tenant.id, scope: "FULL", ip: meta.ip, userAgent: meta.userAgent });
        await audit({
          actorType: "TENANT_USER",
          actorId: user.id,
          action: "auth.sso_login",
          tenantId: tenant.id,
          targetType: "TenantIntegration",
          targetId: row.id,
          after: { provider: row.provider, email: identity.email } as object,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
        return go("/admin/dashboard");
      }

      let client = link?.clientId ? await prisma.client.findFirst({ where: { id: link.clientId, tenantId: tenant.id } }) : null;
      if (!client) client = await prisma.client.findFirst({ where: { tenantId: tenant.id, email: { equals: identity.email, mode: "insensitive" } } });
      let created = false;
      if (!client) {
        if (!settings.jit) {
          await recordFailure("no_account", { email: identity.email });
          return fail("no_account");
        }
        try {
          client = await createLearner(
            tenant.id,
            { email: identity.email, firstName: identity.givenName?.slice(0, 100) ?? null, lastName: identity.familyName?.slice(0, 100) ?? null },
            { actorType: "SYSTEM", actorId: null, ip: meta.ip, userAgent: meta.userAgent }
          );
          created = true;
        } catch (err) {
          // Two first sign-ins racing: the other one created the learner.
          if (!(err instanceof DomainError && err.code === "email_taken")) throw err;
          client = await prisma.client.findFirst({ where: { tenantId: tenant.id, email: identity.email } });
          if (!client) throw err;
        }
      }
      if (client.status !== "ACTIVE") {
        await recordFailure("suspended", { email: identity.email });
        return fail("suspended");
      }
      await saveLink(tenant.id, row.id, userType, identity.subject, identity.email, { clientId: client.id }, link?.id);
      await prisma.client.update({ where: { id: client.id }, data: { lastLoginAt: new Date() } });
      await createSession({ userId: client.id, userType: "CLIENT", tenantId: tenant.id, scope: "FULL", ip: meta.ip, userAgent: meta.userAgent });
      await audit({
        actorType: "CLIENT",
        actorId: client.id,
        action: "auth.sso_login",
        tenantId: tenant.id,
        targetType: "TenantIntegration",
        targetId: row.id,
        after: { provider: row.provider, email: identity.email, provisioned: created } as object,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return go(flow.next ?? "/dashboard");
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "sso_callback_failed");
      await recordFailure("error");
      return fail("error");
    }
  });
}

async function saveLink(
  tenantId: string,
  integrationId: string,
  userType: string,
  subject: string,
  email: string,
  who: { clientId?: string; userId?: string },
  existingId: string | undefined
): Promise<void> {
  const data = { email, clientId: who.clientId ?? null, userId: who.userId ?? null, lastLoginAt: new Date() };
  if (existingId) {
    await prisma.ssoIdentity.update({ where: { id: existingId }, data });
    return;
  }
  try {
    await prisma.ssoIdentity.create({ data: { tenantId, integrationId, userType, subject, ...data } });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    await prisma.ssoIdentity.updateMany({ where: { tenantId, integrationId, userType, subject }, data });
  }
}
