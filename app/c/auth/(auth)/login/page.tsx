import Link from "next/link";
import { ClientLoginForm } from "./form";
import { AuthCard } from "@/components/auth-card";

export default function ClientLoginPage() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Use your email and password for this workspace."
      footer={
        <>
          Workspace administrator?{" "}
          <Link
            href="/admin/auth/login"
            className="font-bold underline decoration-pink decoration-2 underline-offset-2 hover:text-ink"
          >
            Sign in here
          </Link>
        </>
      }
    >
      <ClientLoginForm />
    </AuthCard>
  );
}
