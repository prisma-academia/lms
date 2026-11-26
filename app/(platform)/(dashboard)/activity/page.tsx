import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shell";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_FORMAT } from "../format";
import { ActivityTable } from "./table";

export default async function PlatformActivityPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_ACTIVITY_READ.key);
  const rows = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const data = rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    actorType: r.actorType,
    actorId: r.actorId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    createdLabel: formatDateTime(r.createdAt, PLATFORM_FORMAT),
  }));
  return (
    <div>
      <PageHeader
        title="System activity"
        subtitle="The 200 most recent actions across every academy. Times are in UTC."
      />
      <ActivityTable data={data} />
    </div>
  );
}
