import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { PageHeader } from "@/components/shell";
import { listEndpoints, listKeys } from "@/lib/developers/admin";
import { encryptionConfigured } from "@/lib/crypto/secret-box";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { DevelopersPortal, type PortalTab } from "./developers-portal";

const TABS: PortalTab[] = ["keys", "webhooks", "logs", "usage", "docs"];

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
  const [{ tab }, keys, endpoints, tenant] = await Promise.all([
    searchParams,
    listKeys(actor.tenantId),
    listEndpoints(actor.tenantId),
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { slug: true } }),
  ]);
  const initialTab = TABS.includes(tab as PortalTab) ? (tab as PortalTab) : "keys";

  return (
    <div>
      <PageHeader
        title="Developers"
        subtitle="API keys, webhooks and the API reference — connect a school portal, HR or CRM system, Zapier, Make or n8n."
      />
      <DevelopersPortal
        initialTab={initialTab}
        initialKeys={keys}
        initialEndpoints={endpoints}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_DEVELOPERS_WRITE.key)}
        apiBase={`${tenantHttpOrigin(tenant?.slug ?? "")}/api/v1`}
        webhooksAvailable={encryptionConfigured()}
      />
    </div>
  );
}
