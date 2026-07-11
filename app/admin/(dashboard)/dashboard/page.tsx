import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PageHeader, Card } from "@/components/shell";

export default async function AdminOverviewPage() {
  const actor = await requireTenantPage();

  const [userCount, learnerCount, courseCount, enrollmentCount, recent] = await Promise.all([
    prisma.tenantUser.count({ where: { tenantId: actor.tenantId } }),
    prisma.client.count({ where: { tenantId: actor.tenantId } }),
    prisma.course.count({ where: { tenantId: actor.tenantId, status: "PUBLISHED" } }),
    prisma.enrollment.count({ where: { tenantId: actor.tenantId } }),
    prisma.activityLog.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Overview" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-stone-500">Instructors</div>
          <div className="mt-1 text-2xl font-semibold">{userCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">Learners</div>
          <div className="mt-1 text-2xl font-semibold">{learnerCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">Published courses</div>
          <div className="mt-1 text-2xl font-semibold">{courseCount}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-stone-500">Enrollments</div>
          <div className="mt-1 text-2xl font-semibold">{enrollmentCount}</div>
        </Card>
      </div>
      <h2 className="mt-8 mb-2 text-sm font-semibold uppercase text-stone-500">Recent activity</h2>
      <Card>
        <ul className="divide-y divide-stone-100 text-sm">
          {recent.length === 0 ? (
            <li className="py-3 text-stone-500">No activity yet.</li>
          ) : (
            recent.map((l) => (
              <li key={l.id} className="flex justify-between py-2">
                <span className="font-mono text-xs">{l.action}</span>
                <span className="text-xs text-stone-500">{l.createdAt.toISOString()}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
