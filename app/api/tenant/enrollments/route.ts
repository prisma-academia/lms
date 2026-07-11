import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";

const EnrollBody = z.object({
  clientId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ENROLLMENTS_READ.key);
    const url = new URL(request.url);
    const { cursor, take } = parsePagination(url.searchParams);
    const courseId = url.searchParams.get("courseId");
    const rows = await prisma.enrollment.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(courseId ? { courseId } : {}),
      },
      orderBy: { enrolledAt: "desc" },
      take,
      include: {
        course: { select: { title: true, slug: true } },
        client: { select: { email: true, firstName: true, lastName: true } },
      },
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
    const actor = await requireTenantActor(PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key);
    const body = EnrollBody.parse(await request.json());

    const course = await prisma.course.findFirst({
      where: { id: body.courseId, tenantId: actor.tenantId, status: "PUBLISHED" },
    });
    if (!course) throw new DomainError(404, "not_found", "Course not found.");
    // Staff may manually onboard a learner into any published course —
    // including private and paid offerings (comped / offline payment).

    const client = await prisma.client.findFirst({
      where: { id: body.clientId, tenantId: actor.tenantId },
    });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const enrollment = await prisma.enrollment.upsert({
      where: { courseId_clientId: { courseId: body.courseId, clientId: body.clientId } },
      create: {
        tenantId: actor.tenantId,
        courseId: body.courseId,
        clientId: body.clientId,
      },
      update: {},
    });
    return ok({ enrollment }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
