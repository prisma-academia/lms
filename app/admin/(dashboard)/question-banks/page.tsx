import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { QuestionBanksTable } from "./table";

export default async function QuestionBanksPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_QUIZZES_WRITE.key);
  const access = await accessibleBankWhere(actor);
  const banks = await prisma.questionBank.findMany({
    where: { AND: [{ tenantId: actor.tenantId }, access] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { questions: true, accessGroups: true } } },
  });
  const rows = banks.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    questions: b._count.questions,
    restricted: b._count.accessGroups > 0 ? "Restricted" : "All staff",
  }));
  return (
    <div>
      <DataTableToolbar
        title="Question banks"
        description="Collections of reusable questions. Quizzes are built from these."
        createHref={canWrite ? "/admin/question-banks/new" : undefined}
        createLabel="New bank"
      />
      <QuestionBanksTable data={rows} canCreate={canWrite} />
    </div>
  );
}
