import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { formatDate } from "@/lib/format";
import { RolesTable } from "@/app/(platform)/(dashboard)/role-templates/table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function TenantRolesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ROLES_READ.key);
  const [roles, formatContext] = await Promise.all([
    prisma.roleTemplate.findMany({
      where: { scope: "TENANT", tenantId: actor.tenantId },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isSystem: true, permissions: true, createdAt: true },
    }),
    tenantFormatContext(actor.tenantId),
  ]);
  // Dates are formatted here, in the academy's own locale and time zone. The
  // table is a Client Component and must not format them a second time.
  const rows = roles.map((r) => ({
    id: r.id,
    name: r.name,
    isSystem: r.isSystem,
    permissionCount: r.permissions.length,
    createdAt: r.createdAt.toISOString(),
    createdLabel: formatDate(r.createdAt, formatContext),
  }));
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_ROLES_WRITE.key);
  return (
    <div>
      <DataTableToolbar
        title="Roles"
        description="Reusable sets of permissions. Apply one to a staff member to set what they can do."
        createHref={canWrite ? "/admin/role-templates/new" : undefined}
        createLabel="New role"
      />
      <RolesTable data={rows} basePath="/admin/role-templates" canCreate={canWrite} />
    </div>
  );
}
