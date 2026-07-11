import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { ActivityTable } from "@/app/(platform)/(dashboard)/activity/table";

function displayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string
): string {
  const name = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return name || email;
}

export default async function TenantActivityPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_ACTIVITY_READ.key);
  const rows = await prisma.activityLog.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const userIds = rows
    .filter((r) => r.actorType === "TENANT_USER" && r.actorId)
    .map((r) => r.actorId!);
  const clientIds = rows
    .filter((r) => r.actorType === "CLIENT" && r.actorId)
    .map((r) => r.actorId!);

  const [users, clients] = await Promise.all([
    userIds.length
      ? prisma.tenantUser.findMany({
          where: { id: { in: userIds }, tenantId: actor.tenantId },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [],
    clientIds.length
      ? prisma.client.findMany({
          where: { id: { in: clientIds }, tenantId: actor.tenantId },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [],
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const data = rows.map((r) => {
    let actorLabel: string | null = null;
    if (r.actorType === "TENANT_USER" && r.actorId) {
      const u = userById.get(r.actorId);
      actorLabel = u ? displayName(u.firstName, u.lastName, u.email) : null;
    } else if (r.actorType === "CLIENT" && r.actorId) {
      const c = clientById.get(r.actorId);
      actorLabel = c ? displayName(c.firstName, c.lastName, c.email) : null;
    } else if (r.actorType === "SYSTEM") {
      actorLabel = "System";
    }

    return {
      id: r.id,
      tenantId: r.tenantId,
      actorType: r.actorType,
      actorId: r.actorId,
      actorLabel,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return (
    <div>
      <PageHeader title="Activity" />
      <ActivityTable data={data} variant="tenant" />
    </div>
  );
}
