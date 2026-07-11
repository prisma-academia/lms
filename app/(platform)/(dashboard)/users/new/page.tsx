import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { InviteUserForm } from "./invite-form";

export default async function NewPlatformUserPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_USERS_WRITE.key);
  const roles = await prisma.roleTemplate.findMany({
    where: { scope: "PLATFORM" },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return (
    <div>
      <PageHeader title="Invite platform user" />
      <Card>
        <InviteUserForm roles={roles} />
      </Card>
    </div>
  );
}
