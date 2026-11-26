import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({ active: z.boolean() });

/**
 * Switch a staff member's referral code on or off.
 *
 * Off means the code stops earning credit from now on. Nothing already recorded
 * is touched, and links carrying the code keep working as ordinary links — a
 * visitor who follows one is never shown an error about it.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_REFERRALS_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const existing = await prisma.referralCode.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, code: true, active: true },
    });
    if (!existing) throw new DomainError(404, "not_found", "Referral code not found.");

    if (existing.active !== body.active) {
      await prisma.referralCode.update({ where: { id }, data: { active: body.active } });
      const meta = requestMeta(request);
      await audit({
        actorType: "TENANT_USER",
        actorId: actor.userId,
        action: body.active ? "referral.code_activated" : "referral.code_deactivated",
        tenantId: actor.tenantId,
        targetType: "ReferralCode",
        targetId: id,
        before: { active: existing.active },
        after: { active: body.active },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    return ok({ id, code: existing.code, active: body.active });
  } catch (e) {
    return handleError(e);
  }
}
