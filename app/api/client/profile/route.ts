import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import {
  describeProfileIssue,
  foreignProfileKeys,
  parseClientProfile,
  profilePatchSchema,
  profileStorageKeys,
} from "@/lib/schemas/client-profile";
import { confirmUploaded, countStoredFiles, discardProfileFiles, ownAvatarSrc } from "@/lib/profile/files";
import { saveProfileSection } from "@/lib/profile/save";

/**
 * Save one section of the signed-in learner's profile.
 *
 * The body names a section and carries that section's whole new value:
 * `{ section: "experience", value: [...] }`. Nothing outside the section is
 * read from the request or written to the row, so a second tab saving "Skills"
 * cannot undo what this one saved under "Experience".
 */
export async function PATCH(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const meta = requestMeta(request);
    const owner = { tenantId: actor.tenantId, clientId: actor.clientId };

    const body: unknown = await request.json().catch(() => null);
    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      const section =
        typeof body === "object" && body !== null ? (body as { section?: unknown }).section : undefined;
      throw new DomainError(
        400,
        "validation_error",
        describeProfileIssue(parsed.error, typeof section === "string" ? section : undefined)
      );
    }
    const patch = parsed.data;

    // A storage key is only a string. One that is not under this learner's own
    // prefix is somebody else's file, however it got into the request.
    if (foreignProfileKeys(patch, owner).length > 0) {
      throw new DomainError(400, "invalid_file", "That file can't be used here. Upload it again.");
    }

    // Files this save introduces must really be in storage before the profile
    // is allowed to point at them.
    const before = await prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { profileJson: true },
    });
    if (!before) throw new DomainError(404, "not_found", "Your account was not found.");
    const knownKeys = new Set(profileStorageKeys(parseClientProfile(before.profileJson)));
    const incoming =
      patch.section === "avatar"
        ? patch.value.key
          ? [{ key: patch.value.key, kind: "avatar" as const }]
          : []
        : patch.section === "certifications"
          ? patch.value
              .filter((entry) => entry.proofKey)
              .map((entry) => ({ key: entry.proofKey as string, kind: "profile_document" as const }))
          : [];
    const sizes = await confirmUploaded(incoming.filter((file) => !knownKeys.has(file.key)));

    const { previous, updated } = await saveProfileSection(actor.clientId, patch);

    // Storage follows the profile, after the fact: count what is newly
    // referenced, delete what no longer is. Compared against the row the
    // transaction actually replaced, not the earlier read.
    const profile = parseClientProfile(updated.profileJson);
    const nowKeys = new Set(profileStorageKeys(profile));
    const wereKeys = profileStorageKeys(parseClientProfile(previous));
    const wereSet = new Set(wereKeys);
    await countStoredFiles(
      actor.tenantId,
      [...sizes].filter(([key]) => nowKeys.has(key) && !wereSet.has(key)).map(([, size]) => size)
    );
    await discardProfileFiles(
      owner,
      wereKeys.filter((key) => !nowKeys.has(key))
    );

    await audit({
      actorType: "CLIENT",
      actorId: actor.clientId,
      action: "client.profile_update",
      tenantId: actor.tenantId,
      targetType: "Client",
      targetId: actor.clientId,
      // Which section changed, never its contents: a profile is personal data
      // and the activity log is read far more widely than the profile is.
      after: { section: patch.section },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return ok({
      profile,
      account: {
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: updated.phone,
      },
      avatarSrc: ownAvatarSrc(profile),
    });
  } catch (e) {
    return handleError(e);
  }
}
