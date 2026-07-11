import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthCard } from "@/components/auth-card";

export default async function PlatformResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="Missing reset token">
        <p className="text-sm font-medium text-ink/60">
          Request a new link from the forgot password page.
        </p>
        <Link
          href="/auth/forgot-password"
          className="mt-4 inline-block font-bold underline decoration-pink decoration-2 underline-offset-2"
        >
          Forgot password
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set a new password">
      <ResetPasswordForm
        token={token}
        backHref="/auth/login"
        backLabel="Back to sign in"
      />
    </AuthCard>
  );
}
