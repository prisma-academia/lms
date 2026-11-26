import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";
import { formatWholeAmount } from "../format";

export default async function PlatformAnalyticsPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_TENANTS_READ.key);

  // Platform context: these tenant-scoped models are queried cross-tenant.
  const [byStatus, tenantUsers, clients, courses, enrollments, coursePaid, platformPaid, topTenants] =
    await Promise.all([
      prisma.tenant.groupBy({ by: ["status"], _count: true }),
      prisma.tenantUser.count(),
      prisma.client.count(),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.coursePayment.aggregate({ where: { status: "SUCCESS" }, _sum: { amountCents: true } }),
      prisma.platformPayment.aggregate({ where: { status: "SUCCESS" }, _sum: { amountCents: true } }),
      prisma.tenant.findMany({
        take: 10,
        orderBy: { clients: { _count: "desc" } },
        select: { id: true, name: true, status: true, _count: { select: { clients: true, courses: true } } },
      }),
    ]);

  const totalTenants = byStatus.reduce((s, r) => s + r._count, 0);
  const activeTenants = byStatus.find((r) => r.status === "ACTIVE")?._count ?? 0;
  // Amounts are summed across academies and may mix currencies, so they are
  // shown as plain numbers rather than dressed up with one currency's symbol.
  const money = formatWholeAmount;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Totals across every academy on the platform." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="layers" label="Academies" value={String(totalTenants)} />
        <StatCard icon="check-circle" label="Active academies" value={String(activeTenants)} />
        <StatCard icon="users" label="Staff accounts" value={String(tenantUsers)} />
        <StatCard icon="user" label="Learners" value={String(clients)} />
        <StatCard icon="book" label="Courses" value={String(courses)} />
        <StatCard icon="chart" label="Enrollments" value={String(enrollments)} />
        <StatCard icon="credit-card" label="Course sales (all currencies)" value={money(coursePaid._sum.amountCents)} />
        <StatCard icon="trending-up" label="Subscription income (all currencies)" value={money(platformPaid._sum.amountCents)} />
      </div>

      <Card>
        <h2 className="mb-3 font-heading text-base leading-tight">Largest academies by learners</h2>
        {/* Capped viewport with a stuck header, like every other table in the app. */}
        <div className="max-h-[24rem] overflow-auto rounded-[10px] border-2 border-border [scrollbar-gutter:stable]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {["Academy", "Status", "Learners", "Courses"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="sticky top-0 z-10 bg-muted px-3 py-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topTenants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center font-medium text-muted-foreground">
                    No academies yet.
                  </td>
                </tr>
              ) : (
                topTenants.map((t) => (
                  <tr key={t.id} className="border-t-2 border-dashed border-border">
                    <td className="px-3 py-2 font-semibold">
                      <Link
                        href={`/tenants/${t.id}`}
                        className="rounded-[4px] underline-offset-4 outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{t.status}</td>
                    <td className="num px-3 py-2">{t._count.clients}</td>
                    <td className="num px-3 py-2">{t._count.courses}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
