import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { audit, requestMeta } from "@/lib/auth/audit";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  instructorId: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_READ.key);
    const url = new URL(request.url);
    const { cursor, take } = parsePagination(url.searchParams);
    const status = url.searchParams.get("status");
    const rows = await prisma.course.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(status ? { status: status as "DRAFT" | "PUBLISHED" | "ARCHIVED" } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take,
      include: { _count: { select: { lessons: true, enrollments: true } } },
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
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const existing = await prisma.course.findUnique({
      where: { tenantId_slug: { tenantId: actor.tenantId, slug: body.slug } },
    });
    if (existing) throw new DomainError(409, "slug_taken", "Course slug already in use.");

    const course = await prisma.course.create({
      data: {
        tenantId: actor.tenantId,
        title: body.title,
        slug: body.slug,
        description: body.description ?? null,
        priceCents: body.priceCents ?? null,
        currency: body.currency ?? "NGN",
        instructorId: body.instructorId ?? actor.userId,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "course.create",
      tenantId: actor.tenantId,
      targetType: "Course",
      targetId: course.id,
      after: { title: course.title, slug: course.slug } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ course }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
