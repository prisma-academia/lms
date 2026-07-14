import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { EditUserGroupForm } from "./edit-form";

export default async function EditUserGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_GROUPS_READ.key);
  const { id } = await params;
  const group = await prisma.userGroup.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { memberships: { select: { userId: true } } },
  });
  if (!group) notFound();

  const users = await prisma.tenantUser.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const candidates = users.map((u) => ({
    id: u.id,
    label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    email: u.email,
  }));

  return (
    <div>
      <PageHeader title={group.name} subtitle="Edit group details and manage members." backHref="/admin/user-groups" backLabel="User groups" />
      <Card>
        <EditUserGroupForm
          id={group.id}
          name={group.name}
          description={group.description}
          candidates={candidates}
          memberIds={group.memberships.map((m) => m.userId)}
        />
      </Card>
    </div>
  );
}
