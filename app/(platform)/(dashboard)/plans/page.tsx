import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { PlansTable } from "./table";

const GB = 1024 ** 3;

export default async function PlansPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_PLANS_READ.key);
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tenants: true } } },
  });
  const rows = plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    price: (p.priceMonthlyCents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: p.currency,
    }),
    storageGb: `${(Number(p.storageQuotaBytes) / GB).toFixed(0)} GB`,
    isPublic: p.isPublic ? "Public" : "Hidden",
    tenants: p._count.tenants,
  }));
  return (
    <div>
      <DataTableToolbar
        title="Subscription plans"
        description="Plans tenants can subscribe to."
        createHref="/plans/new"
        createLabel="New plan"
      />
      <PlansTable data={rows} />
    </div>
  );
}
