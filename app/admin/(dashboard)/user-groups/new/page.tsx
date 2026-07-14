import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateUserGroupForm } from "./create-form";

export default async function NewUserGroupPage() {
  await requireTenantPage(PERMISSIONS.TENANT_GROUPS_WRITE.key);
  return (
    <div>
      <PageHeader title="New user group" subtitle="You can add members after creating the group." backHref="/admin/user-groups" backLabel="User groups" />
      <Card>
        <CreateUserGroupForm />
      </Card>
    </div>
  );
}
