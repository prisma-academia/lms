import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { StatCard } from "@/components/ui/stat-card";
import { CoursePaymentsTable } from "./table";

export default async function CoursePaymentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_BILLING_READ.key);
  const payments = await prisma.coursePayment.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      course: { select: { title: true } },
      client: { select: { email: true } },
    },
  });

  const succeeded = payments.filter((p) => p.status === "SUCCESS");
  const currency = payments[0]?.currency ?? "NGN";
  const grossCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
  const payoutCents = succeeded.reduce((sum, p) => sum + (p.tenantPayoutCents ?? 0), 0);
  const fmt = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { style: "currency", currency });

  const rows = payments.map((p) => ({
    id: p.id,
    course: p.course.title,
    client: p.client.email,
    amount: (p.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: p.currency }),
    payout:
      p.tenantPayoutCents != null
        ? (p.tenantPayoutCents / 100).toLocaleString(undefined, { style: "currency", currency: p.currency })
        : "—",
    provider: p.provider,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div>
      <DataTableToolbar title="Course payments" description="Learner course purchases and payouts." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="check" label="Successful payments" value={String(succeeded.length)} />
        <StatCard icon="credit-card" label="Gross revenue" value={fmt(grossCents)} />
        <StatCard icon="chart" label="Your payout" value={fmt(payoutCents)} />
      </div>
      <CoursePaymentsTable data={rows} />
    </div>
  );
}
