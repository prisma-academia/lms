import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { effectivePassMark } from "@/lib/assessments/pass-mark";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { QuizzesTable } from "./table";

export default async function QuizzesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key);
  const quizzes = await prisma.quiz.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { questions: true, attempts: true } } },
  });
  const rows = quizzes.map((q) => ({
    id: q.id,
    title: q.title,
    questions: q._count.questions,
    attempts: q._count.attempts,
    // The mark the quiz is actually held to: an unset mark means 100%, and a
    // dash here would read as "no pass mark".
    passingScore: `${effectivePassMark(q.passingScore)}%`,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Quizzes"
        description="Build quizzes from your question banks and add them to course lessons."
        createHref={canWrite ? "/admin/quizzes/new" : undefined}
        createLabel="New quiz"
      />
      <QuizzesTable data={rows} canCreate={canWrite} />
    </div>
  );
}
