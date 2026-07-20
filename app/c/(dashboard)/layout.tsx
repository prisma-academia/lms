import { redirect } from "next/navigation";
import { resolveThemeForRequest } from "@/lib/theme/resolve";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { StudentShell } from "@/components/student-shell";

export default async function ClientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await resolveThemeForRequest();
  const actor = await requireClientPage();

  const [client, tenant] = await Promise.all([
    prisma.client.findUnique({ where: { id: actor.clientId } }),
    prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true, settingsJson: true },
    }),
  ]);
  if (!client || !tenant) redirect("/auth/login");

  const settings = parseTenantSettings(tenant.settingsJson);
  const profile = (client.profileJson as Record<string, unknown>) ?? {};
  const first = typeof profile.name === "string" ? profile.name.trim() : "";
  const label =
    first ||
    `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
    client.email;

  return (
    <StudentShell
      title={tenant.name}
      userLabel={label}
      themeMode={theme.mode}
    >
      {children}
    </StudentShell>
  );
}
