import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";
import { resolveItemAccess } from "@/lib/library/access";

/**
 * Playback URLs are short-lived on purpose.
 *
 * A presigned URL is a bearer token: anyone holding it can fetch the object
 * until it expires. 15 minutes is long enough to start playback and short
 * enough that a leaked link is not a permanent grant. This is NOT DRM, and the
 * product copy should not imply that it is.
 */
const PLAYBACK_TTL_SECONDS = 900;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireClientActor();
    const { id } = await ctx.params;

    const access = await resolveItemAccess(actor, id);

    const item = await prisma.libraryItem.findFirst({
      where: { id },
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        progress: { where: { clientId: actor.clientId }, select: { positionSeconds: true, completed: true } },
      },
    });
    if (!item) throw new DomainError(404, "not_found", "That item is not available.");

    const base = {
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
    };

    if (!access.allowed) {
      // 200 with a locked payload rather than 403: the learner is allowed to
      // KNOW about a purchasable item, and the page needs its title and price
      // to render a meaningful paywall.
      return ok({
        item: base,
        access: {
          state: access.purchasable ? "locked-paid" : "locked-assign",
          purchasable: access.purchasable,
          priceCents: access.priceCents,
          currency: access.currency,
        },
        playbackUrl: null,
        posterUrl: null,
      });
    }

    if (!s3Configured()) {
      throw new DomainError(503, "storage_unconfigured", "Media storage is not configured.");
    }

    const [playbackUrl, posterUrl] = await Promise.all([
      createPresignedDownload(item.key, PLAYBACK_TTL_SECONDS),
      item.posterKey ? createPresignedDownload(item.posterKey, PLAYBACK_TTL_SECONDS) : Promise.resolve(null),
    ]);

    return ok({
      item: base,
      access: { state: "open", via: access.via, canDownload: access.canDownload },
      playbackUrl,
      posterUrl,
      expiresInSeconds: PLAYBACK_TTL_SECONDS,
      progress: item.progress[0]
        ? { positionSeconds: item.progress[0].positionSeconds, completed: item.progress[0].completed }
        : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
