import { PageSkeleton, RowsSkeleton, CardSkeleton } from "@/components/ui/skeleton";

export default function CoursePaymentsLoading() {
  return (
    <PageSkeleton label="Loading payments…">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
        <CardSkeleton lines={1} />
      </div>
      <RowsSkeleton />
    </PageSkeleton>
  );
}
