import { createHash, randomBytes } from "node:crypto";
import { ZodError, type z } from "zod";
import { AuthError } from "@/lib/auth/guards";
import { DomainError } from "@/lib/api/errors";
import { resolveHost } from "@/lib/auth/context";
import { runWithContext } from "@/lib/db/tenant-context";
import { logger } from "@/lib/logger";
import { bearerFrom, clientIpOf, hashApiKey, ipAllowedBy, looksLikeApiKey } from "./keys";
import type { ApiScope } from "./scopes";

/**
 * The /api/v1 request pipeline, independent of where keys and counters live.
 * `lib/api/v1/route.ts` wires it to Prisma; the verify script wires it to an
 * in-memory store. Order matters and is the plan's:
 *
 *  1. Bearer key only. Cookies are never read, so there is no CSRF exposure.
 *  2. Look the key up by hash; refuse revoked, expired, outside its allowlist.
 *  3. On an academy subdomain, the key must belong to that academy.
 *  4. Bind tenant-admin context for the key's academy (ALS `run`, which is
 *     reliable across awaits, unlike `enterWith`).
 *  5. Scope check.
 *  6. Per-key rate limit with X-RateLimit-* headers (DB counter; Upstash too
 *     when configured, which fails open on its own).
 *  7. Idempotency-Key on POST/PATCH/PUT: same key + same request → the first
 *     response, replayed; same key + different request → 422.
 *  8. `{ data, error, meta }` envelope + X-Request-Id.
 *  9. Request log, daily usage and lastUsedAt, written after the response.
 */

export type ApiKeyRecord = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantStatus: string;
  name: string;
  prefix: string;
  scopes: string[];
  ipAllowlist: string[];
  rateLimitPerMin: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

export type IdempotencyBegin =
  | { kind: "new" }
  | { kind: "replay"; status: number; body: string }
  | { kind: "mismatch" }
  | { kind: "in_progress" };

export type RequestLogEntry = {
  requestId: string;
  method: string;
  path: string;
  query: string | null;
  status: number;
  durationMs: number;
  errorCode: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type PipelineStore = {
  findKeyByHash(hash: string): Promise<ApiKeyRecord | null>;
  /** Count this request in the key's current minute; returns the new count. */
  hitMinute(key: ApiKeyRecord, bucket: Date): Promise<number>;
  idempotencyBegin(key: ApiKeyRecord, input: { idemKey: string; method: string; path: string; requestHash: string; expiresAt: Date }): Promise<IdempotencyBegin>;
  idempotencyFinish(key: ApiKeyRecord, idemKey: string, status: number, body: string): Promise<void>;
  idempotencyAbort(key: ApiKeyRecord, idemKey: string): Promise<void>;
  record(key: ApiKeyRecord, entry: RequestLogEntry): Promise<void>;
};

export type PipelineDeps = {
  store: PipelineStore;
  /** Run work after the response; returns once it is scheduled (or done). */
  defer: (work: () => Promise<void>) => Promise<void>;
  /** Optional second limiter (Upstash). Throws DomainError(429) when over. */
  extraLimit?: (key: ApiKeyRecord) => Promise<void>;
  now?: () => Date;
};

export type ApiKeyActor = {
  kind: "api_key";
  keyId: string;
  tenantId: string;
  tenantSlug: string;
  name: string;
  prefix: string;
  scopes: ReadonlySet<string>;
};

export type ApiCtx<P> = {
  request: Request;
  url: URL;
  params: P;
  key: ApiKeyActor;
  tenantId: string;
  tenantSlug: string;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  /** Parse the JSON body against a schema. Empty body = `{}`. */
  json<S extends z.ZodType>(schema: S): z.infer<S>;
  /** Parse the query string (as a flat object) against a schema. */
  query<S extends z.ZodType>(schema: S): z.infer<S>;
  /** Fields to spread into `audit()`. */
  auditActor: { actorType: "API_KEY"; actorId: string; tenantId: string; ip: string | null; userAgent: string | null };
};

export type ApiResult = {
  data: unknown;
  meta?: Record<string, unknown>;
  status?: number;
};

export type ApiHandler<P> = (ctx: ApiCtx<P>) => Promise<ApiResult>;

export type RouteOptions = {
  /** Required scope; null = any valid key (e.g. GET /v1/me). */
  scope: ApiScope | null;
};

const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "PUT"]);
const BODY_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function bigintAsString(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function envelope(data: unknown, error: { code: string; message: string } | null, meta?: Record<string, unknown>): string {
  return JSON.stringify({ data, error, ...(meta ? { meta } : {}) }, bigintAsString);
}

type Failure = { status: number; code: string; message: string; headers?: Record<string, string> };

function fail(status: number, code: string, message: string, headers?: Record<string, string>): Failure {
  return { status, code, message, headers };
}

function isPrismaKnown(err: unknown): err is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "PrismaClientKnownRequestError" &&
    typeof (err as { code?: unknown }).code === "string"
  );
}

