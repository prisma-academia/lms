import { DomainError } from "@/lib/api/errors";
import {
  brandingVariantKey,
  deleteObjects,
  getObjectBuffer,
  MIN_LOGO_SIDE_PX,
  putObjectBuffer,
  publicUrlForKey,
  s3Configured,
} from "@/lib/storage/s3";
import type { TenantSettings } from "@/lib/tenant/settings";
import sharp from "sharp";

type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

export const MIN_LOGO_ASPECT = 1 / 3;
export const MAX_LOGO_ASPECT = 3;

export type BrandingAssetUrls = {
  logoUrl: string | null;
  faviconUrl: string | null;
  icon32Url: string | null;
  apple180Url: string | null;
  og1200Url: string | null;
};

/** Resolve public URLs for logo + generated / override branding assets. */
export function brandingAssetUrls(settings: TenantSettings): BrandingAssetUrls {
  if (!s3Configured()) {
    return {
      logoUrl: null,
      faviconUrl: null,
      icon32Url: null,
      apple180Url: null,
      og1200Url: null,
    };
  }
  const assets = settings.brandingAssets;
  const faviconKey = settings.faviconKey ?? assets?.icon32;
  return {
    logoUrl: settings.logoKey ? publicUrlForKey(settings.logoKey) : null,
    faviconUrl: faviconKey ? publicUrlForKey(faviconKey) : null,
    icon32Url: settings.faviconKey
      ? publicUrlForKey(settings.faviconKey)
      : assets?.icon32
        ? publicUrlForKey(assets.icon32)
        : null,
    apple180Url: settings.faviconKey
      ? publicUrlForKey(settings.faviconKey)
      : assets?.apple180
        ? publicUrlForKey(assets.apple180)
        : null,
    og1200Url: assets?.og1200 ? publicUrlForKey(assets.og1200) : null,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Validate logo dimensions and generate icon32 / apple180 / og1200 variants.
 * Returns keys to merge into settingsJson; caller persists and cleans orphans.
 */
export async function finalizeLogoBranding(input: {
  tenantId: string;
  logoKey: string;
  primaryColor: string;
  previous?: Pick<TenantSettings, "logoKey" | "brandingAssets" | "faviconKey">;
}): Promise<{
  logoKey: string;
  brandingAssets: { icon32: string; apple180: string; og1200: string };
  orphanKeys: string[];
}> {
  if (!s3Configured()) {
    throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
  }
  if (!input.logoKey.startsWith(`tenants/${input.tenantId}/branding/`)) {
    throw new DomainError(400, "bad_key", "Logo key is not valid for this tenant.");
  }

  const { body } = await getObjectBuffer(input.logoKey);
  let meta: SharpMetadata;
  try {
    meta = await sharp(body).metadata();
  } catch {
    throw new DomainError(400, "bad_image", "Could not decode the logo image.");
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_LOGO_SIDE_PX || height < MIN_LOGO_SIDE_PX) {
    throw new DomainError(
      400,
      "logo_too_small",
      `Logo must be at least ${MIN_LOGO_SIDE_PX}×${MIN_LOGO_SIDE_PX} pixels.`
    );
  }
  const aspect = width / height;
  if (aspect < MIN_LOGO_ASPECT || aspect > MAX_LOGO_ASPECT) {
    throw new DomainError(
      400,
      "logo_aspect",
      "Logo aspect ratio must be between 1:3 and 3:1."
    );
  }

  const square = await sharp(body)
    .rotate()
    .resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const icon32 = await sharp(square).resize(32, 32).png().toBuffer();
  const apple180 = await sharp(square).resize(180, 180).png().toBuffer();

  const bg = hexToRgb(input.primaryColor);
  const logoForOg = await sharp(body)
    .rotate()
    .resize(480, 280, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoForOg).metadata();
  const lw = logoMeta.width ?? 480;
  const lh = logoMeta.height ?? 280;
  const left = Math.max(0, Math.floor((1200 - lw) / 2));
  const top = Math.max(0, Math.floor((630 - lh) / 2));
  const og1200 = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: bg,
    },
  })
    .composite([{ input: logoForOg, left, top }])
    .png()
    .toBuffer();

  const icon32Key = brandingVariantKey(input.tenantId, "icon32");
  const apple180Key = brandingVariantKey(input.tenantId, "apple180");
  const og1200Key = brandingVariantKey(input.tenantId, "og1200");

  await Promise.all([
    putObjectBuffer({ key: icon32Key, body: icon32, contentType: "image/png" }),
    putObjectBuffer({ key: apple180Key, body: apple180, contentType: "image/png" }),
    putObjectBuffer({ key: og1200Key, body: og1200, contentType: "image/png" }),
  ]);

  const orphanKeys: string[] = [];
  const prev = input.previous;
  if (prev?.logoKey && prev.logoKey !== input.logoKey) orphanKeys.push(prev.logoKey);
  if (prev?.brandingAssets?.icon32) orphanKeys.push(prev.brandingAssets.icon32);
  if (prev?.brandingAssets?.apple180) orphanKeys.push(prev.brandingAssets.apple180);
  if (prev?.brandingAssets?.og1200) orphanKeys.push(prev.brandingAssets.og1200);

  return {
    logoKey: input.logoKey,
    brandingAssets: { icon32: icon32Key, apple180: apple180Key, og1200: og1200Key },
    orphanKeys,
  };
}

/** Validate a favicon override (prefer near-square). */
export async function validateFaviconOverride(input: {
  tenantId: string;
  faviconKey: string;
}): Promise<void> {
  if (!input.faviconKey.startsWith(`tenants/${input.tenantId}/branding/`)) {
    throw new DomainError(400, "bad_key", "Favicon key is not valid for this tenant.");
  }
  const { body } = await getObjectBuffer(input.faviconKey);
  let meta: SharpMetadata;
  try {
    meta = await sharp(body).metadata();
  } catch {
    throw new DomainError(400, "bad_image", "Could not decode the favicon image.");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 32 || height < 32) {
    throw new DomainError(400, "favicon_too_small", "Favicon must be at least 32×32 pixels.");
  }
  const aspect = width / height;
  if (aspect < 0.8 || aspect > 1.25) {
    throw new DomainError(
      400,
      "favicon_aspect",
      "Favicon should be roughly square (aspect between 0.8 and 1.25)."
    );
  }
}

/** Best-effort delete of orphaned branding keys (never throws to caller). */
export async function cleanupBrandingKeys(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await deleteObjects(unique);
  } catch {
    // Orphans are acceptable; reconcile can sweep later.
  }
}
