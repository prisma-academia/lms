import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function PlatformActivityLoading() {
  return (
    <PageSkeleton label="Loading activity…">
      <RowsSkeleton />
    </PageSkeleton>
  );
}
