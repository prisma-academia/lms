import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { parsePagination, buildPageMeta } from "@/lib/api/pagination";
import { enrollLearner } from "@/lib/courses/enroll";

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

    // Staff may manually onboard a learner into any published course —
    // including private and paid offerings (comped / offline payment).
    // Shared with the Developer API (lib/courses/enroll.ts): confirmation email
    // and `enrollment.created` on the first enrolment only.
    const { enrollment } = await enrollLearner(actor.tenantId, body);
    return ok({ enrollment }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
