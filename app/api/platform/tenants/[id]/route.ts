import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requirePlatformActor, PERMISSIONS } from "@/lib/auth/guards";
import { revokeAllSessionsForTenant } from "@/lib/auth/session";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { isValidCountryCode } from "@/lib/geo/countries";
import { daysUntilTrialEnd, formatBytes, storageUsagePercent } from "@/lib/tenant/plan";

const LifecycleBody = z.object({
  action: z.enum(["suspend", "archive", "restore"]),
});

const ProfileBody = z.object({
  name: z.string().min(1).max(200).optional(),
  companyEmail: z.union([z.email(), z.literal(""), z.null()]).optional(),
  companyPhone: z.string().max(40).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
  country: z
    .string()
    .max(2)
    .nullable()
    .optional()
    .refine((v) => !v || isValidCountryCode(v), "Invalid country code."),
});

function serializeTenant(tenant: {
  storageUsedBytes: bigint;
  storageQuotaBytes: bigint;
  trialEndsAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  subscriptionEndsAt: Date | null;
  [key: string]: unknown;
}) {
  return {
    ...tenant,
    storageUsedBytes: tenant.storageUsedBytes.toString(),
    storageQuotaBytes: tenant.storageQuotaBytes.toString(),
    storageUsedLabel: formatBytes(tenant.storageUsedBytes),
    storageQuotaLabel: formatBytes(tenant.storageQuotaBytes),
    storagePercent: storageUsagePercent(tenant.storageUsedBytes, tenant.storageQuotaBytes),
    trialDaysLeft: daysUntilTrialEnd(tenant.trialEndsAt),
    createdAt: tenant.createdAt.toISOString(),
    archivedAt: tenant.archivedAt?.toISOString() ?? null,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformActor(PERMISSIONS.PLATFORM_TENANTS_READ.key);
    const { id } = await ctx.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        subscriptionPlan: true,
        subaccount: true,
        _count: { select: { users: true, clients: true, courses: true } },
      },
    });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");

    const enrollmentCount = await prisma.enrollment.count({ where: { tenantId: id } });

    return ok({
      tenant: serializeTenant(tenant),
      counts: {
        users: tenant._count.users,
        learners: tenant._count.clients,
        courses: tenant._count.courses,
        enrollments: enrollmentCount,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_TENANTS_WRITE.key);
    const { id } = await ctx.params;
    const raw = await request.json();
    const meta = requestMeta(request);

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");

    if (raw && typeof raw === "object" && "action" in raw) {
      const { action } = LifecycleBody.parse(raw);

      let next: { status: "ACTIVE" | "SUSPENDED" | "ARCHIVED"; archivedAt: Date | null };
      if (action === "suspend") next = { status: "SUSPENDED", archivedAt: null };
      else if (action === "archive") next = { status: "ARCHIVED", archivedAt: new Date() };
      else next = { status: "ACTIVE", archivedAt: null };

      const updated = await prisma.tenant.update({
        where: { id },
        data: next,
        include: { subscriptionPlan: true, subaccount: true },
      });
      if (action === "suspend" || action === "archive") {
        await revokeAllSessionsForTenant(id);
      }
      await audit({
        actorType: "PLATFORM_USER",
        actorId: actor.userId,
        action: `tenant.${action}`,
        tenantId: id,
        targetType: "Tenant",
        targetId: id,
        before: { status: tenant.status },
        after: { status: updated.status },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return ok({ tenant: serializeTenant(updated) });
    }

    const body = ProfileBody.parse(raw);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.companyEmail !== undefined) {
      data.companyEmail = body.companyEmail === "" ? null : body.companyEmail;
    }
    if (body.companyPhone !== undefined) data.companyPhone = body.companyPhone;
    if (body.website !== undefined) data.website = body.website;
    if (body.addressLine1 !== undefined) data.addressLine1 = body.addressLine1;
    if (body.addressLine2 !== undefined) data.addressLine2 = body.addressLine2;
    if (body.city !== undefined) data.city = body.city;
    if (body.region !== undefined) data.region = body.region;
    if (body.postalCode !== undefined) data.postalCode = body.postalCode;
    if (body.country !== undefined) data.country = body.country;

    if (Object.keys(data).length === 0) {
      throw new DomainError(400, "invalid_body", "No profile fields to update.");
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data,
      include: { subscriptionPlan: true, subaccount: true },
    });
    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "tenant.profile_update",
      tenantId: id,
      targetType: "Tenant",
      targetId: id,
      before: {
        name: tenant.name,
        companyEmail: tenant.companyEmail,
      },
      after: data,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ tenant: serializeTenant(updated) });
  } catch (e) {
    return handleError(e);
  }
}
