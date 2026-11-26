import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientGroupsTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function ClientGroupsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_GROUPS_WRITE.key);
  const [groups, when] = await Promise.all([
    prisma.clientGroup.findMany({
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
        title="Learner groups"
        description="Put learners into groups, such as a class or an intake. A learner can be in several."
        createHref={canWrite ? "/admin/client-groups/new" : undefined}
        createLabel="New group"
      />
      <ClientGroupsTable
        data={rows}
        empty={
          <EmptyState
            icon="users"
            title="No learner groups yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/client-groups/new">New group</Link>
                </Button>
              ) : undefined
            }
          >
            Groups let you message a whole class, or put an event on its calendar, in one step.
          </EmptyState>
        }
      />
    </div>
  );
}
