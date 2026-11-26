import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgrammesTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function ProgrammesPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_PROGRAMMES_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_PROGRAMMES_WRITE.key);
  const [programmes, when] = await Promise.all([
    prisma.programme.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { courses: true } } },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = programmes.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    courseCount: p._count.courses,
    createdAt: p.createdAt.toISOString(),
    createdLabel: formatDate(p.createdAt, when),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Programmes"
        description="A programme is a set of courses taken together, such as a certificate or a term. A course can belong to more than one."
        createHref={canWrite ? "/admin/programmes/new" : undefined}
        createLabel="New programme"
      />
      <ProgrammesTable
        data={rows}
        empty={
          <EmptyState
            icon="layers"
            title="No programmes yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/programmes/new">Create a programme</Link>
                </Button>
              ) : undefined
            }
          >
            Group courses into a programme so learners can enroll in all of them at once.
          </EmptyState>
        }
      />
    </div>
  );
}
