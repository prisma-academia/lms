import { AsyncLocalStorage } from "node:async_hooks";
import { isProd } from "@/lib/env";

export type ContextMode = "platform" | "tenant-admin" | "tenant-client";

export type RequestContext = {
  mode: ContextMode;
  tenantId: string | null;
};

/** Short-lived cookie for tenant bootstrap before a session exists. */
export const BOOTSTRAP_TENANT_COOKIE = "__mt-bootstrap-tenant";

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Synchronous bootstrap slot for tenant-creation writes in the same request.
 * ALS/cookies can be invisible inside Prisma query hooks; this is armed
 * immediately before scoped bootstrap writes and disarmed in `finally`.
 * Stored on globalThis so all server bundles share one slot per process.
 */
const ARMED_BOOTSTRAP_KEY = Symbol.for("prisma-lms.armed-bootstrap-tenant");

type ArmedBootstrapGlobal = typeof globalThis & {
  [ARMED_BOOTSTRAP_KEY]?: string | null;
};

function armedGlobal(): ArmedBootstrapGlobal {
  return globalThis as ArmedBootstrapGlobal;
}

export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T> | T): Promise<T> | T {
  return storage.run(ctx, fn);
}

/**
 * Bind `ctx` for the remainder of the current async execution (and all
 * following awaited calls) without a callback. Used by auth guards / page
 * loaders so the Prisma tenant-scope guard covers the whole request handler.
 */
export function enterContext(ctx: RequestContext): void {
  storage.enterWith(ctx);
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No request context. Wrap with runWithContext().");
  return ctx;
}

export function requireTenantId(): string {
  const ctx = requireContext();
  if (!ctx.tenantId) throw new Error("Tenant context required but none set.");
  return ctx.tenantId;
}

/**
 * Bind a freshly created tenant for scoped bootstrap writes in the same request.
 * ALS is unreliable across Prisma/Next async boundaries; this cookie is read by
 * `resolveRequestContext` (same reliable path as session cookies).
 */
export async function bindBootstrapTenantContext(tenantId: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set(BOOTSTRAP_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 120,
  });
}

export async function clearBootstrapTenantContext(): Promise<void> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.delete(BOOTSTRAP_TENANT_COOKIE);
}

export function armBootstrapTenant(tenantId: string): void {
  armedGlobal()[ARMED_BOOTSTRAP_KEY] = tenantId;
}

export function disarmBootstrapTenant(): void {
  armedGlobal()[ARMED_BOOTSTRAP_KEY] = null;
}

export function peekArmedBootstrapTenant(): string | null {
  return armedGlobal()[ARMED_BOOTSTRAP_KEY] ?? null;
}
