import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  type: z.enum(["TEXT", "FILE", "LINK"]).optional(),
  maxPoints: z.number().int().min(1).max(1000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  publish: z.boolean().optional(),
});

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ASSIGNMENTS_READ.key);
    const { id } = await ctx.params;
    const assignment = await prisma.assignment.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: {
        course: { select: { id: true, title: true, slug: true } },
        submissions: {
          orderBy: { submittedAt: "desc" },
          include: {
            client: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
            grade: true,
          },
        },
      },
    });
    if (!assignment) throw new DomainError(404, "not_found", "Assignment not found.");
    return ok({ assignment });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key);
    const { id } = await ctx.params;
    const body = PatchBody.parse(await request.json());

    const before = await prisma.assignment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!before) throw new DomainError(404, "not_found", "Assignment not found.");

    const publishedAt =
      body.publish === undefined
        ? before.publishedAt
        : body.publish
          ? (before.publishedAt ?? new Date())
          : null;

    const assignment = await prisma.assignment.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.maxPoints !== undefined ? { maxPoints: body.maxPoints } : {}),
        ...(body.dueAt !== undefined
          ? { dueAt: body.dueAt ? new Date(body.dueAt) : null }
          : {}),
        publishedAt,
      },
    });
    return ok({ assignment });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key);
    const { id } = await ctx.params;
    const meta = requestMeta(request);
    const assignment = await prisma.assignment.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!assignment) throw new DomainError(404, "not_found", "Assignment not found.");
    await prisma.assignment.delete({ where: { id } });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "assignment.delete",
      tenantId: actor.tenantId,
      targetType: "Assignment",
      targetId: id,
      before: { title: assignment.title } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
