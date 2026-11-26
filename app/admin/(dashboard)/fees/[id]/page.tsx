import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { formatDate, formatMoney } from "@/lib/format";
import { FeeEditor, type AssignedClient } from "./fee-editor";
import { tenantFormatContext } from "@/lib/tenant/format-context";

function clientLabel(c: { email: string; firstName: string | null; lastName: string | null }): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email;
}

export default async function FeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_FEES_READ.key);
  const { id } = await params;
  const fee = await prisma.fee.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: {
      client: { select: { id: true, email: true, firstName: true, lastName: true } },
      clientGroup: { select: { id: true, name: true } },
      payments: true,
    },
  });
  if (!fee) notFound();

  // Resolve the clients this fee applies to.
  let targetClients: { id: string; email: string; firstName: string | null; lastName: string | null }[] = [];
  if (fee.client) {
    targetClients = [fee.client];
  } else if (fee.clientGroupId) {
    const memberships = await prisma.clientGroupMembership.findMany({
      where: { groupId: fee.clientGroupId },
      include: { client: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    targetClients = memberships.map((m) => m.client);
  }

  // Dates are formatted here, in the academy's locale and time zone; the
  // editor is a Client Component and receives finished strings.
  const formatContext = await tenantFormatContext(actor.tenantId);

  const paymentByClient = new Map(fee.payments.map((p) => [p.clientId, p]));
  const assigned: AssignedClient[] = targetClients.map((c) => {
    const p = paymentByClient.get(c.id);
    return {
      id: c.id,
      label: clientLabel(c),
      email: c.email,
      status: p?.status ?? "UNPAID",
      paidLabel: p?.paidAt ? formatDate(p.paidAt, formatContext) : null,
    };
  });

  const paidCount = assigned.filter((a) => a.status === "SUCCESS").length;

  return (
    <div>
      <PageHeader
        title={fee.name}
        subtitle={`${formatMoney(fee.amountCents, fee.currency, formatContext.locale)} · ${paidCount} of ${assigned.length} paid${
          fee.dueAt ? ` · due ${formatDate(fee.dueAt, formatContext)}` : ""
        }`}
        backHref="/admin/fees"
        backLabel="Fees"
      />
      <FeeEditor
        id={fee.id}
        initial={{
          name: fee.name,
          description: fee.description ?? "",
          amount: String(fee.amountCents / 100),
          currency: fee.currency,
          dueAt: fee.dueAt ? fee.dueAt.toISOString().slice(0, 10) : "",
          targetLabel: fee.client ? clientLabel(fee.client) : fee.clientGroup ? `Group: ${fee.clientGroup.name}` : "—",
        }}
        assigned={assigned}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_FEES_WRITE.key)}
      />
    </div>
  );
}
