import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { markError, markOk, openSecrets, toView } from "@/lib/integrations/store";
import { isAlertProvider, isSsoProvider } from "@/lib/integrations/registry";
import { sendTestAlert } from "@/lib/integrations/alerts";
import { zoomWhoAmI } from "@/lib/integrations/zoom";
import { zoomCredsOf } from "@/lib/integrations/meetings";
import { googlePrimaryCalendar } from "@/lib/integrations/google";
import { ensureDiscovery } from "@/lib/integrations/sso";

/**
 * POST — "Send test" / "Test connection". Alert channels get a test message;
 * Zoom and Google are asked who we are connected as; SSO re-reads the
 * provider's OpenID configuration. The outcome is saved on the row either way.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_INTEGRATIONS_WRITE.key);
    const { id } = await ctx.params;
    const row = await prisma.tenantIntegration.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!row) throw new DomainError(404, "not_found", "Integration not found.");

    let success: boolean;
    let message: string;
    if (isAlertProvider(row.provider)) {
      const error = await sendTestAlert(row);
      success = !error;
      message = error ?? "Test message sent. Check the channel.";
    } else {
      try {
        if (row.provider === "zoom") {
          const me = await zoomWhoAmI(zoomCredsOf(row));
          message = `Connected to Zoom${me.email ? ` as ${me.email}` : ""}.`;
        } else if (row.provider === "google_calendar") {
          const token = openSecrets(row).refreshToken;
          if (!token) throw new Error("No Google token saved. Connect again.");
          const cal = await googlePrimaryCalendar(token);
          message = `Connected to Google Calendar${cal.id ? ` (${cal.id})` : ""}.`;
        } else if (isSsoProvider(row.provider)) {
          const doc = await ensureDiscovery(row, { fresh: true });
          message = `The provider answered. Issuer: ${doc.issuer}. Try it from the sign-in page.`;
        } else {
          throw new DomainError(400, "not_testable", "Nothing to test for this integration.");
        }
        success = true;
        await markOk(row.id);
      } catch (err) {
        if (err instanceof DomainError) throw err;
        success = false;
        message = err instanceof Error ? err.message : "The test failed.";
        await markError(row.id, message);
      }
    }
    const fresh = await prisma.tenantIntegration.findFirst({ where: { id: row.id, tenantId: actor.tenantId } });
    return ok({ success, message, integration: fresh ? toView(fresh) : null });
  } catch (e) {
    return handleError(e);
  }
}
