import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { formatDate } from "@/lib/format";
import { TemplatesTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function TemplatesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_TEMPLATES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_TEMPLATES_WRITE.key);
  const [templates, formatContext] = await Promise.all([
    prisma.template.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    tenantFormatContext(actor.tenantId),
  ]);
  // Formatted here, in the academy's locale and time zone; the table is a
  // Client Component and receives finished strings.
  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    createdAt: t.createdAt.toISOString(),
    createdLabel: formatDate(t.createdAt, formatContext),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Templates"
        description="Saved content your academy reuses, such as email wording and site page layouts."
        createHref={canWrite ? "/admin/templates/new" : undefined}
        createLabel="New template"
      />
      <TemplatesTable data={rows} canCreate={canWrite} />
    </div>
  );
}
