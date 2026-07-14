import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_MESSAGES_READ.key);
  const { id } = await params;
  const message = await prisma.message.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { _count: { select: { recipients: true } } },
  });
  if (!message) notFound();

  const readCount = await prisma.messageRecipient.count({
    where: { messageId: id, readAt: { not: null } },
  });

  return (
    <div>
      <PageHeader
        title={message.subject}
        subtitle={`${message.category} · ${message.audience} · sent ${message.createdAt.toLocaleString()}`}
        backHref="/admin/messages"
        backLabel="Messages"
      />
      <Card className="mb-4">
        <div className="whitespace-pre-wrap text-sm text-ink/90">{message.body}</div>
      </Card>
      <Card>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-stone-500">Recipients</span>
          <span className="font-semibold">{message._count.recipients}</span>
          <span className="text-stone-500">Read</span>
          <span className="font-semibold">
            {readCount} / {message._count.recipients}
          </span>
        </div>
      </Card>
    </div>
  );
}
