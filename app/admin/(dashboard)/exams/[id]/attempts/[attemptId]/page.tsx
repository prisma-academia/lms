import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { PageHeader } from "@/components/shell";
import { ExamOpsNav } from "@/components/exam-ops/ops-nav";
import { AttemptReviewView } from "./attempt-review";

export default async function ExamAttemptPage({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_READ.key);
  const { id, attemptId } = await params;
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, examId: id, tenantId: actor.tenantId },
    select: { id: true, exam: { select: { id: true, title: true } }, candidate: { select: { fullName: true } } },
  });
  if (!attempt) notFound();
  const fmt = await tenantFormatContext(actor.tenantId);
  const canGrade = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_GRADE.key);
  return (
    <div>
      <PageHeader
        title={attempt.candidate.fullName}
        subtitle={`Attempt review — ${attempt.exam.title}`}
        backHref={`/admin/exams/${id}/results`}
        backLabel="Results"
      />
      <ExamOpsNav examId={id} current="attempt" show={{ live: true, marking: canGrade, results: true }} />
      <AttemptReviewView
        examId={id}
        attemptId={attempt.id}
        fmt={{ locale: fmt.locale, timeZone: fmt.timeZone }}
        canProctor={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key)}
        canGrade={canGrade}
      />
    </div>
  );
}
