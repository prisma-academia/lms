import { ClientRegisterForm } from "./client-register-form";
import { AuthCard } from "@/components/auth-card";

export default function ClientRegisterPage() {
  return (
    <AuthCard
      wide
      title="Create an account"
      subtitle="Enter your details and password, then confirm your email with a one-time code."
    >
      <ClientRegisterForm />
    </AuthCard>
  );
}
