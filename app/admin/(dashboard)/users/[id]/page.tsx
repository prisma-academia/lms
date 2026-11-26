import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PageHeader, Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { ALL_TENANT_PERMISSION_KEYS, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { UserDetailActions } from "@/app/(platform)/(dashboard)/users/[id]/actions";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function TenantUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireTenantPage(PERMISSIONS.TENANT_USERS_READ.key);
  const user = await prisma.tenantUser.findUnique({ where: { id } });
  if (!user || user.tenantId !== actor.tenantId) notFound();
  const [roles, when] = await Promise.all([
    prisma.roleTemplate.findMany({
      where: { scope: "TENANT", tenantId: actor.tenantId },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const statusLabel = user.status.charAt(0) + user.status.slice(1).toLowerCase().replace(/_/g, " ");

  const profile: { label: string; value: string }[] = [
    { label: "Email", value: user.email },
    { label: "First name", value: user.firstName ?? "—" },
    { label: "Last name", value: user.lastName ?? "—" },
    { label: "Other name", value: user.otherName ?? "—" },
    { label: "Phone", value: user.phone ?? "—" },
    { label: "Last signed in", value: formatDateTime(user.lastLoginAt, when, "Never") },
  ];

  return (
    <div>
      <PageHeader title={fullName || user.email} backHref="/admin/users" backLabel="Users" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg leading-tight">Profile</h2>
            <Badge color={user.status === "ACTIVE" ? "var(--success)" : undefined}>{statusLabel}</Badge>
            {user.isOwner ? <Badge color="var(--primary)">Owner</Badge> : null}
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            {profile.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
                <dd className="break-words font-medium text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="font-heading text-lg leading-tight">Permissions and actions</h2>
          <UserDetailActions
            userId={user.id}
            scope="tenant"
            permissions={user.permissions}
            allPermissions={ALL_TENANT_PERMISSION_KEYS}
            roles={roles}
            applyRoleEndpoint={`/api/tenant/users/${user.id}/apply-role`}
            permissionsEndpoint={`/api/tenant/users/${user.id}/permissions`}
            resetPasswordEndpoint={`/api/tenant/users/${user.id}/reset-password`}
          />
        </Card>
      </div>
    </div>
  );
}
