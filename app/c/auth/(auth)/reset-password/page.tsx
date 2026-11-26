import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

export default async function ClientResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <AuthCard
        title="This reset link is incomplete"
        subtitle="Part of the link is missing. This usually happens when it is copied by hand or split across two lines in an email."
      >
        <p className="text-sm font-medium text-muted-foreground">
          Open the link from your email again, or ask for a new one.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/auth/forgot-password">Send me a new link</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password" subtitle="You'll use it the next time you sign in.">
      <ResetPasswordForm
        token={token}
        backHref="/auth/login"
        backLabel="Back to sign in"
        dialogErrors
      />
    </AuthCard>
  );
}
