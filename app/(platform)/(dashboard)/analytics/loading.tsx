import { CardSkeleton, PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <PageSkeleton label="Loading analytics…">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} lines={1} />
        ))}
      </div>
      <RowsSkeleton rows={5} />
    </PageSkeleton>
  );
}
