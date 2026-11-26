import { ClientLoginForm } from "./form";
import { AuthCard } from "@/components/auth-card";
import { SESSION_ENDED, safeNextPath } from "@/lib/auth/next-path";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";

type Props = {
  searchParams: Promise<{
    next?: string | string[];
    builtin?: string | string[];
    session?: string | string[];
  }>;
};

export default async function ClientLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = params.next;
  // Checked here as well as by the API: the form only ever carries a
  // destination that has already been reduced to a path on this site.
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  const sessionEnded = (Array.isArray(params.session) ? params.session[0] : params.session) === SESSION_ENDED;

  // The academy's own sign-in page, if it has published one that works.
  // `?builtin=1` always shows the standard screen: the way back in if a
  // designed page ever goes wrong.
  if ((Array.isArray(params.builtin) ? params.builtin[0] : params.builtin) !== "1") {
    const tenant = await requireExistingTenant();
    const designed = await renderDesignedPage({ tenantId: tenant.tenant!.id, kind: "LOGIN", next });
    if (designed) return designed.element;
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle={
        sessionEnded
          ? next
            ? "You were signed out. Sign in again and we'll take you straight back to where you were."
            : "You were signed out. Sign in again to carry on learning."
          : next
            ? "Sign in and we'll take you straight back to where you were."
            : "Welcome back. Enter your email and password to carry on learning."
      }
    >
      <ClientLoginForm next={next} />
    </AuthCard>
  );
}
