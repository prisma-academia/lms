import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { resolveSettlementAccount } from "@/lib/billing/banks";
import { activeGateway, payoutStatus } from "@/lib/billing/providers";
import { provisionTenantSubaccounts } from "@/lib/billing/subaccount";

const Body = z.object({
  businessName: z.string().min(1).max(200),
  businessEmail: z.email().optional(),
  businessPhone: z.string().max(40).optional(),
  settlementBankCode: z.string().min(2).max(10),
  settlementAccountNumber: z.string().regex(/^\d{10}$/, "Account number must be 10 digits"),
  // Sent by older pages that let an academy pick a gateway. The platform
  // chooses now, so this is accepted and not read.
  defaultProvider: z.string().optional(),
  courseSalesEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_BILLING_READ.key);
    const subaccount = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    return ok({ subaccount });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_BILLING_WRITE.key);
    const body = Body.parse(await request.json());

    const existing = await prisma.tenantSubaccount.findUnique({ where: { tenantId: actor.tenantId } });
    const bankChanged =
      !existing ||
      existing.settlementBankCode !== body.settlementBankCode ||
      existing.settlementAccountNumber !== body.settlementAccountNumber;

    // The account name is looked up here, not taken from the browser. It is
    // what the academy sees as confirmation of where its money will go, so it
    // has to be the bank's answer for exactly the details being saved. With no
    // gateway configured there is nobody to ask; the details are still saved,
    // and payouts simply cannot be switched on yet.
    let accountName = bankChanged ? null : (existing?.settlementAccountName ?? null);
    if (activeGateway() && !accountName) {
      accountName = (
        await resolveSettlementAccount({
          bankCode: body.settlementBankCode,
          accountNumber: body.settlementAccountNumber,
        })
      ).accountName;
    }

    const details = {
      businessName: body.businessName,
      businessEmail: body.businessEmail ?? null,
      businessPhone: body.businessPhone ?? null,
      settlementBankCode: body.settlementBankCode,
      settlementAccountNumber: body.settlementAccountNumber,
      settlementAccountName: accountName,
    };

    await prisma.tenantSubaccount.upsert({
      where: { tenantId: actor.tenantId },
      create: {
        tenantId: actor.tenantId,
        ...details,
        courseSalesEnabled: body.courseSalesEnabled ?? false,
      },
      update: {
        ...details,
        courseSalesEnabled: body.courseSalesEnabled,
        // A payout account belongs to one bank account. When that changes, the
        // old one must not go on receiving the academy's money — drop it, and
        // let provisioning register the new details. When it has not changed,
        // an active payout account is left exactly as it is.
        ...(bankChanged
          ? { monnifySubaccountCode: null, monnifyStatus: "PENDING" as const, monnifyProvisionedAt: null }
          : {}),
      },
    });

    const result = await provisionTenantSubaccounts(actor.tenantId);
    const status = result.gateway ? payoutStatus(result.subaccount, result.gateway) : "NOT_SET_UP";

    return ok({
      subaccount: result.subaccount,
      payouts: {
        active: status === "ACTIVE",
        status,
        // Why payouts are not active, in words for the person who pressed Save.
        problem: result.error,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
