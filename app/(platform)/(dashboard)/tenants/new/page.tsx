import { PageHeader, Card } from "@/components/shell";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateTenantForm } from "../create-form";

export default async function NewTenantPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_TENANTS_WRITE.key);
  return (
    <div>
      <PageHeader
        title="New academy"
        subtitle="Set up the organisation and invite the person who will own it."
        backHref="/tenants"
        backLabel="Academies"
      />
      <Card>
        <CreateTenantForm />
      </Card>
    </div>
  );
}
