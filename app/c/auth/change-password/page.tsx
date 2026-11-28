import { ChangePasswordForm } from "@/components/change-password-form";
import { AuthCard } from "@/components/auth-card";

export default function ClientChangePasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Enter the password you have now, then choose a new one that only you know."
    >
      <ChangePasswordForm surface="tenant_client" dialogErrors />
    </AuthCard>
  );
}
