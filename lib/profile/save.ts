import { prisma } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { DomainError } from "@/lib/api/errors";
import { applySectionPatch, type ProfilePatch } from "@/lib/schemas/client-profile";

/** How many times to run a save when two for the same learner collide. */
const MAX_ATTEMPTS = 4;

function isWriteConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  // P2034: "write conflict or a deadlock — retry your transaction". Depending on
  // the driver, the database's own code (40001) can surface instead.
  return (
    code === "P2034" ||
    code === "40001" ||
    (typeof message === "string" && /could not serialize|write conflict/i.test(message))
  );
}

/**
 * Read the learner's row, change one section, write it back — as one unit.
 *
 * The profile is a single JSON column, so "replace one section" is a
 * read-modify-write. Under the default isolation two overlapping saves both
 * read the old value, and the second silently erases the first. SERIALIZABLE
 * makes the database refuse one of them instead, and that one is simply run
 * again against the row as it now stands — so both sections survive.
 *
 * Returns the stored value the transaction replaced (not an earlier read), so
 * the caller can tell exactly which files stopped being referenced.
 */
export async function saveProfileSection(clientId: string, patch: ProfilePatch) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const current = await tx.client.findUnique({
            where: { id: clientId },
            select: { profileJson: true },
          });
          if (!current) throw new DomainError(404, "not_found", "Your account was not found.");

          const next = applySectionPatch(current.profileJson, patch);
          const updated = await tx.client.update({
            where: { id: clientId },
            data: {
              profileJson: next as Prisma.InputJsonValue,
              // The name parts and the phone number have columns of their own.
              ...(patch.section === "basics"
                ? {
                    firstName: patch.value.firstName,
                    lastName: patch.value.lastName,
                    phone: patch.value.phone,
                  }
                : {}),
            },
            select: { email: true, firstName: true, lastName: true, phone: true, profileJson: true },
          });
          return { previous: current.profileJson as unknown, updated };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (!isWriteConflict(error)) throw error;
      if (attempt >= MAX_ATTEMPTS) {
        throw new DomainError(
          409,
          "conflict",
          "Your profile was being saved from somewhere else at the same moment. Try again."
        );
      }
      // A short, uneven pause so two colliding saves do not collide again in step.
      await new Promise((resolve) => setTimeout(resolve, 40 * attempt + Math.floor(Math.random() * 60)));
    }
  }
}
