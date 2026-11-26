import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DataTableToolbar } from "@/components/data-table-toolbar";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_FORMAT } from "../format";
import { UsersTable } from "./table";

export default async function PlatformUsersPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_USERS_READ.key);
  const users = await prisma.platformUser.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      isSuperAdmin: true,
      lastLoginAt: true,
    },
  });
  const rows = users.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginLabel: formatDateTime(u.lastLoginAt, PLATFORM_FORMAT, "Never"),
  }));
  return (
    <div>
      <DataTableToolbar
        title="Platform users"
        description="People who run the platform itself. Times are in UTC."
        createHref="/users/new"
        createLabel="Invite user"
      />
      <UsersTable data={rows} />
    </div>
  );
}
