import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { AssignmentsClient } from "./assignments-client";

export default async function AssignmentsPage() {
  await requireClientPage();
  return (
    <div>
      <PageHeader title="Assignments" subtitle="Your work across every course" />
      <AssignmentsClient />
    </div>
  );
}
