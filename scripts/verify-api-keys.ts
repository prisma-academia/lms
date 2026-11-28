/**
 * The /api/v1 request pipeline (lib/api/v1/pipeline.ts), with an in-memory key
 * store and hand-built Request objects. No database, no server.
 *
 *  - no key, a malformed key, an unknown key, a revoked or expired key → 401;
 *  - outside the key's IP allowlist, or an inactive academy → 403;
 *  - on another academy's subdomain → 403; own subdomain and the apex → fine;
 *  - cookies are never read: a session cookie without a key is still 401, and
 *    a key with someone else's cookie runs as the key's academy;
 *  - the handler runs bound to the key's tenant (tenant-admin context);
 *  - a missing scope → 403; a scope-less route accepts any valid key;
 *  - the per-key rate limit counts, sets X-RateLimit-*, and answers 429;
 *  - Idempotency-Key replays the first response, refuses a different request
 *    under the same key, and does not keep a 5xx;
 *  - every response has X-Request-Id and the { data, error } envelope;
 *  - errors map to their status; an unexpected one is a 500 with a reference;
 *  - each request is logged through the store.
 *
 *   npm run verify:api-keys
 */
import { config } from "dotenv";
import { z } from "zod";

config();

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

async function main() {
  const { createApiRoute } = await import("../lib/api/v1/pipeline");
  type Store = import("../lib/api/v1/pipeline").PipelineStore;
  type KeyRecord = import("../lib/api/v1/pipeline").ApiKeyRecord;
  const { newApiKey } = await import("../lib/api/v1/keys");
  const { getContext } = await import("../lib/db/tenant-context");
  const { DomainError } = await import("../lib/api/errors");
  const { env } = await import("../lib/env");

  const apex = env.APP_DOMAIN.split(":")[0];
  const ownHost = `acme.${apex}`;
  const otherHost = `globex.${apex}`;

  /* ── in-memory store ── */
  const keys = new Map<string, KeyRecord>();
  const minute = new Map<string, number>();
  const idem = new Map<string, { hash: string; status: number | null; body: string | null }>();
  const logs: Array<{ keyId: string; status: number; path: string }> = [];
  const store: Store = {
    async findKeyByHash(hash) {
      return keys.get(hash) ?? null;
    },
    async hitMinute(key, bucket) {
      const k = `${key.id}|${bucket.toISOString()}`;
      const n = (minute.get(k) ?? 0) + 1;
      minute.set(k, n);
      return n;
    },
    async idempotencyBegin(key, input) {
      const k = `${key.id}|${input.idemKey}`;
      const existing = idem.get(k);
      if (!existing) {
        idem.set(k, { hash: input.requestHash, status: null, body: null });
        return { kind: "new" };
      }
      if (existing.hash !== input.requestHash) return { kind: "mismatch" };
      if (existing.status === null || existing.body === null) return { kind: "in_progress" };
      return { kind: "replay", status: existing.status, body: existing.body };
    },
    async idempotencyFinish(key, idemKey, status, body) {
      const row = idem.get(`${key.id}|${idemKey}`);
      if (row) Object.assign(row, { status, body });
    },
    async idempotencyAbort(key, idemKey) {
      idem.delete(`${key.id}|${idemKey}`);
    },
    async record(key, entry) {
      logs.push({ keyId: key.id, status: entry.status, path: entry.path });
    },
  };
  const apiRoute = createApiRoute({ store, defer: async (work) => work() });

  function addKey(over: Partial<KeyRecord> = {}): string {
    const { key, prefix, hash } = newApiKey();
    keys.set(hash, {
      id: `key_${keys.size + 1}`,
      tenantId: "tenant_acme",
      tenantSlug: "acme",
      tenantStatus: "ACTIVE",
      name: "Test key",
      prefix,
      scopes: ["learners:read", "learners:write"],
      ipAllowlist: [],
      rateLimitPerMin: 100,
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: null,
      ...over,
    });
    return key;
  }

  function req(opts: { method?: string; path?: string; key?: string | null; host?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    const headers: Record<string, string> = { host: opts.host ?? ownHost, "user-agent": "verify-api-keys", ...(opts.headers ?? {}) };
    if (opts.key) headers.authorization = `Bearer ${opts.key}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    return new Request(`https://${opts.host ?? ownHost}${opts.path ?? "/api/v1/test"}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  async function call(route: (r: Request) => Promise<Response>, r: Request) {
    const res = await route(r);
    const text = await res.text();
    let json: { data: unknown; error: { code: string; message: string } | null; meta?: unknown } | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { res, json, text };
  }

  let seenCtx: unknown = null;
  const readRoute = apiRoute({ scope: "learners:read" }, async (ctx) => {
    seenCtx = { ctx: getContext(), tenantId: ctx.tenantId, keyId: ctx.key.keyId };
    return { data: { hello: "world", tenantId: ctx.tenantId } };
  });
  const anyKeyRoute = apiRoute({ scope: null }, async () => ({ data: { me: true } }));
  const examsRoute = apiRoute({ scope: "exams:write" }, async () => ({ data: { never: true } }));
  let created = 0;
  const createRoute = apiRoute({ scope: "learners:write" }, async (ctx) => {
    const body = ctx.json(z.object({ email: z.email() }));
    created++;
    return { data: { id: `learner_${created}`, email: body.email }, status: 201 };
  });
  let flakyCalls = 0;
  const flakyRoute = apiRoute({ scope: "learners:write" }, async () => {
    flakyCalls++;
    if (flakyCalls === 1) throw new Error("database fell over");
    return { data: { ok: true }, status: 201 };
  });
  const domainErrRoute = apiRoute({ scope: null }, async () => {
    throw new DomainError(409, "email_taken", "Taken.");
  });

  const good = addKey();

  console.log("authentication");
  {
    const r = await call(readRoute, req({ key: null }));
    check("no key → 401 missing_api_key", r.res.status === 401 && r.json?.error?.code === "missing_api_key", r.json);
    check("401 carries WWW-Authenticate", !!r.res.headers.get("www-authenticate"));
  }
  {
    const r = await call(readRoute, req({ key: "sk_live_nope" }));
    check("malformed key → 401 invalid_api_key", r.res.status === 401 && r.json?.error?.code === "invalid_api_key");
  }
  {
    const { key: unknown } = newApiKey();
    const r = await call(readRoute, req({ key: unknown }));
    check("well-formed but unknown key → 401", r.res.status === 401 && r.json?.error?.code === "invalid_api_key");
  }
  {
    const revoked = addKey({ revokedAt: new Date(Date.now() - 1000) });
    const r = await call(readRoute, req({ key: revoked }));
    check("revoked key → 401 api_key_revoked", r.res.status === 401 && r.json?.error?.code === "api_key_revoked");
  }
  {
    const expired = addKey({ expiresAt: new Date(Date.now() - 1000) });
    const r = await call(readRoute, req({ key: expired }));
    check("expired key → 401 api_key_expired", r.res.status === 401 && r.json?.error?.code === "api_key_expired");
    const rotatingOut = addKey({ expiresAt: new Date(Date.now() + 3600_000) });
    const r2 = await call(readRoute, req({ key: rotatingOut }));
    check("a key in its rotation grace period still works", r2.res.status === 200);
  }
  {
    const fenced = addKey({ ipAllowlist: ["41.58.0.0/16", "2001:db8::/32"] });
    const out = await call(readRoute, req({ key: fenced, headers: { "x-forwarded-for": "8.8.8.8" } }));
    check("outside the IP allowlist → 403 ip_not_allowed", out.res.status === 403 && out.json?.error?.code === "ip_not_allowed");
    const unknownIp = await call(readRoute, req({ key: fenced }));
    check("allowlist + unknown caller IP → 403", unknownIp.res.status === 403);
    const inside = await call(readRoute, req({ key: fenced, headers: { "x-forwarded-for": "41.58.3.4, 10.0.0.1" } }));
    check("inside the IPv4 range → 200", inside.res.status === 200);
    const cf = await call(readRoute, req({ key: fenced, headers: { "cf-connecting-ip": "2001:db8::7", "x-forwarded-for": "8.8.8.8" } }));
    check("cf-connecting-ip wins over a forged X-Forwarded-For (IPv6 range) → 200", cf.res.status === 200);
  }
  {
    const dormant = addKey({ tenantStatus: "SUSPENDED" });
    const r = await call(readRoute, req({ key: dormant }));
    check("inactive academy → 403 tenant_inactive", r.res.status === 403 && r.json?.error?.code === "tenant_inactive");
  }

  console.log("host check");
  {
    const wrong = await call(readRoute, req({ key: good, host: otherHost }));
    check("another academy's subdomain → 403 wrong_tenant_host", wrong.res.status === 403 && wrong.json?.error?.code === "wrong_tenant_host", wrong.json);
    const own = await call(readRoute, req({ key: good, host: ownHost }));
    check("own subdomain → 200", own.res.status === 200);
    const onApex = await call(readRoute, req({ key: good, host: apex }));
    check("apex host → 200", onApex.res.status === 200);
    const deep = await call(readRoute, req({ key: good, host: `a.b.${apex}` }));
    check("unknown multi-level host → 404", deep.res.status === 404);
  }

  console.log("cookies are ignored");
  {
    const cookieOnly = await call(
      readRoute,
      req({ key: null, headers: { cookie: "__mt-tenant-session=stolen-session-token; __mt-client-session=x; mt-csrf=y" } })
    );
    check("a session cookie without a key → 401", cookieOnly.res.status === 401);
    seenCtx = null;
    const both = await call(readRoute, req({ key: good, headers: { cookie: "__mt-tenant-session=other-tenant-session" } }));
    const seen = seenCtx as { ctx: { mode: string; tenantId: string } | undefined; tenantId: string } | null;
    check("key + foreign cookie → runs as the key's academy", both.res.status === 200 && seen?.tenantId === "tenant_acme");
    check("handler is bound to tenant-admin context for the key's tenant", seen?.ctx?.mode === "tenant-admin" && seen?.ctx?.tenantId === "tenant_acme", seen?.ctx);
    check("context does not leak outside the request", getContext() === undefined);
  }

  console.log("scopes");
  {
    const denied = await call(examsRoute, req({ key: good }));
    check("missing scope → 403 insufficient_scope", denied.res.status === 403 && denied.json?.error?.code === "insufficient_scope");
    check("the message names the scope", /exams:write/.test(denied.json?.error?.message ?? ""));
    const any = await call(anyKeyRoute, req({ key: good }));
    check("scope-less route accepts any valid key", any.res.status === 200);
  }

  console.log("envelope & headers");
  {
    const r = await call(readRoute, req({ key: good }));
    check("X-Request-Id present", /^req_/.test(r.res.headers.get("x-request-id") ?? ""));
    check("incoming X-Request-Id is echoed when sane", (await readRoute(req({ key: good, headers: { "x-request-id": "client-abc-12345" } }))).headers.get("x-request-id") === "client-abc-12345");
    check("{ data, error } envelope", JSON.stringify(r.json) === JSON.stringify({ data: { hello: "world", tenantId: "tenant_acme" }, error: null }), r.json);
    check("Cache-Control: no-store", r.res.headers.get("cache-control") === "no-store");
    const d = await call(domainErrRoute, req({ key: good }));
    check("DomainError → its status and code", d.res.status === 409 && d.json?.error?.code === "email_taken");
    const bad = await call(createRoute, req({ key: good, method: "POST", body: { email: "not-an-email" } }));
    check("zod failure → 400 validation_error", bad.res.status === 400 && bad.json?.error?.code === "validation_error");
    const junk = await createRoute(new Request(`https://${ownHost}/api/v1/x`, { method: "POST", headers: { host: ownHost, authorization: `Bearer ${good}` }, body: "{nope" }));
    check("invalid JSON → 400 invalid_json", junk.status === 400 && (await junk.json()).error.code === "invalid_json");
  }

  console.log("rate limit");
  {
    const tight = addKey({ rateLimitPerMin: 3 });
    const statuses: number[] = [];
    const remaining: string[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 4; i++) {
      last = await readRoute(req({ key: tight }));
      statuses.push(last.status);
      remaining.push(last.headers.get("x-ratelimit-remaining") ?? "?");
    }
    check("3 allowed, the 4th → 429", JSON.stringify(statuses) === JSON.stringify([200, 200, 200, 429]), statuses);
    check("X-RateLimit-Remaining counts down", JSON.stringify(remaining) === JSON.stringify(["2", "1", "0", "0"]), remaining);
    check("X-RateLimit-Limit and Reset are set", last?.headers.get("x-ratelimit-limit") === "3" && /^\d+$/.test(last?.headers.get("x-ratelimit-reset") ?? ""));
    check("429 carries Retry-After", /^\d+$/.test(last?.headers.get("retry-after") ?? ""));
  }

  console.log("idempotency");
  {
    created = 0;
    const first = await call(createRoute, req({ key: good, method: "POST", body: { email: "ada@example.com" }, headers: { "idempotency-key": "abc-123" } }));
    const second = await call(createRoute, req({ key: good, method: "POST", body: { email: "ada@example.com" }, headers: { "idempotency-key": "abc-123" } }));
    check("first request runs (201)", first.res.status === 201 && created === 1);
    check("replay does not run the handler again", created === 1);
    check("replay returns the same status and body", second.res.status === 201 && second.text === first.text);
    check("replay is marked Idempotent-Replayed", second.res.headers.get("idempotent-replayed") === "true");
    const clash = await call(createRoute, req({ key: good, method: "POST", body: { email: "bob@example.com" }, headers: { "idempotency-key": "abc-123" } }));
    check("same key, different body → 422 idempotency_key_reused", clash.res.status === 422 && clash.json?.error?.code === "idempotency_key_reused");
    const otherKey = addKey();
    const sep = await call(createRoute, req({ key: otherKey, method: "POST", body: { email: "ada@example.com" }, headers: { "idempotency-key": "abc-123" } }));
    check("idempotency keys are per API key", sep.res.status === 201 && created === 2);
    const noKey1 = await call(createRoute, req({ key: good, method: "POST", body: { email: "c@example.com" } }));
    const noKey2 = await call(createRoute, req({ key: good, method: "POST", body: { email: "c@example.com" } }));
    check("without the header, both requests run", noKey1.res.status === 201 && noKey2.res.status === 201 && created === 4);
    const f1 = await call(flakyRoute, req({ key: good, method: "POST", body: {}, headers: { "idempotency-key": "flaky-1" } }));
    const f2 = await call(flakyRoute, req({ key: good, method: "POST", body: {}, headers: { "idempotency-key": "flaky-1" } }));
    check("a 5xx is not kept: the retry runs again and succeeds", f1.res.status === 500 && f2.res.status === 201 && flakyCalls === 2, [f1.res.status, f2.res.status]);
    check("500 message carries the request id, not the cause", /req_/.test(f1.json?.error?.message ?? "") && !/fell over/.test(f1.text));
  }

  console.log("logging");
  {
    const before = logs.length;
    await readRoute(req({ key: good }));
    await examsRoute(req({ key: good }));
    const added = logs.slice(before);
    check("each authenticated request is logged", added.length === 2 && added[0].status === 200 && added[1].status === 403, added);
    const unauthBefore = logs.length;
    await readRoute(req({ key: null }));
    check("unauthenticated requests are not logged against any key", logs.length === unauthBefore);
  }

  console.log("openapi.json");
  {
    const { buildOpenApi } = await import("../lib/api/v1/openapi");
    const { existsSync, readFileSync } = await import("node:fs");
    const doc = buildOpenApi("https://example.test/api/v1");
    const ops = Object.entries(doc.paths).flatMap(([p, m]) => Object.keys(m).map((method) => ({ p, method })));
    check("document builds from the zod schemas", doc.openapi === "3.1.0" && ops.length >= 45, ops.length);
    const missing = ops.filter(({ p, method }) => {
      const file = `app/api/v1${p.replace(/\{(\w+)\}/g, "[$1]")}/route.ts`;
      return !existsSync(file) || !new RegExp(`export const ${method.toUpperCase()}\\b`).test(readFileSync(file, "utf8"));
    });
    check("every documented operation has a route exporting that method", missing.length === 0, missing);
    const learnersPost = doc.paths["/learners"]?.post as { requestBody?: { content: Record<string, { schema: { required?: string[] } }> } } | undefined;
    check("request bodies carry required fields", learnersPost?.requestBody?.content["application/json"].schema.required?.includes("email") === true);
    check("components hold the named schemas", !!(doc.components as { schemas: Record<string, unknown> }).schemas.Learner);
  }

  if (process.argv.includes("--db")) await dbChecks();

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll API key pipeline checks passed.");
  process.exit(failed ? 1 : 0);
}

/**
 * `--db`: the real routes and the Prisma store, end to end, inside two
 * throwaway academies created here and deleted in `finally` (with their audit
 * rows). The only outbound request is a webhook to a `.invalid` host, which
 * cannot resolve — so the delivery fails on DNS and is scheduled for retry.
 */
async function dbChecks() {
  console.log("database (throwaway academies)");
  const { randomBytes } = await import("node:crypto");
  const { rawPrisma } = await import("../lib/db/raw-client");
  const { newApiKey } = await import("../lib/api/v1/keys");
  const { ALL_API_SCOPES } = await import("../lib/api/v1/scopes");
  const { sealSecret } = await import("../lib/crypto/secret-box");
  const { SECRET_AAD } = await import("../lib/integrations/webhook-delivery");
  const { consumeLoginLink } = await import("../lib/auth/login-link");
  const { env } = await import("../lib/env");
  const me = await import("../app/api/v1/me/route");
  const learners = await import("../app/api/v1/learners/route");
  const learner = await import("../app/api/v1/learners/[id]/route");
  const byExt = await import("../app/api/v1/learners/by-external-id/[externalId]/route");
  const loginLink = await import("../app/api/v1/learners/[id]/login-link/route");

  const tag = randomBytes(4).toString("hex");
  const host = `zz-verify-${tag}.${env.APP_DOMAIN.split(":")[0]}`;
  const t1 = await rawPrisma.tenant.create({ data: { slug: `zz-verify-${tag}`, name: "API verify (temporary)" } });
  const t2 = await rawPrisma.tenant.create({ data: { slug: `zz-verify-${tag}-b`, name: "API verify B (temporary)" } });
  try {
    const { key, prefix, hash } = newApiKey();
    const keyRow = await rawPrisma.apiKey.create({ data: { tenantId: t1.id, name: "verify", prefix, keyHash: hash, scopes: ALL_API_SCOPES } });
    const foreign = await rawPrisma.client.create({ data: { tenantId: t2.id, email: `other-${tag}@example.com` } });
    await rawPrisma.webhookEndpoint.create({
      data: { tenantId: t1.id, url: "https://hooks.example.invalid/prisma", events: ["learner.created"], secretEnc: sealSecret("whsec_test", SECRET_AAD) },
    });

    const mk = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
      new Request(`https://${host}/api/v1${path}`, {
        method,
        headers: { host, authorization: `Bearer ${key}`, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

    const meRes = await me.GET(mk("GET", "/me"), params({}));
    const meJson = await meRes.json();
    check("GET /me → this academy and key", meRes.status === 200 && meJson.data?.tenant?.id === t1.id && meJson.data?.key?.prefix === prefix, meJson);

    const email = `ada-${tag}@example.com`;
    const c1 = await learners.POST(mk("POST", "/learners", { email, firstName: "Ada", externalId: `EXT-${tag}` }, { "idempotency-key": `idem-${tag}` }), params({}));
    const c1j = await c1.json();
    const c2 = await learners.POST(mk("POST", "/learners", { email, firstName: "Ada", externalId: `EXT-${tag}` }, { "idempotency-key": `idem-${tag}` }), params({}));
    const c2j = await c2.json();
    const count = await rawPrisma.client.count({ where: { tenantId: t1.id } });
    check("POST /learners → 201", c1.status === 201 && c1j.data?.email === email, c1j);
    check("Idempotency-Key replay (DB store) → same learner, one row", c2.status === 201 && c2j.data?.id === c1j.data?.id && count === 1 && c2.headers.get("idempotent-replayed") === "true");

    const dup = await learners.POST(mk("POST", "/learners", { email }), params({}));
    check("same email again → 409 email_taken", dup.status === 409 && (await dup.json()).error?.code === "email_taken");

    const list = await learners.GET(mk("GET", "/learners?limit=10"), params({}));
    const listJ = await list.json();
    check("GET /learners lists only this academy", list.status === 200 && listJ.data?.length === 1 && listJ.data[0].id === c1j.data.id && listJ.meta?.hasMore === false);

    const cross = await learner.GET(mk("GET", `/learners/${foreign.id}`), params({ id: foreign.id }));
    check("another academy's learner → 404 (tenant isolation)", cross.status === 404);
    const crossPatch = await learner.PATCH(mk("PATCH", `/learners/${foreign.id}`, { firstName: "Hacked" }), params({ id: foreign.id }));
    const foreignAfter = await rawPrisma.client.findUnique({ where: { id: foreign.id } });
    check("another academy's learner cannot be patched", crossPatch.status === 404 && foreignAfter?.firstName === null);

    const up = await byExt.PUT(mk("PUT", `/learners/by-external-id/EXT-${tag}`, { email, lastName: "Okafor" }), params({ externalId: `EXT-${tag}` }));
    const upJ = await up.json();
    check("PUT by-external-id updates the existing learner (200)", up.status === 200 && upJ.data?.id === c1j.data.id && upJ.data?.lastName === "Okafor", upJ);
    const up2 = await byExt.PUT(mk("PUT", `/learners/by-external-id/NEW-${tag}`, { email: `new-${tag}@example.com` }), params({ externalId: `NEW-${tag}` }));
    check("PUT by-external-id creates when unknown (201)", up2.status === 201);

    const ll = await loginLink.POST(mk("POST", `/learners/${c1j.data.id}/login-link`, {}), params({ id: c1j.data.id }));
    const llJ = await ll.json();
    const token = new URL(llJ.data?.url ?? "https://x/").searchParams.get("token") ?? "";
    check("login link minted on the academy's host", ll.status === 201 && (llJ.data?.url ?? "").includes(`zz-verify-${tag}.`) && token.length > 20, llJ);
    check("login link refused on another academy's host", (await consumeLoginLink(token, t2.id, null)).ok === false);
    const used1 = await consumeLoginLink(token, t1.id, "127.0.0.1");
    const used2 = await consumeLoginLink(token, t1.id, "127.0.0.1");
    check("login link works once", used1.ok && used1.ok === true && !used2.ok && used2.reason === "used");

    const logs = await rawPrisma.apiRequestLog.count({ where: { apiKeyId: keyRow.id } });
    const day = await rawPrisma.apiUsage.findFirst({ where: { apiKeyId: keyRow.id, period: "DAY" } });
    // Summed: the run can straddle a minute boundary.
    const minuteRow = (await rawPrisma.apiUsage.aggregate({ where: { apiKeyId: keyRow.id, period: "MINUTE" }, _sum: { count: true } }))._sum;
    const keyAfter = await rawPrisma.apiKey.findUnique({ where: { id: keyRow.id } });
    check("requests logged in ApiRequestLog", logs >= 9, logs);
    check("daily usage counted, errors included", !!day && day.count >= 9 && day.errorCount >= 3, day);
    check("minute buckets counted (rate-limit backstop)", (minuteRow.count ?? 0) >= 9, minuteRow);
    check("lastUsedAt recorded", !!keyAfter?.lastUsedAt);
    const audits = await rawPrisma.activityLog.count({ where: { tenantId: t1.id, actorType: "API_KEY", actorId: keyRow.id } });
    check("writes audited as API_KEY", audits >= 3, audits);

    const events = await rawPrisma.webhookEvent.findMany({ where: { tenantId: t1.id, type: "learner.created" }, include: { deliveries: true } });
    const del = events[0]?.deliveries[0];
    check("learner.created written to the outbox (one per new learner)", events.length === 2, events.length);
    check("payload enriched with the learner", (events[0]?.payloadJson as { learner?: { email?: string } } | undefined)?.learner?.email !== undefined);
    check("first attempt made inline, failed on DNS, retry scheduled", del?.status === "FAILED" && del.attempt === 1 && !!del.nextAttemptAt && /resolve/i.test(del.errorMessage ?? ""), del);
  } finally {
    await rawPrisma.activityLog.deleteMany({ where: { tenantId: { in: [t1.id, t2.id] } } });
    await rawPrisma.tenant.deleteMany({ where: { id: { in: [t1.id, t2.id] } } });
    const left = await rawPrisma.tenant.count({ where: { id: { in: [t1.id, t2.id] } } });
    check("throwaway academies deleted", left === 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
