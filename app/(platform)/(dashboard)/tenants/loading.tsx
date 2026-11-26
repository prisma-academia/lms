import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function AcademiesLoading() {
  return (
    <PageSkeleton label="Loading academies…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}
