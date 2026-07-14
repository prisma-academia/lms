import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { EventForm } from "../event-form";

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EVENTS_READ.key);
  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { client: { select: { email: true } }, clientGroup: { select: { name: true } } },
  });
  if (!event) notFound();

  const audienceLabel =
    event.audience === "ALL"
      ? "All clients"
      : event.audience === "CLIENT"
        ? `Client: ${event.client?.email ?? "—"}`
        : `Group: ${event.clientGroup?.name ?? "—"}`;

  return (
    <div>
      <PageHeader title={event.title} backHref="/admin/events" backLabel="Events" />
      <Card>
        <EventForm
          mode="edit"
          id={event.id}
          audienceLabel={audienceLabel}
          initial={{
            title: event.title,
            description: event.description ?? "",
            type: event.type,
            startAt: toLocalInput(event.startAt),
            endAt: event.endAt ? toLocalInput(event.endAt) : "",
            location: event.location ?? "",
            url: event.url ?? "",
            audience: event.audience,
            clientId: event.clientId ?? "",
            clientGroupId: event.clientGroupId ?? "",
            recurrence: event.recurrence,
            recurrenceUntil: event.recurrenceUntil ? toLocalInput(event.recurrenceUntil) : "",
          }}
          clients={[]}
          groups={[]}
          canWrite={hasPermission(actor, PERMISSIONS.TENANT_EVENTS_WRITE.key)}
        />
      </Card>
    </div>
  );
}
