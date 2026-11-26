import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped like the lesson player (course line, lesson list, lesson) and marked
 * `data-wide-page` like the player itself, so the layout does not change width
 * when the real thing arrives.
 */
export default function LearnLoading() {
  return (
    <div data-wide-page role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your lesson…</span>
      <div aria-hidden>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-2 h-6 w-72 max-w-full" />
        <Skeleton className="mt-3 h-3 w-56 max-w-full rounded-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-[12px] lg:hidden" />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]" aria-hidden>
        <div className="hidden overflow-hidden rounded-[12px] border-2 border-border bg-card lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b-2 border-dashed border-border px-3 py-3 last:border-b-0"
            >
              <Skeleton className="size-7 shrink-0" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] border-2 border-border bg-card p-4 sm:p-6 lg:p-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2 h-8 w-2/3" />
          <div className="mt-6 flex max-w-[44rem] flex-col gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className={i % 4 === 3 ? "h-4 w-2/3" : "h-4 w-full"} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
