import Link from "next/link";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { ensureHomeSitePage, toRow } from "@/lib/site/pages";
import { SITE_PAGE_KINDS } from "@/lib/site/site-api";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UseStandardScreen } from "./kind-actions";

export default async function SitePagesAdminPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  await ensureHomeSitePage(actor.tenantId);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key);

  const [rows, layout] = await Promise.all([
    prisma.sitePage.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ isHome: "desc" }, { navOrder: "asc" }, { title: "asc" }],
    }),
    prisma.siteLayout.findUnique({
      where: { tenantId: actor.tenantId },
      select: { headerHtml: true, footerHtml: true },
    }),
  ]);
  const all = rows.map(toRow);
  const pages = all.filter((p) => p.kind === "PAGE");
  const screens = SITE_PAGE_KINDS.filter((k) => k.kind !== "PAGE").map((kind) => ({
    kind,
    page: all.find((p) => p.kind === kind.kind) ?? null,
  }));

  const ownHeader = Boolean(layout?.headerHtml.trim());
  const ownFooter = Boolean(layout?.footerHtml.trim());

  return (
    <div className="flex flex-col gap-6">
      <DataTableToolbar
        title="Site pages"
        description="Your public website: its pages, its header and footer, and the built-in screens you can redesign."
        createHref={canWrite ? "/admin/site/pages/new" : undefined}
        createLabel="New page"
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg">Header and footer</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Shown around every page.{" "}
              {ownHeader || ownFooter
                ? `You are using your own ${[ownHeader ? "header" : null, ownFooter ? "footer" : null].filter(Boolean).join(" and ")}.`
                : "You are using the standard ones, with Sign in and Register in the header."}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/site/layout">{canWrite ? "Edit header and footer" : "View header and footer"}</Link>
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-heading text-lg">Pages</h2>
        {pages.length === 0 ? (
          <EmptyState icon="globe" title="No pages yet">
            Add a page to start your site.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {pages.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/site/pages/${row.id}`}
                    className="break-words font-heading text-base outline-none hover:underline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <code translate="no" className="font-mono">
                      {row.isHome ? "/" : `/${row.slug}`}
                    </code>
                    {row.showInNav && !row.isHome ? " · in the menu" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.isHome ? <Badge color="var(--secondary)">Home</Badge> : null}
                  <Badge color={row.status === "PUBLISHED" ? "var(--success)" : "var(--muted)"}>
                    {row.status === "PUBLISHED" ? "Published" : "Draft"}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/site/pages/${row.id}`} aria-label={`${canWrite ? "Edit" : "View"} ${row.title}`}>
                      {canWrite ? "Edit" : "View"}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-heading text-lg">Built-in screens you can redesign</h2>
        <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">
          These work out of the box. Design your own and publish it to replace the standard one; go
          back whenever you like.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {screens.map(({ kind, page }) => {
            const live = page?.status === "PUBLISHED";
            return (
              <li key={kind.kind} className="flex flex-wrap items-center justify-between gap-3 py-3 last:pb-0">
                <div className="min-w-0">
                  <p className="font-heading text-base">{kind.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <code translate="no" className="font-mono">
                      {kind.path}
                    </code>{" "}
                    · {kind.purpose}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={live ? "var(--success)" : page ? "var(--warning)" : "var(--muted)"}>
                    {live ? "Your design is live" : page ? "Draft — standard screen in use" : "Standard screen"}
                  </Badge>
                  {page ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/site/pages/${page.id}`} aria-label={`${canWrite ? "Edit" : "View"} your ${kind.label.toLowerCase()}`}>
                        {canWrite ? "Edit" : "View"}
                      </Link>
                    </Button>
                  ) : canWrite ? (
                    <Button asChild size="sm">
                      <Link href={`/admin/site/pages/new?kind=${kind.kind}`} aria-label={`Design the ${kind.label.toLowerCase()}`}>
                        Design this page
                      </Link>
                    </Button>
                  ) : null}
                  {page && live && canWrite ? (
                    <UseStandardScreen pageId={page.id} label={kind.label.toLowerCase()} path={kind.path} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
