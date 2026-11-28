import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { audit } from "@/lib/auth/audit";
import { isValidAllowlistEntry, newApiKey } from "@/lib/api/v1/keys";
import { ALL_API_SCOPES, type ApiScope } from "@/lib/api/v1/scopes";

/**
 * The developer portal's server side (/admin/developers): API keys and the
 * shapes the portal shows. Webhook endpoints live in lib/integrations/endpoints.
 */

export const MAX_ACTIVE_KEYS = 50;
export const ROTATION_OVERLAP_MS = 24 * 3600_000;

export const KeyCreate = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(ALL_API_SCOPES as [ApiScope, ...ApiScope[]])).min(1),
  ipAllowlist: z
    .array(z.string().trim().min(1).max(60))
    .max(50)
    .default([])
    .refine((list) => list.every(isValidAllowlistEntry), { message: "Each entry must be an IP address or CIDR range, e.g. 41.58.0.0/16." }),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  rateLimitPerMin: z.number().int().min(10).max(1000).default(120),
});

type Actor = { userId: string; tenantId: string; ip?: string | null; userAgent?: string | null };

export type KeyView = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  ipAllowlist: string[];
  rateLimitPerMin: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  rotatedFromId: string | null;
  createdAt: string;
  state: "active" | "expiring" | "expired" | "revoked";
};

export function keyView(k: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  ipAllowlist: string[];
  rateLimitPerMin: number;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  revokedAt: Date | null;
  rotatedFromId: string | null;
  createdAt: Date;
}): KeyView {
  const now = Date.now();
  const state: KeyView["state"] = k.revokedAt
    ? "revoked"
    : k.expiresAt && k.expiresAt.getTime() <= now
      ? "expired"
      : k.expiresAt && k.expiresAt.getTime() - now < 7 * 86_400_000
        ? "expiring"
        : "active";
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    ipAllowlist: k.ipAllowlist,
    rateLimitPerMin: k.rateLimitPerMin,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: k.lastUsedIp,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    rotatedFromId: k.rotatedFromId,
    createdAt: k.createdAt.toISOString(),
    state,
  };
}

export async function listKeys(tenantId: string): Promise<KeyView[]> {
  const rows = await prisma.apiKey.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map(keyView);
}

async function insertKey(tenantId: string, data: { name: string; scopes: string[]; ipAllowlist: string[]; expiresAt: Date | null; rateLimitPerMin: number; createdById: string; rotatedFromId?: string }) {
  for (let i = 0; i < 3; i++) {
    const { key, prefix, hash } = newApiKey();
    try {
      const row = await prisma.apiKey.create({ data: { tenantId, prefix, keyHash: hash, ...data } });
      return { row, key };
    } catch (err) {
      // An 8-character prefix collision is rare but possible; draw again.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new DomainError(500, "key_generation_failed", "Could not generate a unique key. Try again.");
}

export async function createKey(actor: Actor, input: z.infer<typeof KeyCreate>) {
  const active = await prisma.apiKey.count({ where: { tenantId: actor.tenantId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (active >= MAX_ACTIVE_KEYS) throw new DomainError(409, "too_many_keys", `An academy can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw new DomainError(400, "validation_error", "expiresAt must be in the future.");
  const { row, key } = await insertKey(actor.tenantId, {
    name: input.name,
    scopes: [...new Set(input.scopes)],
    ipAllowlist: input.ipAllowlist,
    expiresAt,
    rateLimitPerMin: input.rateLimitPerMin,
    createdById: actor.userId,
  });
  await audit({
    actorType: "TENANT_USER",
    actorId: actor.userId,
    action: "api_key.create",
    tenantId: actor.tenantId,
    targetType: "ApiKey",
    targetId: row.id,
    after: { name: row.name, prefix: row.prefix, scopes: row.scopes },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
  return { key, view: keyView(row) };
}

/** A new key with the same settings; the old one keeps working for 24 hours. */
export async function rotateKey(actor: Actor, id: string) {
  const old = await prisma.apiKey.findFirst({ where: { id, tenantId: actor.tenantId } });
  if (!old) throw new DomainError(404, "not_found", "API key not found.");
  if (old.revokedAt) throw new DomainError(409, "revoked", "A revoked key cannot be rotated.");
  const now = Date.now();
  if (old.expiresAt && old.expiresAt.getTime() <= now) throw new DomainError(409, "expired", "An expired key cannot be rotated. Create a new one.");
  const { row, key } = await insertKey(actor.tenantId, {
    name: old.name,
    scopes: old.scopes,
    ipAllowlist: old.ipAllowlist,
    expiresAt: old.expiresAt,
    rateLimitPerMin: old.rateLimitPerMin,
    createdById: actor.userId,
    rotatedFromId: old.id,
  });
  const graceEnd = new Date(now + ROTATION_OVERLAP_MS);
  const previous = await prisma.apiKey.update({
    where: { id: old.id },
    data: { expiresAt: old.expiresAt && old.expiresAt < graceEnd ? old.expiresAt : graceEnd },
  });
  await audit({
    actorType: "TENANT_USER",
    actorId: actor.userId,
    action: "api_key.rotate",
    tenantId: actor.tenantId,
    targetType: "ApiKey",
    targetId: row.id,
    before: { id: old.id, prefix: old.prefix },
    after: { prefix: row.prefix, oldKeyExpiresAt: previous.expiresAt?.toISOString() ?? null },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
  return { key, view: keyView(row), previous: keyView(previous) };
}

export async function revokeKey(actor: Actor, id: string) {
  const k = await prisma.apiKey.findFirst({ where: { id, tenantId: actor.tenantId } });
  if (!k) throw new DomainError(404, "not_found", "API key not found.");
  if (k.revokedAt) return keyView(k);
  const row = await prisma.apiKey.update({ where: { id: k.id }, data: { revokedAt: new Date() } });
  await audit({
    actorType: "TENANT_USER",
    actorId: actor.userId,
    action: "api_key.revoke",
    tenantId: actor.tenantId,
    targetType: "ApiKey",
    targetId: k.id,
    before: { prefix: k.prefix },
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });
  return keyView(row);
}

export type EndpointView = {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: "ACTIVE" | "DISABLED";
  source: string;
  consecutiveFailures: number;
  failingSince: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  rotatingUntil: string | null;
  createdAt: string;
};

export function endpointView(e: {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  status: "ACTIVE" | "DISABLED";
  source: string;
  consecutiveFailures: number;
  failingSince: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  disabledAt: Date | null;
  disabledReason: string | null;
  previousSecretExpiresAt: Date | null;
  createdAt: Date;
}): EndpointView {
  return {
    id: e.id,
    url: e.url,
    description: e.description,
    events: e.events,
    status: e.status,
    source: e.source,
    consecutiveFailures: e.consecutiveFailures,
    failingSince: e.failingSince?.toISOString() ?? null,
    lastSuccessAt: e.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: e.lastFailureAt?.toISOString() ?? null,
    disabledAt: e.disabledAt?.toISOString() ?? null,
    disabledReason: e.disabledReason,
    rotatingUntil: e.previousSecretExpiresAt && e.previousSecretExpiresAt > new Date() ? e.previousSecretExpiresAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

export async function listEndpoints(tenantId: string): Promise<EndpointView[]> {
  const rows = await prisma.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map(endpointView);
}
