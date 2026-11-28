import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function ExamsLoading() {
  return (
    <PageSkeleton label="Loading exams…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}
