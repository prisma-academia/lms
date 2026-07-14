import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { ComposeForm } from "./compose-form";

export default async function ComposeMessagePage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_MESSAGES_WRITE.key);
  const [clients, groups] = await Promise.all([
    prisma.client.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, email: true, firstName: true, lastName: true } }),
    prisma.clientGroup.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Compose message" subtitle="Delivered to the inbox, notification bell, and email (per preferences)." backHref="/admin/messages" backLabel="Messages" />
      <Card>
        <ComposeForm
          clients={clients.map((c) => ({ value: c.id, label: `${`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email} — ${c.email}` }))}
          groups={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
      </Card>
    </div>
  );
}
