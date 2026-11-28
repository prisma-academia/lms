import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { createPresignedDownload } from "@/lib/storage/s3";
import { responseFileKeyOk } from "@/lib/exams/ops";

export const dynamic = "force-dynamic";

/** A candidate's uploaded answer (file or recording), via a short-lived signed link. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string; responseId: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id, responseId } = await ctx.params;
    const r = await prisma.examResponse.findFirst({
      where: { id: responseId, tenantId: actor.tenantId, attempt: { examId: id } },
      select: { answerJson: true },
    });
    const key = r?.answerJson && typeof r.answerJson === "object" ? (r.answerJson as { key?: unknown }).key : undefined;
    if (!r || !responseFileKeyOk(key, actor.tenantId)) throw new DomainError(404, "not_found", "File not found.");
    const url = await createPresignedDownload(key, 300);
    return NextResponse.redirect(url, { status: 302, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
