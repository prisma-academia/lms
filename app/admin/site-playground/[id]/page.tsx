import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { toRow } from "@/lib/site/pages";
import { aiStatus } from "@/lib/ai/config";
import { SitePlayground } from "./playground";

/**
 * The immersive site builder: a full-viewport editor and live preview.
 *
 * Lives outside the `(dashboard)` route group on purpose — the same reason
 * `/admin/preview/site/[id]` does. The dashboard layout wraps its children in a
 * sidebar, a header and a max-width container, all of which are exactly what an
 * author does not want while writing a full-page document. Escaping the group is
 * what buys the full viewport; there is no CSS trick that does it honestly.
 *
 * Still admin-only: `/admin/*` is session-gated by the proxy, and
 * TENANT_SITE_READ is enforced here. Editing additionally needs
 * TENANT_SITE_WRITE, checked here and again on every API call.
 */
export const dynamic = "force-dynamic";

export default async function SitePlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SITE_READ.key);
  const { id } = await params;

  const page = await prisma.sitePage.findFirst({
    where: { id, tenantId: actor.tenantId },
  });
  if (!page) notFound();

  return (
    <SitePlayground
      page={toRow(page)}
      canWrite={hasPermission(actor, PERMISSIONS.TENANT_SITE_WRITE.key)}
      aiConfigured={aiStatus().configured}
    />
  );
}
