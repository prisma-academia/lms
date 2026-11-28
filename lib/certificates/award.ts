import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { emitEvent } from "@/lib/integrations/events";

export function makeSerial(): string {
  return `CERT-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/**
 * Issue certificate awards for every template linked to a course, to the given
 * client. Idempotent — `certificateId_clientId` is unique, so re-completing a
 * course never mints a second serial. Called when a learner completes a course.
 * Runs within the caller's tenant context.
 *
 * Returns the number of awards actually created, not the number of templates
 * considered. The difference matters: on every completion after the first, the
 * honest answer is zero, and a caller that logs or reports this would otherwise
 * claim a certificate was issued each time a learner revisits a finished course.
 */
export async function awardCourseCompletion(
  tenantId: string,
  courseId: string,
  clientId: string
): Promise<number> {
  const certs = await prisma.certificate.findMany({ where: { courseId }, select: { id: true } });
  let issued = 0;
  for (const cert of certs) {
    issued += await upsertAward({ tenantId, certificateId: cert.id, clientId, courseId });
  }
  return issued;
}

/**
 * Issue awards for a completed programme.
 *
 * This did not exist, which made a programme-scoped `Certificate` unreachable:
 * `awardCourseCompletion` matches on `courseId` only, so the only way one could
 * ever be handed out was an admin issuing it by hand from the awards panel.
 */
export async function awardProgrammeCompletion(
  tenantId: string,
  programmeId: string,
  clientId: string
): Promise<number> {
  const certs = await prisma.certificate.findMany({
    where: { programmeId },
    select: { id: true },
  });
  let issued = 0;
  for (const cert of certs) {
    issued += await upsertAward({ tenantId, certificateId: cert.id, clientId, programmeId });
  }
  return issued;
}

async function upsertAward(input: {
  tenantId: string;
  certificateId: string;
  clientId: string;
  courseId?: string;
  programmeId?: string;
}): Promise<number> {
  const existing = await prisma.certificateAward.findUnique({
    where: {
      certificateId_clientId: {
        certificateId: input.certificateId,
        clientId: input.clientId,
      },
    },
    select: { id: true },
  });
  if (existing) return 0;

  const award = await prisma.certificateAward.upsert({
    where: {
      certificateId_clientId: {
        certificateId: input.certificateId,
        clientId: input.clientId,
      },
    },
    create: {
      tenantId: input.tenantId,
      certificateId: input.certificateId,
      clientId: input.clientId,
      courseId: input.courseId ?? null,
      programmeId: input.programmeId ?? null,
      serial: makeSerial(),
    },
    // Still an upsert, not a create: two concurrent completion requests would
    // otherwise race past the check above and one would fail on the unique index.
    update: {},
  });
  // Webhook; never throws, deferred past the response.
  await emitEvent(
    input.tenantId,
    "certificate.issued",
    {
      awardId: award.id,
      certificateId: award.certificateId,
      learnerId: award.clientId,
      courseId: award.courseId,
      programmeId: award.programmeId,
      serial: award.serial,
      issuedAt: award.issuedAt.toISOString(),
    },
    { learnerId: award.clientId }
  );
  return 1;
}

/**
 * Mark a programme finished when every required course in it is complete, and
 * issue its certificates.
 *
 * Called after a course completion, because a programme has no completion event
 * of its own — finishing its last required course *is* the event.
 * `ProgrammeEnrollment.completedAt` was previously never written by anything.
 */
export async function syncProgrammeCompletion(
  tenantId: string,
  courseId: string,
  clientId: string
): Promise<void> {
  const memberships = await prisma.programmeCourse.findMany({
    where: { courseId },
    select: { programmeId: true },
  });
  if (memberships.length === 0) return;

  for (const { programmeId } of memberships) {
    const enrollment = await prisma.programmeEnrollment.findUnique({
      where: { programmeId_clientId: { programmeId, clientId } },
      select: { id: true, completedAt: true },
    });
    // Not enrolled in the programme, or already finished it — nothing to do.
    if (!enrollment || enrollment.completedAt) continue;

    const required = await prisma.programmeCourse.findMany({
      where: { programmeId, required: true },
      select: { courseId: true },
    });
    if (required.length === 0) continue;

    const done = await prisma.enrollment.count({
      where: {
        clientId,
        courseId: { in: required.map((c) => c.courseId) },
        completedAt: { not: null },
      },
    });
    if (done < required.length) continue;

    await prisma.programmeEnrollment.update({
      where: { id: enrollment.id },
      data: { completedAt: new Date() },
    });
    await awardProgrammeCompletion(tenantId, programmeId, clientId);
  }
}

/**
 * Issue one specific certificate to a learner (an exam's "award on pass"
 * certificate, for example). Idempotent: a second call issues nothing.
 */
export async function awardCertificate(
  tenantId: string,
  certificateId: string,
  clientId: string,
  opts: { courseId?: string | null } = {}
): Promise<number> {
  return upsertAward({ tenantId, certificateId, clientId, courseId: opts.courseId ?? undefined });
}
