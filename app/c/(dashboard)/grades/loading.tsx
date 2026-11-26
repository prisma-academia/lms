import { CardSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function GradesLoading() {
  return (
    <PageSkeleton label="Loading your grades…">
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]" aria-hidden>
        <div className="flex flex-col items-center gap-4 rounded-[14px] border-2 border-border bg-card p-6">
          <Skeleton className="h-24 w-40 rounded-[14px]" />
          <Skeleton className="h-3 w-44 max-w-full" />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    </PageSkeleton>
  );
}
