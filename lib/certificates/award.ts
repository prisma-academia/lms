import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

export function makeSerial(): string {
  return `CERT-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/**
 * Issue certificate awards for every certificate template linked to a course,
 * to the given client. Idempotent (unique on certificate+client). Called when a
 * learner completes a course. Runs within the caller's tenant context.
 */
export async function awardCourseCompletion(
  tenantId: string,
  courseId: string,
  clientId: string
): Promise<number> {
  const certs = await prisma.certificate.findMany({ where: { courseId }, select: { id: true } });
  let issued = 0;
  for (const cert of certs) {
    await prisma.certificateAward.upsert({
      where: { certificateId_clientId: { certificateId: cert.id, clientId } },
      create: { tenantId, certificateId: cert.id, clientId, courseId, serial: makeSerial() },
      update: {},
    });
    issued += 1;
  }
  return issued;
}
