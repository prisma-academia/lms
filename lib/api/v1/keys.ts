import { randomBytes } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { hashOpaqueToken } from "@/lib/auth/tokens";

/**
 * API key format: `plms_live_<8 char prefix>_<secret>`.
 *
 * The prefix (`plms_live_ab12cd34`) is stored and shown in lists so a key can
 * be recognised — in a log, a leaked config file, a support ticket — without
 * the secret. Only sha256 of the whole key is kept; the key itself is shown
 * once, at creation.
 */

const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const KEY_PATTERN = /^plms_live_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const bytes = randomBytes(8);
  let id = "";
  for (const b of bytes) id += PREFIX_ALPHABET[b % PREFIX_ALPHABET.length];
  const secret = randomBytes(32).toString("base64url");
  const key = `plms_live_${id}_${secret}`;
  return { key, prefix: `plms_live_${id}`, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return hashOpaqueToken(key);
}

export function looksLikeApiKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** The key from `Authorization: Bearer <key>`, or null. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** "41.58.0.0/16", "102.89.12.7", "2001:db8::/32". */
export function isValidAllowlistEntry(entry: string): boolean {
  const [ip, bits, extra] = entry.trim().split("/");
  if (extra !== undefined) return false;
  const family = isIP(ip);
  if (!family) return false;
  if (bits === undefined) return true;
  if (!/^\d{1,3}$/.test(bits)) return false;
  return Number(bits) <= (family === 4 ? 32 : 128);
}

/** Empty allowlist = anywhere. An unknown caller IP never matches a non-empty list. */
export function ipAllowedBy(ip: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  const family = isIP(ip);
  if (!family) return false;
  const list = new BlockList();
  for (const entry of allowlist) {
    if (!isValidAllowlistEntry(entry)) continue;
    const [net, bits] = entry.trim().split("/");
    const netFamily = isIP(net) === 4 ? "ipv4" : "ipv6";
    if (netFamily !== (family === 4 ? "ipv4" : "ipv6")) continue;
    if (bits === undefined) list.addAddress(net, netFamily);
    else list.addSubnet(net, Number(bits), netFamily);
  }
  return list.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/**
 * The caller's address. Behind Cloudflare `cf-connecting-ip` is the one header
 * the client cannot forge; then the first X-Forwarded-For hop, then X-Real-IP.
 */
export function clientIpOf(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && isIP(cf)) return cf;
  const xf = headers.get("x-forwarded-for");
  const first = xf?.split(",")[0]?.trim();
  if (first && isIP(first)) return first;
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;
  return null;
}
