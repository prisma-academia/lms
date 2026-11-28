import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import * as out from "@/lib/api/v1/serialize";

async function load(tenantId: string, id: string) {
  const e = await prisma.enrollment.findFirst({ where: { id, tenantId } });
  if (!e) throw new DomainError(404, "not_found", "Enrollment not found.");
  return e;
}

/** GET /api/v1/enrollments/{id} */
export const GET = apiRoute<{ id: string }>({ scope: "enrollments:read" }, async (ctx) => {
  return { data: out.enrollment(await load(ctx.tenantId, ctx.params.id)) };
});

/** DELETE /api/v1/enrollments/{id} — unenrol. The learner's lesson progress on the course goes with it. */
export const DELETE = apiRoute<{ id: string }>({ scope: "enrollments:write" }, async (ctx) => {
  const e = await load(ctx.tenantId, ctx.params.id);
  await prisma.enrollment.delete({ where: { id: e.id } });
  await audit({ ...ctx.auditActor, action: "enrollment.delete", targetType: "Enrollment", targetId: e.id, before: { learnerId: e.clientId, courseId: e.courseId } });
  return { data: { id: e.id, deleted: true } };
});
