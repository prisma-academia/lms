/**
 * IP allowlists for exam centres: "41.58.0.0/16", "102.89.12.7", "2001:db8::/32".
 * Pure and dependency-free.
 */

function v4ToBigInt(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = BigInt(0);
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << BigInt(8)) + BigInt(v);
  }
  return n;
}

function v6ToBigInt(ip: string): bigint | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // IPv4-mapped tail (::ffff:1.2.3.4)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4ToBigInt(v4[1]);
    if (n === null) return null;
    s = s.slice(0, -v4[1].length) + (Number(n >> BigInt(16)) & 0xffff).toString(16) + ":" + (Number(n) & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  let n = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    n = (n << BigInt(16)) + BigInt(parseInt(g, 16));
  }
  return n;
}

function parse(ip: string): { v: 4 | 6; n: bigint } | null {
  const trimmed = ip.trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed);
  if (mapped) {
    const n = v4ToBigInt(mapped[1]);
    return n === null ? null : { v: 4, n };
  }
  if (trimmed.includes(":")) {
    const n = v6ToBigInt(trimmed);
    return n === null ? null : { v: 6, n };
  }
  const n = v4ToBigInt(trimmed);
  return n === null ? null : { v: 4, n };
}

export function isValidCidr(entry: string): boolean {
  const [ip, bits] = entry.trim().split("/");
  const p = parse(ip);
  if (!p) return false;
  if (bits === undefined) return true;
  if (!/^\d+$/.test(bits)) return false;
  return Number(bits) <= (p.v === 4 ? 32 : 128);
}

export function ipInCidr(ip: string, entry: string): boolean {
  const addr = parse(ip);
  const [base, bitsRaw] = entry.trim().split("/");
  const net = parse(base);
  if (!addr || !net || addr.v !== net.v) return false;
  const width = addr.v === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? width : Number(bitsRaw);
  if (!Number.isFinite(bits) || bits < 0 || bits > width) return false;
  const shift = BigInt(width - bits);
  return addr.n >> shift === net.n >> shift;
}

/** Empty list = anywhere. */
export function ipAllowed(ip: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  return allowlist.some((entry) => ipInCidr(ip, entry));
}
