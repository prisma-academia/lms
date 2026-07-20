import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthCard } from "@/components/auth-card";

export default async function AdminResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard title="Missing reset token">
        <p className="text-sm font-medium text-muted-foreground">
          This reset link is incomplete.
        </p>
        <Link
          href="/admin/auth/forgot-password"
          className="mt-4 inline-block font-bold underline decoration-primary decoration-2 underline-offset-2"
        >
          Request a new link
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Set a new password">
      <ResetPasswordForm
        token={token}
        backHref="/admin/auth/login"
        backLabel="Back to admin sign in"
      />
    </AuthCard>
  );
}
