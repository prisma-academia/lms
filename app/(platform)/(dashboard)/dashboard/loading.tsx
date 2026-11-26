import { CardSkeleton, PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <PageSkeleton label="Loading the overview…">
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
      </div>
      <RowsSkeleton rows={5} />
    </PageSkeleton>
  );
}
