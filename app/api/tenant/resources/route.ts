import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { recordStorageDelta, validateTenantAssetKey } from "@/lib/storage/quota";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";

const CreateBody = z.object({
  name: z.string().min(1).max(300),
  key: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().min(0),
  groupId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  return {
    ...r,
    sizeBytes: Number(r.sizeBytes),
    url: s3Configured() ? publicUrlForKey(r.key) : null,
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_READ.key);
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId");
    const { cursor, take } = parsePagination(url.searchParams);
    const rows = await prisma.resource.findMany({
      where: { tenantId: actor.tenantId, ...(groupId ? { groupId } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        group: { select: { name: true } },
        tags: { include: { tag: { select: { id: true, name: true } } } },
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
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    if (!validateTenantAssetKey(actor.tenantId, body.key)) {
      throw new DomainError(400, "invalid_key", "Upload key does not belong to this tenant.");
    }
    if (body.groupId) {
      const group = await prisma.resourceGroup.findFirst({ where: { id: body.groupId, tenantId: actor.tenantId } });
      if (!group) throw new DomainError(400, "invalid_group", "Resource group not found.");
    }
    if (body.tagIds && body.tagIds.length > 0) {
      const found = await prisma.resourceTag.findMany({ where: { id: { in: body.tagIds } }, select: { id: true } });
      if (found.length !== new Set(body.tagIds).size) {
        throw new DomainError(400, "invalid_tags", "One or more tags do not belong to this tenant.");
      }
    }

    const resource = await prisma.resource.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        key: body.key,
        contentType: body.contentType,
        sizeBytes: BigInt(body.sizeBytes),
        groupId: body.groupId ?? null,
        createdById: actor.userId,
        tags: body.tagIds
          ? { create: [...new Set(body.tagIds)].map((tagId) => ({ tenantId: actor.tenantId, tagId })) }
          : undefined,
      },
      include: { group: { select: { name: true } }, tags: { include: { tag: { select: { id: true, name: true } } } } },
    });

    await recordStorageDelta(actor.tenantId, BigInt(body.sizeBytes));
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "resource.create",
      tenantId: actor.tenantId,
      targetType: "Resource",
      targetId: resource.id,
      after: { name: resource.name, sizeBytes: body.sizeBytes } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ resource: serialize(resource) }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
