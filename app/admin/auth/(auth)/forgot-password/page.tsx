import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AuthCard } from "@/components/auth-card";

export default function AdminForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      subtitle="We'll email you a link to reset your admin password."
      footer={
        <Link
          href="/auth/login"
          className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
        >
          Learner sign in
        </Link>
      }
    >
      <ForgotPasswordForm
        surface="tenant_admin"
        backHref="/admin/auth/login"
        backLabel="Back to admin sign in"
      />
    </AuthCard>
  );
}
