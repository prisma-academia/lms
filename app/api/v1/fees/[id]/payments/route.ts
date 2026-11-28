import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { DomainError } from "@/lib/api/errors";
import { ListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/fees/{id}/payments — who has paid this fee. Read-only. */
export const GET = apiRoute<{ id: string }>({ scope: "payments:read" }, async (ctx) => {
  const q = ctx.query(ListQuery);
  const fee = await prisma.fee.findFirst({ where: { id: ctx.params.id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!fee) throw new DomainError(404, "not_found", "Fee not found.");
  const rows = await prisma.feePayment.findMany({
    where: { tenantId: ctx.tenantId, feeId: fee.id, ...sinceFilter(q, "updatedAt") },
    ...pageArgs(q, "updatedAt"),
  });
  return page(rows, q, out.feePayment);
});
