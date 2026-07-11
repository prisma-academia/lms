import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { MessagesTable } from "./table";

export default async function MessagesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_MESSAGES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_MESSAGES_WRITE.key);
  const messages = await prisma.message.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { recipients: true } } },
  });
  const rows = messages.map((m) => ({
    id: m.id,
    subject: m.subject,
    category: m.category,
    audience: m.audience,
    recipients: m._count.recipients,
    createdAt: m.createdAt.toISOString(),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Message center"
        description="Send messages and notifications to clients or groups."
        createHref={canWrite ? "/admin/messages/new" : undefined}
        createLabel="Compose"
      />
      <MessagesTable data={rows} />
    </div>
  );
}
