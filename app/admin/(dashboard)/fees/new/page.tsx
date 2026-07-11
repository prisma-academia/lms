import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader, Card } from "@/components/shell";
import { CreateFeeForm } from "./create-form";

export default async function NewFeePage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_FEES_WRITE.key);
  const [clients, groups] = await Promise.all([
    prisma.client.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.clientGroup.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
  ]);
  const currencyOptions = getCurrencyOptions();
  return (
    <div>
      <PageHeader title="New fee" />
      <Card>
        <CreateFeeForm
          clients={clients.map((c) => ({
            value: c.id,
            label: `${`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email} — ${c.email}`,
          }))}
          groups={groups.map((g) => ({ value: g.id, label: g.name }))}
          currencyOptions={currencyOptions}
        />
      </Card>
    </div>
  );
}
