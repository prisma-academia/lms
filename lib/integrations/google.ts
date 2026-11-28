import { env } from "@/lib/env";
import { apexHttpOrigin } from "@/lib/url/apex";
import { safeFetch } from "@/lib/integrations/safe-fetch";
import { formBody, pkceChallengeS256 } from "@/lib/integrations/oauth";
import { rrule, type IcsFrequency } from "@/lib/calendar/ics";

/**
 * Google Calendar + Meet through the PLATFORM's OAuth client (env
 * GOOGLE_OAUTH_CLIENT_ID / _SECRET). Authorization code + PKCE (S256), offline
 * access for a refresh token, hand-built on fetch.
 *
 * Academies live on subdomains, but Google needs every redirect URI listed in
 * advance, so there is exactly one: the apex host's
 * /api/integrations/google/callback, which hands over to the academy's own
 * host to finish (see those routes).
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${apexHttpOrigin()}/api/integrations/google/callback`;
}

export class GoogleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleError";
  }
}

function googleMessage(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { error?: string | { message?: string }; error_description?: string };
    const e = typeof j.error === "string" ? `${j.error}${j.error_description ? ` (${j.error_description})` : ""}` : j.error?.message;
    return `Google answered ${status}: ${e ?? "error"}`;
  } catch {
    return `Google answered ${status}.`;
  }
}

export function googleAuthUrl(input: { state: string; verifier: string; loginHint?: string | null }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", googleRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  // Always show consent so Google returns a refresh token on reconnect too.
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", input.state);
  u.searchParams.set("code_challenge", pkceChallengeS256(input.verifier));
  u.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) u.searchParams.set("login_hint", input.loginHint);
  return u.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string };

export async function exchangeGoogleCode(code: string, verifier: string): Promise<{ refreshToken: string; accessToken: string; expiresIn: number; email: string | null; scope: string }> {
  const res = await safeFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: formBody({
      grant_type: "authorization_code",
      code,
      redirect_uri: googleRedirectUri(),
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      code_verifier: verifier,
    }),
  });
  if (res.status !== 200) throw new GoogleError(googleMessage(res.status, res.body));
  const j = JSON.parse(res.body) as TokenResponse;
  if (!j.access_token) throw new GoogleError("Google did not return an access token.");
  if (!j.refresh_token) throw new GoogleError("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  let email: string | null = null;
  if (j.id_token) {
    try {
      // Straight from Google's token endpoint over TLS: the payload is trusted
      // for display only (which account was connected).
      const payload = JSON.parse(Buffer.from(j.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
      email = payload.email ?? null;
    } catch {
      email = null;
    }
  }
  return { refreshToken: j.refresh_token, accessToken: j.access_token, expiresIn: j.expires_in ?? 3600, email, scope: j.scope ?? "" };
}

const accessCache = new Map<string, { token: string; expiresAt: number }>();

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const hit = accessCache.get(refreshToken);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await safeFetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: formBody({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
  });
  if (res.status !== 200) {
    accessCache.delete(refreshToken);
    throw new GoogleError(googleMessage(res.status, res.body));
  }
  const j = JSON.parse(res.body) as TokenResponse;
  if (!j.access_token) throw new GoogleError("Google did not return an access token.");
  accessCache.set(refreshToken, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  accessCache.delete(token);
  try {
    const res = await safeFetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody({ token }),
    });
    return res.status === 200 || res.status === 400; // 400 = already invalid
  } catch {
    return false;
  }
}

async function calendarApi(refreshToken: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const token = await googleAccessToken(refreshToken);
  const res = await safeFetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { maxBytes: 256 * 1024 });
  if (res.status < 200 || res.status >= 300) throw new GoogleError(googleMessage(res.status, res.body));
  try {
    return res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** "Test connection": the primary calendar's id (its owner's address). */
export async function googlePrimaryCalendar(refreshToken: string): Promise<{ id: string | null; summary: string | null }> {
  const j = await calendarApi(refreshToken, "GET", "/calendars/primary");
  return { id: typeof j.id === "string" ? j.id : null, summary: typeof j.summary === "string" ? j.summary : null };
}

export type GoogleEventInput = {
  requestId: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  repeat?: { freq: IcsFrequency; until?: Date | null } | null;
};

function eventBody(e: GoogleEventInput, withConference: boolean): Record<string, unknown> {
  return {
    summary: e.summary.slice(0, 500),
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: { dateTime: e.start.toISOString(), timeZone: "UTC" },
    end: { dateTime: e.end.toISOString(), timeZone: "UTC" },
    ...(e.repeat ? { recurrence: [`RRULE:${rrule(e.repeat)}`] } : {}),
    ...(withConference
      ? { conferenceData: { createRequest: { requestId: e.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }
      : {}),
  };
}

function meetLink(j: Record<string, unknown>): string | null {
  if (typeof j.hangoutLink === "string") return j.hangoutLink;
  const cd = j.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined;
  return cd?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
}

export async function insertGoogleEvent(refreshToken: string, e: GoogleEventInput): Promise<{ id: string; joinUrl: string | null }> {
  const j = await calendarApi(refreshToken, "POST", "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none", eventBody(e, true));
  if (typeof j.id !== "string") throw new GoogleError("Google did not return an event.");
  return { id: j.id, joinUrl: meetLink(j) };
}

/** Meet links are occasionally still "pending" in the insert response; read it back once. */
export async function googleEventMeetLink(refreshToken: string, eventId: string): Promise<string | null> {
  const j = await calendarApi(refreshToken, "GET", `/calendars/primary/events/${encodeURIComponent(eventId)}`);
  return meetLink(j);
}

export async function patchGoogleEvent(refreshToken: string, eventId: string, e: GoogleEventInput): Promise<{ joinUrl: string | null }> {
  const j = await calendarApi(refreshToken, "PATCH", `/calendars/primary/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=none`, eventBody(e, false));
  return { joinUrl: meetLink(j) };
}
