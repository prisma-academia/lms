import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Encryption at rest for secrets we must be able to read back: webhook signing
 * secrets today, integration credentials later. AES-256-GCM from node:crypto.
 *
 *   v1:<iv base64url>:<ciphertext base64url>:<tag base64url>
 *
 * The leading version names the key that sealed the value, so the key can be
 * rotated: add the new key under a new version, make it current, and values
 * sealed under the old one still open (re-seal them with `reseal`). Nothing is
 * ever compared with the plaintext key, and a missing key is a loud error, not
 * a silent "store it in clear".
 *
 * `aad` (additional authenticated data) optionally binds a value to where it is
 * stored ("webhook-endpoint"), so a ciphertext copied into another column fails
 * to open instead of being accepted as that column's secret.
 */

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

export type SecretBox = {
  seal(plaintext: string, aad?: string): string;
  open(sealed: string, aad?: string): string;
  /** True when `sealed` was made with a key other than the current one. */
  needsReseal(sealed: string): boolean;
  reseal(sealed: string, aad?: string): string;
};

function b64(buf: Buffer): string {
  return buf.toString("base64url");
}

function unb64(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/** Decode a base64 (or base64url) key and insist on exactly 32 bytes. */
export function decodeKey(raw: string, label = "APP_ENCRYPTION_KEY"): Buffer {
  const trimmed = raw.trim();
  const normalised = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalised)) {
    throw new SecretBoxError(`${label} is not valid base64.`);
  }
  const key = Buffer.from(normalised, "base64");
  if (key.length !== 32) {
    throw new SecretBoxError(`${label} must decode to 32 bytes (got ${key.length}). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  return key;
}

/**
 * Build a box from an explicit keyring. Pure — the env-backed default below is
 * just this with the configured key(s).
 */
export function createSecretBox(keys: Record<string, Buffer>, current: string): SecretBox {
  for (const [version, key] of Object.entries(keys)) {
    if (!/^v\d+$/.test(version)) throw new SecretBoxError(`Key version "${version}" must look like v1, v2…`);
    if (key.length !== 32) throw new SecretBoxError(`Key ${version} must be 32 bytes.`);
  }
  const currentKey = keys[current];
  if (!currentKey) throw new SecretBoxError(`No key for the current version "${current}".`);

  function seal(plaintext: string, aad?: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", currentKey, iv);
    if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${current}:${b64(iv)}:${b64(ct)}:${b64(cipher.getAuthTag())}`;
  }

  function parse(sealed: string): { version: string; iv: Buffer; ct: Buffer; tag: Buffer } {
    const parts = typeof sealed === "string" ? sealed.split(":") : [];
    if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) {
      throw new SecretBoxError("Not a sealed value.");
    }
    const [version, iv, ct, tag] = parts;
    return { version, iv: unb64(iv), ct: unb64(ct), tag: unb64(tag) };
  }

  function open(sealed: string, aad?: string): string {
    const { version, iv, ct, tag } = parse(sealed);
    const key = keys[version];
    if (!key) throw new SecretBoxError(`No key configured for ${version}; it was sealed with a key that has been removed.`);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError("Sealed value is malformed.");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key, wrong aad, or tampered bytes — GCM cannot tell which, and
      // neither should we.
      throw new SecretBoxError("Sealed value failed authentication.");
    }
  }

  return {
    seal,
    open,
    needsReseal: (sealed) => parse(sealed).version !== current,
    reseal: (sealed, aad) => seal(open(sealed, aad), aad),
  };
}

/* ───────────────────────────── default (env) ───────────────────────────── */

/**
 * The version new values are sealed under. To rotate: add
 * `APP_ENCRYPTION_KEY_V2`, read it into the keyring below as "v2", bump this,
 * deploy, then re-seal stored values with `reseal`. Keep v1 until none remain.
 */
const CURRENT_VERSION = "v1";

let cached: { raw: string; box: SecretBox } | null = null;

function defaultBox(): SecretBox {
  const raw = env.APP_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new SecretBoxError(
      "APP_ENCRYPTION_KEY is not set. It encrypts webhook and integration secrets; set it to 32 random bytes, base64-encoded."
    );
  }
  if (cached && cached.raw === raw) return cached.box;
  const box = createSecretBox({ v1: decodeKey(raw) }, CURRENT_VERSION);
  cached = { raw, box };
  return box;
}

export function encryptionConfigured(): boolean {
  try {
    defaultBox();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(plaintext: string, aad?: string): string {
  return defaultBox().seal(plaintext, aad);
}

export function openSecret(sealed: string, aad?: string): string {
  return defaultBox().open(sealed, aad);
}
