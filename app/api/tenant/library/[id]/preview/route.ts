import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";

/**
 * Admin-side playback payload, shaped exactly like the learner endpoint so the
 * same <MediaViewer> renders it.
 *
 * The learner route runs entitlement checks; this one deliberately does not.
 * A tenant admin with TENANT_LIBRARY_READ already administers every item in
 * the library — grants and prices govern who may *buy* or be *assigned* an
 * item, not whether its owner may look at it. Tenant scoping on the lookup is
 * what keeps this from being a cross-tenant read.
 *
 * The signed URL is short-lived for the same reason as the learner's: it is a
 * bearer token, and a leaked link should stop working quickly.
 */
const PREVIEW_TTL_SECONDS = 900;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const { id } = await ctx.params;

    const item = await prisma.libraryItem.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
      },
    });
    if (!item) throw new DomainError(404, "not_found", "Library item not found.");

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");
    }

    const [playbackUrl, posterUrl] = await Promise.all([
      createPresignedDownload(item.key, PREVIEW_TTL_SECONDS),
      item.posterKey
        ? createPresignedDownload(item.posterKey, PREVIEW_TTL_SECONDS)
        : Promise.resolve(null),
    ]);

    return ok({
      item: {
        id: item.id,
        name: item.name,
        title: item.title,
        description: item.description,
        mediaKind: item.mediaKind,
        contentType: item.contentType,
        sizeBytes: Number(item.sizeBytes),
        durationSeconds: item.durationSeconds,
        width: item.width,
        height: item.height,
        peaks: item.peaksJson as number[] | null,
        folder: item.folder,
        tags: item.tags.map((t) => t.tag),
        isFree: item.isFree,
        priceCents: item.priceCents,
        currency: item.currency,
        createdAt: item.createdAt.toISOString(),
      },
      access: { state: "open", via: "admin", canDownload: true },
      playbackUrl,
      posterUrl,
      expiresInSeconds: PREVIEW_TTL_SECONDS,
    });
  } catch (e) {
    return handleError(e);
  }
}
