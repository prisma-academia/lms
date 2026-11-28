import { SetPasswordScreen } from "@/components/auth/set-password-screen";

export const metadata = { title: "Set your password", robots: { index: false, follow: false } };

/**
 * Where the button in an invitation or reset email lands. Outside the `(auth)`
 * group on purpose: that group sends anyone already signed in to their
 * dashboard, and a person opening their own invitation in a browser where
 * somebody else is signed in must still reach this page.
 */
export default async function StaffSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <SetPasswordScreen token={Array.isArray(token) ? token[0] : token} surface="tenant_admin" />;
}
