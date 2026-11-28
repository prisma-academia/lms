import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { PageHeader } from "@/components/shell";
import { ExamOpsNav } from "@/components/exam-ops/ops-nav";
import { ResultsDashboard } from "./results-dashboard";

export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_READ.key);
  const { id } = await params;
  const exam = await prisma.exam.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, title: true } });
  if (!exam) notFound();
  const fmt = await tenantFormatContext(actor.tenantId);
  const canGrade = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_GRADE.key);
  return (
    <div data-wide-page>
      <PageHeader
        title={`Results — ${exam.title}`}
        subtitle="Scores, how each question performed, and the integrity picture."
        backHref={`/admin/exams/${exam.id}`}
        backLabel="Exam"
      />
      <ExamOpsNav examId={exam.id} current="results" show={{ live: true, marking: canGrade, results: true }} />
      <ResultsDashboard examId={exam.id} fmt={{ locale: fmt.locale, timeZone: fmt.timeZone }} canGrade={canGrade} />
    </div>
  );
}
