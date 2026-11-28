import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/api/errors";
import { encryptionConfigured, sealSecret } from "@/lib/crypto/secret-box";
import { assertSafeUrl, SafeFetchError } from "./safe-fetch";
import { isKnownEventType } from "./webhook-catalogue";
import { newWebhookSecret } from "./webhook-signing";
import { SECRET_AAD } from "./webhook-delivery";

/** Endpoints per academy. Generous for real use, small enough to stop a loop. */
export const MAX_ENDPOINTS = 25;
/** How long the previous secret keeps signing after a rotation. */
export const SECRET_OVERLAP_MS = 24 * 3600_000;

export async function validateEndpointUrl(url: string): Promise<string> {
  try {
    return (await assertSafeUrl(url)).toString();
  } catch (err) {
    if (err instanceof SafeFetchError) throw new DomainError(400, "invalid_url", err.message);
    throw err;
  }
}

export function validateEvents(events: string[]): string[] {
  const unique = [...new Set(events.map((e) => e.trim()).filter(Boolean))];
  if (unique.length === 0) throw new DomainError(400, "invalid_events", "Choose at least one event.");
  const unknown = unique.filter((e) => !isKnownEventType(e));
  if (unknown.length) throw new DomainError(400, "invalid_events", `Unknown event type: ${unknown.join(", ")}.`);
  return unique.includes("*") ? ["*"] : unique;
}

function requireEncryption() {
  if (!encryptionConfigured()) {
    throw new DomainError(503, "encryption_not_configured", "Webhooks are not available: the server's APP_ENCRYPTION_KEY is not set.");
  }
}

export async function createEndpoint(input: {
  tenantId: string;
  url: string;
  events: string[];
  description?: string | null;
  source: "portal" | "rest_hook";
  apiKeyId?: string | null;
  createdById?: string | null;
}) {
  requireEncryption();
  const url = await validateEndpointUrl(input.url);
  const events = validateEvents(input.events);
  const count = await prisma.webhookEndpoint.count({ where: { tenantId: input.tenantId } });
  if (count >= MAX_ENDPOINTS) throw new DomainError(409, "too_many_endpoints", `An academy can have at most ${MAX_ENDPOINTS} webhook endpoints.`);
  const secret = newWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      tenantId: input.tenantId,
      url,
      events,
      description: input.description?.trim() || null,
      secretEnc: sealSecret(secret, SECRET_AAD),
      source: input.source,
      apiKeyId: input.apiKeyId ?? null,
      createdById: input.createdById ?? null,
    },
  });
  return { endpoint, secret };
}

/** New secret now; the old one keeps signing (alongside) for 24 hours. */
export async function rotateEndpointSecret(tenantId: string, id: string) {
  requireEncryption();
  const ep = await prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
  if (!ep) throw new DomainError(404, "not_found", "Webhook endpoint not found.");
  const secret = newWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id },
    data: {
      secretEnc: sealSecret(secret, SECRET_AAD),
      previousSecretEnc: ep.secretEnc,
      previousSecretExpiresAt: new Date(Date.now() + SECRET_OVERLAP_MS),
    },
  });
  return { endpoint, secret };
}
