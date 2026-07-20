import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";

/**
 * Stable thumbnail URL that 302s to a freshly-signed object URL.
 *
 * Exists so list responses can carry `/api/tenant/library/{id}/thumb` instead
 * of a signed URL: signed URLs expire, so embedding hundreds of them in a page
 * both breaks on a stale tab and forces a signing round trip per item on every
 * render. With a stable URL the browser caches the image normally.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const { id } = await ctx.params;
    if (!s3Configured()) throw new DomainError(503, "storage_unconfigured", "Object storage is not configured.");

    const item = await prisma.libraryItem.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { key: true, posterKey: true, mediaKind: true },
    });
    if (!item) throw new DomainError(404, "not_found", "Library item not found.");

    // Only images and explicit posters have something to show; anything else
    // renders as a kind icon client-side rather than downloading the file.
    const key = item.posterKey ?? (item.mediaKind === "IMAGE" ? item.key : null);
    if (!key) throw new DomainError(404, "no_thumbnail", "No thumbnail for this item.");

    const url = await createPresignedDownload(key, 900);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // Private: the redirect target is a bearer URL for tenant content.
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
