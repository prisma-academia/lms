import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { encryptionConfigured } from "@/lib/crypto/secret-box";
import { isKnownEventType } from "@/lib/integrations/webhook-catalogue";
import { validateAlertUrl } from "@/lib/integrations/alert-format";
import { assertSafeUrl, SafeFetchError } from "@/lib/integrations/safe-fetch";
import { discover } from "@/lib/integrations/oidc";
import { configOf, openSecrets, sealSecrets, type IntegrationSecrets } from "@/lib/integrations/store";
import { isAlertProvider, isSsoProvider, providerInfo, type ProviderId } from "@/lib/integrations/registry";
import { ssoSettings } from "@/lib/integrations/sso";
import type { Prisma, TenantIntegration } from "@/lib/generated/prisma/client";

/**
 * Create / update validation for every provider the hub stores. One place, so
 * the routes stay thin and the rules (hosts, required fields, the single
 * meeting provider) cannot drift between create and edit.
 *
 * Secrets: a blank secret on update means "keep the saved one".
 */

export const SaveBody = z.object({
  provider: z.string().min(1).max(40),
  name: z.string().max(80).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  secrets: z.record(z.string(), z.string().max(4000)).default({}),
  enabled: z.boolean().optional(),
});
export type SaveInput = z.infer<typeof SaveBody>;

const bad = (message: string) => new DomainError(400, "invalid_integration", message);

function text(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function domains(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    if (!d) continue;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw bad(`“${d}” is not a domain name.`);
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > 20) throw bad("At most 20 allowed domains.");
  return out;
}

export type Prepared = { name: string; config: Record<string, unknown>; secrets: IntegrationSecrets };

/** Validate and normalise. `existing` is the row being edited, if any. */
export async function prepare(provider: ProviderId, input: SaveInput, existing: TenantIntegration | null): Promise<Prepared> {
  const prevConfig = existing ? configOf(existing) : {};
  let prevSecrets: IntegrationSecrets = {};
  if (existing) {
    try {
      prevSecrets = openSecrets(existing);
    } catch {
      prevSecrets = {};
    }
  }
  const secret = (key: string): string => text(input.secrets[key], 4000) || prevSecrets[key] || "";
  const cfg = input.config;

  if (isAlertProvider(provider)) {
    const name = text(input.name ?? existing?.name, 80);
    if (!name) throw bad("Give the channel a name.");
    const url = secret("webhookUrl");
    if (!url) throw bad("Paste the incoming webhook URL.");
    const checked = validateAlertUrl(provider, url);
    if (!checked.ok) throw bad(checked.message);
    const events = Array.isArray(cfg.events) ? cfg.events.filter((e): e is string => typeof e === "string") : [];
    if (events.length === 0) throw bad("Pick at least one event to send.");
    const unknown = events.find((e) => !isKnownEventType(e));
    if (unknown) throw bad(`Unknown event “${unknown}”.`);
    return { name, config: { events: [...new Set(events)] }, secrets: { webhookUrl: checked.url } };
  }

  if (provider === "zoom") {
    const accountId = text(cfg.accountId ?? prevConfig.accountId, 100);
    const clientId = text(cfg.clientId ?? prevConfig.clientId, 200);
    const clientSecret = secret("clientSecret");
    if (!accountId || !clientId || !clientSecret) throw bad("Account ID, Client ID and Client secret are all required.");
    return { name: "", config: { accountId, clientId, autoCreate: cfg.autoCreate === true }, secrets: { clientSecret } };
  }

  if (provider === "google_calendar") {
    if (!existing) throw bad("Connect Google Calendar with the Connect button.");
    return { name: "", config: { ...prevConfig, autoCreate: cfg.autoCreate === true }, secrets: prevSecrets };
  }

  if (isSsoProvider(provider)) {
    const info = providerInfo(provider)!;
    const name = text(input.name ?? existing?.name, 80) || info.name;
    const clientId = text(cfg.clientId ?? prevConfig.clientId, 300);
    const clientSecret = secret("clientSecret");
    if (!clientId || !clientSecret) throw bad("Client ID and Client secret are required.");
    const audience = cfg.audience === "staff" || cfg.audience === "both" ? cfg.audience : "learners";
    const config: Record<string, unknown> = {
      clientId,
      audience,
      allowedDomains: domains(cfg.allowedDomains ?? prevConfig.allowedDomains),
      jit: cfg.jit === true,
      buttonLabel: text(cfg.buttonLabel, 60),
    };
    if (provider === "oidc_entra") {
      const dir = text(cfg.directoryId ?? prevConfig.directoryId, 100);
      if (!dir) throw bad("Enter your Directory (tenant) ID.");
      if (["common", "organizations", "consumers"].includes(dir.toLowerCase())) {
        throw bad("Use your own directory ID or domain, not “common”: sign-ins must come from your organisation only.");
      }
      if (!/^[A-Za-z0-9.-]+$/.test(dir)) throw bad("That is not a directory ID or domain.");
      config.directoryId = dir;
    }
    if (provider === "oidc_generic") {
      const issuer = text(cfg.issuer ?? prevConfig.issuer, 500).replace(/\/+$/, "");
      try {
        await assertSafeUrl(issuer);
      } catch (err) {
        throw bad(err instanceof SafeFetchError ? `Issuer URL: ${err.message}` : "The issuer URL is not valid.");
      }
      config.issuer = issuer;
    }
    // Prove the issuer answers before saving, and keep its endpoints.
    const settings = ssoSettings({ provider, configJson: config as Prisma.JsonValue, name });
    try {
      config.discovery = await discover(settings.issuer);
      config.discoveredAt = new Date().toISOString();
    } catch (err) {
      throw bad(err instanceof Error ? err.message : "Could not read the provider's OpenID configuration.");
    }
    return { name, config, secrets: { clientSecret } };
  }

  throw bad("This integration has no settings to save.");
}

