import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { handleError, DomainError } from "@/lib/api/errors";
import { isOwnAvatarKey, isOwnDocumentKey, parseClientProfile } from "@/lib/schemas/client-profile";
import { redirectToProfileFile } from "@/lib/profile/files";

/**
 * The signed-in learner's own profile files.
 *
 *   GET /api/client/profile/files?avatar=<version>      their photo
 *   GET /api/client/profile/files?certification=<id>    proof for one certification
 *
 * The request never names a storage key. It names a thing in the learner's own
 * profile; the key is looked up there and checked once more against their
 * prefix before a signed link is issued.
 */
export async function GET(request: Request) {
  try {
    const actor = await requireClientActor();
    const owner = { tenantId: actor.tenantId, clientId: actor.clientId };
    const params = new URL(request.url).searchParams;

    const client = await prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { profileJson: true },
    });
    if (!client) throw new DomainError(404, "not_found", "File not found.");
    const profile = parseClientProfile(client.profileJson);

    if (params.has("avatar")) {
      if (!profile.avatarKey || !isOwnAvatarKey(profile.avatarKey, owner)) {
        throw new DomainError(404, "not_found", "File not found.");
      }
      return await redirectToProfileFile(profile.avatarKey);
    }

    const certificationId = params.get("certification");
    const entry = certificationId ? profile.certifications.find((c) => c.id === certificationId) : undefined;
    if (!entry?.proofKey || !isOwnDocumentKey(entry.proofKey, owner)) {
      throw new DomainError(404, "not_found", "File not found.");
    }
    return await redirectToProfileFile(entry.proofKey);
  } catch (e) {
    return handleError(e);
  }
}
