import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError } from "@/lib/api/errors";
import { findExam } from "@/lib/exams/admin";
import { parseSecurity } from "@/lib/exams/settings";
import { sebConfigFile } from "@/lib/exams/seb";
import { requestOrigin } from "@/lib/billing/redirect";

/** The Safe Exam Browser configuration file for this exam, as a download. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    const exam = await findExam(actor.tenantId, id);
    const security = parseSecurity(exam.securityJson);
    const file = sebConfigFile({
      // The academy's public address (behind Dokploy/Cloudflare the request URL is internal).
      origin: requestOrigin(request),
      examId: exam.id,
      examTitle: exam.title,
      quitPassword: security.seb.quitPassword,
    });
    const base =
      (exam.code || exam.title)
        .replace(/[^A-Za-z0-9 _-]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "exam";
    return new Response(file, {
      status: 200,
      headers: {
        "content-type": "application/seb",
        "content-disposition": `attachment; filename="${base}.seb"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
