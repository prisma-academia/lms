import { NextResponse } from "next/server";
import { tenantHttpOrigin } from "@/lib/url/tenant";
import { readGoogleState } from "@/lib/integrations/google-flow";

/**
 * GET — Google's redirect URI for every academy, on the platform's apex host
 * (Google needs redirect URIs listed in advance; academies are subdomains).
 *
 * It only checks the signed state and forwards code + state to the academy's
 * own host, where the staff session and the flow cookie live. The code is
 * useless without the PKCE verifier, which never leaves the server.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state");
  const state = readGoogleState(rawState);
  if (!state || !rawState) {
    return new NextResponse("This Google sign-in link has expired or is not valid. Start again from Integrations in your academy's admin.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const next = new URL(`${tenantHttpOrigin(state.s)}/api/integrations/google/finish`);
  next.searchParams.set("state", rawState);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (code) next.searchParams.set("code", code);
  else next.searchParams.set("error", error ?? "no_code");
  return NextResponse.redirect(next.toString(), 303);
}
