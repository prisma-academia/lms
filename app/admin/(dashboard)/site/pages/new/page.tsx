import { redirect } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { findPageKind } from "@/lib/site/site-api";
import { SAVED_TEMPLATE_TYPE, toSavedTemplate } from "@/lib/site/saved-templates";
import { PageHeader, Card } from "@/components/shell";
import { NewPageFlow } from "./new-page-flow";

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const canWrite = hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key);
  if (!canWrite) redirect("/admin/site/pages");

  const raw = (await searchParams).kind;
  const wanted = findPageKind(Array.isArray(raw) ? raw[0] : raw).kind;

  const [existing, savedRows] = await Promise.all([
    // One design per built-in screen: the ones already made are edited, not made again.
    prisma.sitePage.findMany({
      where: { tenantId: actor.tenantId, kind: { not: "PAGE" } },
      select: { id: true, kind: true },
    }),
    prisma.template.findMany({
      where: { tenantId: actor.tenantId, type: SAVED_TEMPLATE_TYPE },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="New page"
        subtitle="Add a page to your site, or design one of its built-in screens."
        backHref="/admin/site/pages"
        backLabel="Site pages"
      />
      <Card>
        <NewPageFlow
          initialKind={wanted}
          existing={existing.map((p) => ({ id: p.id, kind: p.kind }))}
          saved={savedRows.map(toSavedTemplate).filter((row) => row.htmlSource.trim())}
        />
      </Card>
    </div>
  );
}
