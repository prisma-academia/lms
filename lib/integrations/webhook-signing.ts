import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stripe-style webhook signatures.
 *
 *   X-Prisma-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>
 *
 * During a secret rotation the header carries one v1 per live secret, so a
 * receiver that has either secret can verify. Receivers should reject a
 * timestamp more than 5 minutes from their clock (replay window).
 */

export const SIGNATURE_HEADER = "X-Prisma-Signature";
export const EVENT_HEADER = "X-Prisma-Event";
export const DELIVERY_HEADER = "X-Prisma-Delivery";
export const REPLAY_TOLERANCE_SEC = 300;

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export function signatureHeader(secrets: string[], timestamp: number, body: string): string {
  return [`t=${timestamp}`, ...secrets.map((s) => `v1=${computeSignature(s, timestamp, body)}`)].join(",");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" };

/** What a receiver does — exported for the docs, the tests and anyone embedding the SDK logic. */
export function verifySignature(
  header: string | null | undefined,
  body: string,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {}
): VerifyResult {
  if (!header) return { ok: false, reason: "malformed" };
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t" && v && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && v && /^[0-9a-f]{64}$/.test(v)) sigs.push(v);
  }
  if (t === null || sigs.length === 0) return { ok: false, reason: "malformed" };
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSec ?? REPLAY_TOLERANCE_SEC)) return { ok: false, reason: "stale" };
  const expected = Buffer.from(computeSignature(secret, t, body), "hex");
  const match = sigs.some((s) => timingSafeEqual(Buffer.from(s, "hex"), expected));
  return match ? { ok: true } : { ok: false, reason: "mismatch" };
}
