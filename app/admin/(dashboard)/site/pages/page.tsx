import Link from "next/link";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { ensureHomeSitePage, toRow } from "@/lib/site/pages";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function SitePagesAdminPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  await ensureHomeSitePage(actor.tenantId);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key);

  const pages = await prisma.sitePage.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: [{ isHome: "desc" }, { navOrder: "asc" }, { title: "asc" }],
  });

  return (
    <div>
      <DataTableToolbar
        title="Site pages"
        description="Customize your public landing site and extra pages."
        createHref={canWrite ? "/admin/site/pages/new" : undefined}
        createLabel="New page"
      />
      <Card>
        <ul className="divide-y divide-border">
          {pages.map((p) => {
            const row = toRow(p);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/site/pages/${p.id}`}
                    className="font-heading text-base hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {row.isHome ? "/" : `/${row.slug}`} · {row.blocks.length} blocks
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.isHome ? (
                    <Badge color="var(--secondary)">Home</Badge>
                  ) : null}
                  <Badge
                    color={
                      row.status === "PUBLISHED" ? "var(--success)" : "var(--muted)"
                    }
                  >
                    {row.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/site/pages/${p.id}`}>Edit</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
