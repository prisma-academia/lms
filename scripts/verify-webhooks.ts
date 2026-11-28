/**
 * Webhooks without the database: signing, delivery and the SSRF guard.
 *
 *  - a signature made by the sender verifies at a receiver, and only there:
 *    wrong secret, altered body, stale timestamp and junk headers all fail;
 *  - during a secret rotation either secret verifies;
 *  - a real delivery to a local HTTP server on 127.0.0.1 arrives signed, with
 *    X-Prisma-Event / X-Prisma-Delivery, and the receiver's verdict comes back.
 *    (safe-fetch refuses loopback by design, so these use its test-only
 *    `unsafeSkipAddressCheck`; the guard itself is tested separately below);
 *  - redirects are followed at most 3 times and every hop is re-checked;
 *  - the response body is cut at 64 KB and a slow endpoint times out;
 *  - localhost, 10.x, 169.254.169.254, [::1], CGNAT, IPv4-mapped IPv6, http://,
 *    credentials in the URL, and hostnames that RESOLVE privately are refused;
 *  - the retry schedule is 1m, 5m, 30m, 2h, 6h, 12h, 24h, then give up.
 *
 *   npm run verify:webhooks
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";

config();
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function main() {
  const sign = await import("../lib/integrations/webhook-signing");
  const { sendWebhook, nextRetryDelay, eventBody, RETRY_DELAYS_MS } = await import("../lib/integrations/webhook-delivery");
  const { assertSafeUrl, safeFetch, SafeFetchError, isBlockedAddress } = await import("../lib/integrations/safe-fetch");

  /* ───────────── signing ───────────── */
  console.log("signing");
  const secret = sign.newWebhookSecret();
  const oldSecret = sign.newWebhookSecret();
  const body = JSON.stringify({ id: "evt_1", type: "learner.created", data: { learnerId: "c1" } });
  const now = Math.floor(Date.now() / 1000);
  const header = sign.signatureHeader([secret], now, body);
  check("secret format whsec_…", /^whsec_[A-Za-z0-9_-]{43}$/.test(secret), secret);
  check("header format t=…,v1=<64 hex>", /^t=\d+,v1=[0-9a-f]{64}$/.test(header), header);
  check("verifies with the right secret", sign.verifySignature(header, body, secret).ok);
  check("fails with the wrong secret", !sign.verifySignature(header, body, oldSecret).ok);
  check("fails if one body byte changes", !sign.verifySignature(header, body.replace("c1", "c2"), secret).ok);
  check("stale timestamp (6 min) is refused", sign.verifySignature(sign.signatureHeader([secret], now - 360, body), body, secret).ok === false);
  check("junk header is refused", !sign.verifySignature("v1=nothex", body, secret).ok && !sign.verifySignature(null, body, secret).ok);
  const rotating = sign.signatureHeader([secret, oldSecret], now, body);
  check("rotation header carries two v1 values", (rotating.match(/v1=/g) ?? []).length === 2);
  check("rotation: new secret verifies", sign.verifySignature(rotating, body, secret).ok);
  check("rotation: old secret verifies", sign.verifySignature(rotating, body, oldSecret).ok);
  check(
    "signature is HMAC-SHA256(secret, t.body)",
    sign.computeSignature(secret, now, body) === (await import("node:crypto")).createHmac("sha256", secret).update(`${now}.${body}`).digest("hex")
  );

  /* ───────────── delivery round trip via 127.0.0.1 ───────────── */
  console.log("delivery to a local receiver");
  const seen: Array<{ headers: IncomingMessage["headers"]; body: string; verdict: boolean }> = [];
  let receiverSecret = secret;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    if (url === "/loop") {
      res.writeHead(307, { location: "/loop" }).end();
      return;
    }
    if (url === "/hop") {
      res.writeHead(307, { location: "/hook" }).end();
      return;
    }
    if (url === "/big") {
      res.writeHead(200, { "content-type": "text/plain" }).end("x".repeat(200 * 1024));
      return;
    }
    if (url === "/slow") {
      setTimeout(() => res.writeHead(200).end("late"), 1500);
      return;
    }
    const raw = await readBody(req);
    const verdict = sign.verifySignature(req.headers["x-prisma-signature"] as string, raw, receiverSecret).ok;
    seen.push({ headers: req.headers, body: raw, verdict });
    res.writeHead(verdict ? 200 : 400, { "content-type": "application/json" }).end(JSON.stringify({ received: verdict }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const local = { unsafeSkipAddressCheck: true };

  try {
    const event = { id: "evt_abc", type: "enrollment.completed", createdAt: new Date("2026-11-28T10:00:00Z"), tenantId: "t1", payloadJson: { learnerId: "c1", courseId: "k1" } };
    const sent = eventBody(event);
    check("event body is deterministic", sent === eventBody(event));
    check("event body shape {id,type,createdAt,tenantId,data}", JSON.stringify(Object.keys(JSON.parse(sent))) === JSON.stringify(["id", "type", "createdAt", "tenantId", "data"]));

    const r1 = await sendWebhook({ url: `${base}/hook`, secrets: [secret], eventType: event.type, deliveryId: "del_1", body: sent, fetchOptions: local });
    const got = seen[seen.length - 1];
    check("delivered and accepted (2xx)", r1.ok && r1.status === 200, r1);
    check("receiver verified the signature", got?.verdict === true);
    check("receiver got X-Prisma-Event", got?.headers["x-prisma-event"] === "enrollment.completed");
    check("receiver got X-Prisma-Delivery", got?.headers["x-prisma-delivery"] === "del_1");
    check("receiver got the exact body", got?.body === sent);
    check("response body kept", r1.responseBody === JSON.stringify({ received: true }));

    receiverSecret = oldSecret;
    const r2 = await sendWebhook({ url: `${base}/hook`, secrets: [secret], eventType: event.type, deliveryId: "del_2", body: sent, fetchOptions: local });
    check("receiver with another secret rejects → delivery fails with its status", !r2.ok && r2.status === 400, r2);
    const r3 = await sendWebhook({ url: `${base}/hook`, secrets: [secret, oldSecret], eventType: event.type, deliveryId: "del_3", body: sent, fetchOptions: local });
    check("during rotation the old-secret receiver accepts", r3.ok, r3);
    receiverSecret = secret;

    const hop = await safeFetch(`${base}/hop`, { method: "POST", body: "{}" }, local);
    check("307 redirect followed (once)", hop.redirects === 1 && hop.finalUrl.endsWith("/hook"), hop);
    let loopErr: unknown = null;
    try {
      await safeFetch(`${base}/loop`, {}, local);
    } catch (e) {
      loopErr = e;
    }
    check("redirect loop stops after 3", loopErr instanceof SafeFetchError && loopErr.code === "too_many_redirects", loopErr);

    const big = await safeFetch(`${base}/big`, {}, local);
    check("response body capped at 64 KB", big.truncated && Buffer.byteLength(big.body) === 64 * 1024, { truncated: big.truncated, len: big.body.length });

    let slowErr: unknown = null;
    try {
      await safeFetch(`${base}/slow`, {}, { ...local, timeoutMs: 300 });
    } catch (e) {
      slowErr = e;
    }
    check("slow endpoint times out", slowErr instanceof SafeFetchError && slowErr.code === "timeout", slowErr);

    const down = await sendWebhook({ url: "http://127.0.0.1:1/hook", secrets: [secret], eventType: "x", deliveryId: "d", body: "{}", fetchOptions: local });
    check("unreachable endpoint is a failed result, not a throw", !down.ok && down.status === null && !!down.error);

    const guarded = await sendWebhook({ url: `${base}/hook`, secrets: [secret], eventType: "x", deliveryId: "d", body: "{}" });
    check("without the test flag, loopback is refused", !guarded.ok && /http|private|reserved/i.test(guarded.error ?? ""), guarded);
  } finally {
    server.close();
  }

  /* ───────────── SSRF guard ───────────── */
  console.log("SSRF guard");
  const publicDns = async () => ["93.184.216.34"];
  const refuse = async (url: string, resolve = publicDns): Promise<string | null> => {
    try {
      await assertSafeUrl(url, resolve);
      return null;
    } catch (e) {
      return e instanceof SafeFetchError ? e.code : "other";
    }
  };
  check("https://localhost refused", (await refuse("https://localhost/hook")) === "blocked_address");
  check("https://api.localhost refused", (await refuse("https://api.localhost/hook")) === "blocked_address");
  check("https://10.0.0.5 refused", (await refuse("https://10.0.0.5/hook")) === "blocked_address");
  check("https://192.168.1.1 refused", (await refuse("https://192.168.1.1/")) === "blocked_address");
  check("https://172.16.3.4 refused", (await refuse("https://172.16.3.4/")) === "blocked_address");
  check("https://127.0.0.1 refused", (await refuse("https://127.0.0.1/")) === "blocked_address");
  check("https://169.254.169.254 (metadata) refused", (await refuse("https://169.254.169.254/latest/meta-data")) === "blocked_address");
  check("https://100.64.0.1 (CGNAT) refused", (await refuse("https://100.64.0.1/")) === "blocked_address");
  check("https://[::1] refused", (await refuse("https://[::1]/hook")) === "blocked_address");
  check("https://[::ffff:127.0.0.1] refused", (await refuse("https://[::ffff:127.0.0.1]/")) === "blocked_address");
  check("https://[fd00:ec2::254] refused", (await refuse("https://[fd00:ec2::254]/")) === "blocked_address");
  check("https://[fe80::1] refused", (await refuse("https://[fe80::1]/")) === "blocked_address");
  check("https://0.0.0.0 refused", (await refuse("https://0.0.0.0/")) === "blocked_address");
  check("http:// refused", (await refuse("http://example.com/hook")) === "blocked_scheme");
  check("credentials in URL refused", (await refuse("https://user:pw@example.com/")) === "invalid_url");
  check("not a URL refused", (await refuse("nope")) === "invalid_url");
  check("hostname resolving to 10.x refused", (await refuse("https://intranet.example.com/", async () => ["10.1.2.3"])) === "blocked_address");
  check("any private answer among many refused", (await refuse("https://mixed.example.com/", async () => ["93.184.216.34", "127.0.0.1"])) === "blocked_address");
  check("hostname resolving to ::1 refused", (await refuse("https://v6.example.com/", async () => ["::1"])) === "blocked_address");
  check("unresolvable host refused", (await refuse("https://nx.example.com/", async () => { throw new Error("ENOTFOUND"); })) === "dns_failed");
  check("public host allowed", (await refuse("https://hooks.example.com/x", publicDns)) === null);
  check("public IPv6 literal allowed", (await refuse("https://[2606:4700:4700::1111]/")) === null);
  check("8.8.8.8 is not blocked", !isBlockedAddress("8.8.8.8"));

  // A redirect from a public host to the metadata address is caught on the hop.
  const fakeFetch = (async (url: string) =>
    url.startsWith("https://hooks.example.com")
      ? new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } })
      : new Response("secret metadata", { status: 200 })) as unknown as typeof fetch;
  let hopErr: unknown = null;
  try {
    await safeFetch("https://hooks.example.com/x", { method: "POST", body: "{}" }, { fetchImpl: fakeFetch, resolve: publicDns });
  } catch (e) {
    hopErr = e;
  }
  check("redirect to 169.254.169.254 is refused on the hop", hopErr instanceof SafeFetchError && hopErr.code === "blocked_address", hopErr);

  /* ───────────── retries ───────────── */
  console.log("retry schedule");
  const mins = RETRY_DELAYS_MS.map((ms) => ms / 60_000);
  check("1m, 5m, 30m, 2h, 6h, 12h, 24h", JSON.stringify(mins) === JSON.stringify([1, 5, 30, 120, 360, 720, 1440]), mins);
  check("after attempt 1 wait 1 minute", nextRetryDelay(1) === 60_000);
  check("after attempt 7 wait 24 hours", nextRetryDelay(7) === 24 * 3600_000);
  check("after attempt 8 give up (DEAD)", nextRetryDelay(8) === null);

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll webhook checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
