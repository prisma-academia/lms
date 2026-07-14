import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PageHeader, Card } from "@/components/shell";
import { PlanForm } from "../plan-form";

const GB = 1024 ** 3;

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage(PERMISSIONS.PLATFORM_PLANS_READ.key);
  const { id } = await params;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) notFound();
  const currencyOptions = getCurrencyOptions();

  return (
    <div>
      <PageHeader title={plan.name} subtitle={`Plan code: ${plan.code}`} backHref="/plans" backLabel="Plans" />
      <Card>
        <PlanForm
          mode="edit"
          id={plan.id}
          currencyOptions={currencyOptions}
          initial={{
            code: plan.code,
            name: plan.name,
            priceMonthly: String(plan.priceMonthlyCents / 100),
            currency: plan.currency,
            storageGb: String(Number(plan.storageQuotaBytes) / GB),
            maxLearners: plan.maxLearners != null ? String(plan.maxLearners) : "",
            maxInstructors: plan.maxInstructors != null ? String(plan.maxInstructors) : "",
            maxCourses: plan.maxCourses != null ? String(plan.maxCourses) : "",
            isPublic: plan.isPublic,
            sortOrder: String(plan.sortOrder),
          }}
        />
      </Card>
    </div>
  );
}
