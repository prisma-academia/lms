import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PageHeader, Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { ALL_PLATFORM_PERMISSION_KEYS, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_FORMAT } from "../../format";
import { UserDetailActions } from "./actions";

export default async function PlatformUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformPage(PERMISSIONS.PLATFORM_USERS_READ.key);
  const { id } = await params;
  const [user, roles] = await Promise.all([
    prisma.platformUser.findUnique({ where: { id } }),
    prisma.roleTemplate.findMany({
      where: { scope: "PLATFORM" },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  if (!user) notFound();

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Email", value: <span className="break-all">{user.email}</span> },
    { label: "First name", value: user.firstName ?? "—" },
    { label: "Last name", value: user.lastName ?? "—" },
    { label: "Other name", value: user.otherName ?? "—" },
    { label: "Phone", value: user.phone ?? "—" },
    {
      label: "Status",
      value: user.status === "ACTIVE" ? "Active" : <Badge color="var(--warning)">Suspended</Badge>,
    },
    {
      label: "Access",
      value: user.isSuperAdmin ? <Badge>Super admin</Badge> : "By permission",
    },
    {
      label: "Last signed in",
      value: `${formatDateTime(user.lastLoginAt, PLATFORM_FORMAT, "Never")}${user.lastLoginAt ? " UTC" : ""}`,
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
        subtitle="Platform user"
        backHref="/users"
        backLabel="Platform users"
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <h2 className="font-heading text-lg leading-tight">Profile</h2>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                <dt className="font-medium text-muted-foreground">{fact.label}</dt>
                <dd className="min-w-0 font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="font-heading text-lg leading-tight">Permissions and actions</h2>
          {user.isSuperAdmin ? (
            <p className="mt-2 text-[13px] font-medium text-muted-foreground">
              A super admin can do everything, whatever is ticked below.
            </p>
          ) : null}
          <UserDetailActions
            userId={user.id}
            scope="platform"
            permissions={user.permissions}
            allPermissions={ALL_PLATFORM_PERMISSION_KEYS}
            roles={roles}
            applyRoleEndpoint={`/api/platform/users/${user.id}/apply-role`}
            permissionsEndpoint={`/api/platform/users/${user.id}/permissions`}
            resetPasswordEndpoint={`/api/platform/users/${user.id}/reset-password`}
          />
        </Card>
      </div>
    </div>
  );
}
