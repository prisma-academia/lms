import { ClientLoginForm } from "./form";
import { AuthCard } from "@/components/auth-card";

export default function ClientLoginPage() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Use your email and password for this workspace."
    >
      <ClientLoginForm />
    </AuthCard>
  );
}
