import { PageHeader, Card } from "@/components/shell";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { PlanForm } from "../plan-form";

export default async function NewPlanPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_PLANS_WRITE.key);
  const currencyOptions = getCurrencyOptions();
  return (
    <div>
      <PageHeader title="New plan" />
      <Card>
        <PlanForm
          mode="create"
          currencyOptions={currencyOptions}
          initial={{
            code: "",
            name: "",
            priceMonthly: "",
            currency: "NGN",
            storageGb: "10",
            maxLearners: "",
            maxInstructors: "",
            maxCourses: "",
            isPublic: true,
            sortOrder: "0",
          }}
        />
      </Card>
    </div>
  );
}
