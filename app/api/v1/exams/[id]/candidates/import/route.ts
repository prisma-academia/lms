import { apiRoute } from "@/lib/api/v1/route";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { CandidatesImport } from "@/lib/api/v1/schemas";
import { addApiCandidates, candidatesFromCsv } from "@/lib/api/v1/candidates";

/**
 * POST /api/v1/exams/{id}/candidates/import — up to 5000 candidates, as JSON
 * `candidates` or as `csv` text (header: fullName,email,regNumber,learnerId,
 * sittingId,extraTimePct). PINs come back once, in this response.
 */
export const POST = apiRoute<{ id: string }>({ scope: "exams:write" }, async (ctx) => {
  const body = ctx.json(CandidatesImport);
  const rows = [...(body.candidates ?? []), ...(body.csv ? candidatesFromCsv(body.csv) : [])];
  if (rows.length === 0) throw new DomainError(400, "validation_error", "Send `candidates` or `csv`.");
  if (rows.length > 5000) throw new DomainError(400, "too_many", "Import at most 5000 candidates at a time.");
  const issued = await addApiCandidates(ctx.tenantId, ctx.params.id, rows, body.resetExistingPins);
  await audit({ ...ctx.auditActor, action: "exam.candidates_import", targetType: "Exam", targetId: ctx.params.id, after: { count: issued.length } });
  return { data: issued, status: 201 };
});
