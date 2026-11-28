import type { z } from "zod";
import { prisma } from "@/lib/db/client";
import { audit } from "@/lib/auth/audit";
import { DomainError } from "@/lib/api/errors";
import { revokeAllSessionsForUser } from "@/lib/auth/session";
import { createLearner, type ActingAs } from "@/lib/learners/create";
import { emitEvent } from "@/lib/integrations/events";
import type { LearnerCreate, LearnerPatch } from "./schemas";

type CreateInput = z.infer<typeof LearnerCreate>;
type PatchInput = z.infer<typeof LearnerPatch>;

export async function findLearner(tenantId: string, id: string) {
  const row = await prisma.client.findFirst({ where: { id, tenantId } });
  if (!row) throw new DomainError(404, "not_found", "Learner not found.");
  return row;
}

/** Apply a partial update. Emails stay unique per academy (lower-cased). */
export async function updateLearner(tenantId: string, id: string, patch: PatchInput, by: ActingAs) {
  const before = await findLearner(tenantId, id);
  const data: Record<string, unknown> = {};
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (email !== before.email) {
      const taken = await prisma.client.findFirst({ where: { tenantId, email, NOT: { id } }, select: { id: true } });
      if (taken) throw new DomainError(409, "email_taken", "Another learner already uses that email.");
      data.email = email;
    }
  }
  for (const f of ["firstName", "lastName", "otherName", "phone"] as const) {
    if (patch[f] !== undefined && patch[f] !== before[f]) data[f] = patch[f];
  }
  if (patch.externalId !== undefined && patch.externalId !== before.externalId) {
    if (patch.externalId) {
      const taken = await prisma.client.findFirst({ where: { tenantId, externalId: patch.externalId, NOT: { id } }, select: { id: true } });
      if (taken) throw new DomainError(409, "external_id_taken", "Another learner already has that externalId.");
    }
    data.externalId = patch.externalId;
  }
  if (Object.keys(data).length === 0) return { learner: before, changed: [] as string[] };
  const learner = await prisma.client.update({ where: { id }, data });
  const changed = Object.keys(data);
  await audit({
    actorType: by.actorType,
    actorId: by.actorId,
    action: "client.update",
    tenantId,
    targetType: "Client",
    targetId: id,
    before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k] ?? null])),
    after: Object.fromEntries(changed.map((k) => [k, data[k] ?? null])),
    ip: by.ip ?? null,
    userAgent: by.userAgent ?? null,
  });
  await emitEvent(tenantId, "learner.updated", { learnerId: id, changed }, { learnerId: id });
  return { learner, changed };
}

export async function setLearnerStatus(tenantId: string, id: string, status: "ACTIVE" | "SUSPENDED", by: ActingAs) {
  const before = await findLearner(tenantId, id);
  if (before.status === status) return before;
  const learner = await prisma.client.update({ where: { id }, data: { status } });
  // A suspended learner is signed out everywhere, immediately.
  if (status === "SUSPENDED") await revokeAllSessionsForUser("CLIENT", id);
  await audit({
    actorType: by.actorType,
    actorId: by.actorId,
    action: status === "SUSPENDED" ? "client.suspend" : "client.reactivate",
    tenantId,
    targetType: "Client",
    targetId: id,
    before: { status: before.status },
    after: { status },
    ip: by.ip ?? null,
    userAgent: by.userAgent ?? null,
  });
  await emitEvent(tenantId, "learner.updated", { learnerId: id, changed: ["status"], status }, { learnerId: id });
  return learner;
}

/**
 * Upsert keyed on externalId. A learner who already exists by email but has
 * no externalId yet is adopted (the first sync from a portal links accounts
 * made by hand); one who has a DIFFERENT externalId is a conflict.
 */
export async function upsertByExternalId(
  tenantId: string,
  externalId: string,
  input: Omit<CreateInput, "externalId">,
  by: ActingAs
): Promise<{ learner: Awaited<ReturnType<typeof findLearner>>; created: boolean }> {
  const byExternal = await prisma.client.findFirst({ where: { tenantId, externalId } });
  if (byExternal) {
    const { learner } = await updateLearner(tenantId, byExternal.id, { ...input }, by);
    return { learner, created: false };
  }
  const email = input.email.trim().toLowerCase();
  const byEmail = await prisma.client.findFirst({ where: { tenantId, email } });
  if (byEmail) {
    if (byEmail.externalId && byEmail.externalId !== externalId) {
      throw new DomainError(409, "email_taken", "A learner with that email is linked to a different externalId.");
    }
    const { learner } = await updateLearner(tenantId, byEmail.id, { ...input, externalId }, by);
    return { learner, created: false };
  }
  const learner = await createLearner(tenantId, { ...input, externalId }, by);
  return { learner, created: true };
}
