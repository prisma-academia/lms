import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError } from "@/lib/api/errors";
import { loadResultRows, resultsCsv } from "@/lib/exams/results-data";

export const dynamic = "force-dynamic";

/** Every attempt as CSV, one column per section. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    const { exam, sections, rows } = await loadResultRows(id, actor.tenantId);
    const safe = (exam.code || exam.title).replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").slice(0, 60) || "exam";
    return new Response(resultsCsv(sections, rows), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${safe}-results.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
