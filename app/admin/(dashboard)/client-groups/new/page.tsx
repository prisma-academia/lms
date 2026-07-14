import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateClientGroupForm } from "./create-form";

export default async function NewClientGroupPage() {
  await requireTenantPage(PERMISSIONS.TENANT_GROUPS_WRITE.key);
  return (
    <div>
      <PageHeader title="New client group" subtitle="You can add members after creating the group." backHref="/admin/client-groups" backLabel="Client groups" />
      <Card>
        <CreateClientGroupForm />
      </Card>
    </div>
  );
}
