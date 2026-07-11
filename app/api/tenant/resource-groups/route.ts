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
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_READ.key);
    const groups = await prisma.resourceGroup.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { resources: true } } },
    });
    return ok({ groups });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_RESOURCES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    if (body.parentId) {
      const parent = await prisma.resourceGroup.findFirst({ where: { id: body.parentId, tenantId: actor.tenantId } });
      if (!parent) throw new DomainError(400, "invalid_parent", "Parent group not found.");
    }
    const group = await prisma.resourceGroup.create({
      data: { tenantId: actor.tenantId, name: body.name, parentId: body.parentId ?? null },
    });
    return ok({ group }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
