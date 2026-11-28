import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { findExam } from "@/lib/exams/admin";
import { buildPaper, candidatePackage, loadExamForPaper, PaperError } from "@/lib/exams/paper";

const Body = z.object({ seed: z.number().int().min(0).max(2_147_483_647).optional() });

/**
 * "Try as candidate": draw a paper exactly as a candidate would get it and
 * return the candidate-safe package. Nothing is saved; no answer key leaves.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    const { seed: given } = Body.parse(await request.json().catch(() => ({})));
    await findExam(actor.tenantId, id);
    const exam = await loadExamForPaper(id);
    if (!exam) throw new DomainError(404, "not_found", "Exam not found.");
    const seed = given ?? randomInt(1, 2_147_483_647);
    try {
      const paper = await buildPaper(exam, seed);
      const pkg = await candidatePackage(paper, seed);
      return ok({ seed, pkg });
    } catch (e) {
      if (e instanceof PaperError) throw new DomainError(422, "paper_error", e.message);
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
