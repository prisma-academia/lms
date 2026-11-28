import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam } from "@/lib/exams/admin";
import { addCandidates } from "@/lib/exams/candidates";
import { parseCandidateCsv, prepareExternal } from "@/lib/exams/candidate-admin";

const Body = z.object({
  csv: z.string().min(1, "Paste or choose a CSV file.").max(2_000_000, "The file is too large (2 MB at most)."),
  dryRun: z.boolean().default(true),
});

/**
 * Candidates from a CSV: fullName/name, email, regNumber/reg, sitting (by
 * name), extraTimePct. `dryRun` returns the parsed rows with any problem per
 * row; otherwise the valid rows are added and their PINs returned once.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const { csv, dryRun } = Body.parse(await request.json());
    await findExam(actor.tenantId, id);
    const { rows, headerFound } = await parseCandidateCsv(actor.tenantId, id, csv);
    const valid = rows.filter((r) => !r.issue);
    if (dryRun) {
      return ok({ rows, headerFound, valid: valid.length, invalid: rows.length - valid.length });
    }

    const prepared = await prepareExternal(
      actor.tenantId,
      id,
      valid.map((r) => ({
        fullName: r.fullName,
        email: r.email,
        regNumber: r.regNumber,
        sittingId: r.sittingId,
        extraTimePct: r.extraTimePct,
      }))
    );
    const result = prepared.add.length ? await addCandidates(id, prepared.add) : [];
    const added = result.filter((r) => r.created);
    await auditExam(actor, request, "exam.candidates.import", { type: "Exam", id }, {
      after: { rows: rows.length, added: added.length, invalid: rows.length - valid.length },
    });
    return ok({
      issued: added,
      added: added.length,
      alreadyListed: result.length - added.length,
      skipped: [
        ...rows.filter((r) => r.issue).map((r) => ({ fullName: r.fullName || `Line ${r.line}`, reason: r.issue! })),
        ...prepared.skipped,
      ],
    });
  } catch (e) {
    return handleError(e);
  }
}
