import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function PlansLoading() {
  return (
    <PageSkeleton label="Loading plans…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}
