import { AdminChangePasswordForm } from "./form";
import { AuthCard } from "@/components/auth-card";

export default function AdminChangePasswordPage() {
  return (
    <AuthCard
      title="Set a new password"
      subtitle="Enter the password you have now, then choose a new one that only you know."
    >
      <AdminChangePasswordForm surface="tenant_admin" />
    </AuthCard>
  );
}
