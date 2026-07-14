import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AuthCard } from "@/components/auth-card";

export default function ClientForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      subtitle="We'll email you a link to reset your password."
      footer={
        <Link
          href="/auth/register"
          className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
        >
          Create an account
        </Link>
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
