import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { InviteTenantUserForm } from "./invite-form";

export default async function NewTenantUserPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_USERS_WRITE.key);
  const roles = await prisma.roleTemplate.findMany({
    where: { scope: "TENANT", tenantId: actor.tenantId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return (
    <div>
      <PageHeader title="Invite user" backHref="/admin/users" backLabel="Users" />
      <Card>
        <InviteTenantUserForm roles={roles} />
      </Card>
    </div>
  );
}
