import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { UserGroupsTable } from "./table";

export default async function UserGroupsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const groups = await prisma.userGroup.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { memberships: true } } },
  });
  const rows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberCount: g._count.memberships,
    createdAt: g.createdAt.toISOString(),
  }));
  return (
    <div>
      <DataTableToolbar
        title="User groups"
        description="Group tenant staff into cohorts. A user can belong to many groups."
        createHref="/admin/user-groups/new"
        createLabel="New group"
      />
      <UserGroupsTable data={rows} />
    </div>
  );
}
