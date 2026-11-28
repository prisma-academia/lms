import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { tenantSettingsSchema, parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { listInWords, onboardingMissing } from "@/lib/tenant/onboarding";
import { isValidCountryCode } from "@/lib/geo/countries";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  companyEmail: z.email().nullable().optional(),
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
    .refine((v) => !v || isValidCountryCode(v), "Choose a country from the list."),
  settings: tenantSettingsSchema.partial().optional(),
});

function withBrandingUrls(settings: ReturnType<typeof parseTenantSettings>) {
  return {
    ...settings,
    ...brandingAssetUrls(settings),
  };
}

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_READ.key);
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");
    const settings = parseTenantSettings(tenant.settingsJson);
    return ok({
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      settings: withBrandingUrls(settings),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_WRITE.key);
    const body = PatchBody.parse(await request.json());
    const meta = requestMeta(request);

    const before = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Tenant not found.");

    const current = parseTenantSettings(before.settingsJson);
    // Merge patch over current, then re-validate the full object.
    const merged = tenantSettingsSchema.parse({
      ...current,
      ...(body.settings ?? {}),
      // `onboarding` is merged a level deeper than the rest. It also carries
      // the trial-reminder stamps written by the billing job, and a wizard step
      // that sends only `completedSteps` must not wipe them.
      ...(body.settings?.onboarding
        ? { onboarding: { ...(current.onboarding ?? {}), ...body.settings.onboarding } }
        : {}),
    });

    // An academy is only marked as set up when what set-up asks for is really
    // there — not because a client sent the flag. Checked once, at the moment
    // the flag is first set; an academy already marked is left alone.
    if (merged.onboarding?.completedAt && !current.onboarding?.completedAt) {
      const me = await prisma.tenantUser.findUnique({
        where: { id: actor.userId },
        select: { firstName: true, lastName: true },
      });
      const missing = onboardingMissing({
        firstName: me?.firstName,
        lastName: me?.lastName,
        academyName: body.name ?? before.name,
        companyEmail: body.companyEmail !== undefined ? body.companyEmail : before.companyEmail,
        country: body.country !== undefined ? body.country : before.country,
      });
      if (missing.length > 0) {
        throw new DomainError(
          400,
          "onboarding_incomplete",
          `Set-up cannot be finished yet. Still needed: ${listInWords(missing)}.`
        );
      }
    }

    const updated = await prisma.tenant.update({
      where: { id: actor.tenantId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.companyEmail !== undefined ? { companyEmail: body.companyEmail } : {}),
        ...(body.companyPhone !== undefined ? { companyPhone: body.companyPhone } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
        ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.region !== undefined ? { region: body.region } : {}),
        ...(body.postalCode !== undefined ? { postalCode: body.postalCode } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        settingsJson: merged as object,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "tenant.update_settings",
      tenantId: actor.tenantId,
      targetType: "Tenant",
      targetId: actor.tenantId,
      before: { name: before.name, settingsJson: current } as object,
      after: { name: updated.name, settingsJson: merged } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({
      tenant: { id: updated.id, name: updated.name, slug: updated.slug },
      settings: withBrandingUrls(merged),
    });
  } catch (e) {
    return handleError(e);
  }
}
