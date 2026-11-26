import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TenantUsersTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function TenantUsersPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_USERS_READ.key);
  const canInvite = hasPermission(actor, PERMISSIONS.TENANT_USERS_WRITE.key);
  const [users, when] = await Promise.all([
    prisma.tenantUser.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isOwner: true,
        status: true,
        lastLoginAt: true,
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    // Formatted here, in the academy's locale and time zone: the table is a
    // Client Component, and a date formatted there renders twice, differently.
    lastLoginLabel: formatDateTime(u.lastLoginAt, when, "Never"),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Users"
        description="Staff who can sign in to this admin area."
        createHref={canInvite ? "/admin/users/new" : undefined}
        createLabel="Invite user"
      />
      <TenantUsersTable
        data={rows}
        empty={
          <EmptyState
            icon="users"
            title="No staff yet"
            action={
              canInvite ? (
                <Button asChild>
                  <Link href="/admin/users/new">Invite user</Link>
                </Button>
              ) : undefined
            }
          >
            Invite the instructors and administrators who help run this academy.
          </EmptyState>
        }
      />
    </div>
  );
}
