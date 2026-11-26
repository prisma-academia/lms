import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { tenantFormatContext } from "@/lib/tenant/format-context";

const CATEGORY_LABELS: Record<string, string> = {
  MESSAGE: "Message",
  ANNOUNCEMENT: "Announcement",
  REMINDER: "Reminder",
};

const AUDIENCE_LABELS: Record<string, string> = {
  ALL: "all learners",
  CLIENT: "one learner",
  GROUP: "a learner group",
};

export default async function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_MESSAGES_READ.key);
  const { id } = await params;
  const [message, when] = await Promise.all([
    prisma.message.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { _count: { select: { recipients: true } } },
    }),
    tenantFormatContext(actor.tenantId),
  ]);
  if (!message) notFound();

  const readCount = await prisma.messageRecipient.count({
    where: { messageId: id, readAt: { not: null } },
  });

  const total = message._count.recipients;
  const readPercent = total > 0 ? Math.round((readCount / total) * 100) : 0;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={message.subject}
        subtitle={`Sent to ${AUDIENCE_LABELS[message.audience] ?? message.audience.toLowerCase()} on ${formatDateTime(message.createdAt, when)}`}
        backHref="/admin/messages"
        backLabel="Messages"
      />
      <Card className="mb-4">
        <Badge>{CATEGORY_LABELS[message.category] ?? message.category}</Badge>
        <div className="mt-3 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-foreground">
          {message.body}
        </div>
      </Card>
      <Card>
        <h2 className="font-heading text-lg leading-tight">Who has read it</h2>
        <p className="num mt-2 text-sm font-medium text-foreground">
          <span className="font-bold">
            {readCount} of {total}
          </span>{" "}
          {total === 1 ? "recipient has" : "recipients have"} opened this message
          {total > 0 ? ` (${readPercent}%)` : ""}.
        </p>
        {total > 0 ? (
          // The sentence above carries the numbers; the bar is the same value drawn.
          <div aria-hidden className="mt-3 h-2.5 overflow-hidden rounded-full border border-border bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${readPercent}%` }} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
