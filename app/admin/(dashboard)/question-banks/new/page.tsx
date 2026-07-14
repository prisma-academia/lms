import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateBankForm } from "./create-form";

export default async function NewBankPage() {
  await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
  return (
    <div>
      <PageHeader title="New question bank" subtitle="Add questions and share settings after creating." backHref="/admin/question-banks" backLabel="Question banks" />
      <Card>
        <CreateBankForm />
      </Card>
    </div>
  );
}
