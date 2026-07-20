import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { recordStorageDelta, validateTenantAssetKey } from "@/lib/storage/quota";
import { s3Configured } from "@/lib/storage/s3";
import { mediaKindForContentType } from "@/lib/media/kind";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { MediaKind } from "@/lib/generated/prisma/enums";

const CreateBody = z.object({
  name: z.string().min(1).max(300),
  key: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(0),
  folderId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    ...r,
    sizeBytes: Number(r.sizeBytes),
    // A stable thumb route, not a signed URL: signed URLs expire, and baking
    // hundreds of them into a response makes them uncacheable and short-lived.
    thumbUrl: s3Configured() ? `/api/tenant/library/${r.id}/thumb` : null,
  };
}

const SORTS = {
  recent: { createdAt: "desc" },
  name: { name: "asc" },
  size: { sizeBytes: "desc" },
  type: { mediaKind: "asc" },
} as const;

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const url = new URL(request.url);
    const sp = url.searchParams;
    const { cursor, take } = parsePagination(sp);

    const folderId = sp.get("folderId");
    const kind = sp.get("kind");
    const q = sp.get("q")?.trim();
    const tagIds = sp.getAll("tagId").filter(Boolean);
    const visibility = sp.get("visibility");
    const sort = (sp.get("sort") ?? "recent") as keyof typeof SORTS;

    const where: Prisma.LibraryItemWhereInput = {
      tenantId: actor.tenantId,
      ...(folderId === "none" ? { folderId: null } : folderId ? { folderId } : {}),
      ...(kind && kind !== "all" ? { mediaKind: kind as MediaKind } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      // Every selected tag must be present, not any of them — narrowing by two
      // tags should intersect, which is what filter chips imply.
      ...(tagIds.length > 0 ? { AND: tagIds.map((id) => ({ tags: { some: { tagId: id } } })) } : {}),
      ...(visibility === "public"
        ? { isPublic: true, isFree: true }
        : visibility === "paid"
          ? { isFree: false }
          : visibility === "private"
            ? { isPublic: false, isFree: true }
            : {}),
    };

    const rows = await prisma.libraryItem.findMany({
      where,
      orderBy: SORTS[sort] ?? SORTS.recent,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        folder: { select: { name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        _count: { select: { grants: true, entitlements: true } },
      },
    });
    return ok(rows.map(serialize), buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    if (!validateTenantAssetKey(actor.tenantId, body.key)) {
      throw new DomainError(400, "invalid_key", "Upload key does not belong to this tenant.");
    }
    if (body.folderId) {
      const folder = await prisma.libraryFolder.findFirst({ where: { id: body.folderId, tenantId: actor.tenantId } });
      if (!folder) throw new DomainError(400, "invalid_folder", "Library folder not found.");
    }
    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.libraryTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    const item = await prisma.libraryItem.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        key: body.key,
        contentType: body.contentType,
        sizeBytes: BigInt(body.sizeBytes),
        mediaKind: mediaKindForContentType(body.contentType),
        originalFilename: body.name,
        folderId: body.folderId ?? null,
        createdById: actor.userId,
        tags: body.tagIds
          ? { create: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, tagId })) }
          : undefined,
      },
      include: { folder: { select: { name: true } }, tags: { include: { tag: { select: { id: true, name: true } } } } },
    });

    await recordStorageDelta(actor.tenantId, BigInt(body.sizeBytes));
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "library.create",
      tenantId: actor.tenantId,
      targetType: "LibraryItem",
      targetId: item.id,
      after: { name: item.name, sizeBytes: body.sizeBytes } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ item: serialize(item) }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
