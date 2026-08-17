import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parseTenantSettings, tenantSettingsSchema } from "@/lib/tenant/settings";
import {
  brandingAssetUrls,
  cleanupBrandingKeys,
  finalizeLogoBranding,
} from "@/lib/tenant/branding-assets";
import { s3Configured } from "@/lib/storage/s3";

const Body = z.object({
  key: z.string().min(1).max(300),
});

/**
 * This route reads the uploaded logo back out of object storage, runs five
 * sharp passes over it and writes three derived objects back. Against a
 * self-hosted S3 endpoint on a cold lambda that comfortably outlives the 10s
 * platform default, and a killed function returns the host's HTML error page —
 * which the client cannot parse as JSON, so the admin is shown a generic
 * "Something went wrong" with nothing to act on. Every other heavy route here
 * declares a budget; this one was missing it.
 */
export const maxDuration = 120;
/** sharp is a native module — it cannot run on the edge runtime. */
export const runtime = "nodejs";

/**
 * After the client PUTs the logo to S3, call this to validate dimensions and
 * generate favicon / apple / OG variants into settingsJson.
 */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_WRITE.key);
    const { key } = Body.parse(await request.json());

    if (!s3Configured()) {
      throw new DomainError(
        503,
        "storage_unconfigured",
        "Object storage is not configured, so logo uploads are disabled. Ask your platform administrator to configure the S3 settings."
      );
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");

    const current = parseTenantSettings(tenant.settingsJson);
    const result = await finalizeLogoBranding({
      tenantId: actor.tenantId,
      logoKey: key,
      primaryColor: current.primaryColor,
      previous: current,
    });

    const merged = tenantSettingsSchema.parse({
      ...current,
      logoKey: result.logoKey,
      brandingAssets: result.brandingAssets,
    });

    await prisma.tenant.update({
      where: { id: actor.tenantId },
      data: { settingsJson: merged as object },
    });

    await cleanupBrandingKeys(result.orphanKeys);

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "tenant.finalize_logo",
      tenantId: actor.tenantId,
      targetType: "Tenant",
      targetId: actor.tenantId,
      after: { logoKey: result.logoKey, brandingAssets: result.brandingAssets } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const urls = brandingAssetUrls(merged);
    return ok({ settings: { ...merged, ...urls } });
  } catch (e) {
    return handleError(e);
  }
}
