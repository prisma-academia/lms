import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientsTable } from "./table";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function ClientsPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CLIENTS_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_CLIENTS_WRITE.key);
  const [clients, when] = await Promise.all([
    prisma.client.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
      },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const rows = clients.map((c) => ({
    ...c,
    lastLoginAt: c.lastLoginAt?.toISOString() ?? null,
    // Formatted here, in the academy's locale and time zone: the table is a
    // Client Component, and a date formatted there renders twice, differently.
    lastLoginLabel: formatDateTime(c.lastLoginAt, when, "Never"),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Learners"
        description="Everyone with a learner account at this academy."
        createHref={canWrite ? "/admin/clients/new" : undefined}
        createLabel="New learner"
      />
      <ClientsTable
        data={rows}
        empty={
          <EmptyState
            icon="cap"
            title="No learners yet"
            action={
              canWrite ? (
                <Button asChild>
                  <Link href="/admin/clients/new">New learner</Link>
                </Button>
              ) : undefined
            }
          >
            Learners appear here when they register, or when you add them yourself.
          </EmptyState>
        }
      />
    </div>
  );
}
