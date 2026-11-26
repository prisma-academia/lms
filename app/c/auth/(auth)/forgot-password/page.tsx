import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AuthCard } from "@/components/auth-card";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { renderDesignedPage } from "@/lib/site/render-page";

export default async function ClientForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ builtin?: string | string[] }>;
}) {
  const builtin = (await searchParams).builtin;
  // The academy's own forgot-password page, if it has published one that works
  // (Site → pages). `?builtin=1` always shows the standard screen below.
  if ((Array.isArray(builtin) ? builtin[0] : builtin) !== "1") {
    const tenant = await requireExistingTenant();
    const designed = await renderDesignedPage({ tenantId: tenant.tenant!.id, kind: "FORGOT_PASSWORD" });
    if (designed) return designed.element;
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={
        <>
          New here?{" "}
          <Link
            href="/auth/register"
            className="inline-flex min-h-9 items-center rounded-[6px] font-bold underline decoration-primary decoration-2 underline-offset-2 outline-none hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Create an account
          </Link>
        </>
      }
    >
      <ForgotPasswordForm
        surface="tenant_client"
        backHref="/auth/login"
        backLabel="Back to sign in"
        dialogErrors
      />
    </AuthCard>
  );
}
