import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { CreateProgrammeForm } from "./create-form";

export default async function NewProgrammePage() {
  await requireTenantPage(PERMISSIONS.TENANT_PROGRAMMES_WRITE.key);
  return (
    <div>
      <PageHeader title="New programme" subtitle="You can add courses after creating the programme." />
      <Card>
        <CreateProgrammeForm />
      </Card>
    </div>
  );
}
