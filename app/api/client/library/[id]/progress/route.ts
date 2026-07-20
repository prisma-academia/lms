import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrfHeaderOrBody } from "@/lib/api/csrf-guard";
import { resolveItemAccess } from "@/lib/library/access";

const Body = z.object({
  positionSeconds: z.number().int().min(0),
  completed: z.boolean().optional(),
  /** Only used by sendBeacon, which cannot set the x-csrf-token header. */
  csrfToken: z.string().optional(),
});

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const body = Body.parse(await request.json());
    await requireCsrfHeaderOrBody(request, body.csrfToken);
    const actor = await requireClientActor();
    const { id } = await ctx.params;

    // Progress on something the learner cannot open would let anyone probe for
    // item existence and accumulate rows against arbitrary ids.
    const access = await resolveItemAccess(actor, id);
    if (!access.allowed) throw new DomainError(403, "not_entitled", "You do not have access to this item.");

    await prisma.libraryProgress.upsert({
      where: { itemId_clientId: { itemId: id, clientId: actor.clientId } },
      create: {
        tenantId: actor.tenantId,
        itemId: id,
        clientId: actor.clientId,
        positionSeconds: body.positionSeconds,
        completed: body.completed ?? false,
        lastViewedAt: new Date(),
      },
      update: {
        positionSeconds: body.positionSeconds,
        ...(body.completed !== undefined ? { completed: body.completed } : {}),
        lastViewedAt: new Date(),
      },
    });

    return ok({ saved: true });
  } catch (e) {
    return handleError(e);
  }
}
