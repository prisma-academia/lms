import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { makeSerial } from "@/lib/certificates/award";

const IssueBody = z.object({ clientId: z.string().min(1) });

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_READ.key);
    const { id } = await ctx.params;
    const certificate = await prisma.certificate.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!certificate) throw new DomainError(404, "not_found", "Certificate not found.");
    const awards = await prisma.certificateAward.findMany({
      where: { certificateId: id },
      orderBy: { issuedAt: "desc" },
      include: { client: { select: { email: true, firstName: true, lastName: true } } },
    });
    return ok({ awards });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
    const { id } = await ctx.params;
    const { clientId } = IssueBody.parse(await request.json());
    const meta = requestMeta(request);

    const certificate = await prisma.certificate.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!certificate) throw new DomainError(404, "not_found", "Certificate not found.");

    const client = await prisma.client.findFirst({ where: { id: clientId, tenantId: actor.tenantId } });
    if (!client) throw new DomainError(404, "not_found", "Learner not found.");

    const award = await prisma.certificateAward.upsert({
      where: { certificateId_clientId: { certificateId: id, clientId } },
      create: {
        tenantId: actor.tenantId,
        certificateId: id,
        clientId,
        courseId: certificate.courseId,
        programmeId: certificate.programmeId,
        serial: makeSerial(),
      },
      update: {},
    });
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "certificate.award",
      tenantId: actor.tenantId,
      targetType: "CertificateAward",
      targetId: award.id,
      after: { clientId, serial: award.serial } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ award }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}
