import { CardSkeleton, PageHeaderSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading the overview…</span>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} lines={1} />
        ))}
      </div>
      <RowsSkeleton rows={5} className="mt-8" />
    </div>
  );
}
