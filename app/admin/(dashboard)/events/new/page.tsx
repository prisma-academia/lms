import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { EventForm } from "../event-form";

export default async function NewEventPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EVENTS_WRITE.key);
  const [clients, groups] = await Promise.all([
    prisma.client.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, email: true, firstName: true, lastName: true } }),
    prisma.clientGroup.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
  ]);
  return (
    <div>
      <PageHeader title="New event" />
      <Card>
        <EventForm
          mode="create"
          initial={{
            title: "", description: "", type: "ANNOUNCEMENT", startAt: "", endAt: "",
            location: "", url: "", audience: "ALL", clientId: "", clientGroupId: "",
            recurrence: "NONE", recurrenceUntil: "",
          }}
          clients={clients.map((c) => ({ value: c.id, label: `${`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email} — ${c.email}` }))}
          groups={groups.map((g) => ({ value: g.id, label: g.name }))}
          canWrite
        />
      </Card>
    </div>
  );
}
