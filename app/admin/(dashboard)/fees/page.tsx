import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { FeesTable } from "./table";

export default async function FeesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_FEES_READ.key);
  const fees = await prisma.fee.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      client: { select: { email: true, firstName: true, lastName: true } },
      clientGroup: { select: { name: true } },
      _count: { select: { payments: true } },
    },
  });
  const rows = fees.map((f) => ({
    id: f.id,
    name: f.name,
    target: f.client
      ? `${`${f.client.firstName ?? ""} ${f.client.lastName ?? ""}`.trim() || f.client.email}`
      : f.clientGroup
        ? `Group: ${f.clientGroup.name}`
        : "—",
    amount: `${(f.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: f.currency })}`,
    dueAt: f.dueAt?.toISOString() ?? null,
    paymentsRecorded: f._count.payments,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Fees"
        description="Charge clients or client groups and track who has paid."
        createHref="/admin/fees/new"
        createLabel="New fee"
      />
      <FeesTable data={rows} />
    </div>
  );
}
