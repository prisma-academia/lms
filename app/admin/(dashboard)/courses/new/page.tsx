import { PageHeader, Card } from "@/components/shell";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrencyOptions } from "@/lib/geo/currencies";
import { NewCourseForm } from "./new-course-form";

export default async function NewCoursePage() {
  await requireTenantPage(PERMISSIONS.TENANT_COURSES_WRITE.key);
  const currencyOptions = getCurrencyOptions();
  return (
    <div>
      <PageHeader title="New course" backHref="/admin/courses" backLabel="Courses" />
      <Card>
        <NewCourseForm currencyOptions={currencyOptions} />
      </Card>
    </div>
  );
}
