import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import type { GrantSubjectType } from "@/lib/generated/prisma/enums";

/**
 * Shared helpers for creating and listing library grants.
 *
 * `targetKey`/`subjectKey` are denormalized dedupe keys. They exist because
 * Postgres treats NULLs as distinct, so a unique index over the nullable
 * subject FKs would happily accept the same grant twice.
 */

export const GrantBody = z.object({
  subjectType: z.enum(["ALL_CLIENTS", "CLIENT", "CLIENT_GROUP", "COURSE", "PROGRAMME"]),
  subjectId: z.string().min(1).optional(),
  canDownload: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export type GrantInput = z.infer<typeof GrantBody>;

export function targetKeyFor(target: { itemId?: string; folderId?: string }): string {
  if (target.itemId) return `I:${target.itemId}`;
  if (target.folderId) return `F:${target.folderId}`;
  throw new DomainError(400, "invalid_target", "A grant needs an item or a folder.");
}

export function subjectKeyFor(subjectType: GrantSubjectType, subjectId?: string): string {
  if (subjectType === "ALL_CLIENTS") return "ALL";
  if (!subjectId) {
    throw new DomainError(400, "subject_required", "This assignment target needs a specific subject.");
  }
  return `${subjectType}:${subjectId}`;
}

/** Confirm the subject exists inside this tenant before granting against it. */
export async function assertSubjectInTenant(
  tenantId: string,
  subjectType: GrantSubjectType,
  subjectId?: string
): Promise<void> {
  if (subjectType === "ALL_CLIENTS") return;
  if (!subjectId) {
    throw new DomainError(400, "subject_required", "This assignment target needs a specific subject.");
  }
  const where = { id: subjectId, tenantId };
  const found =
    subjectType === "CLIENT"
      ? await prisma.client.findFirst({ where, select: { id: true } })
      : subjectType === "CLIENT_GROUP"
        ? await prisma.clientGroup.findFirst({ where, select: { id: true } })
        : subjectType === "COURSE"
          ? await prisma.course.findFirst({ where, select: { id: true } })
          : await prisma.programme.findFirst({ where, select: { id: true } });
  if (!found) throw new DomainError(400, "invalid_subject", "That assignment target was not found.");
}

/** Map a subject onto the right nullable FK column. */
export function subjectColumns(subjectType: GrantSubjectType, subjectId?: string) {
  return {
    clientId: subjectType === "CLIENT" ? subjectId! : null,
    clientGroupId: subjectType === "CLIENT_GROUP" ? subjectId! : null,
    courseId: subjectType === "COURSE" ? subjectId! : null,
    programmeId: subjectType === "PROGRAMME" ? subjectId! : null,
  };
}

export const GRANT_INCLUDE = {
  client: { select: { id: true, email: true, firstName: true, lastName: true } },
  clientGroup: { select: { id: true, name: true } },
  course: { select: { id: true, title: true } },
  programme: { select: { id: true, title: true } },
} as const;

/** Human label for a grant's audience, used in the UI summary line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function describeGrant(g: any): string {
  switch (g.subjectType) {
    case "ALL_CLIENTS":
      return "Everyone";
    case "CLIENT":
      return g.client
        ? `${[g.client.firstName, g.client.lastName].filter(Boolean).join(" ") || g.client.email}`
        : "A learner";
    case "CLIENT_GROUP":
      return g.clientGroup?.name ?? "A group";
    case "COURSE":
      return g.course?.title ?? "A course";
    case "PROGRAMME":
      return g.programme?.title ?? "A programme";
    default:
      return "Unknown";
  }
}
