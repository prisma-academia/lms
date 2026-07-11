import { ChangePasswordForm } from "./form";
import { AuthCard } from "@/components/auth-card";

export default function ChangePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      subtitle="12+ characters, with upper, lower, digit, and symbol."
    >
      <ChangePasswordForm />
    </AuthCard>
  );
}
