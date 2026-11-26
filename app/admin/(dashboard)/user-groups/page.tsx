import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserGroupsTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function UserGroupsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_GROUPS_WRITE.key);
  const [groups, when] = await Promise.all([
    prisma.userGroup.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { memberships: true } } },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberCount: g._count.memberships,
    createdAt: g.createdAt.toISOString(),
    createdLabel: formatDate(g.createdAt, when),
  }));
  return (
    <div>
      <DataTableToolbar
        title="User groups"
        description="Put staff into groups, for example by department. A person can be in several."
        createHref={canWrite ? "/admin/user-groups/new" : undefined}
        createLabel="New group"
      />
      <UserGroupsTable
        data={rows}
        empty={
          <EmptyState
            icon="users"
            title="No user groups yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/user-groups/new">New group</Link>
                </Button>
              ) : undefined
            }
          >
            Groups let you share things, such as a question bank, with several staff at once.
          </EmptyState>
        }
      />
    </div>
  );
}
