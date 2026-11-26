import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <PageSkeleton label="Loading activity…">
      <RowsSkeleton />
    </PageSkeleton>
  );
}
