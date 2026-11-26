import { cookies } from "next/headers";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referrals/code-format";

/**
 * The referral code this visitor arrived with, if any.
 *
 * The cookie is set by the proxy when a link carries `?ref=`. It is HttpOnly,
 * so only server code can read it — which is why route handlers and server
 * pages call this instead of the browser sending the code along.
 *
 * Returns a well-formed code or `null`. Well-formed is not the same as real:
 * the attribution functions check it against the database when it is used.
 */
export async function readReferralCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    return normalizeReferralCode(jar.get(REFERRAL_COOKIE)?.value);
  } catch {
    // Not in a request (a script, a background job): there is no visitor.
    return null;
  }
}
