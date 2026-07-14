import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { TemplateForm } from "../template-form";

export default async function NewTemplatePage() {
  await requireTenantPage(PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
  return (
    <div>
      <PageHeader title="New template" backHref="/admin/templates" backLabel="Templates" />
      <Card>
        <TemplateForm mode="create" initial={{ type: "", name: "", contentJson: "{}" }} canWrite />
      </Card>
    </div>
  );
}
