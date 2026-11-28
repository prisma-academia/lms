import { prisma } from "@/lib/db/client";
import { requirePlatformActor, PERMISSIONS } from "@/lib/auth/guards";
import {
  hashPassword,
  generateTempPassword,
  recordPassword,
} from "@/lib/auth/password";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { sendAdminReset } from "@/lib/auth/setup-email";
import { platformBranding } from "@/lib/email/branding";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { displayName } from "@/lib/auth/display";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_USERS_WRITE.key);
    const { id } = await ctx.params;
    const meta = requestMeta(request);

    const user = await prisma.platformUser.findUnique({ where: { id } });
    if (!user) throw new DomainError(404, "not_found", "User not found.");

    // Replace the password with one nobody knows, so the old one stops working
    // now; the person chooses the next one through the link we email them.
    const passwordHash = await hashPassword(generateTempPassword());
    await prisma.platformUser.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    await recordPassword("PLATFORM", id, passwordHash);
    await revokeAllSessionsForUser("PLATFORM", id);
    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "platform_user.reset_password",
      tenantId: null,
      targetType: "PlatformUser",
      targetId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const email = await sendAdminReset({
      userType: "PLATFORM",
      userId: id,
      tenantId: null,
      tenantSlug: null,
      branding: platformBranding(),
      to: user.email,
      name: displayName(user),
    });
    return ok({ reset: true, emailSent: email.sent });
  } catch (e) {
    return handleError(e);
  }
}
