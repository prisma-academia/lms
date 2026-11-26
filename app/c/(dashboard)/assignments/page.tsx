import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { tenantFormatContext } from "../_lib/format-context";
import { AssignmentsClient } from "./assignments-client";

export default async function AssignmentsPage() {
  const actor = await requireClientPage();
  // Deadlines are shown in the academy's own locale and time zone. The list is
  // fetched in the browser, so the formatting rules go down with the page.
  const format = await tenantFormatContext(actor.tenantId);
  return (
    <div>
      <PageHeader title="Assignments" subtitle="Work to hand in across your courses" />
      <AssignmentsClient format={format} />
    </div>
  );
}
