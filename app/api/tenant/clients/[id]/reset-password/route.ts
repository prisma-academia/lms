import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { hashPassword, generateTempPassword, recordPassword } from "@/lib/auth/password";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { sendAdminReset } from "@/lib/auth/setup-email";
import { tenantBranding } from "@/lib/email/branding";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { displayName } from "@/lib/auth/display";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CLIENTS_WRITE.key);
    const { id } = await ctx.params;
    const meta = requestMeta(request);

    const target = await prisma.client.findUnique({ where: { id } });
    if (!target || target.tenantId !== actor.tenantId) {
      throw new DomainError(404, "not_found", "Client not found.");
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");

    // Replace the password with one nobody knows, so the old one stops working
    // now; the person chooses the next one through the link we email them.
    const passwordHash = await hashPassword(generateTempPassword());
    await prisma.client.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    await recordPassword("CLIENT", id, passwordHash);
    await revokeAllSessionsForUser("CLIENT", id);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "client.reset_password",
      tenantId: actor.tenantId,
      targetType: "Client",
      targetId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const email = await sendAdminReset({
      userType: "CLIENT",
      userId: id,
      tenantId: actor.tenantId,
      tenantSlug: tenant.slug,
      branding: tenantBranding(tenant),
      to: target.email,
      name: displayName({ firstName: target.firstName, lastName: target.lastName, email: target.email }),
    });
    return ok({ reset: true, emailSent: email.sent });
  } catch (e) {
    return handleError(e);
  }
}
