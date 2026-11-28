import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { createLearner } from "@/lib/learners/create";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z.object({
  email: z.email(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  otherName: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CLIENTS_READ.key);
    const url = new URL(request.url);
    const { cursor, take } = parsePagination(url.searchParams);
    const rows = await prisma.client.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CLIENTS_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);
    // Shared with the Developer API: same uniqueness rule, audit row and
    // `learner.created` webhook.
    const client = await createLearner(actor.tenantId, body, {
      actorType: "TENANT_USER",
      actorId: actor.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ client });
  } catch (e) {
    return handleError(e);
  }
}
