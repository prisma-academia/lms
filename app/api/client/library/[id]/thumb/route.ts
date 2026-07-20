import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { createPresignedDownload, s3Configured } from "@/lib/storage/s3";
import { resolveItemAccess } from "@/lib/library/access";

/**
 * Learner thumbnail. Access-checked like any other read — a poster frame is
 * still tenant content, and an unchecked thumb route would leak the first
 * frame of every paid video to anyone who can guess an id.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireClientActor();
    const { id } = await ctx.params;
    if (!s3Configured()) throw new DomainError(503, "storage_unconfigured", "Media storage is not configured.");

    const item = await prisma.libraryItem.findFirst({
      where: { id },
      select: { key: true, posterKey: true, mediaKind: true, isPublic: true },
    });
    if (!item) throw new DomainError(404, "not_found", "Item not found.");

    // A poster is safe to show for a locked paid item — that is the point of a
    // paywall preview. The full object is not.
    const access = await resolveItemAccess(actor, id);
    const posterOnly = !access.allowed;
    const key = item.posterKey ?? (item.mediaKind === "IMAGE" && !posterOnly ? item.key : null);
    if (!key) throw new DomainError(404, "no_thumbnail", "No thumbnail for this item.");

    const url = await createPresignedDownload(key, 900);
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, max-age=600" },
    });
  } catch (e) {
    return handleError(e);
  }
}
