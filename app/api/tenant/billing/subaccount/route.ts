import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { provisionTenantSubaccounts } from "@/lib/billing/subaccount";

const Body = z.object({
  businessName: z.string().min(1).max(200),
  businessEmail: z.email().optional(),
  businessPhone: z.string().max(40).optional(),
  settlementBankCode: z.string().min(2).max(10),
  settlementAccountNumber: z.string().min(8).max(20),
  defaultProvider: z.enum(["paystack", "flutterwave"]).optional(),
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

    const subaccount = await prisma.tenantSubaccount.upsert({
      where: { tenantId: actor.tenantId },
      create: {
        tenantId: actor.tenantId,
        businessName: body.businessName,
        businessEmail: body.businessEmail ?? null,
        businessPhone: body.businessPhone ?? null,
        settlementBankCode: body.settlementBankCode,
        settlementAccountNumber: body.settlementAccountNumber,
        defaultProvider: body.defaultProvider === "paystack" ? "PAYSTACK" : body.defaultProvider === "flutterwave" ? "FLUTTERWAVE" : null,
        courseSalesEnabled: body.courseSalesEnabled ?? false,
      },
      update: {
        businessName: body.businessName,
        businessEmail: body.businessEmail ?? null,
        businessPhone: body.businessPhone ?? null,
        settlementBankCode: body.settlementBankCode,
        settlementAccountNumber: body.settlementAccountNumber,
        defaultProvider: body.defaultProvider === "paystack" ? "PAYSTACK" : body.defaultProvider === "flutterwave" ? "FLUTTERWAVE" : undefined,
        courseSalesEnabled: body.courseSalesEnabled,
        paystackStatus: "PENDING",
        flutterwaveStatus: "PENDING",
      },
    });

    const provisioned = await provisionTenantSubaccounts(actor.tenantId);
    return ok({ subaccount: provisioned });
  } catch (e) {
    return handleError(e);
  }
}
