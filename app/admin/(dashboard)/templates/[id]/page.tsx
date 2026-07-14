import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { TemplateForm } from "../template-form";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_TEMPLATES_READ.key);
  const { id } = await params;
  const template = await prisma.template.findFirst({ where: { id, tenantId: actor.tenantId } });
  if (!template) notFound();

  return (
    <div>
      <PageHeader title={template.name} subtitle={`Type: ${template.type}`} backHref="/admin/templates" backLabel="Templates" />
      <Card>
        <TemplateForm
          mode="edit"
          id={template.id}
          initial={{
            type: template.type,
            name: template.name,
            contentJson: JSON.stringify(template.contentJson, null, 2),
          }}
          canWrite={hasPermission(actor, PERMISSIONS.TENANT_TEMPLATES_WRITE.key)}
        />
      </Card>
    </div>
  );
}
