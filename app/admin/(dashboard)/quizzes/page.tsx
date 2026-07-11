import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { QuizzesTable } from "./table";

export default async function QuizzesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
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
    passingScore: q.passingScore != null ? `${q.passingScore}%` : "—",
  }));
  return (
    <div>
      <DataTableToolbar
        title="Quizzes"
        description="Assemble quizzes from question banks and link them to lessons."
        createHref="/admin/quizzes/new"
        createLabel="New quiz"
      />
      <QuizzesTable data={rows} />
    </div>
  );
}
