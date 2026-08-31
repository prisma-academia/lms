import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  createPresignedUpload,
  isAllowedImageType,
  s3Configured,
  MAX_ASSET_BYTES,
} from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";
import { formatBytes } from "@/lib/tenant/plan";
import { parseTenantSettings, tenantSettingsSchema } from "@/lib/tenant/settings";
import {
  brandingAssetUrls,
  cleanupBrandingKeys,
  validateFaviconOverride,
} from "@/lib/tenant/branding-assets";
import { audit, requestMeta } from "@/lib/auth/audit";

const PresignBody = z.object({
  contentType: z.string().min(1),
  contentLength: z.number().int().positive().optional(),
});

const FinalizeBody = z.object({
  key: z.string().min(1).max(300),
});

/** Reads the upload back and decodes it with sharp — see the logo finalize route. */
export const maxDuration = 60;
export const runtime = "nodejs";

/** Presign a favicon override upload. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_WRITE.key);
    const json = await request.json();

    // Finalize path when `key` is present.
    if (typeof json?.key === "string") {
      const { key } = FinalizeBody.parse(json);
      if (!s3Configured()) {
        throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
      }
      // A rejected favicon is already in the bucket; drop it rather than leave
      // an unreferenced object against the tenant's quota. Same reasoning as
      // the logo finalize route.
      try {
        await validateFaviconOverride({ tenantId: actor.tenantId, faviconKey: key });
      } catch (e) {
        await cleanupBrandingKeys([key]);
        throw e;
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
      if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");
      const current = parseTenantSettings(tenant.settingsJson);
      const orphanKeys = current.faviconKey && current.faviconKey !== key ? [current.faviconKey] : [];
      const merged = tenantSettingsSchema.parse({ ...current, faviconKey: key });
      await prisma.tenant.update({
        where: { id: actor.tenantId },
        data: { settingsJson: merged as object },
      });
      await cleanupBrandingKeys(orphanKeys);

      const meta = requestMeta(request);
      await audit({
        actorType: "TENANT_USER",
        actorId: actor.userId,
        action: "tenant.set_favicon",
        tenantId: actor.tenantId,
        targetType: "Tenant",
        targetId: actor.tenantId,
        after: { faviconKey: key } as object,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return ok({ settings: { ...merged, ...brandingAssetUrls(merged) } });
    }

    const { contentType, contentLength } = PresignBody.parse(json);
    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }
    if (!isAllowedImageType(contentType)) {
      throw new DomainError(
        400,
        "bad_type",
        `Favicon must be a PNG, JPEG, or WebP image — the file was sent as "${contentType}". SVG is not accepted.`
      );
    }
    const size = contentLength ?? MAX_ASSET_BYTES.favicon;
    if (size > MAX_ASSET_BYTES.favicon) {
      throw new DomainError(
        400,
        "file_too_large",
        `Favicon is ${formatBytes(BigInt(size))}, over the ${formatBytes(
          BigInt(MAX_ASSET_BYTES.favicon)
        )} limit.`
      );
    }
    await assertStorageQuota(actor.tenantId, size);

    const presigned = await createPresignedUpload({
      tenantId: actor.tenantId,
      contentType,
      kind: "favicon",
      contentLength: size,
    });
    return ok(presigned);
  } catch (e) {
    return handleError(e);
  }
}

/** Clear favicon override (fall back to generated icons). */
export async function DELETE(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_SETTINGS_WRITE.key);
    const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
    if (!tenant) throw new DomainError(404, "not_found", "Tenant not found.");
    const current = parseTenantSettings(tenant.settingsJson);
    const orphan = current.faviconKey ? [current.faviconKey] : [];
    const { faviconKey: _removed, ...rest } = current;
    const merged = tenantSettingsSchema.parse(rest);
    // Explicitly drop faviconKey
    const cleaned = { ...merged };
    delete cleaned.faviconKey;
    await prisma.tenant.update({
      where: { id: actor.tenantId },
      data: { settingsJson: cleaned as object },
    });
    await cleanupBrandingKeys(orphan);
    return ok({ settings: { ...cleaned, ...brandingAssetUrls(cleaned) } });
  } catch (e) {
    return handleError(e);
  }
}
