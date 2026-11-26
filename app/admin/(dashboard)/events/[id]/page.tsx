import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { toZonedInput } from "@/lib/time/zoned-input";
import { EventForm } from "../event-form";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_EVENTS_READ.key);
  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { client: { select: { email: true } }, clientGroup: { select: { name: true } } },
  });
  if (!event) notFound();

  // The form shows and reads times on the academy's own clock — see
  // lib/time/zoned-input.ts for why the server's and the browser's will not do.
  const { timeZone } = await tenantFormatContext(actor.tenantId);
  const toLocalInput = (d: Date) => toZonedInput(d, timeZone);

  const audienceLabel =
    event.audience === "ALL"
      ? "All learners"
      : event.audience === "CLIENT"
        ? `One learner: ${event.client?.email ?? "—"}`
        : `Learner group: ${event.clientGroup?.name ?? "—"}`;

  return (
    <div>
      <PageHeader title={event.title} backHref="/admin/events" backLabel="Calendar" />
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
          timeZone={timeZone}
          clients={[]}
          groups={[]}
          canWrite={hasPermission(actor, PERMISSIONS.TENANT_EVENTS_WRITE.key)}
        />
      </Card>
    </div>
  );
}
