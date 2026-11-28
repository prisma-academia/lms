import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

/**
 * The signed-in staff member's own details: name and phone.
 *
 * Needs no permission beyond being signed in — it only ever reads or writes the
 * caller's own row, taken from the session and never from the request. The
 * staff-management routes under `/api/tenant/users` are for changing someone
 * else and are permission-gated; this is the one a person uses for themselves,
 * first of all in the academy set-up wizard.
 *
 * Email, role and permissions are deliberately not editable here.
 */

const PHONE = /^[+()\d][\d\s().-]{5,38}$/;

const PatchBody = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || PHONE.test(v), "Enter a phone number, for example +234 801 234 5678.")
    .nullable()
    .optional(),
});

function shape(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isOwner: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    isOwner: user.isOwner,
  };
}

export async function GET() {
  try {
    const actor = await requireTenantActor();
    const user = await prisma.tenantUser.findUnique({ where: { id: actor.userId } });
    if (!user) throw new DomainError(404, "not_found", "Your account could not be found.");
    return ok({ account: shape(user) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor();
    const body = PatchBody.parse(await request.json());
    const meta = requestMeta(request);

    const before = await prisma.tenantUser.findUnique({ where: { id: actor.userId } });
    if (!before) throw new DomainError(404, "not_found", "Your account could not be found.");

    const updated = await prisma.tenantUser.update({
      where: { id: actor.userId },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        // Left out: unchanged. Empty or null: cleared.
        ...(body.phone !== undefined ? { phone: body.phone ? body.phone : null } : {}),
      },
    });

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "tenant_user.update_own_details",
      tenantId: actor.tenantId,
      targetType: "TenantUser",
      targetId: actor.userId,
      before: { firstName: before.firstName, lastName: before.lastName, phone: before.phone } as object,
      after: { firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ account: shape(updated) });
  } catch (e) {
    return handleError(e);
  }
}
