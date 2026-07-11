import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  parentId: z.string().min(1).nullable().optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId, groupId } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const group = await prisma.lessonGroup.findFirst({
      where: { id: groupId, courseId, tenantId: actor.tenantId },
    });
    if (!group) throw new DomainError(404, "not_found", "Lesson group not found.");

    if (body.parentId) {
      if (body.parentId === groupId) {
        throw new DomainError(400, "invalid_parent", "A group cannot be its own parent.");
      }
      const parent = await prisma.lessonGroup.findFirst({
        where: { id: body.parentId, courseId, tenantId: actor.tenantId },
      });
      if (!parent) throw new DomainError(400, "invalid_parent", "Parent group not found in this course.");
    }

    const updated = await prisma.lessonGroup.update({ where: { id: groupId }, data: body });
    return ok({ group: updated });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_COURSES_WRITE.key);
    const { id: courseId, groupId } = await ctx.params;
    const group = await prisma.lessonGroup.findFirst({
      where: { id: groupId, courseId, tenantId: actor.tenantId },
    });
    if (!group) throw new DomainError(404, "not_found", "Lesson group not found.");
    // Lessons in this group are detached (groupId set null) via onDelete: SetNull.
    await prisma.lessonGroup.delete({ where: { id: groupId } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