/** Only one meeting provider auto-creates. Call after saving `keepId` with autoCreate on. */
export async function enforceSingleMeetingProvider(tenantId: string, keepId: string): Promise<void> {
  const others = await prisma.tenantIntegration.findMany({
    where: { tenantId, provider: { in: ["zoom", "google_calendar"] }, id: { not: keepId } },
  });
  for (const o of others) {
    const c = configOf(o);
    if (c.autoCreate === true) {
      await prisma.tenantIntegration.update({ where: { id: o.id }, data: { configJson: { ...c, autoCreate: false } as Prisma.InputJsonValue } });
    }
  }
}

export function requireEncryption(): void {
  if (!encryptionConfigured()) {
    throw new DomainError(503, "encryption_not_configured", "APP_ENCRYPTION_KEY is not set on the server, so credentials cannot be stored safely. Ask the platform operator to set it.");
  }
}

export async function saveIntegration(
  tenantId: string,
  userId: string,
  provider: ProviderId,
  input: SaveInput,
  existing: TenantIntegration | null
): Promise<TenantIntegration> {
  requireEncryption();
  const prepared = await prepare(provider, input, existing);
  const data = {
    name: prepared.name,
    configJson: prepared.config as Prisma.InputJsonValue,
    secretsEnc: sealSecrets(tenantId, provider, prepared.secrets),
    status: input.enabled === false ? ("DISABLED" as const) : ("CONNECTED" as const),
    lastError: null,
    lastErrorAt: null,
  };
  let row: TenantIntegration;
  try {
    row = existing
      ? await prisma.tenantIntegration.update({ where: { id: existing.id }, data })
      : await prisma.tenantIntegration.create({ data: { ...data, tenantId, provider, connectedById: userId } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new DomainError(409, "duplicate", providerInfo(provider)?.multiple ? "Another connection already has that name." : "This integration is already connected.");
    }
    throw err;
  }
  if ((provider === "zoom" || provider === "google_calendar") && prepared.config.autoCreate === true) {
    await enforceSingleMeetingProvider(tenantId, row.id);
  }
  return row;
}
