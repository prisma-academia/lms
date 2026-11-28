import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";
import { AwardListQuery } from "@/lib/api/v1/schemas";
import { page, pageArgs, sinceFilter } from "@/lib/api/v1/list";
import * as out from "@/lib/api/v1/serialize";

/** GET /api/v1/certificates/awards — issued certificates; `updated_since` filters on the issue time. */
export const GET = apiRoute({ scope: "certificates:read" }, async (ctx) => {
  const q = ctx.query(AwardListQuery);
  const rows = await prisma.certificateAward.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...sinceFilter(q, "issuedAt"),
      ...(q.learner_id ? { clientId: q.learner_id } : {}),
      ...(q.certificate_id ? { certificateId: q.certificate_id } : {}),
    },
    include: { certificate: { select: { name: true } } },
    ...pageArgs(q, "issuedAt"),
  });
  return page(rows, q, out.award);
});
