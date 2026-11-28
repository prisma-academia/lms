import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Outbound HTTP to addresses an academy typed in (webhook endpoints, later
 * integration callbacks) — without letting them point us at ourselves.
 *
 *  - https only, no credentials in the URL;
 *  - the host is resolved first and EVERY address it resolves to is checked
 *    against loopback, private, link-local (incl. cloud metadata), CGNAT,
 *    multicast, reserved and documentation ranges, IPv4 and IPv6;
 *  - redirects are followed by hand (at most 3), each hop re-checked;
 *  - 10 s overall timeout; the response body is read up to 64 KB, then cut.
 *
 * Residual risk, accepted: `fetch` resolves the host again when it connects, so
 * a DNS answer that changes between our check and the connect (rebinding) is
 * not caught here. Pinning the address needs a custom dispatcher, which the
 * platform fetch does not expose without an extra package.
 */

export class SafeFetchError extends Error {
  code: "invalid_url" | "blocked_scheme" | "blocked_address" | "dns_failed" | "too_many_redirects" | "timeout" | "network";
  constructor(code: SafeFetchError["code"], message: string) {
    super(message);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

// Two lists, not one: a BlockList also matches an IPv4 address against IPv6
// rules through its mapped form, so "::ffff:0:0/96" in a shared list would
// block every IPv4 address there is.
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
// IPv4
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  BLOCKED_V4.addSubnet(net, prefix, "ipv4");
}
// IPv6
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback, IPv4-compatible (deprecated)
  ["::ffff:0:0", 96], // IPv4-mapped: never needed for a public endpoint
  ["64:ff9b::", 96], // NAT64 (embeds IPv4)
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds IPv4)
  ["fc00::", 7], // unique local (incl. fd00:ec2::254 metadata)
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(net, prefix, "ipv6");
}

/** Whether an IP literal is somewhere we must never send a request. */
export function isBlockedAddress(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const family = isIP(clean);
  if (family === 4) return BLOCKED_V4.check(clean, "ipv4");
  if (family === 6) return BLOCKED_V6.check(clean, "ipv6");
  return true; // Not an IP at all: refuse rather than guess.
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => r.address);
};

/**
 * Check a URL without fetching it: scheme, credentials, and every address the
 * host resolves to. Throws SafeFetchError; returns the parsed URL.
 */
export async function assertSafeUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", "That is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new SafeFetchError("blocked_scheme", "Only https:// URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new SafeFetchError("invalid_url", "URLs with a username or password are not allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new SafeFetchError("invalid_url", "The URL has no host.");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) {
    throw new SafeFetchError("blocked_address", "That host is on a private network.");
  }

  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new SafeFetchError("dns_failed", `Could not resolve ${host}.`);
    }
    if (addresses.length === 0) throw new SafeFetchError("dns_failed", `Could not resolve ${host}.`);
  }
  for (const a of addresses) {
    if (isBlockedAddress(a)) {
      throw new SafeFetchError("blocked_address", "That address is on a private or reserved network.");
    }
  }
  return url;
}

export type SafeFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** For tests: replaces the platform fetch. */
  fetchImpl?: typeof fetch;
  /** For tests: replaces DNS. */
  resolve?: Resolver;
  /**
   * For tests ONLY: skip the address check (to reach a local test server).
   * Never set from request-handling code.
   */
  unsafeSkipAddressCheck?: boolean;
};

export type SafeFetchResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  finalUrl: string;
  redirects: number;
  durationMs: number;
};

async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - size));
      size = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  return { body: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), truncated };
}

export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);

  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let current = rawUrl;

  for (let hop = 0; ; hop++) {
    const url = opts.unsafeSkipAddressCheck ? new URL(current) : await assertSafeUrl(current, opts.resolve);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method,
        headers: init.headers,
        body: method === "GET" || method === "HEAD" ? undefined : body,
        redirect: "manual",
        signal,
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SafeFetchError("timeout", `No response within ${Math.round(timeoutMs / 1000)} s.`);
      }
      throw new SafeFetchError("network", err instanceof Error ? err.message.slice(0, 200) : "Network error.");
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => undefined);
      if (hop >= maxRedirects) {
        throw new SafeFetchError("too_many_redirects", `More than ${maxRedirects} redirects.`);
      }
      current = new URL(location, url).toString();
      // 307/308 repeat the request as it was; the rest become a plain GET.
      if (res.status !== 307 && res.status !== 308) {
        method = "GET";
        body = undefined;
      }
      continue;
    }

    let read: { body: string; truncated: boolean };
    try {
      read = await readCapped(res, maxBytes);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SafeFetchError("timeout", `No response within ${Math.round(timeoutMs / 1000)} s.`);
      }
      read = { body: "", truncated: true };
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      status: res.status,
      headers,
      body: read.body,
      truncated: read.truncated,
      finalUrl: url.toString(),
      redirects: hop,
      durationMs: Date.now() - started,
    };
  }
}
