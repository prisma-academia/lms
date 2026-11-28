import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { encryptionConfigured } from "@/lib/crypto/secret-box";
import { listIntegrations } from "@/lib/integrations/store";
import { googleConfigured, googleRedirectUri } from "@/lib/integrations/google";
import { ssoRedirectUri } from "@/lib/integrations/sso";
import { feedStatus } from "@/lib/calendar/feeds";
import { PageHeader } from "@/components/shell";
import { IntegrationsHub } from "./hub";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_INTEGRATIONS_READ.key);
  const { google } = await searchParams;
  const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { slug: true } });
  const integrations = await listIntegrations(actor.tenantId);
  const canSeeCalendar = hasPermission(actor, PERMISSIONS.TENANT_EVENTS_READ.key);
  const feed = canSeeCalendar ? await feedStatus(actor.tenantId, { type: "TENANT", id: actor.userId }) : null;

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect the academy to the tools your team and learners already use. Credentials are encrypted; only staff who can manage integrations can change them."
      />
      <IntegrationsHub
        initial={integrations}
        canWrite={hasPermission(actor, PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key)}
        encryptionReady={encryptionConfigured()}
        googleReady={googleConfigured()}
        ssoRedirectUri={tenant ? ssoRedirectUri(tenant.slug) : ""}
        googleRedirectUri={googleRedirectUri()}
        staffFeed={feed}
        googleOutcome={google ?? null}
      />
    </div>
  );
}
