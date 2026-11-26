import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { formatDate, formatMoney } from "@/lib/format";
import { FeesTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function FeesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_FEES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_FEES_WRITE.key);
  const [fees, formatContext] = await Promise.all([
    prisma.fee.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        client: { select: { email: true, firstName: true, lastName: true } },
        clientGroup: { select: { name: true } },
        _count: { select: { payments: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);
  // Formatted here, in the academy's locale and time zone; the table is a
  // Client Component and receives finished strings.
  const rows = fees.map((f) => ({
    id: f.id,
    name: f.name,
    target: f.client
      ? `${`${f.client.firstName ?? ""} ${f.client.lastName ?? ""}`.trim() || f.client.email}`
      : f.clientGroup
        ? `Group: ${f.clientGroup.name}`
        : "—",
    amount: formatMoney(f.amountCents, f.currency, formatContext.locale),
    dueAt: f.dueAt?.toISOString() ?? null,
    dueLabel: formatDate(f.dueAt, formatContext, "No due date"),
    paymentsRecorded: f._count.payments,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Fees"
        description="Charge a learner or a group, and keep track of who has paid."
        createHref={canWrite ? "/admin/fees/new" : undefined}
        createLabel="New fee"
      />
      <FeesTable data={rows} canCreate={canWrite} />
    </div>
  );
}
