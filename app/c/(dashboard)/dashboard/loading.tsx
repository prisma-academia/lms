import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shaped like the dashboard: greeting, four figures, then two columns of cards. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading your dashboard…</span>
      <div aria-hidden>
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-48 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-[14px] border-2 border-border bg-card p-4">
            <Skeleton className="size-9 rounded-[10px]" />
            <Skeleton className="mt-3 h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-24 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
