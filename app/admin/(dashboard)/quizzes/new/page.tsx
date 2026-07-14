import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateQuizForm } from "./create-form";

export default async function NewQuizPage() {
  await requireTenantPage(PERMISSIONS.TENANT_QUIZZES_WRITE.key);
  return (
    <div>
      <PageHeader title="New quiz" subtitle="Add questions after creating the quiz." backHref="/admin/quizzes" backLabel="Quizzes" />
      <Card>
        <CreateQuizForm />
      </Card>
    </div>
  );
}
