import Link from "next/link";
import { ClientRegisterForm } from "./client-register-form";
import { AuthCard } from "@/components/auth-card";

export default function ClientRegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      subtitle="Enter your details and password, then confirm your email with a one-time code."
      footer={
        <Link
          href="/admin/auth/login"
          className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
        >
          Tenant admin sign-in
        </Link>
      }
    >
      <ClientRegisterForm />
    </AuthCard>
  );
}
