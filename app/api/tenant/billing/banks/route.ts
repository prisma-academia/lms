import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { listSettlementBanks } from "@/lib/billing/banks";

export async function GET() {
  try {
    await requireTenantActor(PERMISSIONS.TENANT_BILLING_READ.key);
    const banks = await listSettlementBanks();
    return ok({ banks });
  } catch (e) {
    return handleError(e);
  }
}
