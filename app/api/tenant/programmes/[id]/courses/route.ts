import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const SetBody = z.object({
  courses: z
    .array(
      z.object({
        courseId: z.string().min(1),
        required: z.boolean().optional(),
        sortOrder: z.number().int().min(0).optional(),
        groupLabel: z.string().max(120).nullable().optional(),
      })
    )
    .max(500),
});

/** Replace the full set of courses in a programme. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_PROGRAMMES_WRITE.key);
    const { id } = await ctx.params;
    const { courses } = SetBody.parse(await request.json());
    const meta = requestMeta(request);

    const programme = await prisma.programme.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!programme) throw new DomainError(404, "not_found", "Programme not found.");

    // De-dupe by courseId, keeping the last occurrence.
    const byId = new Map(courses.map((c) => [c.courseId, c]));
    const items = [...byId.values()];

    if (items.length > 0) {
      const found = await prisma.course.findMany({
        where: { id: { in: items.map((c) => c.courseId) } },
        select: { id: true },
      });
      if (found.length !== items.length) {
        throw new DomainError(400, "invalid_courses", "One or more courses do not belong to this tenant.");
      }
    }

    await prisma.$transaction([
      prisma.programmeCourse.deleteMany({ where: { programmeId: id } }),
      ...(items.length > 0
        ? [
            prisma.programmeCourse.createMany({
              data: items.map((c, idx) => ({
                tenantId: actor.tenantId,
                programmeId: id,
                courseId: c.courseId,
                required: c.required ?? true,
                sortOrder: c.sortOrder ?? idx,
                groupLabel: c.groupLabel ?? null,
              })),
            }),
          ]
        : []),
    ]);

    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "programme.set_courses",
      tenantId: actor.tenantId,
      targetType: "Programme",
      targetId: id,
      after: { count: items.length } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ count: items.length });
  } catch (e) {
    return handleError(e);
  }
}
