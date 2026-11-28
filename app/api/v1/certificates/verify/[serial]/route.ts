import { prisma } from "@/lib/db/client";
import { apiRoute } from "@/lib/api/v1/route";

/**
 * GET /api/v1/certificates/verify/{serial} — is this serial a real certificate
 * issued by this academy? Always 200; `valid` says. Only this academy's
 * certificates verify through its key.
 */
export const GET = apiRoute<{ serial: string }>({ scope: "certificates:read" }, async (ctx) => {
  const serial = decodeURIComponent(ctx.params.serial).trim().toUpperCase().slice(0, 64);
  const award = await prisma.certificateAward.findFirst({
    where: { tenantId: ctx.tenantId, serial },
    include: {
      certificate: { select: { name: true } },
      client: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!award) {
    return { data: { valid: false, serial, issuedAt: null, certificateName: null, learnerName: null, courseId: null, programmeId: null } };
  }
  const learnerName = `${award.client.firstName ?? ""} ${award.client.lastName ?? ""}`.trim() || award.client.email;
  return {
    data: {
      valid: true,
      serial: award.serial,
      issuedAt: award.issuedAt.toISOString(),
      certificateName: award.certificate.name,
      learnerName,
      courseId: award.courseId,
      programmeId: award.programmeId,
    },
  };
});
