import { z } from "zod";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { resolveSettlementAccount } from "@/lib/billing/banks";

const Body = z.object({
  settlementBankCode: z.string().min(2).max(10),
  settlementAccountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    await requireTenantActor(PERMISSIONS.TENANT_BILLING_READ.key);
    const body = Body.parse(await request.json());
    const result = await resolveSettlementAccount({
      bankCode: body.settlementBankCode,
      accountNumber: body.settlementAccountNumber,
    });
    return ok({ accountName: result.accountName });
  } catch (e) {
    return handleError(e);
  }
}
