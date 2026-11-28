import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { decodeKey } from "@/lib/crypto/secret-box";

/**
 * OAuth 2.0 building blocks, hand-rolled on node:crypto (PRD §16.4: no auth
 * libraries, no JWT libraries).
 *
 *  - PKCE (RFC 7636): a 43–128 char verifier and its S256 challenge.
 *  - Signed state: a short-lived, tamper-evident value that carries which
 *    academy started a flow across hosts (the Google callback lands on the
 *    apex host, then hands over to the academy's own host). HMAC-SHA256 with a
 *    key derived from APP_ENCRYPTION_KEY, compared in constant time.
 *
 * The pure functions take the key as an argument so they can be tested with a
 * fixed vector; `integrationStateKey()` is the env-backed key.
 */

export function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** A fresh PKCE code_verifier: 32 random bytes → 43 base64url chars. */
export function newPkceVerifier(): string {
  return base64url(randomBytes(32));
}

/** code_challenge = BASE64URL(SHA256(ASCII(code_verifier))). */
export function pkceChallengeS256(verifier: string): string {
  return base64url(createHash("sha256").update(verifier, "ascii").digest());
}

/** A random value for `state` / `nonce`. */
export function randomToken(bytes = 24): string {
  return base64url(randomBytes(bytes));
}

/** Constant-time string equality (false for different lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Derive a purpose-specific 32-byte key from a master key (HKDF-SHA256). */
export function deriveKey(master: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `prisma-lms:${purpose}`, 32));
}

let cachedKey: { raw: string; key: Buffer } | null = null;

/** The HMAC key for integration state. Throws when APP_ENCRYPTION_KEY is unset. */
export function integrationStateKey(): Buffer {
  const raw = env.APP_ENCRYPTION_KEY ?? process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set.");
  if (cachedKey && cachedKey.raw === raw) return cachedKey.key;
  const key = deriveKey(decodeKey(raw), "integration-state");
  cachedKey = { raw, key };
  return key;
}

export type StatePayload = Record<string, unknown> & { exp: number };

/** "<base64url(json)>.<base64url(hmac)>" */
export function signState(payload: StatePayload, key: Buffer): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = base64url(createHmac("sha256", key).update(body).digest());
  return `${body}.${mac}`;
}

export type VerifyStateResult<T> = { ok: true; payload: T } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyState<T extends StatePayload>(token: string, key: Buffer, nowMs = Date.now()): VerifyStateResult<T> {
  if (typeof token !== "string" || token.length > 4096) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const expected = base64url(createHmac("sha256", key).update(parts[0]).digest());
  if (!safeEqual(expected, parts[1])) return { ok: false, reason: "bad_signature" };
  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as T;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") return { ok: false, reason: "malformed" };
  if (payload.exp * 1000 <= nowMs) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/**
 * The PKCE verifier for a stateless flow, derived from the state's random
 * nonce and the server key: nothing to store, and nobody without the key can
 * compute it from the (public) state.
 */
export function derivedVerifier(nonce: string, key: Buffer): string {
  return base64url(createHmac("sha256", key).update(`pkce:${nonce}`).digest());
}

/** application/x-www-form-urlencoded body. */
export function formBody(fields: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) p.set(k, v);
  return p.toString();
}
