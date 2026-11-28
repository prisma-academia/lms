import Link from "next/link";
import { AdminLoginForm } from "./form";
import { AuthCard } from "@/components/auth-card";
import { SsoButtons } from "@/components/sso-buttons";

export default function AdminLoginPage() {
  return (
    <AuthCard
      title="Admin portal"
      subtitle="Staff and instructor access."
      footer={
        <Link
          href="/admin/auth/forgot-password"
          className="font-bold underline decoration-primary decoration-2 underline-offset-2 hover:text-foreground"
        >
          Forgot password?
        </Link>
      }
    >
      <AdminLoginForm />
      <SsoButtons audience="staff" />
    </AuthCard>
  );
}
