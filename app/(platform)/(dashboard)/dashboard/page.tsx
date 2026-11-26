import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PageHeader, Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatActivityAction } from "@/lib/activity/display";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_FORMAT } from "../format";

export default async function PlatformOverviewPage() {
  await requirePlatformPage();
  const [tenantCount, activeTenantCount, userCount, recentLogs] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.platformUser.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Overview" subtitle="The platform at a glance." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/tenants" className="rounded-[14px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
          <StatCard icon="layers" label="Academies" value={String(tenantCount)} />
        </Link>
        <Link href="/tenants" className="rounded-[14px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
          <StatCard icon="check-circle" label="Active academies" value={String(activeTenantCount)} />
        </Link>
        <Link href="/users" className="rounded-[14px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring">
          <StatCard icon="users" label="Platform users" value={String(userCount)} />
        </Link>
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg leading-tight">Recent activity</h2>
        <Link
          href="/activity"
          className="rounded-[6px] text-[13px] font-bold underline underline-offset-4 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          See all activity
        </Link>
      </div>
      <Card className="p-0">
        {recentLogs.length === 0 ? (
          <EmptyState icon="clock" title="Nothing recorded yet">
            Sign-ins and changes across every academy are listed here as they happen.
          </EmptyState>
        ) : (
          <ul className="text-sm">
            {recentLogs.map((l, i) => (
              <li
                key={l.id}
                className={
                  "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-3" +
                  (i > 0 ? " border-t-2 border-dashed border-border" : "")
                }
              >
                <span className="min-w-0 font-bold text-foreground">{formatActivityAction(l.action)}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(l.createdAt, PLATFORM_FORMAT)} UTC
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
