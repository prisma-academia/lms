import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_READ.key);
    const { id: courseId } = await ctx.params;
    const groups = await prisma.lessonGroup.findMany({
      where: { courseId, tenantId: actor.tenantId },
      orderBy: { sortOrder: "asc" },
    });
    return ok({ groups });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId } = await ctx.params;
    const body = CreateBody.parse(await request.json());

    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId: actor.tenantId } });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    if (body.parentId) {
      const parent = await prisma.lessonGroup.findFirst({
        where: { id: body.parentId, courseId, tenantId: actor.tenantId },
      });
      if (!parent) throw new DomainError(400, "invalid_parent", "Parent group not found in this course.");
    }

    const maxOrder = await prisma.lessonGroup.aggregate({
      where: { courseId, parentId: body.parentId ?? null },
      _max: { sortOrder: true },
    });

    const group = await prisma.lessonGroup.create({
      data: {
        tenantId: actor.tenantId,
        courseId,
        parentId: body.parentId ?? null,
        title: body.title,
        sortOrder: body.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    return ok({ group }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
