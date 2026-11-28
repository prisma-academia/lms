import type { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import type { EventCreate } from "./schemas";

type In = Partial<z.infer<typeof EventCreate>>;

/**
 * Check an event's audience against its target, as the admin calendar does:
 * ALL has no target, CLIENT one learner, GROUP one group — each in this academy.
 */
export async function checkAudience(tenantId: string, e: { audience: string; learnerId: string | null; groupId: string | null }) {
  const ok =
    (e.audience === "ALL" && !e.learnerId && !e.groupId) ||
    (e.audience === "CLIENT" && !!e.learnerId && !e.groupId) ||
    (e.audience === "GROUP" && !!e.groupId && !e.learnerId);
  if (!ok) throw new DomainError(400, "validation_error", "audience: the target does not match the audience (ALL: none, CLIENT: learnerId, GROUP: groupId).");
  if (e.learnerId) {
    const c = await prisma.client.findFirst({ where: { id: e.learnerId, tenantId }, select: { id: true } });
    if (!c) throw new DomainError(400, "invalid_target", "Learner not found in this academy.");
  }
  if (e.groupId) {
    const g = await prisma.clientGroup.findFirst({ where: { id: e.groupId, tenantId }, select: { id: true } });
    if (!g) throw new DomainError(400, "invalid_target", "Group not found in this academy.");
  }
}

/** API body → Prisma data (only the fields present). */
export function eventData(b: In) {
  const date = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));
  return {
    ...(b.title !== undefined ? { title: b.title } : {}),
    ...(b.description !== undefined ? { description: b.description } : {}),
    ...(b.type !== undefined ? { type: b.type } : {}),
    ...(b.startAt !== undefined ? { startAt: new Date(b.startAt) } : {}),
    ...(b.endAt !== undefined ? { endAt: date(b.endAt) } : {}),
    ...(b.location !== undefined ? { location: b.location } : {}),
    ...(b.url !== undefined ? { url: b.url } : {}),
    ...(b.audience !== undefined ? { audience: b.audience } : {}),
    ...(b.learnerId !== undefined ? { clientId: b.learnerId } : {}),
    ...(b.groupId !== undefined ? { clientGroupId: b.groupId } : {}),
    ...(b.recurrence !== undefined ? { recurrence: b.recurrence } : {}),
    ...(b.recurrenceUntil !== undefined ? { recurrenceUntil: date(b.recurrenceUntil) } : {}),
  };
}
