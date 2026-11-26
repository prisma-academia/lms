import { ClientRegisterForm } from "./client-register-form";
import { AuthCard } from "@/components/auth-card";
import { safeNextPath } from "@/lib/auth/next-path";
import { REFERRAL_PARAM, normalizeReferralCode } from "@/lib/referrals/code-format";
import { readReferralCookie } from "@/lib/referrals/cookie";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";

type Props = {
  searchParams: Promise<{ next?: string | string[]; ref?: string | string[]; builtin?: string | string[] }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientRegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));

  // The referral cookie is HttpOnly, so the form cannot read it — the server
  // reads it here and hands the code to the form as a starting value. A `?ref=`
  // on this very request wins: the proxy is setting the cookie on the response
  // to it, so the cookie this render can see is still the previous one.
  const referralCode =
    normalizeReferralCode(first(params[REFERRAL_PARAM])) ?? (await readReferralCookie());

  // The academy's own register page, if it has published one that works.
  // `?builtin=1` always shows the standard screen.
  if (first(params.builtin) !== "1") {
    const tenant = await requireExistingTenant();
    const designed = await renderDesignedPage({
      tenantId: tenant.tenant!.id,
      kind: "REGISTER",
      next,
      referralCode,
    });
    if (designed) return designed.element;
  }

  return (
    <AuthCard
      wide
      title="Create an account"
      subtitle={
        next
          ? "Enter your details, confirm your email with a one-time code, and we'll take you back to where you were."
          : "Enter your details and password, then confirm your email with a one-time code."
      }
    >
      <ClientRegisterForm next={next} defaultReferralCode={referralCode} />
    </AuthCard>
  );
}
