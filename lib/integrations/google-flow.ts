import { integrationStateKey, verifyState, type StatePayload } from "@/lib/integrations/oauth";

/** Shared by the Google connect routes (start → callback → finish). */

export const GOOGLE_FLOW_COOKIE = "__mt-goauth";
export const GOOGLE_FLOW_COOKIE_PATH = "/api/integrations/google";
export const GOOGLE_STATE_TTL_SEC = 600;

export type GoogleState = StatePayload & { t: string; s: string; u: string; n: string };

export function readGoogleState(raw: string | null): GoogleState | null {
  if (!raw) return null;
  let key: Buffer;
  try {
    key = integrationStateKey();
  } catch {
    return null;
  }
  const r = verifyState<GoogleState>(raw, key);
  if (!r.ok) return null;
  const p = r.payload;
  if (typeof p.t !== "string" || typeof p.s !== "string" || typeof p.u !== "string" || typeof p.n !== "string") return null;
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(p.s)) return null;
  return p;
}
