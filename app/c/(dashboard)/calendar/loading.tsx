import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <PageSkeleton label="Loading your calendar…">
      <div className="rounded-[14px] border-2 border-border bg-card p-3 sm:p-4" aria-hidden>
        <div className="mb-4 flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-11 w-24" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="min-h-12 sm:min-h-20" />
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
