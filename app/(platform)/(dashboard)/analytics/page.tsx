import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { StatCard } from "@/components/ui/stat-card";

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
  const money = (cents: number | null | undefined) =>
    `${((cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Cross-tenant reporting across the whole platform." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="layers" label="Tenants" value={String(totalTenants)} />
        <StatCard icon="check-circle" label="Active tenants" value={String(activeTenants)} />
        <StatCard icon="users" label="Tenant users" value={String(tenantUsers)} />
        <StatCard icon="user" label="Clients" value={String(clients)} />
        <StatCard icon="book" label="Courses" value={String(courses)} />
        <StatCard icon="chart" label="Enrollments" value={String(enrollments)} />
        <StatCard icon="credit-card" label="Course revenue" value={money(coursePaid._sum.amountCents)} />
        <StatCard icon="trending-up" label="Platform revenue" value={money(platformPaid._sum.amountCents)} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase text-stone-500">Top tenants by clients</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-stone-500">
                <th className="py-2">Tenant</th>
                <th>Status</th>
                <th>Clients</th>
                <th>Courses</th>
              </tr>
            </thead>
            <tbody>
              {topTenants.map((t) => (
                <tr key={t.id} className="border-t border-ink/10">
                  <td className="py-2 font-semibold">{t.name}</td>
                  <td className="text-xs">{t.status}</td>
                  <td>{t._count.clients}</td>
                  <td>{t._count.courses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
