/**
 * Where an SSO sign-in that did not work lands, and what it says. Client-safe
 * (the login pages' button component reads the messages).
 */

export function ssoLoginPath(audience: "learner" | "staff", reason: string): string {
  const r = encodeURIComponent(reason);
  // `builtin=1`: the standard sign-in screen, where the SSO buttons and the
  // message are, even when the academy has designed its own login page.
  return audience === "staff" ? `/admin/auth/login?sso=${r}` : `/auth/login?builtin=1&sso=${r}`;
}

export const SSO_MESSAGES: Record<string, string> = {
  denied: "Sign-in was cancelled at the identity provider.",
  expired: "That sign-in took too long or was started in another browser. Please try again.",
  unavailable: "That sign-in option is not available.",
  provider_unreachable: "We could not reach the identity provider. Please try again in a moment.",
  no_account: "There is no account for that address here. Ask the academy to invite you, or sign in another way.",
  suspended: "This account is suspended. Contact the academy.",
  domain_not_allowed: "That account's email domain is not allowed to sign in here.",
  email_unverified: "Your identity provider has not verified that email address.",
  no_email: "Your identity provider did not share an email address.",
  error: "Something went wrong signing you in. Please try again.",
};

export function ssoMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return SSO_MESSAGES[reason] ?? SSO_MESSAGES.error;
}
