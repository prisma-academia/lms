import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { findExam } from "@/lib/exams/admin";

/** Learner search for "Add learners": name or email, with whether each is already on the list. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    await findExam(actor.tenantId, id);
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
    const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
    const rows = await prisma.client.findMany({
      where: {
        tenantId: actor.tenantId,
        ...(words.length
          ? {
              AND: words.map((w) => ({
                OR: [
                  { email: { contains: w, mode: "insensitive" as const } },
                  { firstName: { contains: w, mode: "insensitive" as const } },
                  { lastName: { contains: w, mode: "insensitive" as const } },
                ],
              })),
            }
          : {}),
      },
      orderBy: [{ firstName: "asc" }, { email: "asc" }],
      take: 40,
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    const listed = await prisma.examCandidate.findMany({
      where: { examId: id, clientId: { in: rows.map((r) => r.id) } },
      select: { clientId: true },
    });
    const on = new Set(listed.map((l) => l.clientId));
    return ok({
      learners: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email,
        status: r.status,
        onList: on.has(r.id),
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
