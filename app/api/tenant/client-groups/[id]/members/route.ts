import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const SetBody = z.object({
  clientIds: z.array(z.string().min(1)).max(5000),
});

/** Replace the full membership set of a client group with the given clients. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_GROUPS_WRITE.key);
    const { id } = await ctx.params;
    const { clientIds } = SetBody.parse(await request.json());
    const meta = requestMeta(request);

    const group = await prisma.clientGroup.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!group) throw new DomainError(404, "not_found", "Client group not found.");

    const unique = [...new Set(clientIds)];
    if (unique.length > 0) {
      const found = await prisma.client.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      if (found.length !== unique.length) {
        throw new DomainError(400, "invalid_members", "One or more clients do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.clientGroupMembership.deleteMany({ where: { groupId: id } }),
      ...(unique.length > 0
        ? [
            prisma.clientGroupMembership.createMany({
              data: unique.map((clientId) => ({ tenantId: actor.tenantId, groupId: id, clientId })),
            }),
          ]
        : []),
    ]);

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "client_group.set_members",
      tenantId: actor.tenantId,
      targetType: "ClientGroup",
      targetId: id,
      after: { count: unique.length } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ count: unique.length });
  } catch (e) {
    return handleError(e);
  }
}
