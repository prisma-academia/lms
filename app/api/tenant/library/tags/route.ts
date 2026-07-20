import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CreateBody = z.object({ name: z.string().min(1).max(80) });

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const tags = await prisma.libraryTag.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" } });
    return ok({ tags });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_WRITE.key);
    const { name } = CreateBody.parse(await request.json());
    const existing = await prisma.libraryTag.findUnique({
      where: { tenantId_name: { tenantId: actor.tenantId, name } },
    });
    if (existing) return ok({ tag: existing });
    const tag = await prisma.libraryTag.create({ data: { tenantId: actor.tenantId, name } });
    return ok({ tag }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
