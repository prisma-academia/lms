import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function FeesLoading() {
  return (
    <PageSkeleton label="Loading fees…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}
