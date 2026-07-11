import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { TemplatesTable } from "./table";

export default async function TemplatesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_TEMPLATES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
  const templates = await prisma.template.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    createdAt: t.createdAt.toISOString(),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Templates"
        description="Reusable tenant-scoped templates."
        createHref={canWrite ? "/admin/templates/new" : undefined}
        createLabel="New template"
      />
      <TemplatesTable data={rows} />
    </div>
  );
}
