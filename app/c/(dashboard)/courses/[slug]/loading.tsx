import { CardSkeleton, RowsSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shaped like a course page: the summary card, then the list of lessons. */
export default function CourseLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="max-w-3xl">
      <span className="sr-only">Loading this course…</span>
      <Skeleton className="mb-4 h-4 w-24" />
      <CardSkeleton lines={4} />
      <Skeleton className="mb-3 mt-6 h-5 w-28" />
      <RowsSkeleton rows={5} />
    </div>
  );
}
