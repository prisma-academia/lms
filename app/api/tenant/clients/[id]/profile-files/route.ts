import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { handleError, DomainError } from "@/lib/api/errors";
import { isOwnAvatarKey, isOwnDocumentKey, parseClientProfile } from "@/lib/schemas/client-profile";
import { redirectToProfileFile } from "@/lib/profile/files";

/**
 * A learner's profile files, for staff who may view learners.
 *
 *   GET /api/tenant/clients/{id}/profile-files?avatar=<version>
 *   GET /api/tenant/clients/{id}/profile-files?certification=<entry id>
 *
 * As on the learner's side, the request names an entry in the profile and never
 * a storage key, and the key found there must sit under that learner's own
 * prefix. Opening a proof document is written to the activity log: it is
 * somebody's personal document.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CLIENTS_READ.key);
    const { id } = await ctx.params;
    const params = new URL(request.url).searchParams;

    const client = await prisma.client.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, profileJson: true },
    });
    if (!client) throw new DomainError(404, "not_found", "File not found.");
    const owner = { tenantId: actor.tenantId, clientId: client.id };
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

    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: "client.profile_document_view",
      tenantId: actor.tenantId,
      targetType: "Client",
      targetId: client.id,
      after: { certification: entry.id },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return await redirectToProfileFile(entry.proofKey);
  } catch (e) {
    return handleError(e);
  }
}
