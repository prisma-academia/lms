import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { formatDate } from "@/lib/format";
import { PLATFORM_FORMAT } from "../format";
import { TenantsTable } from "./table";

export default async function TenantsPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_TENANTS_READ.key);
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      trialEndsAt: true,
      companyEmail: true,
      createdAt: true,
    },
  });
  const rows = tenants.map((t) => ({
    ...t,
    trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
    trialEndsLabel: formatDate(t.trialEndsAt, PLATFORM_FORMAT),
    createdAt: t.createdAt.toISOString(),
    createdLabel: formatDate(t.createdAt, PLATFORM_FORMAT),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Academies"
        description="Every organisation on the platform. Open one to manage its plan, payouts and staff."
        createHref="/tenants/new"
        createLabel="New academy"
      />
      <TenantsTable data={rows} />
    </div>
  );
}
