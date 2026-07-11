import { AdminChangePasswordForm } from "./form";
import { AuthCard } from "@/components/auth-card";

export default function AdminChangePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      subtitle="12+ characters, with upper, lower, digit, and symbol."
    >
      <AdminChangePasswordForm />
    </AuthCard>
  );
}
