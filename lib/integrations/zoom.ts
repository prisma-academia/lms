import { safeFetch } from "@/lib/integrations/safe-fetch";

/**
 * Zoom, through the academy's own Server-to-Server OAuth app: an access token
 * from the account credentials grant, then the Meetings API as that account.
 * Native fetch through safeFetch; no SDK.
 */

export type ZoomCredentials = { accountId: string; clientId: string; clientSecret: string };

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export class ZoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZoomError";
  }
}

function zoomMessage(status: number, body: string): string {
  try {
    const j = JSON.parse(body) as { reason?: string; message?: string; error?: string };
    return `Zoom answered ${status}: ${j.reason ?? j.message ?? j.error ?? "error"}`;
  } catch {
    return `Zoom answered ${status}.`;
  }
}

export async function zoomAccessToken(creds: ZoomCredentials, opts: { fresh?: boolean } = {}): Promise<string> {
  const cacheKey = `${creds.accountId}:${creds.clientId}`;
  const hit = tokenCache.get(cacheKey);
  if (!opts.fresh && hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`, "utf8").toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;
  const res = await safeFetch(url, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "" });
  if (res.status !== 200) throw new ZoomError(zoomMessage(res.status, res.body));
  const j = JSON.parse(res.body) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new ZoomError("Zoom did not return an access token.");
  tokenCache.set(cacheKey, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

async function zoomApi(creds: ZoomCredentials, method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = await zoomAccessToken(creds);
  const res = await safeFetch(`https://api.zoom.us/v2${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status < 200 || res.status >= 300) throw new ZoomError(zoomMessage(res.status, res.body));
  let json: Record<string, unknown> = {};
  if (res.body) {
    try {
      json = JSON.parse(res.body) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }
  return { status: res.status, json };
}

/** "Test connection": a token, then who the app acts as. */
export async function zoomWhoAmI(creds: ZoomCredentials): Promise<{ email: string | null; accountId: string | null }> {
  await zoomAccessToken(creds, { fresh: true });
  const { json } = await zoomApi(creds, "GET", "/users/me");
  return { email: typeof json.email === "string" ? json.email : null, accountId: typeof json.account_id === "string" ? json.account_id : null };
}

export type ZoomMeetingInput = {
  topic: string;
  agenda?: string | null;
  start: Date;
  durationMin: number;
  /** Recurring sessions get one standing meeting (type 3) with a single link. */
  recurring: boolean;
};

function meetingBody(m: ZoomMeetingInput): Record<string, unknown> {
  return {
    topic: m.topic.slice(0, 200),
    agenda: m.agenda ? m.agenda.slice(0, 2000) : undefined,
    type: m.recurring ? 3 : 2,
    ...(m.recurring ? {} : { start_time: m.start.toISOString().replace(/\.\d{3}Z$/, "Z"), duration: Math.max(15, Math.min(m.durationMin, 1440)), timezone: "UTC" }),
    settings: { join_before_host: false, waiting_room: true, mute_upon_entry: true },
  };
}

export async function createZoomMeeting(creds: ZoomCredentials, m: ZoomMeetingInput): Promise<{ id: string; joinUrl: string }> {
  const { json } = await zoomApi(creds, "POST", "/users/me/meetings", meetingBody(m));
  const id = json.id;
  const joinUrl = json.join_url;
  if ((typeof id !== "number" && typeof id !== "string") || typeof joinUrl !== "string") throw new ZoomError("Zoom did not return a meeting.");
  return { id: String(id), joinUrl };
}

export async function updateZoomMeeting(creds: ZoomCredentials, meetingId: string, m: ZoomMeetingInput): Promise<void> {
  await zoomApi(creds, "PATCH", `/meetings/${encodeURIComponent(meetingId)}`, meetingBody(m));
}
