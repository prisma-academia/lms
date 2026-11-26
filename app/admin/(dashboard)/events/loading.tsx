import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

/** The calendar: a month grid, not a list. */
export default function Loading() {
  return (
    <PageSkeleton label="Loading the calendar…" action>
      <div className="rounded-[14px] border-2 border-border bg-card p-4" aria-hidden>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-14 sm:h-20" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
