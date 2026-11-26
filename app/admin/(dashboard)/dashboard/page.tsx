import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatActivityAction } from "@/lib/activity/display";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { IconName } from "@/components/icon";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function AdminOverviewPage() {
  const actor = await requireTenantPage();

  const [userCount, learnerCount, courseCount, enrollmentCount, recent, when] = await Promise.all([
    prisma.tenantUser.count({ where: { tenantId: actor.tenantId } }),
    prisma.client.count({ where: { tenantId: actor.tenantId } }),
    prisma.course.count({ where: { tenantId: actor.tenantId, status: "PUBLISHED" } }),
    prisma.enrollment.count({ where: { tenantId: actor.tenantId } }),
    prisma.activityLog.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  // Times are shown in the academy's own locale and time zone, so everyone on
  // the team reads the same clock whatever machine the server runs on.

  // Each figure links to the list behind it — but only for people who may open
  // that list, so the card never leads to a "no access" page.
  const stats: {
    label: string;
    value: number;
    icon: IconName;
    iconBg: string;
    href: string | null;
  }[] = [
    {
      label: "Staff",
      value: userCount,
      icon: "users",
      iconBg: "var(--chart-1)",
      href: hasPermission(actor, PERMISSIONS.TENANT_USERS_READ.key) ? "/admin/users" : null,
    },
    {
      label: "Learners",
      value: learnerCount,
      icon: "cap",
      iconBg: "var(--chart-2)",
      href: hasPermission(actor, PERMISSIONS.TENANT_CLIENTS_READ.key) ? "/admin/clients" : null,
    },
    {
      label: "Published courses",
      value: courseCount,
      icon: "book",
      iconBg: "var(--chart-3)",
      href: hasPermission(actor, PERMISSIONS.TENANT_COURSES_READ.key) ? "/admin/courses" : null,
    },
    {
      label: "Enrollments",
      value: enrollmentCount,
      icon: "clipboard",
      iconBg: "var(--chart-4)",
      href: hasPermission(actor, PERMISSIONS.TENANT_ENROLLMENTS_READ.key) ? "/admin/enrollments" : null,
    },
  ];

  const canCreateCourse = hasPermission(actor, PERMISSIONS.TENANT_COURSES_WRITE.key);

  return (
    <div>
      <PageHeader title="Overview" subtitle="Your academy at a glance." />

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <StatCard
              icon={stat.icon}
              iconBg={stat.iconBg}
              value={stat.value.toLocaleString("en")}
              label={stat.label}
              className="h-full"
            />
          );
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              aria-label={`${stat.label}: ${stat.value}. Open the list.`}
              className="rounded-[14px] outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 font-heading text-lg leading-tight">Recent activity</h2>
      <Card className={recent.length === 0 ? "p-2" : undefined}>
        {recent.length === 0 ? (
          <EmptyState
            icon="clock"
            title="Nothing has happened yet"
            action={
              canCreateCourse ? (
                <Button asChild>
                  <Link href="/admin/courses/new">Create your first course</Link>
                </Button>
              ) : undefined
            }
          >
            Sign-ins, new courses, enrollments and grades will be listed here as they happen.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 font-medium text-foreground">
                  {formatActivityAction(entry.action)}
                </span>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="num shrink-0 text-xs font-medium text-muted-foreground"
                >
                  {formatDateTime(entry.createdAt, when)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
