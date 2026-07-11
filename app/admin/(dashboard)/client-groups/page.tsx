import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { ClientGroupsTable } from "./table";

export default async function ClientGroupsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const groups = await prisma.clientGroup.findMany({
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
        title="Client groups"
        description="Group learners into cohorts. A client can belong to many groups."
        createHref="/admin/client-groups/new"
        createLabel="New group"
      />
      <ClientGroupsTable data={rows} />
    </div>
  );
}
