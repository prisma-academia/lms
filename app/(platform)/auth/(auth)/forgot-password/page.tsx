import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { apexHttpOrigin } from "@/lib/url/apex";
import { AuthCard } from "@/components/auth-card";

export default function PlatformForgotPasswordPage() {
  const registerUrl = `${apexHttpOrigin()}/register`;

  return (
    <AuthCard
      title="Forgot password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <a
          href={registerUrl}
          className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
        >
          Register a workspace
        </a>
      }
    >
      <ForgotPasswordForm
        surface="platform"
        backHref="/auth/login"
        backLabel="Back to sign in"
      />
    </AuthCard>
  );
}
