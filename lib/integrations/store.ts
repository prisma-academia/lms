import { prisma } from "@/lib/db/client";
import { openSecret, sealSecret } from "@/lib/crypto/secret-box";
import type { Prisma, TenantIntegration } from "@/lib/generated/prisma/client";

/**
 * Reading and writing TenantIntegration rows. Credentials are one JSON object
 * sealed with secret-box, bound (aad) to the academy and provider, so a
 * ciphertext copied to another row or academy does not open.
 *
 * Callers run inside a tenant context (the Prisma guard adds tenantId).
 */

export type IntegrationSecrets = Record<string, string>;

function aadFor(tenantId: string, provider: string): string {
  return `tenant-integration:${tenantId}:${provider}`;
}

export function sealSecrets(tenantId: string, provider: string, secrets: IntegrationSecrets): string {
  return sealSecret(JSON.stringify(secrets), aadFor(tenantId, provider));
}

export function openSecrets(row: Pick<TenantIntegration, "tenantId" | "provider" | "secretsEnc">): IntegrationSecrets {
  if (!row.secretsEnc) return {};
  const parsed = JSON.parse(openSecret(row.secretsEnc, aadFor(row.tenantId, row.provider))) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  const out: IntegrationSecrets = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

export function configOf(row: Pick<TenantIntegration, "configJson">): Record<string, unknown> {
  const c = row.configJson;
  return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

/** Masked hint for a secret: "••••abcd". */
export function maskSecret(value: string | undefined): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

export async function markOk(id: string, extra: { config?: Record<string, unknown> } = {}): Promise<void> {
  await prisma.tenantIntegration.update({
    where: { id },
    data: {
      lastSyncAt: new Date(),
      lastError: null,
      lastErrorAt: null,
      ...(extra.config ? { configJson: extra.config as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function markError(id: string, message: string): Promise<void> {
  await prisma.tenantIntegration.update({
    where: { id },
    data: { lastError: message.slice(0, 500), lastErrorAt: new Date() },
  });
}

export type IntegrationView = {
  id: string;
  provider: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  /** Field key → masked hint, for secrets that are set. */
  secretHints: Record<string, string>;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
};

/** A row as the admin UI may see it: config, masked secrets, status. */
export function toView(row: TenantIntegration): IntegrationView {
  let hints: Record<string, string> = {};
  try {
    const s = openSecrets(row);
    hints = Object.fromEntries(
      Object.entries(s)
        .filter(([k]) => k !== "refreshToken" && k !== "accessToken")
        .map(([k, v]) => [k, maskSecret(v) ?? ""])
    );
  } catch {
    hints = {};
  }
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    status: row.status,
    config: configOf(row),
    secretHints: hints,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listIntegrations(tenantId: string): Promise<IntegrationView[]> {
  const rows = await prisma.tenantIntegration.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
  return rows.map(toView);
}
