import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFormatContext } from "@/lib/tenant/format-context";
import { PageHeader } from "@/components/shell";
import { ExamOpsNav } from "@/components/exam-ops/ops-nav";
import { LiveRoom } from "./live-room";

export default async function ExamLivePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage();
  const canProctor = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key);
  const canRead = hasPermission(actor, PERMISSIONS.TENANT_EXAMS_READ.key);
  if (!canProctor && !canRead) redirect("/admin/dashboard");
  const { id } = await params;
  const exam = await prisma.exam.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, title: true, code: true } });
  if (!exam) notFound();
  const fmt = await tenantFormatContext(actor.tenantId);
  return (
    <div data-wide-page>
      <PageHeader
        title={`Live room — ${exam.title}`}
        subtitle={canProctor ? "Watch every candidate as they sit the exam, and step in when needed." : "Watch every candidate as they sit the exam."}
        backHref={`/admin/exams/${exam.id}`}
        backLabel="Exam"
      />
      <ExamOpsNav
        examId={exam.id}
        current="live"
        show={{ live: true, marking: hasPermission(actor, PERMISSIONS.TENANT_EXAMS_GRADE.key), results: canRead }}
      />
      <LiveRoom examId={exam.id} fmt={{ locale: fmt.locale, timeZone: fmt.timeZone }} canProctor={canProctor} canReview={canRead} />
    </div>
  );
}
