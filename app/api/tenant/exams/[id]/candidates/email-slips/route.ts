import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { auditExam, findExam } from "@/lib/exams/admin";
import { resetPins } from "@/lib/exams/candidates";
import { sendEmail } from "@/lib/email/send";
import { examSlipEmail } from "@/lib/email/templates";
import { loadTenantBrandingById } from "@/lib/email/branding";
import { requestOrigin } from "@/lib/billing/redirect";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";

const Body = z.object({ candidateIds: z.array(z.string().min(1)).max(5000).optional() });

/**
 * Email each candidate (all, or the ones given) who has an email address a
 * new PIN with their Exam ID, the sign-in link and when and where to sit.
 * Issuing the new PIN replaces the old one, so only candidates who can be
 * emailed are touched.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_WRITE.key);
    const { id } = await ctx.params;
    const { candidateIds } = Body.parse(await request.json().catch(() => ({})));
    const exam = await findExam(actor.tenantId, id);

    const scope = await prisma.examCandidate.findMany({
      where: { examId: id, ...(candidateIds ? { id: { in: candidateIds } } : {}) },
      select: { id: true, email: true, status: true, sitting: { select: { startsAt: true, venue: true } } },
    });
    const emailable = scope.filter((c) => c.email && c.status === "ACTIVE");
    const noEmail = scope.filter((c) => !c.email).length;
    const inactive = scope.filter((c) => c.email && c.status !== "ACTIVE").length;
    if (!emailable.length) return ok({ sent: 0, failed: 0, noEmail, inactive });

    const issued = await resetPins(id, emailable.map((c) => c.id));
    const sittingOf = new Map(emailable.map((c) => [c.id, c.sitting]));
    const [branding, fmt] = await Promise.all([loadTenantBrandingById(actor.tenantId), tenantFormatContext(actor.tenantId)]);
    const loginUrl = `${requestOrigin(request)}/exam`;

    let sent = 0;
    let failed = 0;
    // Small batches: an SMTP relay throttles a burst of hundreds.
    for (let i = 0; i < issued.length; i += 10) {
      const batch = issued.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((c) => {
          const sitting = sittingOf.get(c.id);
          const when = sitting?.startsAt ?? exam.opensAt;
          return sendEmail({
            to: c.email!,
            subject: `Your exam slip: ${exam.title}`,
            replyTo: branding.supportEmail,
            fromName: branding.name,
            html: examSlipEmail(branding, {
              name: c.fullName,
              examTitle: exam.title,
              candidateNo: c.candidateNo,
              pin: c.pin,
              loginUrl,
              regNumber: c.regNumber,
              whenLabel: when ? formatDateTime(when, fmt) : null,
              venue: sitting?.venue ?? null,
              durationMin: exam.durationMin,
            }),
          });
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") sent++;
        else {
          failed++;
          logger.error({ err: r.reason, examId: id }, "exam_slip_email_failed");
        }
      }
    }

    await auditExam(actor, request, "exam.candidates.email_slips", { type: "Exam", id }, {
      after: { pinsReset: issued.length, sent, failed, noEmail, inactive },
    });
    return ok({ sent, failed, noEmail, inactive });
  } catch (e) {
    return handleError(e);
  }
}
