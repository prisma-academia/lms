import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  type: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(200).optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_TEMPLATES_READ.key);
    const { id } = await ctx.params;
    const template = await prisma.template.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!template) throw new DomainError(404, "not_found", "Template not found.");
    return ok({ template });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());
    const before = await prisma.template.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Template not found.");
    const template = await prisma.template.update({
      where: { id },
      data: {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.contentJson !== undefined ? { contentJson: body.contentJson as object } : {}),
      },
    });
    return ok({ template });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
    const { id } = await ctx.params;
    const template = await prisma.template.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!template) throw new DomainError(404, "not_found", "Template not found.");
    await prisma.template.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
