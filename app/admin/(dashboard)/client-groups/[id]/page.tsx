import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { EditClientGroupForm } from "./edit-form";

export default async function EditClientGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const { id } = await params;
  const group = await prisma.clientGroup.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { memberships: { select: { clientId: true } } },
  });
  if (!group) notFound();

  const clients = await prisma.client.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const candidates = clients.map((c) => ({
    id: c.id,
    label: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email,
    email: c.email,
  }));

  return (
    <div>
      <PageHeader title={group.name} subtitle="Edit group details and manage members." />
      <Card>
        <EditClientGroupForm
          id={group.id}
          name={group.name}
          description={group.description}
          candidates={candidates}
          memberIds={group.memberships.map((m) => m.clientId)}
        />
      </Card>
    </div>
  );
}
