import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { ProgrammesTable } from "./table";

export default async function ProgrammesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_PROGRAMMES_READ.key);
  const programmes = await prisma.programme.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { courses: true } } },
  });
  const rows = programmes.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    courseCount: p._count.courses,
    createdAt: p.createdAt.toISOString(),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Programmes"
        description="Bundle courses into a curriculum. Courses can be standalone or part of one or more programmes."
        createHref="/admin/programmes/new"
        createLabel="New programme"
      />
      <ProgrammesTable data={rows} />
    </div>
  );
}
