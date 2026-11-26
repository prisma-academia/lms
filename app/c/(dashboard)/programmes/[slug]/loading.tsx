import { CardSkeleton, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shaped like a programme page: the summary card, then its courses. */
export default function ProgrammeLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="max-w-3xl">
      <span className="sr-only">Loading this programme…</span>
      <Skeleton className="mb-4 h-4 w-28" />
      <CardSkeleton lines={4} />
      <Skeleton className="mb-3 mt-6 h-5 w-52 max-w-full" />
      <RowsSkeleton rows={4} />
    </div>
  );
}
