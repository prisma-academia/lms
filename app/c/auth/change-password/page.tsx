import { ChangePasswordForm } from "@/components/change-password-form";
import { AuthCard } from "@/components/auth-card";

export default function ClientChangePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      subtitle="12+ characters, with upper, lower, digit, and symbol."
    >
      <ChangePasswordForm dialogErrors />
    </AuthCard>
  );
}
