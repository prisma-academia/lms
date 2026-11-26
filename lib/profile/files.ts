import { NextResponse } from "next/server";
import { DomainError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { recordStorageDelta } from "@/lib/storage/quota";
import {
  MAX_ASSET_BYTES,
  createPresignedDownload,
  deleteObject,
  headObjectSize,
  s3Configured,
} from "@/lib/storage/s3";
import {
  isOwnAvatarKey,
  isOwnDocumentKey,
  type ClientProfile,
  type ProfileOwner,
} from "@/lib/schemas/client-profile";

/**
 * A learner's profile files: their photo, and proof of their certifications.
 *
 * These are personal documents, so they are never given a public address. The
 * app links to its own routes (`/api/client/profile/files`, and the staff
 * equivalent), which check who is asking and then redirect to a signed storage
 * link that stops working a couple of minutes later.
 */

/** Long enough to follow the redirect and load the file; short enough to be useless if copied. */
const SIGNED_LINK_SECONDS = 120;

/**
 * A short token that changes whenever the photo does, so `<img src>` changes
 * with it and no browser keeps showing the old one. It is the random part of
 * the storage key — it identifies nothing and grants nothing.
 */
export function avatarVersion(avatarKey: string): string {
  return /avatar-([a-f0-9]{16})\./.exec(avatarKey)?.[1] ?? "1";
}

/** Where the learner's own shell and profile page load the photo from. */
export function ownAvatarSrc(profile: Pick<ClientProfile, "avatarKey">): string | null {
  if (!profile.avatarKey || !s3Configured()) return null;
  return `/api/client/profile/files?avatar=${avatarVersion(profile.avatarKey)}`;
}

/** Where a member of staff loads a learner's photo from. */
export function staffAvatarSrc(clientId: string, profile: Pick<ClientProfile, "avatarKey">): string | null {
  if (!profile.avatarKey || !s3Configured()) return null;
  return `/api/tenant/clients/${clientId}/profile-files?avatar=${avatarVersion(profile.avatarKey)}`;
}

/**
 * Redirect to a signed link for one profile file.
 *
 * The redirect itself may be reused by the same browser for a little less time
 * than the link lasts, so a page with the photo on it does not ask for a new
 * signature on every render — but it is `private`: no shared cache may keep it.
 */
export async function redirectToProfileFile(key: string): Promise<NextResponse> {
  if (!s3Configured()) throw new DomainError(404, "not_found", "File not found.");
  const url = await createPresignedDownload(key, SIGNED_LINK_SECONDS);
  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": `private, max-age=${SIGNED_LINK_SECONDS - 30}`,
      "Referrer-Policy": "no-referrer",
    },
  });
}

type NewFile = { key: string; kind: "avatar" | "profile_document" };

/**
 * Confirm that files a profile is about to point at were really uploaded.
 *
 * A key is only a string the browser sends back. Before it is saved it must
 * exist in storage (the upload can fail after the link is issued) and be no
 * larger than its kind allows. Returns the real sizes, read from storage rather
 * than taken on trust, for the academy's storage count.
 */
export async function confirmUploaded(files: NewFile[]): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  if (files.length === 0) return sizes;
  if (!s3Configured()) {
    throw new DomainError(503, "storage_unconfigured", "File uploads are not available right now.");
  }
  for (const file of files) {
    let size: number;
    try {
      size = await headObjectSize(file.key);
    } catch {
      throw new DomainError(400, "upload_missing", "The upload didn't finish. Choose the file again.");
    }
    if (size <= 0) {
      throw new DomainError(400, "upload_missing", "The upload didn't finish. Choose the file again.");
    }
    if (size > MAX_ASSET_BYTES[file.kind]) {
      await deleteObject(file.key).catch(() => undefined);
      throw new DomainError(400, "file_too_large", "That file is too large.");
    }
    sizes.set(file.key, size);
  }
  return sizes;
}

/** Add newly referenced files to the academy's storage count. Never fails a save. */
export async function countStoredFiles(tenantId: string, sizes: Iterable<number>): Promise<void> {
  let total = 0;
  for (const size of sizes) total += size;
  if (total <= 0) return;
  try {
    await recordStorageDelta(tenantId, BigInt(total));
  } catch (err) {
    logger.warn({ err, tenantId }, "profile_storage_count_failed");
  }
}

/**
 * Delete files a profile no longer points at, and give their space back.
 *
 * Runs after the profile is saved and never fails the save: a file that could
 * not be deleted is an orphan to sweep up, not a reason to tell the learner
 * their change did not go through. Only keys under the learner's own prefix are
 * ever deleted, whatever the stored profile claimed.
 */
export async function discardProfileFiles(owner: ProfileOwner, keys: string[]): Promise<void> {
  if (!s3Configured()) return;
  for (const key of keys) {
    if (!isOwnAvatarKey(key, owner) && !isOwnDocumentKey(key, owner)) continue;
    try {
      const size = await headObjectSize(key).catch(() => 0);
      await deleteObject(key);
      if (size > 0) await recordStorageDelta(owner.tenantId, -BigInt(size));
    } catch (err) {
      logger.warn({ err, tenantId: owner.tenantId }, "profile_file_discard_failed");
    }
  }
}
