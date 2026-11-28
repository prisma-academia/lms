import { prisma } from "@/lib/db/client";
import { enterContext } from "@/lib/db/tenant-context";
import { loadTenantPageContext } from "@/lib/db/page-context";
import { handleError, DomainError } from "@/lib/api/errors";
import { parseSecurity } from "@/lib/exams/settings";
import { sebConfigFile } from "@/lib/exams/seb";
import { requestOrigin } from "@/lib/billing/redirect";

/**
 * The Safe Exam Browser settings file for a published exam. Public on
 * purpose: it holds only this academy's exam URLs and (if set) the SHA-256 of
 * the invigilators' quit password — exactly what SEB distributes to every
 * candidate machine. It is byte-identical to the staff download, so the
 * Config Key staff copied from it matches what candidates' SEB sends.
 */
export async function GET(request: Request, ctx: { params: Promise<{ examId: string }> }) {
  try {
    const page = await loadTenantPageContext();
    if (page.mode !== "tenant" || !page.tenant) throw new DomainError(404, "not_found", "Not found.");
    enterContext({ mode: "tenant-client", tenantId: page.tenant.id });
    const { examId } = await ctx.params;
    const exam = await prisma.exam.findFirst({
      where: { id: examId, tenantId: page.tenant.id, status: { in: ["PUBLISHED", "CLOSED"] } },
      select: { id: true, title: true, code: true, securityJson: true },
    });
    if (!exam) throw new DomainError(404, "not_found", "Not found.");
    const security = parseSecurity(exam.securityJson);
    // Same origin helper as the staff download, so both files are byte-identical
    // and the Config Key staff copied matches what candidates run.
    const origin = requestOrigin(request);
    const file = sebConfigFile({ origin, examId: exam.id, examTitle: exam.title, quitPassword: security.seb.quitPassword });
    const name = (exam.code || exam.title).replace(/[^a-z0-9-_]/gi, "-").slice(0, 60) || "exam";
    return new Response(file, {
      headers: {
        "Content-Type": "application/seb",
        "Content-Disposition": `attachment; filename="${name}.seb"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
