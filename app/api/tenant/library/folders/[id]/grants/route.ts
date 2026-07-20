import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  GrantBody,
  targetKeyFor,
  subjectKeyFor,
  subjectColumns,
  assertSubjectInTenant,
  describeGrant,
  GRANT_INCLUDE,
} from "@/lib/library/grants";

/**
 * Folder grants apply to the whole subtree, resolved at read time in
 * lib/library/access.ts — nothing is copied down to the items, so moving an
 * item into a granted folder grants it automatically.
 */

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const { id } = await ctx.params;
    const grants = await prisma.libraryGrant.findMany({
      where: { tenantId: actor.tenantId, folderId: id },
      orderBy: { createdAt: "desc" },
      include: GRANT_INCLUDE,
    });
    return ok({ grants: grants.map((g) => ({ ...g, label: describeGrant(g) })) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_ASSIGN.key);
    const { id } = await ctx.params;
    const body = GrantBody.parse(await request.json());
    const meta = requestMeta(request);

    const folder = await prisma.libraryFolder.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!folder) throw new DomainError(404, "not_found", "Library folder not found.");
    await assertSubjectInTenant(actor.tenantId, body.subjectType, body.subjectId);

    const targetKey = targetKeyFor({ folderId: id });
    const subjectKey = subjectKeyFor(body.subjectType, body.subjectId);

    const grant = await prisma.libraryGrant.upsert({
      where: { tenantId_targetKey_subjectKey: { tenantId: actor.tenantId, targetKey, subjectKey } },
      create: {
        tenantId: actor.tenantId,
        folderId: id,
        targetKey,
        subjectType: body.subjectType,
        ...subjectColumns(body.subjectType, body.subjectId),
        subjectKey,
        canDownload: body.canDownload ?? true,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        grantedById: actor.userId,
      },
      update: {
        canDownload: body.canDownload ?? true,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      include: GRANT_INCLUDE,
    });

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "library.folder_grant",
      tenantId: actor.tenantId,
      targetType: "LibraryFolder",
      targetId: id,
      after: { subjectType: body.subjectType, subjectId: body.subjectId ?? null } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({ grant: { ...grant, label: describeGrant(grant) } }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
