import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, formatMoney } from "@/lib/format";
import { CoursePaymentsTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

/** How a payment was taken, in words. */
const PROVIDER_LABEL: Record<string, string> = {
  MONNIFY: "Monnify",
  PAYSTACK: "Paystack",
  FLUTTERWAVE: "Flutterwave",
  MANUAL: "Recorded by staff",
};

export default async function CoursePaymentsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_BILLING_READ.key);
  const [payments, formatContext] = await Promise.all([
    prisma.coursePayment.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        course: { select: { title: true } },
        client: { select: { email: true } },
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  // Dates and amounts are formatted here, in the academy's own locale and time
  // zone; the table is a Client Component and receives finished strings.

  const succeeded = payments.filter((p) => p.status === "SUCCESS");
  const currency = payments[0]?.currency ?? "NGN";
  const grossCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
  const payoutCents = succeeded.reduce((sum, p) => sum + (p.tenantPayoutCents ?? 0), 0);

  const rows = payments.map((p) => ({
    id: p.id,
    course: p.course.title,
    client: p.client.email,
    amount: formatMoney(p.amountCents, p.currency, formatContext.locale),
    payout: p.tenantPayoutCents != null ? formatMoney(p.tenantPayoutCents, p.currency, formatContext.locale) : "—",
    provider: PROVIDER_LABEL[p.provider] ?? p.provider,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    createdLabel: formatDate(p.createdAt, formatContext),
  }));

  return (
    <div>
      <DataTableToolbar
        title="Course payments"
        description="What learners have paid for your courses, and the share paid out to you."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon="check" label="Paid purchases" value={String(succeeded.length)} />
        <StatCard icon="credit-card" label="Total paid by learners" value={formatMoney(grossCents, currency, formatContext.locale)} />
        <StatCard icon="chart" label="Your share" value={formatMoney(payoutCents, currency, formatContext.locale)} />
      </div>
      <CoursePaymentsTable data={rows} />
    </div>
  );
}
