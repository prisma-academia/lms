import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { ExamOpsNav } from "@/components/exam-ops/ops-nav";
import { Marker } from "./marker";

export default async function ExamMarkingPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EXAMS_GRADE.key);
  const { id } = await params;
  const exam = await prisma.exam.findFirst({ where: { id, tenantId: actor.tenantId }, select: { id: true, title: true } });
  if (!exam) notFound();
  return (
    <div data-wide-page>
      <PageHeader
        title={`Marking — ${exam.title}`}
        subtitle="Essays, uploads, recordings and code wait here for a person's mark. The AI's suggestions are only suggestions until you accept them."
        backHref={`/admin/exams/${exam.id}`}
        backLabel="Exam"
      />
      <ExamOpsNav
        examId={exam.id}
        current="marking"
        show={{
          live: hasPermission(actor, PERMISSIONS.TENANT_EXAMS_PROCTOR.key) || hasPermission(actor, PERMISSIONS.TENANT_EXAMS_READ.key),
          marking: true,
          results: hasPermission(actor, PERMISSIONS.TENANT_EXAMS_READ.key),
        }}
      />
      <Marker examId={exam.id} canReview={hasPermission(actor, PERMISSIONS.TENANT_EXAMS_READ.key)} />
    </div>
  );
}
