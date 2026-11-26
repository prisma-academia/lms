import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";

/** Shaped like the profile: the header card with the photo, then its sections. */
export default function ProfileLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading your profile…</span>
      <div className="flex items-center gap-4 rounded-[14px] border-2 border-border bg-card p-5" aria-hidden>
        <Skeleton className="size-20 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          <Skeleton className="mt-3 h-3 w-full max-w-sm rounded-full" />
        </div>
      </div>
      <CardSkeleton lines={4} />
      <CardSkeleton lines={3} />
      <CardSkeleton lines={3} />
    </div>
  );
}
