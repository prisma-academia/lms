import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { certificateDesignSchema } from "@/lib/certificates/design";

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  contentJson: certificateDesignSchema.partial().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
    const { id } = await ctx.params;
    const certificate = await prisma.certificate.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        course: { select: { id: true, title: true } },
        programme: { select: { id: true, title: true } },
      },
    });
    if (!certificate) throw new DomainError(404, "not_found", "Certificate not found.");
    return ok({ certificate });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.certificate.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Certificate not found.");

    const nextDesign =
      body.contentJson !== undefined
        ? certificateDesignSchema.parse({
            ...(before.contentJson as object),
            ...body.contentJson,
          })
        : undefined;

    const certificate = await prisma.certificate.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(nextDesign ? { contentJson: nextDesign as object } : {}),
      },
    });
    return ok({ certificate });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
    const { id } = await ctx.params;
    const certificate = await prisma.certificate.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!certificate) throw new DomainError(404, "not_found", "Certificate not found.");
    await prisma.certificate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
