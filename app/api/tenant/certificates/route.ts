import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { certificateDesignSchema } from "@/lib/certificates/design";

const CreateBody = z
  .object({
    name: z.string().min(1).max(200),
    courseId: z.string().min(1).nullable().optional(),
    programmeId: z.string().min(1).nullable().optional(),
    contentJson: certificateDesignSchema.partial().optional(),
  })
  .refine((b) => !(b.courseId && b.programmeId), {
    message: "A certificate links to a course OR a programme, not both.",
    path: ["courseId"],
  });

export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
    const { cursor, take } = parsePagination(new URL(request.url).searchParams);
    const rows = await prisma.certificate.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        course: { select: { title: true } },
        programme: { select: { title: true } },
        _count: { select: { awards: true } },
      },
    });
    return ok(rows, buildPageMeta(rows, take));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    if (body.courseId) {
      const course = await prisma.course.findFirst({ where: { id: body.courseId, tenantId: actor.tenantId } });
      if (!course) throw new DomainError(400, "invalid_course", "Course not found in this tenant.");
    }
    if (body.programmeId) {
      const programme = await prisma.programme.findFirst({ where: { id: body.programmeId, tenantId: actor.tenantId } });
      if (!programme) throw new DomainError(400, "invalid_programme", "Programme not found in this tenant.");
    }

    const certificate = await prisma.certificate.create({
      data: {
        tenantId: actor.tenantId,
        name: body.name,
        courseId: body.courseId ?? null,
        programmeId: body.programmeId ?? null,
        contentJson: certificateDesignSchema.parse(body.contentJson ?? {}) as object,
      },
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "certificate.create",
      tenantId: actor.tenantId,
      targetType: "Certificate",
      targetId: certificate.id,
      after: { name: certificate.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ certificate }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
