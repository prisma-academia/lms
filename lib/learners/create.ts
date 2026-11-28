import { prisma } from "@/lib/db/client";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { emitEvent } from "@/lib/integrations/events";
import type { ActorType } from "@/lib/generated/prisma/enums";

/**
 * Creating a learner on an academy's behalf — the one path shared by the admin
 * "New learner" route and the Developer API, so both apply the same rules:
 * email unique per academy (lower-cased), an audit row, and `learner.created`.
 *
 * No email is sent and no password is set: that is what the admin route has
 * always done. The learner signs in through "Forgot password", an admin reset,
 * or an API login link.
 */

export type LearnerInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  otherName?: string | null;
  phone?: string | null;
  externalId?: string | null;
};

export type ActingAs = {
  actorType: ActorType;
  actorId: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function createLearner(tenantId: string, input: LearnerInput, by: ActingAs) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.client.findUnique({
    where: { tenantId_email: { tenantId, email } },
    select: { id: true },
  });
  if (existing) throw new DomainError(409, "email_taken", "Client email already exists in this tenant.");
  if (input.externalId) {
    const taken = await prisma.client.findFirst({ where: { tenantId, externalId: input.externalId }, select: { id: true } });
    if (taken) throw new DomainError(409, "external_id_taken", "Another learner already has that externalId.");
  }
  const client = await prisma.client.create({
    data: {
      tenantId,
      email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      otherName: input.otherName ?? null,
      phone: input.phone ?? null,
      externalId: input.externalId ?? null,
    },
  });
  await audit({
    actorType: by.actorType,
    actorId: by.actorId,
    action: "client.create",
    tenantId,
    targetType: "Client",
    targetId: client.id,
    after: { email: client.email } as object,
    ip: by.ip ?? null,
    userAgent: by.userAgent ?? null,
  });
  await emitEvent(tenantId, "learner.created", { learnerId: client.id, source: by.actorType === "API_KEY" ? "api" : "staff" }, { learnerId: client.id });
  return client;
}
