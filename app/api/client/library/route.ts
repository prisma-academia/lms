import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { s3Configured } from "@/lib/storage/s3";
import { loadLibraryPrincipals, accessibleFolderIds, libraryAccessWhere } from "@/lib/library/access";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MediaKind } from "@/lib/generated/prisma/enums";

const SORTS = {
  recent: { createdAt: "desc" },
  title: { name: "asc" },
} as const;

/**
 * Learner-visible library.
 *
 * Returns metadata only — no signed URLs. Playback URLs are short-lived and
 * issued per item on open, so a list response cannot become a bag of working
 * links to every file a learner has ever been able to see.
 */
export async function GET(request: Request) {
  try {
    const actor = await requireClientActor();
    const sp = new URL(request.url).searchParams;
    const { cursor, take } = parsePagination(sp);

    const p = await loadLibraryPrincipals(actor);
    const folderIds = await accessibleFolderIds(p);

    const kind = sp.get("kind");
    const q = sp.get("q")?.trim();
    const folderId = sp.get("folderId");
    const tagIds = sp.getAll("tagId").filter(Boolean);
    const sort = (sp.get("sort") ?? "recent") as keyof typeof SORTS;

    const filters: Prisma.LibraryItemWhereInput = {
      ...(kind && kind !== "all" ? { mediaKind: kind as MediaKind } : {}),
      ...(folderId ? { folderId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tagIds.length > 0 ? { AND: tagIds.map((id) => ({ tags: { some: { tagId: id } } })) } : {}),
    };

    const rows = await prisma.libraryItem.findMany({
      where: { AND: [libraryAccessWhere(p, folderIds), filters] },
      orderBy: SORTS[sort] ?? SORTS.recent,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        folder: { select: { id: true, name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        progress: {
          where: { clientId: actor.clientId },
          select: { positionSeconds: true, completed: true },
        },
      },
    });

    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        description: r.description,
        mediaKind: r.mediaKind,
        contentType: r.contentType,
        sizeBytes: Number(r.sizeBytes),
        durationSeconds: r.durationSeconds,
        width: r.width,
        height: r.height,
        folder: r.folder,
        tags: r.tags.map((t) => t.tag),
        isFree: r.isFree,
        priceCents: r.priceCents,
        currency: r.currency,
        thumbUrl: s3Configured() ? `/api/client/library/${r.id}/thumb` : null,
        progress: r.progress[0]
          ? {
              positionSeconds: r.progress[0].positionSeconds,
              completed: r.progress[0].completed,
              percent:
                r.durationSeconds && r.durationSeconds > 0
                  ? Math.min(100, Math.round((r.progress[0].positionSeconds / r.durationSeconds) * 100))
                  : 0,
            }
          : null,
        createdAt: r.createdAt.toISOString(),
      })),
      buildPageMeta(rows, take)
    );
  } catch (e) {
    return handleError(e);
  }
}
