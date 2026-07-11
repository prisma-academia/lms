import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens."),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_PROGRAMMES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.programme.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { _count: { select: { courses: true } } },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_PROGRAMMES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const clash = await prisma.programme.findUnique({
      where: { tenantId_slug: { tenantId: actor.tenantId, slug: body.slug } },
    });
    if (clash) throw new DomainError(409, "slug_taken", "Programme slug already in use.");

    const programme = await prisma.programme.create({
      data: {
        tenantId: actor.tenantId,
        title: body.title,
        slug: body.slug,
        description: body.description ?? null,
        priceCents: body.priceCents ?? null,
        currency: body.currency ?? "NGN",
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "programme.create",
      tenantId: actor.tenantId,
      targetType: "Programme",
      targetId: programme.id,
      after: { title: programme.title, slug: programme.slug } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ programme }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
