import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";

const CreateBody = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(["TEXT", "FILE", "LINK"]).optional(),
  maxPoints: z.number().int().min(1).max(1000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  publish: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ASSIGNMENTS_READ.key);
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId");
    const assignments = await prisma.assignment.findMany({
      where: { tenantId: actor.tenantId, ...(courseId ? { courseId } : {}) },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        course: { select: { id: true, title: true, slug: true } },
        _count: { select: { submissions: true } },
      },
    });
    return ok({ assignments });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const course = await prisma.course.findFirst({
      where: { id: body.courseId, tenantId: actor.tenantId },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");

    const assignment = await prisma.assignment.create({
      data: {
        tenantId: actor.tenantId,
        courseId: body.courseId,
        title: body.title,
        description: body.description ?? null,
        type: body.type ?? "TEXT",
        maxPoints: body.maxPoints ?? 100,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        publishedAt: body.publish ? new Date() : null,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "assignment.create",
      tenantId: actor.tenantId,
      targetType: "Assignment",
      targetId: assignment.id,
      after: { title: assignment.title, courseId: assignment.courseId } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ assignment }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
