import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";

/**
 * Searchable assignment targets for the picker.
 *
 * Server-side search rather than shipping every learner to the client: a
 * tenant can have thousands, and a <select multiple> over that is unusable
 * anyway.
 */
export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_LIBRARY_READ.key);
    const sp = new URL(request.url).searchParams;
    const type = sp.get("type");
    const q = sp.get("q")?.trim() ?? "";
    const take = 20;
    const contains = { contains: q, mode: "insensitive" as const };

    if (type === "CLIENT") {
      const rows = await prisma.client.findMany({
        where: {
          tenantId: actor.tenantId,
          status: "ACTIVE",
          ...(q ? { OR: [{ email: contains }, { firstName: contains }, { lastName: contains }] } : {}),
        },
        orderBy: { email: "asc" },
        take,
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      return ok({
        subjects: rows.map((r) => ({
          id: r.id,
          label: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
          hint: r.email,
        })),
      });
    }

    if (type === "CLIENT_GROUP") {
      const rows = await prisma.clientGroup.findMany({
        where: { tenantId: actor.tenantId, ...(q ? { name: contains } : {}) },
        orderBy: { name: "asc" },
        take,
        select: { id: true, name: true, _count: { select: { memberships: true } } },
      });
      return ok({
        subjects: rows.map((r) => ({
          id: r.id,
          label: r.name,
          hint: `${r._count.memberships} learner${r._count.memberships === 1 ? "" : "s"}`,
        })),
      });
    }

    if (type === "COURSE") {
      const rows = await prisma.course.findMany({
        where: { tenantId: actor.tenantId, ...(q ? { title: contains } : {}) },
        orderBy: { title: "asc" },
        take,
        select: { id: true, title: true, _count: { select: { enrollments: true } } },
      });
      return ok({
        subjects: rows.map((r) => ({
          id: r.id,
          label: r.title,
          hint: `${r._count.enrollments} enrolled`,
        })),
      });
    }

    if (type === "PROGRAMME") {
      const rows = await prisma.programme.findMany({
        where: { tenantId: actor.tenantId, ...(q ? { title: contains } : {}) },
        orderBy: { title: "asc" },
        take,
        select: { id: true, title: true, _count: { select: { enrollments: true } } },
      });
      return ok({
        subjects: rows.map((r) => ({
          id: r.id,
          label: r.title,
          hint: `${r._count.enrollments} enrolled`,
        })),
      });
    }

    return ok({ subjects: [] });
  } catch (e) {
    return handleError(e);
  }
}
