import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(5000).nullable().optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  thumbnailKey: z.string().max(300).nullable().optional(),
  instructorId: z.string().nullable().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_READ.key);
    const { id } = await ctx.params;
    const course = await prisma.course.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        lessons: { orderBy: { sortOrder: "asc" } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");
    return ok({ course });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());
    const meta = requestMeta(request);

    const before = await prisma.course.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!before) throw new DomainError(404, "not_found", "Course not found.");

    if (body.slug && body.slug !== before.slug) {
      const clash = await prisma.course.findUnique({
        where: { tenantId_slug: { tenantId: actor.tenantId, slug: body.slug } },
      });
      if (clash) throw new DomainError(409, "slug_taken", "Course slug already in use.");
    }

    const publishedAt =
      body.status === "PUBLISHED" && before.status !== "PUBLISHED" ? new Date() : before.publishedAt;

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...body,
        publishedAt,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "course.update",
      tenantId: actor.tenantId,
      targetType: "Course",
      targetId: course.id,
      before: { status: before.status, title: before.title } as object,
      after: { status: course.status, title: course.title } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ course });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id } = await ctx.params;
    const course = await prisma.course.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");
    await prisma.course.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
