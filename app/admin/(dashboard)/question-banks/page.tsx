import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { accessibleBankWhere } from "@/lib/assessments/bank-access";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { QuestionBanksTable } from "./table";

export default async function QuestionBanksPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_READ.key);
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
        description="Reusable questions with tags. Build quizzes from these."
        createHref="/admin/question-banks/new"
        createLabel="New bank"
      />
      <QuestionBanksTable data={rows} />
    </div>
  );
}
