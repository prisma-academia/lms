import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MessagesTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function MessagesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_MESSAGES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_MESSAGES_WRITE.key);
  const [messages, when] = await Promise.all([
    prisma.message.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { recipients: true } } },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = messages.map((m) => ({
    id: m.id,
    subject: m.subject,
    category: m.category,
    audience: m.audience,
    recipients: m._count.recipients,
    createdAt: m.createdAt.toISOString(),
    // Formatted here, in the academy's locale and time zone: the table is a
    // Client Component, and a date formatted there renders twice, differently.
    sentLabel: formatDateTime(m.createdAt, when),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Messages"
        description="Messages you have sent to learners. Each one reaches their inbox, their notification bell and, if they allow it, their email."
        createHref={canWrite ? "/admin/messages/new" : undefined}
        createLabel="Write a message"
      />
      <MessagesTable
        data={rows}
        empty={
          <EmptyState
            icon="mail"
            title="No messages sent yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/messages/new">Write a message</Link>
                </Button>
              ) : undefined
            }
          >
            Send an announcement to everyone, or a note to one learner or one group.
          </EmptyState>
        }
      />
    </div>
  );
}
