import { requireTenantActor } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { ensureReferralCode, getReferralCode } from "@/lib/referrals/codes";

/**
 * Create my referral code.
 *
 * Open to every signed-in staff member — a code is personal, costs nothing and
 * grants nothing, so it needs no permission of its own. Idempotent: someone who
 * already has a code is handed it back, and nothing is recorded a second time.
 */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor();

    const before = await getReferralCode(actor.tenantId, actor.userId);
    const code = before ?? (await ensureReferralCode(actor.tenantId, actor.userId));

    if (!before) {
      const meta = requestMeta(request);
      await audit({
        actorType: "TENANT_USER",
        actorId: actor.userId,
        action: "referral.code_created",
        tenantId: actor.tenantId,
        targetType: "ReferralCode",
        targetId: code.id,
        after: { code: code.code },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    return ok({ id: code.id, code: code.code, active: code.active }, undefined, before ? 200 : 201);
  } catch (e) {
    return handleError(e);
  }
}
