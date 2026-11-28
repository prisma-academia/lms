import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { ownsCandidate, requireCandidateIdentity } from "@/lib/exams/candidate-auth";
import { createPresignedUpload, isAllowedUploadType, MAX_ASSET_BYTES, s3Configured } from "@/lib/storage/s3";
import { assertStorageQuota } from "@/lib/storage/quota";

/** A signed upload link for a file-upload or spoken-answer question. */
const Body = z.object({
  contentType: z.string().min(1).max(120),
  contentLength: z.number().int().positive(),
});

export async function POST(request: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  try {
    await requireCsrf(request);
    const identity = await requireCandidateIdentity();
    const { attemptId } = await ctx.params;
    const body = Body.parse(await request.json());
    const attempt = await prisma.examAttempt.findFirst({
      where: { id: attemptId, tenantId: identity.tenantId },
      select: { id: true, status: true, candidate: { select: { id: true, clientId: true, examId: true } } },
    });
    if (!attempt || !ownsCandidate(identity, attempt.candidate)) throw new DomainError(404, "not_found", "Attempt not found.");
    if (attempt.status !== "IN_PROGRESS") throw new DomainError(409, "not_live", "Answers can only be uploaded during the exam.");
    if (!s3Configured()) throw new DomainError(503, "storage_unconfigured", "File answers are not available on this server.");
    const type = body.contentType.split(";")[0].trim();
    if (!isAllowedUploadType(type, "exam_response")) throw new DomainError(400, "bad_type", "Upload a PDF, an image or an audio recording.");
    if (body.contentLength > MAX_ASSET_BYTES.exam_response) throw new DomainError(400, "file_too_large", "That file is larger than 25 MB.");
    await assertStorageQuota(identity.tenantId, body.contentLength);
    const presigned = await createPresignedUpload({
      tenantId: identity.tenantId,
      contentType: type,
      kind: "exam_response",
      contentLength: body.contentLength,
    });
    return ok({ url: presigned.url, key: presigned.key });
  } catch (e) {
    return handleError(e);
  }
}