export function toFailure(err: unknown, requestId: string): Failure {
  if (err instanceof AuthError) {
    return fail(err.status, err.status === 401 ? "unauthorized" : "forbidden", err.message);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(400, "validation_error", `${first?.path.join(".") || "input"}: ${first?.message ?? "invalid"}`);
  }
  if (err instanceof DomainError) return fail(err.status, err.code, err.message);
  if (isPrismaKnown(err)) {
    if (err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.join(", ") : typeof target === "string" ? target : "a unique field";
      return fail(409, "conflict", `Another record already uses that value (${fields}).`);
    }
    if (err.code === "P2025") return fail(404, "not_found", "Not found.");
  }
  logger.error({ err, requestId }, "api_v1_unhandled_error");
  return fail(500, "server_error", `Something went wrong on our side. Quote request id ${requestId} if it keeps happening.`);
}

function newRequestId(incoming: string | null): string {
  if (incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming)) return incoming;
  return `req_${randomBytes(12).toString("base64url")}`;
}

function minuteBucket(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

export function createApiRoute(deps: PipelineDeps) {
  const now = deps.now ?? (() => new Date());

  return function apiRoute<P = Record<string, never>>(opts: RouteOptions, handler: ApiHandler<P>) {
    return async (request: Request, routeCtx?: { params?: Promise<P> | P }): Promise<Response> => {
      const started = Date.now();
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const requestId = newRequestId(request.headers.get("x-request-id"));
      const ip = clientIpOf(request.headers);
      const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
      const headers: Record<string, string> = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-request-id": requestId,
      };

      const respond = (status: number, body: string, extra?: Record<string, string>) =>
        new Response(body, { status, headers: { ...headers, ...(extra ?? {}) } });
      const respondFail = (f: Failure) => respond(f.status, envelope(null, { code: f.code, message: f.message }), f.headers);

      // ── 1–2. Authenticate. Nothing below runs for a caller we cannot name. ──
      const raw = bearerFrom(request.headers.get("authorization"));
      if (!raw) {
        return respondFail(fail(401, "missing_api_key", "Send your API key as: Authorization: Bearer plms_live_…", { "www-authenticate": 'Bearer realm="api"' }));
      }
      if (!looksLikeApiKey(raw)) {
        return respondFail(fail(401, "invalid_api_key", "That is not a valid API key.", { "www-authenticate": 'Bearer error="invalid_token"' }));
      }
      let key: ApiKeyRecord | null;
      try {
        key = await deps.store.findKeyByHash(hashApiKey(raw));
      } catch (err) {
        return respondFail(toFailure(err, requestId));
      }
      if (!key) {
        return respondFail(fail(401, "invalid_api_key", "That API key is not recognised.", { "www-authenticate": 'Bearer error="invalid_token"' }));
      }
      const at = now();
      if (key.revokedAt && key.revokedAt.getTime() <= at.getTime()) {
        return respondFail(fail(401, "api_key_revoked", "This API key has been revoked."));
      }
      if (key.expiresAt && key.expiresAt.getTime() <= at.getTime()) {
        return respondFail(fail(401, "api_key_expired", "This API key has expired."));
      }
      if (!ipAllowedBy(ip, key.ipAllowlist)) {
        return respondFail(fail(403, "ip_not_allowed", `This API key may not be used from ${ip ?? "an unknown address"}.`));
      }
      if (key.tenantStatus !== "ACTIVE") {
        return respondFail(fail(403, "tenant_inactive", "This academy is not active."));
      }

      // ── 3. Host check. ──
      const host = resolveHost(request.headers.get("host"));
      if (host.mode === "unknown") {
        return respondFail(fail(404, "unknown_host", "Unknown host."));
      }
      if (host.mode === "tenant" && host.slug !== key.tenantSlug) {
        return respondFail(fail(403, "wrong_tenant_host", "This API key belongs to a different academy than this address."));
      }

      const k = key;
      const actor: ApiKeyActor = {
        kind: "api_key",
        keyId: k.id,
        tenantId: k.tenantId,
        tenantSlug: k.tenantSlug,
        name: k.name,
        prefix: k.prefix,
        scopes: new Set(k.scopes),
      };

      // ── 4. Everything after this point runs bound to the key's academy. ──
      const response = await runWithContext({ mode: "tenant-admin", tenantId: k.tenantId }, async () => {
        let status = 500;
        let errorCode: string | null = null;
        let res: Response;
        try {
          // ── 5. Scope. ──
          if (opts.scope && !actor.scopes.has(opts.scope)) {
            throw new DomainError(403, "insufficient_scope", `This API key lacks the "${opts.scope}" scope.`);
          }

          // ── 6. Rate limit. ──
          const bucket = minuteBucket(at);
          const count = await deps.store.hitMinute(k, bucket);
          const limit = Math.max(1, k.rateLimitPerMin);
          const reset = Math.ceil((bucket.getTime() + 60_000) / 1000);
          headers["x-ratelimit-limit"] = String(limit);
          headers["x-ratelimit-remaining"] = String(Math.max(0, limit - count));
          headers["x-ratelimit-reset"] = String(reset);
          if (count > limit) {
            const retry = Math.max(1, reset - Math.floor(at.getTime() / 1000));
            throw Object.assign(new DomainError(429, "rate_limited", `Rate limit of ${limit} requests per minute exceeded.`), { retryAfter: retry });
          }
          if (deps.extraLimit) await deps.extraLimit(k);

          // ── Body (read once: the idempotency hash needs the exact bytes). ──
          const rawBody = BODY_METHODS.has(method) ? await request.text() : "";
          let parsedBody: unknown | undefined;
          const ctx: ApiCtx<P> = {
            request,
            url,
            params: ((await routeCtx?.params) ?? {}) as P,
            key: actor,
            tenantId: k.tenantId,
            tenantSlug: k.tenantSlug,
            requestId,
            ip,
            userAgent,
            json(schema) {
              if (parsedBody === undefined) {
                if (rawBody.trim() === "") parsedBody = {};
                else {
                  try {
                    parsedBody = JSON.parse(rawBody);
                  } catch {
                    throw new DomainError(400, "invalid_json", "The request body is not valid JSON.");
                  }
                }
              }
              return schema.parse(parsedBody);
            },
            query(schema) {
              const obj: Record<string, string> = {};
              url.searchParams.forEach((v, name) => {
                obj[name] = v;
              });
              return schema.parse(obj);
            },
            auditActor: { actorType: "API_KEY", actorId: k.id, tenantId: k.tenantId, ip, userAgent },
          };

          // ── 7. Idempotency. ──
          let replay: { status: number; body: string } | null = null;
          const idemKey = IDEMPOTENT_METHODS.has(method) ? request.headers.get("idempotency-key")?.trim() || null : null;
          if (idemKey !== null && (idemKey.length > 255 || !/^[\x21-\x7e]+$/.test(idemKey))) {
            throw new DomainError(400, "invalid_idempotency_key", "Idempotency-Key must be 1–255 visible ASCII characters.");
          }
          if (idemKey) {
            const requestHash = createHash("sha256").update(`${method} ${url.pathname}${url.search}\n${rawBody}`).digest("hex");
            const begun = await deps.store.idempotencyBegin(k, {
              idemKey,
              method,
              path: url.pathname,
              requestHash,
              expiresAt: new Date(at.getTime() + IDEMPOTENCY_TTL_MS),
            });
            if (begun.kind === "replay") replay = { status: begun.status, body: begun.body };
            if (begun.kind === "mismatch") {
              throw new DomainError(422, "idempotency_key_reused", "This Idempotency-Key was already used for a different request.");
            }
            if (begun.kind === "in_progress") {
              throw new DomainError(409, "idempotency_in_progress", "A request with this Idempotency-Key is still being processed.");
            }
          }

          if (replay) {
            status = replay.status;
            res = respond(replay.status, replay.body, { "idempotent-replayed": "true" });
          } else {
            // ── 8. Handler. ──
            let body: string;
            try {
              const result = await handler(ctx);
              status = result.status ?? 200;
              body = envelope(result.data ?? null, null, result.meta);
            } catch (err) {
              const f = toFailure(err, requestId);
              status = f.status;
              errorCode = f.code;
              body = envelope(null, { code: f.code, message: f.message });
            }
            if (idemKey) {
              try {
                if (status >= 500) await deps.store.idempotencyAbort(k, idemKey);
                else await deps.store.idempotencyFinish(k, idemKey, status, body);
              } catch (err) {
                logger.warn({ err, requestId }, "api_idempotency_store_failed");
              }
            }
            res = respond(status, body);
          }
        } catch (err) {
          const f = toFailure(err, requestId);
          status = f.status;
          errorCode = f.code;
          const retryAfter = (err as { retryAfter?: number }).retryAfter;
          res = respondFail({ ...f, headers: retryAfter ? { "retry-after": String(retryAfter) } : undefined });
        }

        // ── 9. Log, after the response. A logging failure is never the caller's problem. ──
        const entry: RequestLogEntry = {
          requestId,
          method,
          path: url.pathname.slice(0, 300),
          query: url.search ? url.search.slice(1, 500) : null,
          status,
          durationMs: Date.now() - started,
          errorCode,
          ip,
          userAgent,
        };
        try {
          await deps.defer(async () => {
            try {
              await deps.store.record(k, entry);
            } catch (err) {
              logger.warn({ err, requestId }, "api_request_log_failed");
            }
          });
        } catch (err) {
          logger.warn({ err, requestId }, "api_request_log_schedule_failed");
        }
        return res;
      });
      return response;
    };
  };
}
