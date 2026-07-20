import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().min(1).nullable().optional(),
});

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const folders = await prisma.libraryFolder.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
    return ok({ folders });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const body = CreateBody.parse(await request.json());
    if (body.parentId) {
      const parent = await prisma.libraryFolder.findFirst({ where: { id: body.parentId, tenantId: actor.tenantId } });
      if (!parent) throw new DomainError(400, "invalid_parent", "Parent folder not found.");
    }
    const folder = await prisma.libraryFolder.create({
      data: { tenantId: actor.tenantId, name: body.name, parentId: body.parentId ?? null },
    });
    return ok({ folder }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
