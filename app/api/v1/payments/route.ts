import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { PaymentListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

const SELECT = {
  id: true,
  clientId: true,
  provider: true,
  amountCents: true,
  currency: true,
  status: true,
  externalRef: true,
  createdAt: true,
  completedAt: true,
} as const;

/** GET /api/v1/payments?type=course|programme — online purchases. Read-only. */
export const GET = apiRoute({ scope: "payments:read" }, async (ctx) => {
  const q = ctx.query(PaymentListQuery);
  const where = {
    tenantId: ctx.tenantId,
    ...sinceFilter(q, "createdAt"),
    ...(q.status ? { status: q.status } : {}),
    ...(q.learner_id ? { clientId: q.learner_id } : {}),
  };
  if (q.type === "programme") {
    const rows = await prisma.programmePayment.findMany({ where, select: { ...SELECT, programmeId: true }, ...pageArgs(q, "createdAt") });
    return page(rows, q, (p) => out.payment("programme", p));
  }
  const rows = await prisma.coursePayment.findMany({ where, select: { ...SELECT, courseId: true }, ...pageArgs(q, "createdAt") });
  return page(rows, q, (p) => out.payment("course", p));
});
